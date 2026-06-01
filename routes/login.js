const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcrypt');
const sgMail = require('@sendgrid/mail');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Configura SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// --- SCHEMA UTENTE ---
const UtenteSchema = new mongoose.Schema({
    _id: String, // Username
    hash: String,
    email: String,
    role: { type: String, enum: ['cineforum', 'cucina'], default: 'cucina' },
    createdAt: { type: Date, default: Date.now }
});
const Utente = mongoose.model('Utente', UtenteSchema, 'utenti');

// Verifica SendGrid all'avvio
console.log('✅ SendGrid configurato');

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

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Errore logout:', err);
        res.redirect('/login');
    });
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
            } else {
                return res.redirect('/cucinaInsert');
            }
        }

        res.status(401).json({ error: 'Credenziali errate' });
    } catch (err) {
        console.error('❌ Errore Login:', err);
        res.status(500).json({ error: 'Errore nel server' });
    }
});

// --- 2. RECUPERO PASSWORD CON MONGODB ---
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

// --- 3. CAMBIO PASSWORD CON MONGODB ---
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

// --- 4. REGISTRAZIONE / AGGIUNTA UTENTE SU MONGODB ---
router.post('/email', async (req, res) => {
    const { email, password, username } = req.body;
    const admittedUsers = {
        'dave_cinema': 'cineforum',
        'anto': 'cineforum',
        'dave_cucina': 'cucina',
        'stefi': 'cucina'
    };

    if (!email || !password || !username) {
        return res.status(400).json({ error: 'Tutti i campi sono richiesti' });
    }

    try {
        // Verifica autorizzazione
        if (!admittedUsers[username]) {
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
            role: admittedUsers[username]
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

module.exports = router;


