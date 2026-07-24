require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose'); 
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { default: MongoStore } = require('connect-mongo');

const connectDB = require('./db');
const app = express();
const mongoStringa = process.env.MONGO_URI;

// Middleware di base (QUESTI VANNO PRIMA)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser()); // 🆕 Per gestire JWT nei cookie

// 2. AVVIO CONTROLLATO
connectDB()
  .then(async () => {
    console.log('✅ Connesso a MongoDB con successo!');

    // 🟩 ADESSO configura la sessione (DOPO che MongoDB è connesso)
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
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 24 
        }
    }));

    // 🆕 MIDDLEWARE: Verifica se admin è autenticato
    const authenticateAdmin = (req, res, next) => {
        const token = req.cookies?.adminToken;
        
        if (!token) {
            console.log('❌ Nessun token admin trovato');
            return res.status(401).redirect('/login');
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.admin = decoded;
            console.log('✅ Admin autenticato:', decoded.email);
            next();
        } catch (err) {
            console.error('❌ Token admin invalido:', err.message);
            res.clearCookie('adminToken');
            return res.status(403).redirect('/login');
        }
    };

    // 🆕 ROTTA PROTETTA: bossPanel solo per admin
    app.get('/bossPanel', authenticateAdmin, (req, res) => {
        res.sendFile(path.join(__dirname, 'views', 'html', 'bossPanel.html'));
    });

    // --- CARICAMENTO ROTTE (DOPO session middleware) ---
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

    // 🟩 Inizializzazione utenti autorizzati
    if (loginModule.initializeAuthorizedUsers) {
        try {
            await loginModule.initializeAuthorizedUsers();
            console.log('✅ Utenti autorizzati inizializzati con successo!');
        } catch (err) {
            console.error('❌ Errore durante l\'inizializzazione:', err);
        }
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server in esecuzione sulla porta ${PORT}`);
        console.log(`📍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch(err => {
    console.error('❌ Errore critico durante l\'avvio del database:', err);
    process.exit(1);
  });











