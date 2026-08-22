require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { MongoStore } = require('connect-mongo');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const cors = require('cors');

const connectDB = require('./db');
const User = require('./models/User');
console.log('User role enum values:', User.schema.path('role').enumValues);
const { Recipe, Archivio } = require('./models/Recipes');
const { sendMail } = require('./utils/mailer');
const cloudinary = require('./config/cloudinary');
const connectMongo = require('connect-mongo');
console.log('🔍 CONTENUTO DI CONNECT-MONGO:', connectMongo);

const app = express();
const mongoStringa = process.env.MONGO_URI;
const isProd = process.env.NODE_ENV === 'production';

// TTL per password temporanee (1 ora)
const TEMP_TTL_MS = 60 * 60 * 1000;

// 1. Trust Proxy per Vercel/HTTPS (va impostato SUBITO in produzione)
if (isProd) {
  app.set('trust proxy', 1);
}

// 2. Middleware di base
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// 2.1 CORS (IMPORTANTE: deve consentire credentials)
const corsOptions = {
  origin: process.env.FRONTEND_ORIGIN || true, // In produzione imposta FRONTEND_ORIGIN al dominio del frontend
  credentials: true
};
if (isProd && !process.env.FRONTEND_ORIGIN) {
  console.warn('⚠️ FRONTEND_ORIGIN non impostato in produzione — considera di impostarlo per motivi di sicurezza.');
}
app.use(cors(corsOptions));

// 1. AGGIUNGI QUESTO PRIMA DELLA SESSIONE (Fondamentale in produzione su Vercel/Heroku/Render)
if (isProd) {
  app.set('trust proxy', 1); 
}

// 2. CONFIGURAZIONE SESSIONE GLOBALE
app.use(session({
  secret: process.env.SESSION_SECRET || 'chiave-segreta-molto-sicura',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoStringa,
    ttl: 14 * 24 * 60 * 60 // 14 giorni
  }),
  cookie: {
    secure: isProd, // true in produzione (HTTPS)
    httpOnly: true,
    // MODIFICATO: 'lax' è la scelta corretta se frontend e backend condividono lo stesso dominio
    sameSite: 'lax', 
    maxAge: 1000 * 60 * 60 * 24 * 14
  },
  name: 'sessionId'
}));


// Multer config per Vercel (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ============ HELPER & MIDDLEWARE ============

// middleware di debug (solo in dev)
if (!isProd) {
  app.use((req, res, next) => {
    console.debug('--- REQ SESSION ---', req.session ? { id: req.session.id, user: req.session.user, authenticated: req.session.authenticated } : null);
    next();
  });
}

function ensureBoss(req, res, next) {
  if (req.session && req.session.authenticated && req.session.user?.role?.toLowerCase() === 'boss') {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden' });
}

// Verifica ruolo "cucina" helper
function ensureCucina(req, res, next) {
  if (req.session && req.session.authenticated && req.session.user?.role?.toLowerCase() === 'cucina') {
    return next();
  }
  return res.status(403).json({ error: 'Azione non autorizzata. Permessi insufficienti.' });
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

// Estrae il public_id di Cloudinary dall'URL dell'immagine
function getCloudinaryPublicId(url) {
  if (!url || !url.includes('cloudinary.com')) return null;
  try {
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;

    let remaining = parts[1];

    // rimuove la versione se presente /v123/
    if (remaining.startsWith('v')) {
      const firstSlash = remaining.indexOf('/');
      if (firstSlash !== -1) remaining = remaining.substring(firstSlash + 1);
    }

    // rimuove eventuale query string
    if (remaining.includes('?')) {
      remaining = remaining.split('?')[0];
    }

    // rimuove estensione
    const dotIndex = remaining.lastIndexOf('.');
    if (dotIndex !== -1) {
      remaining = remaining.substring(0, dotIndex);
    }

    return remaining || null;
  } catch (err) {
    console.error("Errore nel parsing dell'URL Cloudinary:", err);
    return null;
  }
}

// ============ AUTH ROUTES ============

// GET pagine login / statiche
app.get('/login', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'login.html')); });
app.get('/login.html', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'login.html')); });
app.get('/bossPanel.html', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'bossPanel.html')); });

// POST /auth/request-temp - genera password temporanea per boss
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

    // STANDARDIZZO la shape della sessione: req.session.user
    req.session.authenticated = true;
    req.session.user = {
      id: user._id.toString(),
      username: user.username,
      role: user.role
    };
    req.session.allowedPage = user.allowedPage || null;

    req.session.save((err) => {
      if (err) {
        console.error('Errore salvataggio sessione:', err);
        return res.status(500).json({ error: 'Errore server' });
      }

      console.log('✅ Sessione salvata:', {
        sessionID: req.sessionID,
        authenticated: req.session.authenticated,
        role: req.session.user?.role,
        userId: req.session.user?.id
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

    const sessionUserMatches = req.session && req.session.authenticated && req.session.user && req.session.user.id === user._id.toString();
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
    const { username, email, allowedPage, password, role } = req.body;

    // validazione minima
    if (!email || !allowedPage) return res.status(400).json({ error: 'Campi mancanti' });

    const validRoles = ['boss', 'user', 'cucina','cinema'];
    const validPages = ['cineforum', 'cucina', 'both'];

    // validazione role (se non fornito, default 'user')
    const finalRole = (role || 'user').toString();
    if (!validRoles.includes(finalRole)) return res.status(400).json({ error: 'Ruolo non valido' });

    if (!validPages.includes(allowedPage)) return res.status(400).json({ error: 'Pagina non valida' });

    // controllo email unica
    if (await User.findOne({ email })) return res.status(409).json({ error: 'Email già esistente' });

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
      role: finalRole,
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

    return res.status(201).json({ ok: true, userId: user._id });
  } catch (err) {
    console.error(err);
    // gestione più robusta per conflitti unici
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Chiave duplicata (email già esistente)' });
    }
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

// ============ ROTTE RECIPE / ARCHIVIO ============

// GET - Archivio Pubblico
app.get('/archivio-api', async (req, res) => {
  try {
    const ricette = await Archivio.find().sort({ archiviataIl: -1 });
    res.json(ricette);
  } catch (err) {
    console.error('Errore nel recupero dell\'archivio:', err);
    res.status(500).json({ error: 'Errore del server nel recupero dati' });
  }
});

// CHECK RUOLO CUCINA (il client deve chiamare con credentials: 'include')
app.get('/check-ruolo-cucina', (req, res) => {
  console.log('--- DEBUG SESSIONE ---');
  console.log(' req.session:', req.session ? { id: req.session.id, user: req.session.user } : 'Nessuna sessione');

  const isCucina = !!(req.session && req.session.user && req.session.user.role && req.session.user.role.toLowerCase() === 'cucina');
  res.json({ autorizzato: isCucina });
});

// PROTETTA: Elimina la ricetta da MongoDB e le relative immagini da Cloudinary
app.delete('/elimina-ricetta-api/:id', ensureCucina, async (req, res) => {
  const recId = req.params.id;

  try {
    const ricetta = await Archivio.findById(recId);
    if (!ricetta) {
      return res.status(404).json({ error: 'Ricetta non trovata nell\'archivio' });
    }

    const publicIdsDaEliminare = [];
    const piatti = ['primo', 'secondo', 'contorno'];
    piatti.forEach(tipoPiatto => {
      if (ricetta[tipoPiatto] && ricetta[tipoPiatto].imageUrl) {
        const pId = getCloudinaryPublicId(ricetta[tipoPiatto].imageUrl);
        if (pId) publicIdsDaEliminare.push(pId);
      }
    });

    if (publicIdsDaEliminare.length > 0) {
      console.log(`Eliminazione immagini da Cloudinary: ${publicIdsDaEliminare}`);
      await Promise.all(publicIdsDaEliminare.map(id => cloudinary.uploader.destroy(id).catch(e => {
        console.error('Errore eliminazione immagine Cloudinary:', id, e);
      })));
    }

    await Archivio.findByIdAndDelete(recId);

    res.json({ message: 'Ricetta e relative immagini eliminate con successo!' });
  } catch (err) {
    console.error('Errore durante l\'eliminazione della ricetta:', err);
    res.status(500).json({ error: 'Errore interno del server durante l\'eliminazione' });
  }
});


// GET immagine/urls di una ricetta (by title)
app.get('/getImageUrls/:recipeTitle', async (req, res) => {
  try {
    const { recipeTitle } = req.params;
    const recipe = await Recipe.findOne({ title: recipeTitle });

    if (!recipe) {
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }

    return res.json({
      title: recipe.title,
      isPiattoUnico: recipe.isPiattoUnico || false,

      // 🟢 Restituisce l'oggetto completo del piatto unico
      piattoUnico: {
        imageUrl: recipe.piattoUnico?.imageUrl || '',
        titolo: recipe.piattoUnico?.titolo || recipe.primo?.titolo || '',
        ingredienti: recipe.piattoUnico?.ingredienti || recipe.primo?.ingredienti || '',
        descrizione: recipe.piattoUnico?.descrizione || recipe.primo?.descrizione || ''
      },

      // 🟢 E per compatibilità restituisce anche i singoli campi
      piattoUnico_titolo: recipe.piattoUnico?.titolo || recipe.primo?.titolo || '',
      piattoUnico_ingredienti: recipe.piattoUnico?.ingredienti || recipe.primo?.ingredienti || '',
      piattoUnico_descrizione: recipe.piattoUnico?.descrizione || recipe.primo?.descrizione || '',

      // Portate tradizionali
      primo: recipe.primo || {},
      primo_titolo: recipe.primo?.titolo || '',
      primo_ingredienti: recipe.primo?.ingredienti || '',
      primo_descrizione: recipe.primo?.descrizione || '',

      secondo: recipe.secondo || {},
      secondo_titolo: recipe.secondo?.titolo || '',
      secondo_ingredienti: recipe.secondo?.ingredienti || '',
      secondo_descrizione: recipe.secondo?.descrizione || '',

      contorno: recipe.contorno || {},
      contorno_titolo: recipe.contorno?.titolo || '',
      contorno_ingredienti: recipe.contorno?.ingredienti || '',
      contorno_descrizione: recipe.contorno?.descrizione || '',

      ricetta: recipe.ricetta?.pdfUrl || recipe.ricetta || null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

// ============ MOUNT cucina routes (Opzione B) ============
try {
  const cucinaRouter = require('./routes/cucinaInsert')(upload, cloudinary);
  app.use('/', cucinaRouter);
} catch (err) {
  console.warn('Router cucinaInsert non trovato o errore nel mount:', err.message || err);
}

// ============ ROTTE HOME PUBBLICHE ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/centro', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'centro.html')));
app.get('/cicala', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'cicala.html')));
app.get('/stone', (req, res) => res.sendFile(path.join(__dirname,'index.html')));
app.get('/chi_siamo', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'chi_siamo.html')));
app.get('/shop', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'soon_ava.html')));

// ROTTE CENTRO (altre)
app.get('/artistico', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'artistico.html')));
app.get('/informatica', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'informatica.html')));
app.get('/walking', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'walking.html')));
app.get('/ginnastica', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'ginnastica.html')));
app.get('/musicoterapia', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'musicoterapia.html')));
app.get('/scrittura', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'scrittura.html')));
app.get('/lettura', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'lettura.html')));
app.get('/musica_passiva', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'musica_passiva.html')));
app.get('/piscina', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'piscina.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'laboratori', 'menu.html')));
app.get('/archivio', (req, res) => res.sendFile(path.join(__dirname, 'views', 'html', 'archivio.html')));

// ============ CONNESSIONE AL DATABASE E AVVIO SERVER ============
// 5. CONNESSIONE AL DATABASE E AVVIO SERVER LOCALE
connectDB()
    .then(() => {
        console.log('✅ Connesso a MongoDB con successo!');
        
        // Avvia SEMPRE il server in locale
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`🚀 Server in ascolto su http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ Errore durante l\'avvio del database:', err);
    });

module.exports = app;