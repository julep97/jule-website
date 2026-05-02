#!/usr/bin/env node
// Bulk-Upload zu Cloudflare R2 via S3-API (statt wrangler — vermeidet das
// 1200 req/5min Account-API-Rate-Limit). Concurrency 20, idempotent.
//
//   node --env-file=.env tools/upload-r2-s3.mjs
//   node --env-file=.env tools/upload-r2-s3.mjs --force

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pLimit from 'p-limit';
import { glob } from 'glob';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DIST = path.join(ROOT, 'dist-images');

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_ENDPOINT,
  R2_BUCKET = 'jule-images',
} = process.env;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
  console.error('missing env: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT');
  console.error('run with: node --env-file=.env tools/upload-r2-s3.mjs');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  maxAttempts: 5,
});

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
    const r = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return r.ETag ? r.ETag.replaceAll('"', '') : null;
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === 'NotFound') return null;
    throw err;
  }
}

async function uploadOne(file, opts) {
  const rel = path.relative(DIST, file);
  const key = rel.split(path.sep).join('/');
  const ext = path.extname(file).toLowerCase();
  const ContentType = MIME[ext] || 'application/octet-stream';

  const buf = await fs.readFile(file);
  const localHash = md5(buf);

  if (!opts.force) {
    const remote = await remoteEtag(key);
    if (remote === localHash) return { key, status: 'skip', size: buf.byteLength };
  }

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buf,
    ContentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { key, status: 'uploaded', size: buf.byteLength };
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { force: args.includes('--force') };

  const files = await glob([`${DIST}/**/*.{avif,webp,jpg,jpeg,png}`], {
    nodir: true,
    ignore: [`${DIST}/_ab/**`, `${DIST}/_gallery/**`],
  });
  if (!files.length) {
    console.error('no files in dist-images/');
    process.exit(1);
  }

  console.log(`${files.length} files to check (concurrency=20${opts.force ? ', force' : ''})`);
  const t0 = Date.now();
  const limit = pLimit(20);
  let i = 0, ok = 0, skip = 0, fail = 0;

  const tasks = files.map((f) => limit(async () => {
    const idx = ++i;
    try {
      const r = await uploadOne(f, opts);
      const tag = r.status === 'skip' ? '·' : '↑';
      if (r.status === 'skip') skip++; else ok++;
      console.log(`[${String(idx).padStart(3)}/${files.length}] ${tag} ${r.key}  (${(r.size/1024).toFixed(0)} KB)`);
      return r;
    } catch (err) {
      fail++;
      console.error(`[${String(idx).padStart(3)}/${files.length}] ✗ ${path.basename(f)}: ${err.message}`);
      return { error: err.message };
    }
  }));

  await Promise.all(tasks);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n done in ${dt}s · uploaded=${ok} · skipped=${skip} · failed=${fail}`);
  if (fail) process.exit(1);
}

main();
