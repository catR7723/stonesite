const express = require('express');
const path = require('path');
const { Recipe, Archivio } = require('../models/Recipes');

module.exports = (upload, cloudinary) => {
  const router = express.Router();

  // Middleware: verifica permessi per "cucina"
  function ensureCucinaAllowed(req, res, next) {
    if (req.session && req.session.authenticated &&
        (req.session.allowedPage === 'cucina' || req.session.allowedPage === 'both')) {
      return next();
    }
    // non autenticato -> redirect al login, altrimenti 403
    if (!req.session || !req.session.authenticated) {
      return res.redirect('/login.html');
    }
    return res.status(403).json({ error: 'Forbidden - Non autorizzato per cucina' });
  }

  // Middleware: verifica permessi per "cineforum"
  function ensureCineforumAllowed(req, res, next) {
    if (req.session && req.session.authenticated &&
        (req.session.allowedPage === 'cineforum' || req.session.allowedPage === 'both')) {
      return next();
    }
    if (!req.session || !req.session.authenticated) {
      return res.redirect('/login.html');
    }
    return res.status(403).json({ error: 'Forbidden - Non autorizzato per cineforum' });
  }

  // Pagina pubblica (visualizzazione)
  router.get('/laboratorio_cucina', (req, res) => {
    return res.sendFile(path.join(__dirname, '..', 'views', 'html', 'cucina.html'));
  });



  router.get('/cineforumInsert', ensureCineforumAllowed, (req, res) => {
    return res.sendFile(path.join(__dirname, '..', 'cineforumInsert.html'));
  });

  // Alias protetto /cucina -> cucinaInsert.html
router.get('/cucina', ensureCucinaAllowed, (req, res) => {
    return res.sendFile(path.join(__dirname, '..', 'views', 'html', 'cucinaInsert.html'));
});


  // Helper: upload a Cloudinary via upload_stream
  const uploadToCloudinary = (buffer, fileName, folder, resourceType = 'image') =>
    new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        folder: `ricette/${folder}`,
        public_id: fileName.replace(/\.[^/.]+$/, ''),
        resource_type: resourceType,
        overwrite: true
      }, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
      stream.end(buffer);
    });

  // Upload (protetto per utenti cucina)
  router.post('/cucinaInsert',
    ensureCucinaAllowed,
    upload.fields([
      { name: 'primo', maxCount: 1 },
      { name: 'secondo', maxCount: 1 },
      { name: 'contorno', maxCount: 1 },
      { name: 'ricetta', maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        const { recipeTitle } = req.body;
        if (!recipeTitle) return res.status(400).json({ success: false, error: 'recipeTitle mancante' });

        const images = {};

        if (req.files?.primo?.[0]) {
          const r = await uploadToCloudinary(req.files.primo[0].buffer, `primo_${Date.now()}`, recipeTitle, 'image');
          images.primo = r.secure_url;
          console.log(`✅ Primo uploaded: ${images.primo}`);
        }
        if (req.files?.secondo?.[0]) {
          const r = await uploadToCloudinary(req.files.secondo[0].buffer, `secondo_${Date.now()}`, recipeTitle, 'image');
          images.secondo = r.secure_url;
          console.log(`✅ Secondo uploaded: ${images.secondo}`);
        }
        if (req.files?.contorno?.[0]) {
          const r = await uploadToCloudinary(req.files.contorno[0].buffer, `contorno_${Date.now()}`, recipeTitle, 'image');
          images.contorno = r.secure_url;
          console.log(`✅ Contorno uploaded: ${images.contorno}`);
        }
        if (req.files?.ricetta?.[0]) {
          const r = await uploadToCloudinary(req.files.ricetta[0].buffer, `ricetta_${Date.now()}`, recipeTitle, 'raw');
          images.ricetta = r.secure_url;
          console.log(`✅ Ricetta uploaded: ${images.ricetta}`);
        }

        // Salva gli URL su MongoDB
        let recipe = await Recipe.findOne({ title: recipeTitle });
        if (!recipe) {
          recipe = new Recipe({ title: recipeTitle, userId: req.session && req.session.userId });
        } else if (!recipe.userId && req.session && req.session.userId) {
          recipe.userId = req.session.userId;
        }

        if (images.primo) recipe.primo = { ...recipe.primo, imageUrl: images.primo };
        if (images.secondo) recipe.secondo = { ...recipe.secondo, imageUrl: images.secondo };
        if (images.contorno) recipe.contorno = { ...recipe.contorno, imageUrl: images.contorno };
        if (images.ricetta) recipe.ricetta = { pdfUrl: images.ricetta };

        recipe.updatedAt = new Date();
        await recipe.save();

        console.log(`✅ Upload completo per ${recipeTitle}`);
        return res.json({ success: true, images });

      } catch (err) {
        console.error('Errore /cucinaInsert:', err);
        return res.status(500).json({ success: false, error: err.message || err });
      }
    });

  // ============ ROUTE DI SALVATAGGIO DATI (protette) ============

  // POST /salvaPrimo
  router.post('/salvaPrimo', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle, titolo_Primo, ingredienti_Primo, descrizione_Primo } = req.body;
      let recipe = await Recipe.findOne({ title: recipeTitle });
      if (!recipe) {
        recipe = new Recipe({ title: recipeTitle, userId: req.session && req.session.userId });
      } else if (!recipe.userId && req.session && req.session.userId) {
        recipe.userId = req.session.userId;
      }

      recipe.primo = {
        titolo: titolo_Primo || '',
        ingredienti: ingredienti_Primo || '',
        descrizione: descrizione_Primo || '',
        imageUrl: recipe.primo?.imageUrl || ''
      };
      recipe.updatedAt = new Date();
      await recipe.save();
      return res.json({ success: true, message: 'Primo salvato' });
    } catch (err) {
      console.error('Errore /salvaPrimo:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // POST /salvaSecondo
  router.post('/salvaSecondo', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle, titolo_Secondo, ingredienti_Secondo, descrizione_Secondo } = req.body;
      let recipe = await Recipe.findOne({ title: recipeTitle });
      if (!recipe) {
        recipe = new Recipe({ title: recipeTitle, userId: req.session && req.session.userId });
      } else if (!recipe.userId && req.session && req.session.userId) {
        recipe.userId = req.session.userId;
      }

      recipe.secondo = {
        titolo: titolo_Secondo || '',
        ingredienti: ingredienti_Secondo || '',
        descrizione: descrizione_Secondo || '',
        imageUrl: recipe.secondo?.imageUrl || ''
      };
      recipe.updatedAt = new Date();
      await recipe.save();
      return res.json({ success: true, message: 'Secondo salvato' });
    } catch (err) {
      console.error('Errore /salvaSecondo:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // POST /salvaContorno
  router.post('/salvaContorno', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle, titolo_Contorno, ingredienti_Contorno, descrizione_Contorno } = req.body;
      let recipe = await Recipe.findOne({ title: recipeTitle });
      if (!recipe) {
        recipe = new Recipe({ title: recipeTitle, userId: req.session && req.session.userId });
      } else if (!recipe.userId && req.session && req.session.userId) {
        recipe.userId = req.session.userId;
      }

      recipe.contorno = {
        titolo: titolo_Contorno || '',
        ingredienti: ingredienti_Contorno || '',
        descrizione: descrizione_Contorno || '',
        imageUrl: recipe.contorno?.imageUrl || ''
      };
      recipe.updatedAt = new Date();
      await recipe.save();
      return res.json({ success: true, message: 'Contorno salvato' });
    } catch (err) {
      console.error('Errore /salvaContorno:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // GET /api/recipe/latest -> restituisce l'ultima ricetta dell'utente, ma normalizza le sezioni
router.get('/api/recipe/latest', async (req, res) => {
  try {
    console.log('--- GET /api/recipe/latest --- session:', req.session && { userId: req.session.userId });
    const userId = req.session && req.session.userId;

    let recipe = null;
    if (userId) {
      recipe = await Recipe.findOne({ userId }).sort({ createdAt: -1 }).lean();
      console.log('by userId found?', !!recipe);
    }

    if (!recipe) {
      // fallback: prendi l'ultima ricetta (globale) se non ci sono ricette con userId
      recipe = await Recipe.findOne({}).sort({ createdAt: -1 }).lean();
      console.log('fallback global latest found?', !!recipe);
    }

    if (!recipe) return res.status(404).json({ error: 'nessuna ricetta' });

    // helper che normalizza una "sezione" (può essere stringa=imageUrl o oggetto)
    const normalizeSection = (sec) => {
      if (!sec) return { titolo: '', ingredienti: '', descrizione: '', imageUrl: '' };
      if (typeof sec === 'string') {
        return { titolo: '', ingredienti: '', descrizione: '', imageUrl: sec };
      }
      // sec è oggetto: estrai campi attesi, con fallback
      return {
        titolo: sec.titolo || sec.title || '',
        ingredienti: sec.ingredienti || sec.ingredients || '',
        descrizione: sec.descrizione || sec.description || '',
        imageUrl: sec.imageUrl || sec.pdfUrl || (typeof sec === 'string' ? sec : '') || ''
      };
    };

    const primo = normalizeSection(recipe.primo);
    const secondo = normalizeSection(recipe.secondo);
    const contorno = normalizeSection(recipe.contorno);

    return res.json({
      id: recipe._id,
      title: recipe.title || '',
      primo,
      secondo,
      contorno,
      ricetta: recipe.ricetta?.pdfUrl || (recipe.ricetta || null)
    });
  } catch (err) {
    console.error('Errore /api/recipe/latest', err);
    return res.status(500).json({ error: 'server error' });
  }
});

  // POST /salvaMenuR (pubblica e archivia)
  router.post('/salvaMenuR', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle } = req.body;
      let recipe = await Recipe.findOne({ title: recipeTitle });
      if (!recipe) return res.status(404).json({ success: false, error: 'Ricetta non trovata' });

      recipe.published = true;
      recipe.publishedAt = new Date();
      await recipe.save();

      // Copia in Archivio
      const archivioEntry = new Archivio({
        title: recipe.title,
        category: recipe.category,
        primo: recipe.primo,
        secondo: recipe.secondo,
        contorno: recipe.contorno,
        ricetta: recipe.ricetta
      });
      await archivioEntry.save();

      console.log(`✅ Menu pubblicato e archiviato: ${recipeTitle}`);
      return res.redirect(303, '/laboratorio_cucina');
    } catch (err) {
      console.error('Errore /salvaMenuR:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // Delete endpoints (finali) - rimuovono campi testuali ma non immagini
  router.post('/deletePrimoFinal', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle } = req.body;
      await Recipe.updateOne(
        { title: recipeTitle },
        { $set: { 'primo.titolo': '', 'primo.ingredienti': '', 'primo.descrizione': '' } }
      );
      return res.json({ success: true, step: 1 });
    } catch (err) {
      console.error('Errore /deletePrimoFinal:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/deleteSecondoFinal', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle } = req.body;
      await Recipe.updateOne(
        { title: recipeTitle },
        { $set: { 'secondo.titolo': '', 'secondo.ingredienti': '', 'secondo.descrizione': '' } }
      );
      return res.json({ success: true, step: 1 });
    } catch (err) {
      console.error('Errore /deleteSecondoFinal:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/deleteContornoFinal', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle } = req.body;
      await Recipe.updateOne(
        { title: recipeTitle },
        { $set: { 'contorno.titolo': '', 'contorno.ingredienti': '', 'contorno.descrizione': '' } }
      );
      return res.json({ success: true, step: 1 });
    } catch (err) {
      console.error('Errore /deleteContornoFinal:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  router.post('/deleteRicettaFinal', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle } = req.body;
      await Recipe.updateOne({ title: recipeTitle }, { $unset: { 'ricetta.pdfUrl': '' } });
      return res.json({ success: true });
    } catch (err) {
      console.error('Errore /deleteRicettaFinal:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  return router;
};
console.log('ROUTER cucinaInsert montato');


