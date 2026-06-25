const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const cheerio = require('cheerio'); 
const fs = require('fs/promises');
const cloudinary = require('cloudinary').v2;
const { Recipe, Archivio } = require('../models/Recipes');


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

// routes/cucinaInsert.js

// Assicurati che ci sia il pezzo ":recipeTitle" nell'URL
router.get('/getImageUrls/:recipeTitle', async (req, res) => {
  try {
    // Recuperiamo il titolo dall'URL usando req.params
    const titleToFind = req.params.recipeTitle;
    
    // Cerchiamo nel database
    const recipe = await Recipe.findOne({ title: titleToFind });
    
    // 💡 SE LA RICETTA NON ESISTE ANCORA:
    // Non inviare un errore 404! Invia un oggetto vuoto con stato 200 (OK)
    if (!recipe) {
      return res.json({
        success: true,
        primo: '', primo_titolo: '', primo_ingredienti: '', primo_descrizione: '',
        secondo: '', secondo_titolo: '', secondo_ingredienti: '', secondo_descrizione: '',
        contorno: '', contorno_titolo: '', contorno_ingredienti: '', contorno_descrizione: '',
        ricetta: ''
      });
    }
    
    // SE LA RICETTA ESISTE: inviamo i dati reali al frontend
    res.json({
      success: true,
      primo: recipe.primo?.imageUrl || '',
      primo_titolo: recipe.primo?.titolo || '',
      primo_ingredienti: recipe.primo?.ingredienti || '',
      primo_descrizione: recipe.primo?.descrizione || '',
      
      secondo: recipe.secondo?.imageUrl || '',
      secondo_titolo: recipe.secondo?.titolo || '',
      secondo_ingredienti: recipe.secondo?.ingredienti || '',
      secondo_descrizione: recipe.secondo?.descrizione || '',
      
      contorno: recipe.contorno?.imageUrl || '',
      contorno_titolo: recipe.contorno?.titolo || '',
      contorno_ingredienti: recipe.contorno?.ingredienti || '',
      contorno_descrizione: recipe.contorno?.descrizione || '',
      
      ricetta: recipe.ricetta?.pdfUrl || ''
    });

  } catch (error) {
    console.error("Errore recupero immagini:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});


// ===== RICETTA =====

// ✅ QUESTO DEVE ESSERE PRIMA DI /recipe/:title
router.get('/getImageUrls/:recipeTitle', async (req, res) => {
  try {
    const { recipeTitle } = req.params;
    console.log('📖 Recupero dati per:', recipeTitle);
    
    const recipe = await Recipe.findOne({ title: recipeTitle });
    
    if (!recipe) {
      console.log('⚠️ Ricetta non trovata:', recipeTitle);
      return res.status(404).json({ error: 'Ricetta non trovata' });
    }

    console.log('✅ Ricetta trovata, URL immagini:', {
      primo: recipe.primo?.imageUrl ? '✅' : '❌',
      secondo: recipe.secondo?.imageUrl ? '✅' : '❌',
      contorno: recipe.contorno?.imageUrl ? '✅' : '❌'
    });

    res.json({
      primo: recipe.primo?.imageUrl || '',
      secondo: recipe.secondo?.imageUrl || '',
      contorno: recipe.contorno?.imageUrl || ''
    });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/recipe/latest/published', async (req, res) => {
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

router.get('/recipe/:title', async (req, res) => {
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

    console.log('📸 DEBUG STEP 1: recipeTitle =', recipeTitle);
    console.log('📸 DEBUG STEP 2: files ricevuti =', files ? Object.keys(files) : 'NESSUN FILE');
    console.log('📸 DEBUG STEP 3: Cloudinary config =', {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '✅' : '❌',
      api_key: process.env.CLOUDINARY_API_KEY ? '✅' : '❌',
      api_secret: process.env.CLOUDINARY_API_SECRET ? '✅' : '❌'
    });

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
    console.log(`📤 Inizio upload: ${fileName} (tipo: ${resourceType})`);
    
    const uploadStream = cloudinary.uploader.upload_stream({
      resource_type: resourceType,
      public_id: `cucina/${recipeTitle}/${fileName.replace(/\.[^.]+$/, '')}`,
      
    }, (error, result) => {
      if (error) {
        console.error(`❌ ERRORE upload ${fileName}:`, error.message);
        reject(error);
      }
  else {
    console.log(`✅ Upload riuscito ${fileName}`);
    console.log('   public_id:', result.public_id);
    console.log('   secure_url:', result.secure_url);
    console.log('   version:', result.version);
    resolve(result);
      }
    });
    
    uploadStream.end(fileBuffer);
  });
};

    console.log('📸 DEBUG STEP 4: Inizio upload parallelo...');
    const [primoResult, secondoResult, contornoResult, ricettaResult] = await Promise.all([
      uploadToCloudinary(files['primo'][0].buffer, 'primo.jpg', 'image'),
      uploadToCloudinary(files['secondo'][0].buffer, 'secondo.jpg', 'image'),
      uploadToCloudinary(files['contorno'][0].buffer, 'contorno.jpg', 'image'),
      uploadToCloudinary(files['ricetta'][0].buffer, 'ricetta.pdf', 'raw')
    ]);

    console.log('📸 DEBUG STEP 5: Upload completato, salvataggio DB...');

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
    console.log('📸 DEBUG STEP 6: DB salvato');

    // 🆕 SALVA GLI URL IN UN FILE JSON PER LE ANTEPRIME
    const imageUrls = {
      primo: primoResult.secure_url,
      secondo: secondoResult.secure_url,
      contorno: contornoResult.secure_url,
      ricetta: ricettaResult.secure_url,
      recipeTitle: recipeTitle
    };
/*
    // Crea la cartella se non esiste
    const uploadDir = path.join(__dirname, '..', 'uploads', 'cucina');
    await fs.mkdir(uploadDir, { recursive: true });

    // Salva il JSON
    const jsonPath = path.join(uploadDir, `${recipeTitle}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(imageUrls, null, 2));

    console.log('📸 DEBUG STEP 7: JSON salvato in', jsonPath);

    */
   
    console.log('✅ UPLOAD COMPLETATO CON SUCCESSO');

    res.json({ success: true, images: imageUrls });

  } catch (error) {
    console.error('❌ ERRORE GENERALE:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
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
    
    res.json({ success: true, step: 1 });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: error.message });
  }
});

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

    // ✅ ARCHIVIA E COPIA RICETTA PRECEDENTE SE ESISTE
    const ricettaPrecedente = await Recipe.findOne({ published: true, title: { $ne: recipeTitle } });
    if (ricettaPrecedente) {
      console.log('🔄 Archiviazione ricetta precedente:', ricettaPrecedente.title);
      
      // 🆕 COPIA IMMAGINI DA CLOUDINARY DA cucina/ A archivio/
      const copyImageToArchive = async (imageUrl, fileName, resourceType = 'image') => {
        if (!imageUrl) return null;
        
        try {
          // Scarica l'immagine da Cloudinary
          const response = await fetch(imageUrl);
          const buffer = await response.buffer();

          // Riaggiungi a Cloudinary nella cartella archivio
          return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream({
              resource_type: resourceType,
              public_id: `archivio/${ricettaPrecedente.title}/${fileName.replace(/\.[^.]+$/, '')}`,
            }, (error, result) => {
              if (error) {
                console.error(`❌ Errore copia immagine ${fileName}:`, error.message);
                resolve(null);
              } else {
                console.log(`✅ Immagine copiata in archivio: ${fileName}`);
                resolve(result.secure_url);
              }
            });
            uploadStream.end(buffer);
          });
        } catch (err) {
          console.error(`⚠️ Errore nel copiare immagine ${fileName}:`, err.message);
          return null;
        }
      };

      console.log('📦 Inizio copia immagini in archivio...');
      const [primoUrl, secondoUrl, contornoUrl, ricettaUrl] = await Promise.all([
        copyImageToArchive(ricettaPrecedente.primo?.imageUrl, 'primo.jpg', 'image'),
        copyImageToArchive(ricettaPrecedente.secondo?.imageUrl, 'secondo.jpg', 'image'),
        copyImageToArchive(ricettaPrecedente.contorno?.imageUrl, 'contorno.jpg', 'image'),
        copyImageToArchive(ricettaPrecedente.ricetta?.pdfUrl, 'ricetta.pdf', 'raw')
      ]);

      // Salva in Archivio
      const archiviata = new Archivio({
        title: ricettaPrecedente.title,
        category: ricettaPrecedente.category,
        primo: {
          ...ricettaPrecedente.primo,
          imageUrl: primoUrl || ricettaPrecedente.primo?.imageUrl
        },
        secondo: {
          ...ricettaPrecedente.secondo,
          imageUrl: secondoUrl || ricettaPrecedente.secondo?.imageUrl
        },
        contorno: {
          ...ricettaPrecedente.contorno,
          imageUrl: contornoUrl || ricettaPrecedente.contorno?.imageUrl
        },
        ricetta: {
          ...ricettaPrecedente.ricetta,
          pdfUrl: ricettaUrl || ricettaPrecedente.ricetta?.pdfUrl
        }
      });
      
      await archiviata.save();
      console.log('✅ Ricetta archiviata:', ricettaPrecedente.title);

      // 🆕 ELIMINA IMMAGINI DA CLOUDINARY DALLA CARTELLA cucina/
      const deleteImageFromCucina = async (imageUrl, fileName, resourceType = 'image') => {
        if (!imageUrl) return;
        
        try {
          await cloudinary.uploader.destroy(`cucina/${ricettaPrecedente.title}/${fileName.replace(/\.[^.]+$/, '')}`, { 
            resource_type: resourceType 
          });
          console.log(`✅ Immagine eliminata da cucina: ${fileName}`);
        } catch (err) {
          console.error(`⚠️ Errore nell'eliminare immagine da cucina ${fileName}:`, err.message);
        }
      };

      console.log('🗑️ Inizio eliminazione immagini da cucina...');
      await Promise.all([
        deleteImageFromCucina(ricettaPrecedente.primo?.imageUrl, 'primo.jpg', 'image'),
        deleteImageFromCucina(ricettaPrecedente.secondo?.imageUrl, 'secondo.jpg', 'image'),
        deleteImageFromCucina(ricettaPrecedente.contorno?.imageUrl, 'contorno.jpg', 'image'),
        deleteImageFromCucina(ricettaPrecedente.ricetta?.pdfUrl, 'ricetta.pdf', 'raw')
      ]);

      console.log('✅ Immagini eliminate da cucina');
      
      // Rimuovi quella vecchia dalla collezione Recipe
      await Recipe.deleteOne({ _id: ricettaPrecedente._id });
    }

    // ✅ PUBBLICA LA NUOVA RICETTA
    recipe.published = true;
    recipe.publishedAt = new Date();
    await recipe.save();

    res.send(`
      <script>
        alert("Menu pubblicato con successo!");
        window.location.href = "/cucina";
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


// ===== ARCHIVIO RICETTE =====

// ✅ POST - Archivia ricetta corrente
router.post('/recipe/archive', async (req, res) => {
  try {
    const { recipe } = req.body;

    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'Ricetta incompleta' });
    }

    const { Archivio } = require('../models/Recipes');

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
    const { Archivio } = require('../models/Recipes');

    const archiviata = await Archivio.findById(req.params.id);
    if (!archiviata) {
      return res.status(404).json({ error: 'Ricetta archivio non trovata' });
    }

    // Archiva ricetta corrente se esiste
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
      console.log('✅ Ricetta corrente archiviata');
      
      await Recipe.deleteOne({ _id: corrente._id });
    }

    // Ripristina da archivio
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
    console.log('✅ Ricetta ripristinata:', archiviata.title);

    await Archivio.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Ricetta ripristinata' });
  } catch (err) {
    console.error('❌ Errore nel ripristino:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET - Carica archivio ricette
router.get('/archivio-api', async (req, res) => {
  try {
    const { Archivio } = require('../models/Recipes');

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
    const { Archivio } = require('../models/Recipes');

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

// ✅ GET - Serve la pagina archivio
router.get('/archivio', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'html', 'archivio.html'));
});

module.exports = router;
