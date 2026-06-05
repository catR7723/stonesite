const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    unique: true 
  },
  category: { 
    type: String, 
    default: 'cucina' 
  },
  folder: {
    type: String,
    get: function() {
      return `cucina/${this.title}`;
    }
  },
  primo: {
    titolo: String,
    ingredienti: String,
    descrizione: String,
    imageUrl: String
  },
  secondo: {
    titolo: String,
    ingredienti: String,
    descrizione: String,
    imageUrl: String
  },
  contorno: {
    titolo: String,
    ingredienti: String,
    descrizione: String,
    imageUrl: String
  },
  ricetta: {
    pdfUrl: String
  },
  published: { 
    type: Boolean, 
    default: false 
  },
  publishedAt: Date,
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Recipe', recipeSchema);