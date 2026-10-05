// Build step for static/serverless hosts (Vercel runs it automatically; harmless elsewhere).
//  1. Copies the three.js files the browser imports into public/vendor/three, so a CDN can serve them.
//     (The Node server serves them straight from node_modules, so local runs don't need this.)
//  2. Checks that vercel.json's Content-Security-Policy still allows index.html's inline import map.
//     Run `npm run build -- --fix` after editing the import map to update it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineScriptHashes, contentSecurityPolicy } from '../server/security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE = path.join(ROOT, 'node_modules', 'three');
const OUT = path.join(ROOT, 'public', 'vendor', 'three');

// ---------------------------------------------------------------- 1. vendor three.js
function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsFiles(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
}

const queue = ['build/three.module.js'];
for (const file of jsFiles(path.join(ROOT, 'public', 'js'))) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/['"]three\/addons\/([^'"]+\.js)['"]/g)) queue.push(`examples/jsm/${m[1]}`);
}

const copied = new Set();
while (queue.length) {
  const rel = path.posix.normalize(queue.shift());
  if (copied.has(rel)) continue;
  const src = path.join(THREE, rel);
  if (!fs.existsSync(src)) throw new Error(`three.js file not found: ${rel}`);
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  fs.copyFileSync(src, path.join(OUT, rel));
  copied.add(rel);
  // follow the file's own relative and addon imports
  const code = fs.readFileSync(src, 'utf8');
  for (const m of code.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) queue.push(path.posix.join(path.posix.dirname(rel), m[1]));
  for (const m of code.matchAll(/from\s+['"]three\/addons\/([^'"]+)['"]/g)) queue.push(`examples/jsm/${m[1]}`);
}
console.log(`  vendored ${copied.size} three.js files into public/vendor/three`);

// ---------------------------------------------------------------- 2. CSP in vercel.json
const vercelFile = path.join(ROOT, 'vercel.json');
const expected = contentSecurityPolicy(inlineScriptHashes(path.join(ROOT, 'public', 'index.html')));
const vercel = JSON.parse(fs.readFileSync(vercelFile, 'utf8'));
const cspHeader = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy');
if (!cspHeader) throw new Error('vercel.json has no Content-Security-Policy header');
if (cspHeader.value !== expected) {
  if (process.argv.includes('--fix')) {
    cspHeader.value = expected;
    fs.writeFileSync(vercelFile, JSON.stringify(vercel, null, 2) + '\n');
    console.log('  updated the Content-Security-Policy in vercel.json');
  } else {
    console.error('\n  vercel.json\'s Content-Security-Policy no longer matches public/index.html (the inline import map changed).');
    console.error('  Run `npm run build -- --fix` and commit vercel.json.\n');
    process.exit(1);
  }
} else {
  console.log('  vercel.json Content-Security-Policy matches index.html');
}
