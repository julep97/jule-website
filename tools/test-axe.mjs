#!/usr/bin/env node
// axe-core a11y check via Playwright (umgeht ChromeDriver-Version-Mismatch).
//
//   node tools/test-axe.mjs [URL]

import { chromium } from 'playwright';
import AxeBuilderPkg from '@axe-core/playwright';
const AxeBuilder = AxeBuilderPkg.default || AxeBuilderPkg.AxeBuilder || AxeBuilderPkg;

const URL = process.argv[2] || process.env.BASE_URL || 'http://localhost:8080/';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const critical = results.violations.filter(v => v.impact === 'critical');
  const serious  = results.violations.filter(v => v.impact === 'serious');
  const moderate = results.violations.filter(v => v.impact === 'moderate');
  const minor    = results.violations.filter(v => v.impact === 'minor');

  console.log(`axe a11y · ${URL}`);
  console.log(`  passes:   ${results.passes.length}`);
  console.log(`  CRITICAL: ${critical.length}`);
  console.log(`  SERIOUS:  ${serious.length}`);
  console.log(`  moderate: ${moderate.length}`);
  console.log(`  minor:    ${minor.length}\n`);

  for (const v of [...critical, ...serious, ...moderate, ...minor]) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
    console.log(`     ${v.helpUrl}`);
    for (const n of v.nodes) {
      console.log(`     - ${n.target.join(' ')}`);
      if (n.failureSummary) console.log(`       ${n.failureSummary.split('\n').slice(0,3).join(' / ')}`);
    }
  }

  await browser.close();
  if (critical.length || serious.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
