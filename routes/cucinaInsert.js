const express = require('express');
const path = require('path');
const { Recipe, Archivio } = require('../models/Recipes');

module.exports = (upload, cloudinary) => {
  const router = express.Router();

  // Helper: rimuove tutti i documenti Recipe con title diverso da `title`
  // Logga gli _id rimossi per poterli tracciare in caso di bisogno.
  async function cleanupOtherRecipes(title) {
    try {
      if (!title) return;
      // trova i documenti che NON corrispondono al title
      const others = await Recipe.find({ title: { $ne: title } }, '_id title').lean();
      if (!others || others.length === 0) {
        console.log('cleanupOtherRecipes: nessun documento da rimuovere per title !=', title);
        return;
      }
      const ids = others.map(o => o._id);
      // elimina per _id (più sicuro se ci sono indici/alias strani su title)
      await Recipe.deleteMany({ _id: { $in: ids } });
      console.log(`✅ Pulizia Recipe: rimossi ${ids.length} documenti con title != "${title}" -> ids:`, ids);
    } catch (err) {
      console.error('Errore cleanupOtherRecipes:', err);
    }
  }

  // Middleware: verifica permessi per "cucina"
  function ensureCucinaAllowed(req, res, next) {
    if (req.session && req.session.authenticated &&
        (req.session.allowedPage === 'cucina' || req.session.allowedPage === 'both')) {
      return next();
    }
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
      { name: 'piattoUnico', maxCount: 1 }, // ➕ Campo Piatto Unico
      { name: 'ricetta', maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        const { recipeTitle, isPiattoUnico } = req.body;
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
        if (req.files?.piattoUnico?.[0]) {
          const r = await uploadToCloudinary(req.files.piattoUnico[0].buffer, `piattoUnico_${Date.now()}`, recipeTitle, 'image');
          images.piattoUnico = r.secure_url;
          console.log(`✅ Piatto Unico uploaded: ${images.piattoUnico}`);
        }
        if (req.files?.ricetta?.[0]) {
          const r = await uploadToCloudinary(req.files.ricetta[0].buffer, `ricetta_${Date.now()}`, recipeTitle, 'raw');
          images.ricetta = r.secure_url;
          console.log(`✅ Ricetta uploaded: ${images.ricetta}`);
        }

        // Salva gli URL e il flag su MongoDB
        let recipe = await Recipe.findOne({ title: recipeTitle });
        if (!recipe) {
          recipe = new Recipe({ title: recipeTitle, userId: req.session && req.session.userId });
        } else if (!recipe.userId && req.session && req.session.userId) {
          recipe.userId = req.session.userId;
        }

        recipe.isPiattoUnico = isPiattoUnico === 'true' || isPiattoUnico === true;

        if (images.primo) recipe.primo = { ...recipe.primo, imageUrl: images.primo };
        if (images.secondo) recipe.secondo = { ...recipe.secondo, imageUrl: images.secondo };
        if (images.contorno) recipe.contorno = { ...recipe.contorno, imageUrl: images.contorno };
        if (images.piattoUnico) recipe.piattoUnico = { ...recipe.piattoUnico, imageUrl: images.piattoUnico };
        if (images.ricetta) recipe.ricetta = { pdfUrl: images.ricetta };

        recipe.updatedAt = new Date();
        await recipe.save();

        // pulizia: rimuove tutti i documenti con titolo diverso dall'attuale
        await cleanupOtherRecipes(recipe.title);

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

      // pulizia collettiva (rimuove altri title diversi)
      await cleanupOtherRecipes(recipe.title);

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

      // pulizia collettiva (rimuove altri title diversi)
      await cleanupOtherRecipes(recipe.title);

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

      // pulizia collettiva (rimuove altri title diversi)
      await cleanupOtherRecipes(recipe.title);

      return res.json({ success: true, message: 'Contorno salvato' });
    } catch (err) {
      console.error('Errore /salvaContorno:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // POST /salvaPiattoUnico (CORRETTO)
router.post('/salvaPiattoUnico', ensureCucinaAllowed, async (req, res) => {
  try {
    const { 
      recipeTitle, 
      titolo_PiattoUnico, 
      ingredienti_PiattoUnico, 
      descrizione_PiattoUnico,
      imageUrl_PiattoUnico  // ✅ AGGIUNGI QUESTA LINEA
    } = req.body;

    console.log('📨 [salvaPiattoUnico] Ricevuti dal frontend:', {
      recipeTitle,
      titolo_PiattoUnico,
      ingredienti_PiattoUnico: ingredienti_PiattoUnico?.substring(0, 30),
      descrizione_PiattoUnico: descrizione_PiattoUnico?.substring(0, 30),
      imageUrl_PiattoUnico  // ✅ AGGIUNGI ANCHE QUI NEL LOG
    });
    
    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (!recipe) {
      recipe = new Recipe({ title: recipeTitle, userId: req.session && req.session.userId });
    } else if (!recipe.userId && req.session && req.session.userId) {
      recipe.userId = req.session.userId;
    }

    recipe.isPiattoUnico = true;
    
    recipe.piattoUnico = {
      titolo: titolo_PiattoUnico || '',
      ingredienti: ingredienti_PiattoUnico || '',
      descrizione: descrizione_PiattoUnico || '',
      imageUrl: imageUrl_PiattoUnico || ''  // ✅ USA imageUrl_PiattoUnico
    };
    
    recipe.updatedAt = new Date();
    await recipe.save();

    await cleanupOtherRecipes(recipe.title);

    console.log('✅ Piatto Unico salvato:', {
      titolo: recipe.piattoUnico.titolo,
      ingredienti: recipe.piattoUnico.ingredienti?.substring(0, 30),
      descrizione: recipe.piattoUnico.descrizione?.substring(0, 30),
      imageUrl: recipe.piattoUnico.imageUrl
    });

    return res.json({ success: true, message: 'Piatto Unico salvato' });
  } catch (err) {
    console.error('Errore /salvaPiattoUnico:', err);
    return res.status(500).json({ success: false, error: 'Errore server' });
  }
});

  // GET /api/recipe/latest -> restituisce l'ultima ricetta PUBBLICA
  router.get('/api/recipe/latest', async (req, res) => {
    try {
      console.log('--- GET /api/recipe/latest (PUBBLICA) --- session:', req.session && { userId: req.session.userId });
      const userId = req.session && req.session.userId;

      let recipe = null;

      // Supporta preview esplicita per l'autore/admin: /api/recipe/latest?preview=true
      if (req.query.preview === 'true' && userId) {
        // preview dell'ultima ricetta dell'utente (bozza inclusa)
        recipe = await Recipe.findOne({ userId }).sort({ createdAt: -1 }).lean();
      } else {
        // comportamento pubblico: ultima ricetta pubblicata
        recipe = await Recipe.findOne({ published: true }).sort({ publishedAt: -1, createdAt: -1 }).lean();
      }

      // fallback: se non troviamo ricette pubblicate (o preview), prendi l'ultima creata
      if (!recipe) {
        recipe = await Recipe.findOne({}).sort({ createdAt: -1 }).lean();
      }

      if (!recipe) return res.status(404).json({ error: 'nessuna ricetta' });

      // 🟢 Normalizzatore flessibile per ogni sezione
      const normalizeSection = (sec, sectionKey) => {
        // Se non esiste la sezione
        if (!sec) {
          // Tenta comunque di recuperare un'eventuale immagine appiattita nella root (es. recipe.primo_imageUrl)
          const rootImg = recipe[`${sectionKey}_imageUrl`] || recipe[`${sectionKey}Img`] || recipe[sectionKey] || '';
          const fallbackImg = typeof rootImg === 'string' ? rootImg : '';
          return { titolo: '', ingredienti: '', descrizione: '', imageUrl: fallbackImg };
        }

        // Se la sezione è salvata direttamente come stringa (solo URL immagine)
        if (typeof sec === 'string') {
          return { titolo: '', ingredienti: '', descrizione: '', imageUrl: sec };
        }

        // 🔍 Cerca l'URL dell'immagine in QUALSIASI proprietà possibile
        const imgUrl = sec.imageUrl || sec.url || sec.image || sec.path || sec.pdfUrl ||
                       recipe[`${sectionKey}_imageUrl`] || recipe[`${sectionKey}Img`] || '';

        return {
          titolo: sec.titolo || sec.title || recipe[`${sectionKey}_titolo`] || '',
          ingredienti: sec.ingredienti || sec.ingredients || recipe[`${sectionKey}_ingredienti`] || '',
          descrizione: sec.descrizione || sec.description || recipe[`${sectionKey}_descrizione`] || '',
          imageUrl: typeof imgUrl === 'string' ? imgUrl : ''
        };
      };

      // Passiamo sia l'oggetto che il nome della chiave ('primo', 'secondo', 'contorno', 'piattoUnico')
      const primo = normalizeSection(recipe.primo, 'primo');
      const secondo = normalizeSection(recipe.secondo, 'secondo');
      const contorno = normalizeSection(recipe.contorno, 'contorno');
      const piattoUnico = normalizeSection(recipe.piattoUnico, 'piattoUnico');

      return res.json({
        id: recipe._id,
        title: recipe.title || recipe.titolo || '',
        isPiattoUnico: recipe.isPiattoUnico || false,
        primo,
        secondo,
        contorno,
        piattoUnico,
        ricetta: recipe.ricetta?.pdfUrl || (typeof recipe.ricetta === 'string' ? recipe.ricetta : null)
      });

    } catch (err) {
      console.error('Errore /api/recipe/latest', err);
      return res.status(500).json({ error: 'server error' });
    }
  });

  // POST /salvaMenuR (pubblica e archivia) - aggiornata per pulire gli altri title dopo archiviazione
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
        isPiattoUnico: recipe.isPiattoUnico,
        primo: recipe.primo,
        secondo: recipe.secondo,
        contorno: recipe.contorno,
        piattoUnico: recipe.piattoUnico,
        ricetta: recipe.ricetta,
        archiviataIl: new Date()
      });
      await archivioEntry.save();

      // pulizia: mantieni solo i documenti con title == recipe.title
      await cleanupOtherRecipes(recipe.title);

      console.log(`✅ Menu pubblicato e archiviato: ${recipeTitle}`);
      return res.redirect(303, '/laboratorio_cucina');
    } catch (err) {
      console.error('Errore /salvaMenuR:', err);
      return res.status(500).json({ success: false, error: 'Errore server' });
    }
  });

  // Delete endpoints (finali)
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

  // POST /deletePiattoUnicoFinal (➕ NUOVO)
  router.post('/deletePiattoUnicoFinal', ensureCucinaAllowed, async (req, res) => {
    try {
      const { recipeTitle } = req.body;
      await Recipe.updateOne(
        { title: recipeTitle },
        { $set: { 'piattoUnico.titolo': '', 'piattoUnico.ingredienti': '', 'piattoUnico.descrizione': '' } }
      );
      return res.json({ success: true, step: 1 });
    } catch (err) {
      console.error('Errore /deletePiattoUnicoFinal:', err);
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

