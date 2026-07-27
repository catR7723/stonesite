// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, index: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ['boss','user','cucina'], default: 'user' },
  allowedPage: { type: String, enum: ['cineforum','cucina','both', null], default: null },
  passwordHash: { type: String },
  tempExpiresAt: { type: Date }
}, { timestamps: true, collection: 'utenti' });

module.exports = mongoose.model('User', UserSchema);