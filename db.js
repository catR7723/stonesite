const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  throw new Error('Definisci la variabile MONGO_URI o MONGODB_URI nelle Environment Variables.');
}

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    console.log('MONGO: using cached connection');
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      // opzioni utili per debug e per evitare buffering infinito
      bufferCommands: false,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000
    };

    console.log('MONGO: connecting to', MONGO_URI.replace(/\/\/(.*:).*@/, '//$1:<PASS>@'));
    mongoose.set('strictQuery', false);

    mongoose.connection.on('connecting', () => console.log('MONGO: connecting...'));
    mongoose.connection.on('connected', () => console.log('MONGO: connected'));
    mongoose.connection.on('open', () => console.log('MONGO: open'));
    mongoose.connection.on('reconnected', () => console.log('MONGO: reconnected'));
    mongoose.connection.on('disconnected', () => console.log('MONGO: disconnected'));
    mongoose.connection.on('error', err => console.error('MONGO: error', err));

    cached.promise = mongoose.connect(MONGO_URI, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

module.exports = connectDB;

