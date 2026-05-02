#!/usr/bin/env node
// Liest index.html, ersetzt alle <img src="images/SLOT.png" ...> durch
// <picture>-Blöcke mit AVIF/WebP/JPG-srcsets, die auf R2 zeigen. Greift dabei
// auf die in dist-images/ tatsächlich vorhandenen Variants zurück.
//
// JavaScript-Lightbox-Daten (`img: 'images/...'`) werden auf die WebP-2560w-URL
// umgestellt — Lightbox-Bild lädt einmalig, kein srcset nötig.
//
//   node tools/transform-html.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const HTML = path.join(ROOT, 'index.html');
const DIST = path.join(ROOT, 'dist-images');
const R2 = 'https://pub-45145834ff2b45db8a585cff5b669e13.r2.dev';
const SIZES = '(max-width: 860px) 100vw, calc(100vw - 220px)';

async function buildVariantMap() {
  const files = await glob([`${DIST}/*.{avif,webp,jpg}`], { nodir: true });
  // Map: slotBase -> { avif: [{w, name}], webp: [...], jpg: [...] }
  const map = new Map();
  for (const f of files) {
    const name = path.basename(f);
    const m = name.match(/^(.+)-(\d+)w\.(avif|webp|jpg)$/);
    if (!m) continue;
    const [, base, wStr, ext] = m;
    const w = parseInt(wStr, 10);
    if (!map.has(base)) map.set(base, { avif: [], webp: [], jpg: [] });
    map.get(base)[ext].push({ w, name });
  }
  for (const v of map.values()) {
    for (const e of ['avif', 'webp', 'jpg']) v[e].sort((a, b) => a.w - b.w);
  }
  return map;
}

function srcset(arr) {
  return arr.map((v) => `${R2}/${v.name} ${v.w}w`).join(', ');
}

function buildPicture(slotKey, variants, alt, extraAttrs) {
  const slotBase = slotKey.replace(/\.[^.]+$/, '');
  const v = variants.get(slotBase);
  if (!v || v.jpg.length === 0) {
    // Keine Varianten -> Original-img unverändert lassen
    return null;
  }
  const fallback = v.jpg[v.jpg.length - 1]; // größte JPG als <img src>
  const lines = [];
  lines.push('<picture>');
  if (v.avif.length) lines.push(`<source type="image/avif" srcset="${srcset(v.avif)}" sizes="${SIZES}">`);
  if (v.webp.length) lines.push(`<source type="image/webp" srcset="${srcset(v.webp)}" sizes="${SIZES}">`);
  const jpgSet = v.jpg.length > 1 ? ` srcset="${srcset(v.jpg)}" sizes="${SIZES}"` : '';
  const attrs = extraAttrs ? ` ${extraAttrs}` : '';
  lines.push(`<img src="${R2}/${fallback.name}"${jpgSet} alt="${alt}" loading="lazy"${attrs}>`);
  lines.push('</picture>');
  return lines.join('');
}

async function main() {
  let html = await fs.readFile(HTML, 'utf8');
  const variants = await buildVariantMap();
  console.log(`variants for ${variants.size} slots loaded from dist-images/`);

  // 1) <img src="images/SLOT.png" alt="..." [other-attrs]/>
  // Greedy aber kontrolliert: ein einzelnes Self-Closing <img>-Tag pro Replacement.
  const imgRegex = /<img\s+src="images\/([^"]+)"\s+alt="([^"]*)"([^/>]*?)\/?>/g;

  let replaced = 0, skipped = 0, kept = 0;
  html = html.replace(imgRegex, (full, slotKey, alt, rest) => {
    const extra = rest.trim();
    const pic = buildPicture(slotKey, variants, alt, extra);
    if (pic) { replaced++; return pic; }
    kept++;
    return full;
  });

  // 2) JS-Lightbox-Data: img: 'images/SLOT.png'  -> R2 WebP 2560w (oder größte WebP)
  const jsRegex = /img:\s*'images\/([^']+)'/g;
  html = html.replace(jsRegex, (full, slotKey) => {
    const slotBase = slotKey.replace(/\.[^.]+$/, '');
    const v = variants.get(slotBase);
    if (!v || v.webp.length === 0) { skipped++; return full; }
    const biggest = v.webp[v.webp.length - 1];
    return `img: '${R2}/${biggest.name}'`;
  });

  await fs.writeFile(HTML, html);
  console.log(`<img> replacements: ${replaced} replaced, ${kept} kept (no variants)`);
}

main();
