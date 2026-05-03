#!/usr/bin/env node
// Vergleicht tests/current/*.png gegen tests/baseline/*.png mit pixelmatch.
// Schreibt diff-PNGs in tests/diff/ und einen HTML-Report.
//
// Exit-Code: != 0 wenn irgendein Diff > THRESHOLD%
//
//   node tools/diff-baseline.mjs [--threshold 5]

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const BASE = path.join(ROOT, 'tests', 'baseline');
const CURR = path.join(ROOT, 'tests', 'current');
const DIFF = path.join(ROOT, 'tests', 'diff');

const ARGS = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]]);
  return a;
}, []));
const THRESHOLD_PCT = parseFloat(ARGS.threshold || '5');

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
async function readPNG(p) {
  const buf = await fs.readFile(p);
  return PNG.sync.read(buf);
}

async function diffPair(name) {
  const aPath = path.join(BASE, name);
  const bPath = path.join(CURR, name);
  const oPath = path.join(DIFF, name);
  const aExists = await fs.access(aPath).then(() => true).catch(() => false);
  const bExists = await fs.access(bPath).then(() => true).catch(() => false);
  if (!aExists) return { name, status: 'NO_BASELINE' };
  if (!bExists) return { name, status: 'NO_CURRENT' };

  const a = await readPNG(aPath);
  const b = await readPNG(bPath);
  // Sizes can differ if viewport changed; normalize to min dims
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const sizeMismatch = a.width !== b.width || a.height !== b.height;

  const out = new PNG({ width: w, height: h });
  let diff;
  try {
    diff = pixelmatch(
      cropPNG(a, w, h).data,
      cropPNG(b, w, h).data,
      out.data, w, h,
      { threshold: 0.1, alpha: 0.4, includeAA: true }
    );
  } catch (e) {
    return { name, status: 'ERROR', err: e.message };
  }
  await fs.writeFile(oPath, PNG.sync.write(out));

  const total = w * h;
  const ratio = (diff / total) * 100;
  return {
    name, status: ratio <= THRESHOLD_PCT ? 'OK' : 'DRIFT',
    diff, total, ratio, sizeMismatch,
    aSize: `${a.width}x${a.height}`, bSize: `${b.width}x${b.height}`,
  };
}

function cropPNG(src, w, h) {
  if (src.width === w && src.height === h) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    src.data.copy(out.data, y * w * 4, y * src.width * 4, y * src.width * 4 + w * 4);
  }
  return out;
}

async function main() {
  await ensureDir(DIFF);

  const baselineFiles = await glob(`${BASE}/*.png`, { nodir: true });
  if (baselineFiles.length === 0) {
    console.error(`no baseline found in ${BASE}. run: npm run test:baseline`);
    process.exit(2);
  }
  const names = baselineFiles.map(f => path.basename(f)).sort();
  console.log(`comparing ${names.length} pairs (threshold=${THRESHOLD_PCT}%)\n`);

  const results = [];
  for (const name of names) {
    const r = await diffPair(name);
    results.push(r);
    if (r.status === 'OK') console.log(`  [OK]    ${name}  ${r.ratio.toFixed(2)}%`);
    else if (r.status === 'DRIFT') console.log(`  [DRIFT] ${name}  ${r.ratio.toFixed(2)}%${r.sizeMismatch ? '  (size mismatch '+r.aSize+' vs '+r.bSize+')' : ''}`);
    else console.log(`  [${r.status}] ${name}  ${r.err || ''}`);
  }

  // HTML report
  const rows = results.map(r => {
    const color = r.status === 'OK' ? '#c8e6c9' : r.status === 'DRIFT' ? '#f8d7da' : '#eee';
    const ratio = typeof r.ratio === 'number' ? r.ratio.toFixed(2) + '%' : '-';
    return `<tr style="background:${color}">
      <td><b>${r.name}</b><br><small>${r.status}${r.sizeMismatch ? ' · size mismatch' : ''}</small></td>
      <td>${ratio}</td>
      <td><img src="../baseline/${r.name}" width="280" loading="lazy"></td>
      <td><img src="../current/${r.name}" width="280" loading="lazy"></td>
      <td>${r.status === 'OK' || r.status === 'DRIFT' ? `<img src="${r.name}" width="280" loading="lazy">` : ''}</td>
    </tr>`;
  }).join('\n');

  const ok = results.filter(r => r.status === 'OK').length;
  const drift = results.filter(r => r.status === 'DRIFT').length;
  const other = results.length - ok - drift;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>visual diff</title>
<style>body{font-family:system-ui,sans-serif;margin:18px;background:#f7f4ee;color:#221}
table{border-collapse:collapse;width:100%}th,td{padding:8px;vertical-align:top;border-bottom:1px solid #ccc;font-size:13px;text-align:left}
th{background:#221;color:#fff;font-size:12px;letter-spacing:.05em}
img{display:block;border:1px solid #ddd;max-width:100%}
small{color:#666;font-family:"JetBrains Mono",monospace;font-size:11px}
.summary{padding:12px;margin-bottom:18px;background:#fff;border-radius:4px;font-family:"JetBrains Mono",monospace}
</style></head><body>
<h1>visual diff: baseline vs current</h1>
<div class="summary">
<b>${results.length} pairs</b> · threshold ${THRESHOLD_PCT}%<br>
<span style="color:#2e7d32">${ok} OK</span> ·
<span style="color:#c62828">${drift} DRIFT</span> ·
<span style="color:#888">${other} other</span>
</div>
<table><thead><tr><th>Slot</th><th>Diff</th><th>Baseline</th><th>Current</th><th>Diff PNG</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;

  await fs.writeFile(path.join(DIFF, 'diff-report.html'), html);
  console.log(`\n report: tests/diff/diff-report.html`);
  console.log(` ${ok} OK · ${drift} DRIFT · ${other} other`);

  if (drift > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
