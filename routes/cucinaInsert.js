
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const cheerio = require ('cheerio'); 
const fs = require('fs/promises');




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


// Usiamo la memoria per elaborare il file prima di salvarlo
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

        if (!files || !files['primo'] || !files['secondo'] || !files['contorno'] || !files['ricetta']) {
      return res.send(`
        <script>
          alert("Errore: Tutti i campi (primo, secondo, contorno e ricetta) sono obbligatori!");
          window.history.back();
        </script>
      `);
    }

    const ricettaFile = files['ricetta'][0];
    const isPdf = ricettaFile.mimetype === 'application/pdf' || ricettaFile.originalname.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      return res.send(`
        <script>
          alert("Errore: Il file della ricetta deve essere un PDF!");
          window.history.back();
        </script>
      `);
    }


        // Gestione PDF: mantiene nome originale completo (es. ricetta-nonna.pdf)
    const saveAsPdf = async (fileArray, fileName) => {
      if (fileArray && fileArray[0]) {
        const file = fileArray[0];
        // Usiamo il nome originale completo fornito dal browser
        const finalPath = path.join('uploads', fileName);
        // Scrittura diretta del buffer (usa fs.promises.writeFile)
        await fs.writeFile(finalPath, file.buffer);
        return finalPath;
      }
      return null;
    };

        // Gestione Immagini: mantiene nome originale + .jpg
const saveAsJpeg = async (fileArray, fileName) => {
   
    if (fileArray && fileArray[0]) {
        const file = fileArray[0]; // Estraiamo il singolo file dall'array di Multer
        
        // 2. Costruiamo il percorso ASSOLUTO (importante!)
       
        const finalPath = path.join(__dirname, '../uploads', fileName);

        try {
            
            await sharp(file.buffer)
                .toFormat('jpeg')
                .jpeg({ quality: 90 }) // Opzionale: garantisce la compressione corretta
                .toFile(finalPath);
            
            console.log(`Successo: ${fileName} salvato in JPEG`);
            return finalPath;
        } catch (err) {
            console.error(`Errore Sharp su ${fileName}:`, err.message);
            throw err;
        }
    } else {
        console.log(`Avviso: fileArray per ${fileName} è vuoto o non definito`);
        return null;
    }
};



    // Eseguiamo le operazioni per tutti i campi
    await Promise.all([
      saveAsJpeg(files['primo'], 'primo.jpg'),
      saveAsJpeg(files['secondo'], 'secondo.jpg'),
      saveAsJpeg(files['contorno'], 'contorno.jpg'),
      saveAsPdf(files['ricetta'], 'ricetta.pdf')
    ]);
  
    res.sendFile(path.join(__dirname, '../cucinaInsert.html'));

  } catch (error) {
    console.error(error);
    res.status(500).send("Errore durante il salvataggio dei file.");
  }
});

// Funzione universale per eliminare e reindirizzare
const deleteAndRedirect = async (filename, res) => {
    try {
        const filePath = path.join(__dirname, '../uploads', filename);
        await fs.unlink(filePath);
        console.log(`Successo: ${filename} rimosso.`);
    } catch (err) {
        // Ignoriamo solo se il file non esiste già (ENOENT)
        if (err.code !== 'ENOENT') {
            console.error(`Errore eliminazione ${filename}:`, err);
            return res.status(500).send("Errore nel server");
        }
    }
        res.send(`
        <script>
          alert("${filename} eliminato con successo!");
          window.location.href = "/cucinaInsert";
        </script>
        `);
    };

// Rotte specifiche
router.post('/deletePrimo', (req, res) => deleteAndRedirect('primo.jpg', res));
router.post('/deleteSecondo', (req, res) => deleteAndRedirect('secondo.jpg', res));
router.post('/deleteContorno', (req, res) => deleteAndRedirect('contorno.jpg', res));
router.post('/deleteRicetta', (req, res) => deleteAndRedirect('ricetta.pdf', res));




//sposta i file da uploads a menu_settimanale

router.post('/salvaMenu', async (req, res) => {
    const cartellaSorgente = path.join(__dirname, '../uploads');
    const cartellaDestinazione = path.join(__dirname, '../public/images/menu_settimanale');
    const pathHtmlCucinaInsert = path.join(__dirname, '../cucinaInsert.html');
    
    const filesDaSpostare = [
        'primo.jpg',
        'secondo.jpg',
        'contorno.jpg',
        'ricetta.pdf',
        'titolo_primo.txt',
        'ingredienti_primo.txt',
        'descrizione_primo.txt',
        'titolo_secondo.txt',
        'ingredienti_secondo.txt',
        'descrizione_secondo.txt',
        'titolo_contorno.txt',
        'ingredienti_contorno.txt',
        'descrizione_contorno.txt'
    ];

    try {
        // Assicurati che la cartella di destinazione esista
        await fs.mkdir(cartellaDestinazione, { recursive: true });

        // Sposta ogni file
        for (const nomeFile of filesDaSpostare) {
            const percorsoVecchio = path.join(cartellaSorgente, nomeFile);
            const percorsoNuovo = path.join(cartellaDestinazione, nomeFile);

            // Verifichiamo se il file esiste prima di spostarlo
            await fs.access(percorsoVecchio); 
            
 
            await fs.rename(percorsoVecchio, percorsoNuovo);
        }
        // 2. Svuotamento tag HTML con Cheerio
        const htmlContent = await fs.readFile(pathHtmlCucinaInsert, 'utf-8');
        const $ = cheerio.load(htmlContent);

        // Elenco degli ID da svuotare (ho corretto i ref in base alla tua richiesta)
        const idsToEmpty = [
            '#titdef', 
            '#ingredientiPrimo', 
            '#descrizionePrimo', 
            '#titolodefSecondo', 
            '#ingredientiSecondo', 
            '#descrizioneSecondo',
            '#titdefConto', 
            '#ingredientiContorno', 
            '#descrizioneContorno'
        ];

                // Svuota il testo e nascondi gli elementi
        idsToEmpty.forEach(id => {
            $(id).text('');
        });

        // Salva le modifiche nel file cucinaInsert.html
        await fs.writeFile(pathHtmlCucinaInsert, $.html());

        res.send(`
            <script>
                alert("Menu salvato con successo nella cartella settimanale!");
                window.location.href = "/cucinaInsert";
            </script>
        `);

        

    } catch (error) {
        console.error("Errore durante il salvataggio del menu:", error);
        res.send(`
            <script>
                alert("Errore: Assicurati di aver caricato tutti i file prima di salvare il menu.");
                window.history.back();
            </script>
        `);
    }

});
//testi


//salva cucina.html
// Percorsi centralizzati per evitare errori di battitura
const UPLOADS_DIR = path.join(__dirname, '../uploads');
const HTML_FILE = path.join(__dirname, '../cucinaInsert.html');

// Funzione riutilizzabile per evitare codice duplicato
async function salvaDatiCucina(req, res, fileName, bodyField, htmlSelector) {
    try {
        const contenuto = req.body[bodyField];
        const txtPath = path.join(UPLOADS_DIR, fileName);

        // 1. Assicura che la cartella esista e scrive il TXT
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        await fs.writeFile(txtPath, contenuto, 'utf-8');

        // 2. Legge e aggiorna l'HTML
        const htmlRaw = await fs.readFile(HTML_FILE, 'utf-8');
        const $ = cheerio.load(htmlRaw, { decodeEntities: false }); // Mantiene le lettere accentate
        
        $(htmlSelector).text(contenuto);

        // 3. Salva l'HTML aggiornato
        await fs.writeFile(HTML_FILE, $.html());

        res.redirect('/cucinaInsert');
    } catch (err) {
        console.error(`Errore nel salvataggio di ${fileName}:`, err);
        res.status(500).send("Errore durante l'elaborazione dei dati.");
    }
}

// --- ROTTE ---

router.post('/salvaTitoloPrimo', (req, res) => {
    salvaDatiCucina(req, res, 'titolo_primo.txt', 'titolo_Primo', '#titdef');
});

router.post('/salvaIngredientiPrimo', (req, res) => {
    salvaDatiCucina(req, res, 'ingredienti_primo.txt', 'ingredienti_Primo', '#ingredientiPrimo');
});

router.post('/salvaDescrizionePrimo', (req, res) => {
    salvaDatiCucina(req, res, 'descrizione_primo.txt', 'descrizione_Primo', '#descrizionePrimo');
});

router.post('/salvaTitoloSecondo', (req, res) => {
    salvaDatiCucina(req, res, 'titolo_secondo.txt', 'titolo_Secondo', '#titolodefSecondo');
});

router.post('/salvaIngredientiSecondo', (req, res) => {
    salvaDatiCucina(req, res, 'ingredienti_secondo.txt', 'ingredienti_Secondo', '#ingredientiSecondo');
});

router.post('/salvaDescrizioneSecondo', (req, res) => {
    salvaDatiCucina(req, res, 'descrizione_secondo.txt', 'descrizione_Secondo', '#descrizioneSecondo');
});

router.post('/salvaTitoloContorno', (req, res) => {
    salvaDatiCucina(req, res, 'titolo_contorno.txt', 'titolo_Contorno', '#titdefConto');
});

router.post('/salvaIngredientiContorno', (req, res) => {
    salvaDatiCucina(req, res, 'ingredienti_contorno.txt', 'ingredienti_Contorno', '#ingredientiContorno');
});

router.post('/salvaDescrizioneContorno', (req, res) => {
    salvaDatiCucina(req, res, 'descrizione_contorno.txt', 'descrizione_Contorno', '#descrizioneContorno');
});



// Rotta per salvare il file e aggiornare l'HTML della pagina cucina.html
const pathUploads = path.join(__dirname, '../uploads');
const pathHtml = path.join(__dirname, '..', 'views', 'html', 'cucina.html');

const pathTitoloPrimo = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'titolo_primo.txt');
const pathIngredientiPrimo = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'ingredienti_primo.txt');
const pathDescrizionePrimo = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'descrizione_primo.txt');

const pathTitoloSecondo = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'titolo_secondo.txt');
const pathIngredientiSecondo = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'ingredienti_secondo.txt');
const pathDescrizioneSecondo = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'descrizione_secondo.txt');

const pathTitoloContorno = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'titolo_contorno.txt');
const pathIngredientiContorno = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'ingredienti_contorno.txt');
const pathDescrizioneContorno = path.join(__dirname, '..', 'public', 'images', 'menu_settimanale', 'descrizione_contorno.txt');


// salvataggio su cucina.html


router.post('/salvaMenuR', async (req, res) => {
    try {
        const filesUploaded = await fs.readdir(pathUploads);
       
        // Controllo presenza file
        const mancaQualcosa = !filesUploaded.includes('primo.jpg') || 
                              !filesUploaded.includes('secondo.jpg') || 
                              !filesUploaded.includes('contorno.jpg') || 
                              !filesUploaded.includes('ricetta.pdf');

        if (mancaQualcosa) {
            // Leggiamo tutto in parallelo per massime prestazioni
            const [titoloPrimo,
                   ingredientiPrimo,
                   descrizionePrimo,
                   titoloSecondo,
                   ingredientiSecondo,
                   descrizioneSecondo,
                   titoloContorno,
                   ingredientiContorno,
                   descrizioneContorno,
                    htmlContent] = await Promise.all([
                fs.readFile(pathTitoloPrimo, 'utf-8'),
                fs.readFile(pathIngredientiPrimo, 'utf-8'),
                fs.readFile(pathDescrizionePrimo, 'utf-8'),

                fs.readFile(pathTitoloSecondo, 'utf-8'),
                fs.readFile(pathIngredientiSecondo, 'utf-8'),
                fs.readFile(pathDescrizioneSecondo, 'utf-8'),

                fs.readFile(pathTitoloContorno, 'utf-8'),
                fs.readFile(pathIngredientiContorno, 'utf-8'),
                fs.readFile(pathDescrizioneContorno, 'utf-8'),

                fs.readFile(pathHtml, 'utf-8')
            ]);

            // Carichiamo Cheerio una sola volta
            const $ = cheerio.load(htmlContent);

            // Aggiorniamo i testi nell'HTML
            $('#titolop').text(titoloPrimo.trim());
            $('#ingredientiPrimo').text(ingredientiPrimo.trim());
            $('#descrizionePrimo').text(descrizionePrimo.trim());

            $('#titolodefSecondo').text(titoloSecondo.trim());
            $('#ingredientiSecondo').text(ingredientiSecondo.trim());
            $('#descrizioneSecondo').text(descrizioneSecondo.trim());

            $('#titdefConto').text(titoloContorno.trim());
            $('#ingredientiContorno').text(ingredientiContorno.trim());
            $('#descrizioneContorno').text(descrizioneContorno.trim());


            
            // Salviamo solo il file HTML (NON sovrascrivere i .txt con l'HTML!)
            await fs.writeFile(pathHtml, $.html());
           
            return res.redirect('/cucina');

        } else {
            return res.send(`
                <script>c
                    alert("Prima di Pubblicare il Menu devi inviare tutto alla Cucina!");
                    window.history.back();
                </script>
            `);
        }
    } catch (err) {
        console.error("Errore durante l'operazione:", err);
        if (!res.headersSent) {
            res.status(500).send("Errore critico durante il salvataggio.");
        }
    }
});

router.post('/logout', (req, res)=>{
    req.session.destroy((err)=>{
        if(err){
            console.log ('errore', err);
            return res.redirect('/cucinaInsert');
        }
        res.clearCookie('connect.sid'); // Pulisce il cookie della sessione nel browser
        res.redirect('/login');

    })
})







module.exports = router;





/*
// Aspetta che la pagina sia caricata
document.addEventListener('DOMContentLoaded', () => {
    const input = document.querySelector('input[type="text"]');
    const titoloAnteprima = document.getElementById('titolo');

    if (input) {
        input.addEventListener('input', () => {
            const valore = input.value;
            
            // 1. Salva per l'altra pagina
            localStorage.setItem('testoCondiviso', valore);
            
            // 2. Aggiorna l'anteprima locale (nella pagina A stessa)
            if (titoloAnteprima) {
                titoloAnteprima.textContent = valore;
            }
        });
    }
});
*/



