# Jule Website — Portfolio for Jule Plaehn (Textile Design)

Online-Portfolio für Jule Plaehn (26, Krefeld, Textile Design). Editorial-Site auf
Astro 5, Print-Mirror der `portfolio2.pdf` als `/print/`-Subroute.

- **Live:** https://julep97.github.io/jule-website/
- **Repo:** `julep97/jule-website` (Owner: jule, Collaborator: tctablet)
- **Account:** jule.plaehn@web.de
- **Lokale git identity:** Philip Grothe / philip-grothe@web.de (Co-Author "Claude Opus 4.7")

## Routes

| URL | Inhalt | Source |
|---|---|---|
| `/` | Editorial Hero + Projekt-Index (6 Projekte, 2 live + 4 wip) | `src/pages/index.astro` (data-driven aus `src/data/projects.ts`) |
| `/work/sauer-1/` | **live** — Filz-Kreismuster + Esszimmer-Anwendung | `src/pages/work/sauer-1.astro` |
| `/work/sauer-2/` | **live** — Schafswoll-Blasen Gallery + Leuchtkasten-Installation | `src/pages/work/sauer-2.astro` |
| `/work/lachen/` | wip | — |
| `/work/objekt-siebzig/` | wip — Atemführungs-Station, größtes Projekt | — |
| `/work/materialitaet/` | wip — Freudenberg Auto-Innenraum | — |
| `/work/muster-rewilding/` | wip — Holzweiler-Kollektion | — |
| `/print/` | Print-Mirror — alle 30 PDF-Seiten als `<picture>` mit Lightbox, Hotspots, hidden Captions | `public/print/index.html` (Phase B) |

## Architektur

```
GitHub Pages (julep97/jule-website)              ← Astro build (dist/) ~5 MB
   └─ Auto-Deploy via .github/workflows/pages.yml: npm ci && npm run build → upload dist/
        │
        │  <picture> srcset references (cache-busted via ?v=<unix-ts>)
        ▼
Cloudflare R2 (Bucket: jule-images)              ← Bilder, ~110 MB
   └─ Public-URL: https://pub-45145834ff2b45db8a585cff5b669e13.r2.dev
   └─ Cloudflare Account ID: b0c5ca997d57ed795461e001affd1f87
```

**Trennung:** GitHub Pages für statisches Frontend (1 GB Repo-Limit), R2 für Bilder (0 € Egress, 10 GB Free-Tier).

## Stack (aktualisiert nach Phase C)

- **Framework**: Astro 6 (latest stable, installed as devDependency, NICHT npm create — manuelles Setup)
- **Stil-Referenz**: https://palomawool.com (editorial Restraint, italic Display, Minimal-Akzente)
- **Tokens** (`src/styles/tokens.css`):
  - `--ink: #000031` (warmes dunkles Marine, ähnelt Paloma Wool)
  - `--paper: #ffffff`, `--paper-2: #f3f3f3`
  - `--red: #E8341A` Brand-Akzent (Jules PDF-Marker)
  - `--red-text: #C42910` AA-konform für kleine Coral-Texte
  - `--contrast: #595959` AA-konform für Caption-Text
  - `--font-display: "Source Serif 4"`, `--font-body: "Inter"`, `--font-mono: "JetBrains Mono"`
- **Image-Pipeline**: Node + sharp (AVIF q=70, WebP q=88, JPG q=92 mozjpeg) in 4 Breiten
  (800/1200/1920/2560w) bzw. limited durch Source-Width
- **R2-Upload**: `@aws-sdk/client-s3`, idempotent (HEAD-ETag-Check), Concurrency 20

## Verzeichnisse

| Path | Was |
|---|---|
| `src/pages/index.astro` | Hero + Projekt-Liste, dynamisch aus `src/data/projects.ts` |
| `src/pages/work/{slug}.astro` | Editorial Project-Pages |
| `src/layouts/Editorial.astro` | Master-Layout (Topbar, Meta/OG/JSON-LD) |
| `src/components/Hero.astro` | `<picture>` mit srcset auf R2, optional `bleed=full` + named slot |
| `src/components/SideCaption.astro` | Tufte/Paloma-Wool-Sidenote mit num+title |
| `src/components/ProjectCode.astro` | "no. NN / title" Caption |
| `src/data/projects.ts` | Single source of truth für alle 6 Projekte (slug, num, title, hero, status) |
| `src/styles/tokens.css` | Paloma-Wool-Tokens + Type-Primitives |
| `public/print/index.html` | Phase-B Print-Mirror (Lightbox, Hotspots, Captions) |
| `public/{favicon.svg,robots.txt,sitemap.xml}` | static assets passthrough |
| `public/data/hotspots.json` | Hotspot-Bboxes für Print-Mirror |
| `tools/` | Build-Pipeline (siehe unten) |
| `originals/` (gitignored, Symlink) → `portfolio2 Ordner2/Links/` (1.1 GB Master-Files) |
| `originals_pdf/` (gitignored) | aus PDF extrahierte Bilder (`pdfimages -all -p`) — 109 Files |
| `originals_resolved/` (gitignored) | HEIC-Konversionen via sips |
| `dist-images/` (gitignored) | gebauten AVIF/WebP/JPG-Variants → R2 |
| `dist/` (gitignored) | Astro build output → GitHub Pages |
| `tests/{baseline,current,diff}/` (gitignored) | Phase-B Visual-Regression-Snapshots |

## Tools

| Script | Zweck | npm-Script |
|---|---|---|
| `tools/mapping.json` | Slot-Key → Original-Source mit aspectRatio + cropStrategy + pdfPage | — |
| `tools/build-from-mapping.mjs` | Liest mapping, baut alle Slots in dist-images | `images:build` |
| `tools/upload-r2-s3.mjs` | R2-Upload via S3-API, idempotent | `images:upload` |
| `tools/render-pdf-pages.mjs` | pdftoppm 300dpi → page-NN-{w}.{ext} (Print-Mirror baseline) | `pages:render` |
| `tools/crop-from-page.mjs` | Croppt Image-Regionen aus 2280w Page-Renders (höhere Auflösung als pdfimages-Extracts) | — |
| `tools/transform-html.mjs` | Phase-B: `<img src=images/...>` → `<picture>` mit R2-srcset | `html:transform` |
| `tools/extract-page-text.mjs` | pdftotext → tools/page-text.json | `html:extract-text` |
| `tools/inject-page-text.mjs` | Patcht `<figcaption visually-hidden>` in Print-Mirror | `html:inject-text` |
| `tools/verify-mapping.mjs` | sharp-phash Hamming-Distanz Slot vs PDF-Extract | `images:verify` |
| `tools/snapshot.mjs` | Playwright Anchor-Page-Screenshots für visual regression | `test:baseline` / `test:current` |
| `tools/diff-baseline.mjs` | pixelmatch-Diff baseline vs current + HTML-Report | `test:diff` |
| `tools/test-axe.mjs` | a11y via @axe-core/playwright (umgeht ChromeDriver-mismatch) | `test:axe` |

## Standard-Build-Flow

```bash
# 1. Image-Pipeline (wenn Sources sich ändern)
node tools/extract-page-text.mjs              # pdftotext if PDF changed
npm run images:build                           # mapping.json → dist-images
npm run images:upload                          # → R2
# bump v= in src/components/Hero.astro for cache-bust

# 2. Astro-Build
npm run dev                                    # local: http://localhost:4321/jule-website/
npm run build                                  # → dist/
npm run preview                                # preview built dist/

# 3. Tests
npm run test:current && npm run test:diff      # visual regression vs baseline
npm run test:axe                               # a11y check (server must run)

# 4. Deploy
git add -A && git commit -m "..." && git push   # → GitHub Actions: npm ci && build → Pages
```

## Design-Prinzipien (Paloma-Wool-inspired)

- **Editorial Restraint**: keine Animationen außer Lightbox + scroll-driven Topbar-Indicator
- **Photography-First**: Bilder dominieren, Text klein und ruhig
- **Coral-Akzent sparsam**: nur Brand (Topbar) + `<em>` in Captions, nicht funktional
- **Mobile**: stack-Layout (kein Mini-PDF), Topbar-Nav versteckt, Hero-padding reduziert
- **Subgrid-Doppelseiten** auf Desktop, full-stack auf Mobile <820px

## Critical Lessons / Gotchas

### Build & Deploy

- **`wrangler r2 object put` NICHT für Bulk** — Cloudflare-Account-API limit 1200 req/5 min. R2 S3-Endpoint hat das nicht.
- **R2 API Tokens** separat im Dashboard → R2 → "Manage R2 API tokens" (nicht "Account API Tokens").
- **TIFF aus InDesign** braucht `sharp({ unlimited: true, limitInputPixels: false })` für ICC-Profile in großen TIFFs.
- **HEIC** kann sharp nicht direkt — `sips -s format jpeg --formatOptions 100` als Pre-Step.
- **AI-Files** sind PDFs intern → `pdftocairo -svg input.ai output.svg` für Vektor.
- **R2 Cache-Header** = `immutable, max-age=31536000`. Bei Filename-Stable + Content-Change MUSS `?v=<ts>` an HTML-URLs (in `Hero.astro` zentral). Verboten: gleiche Datei updaten, alten `v` lassen.
- **GitHub Pages enabling per API** geht nicht mit Workflow-Token — einmaliger UI-Klick erforderlich.
- **Astro `base` config**: `/jule-website` muss in allen internen Links via `import.meta.env.BASE_URL` benutzt werden.
- **GitHub Pages trailing-slash**: `/work/sauer-1/` (mit slash) wird zu `/index.html` aufgelöst. Ohne slash → 301-redirect. Interne Links sollten trailing slash haben.

### Image-Mapping

- **Mapping-Akkuratesse**: Filename-Heuristik liegt bei ~60%. `pdfimages -all -p portfolio2.pdf originals_pdf/p` ist authoritativ für Cross-Mapping.
- **Crop aus Page-Renders > pdfimages-Extracts**: für Hi-Res-Editorial nutze `tools/crop-from-page.mjs` — extrahiert aus den 2280w Print-Renders (300dpi), liefert höhere Auflösung als die pdfimages-eingebetteten Bilder.
- **Bug-Pattern**: `mapping.json` `_note`-Felder ("X reused for missing Y") sind Warnsignale für Bilder-Duplikate auf der Page. Vor jedem neuen Project-Build CHECK auf Source-Duplikate.

### A11y/SEO

- **Topbar-Brand `--red-text: #C42910`** (nicht `--red`), sonst contrast-fail bei kleinen Texten.
- **`--contrast: #595959`** (nicht 808080) für AA-konforme Captions auf Paper.
- **Nested-interactive a11y**: `.page` mit `role=button` UND klickbares `<a class="hotspot">` darin = Violation. Pages mit Hotspots verlieren button-role (Lightbox per Click bleibt, kein Keyboard-Tab-Stop).
- **Visually-hidden Pattern**: `position:absolute; w:1px; h:1px; clip:rect(0,0,0,0); overflow:hidden; white-space:nowrap;` — funktioniert für Screen-Reader + SEO.

## Aktueller Stand (3. Mai 2026, Phase C2)

### Live ✅
- `/` Editorial Index mit 6 Projekten
- `/work/sauer-1/` Editorial Page (Kreismuster + Esszimmer)
- `/work/sauer-2/` Editorial Page (3-img Gallery + Küchen-Installation)
- `/print/` Print-Mirror (Phase B: Lightbox, Hotspots, Captions, SEO)

### Pending ⏳
- 4 weitere Project-Pages: `/work/lachen/`, `/work/objekt-siebzig/`, `/work/materialitaet/`, `/work/muster-rewilding/`
- Image-Verify-Pre-Check Tool (verhindert Source-Duplikate vor Page-Build)
- Custom-Domain (z.B. juleplaehn.de via Cloudflare Registrar)
- Kontaktformular (aktuell mailto:)
- Cloudflare Web Analytics

### Bekannte Mapping-Probleme bereits gefixt
- p05-sauer1-detail: war Filz-Trapez, jetzt Kreismuster ✓
- p08-sauer2-leuchtkasten: war Webware, jetzt Küche-3-Module ✓
- p07-sauer2-b: war IMG_5781-Duplikat, jetzt PDF-p8-Aerial ✓
- p10-lachen-installation: Bildschirmfoto fehlte → PDF-Extrakt ✓
- p17-ausstellung, p19-office-a/b: rettung1/2 falsch → PDF-Extrakts ✓
- p27-seat: DESIGNFREUD thematisch falsch → PDF-Damast-Detail ✓
- p29-inform-b: Bildschirmfoto fehlte → PDF-Extrakt ✓

### Bekannte Lücken
- `/work/`-Pages für Lachen/Objekt 70/Materialität/Muster nutzen aktuell den Print-Mirror als Fallback (via /print/-Link). Ziel: jede semantisch ausarbeiten.
- Image-Verify VOR jedem neuen Project-Build noch nicht standardisiert — sollte Tool werden.

## Phasen-Plan

Aktueller Plan-File: `/Users/cpg/.claude/plans/hey-ich-w-rde-gerne-gleaming-lightning.md`

| Phase | Status | Inhalt |
|---|---|---|
| **0** Stilreferenz | ✅ | Paloma-Wool-Tokens extrahiert |
| **B** Print-Mirror Polish | ✅ | B0 Tokens, B1 Lightbox, B2 Hotspots, B3 SEO, B4 Captions, B5 Indicator + iterative Testphase T0-T5 |
| **C1** Astro-Foundation | ✅ | astro.config, Editorial.astro, tokens.css, public/print passthrough, GitHub workflow |
| **C2** Pilot Projekte | 🟡 in Arbeit | Sauer 1 ✅, Sauer 2 ✅. Lachen/Objekt 70/Materialität/Muster pending |
| **C3** Skalierung | ⏳ | restliche 4 Projekte semantisch |
| **C4** Quality-Gate | ⏳ | Playwright `toHaveScreenshot()` vs Print-Mirror als CI-Test |
