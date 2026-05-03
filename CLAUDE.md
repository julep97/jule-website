# Jule Website — Portfolio for Jule Plaehn (Textile Design)

Online-Portfolio für Jule Plaehn (26, Krefeld, Textile Design). Live als Pendant zum Print-Portfolio `portfolio2.pdf`.

- **Live:** https://julep97.github.io/jule-website/
- **Repo:** `julep97/jule-website` (Owner: jule, Collaborator: tctablet)
- **Account:** jule.plaehn@web.de
- **Lokale git identity:** Philip Grothe / philip-grothe@web.de (commits sind Co-Author "Claude Opus 4.7")

## Architektur

Zwei-Ebenen-Setup für Code vs. Bilder:

```
GitHub Pages (julep97/jule-website)              ← Code, HTML/CSS/JS, ~200 KB
   └─ Auto-Deploy via .github/workflows/pages.yml beim push auf main
        │
        │  <picture> srcset references
        ▼
Cloudflare R2 (Bucket: jule-images)              ← Bilder, ~100 MB
   └─ Public-URL: https://pub-45145834ff2b45db8a585cff5b669e13.r2.dev
   └─ Cloudflare Account ID: b0c5ca997d57ed795461e001affd1f87
```

**Warum die Trennung:** GitHub Pages ist für statischen Code optimiert (1 GB Repo-Limit), R2 hat 0 € Egress und 10 GB Free-Tier. So bleibt das Repo schlank, Bilder sind via globalem CDN ausgeliefert.

## Stack

- Vanilla HTML/CSS/JS (single page, kein Framework)
- Google Fonts: EB Garamond, Source Serif 4, JetBrains Mono
- Bild-Pipeline: Node + `sharp` (AVIF q=70, WebP q=88, JPG q=92 mozjpeg) in 4 Breiten (800/1200/1920/2560w)
- Upload: `@aws-sdk/client-s3` mit R2 S3-API
- HTML transformiert zu `<picture>` mit srcset + sizes für AVIF/WebP/JPG-Fallback

## Verzeichnisse

- `index.html` — Site-Entry (transformierte `<picture>`-Tags zeigen auf R2)
- `assets/grundriss-wg.svg` — echter WG-Grundriss (aus `GrundrissWG.ai`/PDF konvertiert via pdftocairo)
- `tools/` — Build-Pipeline (siehe unten)
- `originals/` (gitignored, Symlink) → `portfolio2 Ordner/Links/` mit allen InDesign-Master-Dateien (TIFF/PNG/JPG/HEIC), 1.1 GB
- `originals_resolved/` (gitignored) — HEIC-Konversionen (sips → JPG q=100)
- `originals_pdf/` (gitignored) — aus `portfolio2.pdf` extrahierte Bilder (`pdfimages -all -p`), nutzbar wenn Original im Master fehlt oder PDF-Crop relevanter ist
- `dist-images/` (gitignored) — generierte AVIF/WebP/JPG-Varianten, werden zu R2 hochgeladen
- `.env` (gitignored) — R2-S3-Credentials
- `portfolio2 Ordner/` (gitignored) — komplettes InDesign-Paket inkl. Originalen, Fonts, .indd, .idml, Print-PDF

## Tools

| Script | Zweck |
|---|---|
| `tools/mapping.json` | HTML-Slot-Key → Original-Pfad. Single source of truth für Bildauswahl. |
| `tools/build-from-mapping.mjs` | Liest mapping.json, erzeugt 4 Breiten × 3 Formate je Slot in `dist-images/`. |
| `tools/upload-r2-s3.mjs` | Bulk-Upload zu R2 via AWS SDK, idempotent (HEAD-ETag-Check vs. lokales MD5). Concurrency 20. |
| `tools/transform-html.mjs` | Ersetzt `<img src="images/...">` durch `<picture>`-Blöcke mit srcset auf R2-URLs. |
| `tools/gallery.mjs` | Erzeugt visuelle Mapping-Übersicht (480w-Thumbs + Slot-Liste) unter `dist-images/_gallery/`. |
| `tools/ab-compare.mjs` | A/B-Qualitätsvergleich gegen PNG-Referenz für Kompressionsabnahme. |
| `tools/optimize-images.mjs` | Allgemeiner Bild-Optimizer (Filename-basiert), für Ad-hoc-Tests. |

## npm scripts

```
images:build      # baut alle gemappten Slots
images:upload     # uploadet alle dist-images zu R2
images:gallery    # generiert Original-Galerie
images:ab         # A/B-Qualitätsvergleich
images:optimize   # ad-hoc optimization
html:transform    # <img> → <picture>
```

## Standard-Update-Flow

1. `tools/mapping.json` editieren oder ein Original ändern
2. `npm run images:build` (kann 5-15 Min dauern bei vielen großen TIFFs)
3. `npm run images:upload` (Concurrency 20, ~25 Sek für 200 Files)
4. Falls Filenames stabil bleiben, R2-Cache-Bust nötig: HTML mit `?v=<timestamp>` an alle r2.dev-URLs (siehe Inline-Snippet in vorigem Commit oder einfach `node -e "..."` mit Regex-Replace)
5. `git add -A && git commit -m "..." && git push` → Pages-Deploy automatisch (~15 s)

## Critical Lessons / Gotchas

- **`wrangler r2 object put` NICHT für Bulk verwenden.** Cloudflare-Account-API hat ein hartes Limit von **1200 req / 5 min** accountweit. Schon bei Concurrency 3 + 200 Files → 429-Storm. **R2 S3-Endpoint** hat das nicht (keine relevanten Limits für unsere Skala) — daher `tools/upload-r2-s3.mjs`.
- **R2 API Tokens werden separat erstellt:** Dashboard → R2 → "Manage R2 API tokens" (nicht "Account API Tokens" — die geben nur Bearer, keine S3-Keys).
- **TIFF aus InDesign braucht `sharp({ unlimited: true, limitInputPixels: false })`**, sonst libvips-Memory-Limit-Error bei großen Tag-Daten (z.B. ICC-Profile in den 50-300 MB TIFFs).
- **HEIC kann sharp nicht direkt** — `sips -s format jpeg --formatOptions 100` als Pre-Step in `originals_resolved/`.
- **AI-Files (`GrundrissWG.ai`) sind PDFs** intern → `pdftocairo -svg input.ai output.svg` für Vektor-Erhaltung, oder `-png -r 300` für hochauflösende Raster.
- **Cache-Header von R2** ist `public, max-age=31536000, immutable` (set in upload-r2-s3.mjs). Bei Filename-Stabilität + Inhaltsänderung MUSS Cache-Bust an die HTML-URLs (`?v=<ts>`), sonst sehen Browser alte Bilder.
- **GitHub Pages enabling per API geht nicht** mit Workflow-Token — einmaliger UI-Klick (Settings → Pages → Source: GitHub Actions) bei neuem Repo nötig. Danach `actions/configure-pages@v5 with enablement: true` für künftige Repos.
- **Mapping-Akkuratesse:** Filename-Heuristik liegt bei ~60% richtig. Für 1:1-Übereinstimmung mit Print-PDF: `pdfimages -all -p portfolio2.pdf originals_pdf/p` extrahiert alle eingebetteten Bilder mit Page-Prefix → einfaches Cross-Mapping.

## Bekannte offene Punkte

- `p27-seat.png` ("Take a SEAT! Damast"): kein passendes Original im InDesign-Links-Ordner gefunden, aktuell `DESIGNFREUD.tif` als Best-Guess (passt thematisch nicht 100%). Falls Jule den gelb-grünen Damast-Stoff als separate Datei hat, in `mapping.json` eintauschen.
- `p06-sauer1-interior.png`: aus PDF extrahiert (1037×1200px) statt Original — ausreichend für Mobile, am 4K-Desktop bei großem Container leicht weicher als die anderen.
- **Cropping pro Slot:** Aktuell global `object-fit: cover` mit fixen Container-Höhen aus dem Original-HTML-Mockup. User wünschte "Container-Aspect-Ratios anpassen" pro problematischem Slot — noch nicht durchgeführt; sollte bei konkretem Feedback (welche Slots) per `aspect-ratio` auf `<picture>` oder `object-position` gefixt werden.
- **Domain:** noch keine Custom Domain. `juleplaehn.de` o.ä. via Cloudflare Registrar zu registrieren wäre konsistent mit dem R2-Setup. DNS dann: Apex auf GitHub Pages, Subdomain `images.juleplaehn.de` als R2 Custom Domain (kostenfrei).
- **Kontaktformular:** aktuell vermutlich nur `mailto:`. Bei Spam-Bedarf später Cloudflare Worker mit Turnstile + Resend/Mailgun.
- **Analytics:** Cloudflare Web Analytics ist gratis und DSGVO-konform; nach Domain-Setup nachziehbar.
- **SEO:** sitemap.xml, robots.txt, Open-Graph-Tags fehlen — sinnvoll erst nach Domain.
