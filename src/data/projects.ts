// Project metadata, single source of truth for /index.astro project list
// + each work/[slug].astro page header.
// Add a project here → Astro index auto-renders it.

export interface Project {
  slug: string;            // /work/{slug}/
  num: string;             // editorial code, "01" .. "06"
  title: string;           // display title
  eyebrow: string;         // small uppercase eyebrow above title
  meta: string;            // tagline below title (mono caption)
  lead: string;            // 1-sentence intro
  hero: string;            // R2 slot used for og:image and index thumbnail
  pdfPages: string;        // "p.6 + p.7" — for print-link footer
  status?: 'live' | 'wip'; // wip projects are listed but not linked yet
}

export const projects: Project[] = [
  {
    slug: 'sauer-1',
    num: '01',
    title: 'Sauer 1',
    eyebrow: '— nutritions · entwurf 01 / 03',
    meta: 'entwurf sauer · filz · vollversatz',
    lead: 'Ein modulares Akustik-Textil aus vernähtem Filz — die Sauer-Form als Kachel, der Vollversatz als Fläche.',
    hero: 'p05-sauer1-detail',
    pdfPages: 'p.6 + p.7',
    status: 'live',
  },
  {
    slug: 'sauer-2',
    num: '02',
    title: 'Sauer 2',
    eyebrow: '— nutritions · entwurf 02 / 03',
    meta: 'entwurf sauer · schafswolle · variation',
    lead: 'Frei genähte Kreise mit Schafswollresten gefüllt — die Sauer-Form als Blase, gerahmt vor Leuchtkästen gespannt.',
    hero: 'p08-sauer2-leuchtkasten',
    pdfPages: 'p.8 + p.9',
    status: 'live',
  },
  {
    slug: 'lachen',
    num: '03',
    title: 'Lachen',
    eyebrow: '— nutritions · entwurf 03 / 03',
    meta: 'lasercut · hand · installation',
    lead: 'Filz-Ausarbeitungen mit Lasercutter und Hand zugeschnitten — als Vase, Kerzenhalter, Wandapplikation einsetzbar.',
    hero: 'page-11-1520w',
    pdfPages: 'p.10 + p.11',
    status: 'wip',
  },
  {
    slug: 'objekt-siebzig',
    num: '04',
    title: '(Objekt) siebzig',
    eyebrow: '— atemregulierung ohne barrieren',
    meta: 'atemführungs-station · patentiert · deutsches textilmuseum',
    lead: 'Eine frei zugängliche Atemführungs-Station für Ruhe- und Erste-Hilfe-Räume — das Objekt atmet sichtbar in vorgegebenem Rhythmus.',
    hero: 'page-12-1520w',
    pdfPages: 'p.12 – p.19',
    status: 'wip',
  },
  {
    slug: 'materialitaet',
    num: '05',
    title: 'Materialität als Raumbildung',
    eyebrow: '— freie arbeit · freudenberg · automotive',
    meta: 'polsterstoffe · dachhimmel · innenraum',
    lead: 'Polsterstoffe und Dachhimmel für den automobilen Innenraum — eine textile Antwort auf den Raum im Übergang.',
    hero: 'p22-freudenberg-a',
    pdfPages: 'p.21 – p.23',
    status: 'wip',
  },
  {
    slug: 'muster-rewilding',
    num: '06',
    title: '/Muster',
    eyebrow: '— freie arbeit · holzweiler',
    meta: 'kollektion rewilding · weiterentwicklung',
    lead: 'Weiterentwicklung der Kollektion Rewilding für das Modelabel Holzweiler — ökologische Fragestellungen mit textiler Gestaltung verbunden.',
    hero: 'p24-muster',
    pdfPages: 'p.24 + p.25',
    status: 'wip',
  },
];

export function projectBySlug(slug: string): Project | undefined {
  return projects.find(p => p.slug === slug);
}
