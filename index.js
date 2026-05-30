
require('dotenv').config();

console.log(process.env.CLOUDINARY_CLOUD_NAME);
console.log(process.env.CLOUDINARY_API_KEY);
console.log(process.env.CLOUDINARY_API_SECRET ? 'OK' : 'MANCANTE');
const express = require('express');
const path = require('path');
const app = express();
const fs = require('fs').promises;
const uploadRoutes = require('./routes/cucinaInsert');
const cineforumRoutes = require('./routes/cineforumInsert');

const session = require('express-session');

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'chiave-segreta-molto-sicura',
    resave: false,
    saveUninitialized: true
}));

const loginRouter = require('./routes/login');
app.use('/', loginRouter);

// OTTIMIZZATO: Usa path.join per evitare problemi di percorso su Linux (Render)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 4. Rotta per la pagina protetta (CUCINA)
app.get('/cucinaInsert', (req, res) => {
    const utente = req.session.user; 

    if (req.session.authenticated && (utente === 'dave' || utente === 'Stefy')) {
        res.sendFile(path.join(__dirname, 'cucinaInsert.html'));
    } else {
        res.redirect('/login');
    }
});

// Pagina Cineforum: solo anto
app.get('/cineforumInsert', (req, res) => {
    if (req.session.authenticated && req.session.user === 'anto') {
        res.sendFile(path.join(__dirname, 'cineforumInsert.html'));
    } else {
        res.redirect('/login');
    }
});

// Usa le rotte definite nel file esterno
app.use('/', uploadRoutes);
app.use('/', cineforumRoutes); 
// Rotta per mostrare la pagina iniziale index.html

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// MODIFICATO PER RENDER: Ascolta sulla porta dinamica assegnata dal server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server in esecuzione sulla porta ${PORT}`));








