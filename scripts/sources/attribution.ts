// Single source of truth for the /attribution page's "Regional sources" list
// (src/pages/[lang]/attribution.astro). Keyed by the scraper's `sourceName`
// (see types.ts). attribution.test.ts fails if a scraper in SCRAPERS has no
// entry here, or if an entry is neither a live scraper nor marked `retired`.
//
// No licence/terms field on purpose: none of the scraper modules state one,
// and we do not invent them. Add `license` here only once it is verified.
export interface SourceAttribution {
  /** Display name shown on the attribution page. */
  name: string;
  url: string;
  /**
   * No scraper module any more (dropped, coverage moved to another source).
   * Still credited because data from it may remain in the dataset.
   */
  retired?: boolean;
}

// Order = display order on the page.
export const SOURCE_ATTRIBUTION: Record<string, SourceAttribution> = {
  cai: { name: 'CAI — Rifugi e bivacchi', url: 'https://rifugi.cai.it/shelters' },
  caibergamo: { name: 'CAI Bergamo — Geoportale rifugi e bivacchi', url: 'https://www.caibergamo.it/geoportale/rifugi-bivacchi', retired: true },
  abitarelestremo: { name: 'Abitare l’Estremo', url: 'https://www.abitarelestremo.it', retired: true },
  diska: { name: 'DISKA', url: 'https://www.diska.it' },
  parcorobievalt: { name: 'Parco delle Orobie Valtellinesi', url: 'https://www.parcorobievalt.com/rifugi-bivacchi', retired: true },
  paesidivaltellina: { name: 'Paesi di Valtellina', url: 'https://www.paesidivaltellina.eu/rifugiebivacchi.htm' },
  hikesoftheworld: { name: 'Hikes of the World', url: 'https://www.hikesoftheworld.com/region/bivacchi' },
  utno: { name: 'UT.no — Den Norske Turistforening', url: 'https://ut.no' },
};
