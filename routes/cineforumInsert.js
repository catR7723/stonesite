const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const cheerio = require('cheerio'); 
const fs = require('fs/promises');
const cloudinary = require('cloudinary').v2;

// ✅ CONFIGURAZIONE CLOUDINARY
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const getDataFormattata = () => {
  const d = new Date();
  const giorno = String(d.getDate()).padStart(2, '0');
  const mese = String(d.getMonth() + 1).padStart(2, '0');
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

    // ✅ UPLOAD SU CLOUDINARY (dal buffer)
    const uploadToCloudinary = async (fileArray, fileName) => {
      if (fileArray && fileArray[0]) {
        const file = fileArray[0];
        
        try {
          // Converte l'immagine in JPEG prima di uploadare
          const jpegBuffer = await sharp(file.buffer)
            .toFormat('jpeg')
            .jpeg({ quality: 90 })
            .toBuffer();

          // Upload del buffer su Cloudinary
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                folder: 'cineforum',
                public_id: fileName.replace('.jpg', ''),
                resource_type: 'auto',
                overwrite: true
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            ).end(jpegBuffer);
          });

          console.log(`✅ Upload Cloudinary: ${fileName} - ${result.secure_url}`);
          return {
            url: result.secure_url,
            publicId: result.public_id
          };
        } catch (err) {
          console.error(`❌ Errore Cloudinary ${fileName}:`, err.message);
          throw err;
        }
      } else {
        console.log(`⚠️ fileArray per ${fileName} è vuoto o non definito`);
        return null;
      }
    };

    // Eseguiamo l'upload su Cloudinary
    const locandinaData = await uploadToCloudinary(files['locandina'], 'locandina');

    // ✅ SALVA ENTRAMBI URL E PUBLIC_ID NEL FILE
    const uploadsDir = path.join(__dirname, '../uploads/cineforum');
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(
      path.join(uploadsDir, 'locandina_data.json'),
      JSON.stringify({
        url: locandinaData.url,
        publicId: locandinaData.publicId
      })
    );

    res.sendFile(path.join(__dirname, '../cineforumInsert.html'));

  } catch (error) {
    console.error(error);
    res.status(500).send("Errore durante il salvataggio dei file.");
  }
});

// ✅ ELIMINAZIONE DA CLOUDINARY (CORRETTO)
const deleteFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      console.warn('⚠️ Public ID mancante, skip eliminazione');
      return;
    }
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`✅ Immagine eliminata da Cloudinary: ${publicId}`, result);
    return result;
  } catch (err) {
    console.error(`❌ Errore eliminazione Cloudinary (${publicId}):`, err.message);
  }
};

// Eliminazione locandina
router.post('/deleteLocandina', async (req, res) => {
  try {
    // Leggi i dati dal file JSON
    const dataPath = path.join(__dirname, '../uploads/cineforum/locandina_data.json');
    try {
      const data = await fs.readFile(dataPath, 'utf-8');
      const { publicId } = JSON.parse(data);
      console.log(`Eliminando public_id: ${publicId}`);
      await deleteFromCloudinary(publicId);
      // Cancella il file JSON dopo aver eliminato
      await fs.unlink(dataPath);
    } catch (e) {
      console.warn('⚠️ File dati non trovato');
    }

    res.send(`
      <script>
        alert("Locandina eliminata con successo!");
        window.location.href = "/cineforumInsert";
      </script>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Errore nel server");
  }
});

// ✅ SALVATAGGIO FILM (con URL Cloudinary - AGGIORNATO PER VISUALIZZARE)
router.post('/salvaFilm', async (req, res) => {
  const cartellaSorgente = path.join(__dirname, '../uploads/cineforum');
  const cartellaDestinazioneBase = path.join(__dirname, '../public/images/films');

  const slugify = (text) => text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');

  try {
    const pathTitoloSorgente = path.join(cartellaSorgente, 'titolo_film.txt');
    const titoloTesto = await fs.readFile(pathTitoloSorgente, 'utf-8');

    const nomeCartellaFilm = slugify(titoloTesto);
    const cartellaBlogSpecifico = path.join(cartellaDestinazioneBase, 'blog', nomeCartellaFilm);

    await fs.mkdir(cartellaDestinazioneBase, { recursive: true });
    await fs.mkdir(cartellaBlogSpecifico, { recursive: true });

    const dataOggi = getDataFormattata();

    // ✅ LEGGI DATI CLOUDINARY DAL FILE JSON
    let locandinaUrl = '';
    let locandinaPublicId = '';
    try {
      const data = await fs.readFile(path.join(cartellaSorgente, 'locandina_data.json'), 'utf-8');
      const parsed = JSON.parse(data);
      locandinaUrl = parsed.url;
      locandinaPublicId = parsed.publicId;
    } catch (e) {
      console.warn('⚠️ Dati Cloudinary non trovati');
    }

    // Mappa file di testo (NON immagini, quelle sono su Cloudinary)
    const fileMappa = [
      { orig: 'titolo_film.txt', blog: `titolo_film_${dataOggi}.txt` },
      { orig: 'tramaFilm.txt', blog: `tramaFilm_${dataOggi}.txt` },
      { orig: 'discussione.txt', blog: `discussione_${dataOggi}.txt` }
    ];

    // Copia file di testo
    for (const file of fileMappa) {
      const sorgente = path.join(cartellaSorgente, file.orig);
      const blogDest = path.join(cartellaBlogSpecifico, file.blog);
      const radiceDest = path.join(cartellaDestinazioneBase, file.orig);

      try {
        await fs.access(sorgente);
        await fs.copyFile(sorgente, blogDest);
        await fs.rename(sorgente, radiceDest);
      } catch (err) {
        console.warn(`SALTO: ${file.orig} non trovato.`);
      }
    }

    // ✅ SALVA DATI CLOUDINARY (URL + PUBLIC_ID)
    if (locandinaUrl && locandinaPublicId) {
      await fs.writeFile(
        path.join(cartellaBlogSpecifico, `locandina_data_${dataOggi}.json`),
        JSON.stringify({
          url: locandinaUrl,
          publicId: locandinaPublicId
        })
      );
    }

    // Leggi contenuti
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

    const generaIdUnico = () => {
      const now = new Date();
      const ore = String(now.getHours()).padStart(2, '0');
      const minuti = String(now.getMinutes()).padStart(2, '0');
      const secondi = String(now.getSeconds()).padStart(2, '0');
      const millisecondi = String(now.getMilliseconds()).padStart(3, '0');
      return `film-${ore}-${minuti}-${secondi}-${millisecondi}`;
    };

    const idUnico = generaIdUnico();

    // ✅ USA L'URL CLOUDINARY INVECE DEL PERCORSO LOCALE
    const contenutoComune = `
      <h1>${titoloContenuto}</h1>
      <h3>Film del ${dataOggi.replace(/_/g, '/')}</h3>
      <input type="checkbox" id="sidebar-${idUnico}">
      <label for="sidebar-${idUnico}" class="toggle-img">
        <img src="${locandinaUrl}?w=100&h=150&c=fill" width="100" alt="Locandina">
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

// Costanti percorsi
const UPLOADS_DIR = path.join(__dirname, '../uploads/cineforum');
const HTML_FILE = path.join(__dirname, '../cineforumInsert.html');

// Salvataggio testi
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
    const contenuto = req.body[bodyField];
    const txtPath = path.join(UPLOADS_DIR, fileName);

    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.writeFile(txtPath, contenuto, 'utf-8');

    const htmlRaw = await fs.readFile(HTML_FILE, 'utf-8');
    const $ = cheerio.load(htmlRaw, { decodeEntities: false });

    $(htmlSelector).text(contenuto);

    await fs.writeFile(HTML_FILE, $.html());

    res.redirect('/cineforumInsert');
  } catch (err) {
    console.error(err);
    res.status(500).send("Errore");
  }
}

// ✅ ROTTA PER VISUALIZZARE ARCHIVIO CON IMMAGINI DA CLOUDINARY
router.get('/caricaArchivio', async (req, res) => {
  try {
    const cartellaDestinazioneBase = path.join(__dirname, '../public/images/films');
    const cartellaBlog = path.join(cartellaDestinazioneBase, 'blog');

    const filmFolders = await fs.readdir(cartellaBlog);
    let html = '';

    for (const folder of filmFolders) {
      if (folder === 'modify') continue;

      const cartellaFilm = path.join(cartellaBlog, folder);
      const stats = await fs.stat(cartellaFilm);

      if (!stats.isDirectory()) continue;

      const files = await fs.readdir(cartellaFilm);
      
      let titolo = folder;
      let trama = '';
      let discussione = '';
      let locandinaUrl = '';

      // ✅ LEGGI DATI CLOUDINARY
      for (const file of files) {
        if (file.startsWith('titolo_film_')) {
          try {
            titolo = await fs.readFile(path.join(cartellaFilm, file), 'utf-8');
          } catch (e) {}
        } else if (file.startsWith('tramaFilm_')) {
          try {
            trama = await fs.readFile(path.join(cartellaFilm, file), 'utf-8');
          } catch (e) {}
        } else if (file.startsWith('discussione_')) {
          try {
            discussione = await fs.readFile(path.join(cartellaFilm, file), 'utf-8');
          } catch (e) {}
        } else if (file.startsWith('locandina_data_')) {
          try {
            const dataJson = await fs.readFile(path.join(cartellaFilm, file), 'utf-8');
            const parsed = JSON.parse(dataJson);
            locandinaUrl = parsed.url;
          } catch (e) {}
        }
      }

      if (locandinaUrl) {
        const idUnico = `film-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        html += `
          <div class="film-archiviato" data-folder="${folder}">
            <h1>${titolo}</h1>
            <input type="checkbox" id="sidebar-${idUnico}">
            <label for="sidebar-${idUnico}" class="toggle-img">
              <img src="${locandinaUrl}?w=100&h=150&c=fill" width="100" alt="${titolo}">
            </label>
            <br>
            <div class="film-details">
              <label for="sidebar-${idUnico}" class="toggle-archivio">
                <div class="film-section">
                  <h4>📖 Trama</h4>
                  <p>${trama.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
                </div>
                <div class="film-section">
                  <h4>💬 Discussione</h4>
                  <p>${discussione.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
                </div>
              </label>
            </div>
          </div>
        `;
      }
    }

    res.json({ html });
  } catch (error) {
    console.error("Errore caricamento archivio:", error);
    res.status(500).json({ error: "Errore nel caricamento dell'archivio" });
  }
});

router.post('/salvaFilmR', async (req, res) => {
  try {
    const pathTitolo = path.join(__dirname, '..', 'public', 'images', 'films', 'titolo_film.txt');
    const pathTrama = path.join(__dirname, '..', 'public', 'images', 'films', 'tramaFilm.txt');
    const pathDisc = path.join(__dirname, '..', 'public', 'images', 'films', 'discussione.txt');
    const pathHtmlPubblico = path.join(__dirname, '..', 'views', 'html', 'laboratori', 'cineforum.html');

    try {
      await fs.access(pathTitolo);
    } catch (e) {
      return res.send(`<script>alert("Errore: Clicca prima su 'Salva il Film' per spostare i file!"); window.history.back();</script>`);
    }

    const [titoloContenuto, tramaContenuto, discContenuto, htmlContent] = await Promise.all([
      fs.readFile(pathTitolo, 'utf-8'),
      fs.readFile(pathTrama, 'utf-8'),
      fs.readFile(pathDisc, 'utf-8'),
      fs.readFile(pathHtmlPubblico, 'utf-8')
    ]);

    const $ = cheerio.load(htmlContent);

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

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log('errore', err);
      return res.redirect('/cineforumInsert');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

const slugify = (text) => text.toString().toLowerCase().trim()
  .replace(/\s+/g, '-')
  .replace(/[^\w\-]+/g, '')
  .replace(/\-\-+/g, '-');

// Modifica Film
router.post('/modificaInsert/:folderName', async (req, res) => {
  try {
    const folderName = req.params.folderName;
    const cartellaOriginale = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', folderName);
    const cartellaDestinazione = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', 'modify');
    const pathHtmlInsert = path.join(__dirname, '..', 'cineforumInsert.html');

    try {
      await fs.access(cartellaOriginale);
    } catch {
      return res.send(`<script>
        alert("Errore: La cartella del film '${folderName}' non esiste sul disco. Ricarica la pagina.");
        window.location.href = "/cineforumInsert";
      </script>`);
    }

    try {
      await fs.rm(cartellaDestinazione, { recursive: true, force: true });
    } catch (e) {
      console.warn('Impossibile svuotare modify:', e.message);
    }

    await fs.mkdir(cartellaDestinazione, { recursive: true });

    const files = await fs.readdir(cartellaOriginale);

    let tTitolo = folderName;
    let tTrama = "";
    let tDiscussione = "";
    let tLocandinaUrl = "";
    let tLocandinaPublicId = "";

    for (const file of files) {
      const sorgente = path.join(cartellaOriginale, file);
      let nomeDest = "";

      if (file.startsWith('titolo_film_')) nomeDest = 'titolo_modify.txt';
      else if (file.startsWith('tramaFilm_')) nomeDest = 'trama_modify.txt';
      else if (file.startsWith('discussione_')) nomeDest = 'discussione_modify.txt';
      else if (file.startsWith('locandina_data_')) nomeDest = 'locandina_data_modify.json';

      if (nomeDest) {
        await fs.copyFile(sorgente, path.join(cartellaDestinazione, nomeDest));
      }
    }

    try {
      tTitolo = await fs.readFile(path.join(cartellaDestinazione, 'titolo_modify.txt'), 'utf-8');
    } catch (e) { }

    try {
      tTrama = await fs.readFile(path.join(cartellaDestinazione, 'trama_modify.txt'), 'utf-8');
    } catch (e) { tTrama = "Trama non trovata."; }

    try {
      tDiscussione = await fs.readFile(path.join(cartellaDestinazione, 'discussione_modify.txt'), 'utf-8');
    } catch (e) { tDiscussione = "Discussione non trovata."; }

    // ✅ LEGGI I DATI CLOUDINARY (URL + PUBLIC_ID)
    try {
      const dataJson = await fs.readFile(path.join(cartellaDestinazione, 'locandina_data_modify.json'), 'utf-8');
      const parsed = JSON.parse(dataJson);
      tLocandinaUrl = parsed.url;
      tLocandinaPublicId = parsed.publicId;
    } catch (e) { 
      console.warn('⚠️ Dati Cloudinary non trovati in modifica');
    }

    const htmlInsert = await fs.readFile(pathHtmlInsert, 'utf-8');
    const $ = cheerio.load(htmlInsert);
    $('#modify').remove();

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
            ${tLocandinaUrl ? `<img src="${tLocandinaUrl}?w=120&h=180&c=fill" width="120" style="border: 1px solid #000" alt="Locandina">` : '<p>Nessuna locandina</p>'}
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

// ✅ ELIMINAZIONE FILM (con Cloudinary)
router.post('/eliminaFilm/:folderName', async (req, res) => {
  try {
    const folderName = req.params.folderName;
    const cartellaBlog = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', folderName);
    const pathHtmlInsert = path.join(__dirname, '..', 'cineforumInsert.html');
    const pathHtmlPubblico = path.join(__dirname, '..', 'views', 'html', 'laboratori', 'cineforum.html');

    // ✅ ELIMINA IMMAGINI DA CLOUDINARY
    try {
      const files = await fs.readdir(cartellaBlog);
      for (const file of files) {
        if (file.startsWith('locandina_data_')) {
          try {
            const dataJson = await fs.readFile(path.join(cartellaBlog, file), 'utf-8');
            const parsed = JSON.parse(dataJson);
            console.log(`📸 Trovato public_id: ${parsed.publicId}`);
            await deleteFromCloudinary(parsed.publicId);
          } catch (e) {
            console.warn('⚠️ Errore lettura file JSON:', e.message);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Errore accesso cartella:', e.message);
    }

    // Elimina cartella dal disco
    try {
      await fs.rm(cartellaBlog, { recursive: true, force: true });
      console.log(`✅ Cartella del blog eliminata: ${folderName}`);
    } catch (dirErr) {
      console.error(`⚠️ Impossibile eliminare la cartella: ${dirErr.message}`);
    }

    // Rimuovi da HTML
    const rimuoviDaHtml = async (percorsoFile) => {
      try {
        const contenuto = await fs.readFile(percorsoFile, 'utf-8');
        const $ = cheerio.load(contenuto);

        let bloccoFilm = $(`.film-archiviato[data-folder="${folderName}"]`);

        if (bloccoFilm.length > 0) {
          bloccoFilm.remove();

          if (percorsoFile === pathHtmlInsert) {
            $('#modify').remove();
          }

          await fs.writeFile(percorsoFile, $.html());
          console.log(`✅ Film rimosso da: ${percorsoFile}`);
        }
      } catch (htmlErr) {
        console.error(`❌ Errore durante la rimozione HTML:`, htmlErr);
      }
    };

    await Promise.all([
      rimuoviDaHtml(pathHtmlInsert),
      rimuoviDaHtml(pathHtmlPubblico)
    ]);

    res.send(`
      <script>
        alert("Film eliminato definitivamente dall'archivio, dalle pagine del sito e da Cloudinary!");
        window.location.href = "/cineforumInsert";
      </script>
    `);

  } catch (err) {
    console.error("❌ Errore critico durante l'eliminazione:", err);
    res.status(500).send("Errore interno durante il processo di eliminazione.");
  }
});

// ✅ SALVATAGGIO MODIFICHE (con Cloudinary)
router.post('/salvaModifiche/:folderName', upload.single('nuovaLocandina'), async (req, res) => {
  try {
    const { nuovoTitolo, nuovaTrama, nuovaDiscussione } = req.body;
    const oldFolderName = req.params.folderName;

    const nuovoFolderName = slugify(nuovoTitolo);

    const cartellaModify = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', 'modify');
    const cartellaBlogVecchia = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', oldFolderName);
    const cartellaBlogNuova = path.join(__dirname, '..', 'public', 'images', 'films', 'blog', nuovoFolderName);

    const pathHtmlInsert = path.join(__dirname, '..', 'cineforumInsert.html');
    const pathHtmlPubblico = path.join(__dirname, '..', 'views', 'html', 'laboratori', 'cineforum.html');

    // 1. Aggiorna file di testo
    try {
      await fs.rm(cartellaModify, { recursive: true, force: true });
    } catch (e) {
      console.warn('Cannot clear modify:', e.message);
    }

    await fs.mkdir(cartellaModify, { recursive: true });
    await fs.writeFile(path.join(cartellaModify, 'titolo_modify.txt'), nuovoTitolo || "");
    await fs.writeFile(path.join(cartellaModify, 'trama_modify.txt'), nuovaTrama || "");
    await fs.writeFile(path.join(cartellaModify, 'discussione_modify.txt'), nuovaDiscussione || "");

    // 2. Sincronizza cartella blog
    await fs.mkdir(cartellaBlogVecchia, { recursive: true });
    const filesBlog = await fs.readdir(cartellaBlogVecchia);

    let trovatotitolo = false, trovatotrama = false, trovatodiscussione = false;
    let locandinaUrl = null;
    let locandinaPublicId = null;

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
      } else if (file.startsWith('locandina_data_')) {
        try {
          const dataJson = await fs.readFile(path.join(cartellaBlogVecchia, file), 'utf-8');
          const parsed = JSON.parse(dataJson);
          locandinaUrl = parsed.url;
          locandinaPublicId = parsed.publicId;
        } catch (e) { }
      }
    }

    const timestamp = Date.now();
    if (!trovatotitolo) await fs.writeFile(path.join(cartellaBlogVecchia, `titolo_film_${timestamp}.txt`), nuovoTitolo || "");
    if (!trovatotrama) await fs.writeFile(path.join(cartellaBlogVecchia, `tramaFilm_${timestamp}.txt`), nuovaTrama || "");
    if (!trovatodiscussione) await fs.writeFile(path.join(cartellaBlogVecchia, `discussione_${timestamp}.txt`), nuovaDiscussione || "");

    // ✅ UPLOAD NUOVA LOCANDINA SU CLOUDINARY
    if (req.file) {
      console.log('📸 Nuovo file caricato:', req.file.originalname);

      try {
        const jpegBuffer = await sharp(req.file.buffer)
          .toFormat('jpeg')
          .jpeg({ quality: 90 })
          .toBuffer();

        // ✅ ELIMINA VECCHIA IMMAGINE DA CLOUDINARY SE ESISTE
        if (locandinaPublicId) {
          console.log(`🗑️ Eliminando vecchia immagine: ${locandinaPublicId}`);
          await deleteFromCloudinary(locandinaPublicId);
        }

        // Upload su Cloudinary
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: 'cineforum',
              public_id: `locandina_${nuovoFolderName}`,
              resource_type: 'auto',
              overwrite: true
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(jpegBuffer);
        });

        locandinaUrl = result.secure_url;
        locandinaPublicId = result.public_id;
        console.log(`✅ Locandina aggiornata su Cloudinary: ${locandinaUrl}`);

        // Salva nuovi dati
        await fs.writeFile(
          path.join(cartellaBlogVecchia, `locandina_data_${timestamp}.json`),
          JSON.stringify({
            url: locandinaUrl,
            publicId: locandinaPublicId
          })
        );
      } catch (err) {
        console.error('❌ Errore upload Cloudinary:', err.message);
      }
    } else {
      console.log('ℹ️ Nessun file caricato - mantiene l\'immagine originale');
      if (locandinaUrl && locandinaPublicId) {
        await fs.writeFile(
          path.join(cartellaModify, 'locandina_data_modify.json'),
          JSON.stringify({
            url: locandinaUrl,
            publicId: locandinaPublicId
          })
        );
      }
    }

    // 3. Aggiorna HTML PRIMA di rinominare
    const aggiornaStrutturaHtmlPrima = async (percorsoFile, isInsertPage) => {
      try {
        const contenuto = await fs.readFile(percorsoFile, 'utf-8');
        const $ = cheerio.load(contenuto, { decodeEntities: false });

        let bloccoFilm = $(`#archivio .film-archiviato[data-folder="${oldFolderName}"]`);

        if (bloccoFilm.length === 0) {
          bloccoFilm = $(`.film-archiviato[data-folder="${oldFolderName}"]`);
        }

        if (bloccoFilm.length > 0) {
          console.log(`✅ Found film block in ${percorsoFile}`);

          bloccoFilm.find('h1').text(nuovoTitolo);

          // ✅ AGGIORNA IMMAGINE CLOUDINARY
          bloccoFilm.find('img').each((i, imgEl) => {
            const srcAttuale = $(imgEl).attr('src');
            if (srcAttuale && srcAttuale.includes('cloudinary')) {
              if (locandinaUrl) {
                $(imgEl).attr('src', `${locandinaUrl}?w=100&h=150&c=fill&t=${timestamp}`);
              }
            }
          });

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

          bloccoFilm.find('form').each((i, formEl) => {
            const actionAttuale = $(formEl).attr('action');
            if (actionAttuale) {
              $(formEl).attr('action', actionAttuale.replace(`/${oldFolderName}`, `/${nuovoFolderName}`));
            }
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

          const htmlOutput = $.html();
          await fs.writeFile(percorsoFile, htmlOutput);
          console.log(`✅ HTML aggiornato: ${percorsoFile}`);

        } else {
          console.warn(`⚠️ Blocco film NON trovato in ${percorsoFile}`);
          const htmlOutput = $.html();
          await fs.writeFile(percorsoFile, htmlOutput);
        }

      } catch (htmlErr) {
        console.error(`❌ Errore nell'aggiornamento HTML:`, htmlErr);
      }
    };

    await aggiornaStrutturaHtmlPrima(pathHtmlInsert, true);
    await aggiornaStrutturaHtmlPrima(pathHtmlPubblico, false);

    // 4. Rinomina cartella se il titolo cambia
    if (oldFolderName !== nuovoFolderName) {
      try {
        await fs.access(cartellaBlogNuova);
        await fs.rm(cartellaBlogNuova, { recursive: true, force: true });
      } catch {}

      await fs.rename(cartellaBlogVecchia, cartellaBlogNuova);
      console.log(`📁 Cartella rinominata: ${oldFolderName} → ${nuovoFolderName}`);
    }

    res.send(`
      <script>
        alert("Modifiche salvate con successo!");
        window.location.href = "/cineforumInsert";
      </script>
    `);

  } catch (err) {
    console.error("❌ Errore durante il salvataggio:", err);
    res.status(500).send("Errore nel salvataggio delle modifiche.");
  }
});

module.exports = router;

