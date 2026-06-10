const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const cheerio = require('cheerio'); 
const fs = require('fs/promises');
const cloudinary = require('cloudinary').v2;
const Recipe = require('../models/Recipe');


// Configurazione Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ===== ROTTE DI VISUALIZZAZIONE =====
router.get('/centro', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'centro.html'));
});

router.get('/cucinaInsert', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'cucinaInsert.html'));
});
router.get('/cineforumInsert', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cineforumInsert.html'));
});

router.get('/stone', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

router.get('/cucina', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'cucina.html'));
});

router.get('/chi_siamo', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'chi_siamo.html'));
});

router.get('/cicala', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'cicala.html'));
});

router.get('/menu', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'menu.html'));
});

router.get('/soliShop', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'solishop.html'));
});

router.get('/soon_ava', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'soon_ava.html'));
});

router.get('/virtualCity', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'html', 'virtualcity.html'));
});

router.get('/artistico', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/artistico.html'));
});

router.get('/cineforum', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/cineforum.html'));
});

router.get('/ginnastica', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/ginnastica.html'));
});

router.get('/informatica', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/informatica.html'));
});

router.get('/lettura', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/lettura.html'));
});

router.get('/musica_passiva', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/musica_passiva.html'));
});

router.get('/musicoterapia', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/musicoterapia.html'));
});

router.get('/piscina', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/piscina.html'));
});

router.get('/scrittura', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/scrittura.html'));
});

router.get('/walking', (req, res) => {
    res.sendFile(path.join(__dirname, '../views/html/laboratori/walking.html'));
});

// ===== API RICETTA =====
router.get('/api/recipe/:title', async (req, res) => {
  try {
    const title = req.params.title;
    const recipe = await Recipe.findOne({ title: title });
    
    if (!recipe) {
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }
    
    res.json(recipe);
  } catch (error) {
    console.error('Errore nel recupero della ricetta:', error);
    res.status(500).json({ error: error.message });
  }
});
router.get('/api/recipe/latest/published', async (req, res) => {
  try {
    const recipe = await Recipe.findOne({ published: true }).sort({ publishedAt: -1 });
    
    if (!recipe) {
      return res.status(404).json({ error: 'Nessun menu pubblicato' });
    }
    
    res.json(recipe);
  } catch (error) {
    console.error('Errore nel recupero del menu:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== UPLOAD IMMAGINI =====

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const uploadCucina = upload.fields([
  { name: 'primo', maxCount: 1 },
  { name: 'secondo', maxCount: 1 },
  { name: 'contorno', maxCount: 1 },
  { name: 'ricetta', maxCount: 1 }
]);

router.post('/cucinaInsert', uploadCucina, async (req, res) => {
  try {
    const files = req.files;
    const recipeTitle = req.body.recipeTitle || 'menu_' + Date.now();

    if (!files || !files['primo'] || !files['secondo'] || !files['contorno'] || !files['ricetta']) {
      return res.status(400).json({ success: false, error: 'Tutti i campi sono obbligatori' });
    }

    const ricettaFile = files['ricetta'][0];
    const isPdf = ricettaFile.mimetype === 'application/pdf' || ricettaFile.originalname.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      return res.status(400).json({ success: false, error: 'Il file della ricetta deve essere un PDF' });
    }

    const uploadToCloudinary = async (fileBuffer, fileName, resourceType = 'image') => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
          resource_type: resourceType,
          public_id: `cucina/${recipeTitle}/${fileName.replace(/\.[^.]+$/, '')}`,
          folder: `cucina/${recipeTitle}`
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        
        uploadStream.end(fileBuffer);
      });
    };

    const [primoResult, secondoResult, contornoResult, ricettaResult] = await Promise.all([
      uploadToCloudinary(files['primo'][0].buffer, 'primo.jpg', 'image'),
      uploadToCloudinary(files['secondo'][0].buffer, 'secondo.jpg', 'image'),
      uploadToCloudinary(files['contorno'][0].buffer, 'contorno.jpg', 'image'),
      uploadToCloudinary(files['ricetta'][0].buffer, 'ricetta.pdf', 'raw')
    ]);

    let recipe = await Recipe.findOne({ title: recipeTitle });
    
    if (!recipe) {
      recipe = new Recipe({
        title: recipeTitle,
        primo: { imageUrl: primoResult.secure_url },
        secondo: { imageUrl: secondoResult.secure_url },
        contorno: { imageUrl: contornoResult.secure_url },
        ricetta: { pdfUrl: ricettaResult.secure_url }
      });
    } else {
      recipe.primo.imageUrl = primoResult.secure_url;
      recipe.secondo.imageUrl = secondoResult.secure_url;
      recipe.contorno.imageUrl = contornoResult.secure_url;
      recipe.ricetta.pdfUrl = ricettaResult.secure_url;
    }
    
    await recipe.save();

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== LOGOUT =====

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log('errore', err);
      return res.redirect('/cucinaInsert');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

// ===== SALVA PRIMO =====

router.post('/salvaPrimo', async (req, res) => {
  try {
    const { recipeTitle, titolo_Primo, ingredienti_Primo, descrizione_Primo } = req.body;

    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (!recipe) {
      recipe = new Recipe({ 
        title: recipeTitle,
        primo: {},
        secondo: {},
        contorno: {},
        ricetta: {}
      });
    }

    recipe.primo = {
      ...recipe.primo,
      titolo: titolo_Primo,
      ingredienti: ingredienti_Primo,
      descrizione: descrizione_Primo
    };
    recipe.updatedAt = new Date();
    await recipe.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== SALVA SECONDO =====

router.post('/salvaSecondo', async (req, res) => {
  try {
    const { recipeTitle, titolo_Secondo, ingredienti_Secondo, descrizione_Secondo } = req.body;

    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (!recipe) {
      recipe = new Recipe({ 
        title: recipeTitle,
        primo: {},
        secondo: {},
        contorno: {},
        ricetta: {}
      });
    }

    recipe.secondo = {
      ...recipe.secondo,
      titolo: titolo_Secondo,
      ingredienti: ingredienti_Secondo,
      descrizione: descrizione_Secondo
    };
    recipe.updatedAt = new Date();
    await recipe.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== SALVA CONTORNO =====

router.post('/salvaContorno', async (req, res) => {
  try {
    const { recipeTitle, titolo_Contorno, ingredienti_Contorno, descrizione_Contorno } = req.body;

    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (!recipe) {
      recipe = new Recipe({ 
        title: recipeTitle,
        primo: {},
        secondo: {},
        contorno: {},
        ricetta: {}
      });
    }

    recipe.contorno = {
      ...recipe.contorno,
      titolo: titolo_Contorno,
      ingredienti: ingredienti_Contorno,
      descrizione: descrizione_Contorno
    };
    recipe.updatedAt = new Date();
    await recipe.save();

    res.json({ success: true });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE IMMAGINE PRIMO =====

router.post('/deleteImmaginePrimo', async (req, res) => {
  try {
    const { recipeTitle } = req.body;
    
    try {
      await cloudinary.uploader.destroy(`cucina/${recipeTitle}/primo`, { resource_type: 'image' });
    } catch (err) {
      console.log('Immagine primo non trovata');
    }
    
    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.primo = {
        ...recipe.primo,
        imageUrl: ''
      };
      await recipe.save();
    }
    
    res.json({ success: true, message: 'Immagine primo eliminata!' });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE IMMAGINE SECONDO =====

router.post('/deleteImmmagineSecondo', async (req, res) => {
  try {
    const { recipeTitle } = req.body;
    
    try {
      await cloudinary.uploader.destroy(`cucina/${recipeTitle}/secondo`, { resource_type: 'image' });
    } catch (err) {
      console.log('Immagine secondo non trovata');
    }
    
    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.secondo = {
        ...recipe.secondo,
        imageUrl: ''
      };
      await recipe.save();
    }
    
    res.json({ success: true, message: 'Immagine secondo eliminata!' });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE IMMAGINE CONTORNO =====

router.post('/deleteImmmagineContorno', async (req, res) => {
  try {
    const { recipeTitle } = req.body;
    
    try {
      await cloudinary.uploader.destroy(`cucina/${recipeTitle}/contorno`, { resource_type: 'image' });
    } catch (err) {
      console.log('Immagine contorno non trovata');
    }
    
    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.contorno = {
        ...recipe.contorno,
        imageUrl: ''
      };
      await recipe.save();
    }
    
    res.json({ success: true, message: 'Immagine contorno eliminata!' });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== UPLOAD SINGOLA IMMAGINE =====

const uploadSingleImage = upload.single('immagine');

// Upload nuova immagine Primo
router.post('/uploadNuovaImmaginePrimo', uploadSingleImage, async (req, res) => {
  try {
    const { recipeTitle } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Nessuna immagine fornita' });
    }

    const uploadToCloudinary = async (fileBuffer, fileName) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
          resource_type: 'image',
          public_id: `cucina/${recipeTitle}/${fileName.replace(/\.[^.]+$/, '')}`,
          folder: `cucina/${recipeTitle}`
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        
        uploadStream.end(fileBuffer);
      });
    };

    const result = await uploadToCloudinary(req.file.buffer, 'primo.jpg');

    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.primo = {
        ...recipe.primo,
        imageUrl: result.secure_url
      };
      await recipe.save();
    }

    res.json({ success: true, imageUrl: result.secure_url });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload nuova immagine Secondo
router.post('/uploadNuovaImmmagineSecondo', uploadSingleImage, async (req, res) => {
  try {
    const { recipeTitle } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Nessuna immagine fornita' });
    }

    const uploadToCloudinary = async (fileBuffer, fileName) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
          resource_type: 'image',
          public_id: `cucina/${recipeTitle}/${fileName.replace(/\.[^.]+$/, '')}`,
          folder: `cucina/${recipeTitle}`
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        
        uploadStream.end(fileBuffer);
      });
    };

    const result = await uploadToCloudinary(req.file.buffer, 'secondo.jpg');

    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.secondo = {
        ...recipe.secondo,
        imageUrl: result.secure_url
      };
      await recipe.save();
    }

    res.json({ success: true, imageUrl: result.secure_url });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload nuova immagine Contorno
router.post('/uploadNuovaImmmagineContorno', uploadSingleImage, async (req, res) => {
  try {
    const { recipeTitle } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Nessuna immagine fornita' });
    }

    const uploadToCloudinary = async (fileBuffer, fileName) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
          resource_type: 'image',
          public_id: `cucina/${recipeTitle}/${fileName.replace(/\.[^.]+$/, '')}`,
          folder: `cucina/${recipeTitle}`
        }, (error, result) => {
          if (error) reject(error);
          else resolve(result);
        });
        
        uploadStream.end(fileBuffer);
      });
    };

    const result = await uploadToCloudinary(req.file.buffer, 'contorno.jpg');

    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.contorno = {
        ...recipe.contorno,
        imageUrl: result.secure_url
      };
      await recipe.save();
    }

    res.json({ success: true, imageUrl: result.secure_url });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== CANCELLA PRIMO DAL FORM (Step 3) =====

router.post('/deletePrimoFinal', async (req, res) => {
  try {
    const { recipeTitle } = req.body;
    
    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.primo = {
        titolo: '',
        ingredienti: '',
        descrizione: '',
        imageUrl: recipe.primo?.imageUrl || ''
      };
      await recipe.save();
    }
    
    res.json({ success: true, step: 3 });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== CANCELLA SECONDO DAL FORM (Step 4) =====

router.post('/deleteSecondoFinal', async (req, res) => {
  try {
    const { recipeTitle } = req.body;
    
    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.secondo = {
        titolo: '',
        ingredienti: '',
        descrizione: '',
        imageUrl: recipe.secondo?.imageUrl || ''
      };
      await recipe.save();
    }
    
    res.json({ success: true, step: 4 });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== CANCELLA CONTORNO DAL FORM (Step 5) =====

router.post('/deleteContornoFinal', async (req, res) => {
  try {
    const { recipeTitle } = req.body;
    
    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.contorno = {
        titolo: '',
        ingredienti: '',
        descrizione: '',
        imageUrl: recipe.contorno?.imageUrl || ''
      };
      await recipe.save();
    }
    
    res.json({ success: true, step: 5 });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== DELETE RICETTA PDF =====

router.post('/deleteRicettaFinal', async (req, res) => {
  try {
    const { recipeTitle } = req.body;
    
    try {
      await cloudinary.uploader.destroy(`cucina/${recipeTitle}/ricetta`, { resource_type: 'raw' });
    } catch (err) {
      console.log('PDF ricetta non trovato');
    }
    
    let recipe = await Recipe.findOne({ title: recipeTitle });
    if (recipe) {
      recipe.ricetta = {
        pdfUrl: ''
      };
      await recipe.save();
    }
    
    res.json({ success: true, message: 'Ricetta eliminata con successo!' });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== SALVA MENU =====

router.post('/salvaMenu', async (req, res) => {
  try {
    const recipeTitle = req.body.recipeTitle || 'menu_' + Date.now();
    
    const recipe = await Recipe.findOne({ title: recipeTitle });
    
    if (!recipe) {
      return res.send(`
        <script>
          alert("Errore: Ricetta non trovata!");
          window.history.back();
        </script>
      `);
    }

    recipe.savedAt = new Date();
    await recipe.save();

    // Torna a cucinaInsert ma con flag di menu salvato
    res.redirect('/cucinaInsert?menuSalvato=true&recipeTitle=' + encodeURIComponent(recipeTitle));

  } catch (error) {
    console.error("Errore durante il salvataggio del menu:", error);
    res.send(`
      <script>
        alert("Errore: ${error.message}");
        window.history.back();
      </script>
    `);
  }
});

// ===== PUBBLICA MENU =====

router.post('/salvaMenuR', async (req, res) => {
  try {
    const recipeTitle = req.body.recipeTitle || 'menu_' + Date.now();
    
    const recipe = await Recipe.findOne({ title: recipeTitle });
    
    if (!recipe) {
      return res.send(`
        <script>
          alert("Errore: Ricetta non trovata!");
          window.history.back();
        </script>
      `);
    }

    recipe.published = true;
    recipe.publishedAt = new Date();
    await recipe.save();

    res.send(`
      <script>
        alert("Menu pubblicato con successo!");
        window.location.href = "/cucinaInsert";
      </script>
    `);

  } catch (error) {
    console.error("Errore durante la pubblicazione del menu:", error);
    res.send(`
      <script>
        alert("Errore: ${error.message}");
        window.history.back();
      </script>
    `);
  }
});

module.exports = router;









