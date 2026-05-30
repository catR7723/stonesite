const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const nodemailer = require('nodemailer');

const DB_PATH = path.join(__dirname, '..', 'data', 'utenti.json');

// --- MIDDLEWARE DI PROTEZIONE ROTTE (Nuovi) ---

// Controlla se chi accede ha i permessi per il Cineforum
const richiediCineforum = (req, res, next) => {
    if (req.session && req.session.authenticated && (req.session.user === 'anto' || req.session.user === 'dave_cinema')) {
        return next(); 
    }
    res.send('<script>alert("Accesso negato! Sezione riservata a chi gestisce il Cineforum."); window.location.href = "/login";</script>');
};

// Controlla se chi accede ha i permessi per la Cucina
const richiediCucina = (req, res, next) => {
    if (req.session && req.session.authenticated && (req.session.user === 'stefi' || req.session.user === 'dave_cucina')) {
        return next(); 
    }
    res.send('<script>alert("Accesso negato! Sezione riservata a chi gestisce la Cucina."); window.location.href = "/login";</script>');
};


// --- ROTTE DI VISUALIZZAZIONE PAGINE (HTML) ---

router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'login.html'));
});

// Pagine di inserimento protette dai controlli di sessione
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
        pass: 'qchl jzfh fdnf npuq' // Assicurati che questa sia una Password per le App di Google
    }
});


// --- 1. GESTIONE LOGIN ---
router.post('/auth', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        const utenti = JSON.parse(data);
        const utente = utenti[username];

        if (utente && await bcrypt.compare(password, utente.hash)) {
            req.session.authenticated = true;
            req.session.user = username; 

            // Invio email di notifica accesso in background (non blocca il redirect)
            const mailOptions = {
                from: 'catroboticsdev@gmail.com',
                to: 'catroboticsdev@gmail.com',
                subject: `Nuovo accesso effettuato da: ${username}`,
                text: `L'utente ${username} ha effettuato l'accesso al sistema in data ${new Date().toLocaleString()}.`
            };
            transporter.sendMail(mailOptions).catch(err => console.error("Errore invio email login:", err));

            if (username === 'anto' || username === 'dave_cinema') {
                return res.redirect('/cineforumInsert');
            } else if (username === 'dave_cucina' || username === 'stefi') {
                return res.redirect('/cucinaInsert');
            }
        }

        res.send('<script>alert("Credenziali errate!"); window.location.href = "/login";</script>');

    } catch (err) {
        console.error("Errore Database:", err);
        res.status(500).send('Errore nel server');
    }
});


// --- 2. RECUPERO PASSWORD ---
router.post('/forgot-password', async (req, res) => {
    const { username, email } = req.body;

    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        const utenti = JSON.parse(data);
        const utente = utenti[username];

        if (!utente || utente.email !== email) {
            return res.send('<script>alert("Dati non corrispondenti!"); window.location.href = "/login";</script>');
        }

        const nuovaPassword = Math.random().toString(36).slice(-8);
        const hash = await bcrypt.hash(nuovaPassword, 10);

        // Aggiorna l'oggetto usando le chiavi corrette (.hash)
        utenti[username].hash = hash;
        await fs.writeFile(DB_PATH, JSON.stringify(utenti, null, 2));

        await transporter.sendMail({
            from: 'catroboticsdev@gmail.com',
            to: email,
            subject: 'Recupero Password - Stone Site',
            html: `<h3>Recupero Password</h3>
                   <p>Ciao <b>${username}</b>, è stata resettata la tua password come richiesto.</p>
                   <p>La tua nuova password temporanea è: <b>${nuovaPassword}</b></p>
                   <p>Ti consigliamo di cambiarla subito dopo l'accesso.</p>`
        });

        res.send('<script>alert("Nuova password inviata via email!"); window.location.href = "/login";</script>');

    } catch (err) {
        console.error("Errore forgot-password:", err);
        res.status(500).send("Errore durante il recupero password");
    }
});


// --- 3. CAMBIO PASSWORD ---
router.post('/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        const utenti = JSON.parse(data);
        const utente = utenti[username];

        if (!utente) {
            return res.send('<script>alert("Utente non trovato!"); window.location.href = "/login";</script>');
        }

        const match = await bcrypt.compare(oldPassword, utente.hash);
        if (!match) {
            return res.send('<script>alert("Vecchia password errata!"); window.location.href = "/login";</script>');
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        utenti[username].hash = newHash;
        await fs.writeFile(DB_PATH, JSON.stringify(utenti, null, 2));

        await transporter.sendMail({
            from: 'catroboticsdev@gmail.com',
            to: utente.email,
            subject: 'Password Aggiornata',
            text: `Ciao ${username}, la tua password è stata cambiata con successo.`
        });

        res.send('<script>alert("Password aggiornata con successo!"); window.location.href = "/login";</script>');

    } catch (err) {
        console.error("Errore change-password:", err);
        res.status(500).send("Errore durante il cambio password");
    }
});


// --- 4. REGISTRAZIONE / INVIO EMAIL CREDENZIALI ---
router.post('/email', async (req, res) => {
    const { email, password, username } = req.body;
    
    const admitted = ['dave_cinema', 'dave_cucina', 'stefi', 'anto'];

    try {
        if (!admitted.includes(username)) {
            return res.send(`<script>alert("Solo gli Username Autorizzati possono entrare!"); window.location.href = "/login";</script>`);
        }

        let utenti = {};
        try {
            const data = await fs.readFile(DB_PATH, 'utf-8');
            if (data.trim()) {
                utenti = JSON.parse(data);
            }
        } catch (e) {
            utenti = {}; 
        }

        if (utenti[username]) {
            return res.send(`
                <script>
                    alert("Errore: L'utente admin è già registrato. Impossibile creare nuovi utenti.");
                    window.location.href = "/login";
                </script>
            `);
        }

        const hash = await bcrypt.hash(password, 10);
        utenti[username] = { hash: hash, email: email };
        await fs.writeFile(DB_PATH, JSON.stringify(utenti, null, 2));
        console.log("File utenti.json aggiornato.");

        await transporter.sendMail({
            from: 'catroboticsdev@gmail.com',
            to: email,
            subject: 'Le tue credenziali',
            html: `<p>Ciao! Ecco i tuoi dati:</p>
                   <ul>
                       <li>Username: <b>${username}</b></li>
                       <li>Password: <b>${password}</b></li>
                   </ul>`
        });
        
        res.send('<script>alert("Mail inviata! Ora puoi loggarti."); window.location.href = "/login";</script>');
    } catch (err) {
        console.error("Errore registrazione/email:", err);
        res.status(500).send('Errore durante l\'invio della mail');
    }
});

module.exports = router;



