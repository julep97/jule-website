#!/usr/bin/env node
// One-off crop script: extract image regions from high-res page renders
// (dist-images/page-NN-2280w.jpg) and emit slot variants.
//
// Saves directly into dist-images/ as {slot}-{w}w.{ext}. Idempotent.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DIST = path.join(ROOT, 'dist-images');

const FORMATS = [
  { ext: 'avif', opts: { quality: 70, effort: 5 } },
  { ext: 'webp', opts: { quality: 88, effort: 6 } },
  { ext: 'jpg',  opts: { quality: 88, mozjpeg: true, progressive: true } },
];

// Crop boxes as fractions of the page (from visual inspection of the
// 2280×3225 page renders).
const CROPS = [
  {
    slot: 'p05-sauer1-detail',
    sourcePage: 6,
    box: { left: 0.06, top: 0.19, width: 0.88, height: 0.55 },
    widths: [800, 1200, 1920],
  },
  {
    slot: 'p08-sauer2-leuchtkasten',
    sourcePage: 9,
    box: { left: 0.04, top: 0.07, width: 0.92, height: 0.86 },
    widths: [800, 1200, 1920],
  },
  // Lachen — page 11 anwendung. Replaces broken p10-lachen-installation
  // (PDF embed had wrong image — see mapping.json _note).
  // NOTE: produced with one-off 600 DPI render (4961×7016) for crisp 1200/1920w.
  // Re-running this tool against the standard 2280w master will produce
  // lower-resolution variants — re-render at 600 DPI first if regenerating.
  {
    slot: 'p10-lachen-wand',
    sourcePage: 11,
    // narrow vertical strip — source crop ≈1215px wide at 600 DPI, 1920w skipped
    box: { left: 0.082, top: 0.155, width: 0.245, height: 0.515 },
    widths: [800, 1200],
  },
  {
    slot: 'p10-lachen-tisch',
    sourcePage: 11,
    box: { left: 0.345, top: 0.158, width: 0.40, height: 0.155 },
    widths: [800, 1200, 1920],
  },
  {
    slot: 'p10-lachen-konzept',
    sourcePage: 11,
    // doorway w/ red bbox grid scaled at human size — wall installation concept
    box: { left: 0.43, top: 0.366, width: 0.43, height: 0.49 },
    widths: [800, 1200, 1920],
  },
];

async function processCrop(c) {
  const src = path.join(DIST, `page-${String(c.sourcePage).padStart(2, '0')}-2280w.jpg`);
  const meta = await sharp(src).metadata();
  const left = Math.round(c.box.left * meta.width);
  const top = Math.round(c.box.top * meta.height);
  const w = Math.round(c.box.width * meta.width);
  const h = Math.round(c.box.height * meta.height);
  console.log(`\n→ ${c.slot}  ←  page-${c.sourcePage}-2280w  ${meta.width}×${meta.height}px`);
  console.log(`   crop: ${left},${top}  ${w}×${h}`);

  const cropped = sharp(src).extract({ left, top, width: w, height: h });

  for (const targetW of c.widths) {
    if (targetW > w) continue; // skip widths larger than crop
    for (const f of FORMATS) {
      const out = path.join(DIST, `${c.slot}-${targetW}w.${f.ext}`);
      const buf = await cropped.clone().resize({ width: targetW }).toFormat(f.ext === 'jpg' ? 'jpeg' : f.ext, f.opts).toBuffer();
      await fs.writeFile(out, buf);
      const sz = (buf.byteLength / 1024).toFixed(0);
      console.log(`   ${f.ext.padEnd(4)} ${String(targetW).padStart(4)}w  ${sz.padStart(5)} KB`);
    }
  }
}

for (const c of CROPS) await processCrop(c);
console.log(`\n done · ${CROPS.length} slots`);
