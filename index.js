require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { default: MongoStore } = require('connect-mongo');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const multer = require('multer');

const connectDB = require('./db');
const User = require('./models/User');
const { Recipe, Archivio } = require('./models/Recipes');
const { sendMail } = require('./utils/mailer');
const cloudinary = require('./config/cloudinary');

const app = express();
const mongoStringa = process.env.MONGO_URI;

// Middleware di base
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Multer config per Vercel (memory storage) - centralizzato qui
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

connectDB()
  .then(async () => {
    console.log('✅ Connesso a MongoDB con successo!');

    const isProd = process.env.NODE_ENV === 'production';

    // Se sei dietro proxy (Vercel), abilita trust proxy prima delle sessioni
    if (isProd) app.set('trust proxy', 1);

    // usa il client mongoose già connesso (se disponibile) per la session store
    const mongooseClient = mongoose.connection && typeof mongoose.connection.getClient === 'function'
      ? mongoose.connection.getClient()
      : (mongoose.connection && mongoose.connection.client) || null;

    if (!mongooseClient) {
      console.warn('Attenzione: mongoose.connection.getClient() non disponibile; MongoStore userà mongoUrl fallback');
    }

    app.use(session({
      secret: process.env.SESSION_SECRET || 'chiave-segreta-molto-sicura',
      resave: false,
      saveUninitialized: false,
      store: mongooseClient ? MongoStore.create({
        client: mongooseClient,
        ttl: 14 * 24 * 60 * 60
      }) : MongoStore.create({
        mongoUrl: mongoStringa,
        ttl: 14 * 24 * 60 * 60
      }),
      cookie: {
        secure: isProd, // true in produzione (HTTPS)
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
      },
      name: 'sessionId'
    }));

    const TEMP_TTL_MS = 1000 * 60 * 60; // 1 ora

    // ============ HELPER MIDDLEWARE ============

    function ensureBoss(req, res, next) {
      if (req.session && req.session.authenticated && req.session.role === 'boss') {
        return next();
      }
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Helper: upload file a Cloudinary (riutilizzato anche nelle route)
    async function uploadToCloudinary(buffer, fileName, folder, resourceType = 'image') {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `ricette/${folder}`,
            public_id: fileName.replace(/\.[^/.]+$/, ''),
            resource_type: resourceType,
            overwrite: true
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(buffer);
      });
    }

    // ============ AUTH ROUTES ============

    // POST /auth/request-temp
    app.post('/auth/request-temp', async (req, res) => {
      try {
        const { userId, email } = req.body;
        if (userId !== 'boss' || email !== process.env.BOSS_EMAIL) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
        let boss = await User.findOne({ email });
        if (!boss) boss = new User({ email, role: 'boss', username: 'boss' });
        const temp = crypto.randomBytes(4).toString('hex');
        boss.passwordHash = await bcrypt.hash(temp, 10);
        boss.tempExpiresAt = new Date(Date.now() + TEMP_TTL_MS);
        await boss.save();

        try {
          await sendMail(email, 'Password temporanea', `La tua password temporanea: ${temp}\nScade in 1 ora.`);
        } catch (mailErr) {
          console.error('sendMail failed', mailErr);
          return res.status(500).json({ error: 'Errore invio mail' });
        }

        return res.json({ ok: true, message: 'Password temporanea inviata via email.' });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Errore server' });
      }
    });

    // GET /login
    app.get('/login', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'login.html')); });
    app.get('/login.html', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'login.html')); });

    app.get('/bossPanel.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'views', 'html', 'bossPanel.html'));
    });

    // POST /auth/login
    app.post('/auth/login', async (req, res) => {
      try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !user.passwordHash) return res.status(401).json({ error: 'Credenziali errate' });
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) return res.status(401).json({ error: 'Credenziali errate' });
        if (user.tempExpiresAt && user.tempExpiresAt < new Date()) {
          return res.status(401).json({ error: 'Password temporanea scaduta' });
        }

        req.session.authenticated = true;
        req.session.userId = user._id.toString();
        req.session.role = user.role;
        req.session.allowedPage = user.allowedPage || null;

        req.session.save((err) => {
          if (err) {
            console.error('Errore salvataggio sessione:', err);
            return res.status(500).json({ error: 'Errore server' });
          }

          console.log('✅ Sessione salvata:', {
            sessionID: req.sessionID,
            authenticated: req.session.authenticated,
            role: req.session.role,
            userId: req.session.userId
          });

          return res.json({
            ok: true,
            role: user.role,
            allowedPage: user.allowedPage || null,
            message: 'Login OK'
          });
        });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Errore server' });
      }
    });

    // POST /auth/forgot-password
    app.post('/auth/forgot-password', async (req, res) => {
      try {
        const { username, email } = req.body;
        const user = await User.findOne({ email, username });
        if (!user) return res.status(404).json({ error: 'Utente non trovato' });

        const temp = crypto.randomBytes(4).toString('hex');
        user.passwordHash = await bcrypt.hash(temp, 10);
        user.tempExpiresAt = new Date(Date.now() + TEMP_TTL_MS);
        await user.save();

        await sendMail(email, 'Recupero password', `Password temporanea: ${temp}\nScade in 1 ora.`);
        return res.json({ ok: true, message: 'Email inviata con password temporanea' });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Errore server' });
      }
    });

    // POST /auth/change-password
    app.post('/auth/change-password', async (req, res) => {
      try {
        const { username, oldPassword, newPassword } = req.body;
        if (!username || !newPassword) return res.status(400).json({ error: 'Campi mancanti' });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'Utente non trovato' });

        const sessionUserMatches = req.session && req.session.authenticated && req.session.userId === user._id.toString();
        let allowed = false;
        if (sessionUserMatches) allowed = true;
        else if (oldPassword) {
          const ok = await bcrypt.compare(oldPassword, user.passwordHash || '');
          if (ok) allowed = true;
        }

        if (!allowed) return res.status(401).json({ error: 'Autenticazione richiesta' });

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        user.tempExpiresAt = null;
        await user.save();
        return res.json({ ok: true, message: 'Password aggiornata' });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Errore server' });
      }
    });

    // ============ ADMIN ROUTES ============

    // GET /admin/users
    app.get('/admin/users', ensureBoss, async (req, res) => {
      try {
        const users = await User.find({}, 'username email role allowedPage createdAt').sort({ createdAt: -1 });
        return res.json(users);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Errore server' });
      }
    });

    // POST /admin/users
    app.post('/admin/users', ensureBoss, async (req, res) => {
      try {
        const { username, email, allowedPage, password } = req.body;
        if (!email || !allowedPage) return res.status(400).json({ error: 'Campi mancanti' });

        if (await User.findOne({ email })) return res.status(400).json({ error: 'Email già esistente' });

        let passwordHash;
        let tempPlain = null;
        if (password) {
          passwordHash = await bcrypt.hash(password, 10);
        } else {
          tempPlain = crypto.randomBytes(4).toString('hex');
          passwordHash = await bcrypt.hash(tempPlain, 10);
        }

        const user = new User({
          username,
          email,
          role: 'user',
          allowedPage,
          passwordHash,
          tempExpiresAt: tempPlain ? new Date(Date.now() + TEMP_TTL_MS) : null
        });
        await user.save();

        if (tempPlain) {
          await sendMail(email, 'Account creato - Password temporanea', `La tua password temporanea: ${tempPlain}\nScade in 1 ora.`);
        } else {
          await sendMail(email, 'Account creato', `Il tuo account è stato creato. Usa la password che hai scelto per il login.`);
        }

        return res.json({ ok: true, userId: user._id });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Errore server' });
      }
    });

    // DELETE /admin/users/:id
    app.delete('/admin/users/:id', ensureBoss, async (req, res) => {
      try {
        const id = req.params.id;
        await User.findByIdAndDelete(id);
        return res.json({ ok: true });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Errore server' });
      }
    });

    // ============ LOGOUT ============

    app.get('/logout', (req, res) => {
      req.session.destroy(err => {
        res.clearCookie('sessionId');
        return res.redirect('/login.html');
      });
    });

    app.post('/logout', (req, res) => {
      req.session.destroy(err => {
        res.clearCookie('sessionId');
        return res.redirect('/login.html');
      });
    });

    // ============ MOUNT cucina routes (Opzione B) ============
    // importa il router passando upload e cloudinary
    const cucinaRouter = require('./routes/cucinaInsert')(upload, cloudinary);
    app.use('/', cucinaRouter);

    // ============ RECIPE ROUTES (restanti) ============
    // GET /getImageUrls/:recipeTitle
    app.get('/getImageUrls/:recipeTitle', async (req, res) => {
      try {
        const { recipeTitle } = req.params;
        const recipe = await Recipe.findOne({ title: recipeTitle });

        if (!recipe) {
          return res.status(404).json({ error: 'Ricetta non trovata' });
        }

        return res.json({
          primo: recipe.primo?.imageUrl,
          primo_titolo: recipe.primo?.titolo,
          primo_ingredienti: recipe.primo?.ingredienti,
          primo_descrizione: recipe.primo?.descrizione,

          secondo: recipe.secondo?.imageUrl,
          secondo_titolo: recipe.secondo?.titolo,
          secondo_ingredienti: recipe.secondo?.ingredienti,
          secondo_descrizione: recipe.secondo?.descrizione,

          contorno: recipe.contorno?.imageUrl,
          contorno_titolo: recipe.contorno?.titolo,
          contorno_ingredienti: recipe.contorno?.ingredienti,
          contorno_descrizione: recipe.contorno?.descrizione,

          ricetta: recipe.ricetta?.pdfUrl
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Errore server' });
      }
    });

    // (le altre POST /salvaPrimo, /salvaSecondo, ecc. rimangono invariate)
    // copiale qui come nel file originale (omesse per brevità in questo snippet)
    // --- se vuoi, posso reinserirle tutte esattamente come prima ---

    // ============ START SERVER ============

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

// Helper function: estrae il public_id di Cloudinary dall'URL dell'immagine
// Funziona con url del tipo: https://cloudinary.com -> restituisce "cartella/nome_foto"
function getCloudinaryPublicId(url) {
    if (!url || !url.includes('cloudinary.com')) return null;
    try {
        const parts = url.split('/upload/');
        if (parts.length < 2) return null;
        
        // Rimuove la versione (es: v1234567/) se presente
        let remaining = parts[1];
        if (remaining.startsWith('v')) {
            const firstSlash = remaining.indexOf('/');
            remaining = remaining.substring(firstSlash + 1);
        }
        
        // Rimuove l'estensione del file (es: .jpg, .png)
        const dotIndex = remaining.lastIndexOf('.');
        if (dotIndex !== -1) {
            remaining = remaining.substring(0, dotIndex);
        }
        return remaining;
    } catch (err) {
        console.error("Errore nel parsing dell'URL Cloudinary:", err);
        return null;
    }
}

//====================== ARCHIVIO ======================

// ============ ARCHIVIO ============

// 1. Rotta PUBBLICA: Chiunque può accedere per leggere le ricette dall'archivio
app.get('/archivio-api', async (req, res) => {
    try {
        const ricette = await Archivio.find().sort({ archiviataIl: -1 });
        res.json(ricette);
    } catch (err) {
        console.error('Errore nel recupero dell\'archivio:', err);
        res.status(500).json({ error: 'Errore del server nel recupero dati' });
    }
});

// 2. Rotta per il controllo ruolo: Gestisce sia gli utenti loggati che i visitatori anonimi
app.get('/check-ruolo-cucina', (req, res) => {
    if (req.session && req.session.user && req.session.user.role === 'cucina') {
        return res.json({ autorizzato: true });
    }
    res.json({ autorizzato: false });
});

// 3. NUOVA Rotta PROTETTA: Incolla qui sotto il codice che ti ho dato per eliminare da DB e Cloudinary
function getCloudinaryPublicId(url) {
    // ... (tutto il codice della funzione che estrae l'ID)
}

app.delete('/elimina-ricetta-api/:id', async (req, res) => {
    // ... (tutto il blocco app.delete che elimina da MongoDB e Cloudinary)
});


// 3. Rotta PROTETTA: Elimina la ricetta da MongoDB e le relative immagini da Cloudinary
app.delete('/elimina-ricetta-api/:id', async (req, res) => {
    // BLOCCO DI SICUREZZA: Solo l'utente 'cucina' può procedere
    if (!req.session || !req.session.user || req.session.user.role !== 'cucina') {
        return res.status(403).json({ error: 'Azione non autorizzata. Permessi insufficienti.' });
    }

    const recId = req.params.id;

    try {
        // 1. Trova la ricetta prima di eliminarla per accedere agli URL delle immagini
        const ricetta = await Archivio.findById(recId);
        
        if (!ricetta) {
            return res.status(404).json({ error: 'Ricetta non trovata nell\'archivio' });
        }

        // 2. Raccoglie i public_id di tutte le immagini presenti nella ricetta
        const publicIdsDaEliminare = [];
        const piatti = ['primo', 'secondo', 'contorno'];

        piatti.forEach(tipoPiatto => {
            if (ricetta[tipoPiatto] && ricetta[tipoPiatto].imageUrl) {
                const pId = getCloudinaryPublicId(ricetta[tipoPiatto].imageUrl);
                if (pId) publicIdsDaEliminare.push(pId);
            }
        });

        // 3. Elimina i file da Cloudinary in modo asincrono (se presenti)
        if (publicIdsDaEliminare.length > 0) {
            console.log(`Eliminazione immagini da Cloudinary: ${publicIdsDaEliminare}`);
            // Usiamo Promise.all per eliminare tutte le immagini in parallelo
            await Promise.all(
                publicIdsDaEliminare.map(id => cloudinary.uploader.destroy(id))
            );
        }

        // 4. Elimina definitivamente il documento da MongoDB
        await Archivio.findByIdAndDelete(recId);

        res.json({ message: 'Ricetta e relative immagini eliminate con successo!' });

    } catch (err) {
        console.error('Errore durante l\'eliminazione della ricetta:', err);
        res.status(500).json({ error: 'Errore interno del server durante l\'eliminazione' });
    }
});


// ============ ROTTE HOME PUBBLICHE (fuori dal blocco di connessione) ============
// serve la home (index.html) dalla root
app.get('/', (req, res) => {
  return res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
  return res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/centro', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'centro.html')); });
app.get('/cicala', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'cicala.html')); });
app.get('/stone', (req, res) => { res.sendFile(path.join(__dirname,'index.html')); });
app.get('/chi_siamo', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'chi_siamo.html')); });
app.get('/shop', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'soon_ava.html')); });


// ============ ROTTE CENTRO (altre) ============
app.get('/artistico', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'artistico.html')); });
app.get('/informatica', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'informatica.html')); });
app.get('/walking', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'walking.html')); });
app.get('/ginnastica', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'ginnastica.html')); });
app.get('/musicoterapia', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'musicoterapia.html')); });
app.get('/scrittura', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'scrittura.html')); });
app.get('/lettura', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'lettura.html')); });
app.get('/musica_passiva', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'musica_passiva.html')); });
app.get('/piscina', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'piscina.html')); });
app.get('/menu', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'menu.html')); });
app.get('/archivio', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'archivio.html')); });
