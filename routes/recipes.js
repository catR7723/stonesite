const express = require('express');
const router = express.Router();
const { Recipe, Archivio } = require('../models/Recipes');

// ✅ GET - Carica ultima ricetta pubblicata
router.get('/recipe/latest/published', async (req, res) => {
  try {
    const recipe = await Recipe.findOne({ published: true }).sort({ publishedAt: -1 });
    if (!recipe) {
      return res.status(404).json({ error: 'Nessuna ricetta pubblicata' });
    }
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET - Carica ricetta per titolo
router.get('/recipe/:title', async (req, res) => {
  try {
    const recipe = await Recipe.findOne({ 
      title: decodeURIComponent(req.params.title) 
    });
    if (!recipe) {
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ POST - Archivia ricetta corrente
router.post('/recipe/archive', async (req, res) => {
  try {
    const { recipe } = req.body;

    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'Ricetta incompleta' });
    }

    const archiviata = new Archivio({
      title: recipe.title,
      category: recipe.category,
      primo: recipe.primo,
      secondo: recipe.secondo,
      contorno: recipe.contorno,
      ricetta: recipe.ricetta
    });

    await archiviata.save();
    console.log('✅ Ricetta archiviata:', recipe.title);

    res.json({ success: true, message: 'Ricetta archiviata con successo' });
  } catch (err) {
    console.error('❌ Errore nell\'archiviazione:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ POST - Ripristina ricetta da archivio
router.post('/recipe/restore/:id', async (req, res) => {
  try {
    const archiviata = await Archivio.findById(req.params.id);
    if (!archiviata) {
      return res.status(404).json({ error: 'Ricetta archivio non trovata' });
    }

    const corrente = await Recipe.findOne({ published: true });
    if (corrente) {
      const nuovaArchiviata = new Archivio({
        title: corrente.title,
        category: corrente.category,
        primo: corrente.primo,
        secondo: corrente.secondo,
        contorno: corrente.contorno,
        ricetta: corrente.ricetta
      });
      await nuovaArchiviata.save();
      await Recipe.deleteOne({ _id: corrente._id });
    }

    const nuovaRicetta = new Recipe({
      title: archiviata.title,
      category: archiviata.category,
      primo: archiviata.primo,
      secondo: archiviata.secondo,
      contorno: archiviata.contorno,
      ricetta: archiviata.ricetta,
      published: true,
      publishedAt: new Date()
    });
    await nuovaRicetta.save();

    await Archivio.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Ricetta ripristinata' });
  } catch (err) {
    console.error('❌ Errore nel ripristino:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET - Carica archivio ricette
router.get('/archivio', async (req, res) => {
  try {
    const archiviate = await Archivio.find()
      .sort({ archiviataIl: -1 })
      .limit(100);
    
    console.log(`📚 Archivio caricato: ${archiviate.length} ricette`);
    res.json(archiviate);
  } catch (err) {
    console.error('❌ Errore nel caricamento archivio:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ DELETE - Elimina ricetta da archivio
router.delete('/archivio/:id', async (req, res) => {
  try {
    const archiviata = await Archivio.findById(req.params.id);
    if (!archiviata) {
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }

    await Archivio.findByIdAndDelete(req.params.id);
    console.log('🗑️ Ricetta eliminata dall\'archivio:', archiviata.title);
    
    res.json({ success: true, message: 'Ricetta eliminata dall\'archivio' });
  } catch (err) {
    console.error('❌ Errore nell\'eliminazione:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;