// diagnose-topo.js
const dns = require('dns').promises;
const { exec } = require('child_process');
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
console.log('Using URI:', uri.replace(/\/\/(.*:).*@/, '//$1:<PASS>@'));

(async () => {
  try {
    console.log('Resolving SRV...');
    const srv = await dns.resolveSrv('_mongodb._tcp.cluster0.vp9eyhc.mongodb.net');
    console.log('SRV records:', srv);
    for (const r of srv) {
      const host = r.name;
      console.log('\\n-> testing host', host);
      await new Promise((res) => {
        exec(`nc -vz ${host} 27017`, {timeout:15000}, (err, stdout, stderr) => {
          console.log('nc stdout:', stdout.trim());
          console.log('nc stderr:', stderr.trim());
          res();
        });
      });
      await new Promise((res) => {
        exec(`openssl s_client -connect ${host}:27017 -servername ${host} </dev/null 2>&1 | sed -n '1,20p'`, {timeout:20000}, (err, stdout) => {
          console.log('openssl head:\n', stdout.trim());
          res();
        });
      });
    }
  } catch (e) {
    console.error('diagnose error', e);
  }
})();