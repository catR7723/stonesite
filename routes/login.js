const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose'); 



// Struttura dei dati utente su MongoDB
const UtenteSchema = new mongoose.Schema({
    _id: String, // Username (es. 'anto')
    hash: String,
    email: String
});
const Utente = mongoose.model('Utente', UtenteSchema, 'utenti');


// --- MIDDLEWARE DI PROTEZIONE ROTTE ---
const richiediCineforum = (req, res, next) => {
    if (req.session && req.session.authenticated && (req.session.user === 'anto' || req.session.user === 'dave_cinema')) {
        return next(); 
    }
    res.send('<script>alert("Accesso negato!"); window.location.href = "/login";</script>');
};

const richiediCucina = (req, res, next) => {
    if (req.session && req.session.authenticated && (req.session.user === 'stefi' || req.session.user === 'dave_cucina')) {
        return next(); 
    }
    res.send('<script>alert("Accesso negato!"); window.location.href = "/login";</script>');
};


// --- ROTTE DI VISUALIZZAZIONE PAGINE (HTML CORRETTE) ---

// Se login.html si trova in public/ o in una sottocartella specifica, modifica questo percorso di conseguenza.
// Se si trova anch'esso nella cartella principale insieme a index.html, usa: path.join(__dirname, '..', 'login.html')
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'login.html'));
});

// Carica dalla cartella principale salendo di un livello rispetto a /routes
router.get('/cineforumInsert', richiediCineforum, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cineforumInsert.html')); 
});

// Carica dalla cartella principale salendo di un livello rispetto a /routes
router.get('/cucinaInsert', richiediCucina, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cucinaInsert.html'));
});


// --- CONFIGURAZIONE EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'catroboticsdev@gmail.com',
        pass: 'ovqgwjjhfhjaioii'
    }
});


// --- 1. LOGIN CON MONGODB ---
router.post('/auth', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const utente = await Utente.findById(username);

        if (utente && await bcrypt.compare(password, utente.hash)) {
            req.session.authenticated = true;
            req.session.user = username; 

            transporter.sendMail({
                from: 'catroboticsdev@gmail.com',
                to: 'catroboticsdev@gmail.com',
                subject: `Nuovo accesso effettuato da: ${username}`,
                text: `L'utente ${username} ha effettuato l'accesso.`
            }).catch(err => console.error(err));

            if (username === 'anto' || username === 'dave_cinema') {
                return res.redirect('/cineforumInsert');
            } else if (username === 'dave_cucina' || username === 'stefi') {
                return res.redirect('/cucinaInsert');
            }
        }

        res.send('<script>alert("Credenziali errate!"); window.location.href = "/login";</script>');
    } catch (err) {
        console.error("Errore Login MongoDB:", err);
        res.status(500).send('Errore nel server');
    }
});


// --- 2. RECUPERO PASSWORD CON MONGODB ---
router.post('/forgot-password', async (req, res) => {
    const { username, email } = req.body;

    try {
        const utente = await Utente.findById(username);

        if (!utente || utente.email !== email) {
            return res.send('<script>alert("Dati non corrispondenti!"); window.location.href = "/login";</script>');
        }

        const nuovaPassword = Math.random().toString(36).slice(-8);
        const hash = await bcrypt.hash(nuovaPassword, 10);

        utente.hash = hash;
        await utente.save();

        await transporter.sendMail({
            from: 'catroboticsdev@gmail.com',
            to: email,
            subject: 'Recupero Password - Stone Site',
            html: `<h3>Recupero Password</h3><p>La tua nuova password temporanea è: <b>${nuovaPassword}</b></p>`
        });

        res.send('<script>alert("Nuova password inviata via email!"); window.location.href = "/login";</script>');
    } catch (err) {
        res.status(500).send("Errore nel recupero password");
    }
});


// --- 3. CAMBIO PASSWORD CON MONGODB ---
router.post('/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    try {
        const utente = await Utente.findById(username);
        if (!utente) return res.send('<script>alert("Utente non trovato!"); window.location.href = "/login";</script>');

        const match = await bcrypt.compare(oldPassword, utente.hash);
        if (!match) return res.send('<script>alert("Vecchia password errata!"); window.location.href = "/login";</script>');

        utente.hash = await bcrypt.hash(newPassword, 10);
        await utente.save();

        res.send('<script>alert("Password aggiornata con successo!"); window.location.href = "/login";</script>');
    } catch (err) {
        res.status(500).send("Errore nel cambio password");
    }
});


// --- 4. REGISTRAZIONE / AGGIUNTA UTENTE SU MONGODB ---
router.post('/email', async (req, res) => {
    const { email, password, username } = req.body;
    const admitted = ['dave_cinema', 'dave_cucina', 'stefi', 'anto'];

    try {
        if (!admitted.includes(username)) {
            return res.send(`<script>alert("Username non autorizzato!"); window.location.href = "/login";</script>`);
        }

        const utenteEsistente = await Utente.findById(username);
        if (utenteEsistente) return res.send('<script>alert("Errore: Utente già registrato."); window.location.href = "/login";</script>');

        const hash = await bcrypt.hash(password, 10);
        
        const nuovoUtente = new Utente({ _id: username, hash: hash, email: email });
        await nuovoUtente.save();

        await transporter.sendMail({
            from: 'catroboticsdev@gmail.com',
            to: email,
            subject: 'Le tue credenziali',
            html: `<p>Ecco i tuoi dati:<br>Username: <b>${username}</b><br>Password: <b>${password}</b></p>`
        });
        
        res.send('<script>alert("Mail inviata! Ora puoi loggarti."); window.location.href = "/login";</script>');
    } catch (err) {
        console.error("ERRORE REGISTRAZIONE:", err); // 🟩 AGGIUNGI QUESTO per vederlo nei log di Render
        res.status(500).send('Errore durante la registrazione');
    }
});

module.exports = router;
