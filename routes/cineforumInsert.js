const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const cheerio = require ('cheerio'); 
const fs = require('fs/promises');




const getDataFormattata = () => {
  const d = new Date();
  const giorno = String(d.getDate()).padStart(2, '0');
  const mese = String(d.getMonth() + 1).padStart(2, '0'); // Gennaio è 0
  const anno = d.getFullYear();
  return `${giorno}_${mese}_${anno}`;
  };
// Usiamo la memoria per elaborare il file prima di salvarlo
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const uploadFilm = upload.fields([
  { name: 'locandina', maxCount: 1 },

]);

router.post('/cineforumInsert', uploadFilm, async (req, res) => {
  try {
    const files = req.files;

        if (!files) {
      return res.send(`
        <script>
          alert("Errore: Inserisci la Locandina");
          window.history.back();
        </script>
      `);
    }

 
// Gestione Immagini: mantiene nome originale + .jpg
const saveAsJpeg = async (fileArray, fileName) => {
   
    if (fileArray && fileArray[0]) {
        const file = fileArray[0]; // Estraiamo il singolo file dall'array di Multer
        
        // 2. Costruiamo il percorso ASSOLUTO (importante!)
       
        const finalPath = path.join(__dirname, '../uploads/cineforum', fileName);

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
      saveAsJpeg(files['locandina'], 'locandina.jpg'),
     
    ]);
  
    res.sendFile(path.join(__dirname, '../cineforumInsert.html'));

  } catch (error) {
    console.error(error);
    res.status(500).send("Errore durante il salvataggio dei file.");
  }
});

// Funzione universale per eliminare e reindirizzare
const deleteAndRedirect = async (filename, res) => {
    try {
        const filePath = path.join(__dirname, '../uploads/cineforum', filename);
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
          window.location.href = "/cineforumInsert";
        </script>
        `);
    };

// Rotte specifiche
router.post('/deleteLocandina', (req, res) => deleteAndRedirect('locandina.jpg', res));


//sposta i file da uploads 

router.post('/salvaFilm', async (req, res) => {
    const cartellaSorgente = path.join(__dirname, '../uploads/cineforum');
    const cartellaDestinazioneBase = path.join(__dirname, '../public/images/films');
    
    // Funzione interna per creare lo slug (nome cartella sicuro)
    const slugify = (text) => text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')           // Sostituisce spazi con -
        .replace(/[^\w\-]+/g, '')       // Rimuove caratteri speciali
        .replace(/\-\-+/g, '-');        // Rimuove doppie --

    try {
        // 1. Recuperiamo il titolo dal file sorgente PRIMA di spostare tutto
        const pathTitoloSorgente = path.join(cartellaSorgente, 'titolo_film.txt');
        const titoloTesto = await fs.readFile(pathTitoloSorgente, 'utf-8');
        
        // 2. Definiamo la cartella specifica del film dentro blog
        const nomeCartellaFilm = slugify(titoloTesto);
        const cartellaBlogSpecifico = path.join(cartellaDestinazioneBase, 'blog', nomeCartellaFilm);
        
        // Creiamo le cartelle necessarie
        await fs.mkdir(cartellaDestinazioneBase, { recursive: true });
        await fs.mkdir(cartellaBlogSpecifico, { recursive: true });

        const dataOggi = getDataFormattata();

        // 3. Mappa dei file: ora puntano alla sottocartella specifica
        const fileMappa = [
            { orig: 'locandina.jpg', blog: `${dataOggi}.jpg` },
            { orig: 'titolo_film.txt', blog: `titolo_film_${dataOggi}.txt` },
            { orig: 'tramaFilm.txt', blog: `tramaFilm_${dataOggi}.txt` },
            { orig: 'discussione.txt', blog: `discussione_${dataOggi}.txt` }
        ];

        // 4. Spostamento e Copia File
        for (const file of fileMappa) {
            const sorgente = path.join(cartellaSorgente, file.orig);
            const blogDest = path.join(cartellaBlogSpecifico, file.blog); // Dentro la cartella del film
            const radiceDest = path.join(cartellaDestinazioneBase, file.orig);

            try {
                await fs.access(sorgente); 
                await fs.copyFile(sorgente, blogDest);
                await fs.rename(sorgente, radiceDest);
            } catch (err) {
                console.warn(`SALTO: ${file.orig} non trovato.`);
            }
        }

        // 5. Lettura dei contenuti dai file per incorporarli direttamente nell'HTML
        let titoloContenuto = titoloTesto;
        let tramaContenuto = '';
        let discussioneContenuto = '';

        try {
            tramaContenuto = await fs.readFile(path.join(cartellaBlogSpecifico, `tramaFilm_${dataOggi}.txt`), 'utf-8');
        } catch (e) {
            tramaContenuto = 'Trama non disponibile';
        }

        try {
            discussioneContenuto = await fs.readFile(path.join(cartellaBlogSpecifico, `discussione_${dataOggi}.txt`), 'utf-8');
        } catch (e) {
            discussioneContenuto = 'Discussione non disponibile';
        }

        // 5. Aggiornamento HTML con i contenuti INCORPORATI (non link)
        const baseWebPath = `/images/films/blog/${nomeCartellaFilm}`;
        
  
        // ✅ Genera ID unico basato su timestamp
const generaIdUnico = () => {
    const now = new Date();
    const ore = String(now.getHours()).padStart(2, '0');
    const minuti = String(now.getMinutes()).padStart(2, '0');
    const secondi = String(now.getSeconds()).padStart(2, '0');
    const millisecondi = String(now.getMilliseconds()).padStart(3, '0');
    return `film-${ore}-${minuti}-${secondi}-${millisecondi}`;
};


const idUnico = generaIdUnico();

const contenutoComune = `
    <h1>${titoloContenuto}</h1>
    <h3>Film del ${dataOggi.replace(/_/g, '/')}</h3>
    <input type="checkbox" id="sidebar-${idUnico}">
    <label for="sidebar-${idUnico}" class="toggle-img">
        <img src="${baseWebPath}/${dataOggi}.jpg" width="100">
    </label>
    <br>
    <div class="film-details">
        <label for="sidebar-${idUnico}" class="toggle-archivio">

            <div class="film-section">
                <h4>📖 Trama</h4>
                <p>${tramaContenuto.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
            </div>
            <div class="film-section">
                <h4>💬 Discussione</h4>
                <p>${discussioneContenuto.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
            </div>
        </label>
    </div>
`;

        const nuovoBlocco = `<div id="${dataOggi}" class="film-archiviato" data-folder="${nomeCartellaFilm}">${contenutoComune}</div>`;
        
        const nuovoBloccoInsert = `
            <div id="${dataOggi}" class="film-archiviato" data-folder="${nomeCartellaFilm}">
                <form action="/modificaInsert/${nomeCartellaFilm}" method="post">
                    <button type="submit">Modifica ${titoloContenuto}</button>
                </form>
                ${contenutoComune}
            </div>
        `;

        // Scrittura sui file HTML (come nel tuo codice originale)
        const pathHtmlPubblico = path.join(__dirname, '..', 'views', 'html', 'laboratori', 'cineforum.html');
        const pathHtmlInsert = path.join(__dirname, '../cineforumInsert.html');

        const htmlPub = await fs.readFile(pathHtmlPubblico, 'utf-8');
        const $pub = cheerio.load(htmlPub);
        $pub('#archivio').append(nuovoBlocco);
        await fs.writeFile(pathHtmlPubblico, $pub.html());

        const htmlIns = await fs.readFile(pathHtmlInsert, 'utf-8');
        const $ins = cheerio.load(htmlIns);
        $ins('#archivio').append(nuovoBloccoInsert);
        $ins('#titoloFilm, #tramaFilm, #discussione').text('');
        await fs.writeFile(pathHtmlInsert, $ins.html());

res.send(`
    <script>
        alert("Film salvato nella cartella ${nomeCartellaFilm}!");
        
        window.location.href = "/cineforumInsert"; 
    </script>
`);


    } catch (error) {
        console.error("Errore durante il salvataggio:", error);
        res.status(500).send("Errore interno del server.");
    }
});


//testi


//salva cineforum.html
// Percorsi centralizzati per evitare errori di battitura
const UPLOADS_DIR = path.join(__dirname, '../uploads/cineforum');
const HTML_FILE = path.join(__dirname, '../cineforumInsert.html');



// --- ROTTE ---

router.post('/salvaTitoloLocandina', (req, res) => {
    salvaDatiFilm(req, res, 'titolo_film.txt', 'titoloFilm', '#titoloFilm');
});

router.post('/salvaTrama', (req, res) => {

    salvaDatiFilm(req, res, 'tramaFilm.txt', 'tramaFilm', '#tramaFilm');
});

router.post('/salvaDiscussione', (req, res) => {
    salvaDatiFilm(req, res, 'discussione.txt', 'discussione', '#discussione');
});

async function salvaDatiFilm(req, res, fileName, bodyField, htmlSelector) {
    try {
        const contenuto = req.body[bodyField]; // Prende 'titoloFilm' dal body
        const txtPath = path.join(UPLOADS_DIR, fileName);

        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        await fs.writeFile(txtPath, contenuto, 'utf-8');

        // Legge l'HTML di inserimento
        const htmlRaw = await fs.readFile(HTML_FILE, 'utf-8');
        const $ = cheerio.load(htmlRaw, { decodeEntities: false });
        
        // Cerca l'ID e inserisce il testo
        $(htmlSelector).text(contenuto); 

        // Salva il file
        await fs.writeFile(HTML_FILE, $.html());

        res.redirect('/cineforumInsert');
    } catch (err) {
        console.error(err);
        res.status(500).send("Errore");
    }
}
  router.post('/salvaFilmR', async (req, res) => {
    try {
        const pathTitolo = path.join(__dirname, '..', 'public', 'images', 'films', 'titolo_film.txt');
        const pathTrama = path.join(__dirname, '..', 'public', 'images', 'films', 'tramaFilm.txt');
        const pathDisc = path.join(__dirname, '..', 'public', 'images', 'films', 'discussione.txt' );
        const pathHtmlPubblico = path.join(__dirname, '..', 'views', 'html', 'laboratori', 'cineforum.html');

        // AGGIUNGI QUESTO CONTROLLO:
        try {
            await fs.access(pathTitolo);
        } catch (e) {
            return res.send(`<script>alert("Errore: Clicca prima su 'Salva il Film' per spostare i file!"); window.history.back();</script>`);
        }

        // 2. LEGGERE i contenuti dai file
        const [titoloContenuto, tramaContenuto, discContenuto, htmlContent] = await Promise.all([
            fs.readFile(pathTitolo, 'utf-8'),
            fs.readFile(pathTrama, 'utf-8'),
            fs.readFile(pathDisc, 'utf-8'),
            fs.readFile(pathHtmlPubblico, 'utf-8')
        ]);

        // 3. Usiamo Cheerio per aggiornare cineforum.html con contenuti INCORPORATI
        const $ = cheerio.load(htmlContent);

        // Cerca i selettori e sostituisci con contenuti HTML, non solo testo
$('#titoloFilm').html(`
    <div class="film-section">
        
        <p>${titoloContenuto.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
    </div>
`);
$('#tramaFilm').html(`
    <label for="toggle-blog" id="toggle-trama" style="cursor: pointer;">
        <div class="film-section">
            <h4>📖 Trama</h4>
            <p>${tramaContenuto.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
        </div>
    </label>

`);

$('#discussione').html(`
    <label for="toggle-blog" class="toggle-discussione" style="cursor: pointer;">
        <div class="film-section">
            <h4>💬 Discussione</h4>
            <p>${discContenuto.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
        </div>
    </label>
   
`);

   // 4. Salviamo il file HTML aggiornato
        await fs.writeFile(pathHtmlPubblico, $.html());

        res.send(`
            <script>
                alert("Film pubblicato con successo su Cineforum!");
                window.location.href = "/cineforum";
            </script>
        `);

    } catch (error) {
        console.error("Errore durante la pubblicazione:", error);
        res.status(500).send("Errore: Assicurati di aver salvato Titolo, Trama e Discussione prima di pubblicare.");
    }
});


router.post('/logout', (req, res)=>{
    req.session.destroy((err)=>{
        if(err){
            console.log ('errore', err);
            return res.redirect('/cineforumInsert');
        }
        res.clearCookie('connect.sid'); // Pulisce il cookie della sessione nel browser
        res.redirect('/login');

    })
});

// ✅ MODIFIED: Takes folderName (slug) as parameter, not title
router.post('/modificaInsert/:folderName', async (req, res) => {
    try {
        const folderName = req.params.folderName; // This is already the slug!

        const cartellaOriginale = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', folderName);
        const cartellaDestinazione = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', 'modify');
        const pathHtmlInsert = path.join(__dirname, '..', 'cineforumInsert.html');

        // Controllo esistenza cartella originale
        try {
            await fs.access(cartellaOriginale);
        } catch {
            return res.send(`<script>
                alert("Errore: La cartella del film '${folderName}' non esiste sul disco. Ricarica la pagina.");
                window.location.href = "/cineforumInsert";
            </script>`);
        }

        // Clear modify folder
        try {
            await fs.rm(cartellaDestinazione, { recursive: true, force: true });
        } catch (e) {
            console.warn('Impossibile svuotare modify:', e.message);
        }

        // Create fresh modify folder
        await fs.mkdir(cartellaDestinazione, { recursive: true });

        const files = await fs.readdir(cartellaOriginale);
        
        let tTitolo = folderName; 
        let tTrama = "";
        let tDiscussione = "";

        for (const file of files) {
            const sorgente = path.join(cartellaOriginale, file);
            let nomeDest = "";
            if (file.endsWith('.jpg')) nomeDest = 'locandina_modify.jpg';
            else if (file.startsWith('titolo_film_')) nomeDest = 'titolo_modify.txt';
            else if (file.startsWith('tramaFilm_')) nomeDest = 'trama_modify.txt';
            else if (file.startsWith('discussione_')) nomeDest = 'discussione_modify.txt';

            if (nomeDest) {
                await fs.copyFile(sorgente, path.join(cartellaDestinazione, nomeDest));
            }
        }

        // Lettura sicura dei file
        try {
            tTitolo = await fs.readFile(path.join(cartellaDestinazione, 'titolo_modify.txt'), 'utf-8');
        } catch (e) { /* Resta il folderName */ }
        
        try {
            tTrama = await fs.readFile(path.join(cartellaDestinazione, 'trama_modify.txt'), 'utf-8');
        } catch (e) { tTrama = "Trama non trovata."; }

        try {
            tDiscussione = await fs.readFile(path.join(cartellaDestinazione, 'discussione_modify.txt'), 'utf-8');
        } catch (e) { tDiscussione = "Discussione non trovata."; }

        const htmlInsert = await fs.readFile(pathHtmlInsert, 'utf-8');
        const $ = cheerio.load(htmlInsert);
        $('#modify').remove();

        // ✅ FIXED: Pass folderName (slug) to salvaModifiche, not title
        const nuovoBloccoModify = `
            <div id="modify" style="background: #f0f0f0; padding: 20px; border: 2px solid #333; margin-top: 30px;">
                <h2>✏️ Area Modifica: ${tTitolo}</h2>
                <form action="/salvaModifiche/${folderName}" method="POST" enctype="multipart/form-data">
                    <h3>Titolo</h3>
                    <textarea name="nuovoTitolo" rows="2" style="width: 100%;">${tTitolo}</textarea>
                    <h3>Trama</h3>
                    <textarea name="nuovaTrama" rows="6" style="width: 100%;">${tTrama}</textarea>
                    <h3>Discussione</h3>
                    <textarea name="nuovaDiscussione" rows="6" style="width: 100%;">${tDiscussione}</textarea>
                    <div style="margin: 15px 0;">
                        <p>Locandina attuale:</p>
                        <img src="/images/films/blog/modify/locandina_modify.jpg?t=${Date.now()}" width="120" style="border: 1px solid #000">
                        <br><br>
                        <label>Sostituisci Locandina (opzionale):</label>
                        <input type="file" name="nuovaLocandina" accept="image/*">
                    </div>
                    <button type="submit" style="background: #27ae60; color: white; padding: 10px 25px; border: none; font-weight: bold; cursor: pointer;">
                        SALVA MODIFICHE DEFINITIVE
                    </button>
                </form>
                
                <form action="/eliminaFilm/${folderName}" method="POST" onsubmit="return confirm('Sei sicuro di voler eliminare definitivamente questo elemento?');" style="margin-top: 10px;">
                    <button type="submit" style="background: #c0392b; color: white; padding: 10px 25px; border: none; font-weight: bold; cursor: pointer;">
                        ⚠️ ELIMINA DEFINITIVAMENTE
                    </button>
                </form>
            </div>
        `;

        $('body').append(nuovoBloccoModify);
        await fs.writeFile(pathHtmlInsert, $.html());
        res.send(`<script>window.location.href = "/cineforumInsert";</script>`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Errore nel caricamento della modifica.");
    }
});



router.post('/eliminaFilm/:folderName', async (req, res) => {
    try {
        const folderName = req.params.folderName;

        const cartellaBlog = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', folderName);
        const pathHtmlInsert = path.join(__dirname, '..', 'cineforumInsert.html');
        const pathHtmlPubblico = path.join(__dirname, '..', 'views', 'html', 'laboratori', 'cineforum.html');

        // 1. DELETE FOLDER FROM DISK
        try {
            await fs.rm(cartellaBlog, { recursive: true, force: true });
            console.log(`Cartella del blog eliminata: ${folderName}`);
        } catch (dirErr) {
            console.error(`Nota: Impossibile eliminare la cartella o già inesistente: ${dirErr.message}`);
        }

        // 2. REMOVE FROM BOTH HTML FILES
        const rimuoviDaHtml = async (percorsoFile) => {
            try {
                const contenuto = await fs.readFile(percorsoFile, 'utf-8');
                const $ = cheerio.load(contenuto);
                
                // Search by data-folder attribute first (more reliable)
                let bloccoFilm = $(`.film-archiviato[data-folder="${folderName}"]`);
                
                if (bloccoFilm.length > 0) {
                    bloccoFilm.remove();
                    
                    if (percorsoFile === pathHtmlInsert) {
                        $('#modify').remove();
                    }
                    
                    await fs.writeFile(percorsoFile, $.html());
                    console.log(`Film rimosso con successo da: ${percorsoFile}`);
                } else {
                    console.log(`Nessun blocco film trovato per lo slug "${folderName}" in: ${percorsoFile}`);
                }
            } catch (htmlErr) {
                console.error(`Errore durante la rimozione HTML su ${percorsoFile}:`, htmlErr);
            }
        };

        await Promise.all([
            rimuoviDaHtml(pathHtmlInsert),
            rimuoviDaHtml(pathHtmlPubblico)
        ]);

        res.send(`
            <script>
                alert("Film eliminato definitivamente dall'archivio e dalle pagine del sito!");
                window.location.href = "/cineforumInsert";
            </script>
        `);

    } catch (err) {
        console.error("Errore critico durante l'eliminazione:", err);
        res.status(500).send("Errore interno durante il processo di eliminazione.");
    }
});




router.post('/salvaModifiche/:folderName', upload.single('nuovaLocandina'), async (req, res) => {
    try {
        const { nuovoTitolo, nuovaTrama, nuovaDiscussione } = req.body;
        const oldFolderName = req.params.folderName; // This is the current slug

        const slugify = (text) => text.toString().toLowerCase().trim()
            .replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
        
        const nuovoFolderName = slugify(nuovoTitolo); // New slug based on new title

        const cartellaModify = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', 'modify');
        const cartellaBlogVecchia = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', oldFolderName);
        const cartellaBlogNuova = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', nuovoFolderName);
        
        const pathHtmlInsert = path.join(__dirname, '..', 'cineforumInsert.html');
        const pathHtmlPubblico = path.join(__dirname, '..', 'views', 'html', 'laboratori', 'cineforum.html');

        // 1. Clear modify folder and write new files
        try {
            await fs.rm(cartellaModify, { recursive: true, force: true });
        } catch (e) {
            console.warn('Cannot clear modify:', e.message);
        }

        await fs.mkdir(cartellaModify, { recursive: true });
        await fs.writeFile(path.join(cartellaModify, 'titolo_modify.txt'), nuovoTitolo || "");
        await fs.writeFile(path.join(cartellaModify, 'trama_modify.txt'), nuovaTrama || "");
        await fs.writeFile(path.join(cartellaModify, 'discussione_modify.txt'), nuovaDiscussione || "");

        // 2. Sync blog folder files
        await fs.mkdir(cartellaBlogVecchia, { recursive: true });
        const filesBlog = await fs.readdir(cartellaBlogVecchia);
        
        let trovatotitolo = false, trovatotrama = false, trovatodiscussione = false, locandinaOriginale = null;

        for (const file of filesBlog) {
            if (file.startsWith('titolo_film_')) {
                await fs.writeFile(path.join(cartellaBlogVecchia, file), nuovoTitolo || "");
                trovatotitolo = true;
            } else if (file.startsWith('tramaFilm_')) {
                await fs.writeFile(path.join(cartellaBlogVecchia, file), nuovaTrama || "");
                trovatotrama = true;
            } else if (file.startsWith('discussione_')) {
                await fs.writeFile(path.join(cartellaBlogVecchia, file), nuovaDiscussione || "");
                trovatodiscussione = true;
            } else if (file.endsWith('.jpg')) {
                locandinaOriginale = file;
            }
        }

        const timestamp = Date.now();
        if (!trovatotitolo) await fs.writeFile(path.join(cartellaBlogVecchia, `titolo_film_${timestamp}.txt`), nuovoTitolo || "");
        if (!trovatotrama) await fs.writeFile(path.join(cartellaBlogVecchia, `tramaFilm_${timestamp}.txt`), nuovaTrama || "");
        if (!trovatodiscussione) await fs.writeFile(path.join(cartellaBlogVecchia, `discussione_${timestamp}.txt`), nuovaDiscussione || "");

        // 3. ✅ FIXED: Image upload handling
        if (req.file) {
            console.log('Nuovo file caricato:', req.file.originalname);
            const buffer = await sharp(req.file.buffer).toFormat('jpeg').toBuffer();
            
            // Save to modify folder
            await fs.writeFile(path.join(cartellaModify, 'locandina_modify.jpg'), buffer);
            
            // Update original
            if (locandinaOriginale) {
                await fs.writeFile(path.join(cartellaBlogVecchia, locandinaOriginale), buffer);
                console.log(`Locandina aggiornata: ${locandinaOriginale}`);
            } else {
                await fs.writeFile(path.join(cartellaBlogVecchia, `locandina_${timestamp}.jpg`), buffer);
                locandinaOriginale = `locandina_${timestamp}.jpg`;
                console.log('Nuova locandina creata');
            }
        } else {
            console.log('Nessun file caricato - mantiene l\'immagine originale');
            // Copy original to modify folder if it exists
            if (locandinaOriginale) {
                const locOriginalePath = path.join(cartellaBlogVecchia, locandinaOriginale);
                const locModifyPath = path.join(cartellaModify, 'locandina_modify.jpg');
                try {
                    await fs.copyFile(locOriginalePath, locModifyPath);
                } catch (e) {
                    console.warn(`Cannot copy original image: ${e.message}`);
                }
            }
        }

        // 4. Update HTML BEFORE renaming folder (both files, using OLD folder name)
     
const aggiornaStrutturaHtmlPrima = async (percorsoFile, isInsertPage) => {
    try {
        const contenuto = await fs.readFile(percorsoFile, 'utf-8');
        const $ = cheerio.load(contenuto, { decodeEntities: false }); // ⭐ Important!
        
        // Try multiple selectors to find the film block
        let bloccoFilm = $(`#archivio .film-archiviato[data-folder="${oldFolderName}"]`);
        
        // Fallback: Search without #archivio wrapper
        if (bloccoFilm.length === 0) {
            bloccoFilm = $(`.film-archiviato[data-folder="${oldFolderName}"]`);
        }
        
        if (bloccoFilm.length > 0) {
            console.log(`✅ Found film block in ${percorsoFile}`);
            
            // Update title
            bloccoFilm.find('h1').text(nuovoTitolo);
            
            // Update image with cache-busting
            bloccoFilm.find('img').each((i, imgEl) => {
                const srcAttuale = $(imgEl).attr('src');
                if (srcAttuale && !srcAttuale.includes('modify')) {
                    let pulitoSrc = srcAttuale.split('?')[0];
                    if (oldFolderName !== nuovoFolderName) {
                        pulitoSrc = pulitoSrc.replace(oldFolderName, nuovoFolderName);
                    }
                    $(imgEl).attr('src', `${pulitoSrc}?t=${timestamp}`);
                }
            });
            
            // Update embedded content sections
            bloccoFilm.find('.film-section').each((i, sectionEl) => {
                const $section = $(sectionEl);
                const h4Text = $section.find('h4').first().text();
                
                if (h4Text.includes('Titolo')) {
                    $section.find('p').html(nuovoTitolo.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
                } else if (h4Text.includes('Trama')) {
                    $section.find('p').html(nuovaTrama.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'));
                } else if (h4Text.includes('Discussione')) {
                    $section.find('p').html(nuovaDiscussione.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'));
                }
            });

            // Update all forms inside this block
  // Update all forms inside this block
bloccoFilm.find('form').each((i, formEl) => {
    const actionAttuale = $(formEl).attr('action');
    if (actionAttuale) {
        $(formEl).attr('action', actionAttuale.replace(`/${oldFolderName}`, `/${nuovoFolderName}`));
    }
    // Update the modify button label to reflect the new title
    $(formEl).find('button[type="submit"]').each((j, btnEl) => {
        const btnText = $(btnEl).text();
        if (btnText.startsWith('Modifica ')) {
            $(btnEl).text(`Modifica ${nuovoTitolo}`);
        }
    });
});
            bloccoFilm.attr('data-folder', nuovoFolderName);

            if (isInsertPage) {
                 $('#modify').remove();
                }

            // ⭐ IMPORTANT: Always write back, even if block not found
            const htmlOutput = $.html();
            await fs.writeFile(percorsoFile, htmlOutput);
            console.log(`✅ HTML aggiornato: ${percorsoFile}`);
            
        } else {
            console.warn(`⚠️ AVVISO: Blocco film NON trovato in ${percorsoFile}`);
            console.warn(`   Cercando: data-folder="${oldFolderName}"`);
            console.warn(`   File: ${percorsoFile}`);
            
            // ⭐ Still write back to prevent data loss (even if no changes made)
            const htmlOutput = $.html();
            await fs.writeFile(percorsoFile, htmlOutput);
        }
        
    } catch (htmlErr) {
        console.error(`❌ Errore nell'aggiornamento HTML: ${percorsoFile}`, htmlErr);
    }
};
        // Update both files BEFORE renaming
        await aggiornaStrutturaHtmlPrima(pathHtmlInsert, true);
        await aggiornaStrutturaHtmlPrima(pathHtmlPubblico, false);

        // 5. NOW rename folder if title changed
        if (oldFolderName !== nuovoFolderName) {
            try {
                await fs.access(cartellaBlogNuova);
                await fs.rm(cartellaBlogNuova, { recursive: true, force: true });
            } catch {}
            
            await fs.rename(cartellaBlogVecchia, cartellaBlogNuova);
            console.log(`Cartella rinominata: ${oldFolderName} → ${nuovoFolderName}`);
        }

        res.send(`
            <script>
                alert("Modifiche salvate con successo in entrambi i file!");
                window.location.href = "/cineforumInsert";
            </script>
        `);

    } catch (err) {
        console.error("Errore definitivo durante il salvataggio:", err);
        res.status(500).send("Errore nel salvataggio e rinomina della cartella.");
    }
});






module.exports=router;
