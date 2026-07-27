require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { default: MongoStore } = require('connect-mongo');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const connectDB = require('./db');
const User = require('./models/User');
const { sendMail } = require('./utils/mailer');

const app = express();
const mongoStringa = process.env.MONGO_URI;

// Middleware di base
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

connectDB()
  .then(async () => {
    console.log('✅ Connesso a MongoDB con successo!');

    const isProd = process.env.NODE_ENV === 'production';

app.use(session({
  secret: process.env.SESSION_SECRET || 'chiave-segreta-molto-sicura',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoStringa,
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: {
    secure: false,            // ← CAMBIA QUI
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24
  },
  name: 'sessionId'
}));

    // --- AUTH & ADMIN ROUTES (integrate qui per usare solo login.html JS) ---

    const TEMP_TTL_MS = 1000 * 60 * 60; // 1 ora

    // helper: ensure boss
function ensureBoss(req, res, next) {
  console.log('=== DEBUG ensureBoss ===');
  console.log('Cookies:', req.headers.cookie);
  console.log('Session ID:', req.sessionID);
  console.log('Session data:', req.session);
  console.log('========================');

  if (req.session && req.session.authenticated && req.session.role === 'boss') {
    console.log('✅ Boss autorizzato');
    return next();
  }
  console.log('❌ Accesso negato');
  return res.status(403).json({ error: 'Forbidden' });
}

    // POST /auth/request-temp  { userId, email }  (boss requests temporary password)
   app.post('/auth/request-temp', async (req, res) => {
  try {
    const { userId, email } = req.body;
    console.log('REQUEST /auth/request-temp', { userId, email, envBoss: process.env.BOSS_EMAIL });
    if (userId !== 'boss' || email !== process.env.BOSS_EMAIL) {
      console.log('request-temp: unauthorized check failed');
      return res.status(403).json({ error: 'Unauthorized' });
    }
    let boss = await User.findOne({ email });
    console.log('found boss in db:', !!boss);
    if (!boss) boss = new User({ email, role: 'boss', username: 'boss' });
    const temp = crypto.randomBytes(4).toString('hex');
    boss.passwordHash = await bcrypt.hash(temp, 10);
    boss.tempExpiresAt = new Date(Date.now() + TEMP_TTL_MS);
    await boss.save();
    console.log('saved boss, temp=', temp);

    try {
      await sendMail(email, 'Password temporanea', `La tua password temporanea: ${temp}\nScade in 1 ora.`);
      console.log('sendMail ok');
    } catch (mailErr) {
      console.error('sendMail failed', mailErr);
      return res.status(500).json({ error: 'Errore invio mail', detail: String(mailErr) });
    }

    return res.json({ ok: true, message: 'Password temporanea inviata via email.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Errore server' });
  }
});

    // Serve login (views/html/login.html)
    app.get('/login', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'login.html')); });
    app.get('/login.html', (req, res) => { res.sendFile(path.join(__dirname, 'views', 'html', 'login.html')); });
    app.get('/bossPanel.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'html', 'bossPanel.html'));
});

// POST /auth/login { username, password }
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

    // ✅ Salva i dati della sessione
    req.session.authenticated = true;
    req.session.userId = user._id.toString();
    req.session.role = user.role;
    req.session.allowedPage = user.allowedPage || null;

    // ✅ Salva la sessione nel database
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
    

    // POST /auth/forgot-password { username, email } -> generate temp and send
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

    // POST /auth/change-password { username, oldPassword, newPassword }
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

    // --- ADMIN: gestire utenti (protette per boss via session) ---

    // GET /admin/users  (boss only)
    app.get('/admin/users', ensureBoss, async (req, res) => {
      try {
        const users = await User.find({}, 'username email role allowedPage createdAt').sort({ createdAt: -1 });
        return res.json(users);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Errore server' });
      }
    });

    // POST /admin/users  (boss only)  body: { username, email, allowedPage, password? }
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

    // DELETE /admin/users/:id (boss only)
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

    // Logout (GET + POST)
    app.get('/logout', (req, res) => {
      req.session.destroy(err => {
        res.clearCookie('connect.sid');
        return res.redirect('/login.html');
      });
    });
    app.post('/logout', (req, res) => {
      req.session.destroy(err => {
        res.clearCookie('connect.sid');
        return res.redirect('/login.html');
      });
    });

    // --- ROTTE PUBBLICHE E VECCHIE ---

app.get('/cucina', (req, res) => {
  if (req.session && req.session.authenticated &&
    (req.session.allowedPage === 'cucina' || req.session.allowedPage === 'both')) {
    return res.sendFile(path.join(__dirname, 'cucinaInsert.html'));
  }
  return res.status(403).json({ error: 'Forbidden - Non autorizzato per cucina' });
});
app.get('/cineforum', (req, res) => {
  if (req.session && req.session.authenticated &&
    (req.session.allowedPage === 'cineforum' || req.session.allowedPage === 'both')) {
    return res.sendFile(path.join(__dirname, 'cineforumInsert.html'));
  }
  return res.status(403).json({ error: 'Forbidden - Non autorizzato per cineforum' });
});

    app.get('/archivio', (req, res) => {
      res.sendFile(path.join(__dirname, 'views', 'html', 'archivio.html'));
    });

  app.get('/check-ruolo-cucina', (req, res) => {
  if (req.session && req.session.authenticated && 
    (req.session.allowedPage === 'cucina' || req.session.allowedPage === 'both')) {
    return res.json({ autorizzato: true });
  }
  res.json({ autorizzato: false });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

    // Se hai una funzione per inizializzare utenti autorizzati in login.js, puoi chiamarla qui
    // (se vuoi che manteniamo la logica di bootstrap, spostala in un modulo e importala)

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