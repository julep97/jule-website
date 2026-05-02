#!/usr/bin/env node
// Liest tools/mapping.json (Slot-Key → Originaldatei) und erzeugt für jeden
// gemappten Slot AVIF + WebP + JPG in 4 Größen, benannt nach Slot-Key.
//
//   node tools/build-from-mapping.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const MAPPING = path.join(ROOT, 'tools', 'mapping.json');
const OUT = path.join(ROOT, 'dist-images');

const WIDTHS = [800, 1200, 1920, 2560];
const FORMATS = [
  { ext: 'avif', opts: { quality: 70, effort: 6 } },
  { ext: 'webp', opts: { quality: 88, effort: 6 } },
  { ext: 'jpg',  opts: { quality: 92, mozjpeg: true, progressive: true } },
];

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function processSlot(slotKey, sourcePath) {
  const absSource = path.join(ROOT, sourcePath);
  await fs.access(absSource);

  // Slot-Key ohne Extension als Basis
  const slotBase = slotKey.replace(/\.[^.]+$/, '');

  const stat = await fs.stat(absSource);
  const meta = await sharp(absSource, { limitInputPixels: false, unlimited: true }).metadata();
  const inputW = meta.width ?? 0;

  console.log(`\n→ ${slotKey}  ←  ${path.basename(sourcePath)}  (${meta.format}, ${inputW}×${meta.height}, ${(stat.size/1e6).toFixed(1)} MB)`);

  const targetWidths = WIDTHS.filter((w) => w <= inputW);
  if (targetWidths.length === 0 && inputW > 0) targetWidths.push(inputW);

  for (const w of targetWidths) {
    const resized = sharp(absSource, { limitInputPixels: false, unlimited: true })
      .rotate()
      .resize({ width: w, withoutEnlargement: true });

    for (const f of FORMATS) {
      const outPath = path.join(OUT, `${slotBase}-${w}w.${f.ext}`);
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
  await ensureDir(OUT);
  const raw = JSON.parse(await fs.readFile(MAPPING, 'utf8'));
  const entries = Object.entries(raw).filter(([k]) => !k.startsWith('_'));

  console.log(`processing ${entries.length} slot mappings…`);
  const t0 = Date.now();
  let ok = 0, fail = 0;
  for (const [slotKey, sourcePath] of entries) {
    try {
      await processSlot(slotKey, sourcePath);
      ok++;
    } catch (err) {
      console.error(`FAIL ${slotKey}  ←  ${sourcePath}: ${err.message}`);
      fail++;
    }
  }
  console.log(`\n done in ${((Date.now()-t0)/1000).toFixed(1)}s · ${ok} ok · ${fail} fail`);
  if (fail) process.exit(1);
}

main();
