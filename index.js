require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose'); 
const { default: MongoStore } = require('connect-mongo'); 

const app = express();

// 🟩 1. CONNESSIONE UNICA A MONGO (Prende la stringa dal file .env)
const mongoStringa = process.env.MONGO_URI;

mongoose.connect(mongoStringa)
  .then(() => console.log('Connesso a MongoDB con successo!'))
  .catch(err => console.error('Errore connessione MongoDB:', err));

// Middleware di base
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🟩 2. CONFIGURAZIONE SESSIONE PERSISTENTE
app.use(session({
    secret: process.env.SESSION_SECRET || 'chiave-segreta-molto-sicura',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: mongoStringa, 
        ttl: 14 * 24 * 60 * 60 
    }),
    cookie: { 
        secure: false, 
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







