const express = require('express');
const app = express();
const fs = require('fs').promises;
const uploadRoutes = require('./routes/cucinaInsert'); // Importa il file appena creato

app.use('/uploads', express.static('uploads'));
app.use( express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());








// Usa le rotte definite nel file esterno
app.use('/', uploadRoutes); 

app.listen(3000, () => console.log('Server in esecuzione'));







