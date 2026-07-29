const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('./config/cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');

// modello Cineforum (assicurati di avere ./models/Cineforum.js)
const Cine = require('../models/Cineforum');

// --- CONFIGURAZIONE CLOUDINARY & MULTER ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'cineforum_locandine',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
  }
});

const upload = multer({ storage });

// --- MIDDLEWARE DI AUTENTICAZIONE ---
const richiediCineforum = (req, res, next) => {
  // modifica la logica se il nome del ruolo è diverso
  if (req.session?.authenticated && req.session.role === 'cineforum') return next();
  return res.status(403).json({ success: false, error: 'Accesso negato' });
};

// --- SERVIRE LA PAGINA DI INSERIMENTO ---
// il file cineforumInsert.html è atteso nella root del progetto (../cineforumInsert.html)
router.get('/cineforumInsert', richiediCineforum, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'cineforumInsert.html'));
});

// --- 1. UPLOAD LOCANDINA ---
// Riceve multipart/form-data con campo 'locandina'
router.post('/cineforumInsert', richiediCineforum, upload.single('locandina'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Nessun file caricato' });

    // DEBUG utile: controlla req.file nei log per individuare proprietà esatte
    console.log('Upload req.file:', req.file);

    // fallback multipli per url e publicId (dipende da versione della storage lib)
    const url = req.file.path || req.file.secure_url || req.file.url || req.file.location || null;
    const publicId = req.file.filename || req.file.public_id || req.file.publicId || null;

    // salva temporaneamente in sessione
    req.session.tempLocandina = { url, publicId };

    return res.json({
      success: true,
      url,
      publicId,
      message: 'Locandina caricata con successo'
    });
  } catch (err) {
    console.error('❌ Errore upload locandina:', err);
    return res.status(500).json({ success: false, error: 'Errore nell\'upload della locandina' });
  }
});

// Per i POST JSON seguenti assumiamo che app.use(express.json()) sia già impostato in index.js.
// Se non lo è, puoi aggiungere express.json() come middleware singolo nelle route.

// --- 2. SALVA TITOLO FILM ---
// Salva titolo + slug (nomeCartellaFilm) in sessione (NON come _id)
router.post('/salvaTitoloLocandina', richiediCineforum, express.json(), async (req, res) => {
  try {
    const { titoloFilm } = req.body;
    if (!titoloFilm) return res.status(400).json({ success: false, error: 'Titolo richiesto' });
    if (!req.session.tempLocandina) return res.status(400).json({ success: false, error: 'Carica prima una locandina' });

    // crea uno slug pulito per la cartella (nomeCartellaFilm)
    const slug = titoloFilm.toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
      .replace(/[^a-z0-9\s_-]/g, '') // rimuove caratteri non validi
      .trim().replace(/\s+/g, '_')
      .substring(0, 50);

    req.session.tempFilm = {
      titolo: titoloFilm,
      nomeCartellaFilm: slug,
      locandina: req.session.tempLocandina
    };

    return res.json({ success: true, message: 'Titolo salvato', film: req.session.tempFilm });
  } catch (err) {
    console.error('❌ Errore salvataggio titolo:', err);
    return res.status(500).json({ success: false, error: 'Errore nel salvataggio del titolo' });
  }
});

// --- 3. SALVA TRAMA ---
router.post('/salvaTrama', richiediCineforum, express.json(), async (req, res) => {
  try {
    const { tramaFilm } = req.body;
    if (!tramaFilm) return res.status(400).json({ success: false, error: 'Trama richiesta' });
    if (!req.session.tempFilm) return res.status(400).json({ success: false, error: 'Salva prima il titolo' });

    req.session.tempFilm.trama = tramaFilm;
    return res.json({ success: true, message: 'Trama salvata', film: req.session.tempFilm });
  } catch (err) {
    console.error('❌ Errore salvataggio trama:', err);
    return res.status(500).json({ success: false, error: 'Errore nel salvataggio della trama' });
  }
});

// --- 4. SALVA DISCUSSIONE ---
router.post('/salvaDiscussione', richiediCineforum, express.json(), async (req, res) => {
  try {
    const { discussione } = req.body;
    if (!discussione) return res.status(400).json({ success: false, error: 'Discussione richiesta' });
    if (!req.session.tempFilm) return res.status(400).json({ success: false, error: 'Salva prima il titolo' });

    req.session.tempFilm.discussione = discussione;
    return res.json({ success: true, message: 'Discussione salvata', film: req.session.tempFilm });
  } catch (err) {
    console.error('❌ Errore salvataggio discussione:', err);
    return res.status(500).json({ success: false, error: 'Errore nel salvataggio della discussione' });
  }
});

// --- 5. SALVA FILM (bozza) ---
// Lascia che Mongo generi _id; salva nomeCartellaFilm nello schema
router.post('/salvaFilm', richiediCineforum, express.json(), async (req, res) => {
  try {
    const temp = req.session.tempFilm;
    if (!temp || !temp.titolo) return res.status(400).json({ success: false, error: 'Completa tutti i campi prima di salvare' });

    const filmDoc = new Cine({
      titolo: temp.titolo,
      trama: temp.trama || '',
      discussione: temp.discussione || '',
      locandinaUrl: temp.locandina?.url || '',
      locandinaPublicId: temp.locandina?.publicId || '',
      nomeCartellaFilm: temp.nomeCartellaFilm || '',
      dataInserimento: new Date(),
      published: false
    });

    await filmDoc.save();

    // salva l'id reale in sessione per riferimenti futuri
    req.session.tempFilm.savedId = filmDoc._id;

    // mantieni o pulisci tempLocandina a seconda del flusso desiderato
    // req.session.tempLocandina = null;

    return res.json({ success: true, message: 'Film salvato come bozza', filmId: filmDoc._id });
  } catch (err) {
    console.error('❌ Errore salvataggio film:', err);
    return res.status(500).json({ success: false, error: 'Errore nel salvataggio del film' });
  }
});

// --- 6. PUBBLICA FILM ---
router.post('/salvaFilmR', richiediCineforum, express.json(), async (req, res) => {
  try {
    const temp = req.session.tempFilm;
    if (!temp) return res.status(400).json({ success: false, error: 'Nessun film da pubblicare' });

    const filmId = temp.savedId;
    let film = null;

    if (filmId) {
      film = await Cine.findById(filmId);
    }
    if (!film && temp.nomeCartellaFilm) {
      film = await Cine.findOne({ nomeCartellaFilm: temp.nomeCartellaFilm });
    }

    if (!film) {
      film = new Cine({
        titolo: temp.titolo,
        trama: temp.trama || '',
        discussione: temp.discussione || '',
        locandinaUrl: temp.locandina?.url || '',
        locandinaPublicId: temp.locandina?.publicId || '',
        nomeCartellaFilm: temp.nomeCartellaFilm || '',
        dataInserimento: new Date(),
        published: true
      });
    } else {
      film.titolo = temp.titolo;
      film.trama = temp.trama || '';
      film.discussione = temp.discussione || '';
      film.locandinaUrl = temp.locandina?.url || '';
      film.locandinaPublicId = temp.locandina?.publicId || '';
      film.published = true;
      film.dataInserimento = film.dataInserimento || new Date();
    }

    await film.save();

    // pulisci sessione
    req.session.tempFilm = null;
    req.session.tempLocandina = null;

    return res.json({ success: true, message: 'Film pubblicato con successo!', filmId: film._id });
  } catch (err) {
    console.error('❌ Errore pubblicazione film:', err);
    return res.status(500).json({ success: false, error: 'Errore nella pubblicazione del film' });
  }
});

// --- 7. ELIMINA LOCANDINA ---
// Usa publicId dalla sessione o acepta publicId/filmId body
router.post('/deleteLocandina', richiediCineforum, express.json(), async (req, res) => {
  try {
    const { publicId: bodyPublicId, filmId: bodyFilmId } = req.body || {};
    const sessionPublicId = req.session.tempLocandina?.publicId;
    const publicId = bodyPublicId || sessionPublicId;

    if (!publicId) return res.status(400).json({ success: false, error: 'Nessuna locandina da eliminare' });

    // elimina da Cloudinary (ignora risultato)
    await cloudinary.uploader.destroy(publicId);

    // se è presente filmId nel body o session.savedId aggiorna il documento
    const filmId = bodyFilmId || req.session.tempFilm?.savedId;
    if (filmId) {
      await Cine.findByIdAndUpdate(filmId, { $set: { locandinaUrl: '', locandinaPublicId: '' } });
    }

    req.session.tempLocandina = null;
    return res.json({ success: true, message: 'Locandina eliminata' });
  } catch (err) {
    console.error('❌ Errore eliminazione locandina:', err);
    return res.status(500).json({ success: false, error: 'Errore nell\'eliminazione della locandina' });
  }
});

// --- 8. CARICA FILM PER MODIFICA ---
// Accetta sia ObjectId sia slug (nomeCartellaFilm)
router.get('/modificaInsert/:filmIdOrSlug', richiediCineforum, async (req, res) => {
  try {
    const key = req.params.filmIdOrSlug;
    let film = null;

    if (/^[0-9a-fA-F]{24}$/.test(key)) {
      film = await Cine.findById(key).lean();
    }
    if (!film) {
      film = await Cine.findOne({ nomeCartellaFilm: key }).lean();
    }
    if (!film) return res.status(404).json({ success: false, error: 'Film non trovato' });

    // carica in sessione per modifiche
    req.session.tempFilm = {
      _id: film._id,
      savedId: film._id,
      titolo: film.titolo,
      trama: film.trama,
      discussione: film.discussione,
      locandina: { url: film.locandinaUrl, publicId: film.locandinaPublicId },
      nomeCartellaFilm: film.nomeCartellaFilm
    };

    return res.json({ success: true, film });
  } catch (err) {
    console.error('❌ Errore caricamento film:', err);
    return res.status(500).json({ success: false, error: 'Errore nel caricamento del film' });
  }
});

// --- 9. API - FILM DELLA SETTIMANA ---
router.get('/api/film-settimana', async (req, res) => {
  try {
    const film = await Cine.findOne({ published: true }).sort({ dataInserimento: -1 }).lean();
    if (!film) return res.json({ success: false, message: 'Nessun film disponibile' });
    return res.json({ success: true, film });
  } catch (err) {
    console.error('❌ Errore fetch film settimana:', err);
    return res.status(500).json({ success: false, error: 'Errore nel recupero del film' });
  }
});

// --- 10. API - ARCHIVIO FILM ---
router.get('/api/archivio', async (req, res) => {
  try {
    const films = await Cine.find({ published: true }).sort({ dataInserimento: -1 }).lean();
    return res.json(films);
  } catch (err) {
    console.error('❌ Errore fetch archivio:', err);
    return res.status(500).json({ success: false, error: 'Errore nel recupero dell\'archivio' });
  }
});

// POST /deleteFilm  (protetto)
router.post('/deleteFilm', richiediCineforum, express.json(), async (req, res) => {
  try {
    const { filmId } = req.body;
    if (!filmId) return res.status(400).json({ success: false, error: 'filmId mancante' });

    const film = await Cine.findById(filmId);
    if (!film) return res.status(404).json({ success: false, error: 'Film non trovato' });

    // elimina locandina da Cloudinary se esiste public id
    if (film.locandinaPublicId) {
      try {
        await cloudinary.uploader.destroy(film.locandinaPublicId);
      } catch (cloudErr) {
        console.warn('Attenzione: errore eliminazione immagine Cloudinary', cloudErr);
        // non blocchiamo la cancellazione DB per un problema Cloudinary,
        // ma potresti voler gestire diversamente.
      }
    }

    // elimina il documento dal DB
    await Cine.findByIdAndDelete(filmId);

    return res.json({ success: true, message: 'Film eliminato' });
  } catch (err) {
    console.error('POST /deleteFilm error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Errore server' });
  }
});

module.exports = router;