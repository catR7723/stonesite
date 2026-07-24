const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcrypt');
const sgMail = require('@sendgrid/mail');
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Configura SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- SCHEMA UTENTE ---
const UtenteSchema = new mongoose.Schema({
    _id: String, // Username
    hash: String,
    email: String,
    role: { type: String, enum: ['cineforum', 'cucina', 'boss'], default: 'cucina' },
    createdAt: { type: Date, default: Date.now }
});
const Utente = mongoose.model('Utente', UtenteSchema, 'utenti');

// --- SCHEMA UTENTI AUTORIZZATI ---
const UtenteAutorizzatoSchema = new mongoose.Schema({
    _id: String, // Username
    role: { type: String, enum: ['cineforum', 'cucina', 'boss'], required: true },
    createdAt: { type: Date, default: Date.now }
});
const UtenteAutorizzato = mongoose.model('UtenteAutorizzato', UtenteAutorizzatoSchema, 'utenti_autorizzati');

// --- SCHEMA LOGIN TOKEN (per admin via email) ---
const AdminLoginTokenSchema = new mongoose.Schema({
    token: String,
    email: String,
    expiresAt: Date,
    createdAt: { type: Date, default: Date.now, expires: 3600 } // TTL 1 ora
});
const AdminLoginToken = mongoose.model('AdminLoginToken', AdminLoginTokenSchema, 'admin_login_tokens');

// Verifica SendGrid all'avvio
console.log('✅ SendGrid configurato');

// --- INIZIALIZZAZIONE UTENTI AUTORIZZATI ---
const initializeAuthorizedUsers = async () => {
    try {
        const authorizedUsers = [
            { _id: 'dave_cinema', role: 'cineforum' },
            { _id: 'anto', role: 'cineforum' },
            { _id: 'dave_cucina', role: 'cucina' },
            { _id: 'stefi', role: 'cucina' },
            { _id: 'tanos', role: 'boss' },  // 🆕 Admin
            { _id: 'boss', role: 'boss' }
        ];

        for (const user of authorizedUsers) {
            await UtenteAutorizzato.findByIdAndUpdate(
                user._id,
                user,
                { upsert: true }
            );
        }
        console.log('✅ Utenti autorizzati inizializzati');
    } catch (err) {
        console.error('❌ Errore inizializzazione utenti autorizzati:', err);
    }
};

// --- MIDDLEWARE DI PROTEZIONE ROTTE ---
const richiediCineforum = (req, res, next) => {
    if (req.session?.authenticated && req.session.role === 'cineforum') {
        return next();
    }
    return res.redirect('/login');
};

const richiediCucina = (req, res, next) => {
    if (req.session?.authenticated && req.session.role === 'cucina') {
        return next();
    }
    return res.redirect('/login');
};

const richiediBoss = (req, res, next) => {
    if (req.session?.authenticated && req.session.role === 'boss') {
        return next();
    }
    return res.redirect('/login');
};

// 🆕 Middleware: Verifica JWT admin
const authenticateAdmin = (req, res, next) => {
    const token = req.cookies?.adminToken;
    
    if (!token) {
        return res.status(401).redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        res.clearCookie('adminToken');
        return res.status(403).redirect('/login');
    }
};

// --- ROTTE DI VISUALIZZAZIONE PAGINE ---
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'login.html'));
});

router.get('/cineforumInsert', richiediCineforum, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cineforumInsert.html'));
});

router.get('/cucinaInsert', richiediCucina, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cucinaInsert.html'));
});

// 🆕 ROTTA PROTETTA: bossPanel con session OR JWT
router.get('/bossPanel', (req, res) => {
    // Verifica sessione (login standard)
    if (req.session?.authenticated && req.session.role === 'boss') {
        return res.sendFile(path.join(__dirname, '..', 'views', 'html', 'bossPanel.html'));
    }
    
    // Verifica JWT (login admin via email)
    const token = req.cookies?.adminToken;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            return res.sendFile(path.join(__dirname, '..', 'views', 'html', 'bossPanel.html'));
        } catch (err) {
            res.clearCookie('adminToken');
        }
    }
    
    return res.redirect('/login');
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Errore logout:', err);
    });
    res.clearCookie('adminToken');
    res.redirect('/login');
});

// --- 1. LOGIN CON MONGODB ---
router.post('/auth', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username e password richiesti' });
    }

    try {
        const utente = await Utente.findById(username);

        if (utente && await bcrypt.compare(password, utente.hash)) {
            req.session.authenticated = true;
            req.session.user = username;
            req.session.role = utente.role;
            req.session.email = utente.email;

            // 🆕 Se è tanos, genera anche JWT
            if (username === 'tanos' || utente.role === 'boss') {
                const jwtToken = jwt.sign(
                    { email: utente.email, role: 'boss', username: username },
                    process.env.JWT_SECRET,
                    { expiresIn: '24h' }
                );
                
                res.cookie('adminToken', jwtToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 24 * 60 * 60 * 1000
                });
            }

            // Invia email di notifica (non blocca il login)
            sgMail.send({
                to: process.env.EMAIL_USER,
                from: process.env.EMAIL_USER,
                subject: `🔓 Accesso: ${username}`,
                html: `<p><b>${username}</b> ha effettuato l'accesso il ${new Date().toLocaleString('it-IT')}</p>`
            }).catch(err => console.error('❌ Errore invio email login:', err));

            // Redirect in base al ruolo
            if (utente.role === 'cineforum') {
                return res.redirect('/cineforumInsert');
            } else if (utente.role === 'cucina') {
                return res.redirect('/cucinaInsert');
            } else if (utente.role === 'boss') {
                return res.redirect('/bossPanel');
            }
        }

        res.status(401).json({ error: 'Credenziali errate' });
    } catch (err) {
        console.error('❌ Errore Login:', err);
        res.status(500).json({ error: 'Errore nel server' });
    }
});

// --- 2. LOGIN ADMIN VIA EMAIL (PER TANOS) ---
router.post('/admin-login', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: '❌ Email richiesta' });
    }

    try {
        // Verifica che l'email sia di tanos (admin)
        if (email !== process.env.ADMIN_EMAIL) {
            return res.status(401).json({ message: '❌ Email non autorizzata per l\'accesso admin' });
        }

        // Trova utente tanos
        let utente = await Utente.findById('tanos');
        
        // Se non esiste, crealo
        if (!utente) {
            const nuovaPassword = crypto.randomBytes(8).toString('hex').toUpperCase();
            const hash = await bcrypt.hash(nuovaPassword, 10);
            utente = new Utente({
                _id: 'tanos',
                hash: hash,
                email: email,
                role: 'boss'
            });
            await utente.save();
        } else {
            // Se esiste, genera nuova password temporanea
            const nuovaPassword = crypto.randomBytes(8).toString('hex').toUpperCase();
            const hash = await bcrypt.hash(nuovaPassword, 10);
            utente.hash = hash;
            await utente.save();
        }

        // Genera password temporanea sicura
        const nuovaPassword = crypto.randomBytes(8).toString('hex').toUpperCase();
        const hash = await bcrypt.hash(nuovaPassword, 10);
        utente.hash = hash;
        await utente.save();

        // Invia email con username e password temporanea
        await sgMail.send({
            to: email,
            from: process.env.EMAIL_USER,
            subject: '🔐 Accesso Admin - Stone Site',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; border-radius: 8px;">
                    <h2>👑 Accesso Admin</h2>
                    <p>Hai richiesto di accedere al Pannello Boss.</p>
                    <p><b>Le tue credenziali temporanee sono:</b></p>
                    <div style="background: #fff; padding: 15px; border-left: 4px solid #28a745; border-radius: 4px; margin: 15px 0;">
                        <p><b>Username:</b> <code style="background: #f0f0f0; padding: 5px;">tanos</code></p>
                        <p><b>Password:</b> <code style="background: #f0f0f0; padding: 5px; font-weight: bold;">${nuovaPassword}</code></p>
                    </div>
                    <p>⚠️ <b>Ti consigliamo di cambiarla al primo accesso!</b></p>
                    <p style="margin-top: 20px;">
                        <a href="${process.env.APP_URL || 'http://localhost:3000'}/login" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">
                            → Vai al Login
                        </a>
                    </p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">
                        Se non hai effettuato questa richiesta, ignora questo messaggio.
                    </p>
                </div>
            `
        });

        console.log(`✅ Email di accesso admin inviata a ${email}`);
        res.json({ message: '✅ Email inviata! Controlla la tua posta.' });

    } catch (err) {
        console.error('❌ Errore admin-login:', err);
        res.status(500).json({ message: '❌ Errore nella richiesta' });
    }
});

// --- 3. RECUPERO PASSWORD CON MONGODB ---
router.post('/forgot-password', async (req, res) => {
    const { username, email } = req.body;

    try {
        const utente = await Utente.findById(username);

        if (!utente || utente.email !== email) {
            return res.status(404).json({ error: 'Dati non corrispondenti' });
        }

        // Genera password temporanea sicura
        const nuovaPassword = crypto.randomBytes(8).toString('hex').toUpperCase();
        const hash = await bcrypt.hash(nuovaPassword, 10);

        utente.hash = hash;
        await utente.save();

        // Invia email con password temporanea
        await sgMail.send({
            to: email,
            from: process.env.EMAIL_USER,
            subject: '🔑 Recupero Password - Stone Site',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; border-radius: 8px;">
                    <h2>Recupero Password</h2>
                    <p>Abbiamo ricevuto una richiesta di recupero password.</p>
                    <p><b>La tua password temporanea è:</b></p>
                    <p style="background: #fff; padding: 10px; border-left: 4px solid #007bff; font-size: 16px; font-weight: bold;">
                        ${nuovaPassword}
                    </p>
                    <p>⚠️ <b>Ti consigliamo di cambiarla al primo accesso!</b></p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">Se non hai richiesto il recupero, ignora questo messaggio.</p>
                </div>
            `
        });

        res.json({ success: 'Password inviata via email!' });
    } catch (err) {
        console.error('❌ Errore recupero password:', err);
        res.status(500).json({ error: 'Errore nel recupero password' });
    }
});

// --- 4. CAMBIO PASSWORD CON MONGODB ---
router.post('/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    if (!username || !oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Tutti i campi sono richiesti' });
    }

    try {
        const utente = await Utente.findById(username);
        if (!utente) {
            return res.status(404).json({ error: 'Utente non trovato' });
        }

        const match = await bcrypt.compare(oldPassword, utente.hash);
        if (!match) {
            return res.status(401).json({ error: 'Vecchia password errata' });
        }

        utente.hash = await bcrypt.hash(newPassword, 10);
        await utente.save();

        // Notifica cambio password
        await sgMail.send({
            to: utente.email,
            from: process.env.EMAIL_USER,
            subject: '🔐 Password Modificata',
            html: `<p>La tua password è stata modificata con successo il ${new Date().toLocaleString('it-IT')}</p>`
        }).catch(err => console.error('❌ Errore notifica cambio password:', err));

        res.json({ success: 'Password aggiornata con successo!' });
    } catch (err) {
        console.error('❌ Errore cambio password:', err);
        res.status(500).json({ error: 'Errore nel cambio password' });
    }
});

// --- 5. REGISTRAZIONE / AGGIUNTA UTENTE SU MONGODB ---
router.post('/email', async (req, res) => {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
        return res.status(400).json({ error: 'Tutti i campi sono richiesti' });
    }

    try {
        // Verifica autorizzazione dalla collezione utenti_autorizzati
        const utenteAutorizzato = await UtenteAutorizzato.findById(username);
        if (!utenteAutorizzato) {
            return res.status(403).json({ error: 'Username non autorizzato!' });
        }

        // Verifica se utente esiste già
        const utenteEsistente = await Utente.findById(username);
        if (utenteEsistente) {
            return res.status(409).json({ error: 'Utente già registrato' });
        }

        // Hash della password
        const hash = await bcrypt.hash(password, 10);

        // Crea nuovo utente
        const nuovoUtente = new Utente({
            _id: username,
            hash: hash,
            email: email,
            role: utenteAutorizzato.role
        });
        await nuovoUtente.save();

        // Invia email di benvenuto
        await sgMail.send({
            to: email,
            from: process.env.EMAIL_USER,
            subject: '👋 Benvenuto su Stone Site!',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; border-radius: 8px;">
                    <h2>Benvenuto su Stone Site! 🎉</h2>
                    <p>La tua registrazione è stata completata con successo.</p>
                    <h3>I tuoi dati di accesso:</h3>
                    <ul style="background: #fff; padding: 15px; border-left: 4px solid #28a745; border-radius: 4px;">
                        <li><b>Username:</b> ${username}</li>
                        <li><b>Password:</b> ${password}</li>
                    </ul>
                    <p>⚠️ <b>Ti consigliamo di cambiarla dopo il primo accesso!</b></p>
                    <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/login" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">Accedi Ora</a></p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">Se non hai effettuato la registrazione, ignora questo messaggio.</p>
                </div>
            `
        });

        console.log(`✅ Utente ${username} registrato con successo`);
        res.json({ success: 'Registrazione completata! Email di conferma inviata.' });

    } catch (err) {
        console.error('❌ ERRORE REGISTRAZIONE:', err);
        res.status(500).json({ error: 'Errore durante la registrazione' });
    }
});

// --- 6. LISTA UTENTI (PER BOSS) ---
router.get('/api/utenti', richiediBoss, async (req, res) => {
    try {
        const utenti = await Utente.find({ role: { $ne: 'boss' } }, '_id email role createdAt');
        res.json(utenti);
    } catch (err) {
        console.error('❌ Errore lettura utenti:', err);
        res.status(500).json({ error: 'Errore nel recupero utenti' });
    }
});

// --- 7. ELIMINA UTENTE (SOLO BOSS) ---
router.delete('/api/utenti/:username', richiediBoss, async (req, res) => {
    const { username } = req.params;

    if (username === 'boss' || username === 'tanos') {
        return res.status(403).json({ error: 'Non puoi eliminare l\'admin!' });
    }

    try {
        // Elimina dalla collezione utenti
        const utente = await Utente.findByIdAndDelete(username);
        if (!utente) {
            return res.status(404).json({ error: 'Utente non trovato' });
        }

        // Elimina dalla collezione utenti_autorizzati
        await UtenteAutorizzato.findByIdAndDelete(username);

        // Notifica eliminazione
        await sgMail.send({
            to: process.env.EMAIL_USER,
            from: process.env.EMAIL_USER,
            subject: `🗑️ Utente Eliminato: ${username}`,
            html: `<p>L'utente <b>${username}</b> è stato eliminato dal sistema il ${new Date().toLocaleString('it-IT')}</p>`
        }).catch(err => console.error('❌ Errore notifica eliminazione:', err));

        console.log(`✅ Utente ${username} eliminato definitivamente`);
        res.json({ success: `Utente ${username} eliminato definitivamente` });
    } catch (err) {
        console.error('❌ Errore eliminazione utente:', err);
        res.status(500).json({ error: 'Errore nell\'eliminazione utente' });
    }
});

// --- 8. CREA NUOVO UTENTE (SOLO BOSS) ---
router.post('/api/utenti', richiediBoss, async (req, res) => {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password || !role) {
        return res.status(400).json({ error: 'Tutti i campi sono richiesti' });
    }

    if (!['cineforum', 'cucina'].includes(role)) {
        return res.status(400).json({ error: 'Ruolo non valido' });
    }

    try {
        // Verifica se username esiste già nella collezione utenti_autorizzati
        const utenteAutorizzatoEsistente = await UtenteAutorizzato.findById(username);
        if (utenteAutorizzatoEsistente) {
            return res.status(409).json({ error: 'Username già autorizzato' });
        }

        // Verifica se utente esiste nella collezione utenti
        const utenteEsistente = await Utente.findById(username);
        if (utenteEsistente) {
            return res.status(409).json({ error: 'Username già registrato' });
        }

        // Crea nella collezione utenti_autorizzati
        const nuovoUtenteAutorizzato = new UtenteAutorizzato({
            _id: username,
            role: role
        });
        await nuovoUtenteAutorizzato.save();

        // Hash della password
        const hash = await bcrypt.hash(password, 10);

        // Crea nella collezione utenti
        const nuovoUtente = new Utente({
            _id: username,
            hash: hash,
            email: email,
            role: role
        });
        await nuovoUtente.save();

        // Invia email di benvenuto
        await sgMail.send({
            to: email,
            from: process.env.EMAIL_USER,
            subject: '👋 Benvenuto su Stone Site!',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; border-radius: 8px;">
                    <h2>Benvenuto su Stone Site! 🎉</h2>
                    <p>Sei stato aggiunto al sistema da un amministratore.</p>
                    <h3>I tuoi dati di accesso:</h3>
                    <ul style="background: #fff; padding: 15px; border-left: 4px solid #28a745; border-radius: 4px;">
                        <li><b>Username:</b> ${username}</li>
                        <li><b>Password:</b> ${password}</li>
                        <li><b>Ruolo:</b> ${role}</li>
                    </ul>
                    <p>⚠️ <b>Ti consigliamo di cambiarla dopo il primo accesso!</b></p>
                    <p><a href="${process.env.APP_URL || 'http://localhost:3000'}/login" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 4px;">Accedi Ora</a></p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">Se non sei stato aggiunto, ignora questo messaggio.</p>
                </div>
            `
        }).catch(err => console.error('❌ Errore invio email:', err));

        console.log(`✅ Utente ${username} creato da boss`);
        res.json({ success: 'Utente creato con successo!' });
    } catch (err) {
        console.error('❌ Errore creazione utente:', err);
        res.status(500).json({ error: 'Errore nella creazione utente' });
    }
});

module.exports = {
    router: router,
    initializeAuthorizedUsers: initializeAuthorizedUsers
};







