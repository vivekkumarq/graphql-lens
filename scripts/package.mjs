// Zip dist/ for upload to the Chrome Web Store / Edge Add-ons: release/graphql-lens-<version>.zip
// Minimal ZIP writer (deflate + crc32 from node:zlib), so packaging needs no extra dependency.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('dist/manifest.json', 'utf8'));
if (manifest.version !== pkg.version) throw new Error('dist/ is stale: run npm run build first');

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (!e.name.endsWith('.map')) files.push(full); // source maps are not needed in the store build
  }
})('dist');

const chunks = [];
const central = [];
let offset = 0;
for (const file of files.sort()) {
  const name = Buffer.from(path.relative('dist', file).split(path.sep).join('/'));
  const data = fs.readFileSync(file);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt32LE(0x5a210000, 10); // fixed DOS date/time for reproducible zips
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(deflated.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  chunks.push(local, name, deflated);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(0x5a210000, 12);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(deflated.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, name);
  offset += 30 + name.length + deflated.length;
}
const cdSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync('release', { recursive: true });
const out = path.join('release', `graphql-lens-${pkg.version}.zip`);
fs.writeFileSync(out, Buffer.concat([...chunks, ...central, end]));
console.log(`${out}  (${files.length} files, ${(fs.statSync(out).size / 1024).toFixed(0)} kB)`);
