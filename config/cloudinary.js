
require('dotenv').config(); 
const cloudinary = require('cloudinary').v2;

// Rimuovi o mantieni i log per sicurezza
console.log("CONFIGURAZIONE CLOUDINARY IN CORSO...");
console.log("API_KEY PRESENTE?", process.env.CLOUDINARY_API_KEY ? "SÌ" : "NO");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = cloudinary;

