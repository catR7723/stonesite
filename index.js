require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose'); 
const { default: MongoStore } = require('connect-mongo');


const connectDB = require('./db');

const app = express();
const mongoStringa = process.env.MONGO_URI;

// Middleware per connettere Mongoose a ogni richiesta in modo sicuro (Serverless friendly)
app.use(async (req, res, next) => {
    if (mongoose.connection.readyState >= 1) {
        return next();
    }
    try {
        await mongoose.connect(mongoStringa, { bufferCommands: false });
        next();
    } catch (err) {
        console.error('Errore DNS/Connessione MongoDB su Vercel:', err);
        res.status(500).send('Database temporaneamente non raggiungibile');
    }
});

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
const loginRouter = require('./routes/login'); 
app.use('/', loginRouter);

const uploadRoutes = require('./routes/cucinaInsert');
const cineforumRoutes = require('./routes/cineforumInsert');
app.use('/', uploadRoutes);
app.use('/', cineforumRoutes); 
app.get('/archivio', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'html', 'archivio.html'));
});
app.get('/check-ruolo-cucina', (req, res) => {
    // 💡 Sincronizzato con le variabili reali del tuo login: authenticated e role
    if (req.session && req.session.authenticated && req.session.role === 'cucina') {
        return res.json({ autorizzato: true });
    }
    res.json({ autorizzato: false });
});





app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server in esecuzione sulla porta ${PORT}`));







