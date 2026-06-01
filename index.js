require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo'); // 🟩 AGGIUNTO: Per non perdere il login su Render

const app = express();

// Middleware di base
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🟩 CONFIGURAZIONE SESSIONE PERSISTENTE SU MONGO
app.use(session({
    secret: process.env.SESSION_SECRET || 'chiave-segreta-molto-sicura',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI, 
        ttl: 14 * 24 * 60 * 60 // 14 giorni di validità
    }),
    cookie: { 
        secure: false, // Lascia false su Render 
        maxAge: 1000 * 60 * 60 * 24 // 1 giorno
    }
}));

// --- CARICAMENTO ROTTE ---

// 1. Rotte di autenticazione (Login, Registrazione, Password)
const loginRouter = require('./routes/login'); 
app.use('/', loginRouter);

// 2. Altre rotte del tuo sito (Cucina e Cineforum gestione upload/dati)
const uploadRoutes = require('./routes/cucinaInsert');
const cineforumRoutes = require('./routes/cineforumInsert');
app.use('/', uploadRoutes);
app.use('/', cineforumRoutes); 

// NOTA: Le rotte GET /cucinaInsert e GET /cineforumInsert le gestisce già il tuo file delle rotte!
// Le abbiamo rimosse da qui per evitare conflitti di codice.

// 3. Pagina iniziale del sito
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Avvio del server sulla porta di Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server in esecuzione sulla porta ${PORT}`));









