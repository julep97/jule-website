#!/usr/bin/env node
// Verifiziert tools/mapping.json gegen die PDF-Extrakte in originals_pdf/.
// Fuer jeden Slot mit `pdfPage` wird der pHash des Originals (mapping.original)
// gegen jeden PDF-Extrakt der Seite verglichen (Hamming-Distanz auf 64-Bit-Hash).
// Berichtet Top-Match pro Slot + Distanz; rendert HTML-Report.
//
// Schwellen (64-Bit Hash):
//   <= 8 Bit  -> OK    (sehr wahrscheinlich gleiches Bild)
//    9 - 15   -> WARN  (aehnlich, ggf. anderer Crop / Recompression)
//   > 15      -> ERROR (vermutlich verschiedenes Bild -> Mapping pruefen)
//
//   node tools/verify-mapping.mjs [--quiet]

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import sharp from 'sharp';
import phash from 'sharp-phash';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const MAPPING = path.join(ROOT, 'tools', 'mapping.json');
const PDF_DIR = path.join(ROOT, 'originals_pdf');
const REPORT_DIR = path.join(ROOT, 'dist-images', '_verify');

const QUIET = process.argv.includes('--quiet');

const OK_MAX = 8;
const WARN_MAX = 15;

function hammingHex(a, b) {
  // sharp-phash gibt einen Bit-String '01010..' (64 chars). Hamming = char-diff.
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

async function readImageBuffer(absPath) {
  // sharp-phash erwartet einen Buffer (PNG/JPEG/etc), aber NICHT TIFF mit ICC-Profilen.
  // Wir normalisieren: 256x256 raw RGB via sharp, dann phash() consumiert den buffer.
  // sharp-phash akzeptiert tatsaechlich raw oder image-buffer; ich gebe ihm einen JPEG buffer.
  const buf = await sharp(absPath, { limitInputPixels: false, unlimited: true })
    .rotate()
    .resize(512, 512, { fit: 'inside' })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buf;
}

async function hashFile(absPath) {
  try {
    const buf = await readImageBuffer(absPath);
    return await phash(buf);
  } catch (e) {
    return null;
  }
}

async function loadMapping() {
  const raw = JSON.parse(await fs.readFile(MAPPING, 'utf8'));
  const out = [];
  for (const [slotKey, val] of Object.entries(raw)) {
    if (slotKey.startsWith('_')) continue;
    if (!val || typeof val !== 'object') continue;
    out.push({
      slotKey,
      original: val.original,
      pdfPage: val.pdfPage,
      cropStrategy: val.cropStrategy,
      note: val._note || '',
    });
  }
  return out;
}

async function pdfExtractsForPage(page) {
  if (typeof page !== 'number') return [];
  const padded = String(page).padStart(3, '0');
  return glob(`${PDF_DIR}/p-${padded}-*.{jpg,jpeg,png}`, { nodir: true });
}

async function thumb(absPath, slotName) {
  // Erzeuge Thumb fuer HTML-Report
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const thumbName = `${slotName}.jpg`;
  const out = path.join(REPORT_DIR, thumbName);
  try {
    await sharp(absPath, { limitInputPixels: false, unlimited: true })
      .rotate()
      .resize(360, 360, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toFile(out);
    return thumbName;
  } catch (e) {
    return null;
  }
}

function classify(distance) {
  if (distance <= OK_MAX) return 'OK';
  if (distance <= WARN_MAX) return 'WARN';
  return 'ERROR';
}

async function main() {
  const slots = await loadMapping();
  console.log(`verifying ${slots.length} slots…`);
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const results = [];
  let okCount = 0, warnCount = 0, errCount = 0, skipCount = 0;

  for (const s of slots) {
    if (!s.pdfPage) {
      skipCount++;
      results.push({ ...s, status: 'SKIP', reason: 'no pdfPage' });
      continue;
    }
    const origAbs = path.join(ROOT, s.original);
    const origExists = await fs.access(origAbs).then(() => true).catch(() => false);
    if (!origExists || s.original.includes('?')) {
      skipCount++;
      results.push({ ...s, status: 'SKIP', reason: `original missing or placeholder: ${s.original}` });
      continue;
    }

    const pdfExtracts = await pdfExtractsForPage(s.pdfPage);
    if (pdfExtracts.length === 0) {
      skipCount++;
      results.push({ ...s, status: 'SKIP', reason: `no PDF extracts for page ${s.pdfPage}` });
      continue;
    }

    const origHash = await hashFile(origAbs);
    if (!origHash) {
      skipCount++;
      results.push({ ...s, status: 'SKIP', reason: 'failed to hash original' });
      continue;
    }

    let bestDist = Infinity, bestPath = null;
    for (const ex of pdfExtracts) {
      const exHash = await hashFile(ex);
      if (!exHash) continue;
      const d = hammingHex(origHash, exHash);
      if (d < bestDist) { bestDist = d; bestPath = ex; }
    }

    const status = classify(bestDist);
    if (status === 'OK') okCount++;
    else if (status === 'WARN') warnCount++;
    else errCount++;

    const origThumb = await thumb(origAbs, `${s.slotKey.replace(/\.[^.]+$/, '')}-orig`);
    const pdfThumb = bestPath ? await thumb(bestPath, `${s.slotKey.replace(/\.[^.]+$/, '')}-pdf`) : null;

    results.push({
      ...s,
      status,
      distance: bestDist,
      bestPdfMatch: bestPath ? path.relative(ROOT, bestPath) : null,
      pdfCandidatesCount: pdfExtracts.length,
      origThumb,
      pdfThumb,
    });

    if (!QUIET) {
      console.log(`  [${status}] ${s.slotKey}  dist=${bestDist}  pdf=${bestPath ? path.basename(bestPath) : '(none)'}`);
    }
  }

  // Sortiere: ERROR -> WARN -> OK -> SKIP
  const order = { ERROR: 0, WARN: 1, OK: 2, SKIP: 3 };
  results.sort((a, b) => (order[a.status] - order[b.status]) || ((b.distance || 0) - (a.distance || 0)));

  // HTML-Report
  const rows = results.map(r => {
    const color = r.status === 'OK' ? '#c8e6c9' : r.status === 'WARN' ? '#fff3cd' : r.status === 'ERROR' ? '#f8d7da' : '#eee';
    const origImg = r.origThumb ? `<img src="${r.origThumb}" width="180">` : '<i>(no thumb)</i>';
    const pdfImg = r.pdfThumb ? `<img src="${r.pdfThumb}" width="180">` : '<i>(no thumb)</i>';
    const note = r.note || r.reason || '';
    return `<tr style="background:${color}">
      <td><b>${r.slotKey}</b><br><small>p.${r.pdfPage || '?'} · ${r.cropStrategy || ''}</small></td>
      <td>${origImg}<br><small>${r.original || ''}</small></td>
      <td>${pdfImg}<br><small>${r.bestPdfMatch || ''}</small></td>
      <td><b>${r.status}</b><br>dist=${r.distance ?? '-'}<br><small>${note}</small></td>
    </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>mapping verify</title>
<style>body{font-family:system-ui,sans-serif;margin:20px;background:#f7f4ee;color:#221}
table{border-collapse:collapse;width:100%}td{padding:8px;vertical-align:top;border-bottom:1px solid #ccc;font-size:13px}
th{padding:8px;text-align:left;background:#221;color:#fff;font-size:12px;letter-spacing:.05em}
img{display:block;border:1px solid #ddd}
small{color:#666;font-family:"JetBrains Mono",monospace;font-size:11px;word-break:break-all}
.summary{padding:12px;margin-bottom:20px;background:#fff;border-radius:4px;font-family:"JetBrains Mono",monospace}
.OK{color:#2e7d32}.WARN{color:#f57c00}.ERROR{color:#c62828}.SKIP{color:#888}
</style></head><body>
<h1>mapping.json verify report</h1>
<div class="summary">
<b>${results.length} slots</b> ·
<span class="OK">${okCount} OK</span> ·
<span class="WARN">${warnCount} WARN</span> ·
<span class="ERROR">${errCount} ERROR</span> ·
<span class="SKIP">${skipCount} SKIP</span><br>
<small>OK: hamming &lt;= ${OK_MAX} · WARN: ${OK_MAX + 1}-${WARN_MAX} · ERROR: &gt; ${WARN_MAX}</small>
</div>
<table><thead><tr><th>Slot</th><th>Original</th><th>Best PDF Match</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;

  await fs.writeFile(path.join(REPORT_DIR, 'index.html'), html);
  console.log(`\n report: ${path.relative(ROOT, REPORT_DIR)}/index.html`);
  console.log(` ${okCount} OK · ${warnCount} WARN · ${errCount} ERROR · ${skipCount} SKIP`);

  if (errCount > 0) process.exit(1);
}

main();
