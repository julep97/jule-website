#!/usr/bin/env node
// Playwright-Snapshots der Site fuer Visual-Regression-Testing.
//
// Modus:
//   node tools/snapshot.mjs baseline   -> tests/baseline/
//   node tools/snapshot.mjs current    -> tests/current/
//
// URL ueber env BASE_URL (default: live site)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const BASE_URL = process.env.BASE_URL || 'https://julep97.github.io/jule-website/';
const MODE = process.argv[2] === 'current' ? 'current' : 'baseline';
const OUT = path.join(ROOT, 'tests', MODE);

// Anker-Pages (siehe Plan T3)
const ANCHORS = [1, 3, 4, 12, 15, 19, 20, 30];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 375,  height: 812 },
];

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

async function loadAllImages(page) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('picture img'));
    imgs.forEach(i => { i.loading = 'eager'; i.decoding = 'sync'; });
    for (let y = 0; y < document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
    await Promise.all(imgs.map(i => i.complete ? Promise.resolve() :
      new Promise(r => { i.onload = r; i.onerror = r; })));
    await new Promise(r => setTimeout(r, 600));
  });
}

async function snapshotPage(page, pn, vp) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + rect.top - 60);
  }, `p${pn}`);
  await page.waitForTimeout(400);
  const slot = `${vp.name}-p${String(pn).padStart(2, '0')}.png`;
  const out = path.join(OUT, slot);
  await page.screenshot({ path: out, fullPage: false, type: 'png' });
  return slot;
}

async function main() {
  await ensureDir(OUT);
  console.log(`mode=${MODE}  url=${BASE_URL}  out=${path.relative(ROOT, OUT)}`);
  const browser = await chromium.launch();
  let count = 0;

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await loadAllImages(page);

    for (const pn of ANCHORS) {
      const slot = await snapshotPage(page, pn, vp);
      console.log(`  ${slot}`);
      count++;
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\n done · ${count} snapshots`);
}

main().catch(err => { console.error(err); process.exit(1); });
