#!/usr/bin/env node
// Rendert jede Seite von portfolio2.pdf als optimierte AVIF/WebP/JPG-Variante
// in 3 Breiten (760w, 1520w, 2280w) nach dist-images/page-NN-{w}.{ext}.
//
// Pipeline: pdftoppm -r 300 -png  ->  Temp-PNG je Seite
//        -> sharp resize+encode  ->  3 Breiten x 3 Formate
//
//   node tools/render-pdf-pages.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const exec = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const PDF = path.join(ROOT, 'portfolio2 Ordner2', 'portfolio2.pdf');
const OUT = path.join(ROOT, 'dist-images');

const WIDTHS = [760, 1520, 2280];
const FORMATS = [
  { ext: 'avif', opts: { quality: 70, effort: 5 } },
  { ext: 'webp', opts: { quality: 88, effort: 6 } },
  { ext: 'jpg',  opts: { quality: 88, mozjpeg: true, progressive: true } },
];
const PAGE_COUNT = 30;
const RENDER_DPI = 300; // hi-res master, downsized via sharp for each width

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function renderPage(tempDir, pageNum) {
  // pdftoppm uses 1-based -f/-l. Output prefix gets `-NN.png` suffix.
  const prefix = path.join(tempDir, `p`);
  await exec('pdftoppm', [
    '-r', String(RENDER_DPI),
    '-f', String(pageNum), '-l', String(pageNum),
    '-png',
    PDF, prefix,
  ]);
  // pdftoppm pads to width matching total page count digits. For 30 pages, that's `-NN`.
  const padded = String(pageNum).padStart(2, '0');
  const candidate1 = `${prefix}-${padded}.png`;
  const candidate2 = `${prefix}-${pageNum}.png`;
  for (const c of [candidate1, candidate2]) {
    try { await fs.access(c); return c; } catch {}
  }
  throw new Error(`pdftoppm output not found for page ${pageNum}`);
}

async function processPage(pageNum, srcPng) {
  const slot = `page-${String(pageNum).padStart(2, '0')}`;
  const meta = await sharp(srcPng).metadata();
  console.log(`\n→ ${slot}  ${meta.width}×${meta.height}px master`);

  for (const w of WIDTHS) {
    const targetW = Math.min(w, meta.width);
    const base = sharp(srcPng).resize({ width: targetW, withoutEnlargement: true });
    for (const f of FORMATS) {
      const outPath = path.join(OUT, `${slot}-${w}w.${f.ext}`);
      const t0 = Date.now();
      const buf = await base.clone().toFormat(f.ext === 'jpg' ? 'jpeg' : f.ext, f.opts).toBuffer();
      await fs.writeFile(outPath, buf);
      const sz = (buf.byteLength / 1024).toFixed(0);
      console.log(`   ${f.ext.padEnd(4)} ${String(w).padStart(4)}w  ${sz.padStart(5)} KB  (${Date.now()-t0} ms)`);
    }
  }
}

async function main() {
  await ensureDir(OUT);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jule-render-'));
  console.log(`temp dir: ${tempDir}`);

  const t0 = Date.now();
  let ok = 0, fail = 0;
  for (let p = 1; p <= PAGE_COUNT; p++) {
    try {
      const png = await renderPage(tempDir, p);
      await processPage(p, png);
      await fs.unlink(png).catch(() => {});
      ok++;
    } catch (err) {
      console.error(`FAIL page ${p}: ${err.message}`);
      fail++;
    }
  }
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  console.log(`\n done in ${((Date.now()-t0)/1000).toFixed(1)}s · ${ok} ok · ${fail} fail`);
  if (fail) process.exit(1);
}

main();
