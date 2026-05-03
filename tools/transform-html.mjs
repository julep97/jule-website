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
const MAPPING = path.join(ROOT, 'tools', 'mapping.json');
const R2 = 'https://pub-45145834ff2b45db8a585cff5b669e13.r2.dev';
const SIZES = '(max-width: 860px) 100vw, calc(100vw - 220px)';

async function loadMappingMeta() {
  // Slot-Base (ohne .png) → { aspectRatio, focal:[x,y], cropStrategy }
  const out = new Map();
  try {
    const raw = JSON.parse(await fs.readFile(MAPPING, 'utf8'));
    for (const [slotKey, val] of Object.entries(raw)) {
      if (slotKey.startsWith('_') || typeof val !== 'object' || !val) continue;
      const base = slotKey.replace(/\.[^.]+$/, '');
      out.set(base, {
        aspectRatio: val.aspectRatio || null,
        focal: Array.isArray(val.focal) ? val.focal : [0.5, 0.5],
        cropStrategy: val.cropStrategy || 'focal',
      });
    }
  } catch (e) {
    console.warn(`mapping.json not loadable for meta: ${e.message}`);
  }
  return out;
}

function pictureStyleFor(meta) {
  if (!meta) return '';
  const fx = (meta.focal[0] * 100).toFixed(1) + '%';
  const fy = (meta.focal[1] * 100).toFixed(1) + '%';
  const ar = meta.aspectRatio ? `--aspect-ratio:${meta.aspectRatio};` : '';
  return ` style="--focus-x:${fx};--focus-y:${fy};${ar}" data-crop="${meta.cropStrategy}"`;
}

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

function buildPicture(slotKey, variants, alt, extraAttrs, meta) {
  const slotBase = slotKey.replace(/\.[^.]+$/, '');
  const v = variants.get(slotBase);
  if (!v || v.jpg.length === 0) {
    // Keine Varianten -> Original-img unverändert lassen
    return null;
  }
  const fallback = v.jpg[v.jpg.length - 1]; // größte JPG als <img src>
  const lines = [];
  lines.push(`<picture${pictureStyleFor(meta)}>`);
  if (v.avif.length) lines.push(`<source type="image/avif" srcset="${srcset(v.avif)}" sizes="${SIZES}">`);
  if (v.webp.length) lines.push(`<source type="image/webp" srcset="${srcset(v.webp)}" sizes="${SIZES}">`);
  const jpgSet = v.jpg.length > 1 ? ` srcset="${srcset(v.jpg)}" sizes="${SIZES}"` : '';
  const attrs = extraAttrs ? ` ${extraAttrs}` : '';
  lines.push(`<img src="${R2}/${fallback.name}"${jpgSet} alt="${alt}" loading="lazy"${attrs}>`);
  lines.push('</picture>');
  return lines.join('');
}

function annotateExistingPictures(html, mappingMeta) {
  // Findet bereits transformierte <picture>...<img src=".../SLOTBASE-NNNw.ext..."...>...</picture>
  // und fuegt CSS-Custom-Props (--focus-x/y, --aspect-ratio, data-crop) am <picture>-Tag hinzu.
  // Slot-Base wird aus dem ersten URL-Match in der picture-Section extrahiert.
  let count = 0;
  const out = html.replace(/<picture(\s[^>]*?)?>([\s\S]*?)<\/picture>/g, (full, attrs, inner) => {
    // Skip falls schon --focus-x gesetzt
    if (attrs && attrs.includes('--focus-x')) return full;
    const m = inner.match(/\/([a-z0-9_-]+?)-\d+w\.(?:avif|webp|jpg)/i);
    if (!m) return full;
    const slotBase = m[1];
    const meta = mappingMeta.get(slotBase);
    if (!meta) return full;
    const styleAttr = pictureStyleFor(meta).trim(); // " style=\"...\" data-crop=\"...\""
    count++;
    return `<picture ${styleAttr}>${inner}</picture>`;
  });
  return { html: out, count };
}

async function main() {
  let html = await fs.readFile(HTML, 'utf8');
  const variants = await buildVariantMap();
  const mappingMeta = await loadMappingMeta();
  console.log(`variants for ${variants.size} slots loaded from dist-images/`);
  console.log(`mapping meta for ${mappingMeta.size} slots loaded`);

  // 1) <img src="images/SLOT.png" alt="..." [other-attrs]/>
  // Greedy aber kontrolliert: ein einzelnes Self-Closing <img>-Tag pro Replacement.
  const imgRegex = /<img\s+src="images\/([^"]+)"\s+alt="([^"]*)"([^/>]*?)\/?>/g;

  let replaced = 0, skipped = 0, kept = 0;
  html = html.replace(imgRegex, (full, slotKey, alt, rest) => {
    const extra = rest.trim();
    const slotBase = slotKey.replace(/\.[^.]+$/, '');
    const meta = mappingMeta.get(slotBase);
    const pic = buildPicture(slotKey, variants, alt, extra, meta);
    if (pic) { replaced++; return pic; }
    kept++;
    return full;
  });

  // 1b) Annotiere bereits transformierte <picture>-Bloecke mit Focal-Point-Props
  const annotated = annotateExistingPictures(html, mappingMeta);
  html = annotated.html;

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
  console.log(`<picture> annotations: ${annotated.count} updated with focal-point props`);
}

main();
