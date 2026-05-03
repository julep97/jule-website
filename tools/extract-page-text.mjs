#!/usr/bin/env node
// Extract page-by-page text from portfolio2.pdf via pdftotext,
// write tools/page-text.json with { p1: "...", p2: "...", ... }.
// Used as source for B4 hidden captions.
//
//   node tools/extract-page-text.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const PDF = path.join(ROOT, 'portfolio2 Ordner2', 'portfolio2.pdf');
const TXT = '/tmp/portfolio2.txt';
const OUT = path.join(ROOT, 'tools', 'page-text.json');

async function main() {
  await exec('pdftotext', ['-layout', PDF, TXT]);
  const raw = await fs.readFile(TXT, 'utf8');
  const pages = raw.split('\f');
  const out = {};
  for (let i = 0; i < pages.length && i < 30; i++) {
    const text = pages[i].split('\n').map(l => l.trim()).filter(Boolean).join(' ');
    if (text) out[`p${i + 1}`] = text;
  }
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`extracted text for ${Object.keys(out).length} pages -> ${path.relative(ROOT, OUT)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
