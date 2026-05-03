#!/usr/bin/env node
// Inject hidden <figcaption> per page in index.html using tools/page-text.json.
// Idempotent: removes any existing <figcaption class="page-text"> before injecting.
//
//   node tools/inject-page-text.mjs

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const HTML = path.join(ROOT, 'index.html');
const JSONP = path.join(ROOT, 'tools', 'page-text.json');

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function main() {
  let html = await fs.readFile(HTML, 'utf8');
  const data = JSON.parse(await fs.readFile(JSONP, 'utf8'));

  // Strip any prior injected captions so this is re-runnable.
  html = html.replace(/\s*<figcaption class="page-text"[^>]*>[\s\S]*?<\/figcaption>/g, '');

  let count = 0;
  for (const [pid, text] of Object.entries(data)) {
    if (pid.startsWith('_')) continue;
    const safe = escapeHtml(text);
    // Match the closing </section> that follows id="pN"
    const re = new RegExp(`(<section class="page" id="${pid}">[\\s\\S]*?<div class="num[^"]*">[^<]*<\\/div>)(\\s*<\\/section>)`);
    if (re.test(html)) {
      html = html.replace(re, `$1\n    <figcaption class="page-text">${safe}</figcaption>$2`);
      count++;
    }
  }

  await fs.writeFile(HTML, html);
  console.log(`injected hidden captions for ${count} pages`);
}

main().catch(e => { console.error(e); process.exit(1); });
