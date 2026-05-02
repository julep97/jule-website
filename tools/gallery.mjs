#!/usr/bin/env node
// Erzeugt eine Thumbnail-Galerie aller Originale (480w WebP) plus eine HTML-Übersicht,
// damit das Mapping Original ↔ HTML-Slot bequem visuell gemacht werden kann.
//
//   node tools/gallery.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { glob } from 'glob';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const ORIGINALS = path.join(ROOT, 'originals');
const ORIGINALS_RESOLVED = path.join(ROOT, 'originals_resolved');
const GAL = path.join(ROOT, 'dist-images', '_gallery');
const ACCEPTED = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.heic', '.heif', '.webp'];

const SLOTS = [
  { key: '01-cover-hand-clean.png', section: 'Cover', desc: 'Hand hinter geripptem Textil — Hero' },
  { key: 'p05-sauer1-detail.png',   section: 'Nutritions / Sauer 1', desc: 'Filz-Kacheldetail' },
  { key: 'p06-sauer1-interior.png', section: 'Nutritions / Sauer 1', desc: 'Esszimmer-Visualisierung' },
  { key: 'p07-sauer2-a.png',        section: 'Nutritions / Sauer 2', desc: 'Genähte Blasen mit Schafswolle' },
  { key: 'p07-sauer2-b.png',        section: 'Nutritions / Sauer 1', desc: 'Modul-Detail (Caption: Sauer 1)' },
  { key: 'p07-sauer2-d.png',        section: 'Nutritions / Sauer 2', desc: 'Dunkles Material' },
  { key: 'p08-sauer2-leuchtkasten.png', section: 'Nutritions / Sauer 2', desc: 'Gerahmt vor Leuchtkästen' },
  { key: 'p09-lachen-b.png',        section: 'Nutritions / Lachen',  desc: 'Filzdetail' },
  { key: 'p09-lachen-e.png',        section: 'Nutritions / Lachen',  desc: 'Wandanwendung' },
  { key: 'p10-lachen-installation.png', section: 'Nutritions / Lachen', desc: 'Installations-Rendering' },
  { key: 'p12-portrait-full.png',   section: 'Objekt 70',  desc: 'Porträt' },
  { key: 'p17-ausstellung.png',     section: 'Objekt 70',  desc: 'Ausstellung Sehnsucht Wald — Textilmuseum' },
  { key: 'p19-office-a.png',        section: 'Objekt 70',  desc: 'Büroraum — Umsetzung 01' },
  { key: 'p19-office-b.png',        section: 'Objekt 70',  desc: 'Büroraum — Umsetzung 02' },
  { key: 'p20-rettungsschilder.png',section: 'Freie Arbeiten', desc: 'Rettungsschilder für Panikbetroffene' },
  { key: 'p22-freudenberg-a.png',   section: 'Freie Arbeiten', desc: 'Freudenberg — Dachhimmel' },
  { key: 'p24-muster.png',          section: 'Freie Arbeiten', desc: 'Muster — Holzweiler Rewilding' },
  { key: 'p26-kamm-curtain.png',    section: 'Freie Arbeiten', desc: 'Studie Kamm — Musterentwicklung' },
  { key: 'p27-seat.png',            section: 'Freie Arbeiten', desc: 'Take a SEAT! — Damast' },
  { key: 'p28-bloom.png',           section: 'Freie Arbeiten', desc: 'Flower Workshop Bloom' },
  { key: 'p29-inform-b.png',        section: 'Freie Arbeiten', desc: 'In Form Atelier' },
  { key: 'p30-outro.png',           section: 'Outro',          desc: 'Verschwommenes Schluss-Foto' },
];

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function makeThumb(file, outName) {
  const out = path.join(GAL, outName);
  try {
    await sharp(file, { limitInputPixels: false, unlimited: true })
      .rotate()
      .resize({ width: 480, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(out);
    const meta = await sharp(file, { limitInputPixels: false, unlimited: true }).metadata();
    return { ok: true, w: meta.width, h: meta.height, format: meta.format };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function main() {
  await ensureDir(GAL);
  const patterns = [
    ...ACCEPTED.map((e) => `${ORIGINALS}/*${e}`),
    ...ACCEPTED.map((e) => `${ORIGINALS_RESOLVED}/*${e}`),
  ];
  // Bei HEIC: JPEG-Variante aus originals_resolved/ bevorzugen, HEIC selbst überspringen
  const allFiles = await glob(patterns, { nodir: true });
  const resolvedBases = new Set(
    allFiles
      .filter((f) => f.startsWith(ORIGINALS_RESOLVED))
      .map((f) => path.basename(f, path.extname(f)))
  );
  const files = allFiles
    .filter((f) => {
      if (/\.(heic|heif)$/i.test(f)) {
        return !resolvedBases.has(path.basename(f, path.extname(f)));
      }
      return true;
    })
    .sort();
  console.log(`generating thumbnails for ${files.length} originals…`);

  const items = [];
  let i = 0;
  for (const f of files) {
    i++;
    const base = path.basename(f);
    const slug = base.replace(/[^a-zA-Z0-9]+/g, '_');
    const thumb = `${slug}.webp`;
    const stat = await fs.stat(f);
    process.stdout.write(`[${i}/${files.length}] ${base} … `);
    const r = await makeThumb(f, thumb);
    if (r.ok) {
      console.log(`${r.w}×${r.h} ${r.format}`);
      items.push({ base, thumb, w: r.w, h: r.h, sizeMB: stat.size/1e6 });
    } else {
      console.log(`SKIP (${r.error.slice(0, 80)})`);
    }
  }

  const slotRows = SLOTS.map((s, i) => `<tr>
    <td class="num">${String(i+1).padStart(2,'0')}</td>
    <td class="key"><code>${s.key}</code></td>
    <td>${s.section}</td>
    <td class="desc">${s.desc}</td>
  </tr>`).join('\n');

  const cards = items.map((it) => `<figure data-name="${it.base}">
    <div class="frame"><img src="${it.thumb}" alt="${it.base}" loading="lazy"/></div>
    <figcaption>
      <code>${it.base}</code><br/>
      <span class="meta">${it.w}×${it.h} · ${it.sizeMB.toFixed(1)} MB</span>
    </figcaption>
  </figure>`).join('\n');

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"/>
<title>Original-Galerie ↔ HTML-Slots</title>
<style>
  body{margin:0;background:#1a1a1a;color:#eee;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;padding:24px}
  h1,h2{font-weight:500;margin:0 0 12px}
  h1{font-size:22px} h2{font-size:18px;margin-top:32px}
  .lead{color:#999;max-width:64ch;margin:0 0 24px;line-height:1.5}
  table{width:100%;border-collapse:collapse;background:#222;border-radius:6px;overflow:hidden}
  th,td{padding:8px 12px;border-bottom:1px solid #333;text-align:left;vertical-align:top;font-size:13px}
  th{background:#2a2a2a;color:#aaa;font-weight:500;text-transform:uppercase;letter-spacing:.04em;font-size:11px}
  td.num{color:#888;width:40px}
  td.key code{color:#9ecbff;font-size:12px}
  td.desc{color:#bbb}
  .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-top:16px}
  figure{margin:0;background:#222;border-radius:6px;overflow:hidden}
  .frame{aspect-ratio:1/1;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .frame img{max-width:100%;max-height:100%;display:block}
  figcaption{padding:8px 10px;font-size:11px;line-height:1.45;color:#ccc;border-top:1px solid #333;word-break:break-all}
  figcaption code{color:#9ecbff;font-size:11px}
  .meta{color:#888}
</style>
</head><body>
<h1>Mapping-Übersicht — Jule Plaehn Portfolio</h1>
<p class="lead">Oben: alle ${SLOTS.length} HTML-Bildslots der Site. Unten: alle ${items.length} verfügbaren Originale aus dem InDesign-Paket. Welches Original gehört in welchen Slot? Notiere Paare im Format <code>"&lt;slot-key&gt;": "&lt;original-filename&gt;"</code>.</p>
<h2>HTML-Slots</h2>
<table>
  <thead><tr><th>#</th><th>Slot-Key (HTML)</th><th>Sektion</th><th>Beschreibung</th></tr></thead>
  <tbody>${slotRows}</tbody>
</table>
<h2>Originale (${items.length})</h2>
<div class="gallery">${cards}</div>
</body></html>`;

  await fs.writeFile(path.join(GAL, 'index.html'), html);
  console.log(`\nopen ${path.join(GAL, 'index.html')}`);
}

main();
