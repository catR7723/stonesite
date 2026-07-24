require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose'); 
const { default: MongoStore } = require('connect-mongo');

// 1. IMPORTA IL FILE DI CONNESSIONE CACHED
const connectDB = require('./db');

const app = express();
const mongoStringa = process.env.MONGO_URI;

// Middleware di base
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CONFIGURAZIONE SESSIONE PERSISTENTE SU VERCEL
app.use(session({
    secret: process.env.SESSION_SECRET || 'chiave-segreta-molto-sicura',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: mongoStringa, 
        ttl: 14 * 24 * 60 * 60,
        mongoUrlOptions: { useNewUrlParser: true, useUnifiedTopology: true }
    }),
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

// --- CARICAMENTO ROTTE ---
// 🟩 Modificato l'import per estrarre sia il router che la funzione di inizializzazione
const loginModule = require('./routes/login'); 
app.use('/', loginModule.router);

const uploadRoutes = require('./routes/cucinaInsert');
const cineforumRoutes = require('./routes/cineforumInsert');
app.use('/', uploadRoutes);
app.use('/', cineforumRoutes); 

// --- ROTTE PUBBLICHE ---
app.get('/cineforum', (req, res) => {
    res.sendFile(path.join(__dirname, 'cineforum.html'));
});

app.get('/archivio', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'html', 'archivio.html'));
});

app.get('/check-ruolo-cucina', (req, res) => {
    if (req.session && req.session.authenticated && req.session.role === 'cucina') {
        return res.json({ autorizzato: true });
    }
    res.json({ autorizzato: false });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. AVVIO CONTROLLATO ED EVITAMENTO TIMEOUT/BUFFERING
connectDB()
  .then(async () => {
    console.log('Connesso a MongoDB con successo!');
    
    // 🟩 Ora che il database è sicuramente connesso, eseguiamo l'inizializzazione degli utenti
    if (loginModule.initializeAuthorizedUsers) {
        try {
            await loginModule.initializeAuthorizedUsers();
            console.log('✅ Utenti autorizzati inizializzati con successo!');
        } catch (err) {
            console.error('❌ Errore durante l\'inizializzazione controllata degli utenti:', err);
        }
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server in esecuzione sulla porta ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Errore critico durante l\'avvio del database:', err);
    process.exit(1);
  });









