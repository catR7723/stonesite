const mongoose = require('mongoose');

const FilmSchema = new mongoose.Schema({
    titolo: { type: String, required: true },
    trama: { type: String, default: 'Trama non disponibile' },
    discussione: { type: String, default: 'Discussione non disponibile' },
    locandinaUrl: { type: String, required: true },
    nomeCartellaFilm: { type: String, required: true },
    dataInserimento: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Film', FilmSchema);
