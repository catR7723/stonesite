// test-hello.js
// Prova di connessione al cluster MongoDB Atlas.
// Usa process.env.MONGO_URI (caricato da .env se usi dotenv) oppure passa la MONGO_URI in linea di comando.

require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';

function maskUri(u) {
  if (!u) return '<empty>';
  return u.replace(/\/\/([^:]+):([^@]+)@/, '//$1:<PASS>@');
}

console.log('Using URI:', maskUri(uri));

if (!uri) {
  console.error('No MONGO_URI found in environment. Set MONGO_URI or pass it inline and retry.');
  process.exit(1);
}

(async () => {
  const opts = {
    connectTimeoutMS: 20000,
    serverSelectionTimeoutMS: 20000,
    // tls is automatic with +srv, but you can force options here if needed
  };

  const client = new MongoClient(uri, opts);

  try {
    await client.connect();
    console.log('✅ connected -> running hello');

    const admin = client.db('admin');

    try {
      const hello = await admin.command({ hello: 1 });
      console.log('hello:', hello);
    } catch (e) {
      console.warn('hello command failed:', e && e.message);
    }

    try {
      const repl = await admin.command({ replSetGetStatus: 1 });
      console.log('replSetGetStatus:', repl);
    } catch (e) {
      console.warn('replSetGetStatus failed (may require privileges):', e && e.message);
    }

    await client.close();
    console.log('Disconnected.');
    process.exit(0);
  } catch (err) {
    console.error('CONNECT ERROR (full):', err && err.stack ? err.stack : err);
    try { await client.close(); } catch (_) {}
    process.exit(1);
  }
})();