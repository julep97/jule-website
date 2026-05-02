#!/usr/bin/env node
// Bulk-Upload aller Dateien aus dist-images/ nach R2 (Bucket: jule-images).
// Idempotent: lädt nur hoch, wenn lokales MD5 ≠ remote ETag.
//
//   node tools/upload-r2.mjs            -> alle Files in dist-images/ (außer _ab/)
//   node tools/upload-r2.mjs --dry-run  -> nur zeigen was hochgeladen würde
//   node tools/upload-r2.mjs --force    -> immer hochladen, ETag ignorieren

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DIST = path.join(ROOT, 'dist-images');
const BUCKET = 'jule-images';
const PUBLIC_URL = 'https://pub-45145834ff2b45db8a585cff5b669e13.r2.dev';
const CONCURRENCY = 3;
const MAX_RETRIES = 5;

const MIME = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
};

function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }

async function remoteEtag(key) {
  try {
    const res = await fetch(`${PUBLIC_URL}/${key}`, { method: 'HEAD' });
    if (!res.ok) return null;
    const etag = res.headers.get('etag');
    return etag ? etag.replaceAll('"', '') : null;
  } catch { return null; }
}

function wranglerPutOnce(key, file, contentType) {
  return new Promise((resolve, reject) => {
    const args = [
      'wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`,
      '--file', file,
      '--content-type', contentType,
      '--remote',
    ];
    const proc = spawn('npx', args, { stdio: 'pipe' });
    let stderr = '', stdout = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.on('close', (code) => {
      const all = stderr + stdout;
      if (code === 0) return resolve();
      const isRate = /429|Too Many Requests|consider throttling/i.test(all);
      const err = new Error(`exit ${code}: ${(all.trim().split('\n').pop() || '').slice(0, 120)}`);
      err.rateLimited = isRate;
      reject(err);
    });
  });
}

async function wranglerPut(key, file, contentType) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await wranglerPutOnce(key, file, contentType);
      return;
    } catch (err) {
      lastErr = err;
      if (!err.rateLimited && attempt > 1) throw err; // bei nicht-429 nicht endlos retryen
      const delay = Math.min(15000, 800 * 2 ** attempt + Math.random() * 400);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function processOne(file, opts) {
  const rel = path.relative(DIST, file);
  const key = rel.split(path.sep).join('/');
  const ext = path.extname(file).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  const buf = await fs.readFile(file);
  const localHash = md5(buf);

  if (!opts.force) {
    const remote = await remoteEtag(key);
    if (remote === localHash) {
      return { key, status: 'skip', size: buf.byteLength };
    }
  }

  if (opts.dryRun) {
    return { key, status: 'would-upload', size: buf.byteLength };
  }

  await wranglerPut(key, file, contentType);
  return { key, status: 'uploaded', size: buf.byteLength };
}

async function pool(items, n, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        results[idx] = { error: err.message, item: items[idx] };
      }
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { dryRun: args.includes('--dry-run'), force: args.includes('--force') };

  const files = await glob([`${DIST}/**/*.{avif,webp,jpg,jpeg,png}`], {
    nodir: true,
    ignore: [`${DIST}/_ab/**`, `${DIST}/_gallery/**`],
  });
  if (!files.length) {
    console.error('no files in dist-images/ — run images:optimize first');
    process.exit(1);
  }
  console.log(`${files.length} files to check (concurrency=${CONCURRENCY}${opts.dryRun ? ', dry-run' : ''}${opts.force ? ', force' : ''})`);

  const t0 = Date.now();
  const results = await pool(files, CONCURRENCY, (f, idx) => {
    return processOne(f, opts).then((r) => {
      const tag = r.status === 'skip' ? '·' : r.status === 'uploaded' ? '↑' : '~';
      console.log(`[${String(idx+1).padStart(3)}/${files.length}] ${tag} ${r.key}  (${(r.size/1024).toFixed(0)} KB)`);
      return r;
    });
  });

  const stats = results.reduce((a, r) => {
    if (r.error) a.error++;
    else a[r.status] = (a[r.status] || 0) + 1;
    return a;
  }, { error: 0 });
  const totalBytes = results.filter((r) => !r.error).reduce((s, r) => s + r.size, 0);
  console.log(`\n done in ${((Date.now()-t0)/1000).toFixed(1)}s · ${JSON.stringify(stats)} · total ${(totalBytes/1e6).toFixed(1)} MB`);

  const failed = results.filter((r) => r.error);
  if (failed.length) {
    console.error('\nFAILED:');
    for (const f of failed) console.error(`  ${f.item}: ${f.error}`);
    process.exit(1);
  }
}

main();
