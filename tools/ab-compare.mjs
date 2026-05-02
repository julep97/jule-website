#!/usr/bin/env node
// Erzeugt eine Side-by-Side-Vergleichsseite: AVIF q=70 / WebP q=88 / JPG q=92
// gegen eine "praktisch lossless" PNG-Referenz aus dem Original.
//
//   node tools/ab-compare.mjs <file> [<file> ...]
//
// Output: dist-images/_ab/index.html + ref-Bilder

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const ORIGINALS = path.join(ROOT, 'originals');
const OUT = path.join(ROOT, 'dist-images');
const ABDIR = path.join(OUT, '_ab');

const PREVIEW_WIDTH = 1600; // einheitliche Breite in der Vergleichsansicht

function slug(name) {
  return name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function fileSize(p) {
  try { return (await fs.stat(p)).size; } catch { return 0; }
}

function fmtKB(b) { return (b / 1024).toFixed(0) + ' KB'; }

async function makeReference(absInput, id) {
  // Praktisch verlustfrei: PNG (lossless) bei Preview-Breite. Browser-sicher, große Datei -> nur lokal.
  const out = path.join(ABDIR, `${id}-ref.png`);
  await sharp(absInput, { limitInputPixels: false, unlimited: true })
    .rotate()
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 6 })
    .toFile(out);
  return out;
}

async function makeVariant(absInput, id, format, opts) {
  const out = path.join(ABDIR, `${id}-${format}.${format === 'jpg' ? 'jpg' : format}`);
  const pipeline = sharp(absInput, { limitInputPixels: false, unlimited: true })
    .rotate()
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true });
  await pipeline.toFormat(format === 'jpg' ? 'jpeg' : format, opts).toFile(out);
  return out;
}

async function processOne(absInput) {
  const base = path.basename(absInput);
  const id = slug(base);
  const meta = await sharp(absInput, { limitInputPixels: false, unlimited: true }).metadata();
  const origSize = (await fs.stat(absInput)).size;

  console.log(`\n→ ${base} (${meta.width}×${meta.height})`);

  const ref = await makeReference(absInput, id);
  const avif = await makeVariant(absInput, id, 'avif', { quality: 70, effort: 6 });
  const webp = await makeVariant(absInput, id, 'webp', { quality: 88, effort: 6 });
  const jpg  = await makeVariant(absInput, id, 'jpg',  { quality: 92, mozjpeg: true, progressive: true });

  return {
    id, base, width: meta.width, height: meta.height,
    origSize,
    ref:  { path: path.basename(ref),  size: await fileSize(ref) },
    avif: { path: path.basename(avif), size: await fileSize(avif) },
    webp: { path: path.basename(webp), size: await fileSize(webp) },
    jpg:  { path: path.basename(jpg),  size: await fileSize(jpg) },
  };
}

function html(items) {
  const cards = items.map((it) => `
<section class="card">
  <header>
    <h2>${it.base}</h2>
    <p class="meta">${it.width}×${it.height} px · Original: ${fmtKB(it.origSize)}</p>
  </header>
  <div class="grid">
    <figure>
      <div class="frame"><img src="${it.ref.path}" alt="reference" loading="eager"/></div>
      <figcaption><strong>Reference (PNG lossless)</strong><br/>${fmtKB(it.ref.size)}</figcaption>
    </figure>
    <figure>
      <div class="frame"><img src="${it.avif.path}" alt="avif"/></div>
      <figcaption><strong>AVIF q=70</strong><br/>${fmtKB(it.avif.size)} · ${(100 - it.avif.size/it.ref.size*100).toFixed(0)}% kleiner als Ref</figcaption>
    </figure>
    <figure>
      <div class="frame"><img src="${it.webp.path}" alt="webp"/></div>
      <figcaption><strong>WebP q=88</strong><br/>${fmtKB(it.webp.size)} · ${(100 - it.webp.size/it.ref.size*100).toFixed(0)}% kleiner als Ref</figcaption>
    </figure>
    <figure>
      <div class="frame"><img src="${it.jpg.path}" alt="jpg"/></div>
      <figcaption><strong>JPG q=92 (mozjpeg)</strong><br/>${fmtKB(it.jpg.size)} · ${(100 - it.jpg.size/it.ref.size*100).toFixed(0)}% kleiner als Ref</figcaption>
    </figure>
  </div>
</section>`).join('\n');

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/>
<title>A/B Bildqualität — Jule Plaehn Portfolio</title>
<style>
  body{margin:0;background:#1a1a1a;color:#eee;font-family:-apple-system,BlinkMacSystemFont,"SF Pro",Inter,sans-serif;padding:24px}
  h1{font-weight:500;margin:0 0 8px}
  .lead{color:#999;margin:0 0 32px;max-width:60ch}
  .card{background:#222;border-radius:8px;padding:20px;margin-bottom:24px}
  .card h2{margin:0 0 4px;font-size:18px;font-weight:500}
  .meta{color:#888;font-size:13px;margin:0}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:16px}
  @media(min-width:1400px){.grid{grid-template-columns:repeat(4,1fr)}}
  figure{margin:0;background:#111;border-radius:6px;overflow:hidden}
  .frame{aspect-ratio:auto;background:#000}
  .frame img{width:100%;height:auto;display:block}
  figcaption{padding:10px 12px;font-size:12px;line-height:1.5;color:#bbb;border-top:1px solid #333}
  strong{color:#fff;font-weight:500}
  kbd{font-family:ui-monospace,SF Mono,monospace;background:#333;padding:2px 6px;border-radius:3px;font-size:11px}
</style>
</head><body>
<h1>A/B Bildqualität — Jule Plaehn Portfolio</h1>
<p class="lead">Vergleich der Web-Optimierungen gegen eine PNG-Referenz (praktisch verlustfrei). Alle Bilder bei ${PREVIEW_WIDTH}px Breite. Tip: <kbd>⌘+</kbd> reinzoomen, Material-Texturen vergleichen.</p>
${cards}
</body></html>`;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('usage: node tools/ab-compare.mjs <file> [<file> ...]');
    process.exit(1);
  }
  await ensureDir(ABDIR);
  const items = [];
  for (const a of args) {
    const abs = path.isAbsolute(a) ? a : path.join(ORIGINALS, a);
    items.push(await processOne(abs));
  }
  const indexPath = path.join(ABDIR, 'index.html');
  await fs.writeFile(indexPath, html(items));
  console.log(`\nopen ${indexPath}`);
}

main();
