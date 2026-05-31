const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose'); // Importiamo Mongoose

// 1. Connessione automatica a MongoDB (legge la variabile MONGO_URI che hai messo su Render)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connesso a MongoDB con successo!'))
  .catch(err => console.error('Errore connessione MongoDB:', err));

// 2. Struttura dei dati utente su MongoDB
const UtenteSchema = new mongoose.Schema({
    _id: String, // L'username dell'utente (es. 'anto')
    hash: String,
    email: String
});
const Utente = mongoose.model('Utente', UtenteSchema, 'utenti');


// --- MIDDLEWARE DI PROTEZIONE ROTTE (I tuoi originali) ---
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


// --- ROTTE DI VISUALIZZAZIONE PAGINE (HTML) ---
router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'login.html'));
});

router.get('/cineforumInsert', richiediCineforum, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cineforumInsert.html')); 
});

router.get('/cucinaInsert', richiediCucina, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cucinaInsert.html'));
});


// --- CONFIGURAZIONE EMAIL ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'catroboticsdev@gmail.com',
        pass: 'qchl jzfh fdnf npuq'
    }
});


// --- 1. LOGIN CON MONGODB ---
router.post('/auth', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // Cerchiamo l'utente nel database cloud usando l'ID (username)
        const utente = await Utente.findById(username);

        if (utente && await bcrypt.compare(password, utente.hash)) {
            req.session.authenticated = true;
            req.session.user = username; 

            const mailOptions = {
                from: 'catroboticsdev@gmail.com',
                to: 'catroboticsdev@gmail.com',
                subject: `Nuovo accesso effettuato da: ${username}`,
                text: `L'utente ${username} ha effettuato l'accesso.`
            };
            transporter.sendMail(mailOptions).catch(err => console.error(err));

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

        // Aggiorna l'hash nel cloud
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
        
        // Creiamo il documento su MongoDB
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
        res.status(500).send('Errore durante la registrazione');
    }
});

module.exports = router;
