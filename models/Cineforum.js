const mongoose = require('mongoose');

const CineSchema = new mongoose.Schema({
  titolo: { type: String, default: '' },
  trama: { type: String, default: '' },
  discussione: { type: String, default: '' },
  locandinaUrl: { type: String, default: '' },
  locandinaPublicId: { type: String, default: '' },
  published: { type: Boolean, default: false },
  nomeCartellaFilm: { type: String, default: '' },
  dataInserimento: { type: Date, default: null }
}, {
  timestamps: true
});

CineSchema.index({ published: 1, dataInserimento: -1 });

module.exports = mongoose.model('Cineforum', CineSchema);