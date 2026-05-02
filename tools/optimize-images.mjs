#!/usr/bin/env node
// Bild-Optimierung: pro Input erzeugen wir AVIF + WebP + JPG in 4 Breiten.
//
//   node tools/optimize-images.mjs                  -> alle in originals/
//   node tools/optimize-images.mjs <file> [<file>]  -> nur diese (Pfad relativ zu originals/ oder absolut)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { glob } from 'glob';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const ORIGINALS = path.join(ROOT, 'originals');
const OUT = path.join(ROOT, 'dist-images');

const WIDTHS = [800, 1200, 1920, 2560];
const FORMATS = [
  { ext: 'avif', opts: { quality: 70, effort: 6 } },
  { ext: 'webp', opts: { quality: 88, effort: 6 } },
  { ext: 'jpg',  opts: { quality: 92, mozjpeg: true, progressive: true } },
];
const ACCEPTED = new Set(['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.heic', '.heif', '.webp']);

function slug(name) {
  return name
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function processFile(absInput) {
  const base = path.basename(absInput);
  const ext = path.extname(base).toLowerCase();
  if (!ACCEPTED.has(ext)) {
    console.log(`skip (unsupported ext): ${base}`);
    return;
  }
  const id = slug(base);
  await ensureDir(OUT);

  // Originalbild öffnen mit erh. Limits (für sehr große TIFFs)
  const stat = await fs.stat(absInput);
  const pipeline = sharp(absInput, { limitInputPixels: false, unlimited: true, failOn: 'error' });
  const meta = await pipeline.metadata();
  const inputW = meta.width ?? 0;

  console.log(`\n→ ${base}  (${meta.format}, ${inputW}×${meta.height}, ${(stat.size/1e6).toFixed(1)} MB)`);

  // Bei Bildern, die kleiner als die kleinste Zielbreite sind, mindestens
  // eine Variante in nativer Auflösung erzeugen.
  const targetWidths = WIDTHS.filter((w) => w <= inputW);
  if (targetWidths.length === 0 && inputW > 0) targetWidths.push(inputW);

  for (const w of targetWidths) {
    const resized = sharp(absInput, { limitInputPixels: false, unlimited: true })
      .rotate() // EXIF-Orientierung respektieren
      .resize({ width: w, withoutEnlargement: true });

    for (const f of FORMATS) {
      const outPath = path.join(OUT, `${id}-${w}w.${f.ext}`);
      const start = Date.now();
      const buf = await resized.clone().toFormat(f.ext === 'jpg' ? 'jpeg' : f.ext, f.opts).toBuffer();
      await fs.writeFile(outPath, buf);
      const sz = (buf.byteLength / 1024).toFixed(0);
      const ms = Date.now() - start;
      console.log(`   ${f.ext.padEnd(4)} ${String(w).padStart(4)}w  ${sz.padStart(5)} KB  (${ms} ms)`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  let files;
  if (args.length) {
    files = args.map((a) => (path.isAbsolute(a) ? a : path.join(ORIGINALS, a)));
  } else {
    const patterns = [...ACCEPTED].map((e) => `${ORIGINALS}/**/*${e}`);
    files = await glob(patterns, { nodir: true });
  }
  if (!files.length) {
    console.error('no input files');
    process.exit(1);
  }
  console.log(`processing ${files.length} file(s)`);
  for (const f of files) {
    try {
      await processFile(f);
    } catch (err) {
      console.error(`FAIL ${path.basename(f)}: ${err.message}`);
    }
  }
}

main();
