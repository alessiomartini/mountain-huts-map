// abitarelestremo.it — regional listing pages, one article per region with
// (apparently) one heading per hut/bivouac. See scripts/sources/README.md:
// selectors here are a best-effort guess, not verified against live markup.
import { extractHeadingBlocks, extractCapacity, extractElevationM, extractPhone, fetchHtml, loadHtml, parseCoordinate, toRawCandidate } from '../lib/scraper-base.ts';
import type { SiteScraper } from './types.ts';

const BASE = 'https://www.abitarelestremo.it';
// Confirmed by the spec; the rest are a guess at the same URL pattern for
// other alpine regions and simply 404/no-op if the page doesn't exist.
const REGION_SLUGS = [
  'lombardia',
  'valle-daosta',
  'piemonte',
  'trentino',
  'alto-adige',
  'veneto',
  'friuli-venezia-giulia',
  'liguria',
];

const COORD_RE = /(\d{1,2}[°.,]\d+)\s*[°]?\s*[NnEe]?\s*[,;/]\s*(\d{1,2}[°.,]\d+)/;

export const abitarelestremo: SiteScraper = {
  sourceName: 'abitarelestremo',
  async run() {
    const candidates = [];
    const fetchedAt = new Date().toISOString();

    for (const slug of REGION_SLUGS) {
      const url = `${BASE}/rifugi-e-bivacchi-in-${slug}/`;
      const html = await fetchHtml(url, 'abitarelestremo');
      if (!html) continue;

      const $ = loadHtml(html);
      const blocks = extractHeadingBlocks($, 'article, .entry-content, main', 'h2, h3, h4');
      if (blocks.length === 0) {
        console.warn(`[abitarelestremo] No heading blocks found on ${url} — page structure may have changed.`);
        continue;
      }

      for (const block of blocks) {
        const name = block.heading;
        if (!name || name.length > 120) continue; // guard against accidentally matching a non-hut heading
        const coordMatch = block.text.match(COORD_RE);
        const lat = coordMatch ? parseCoordinate(coordMatch[1]) : null;
        const lon = coordMatch ? parseCoordinate(coordMatch[2]) : null;

        candidates.push(
          toRawCandidate(
            'abitarelestremo',
            {
              name,
              sourceUrl: url,
              lat,
              lon,
              elevationM: extractElevationM(block.text),
              capacity: extractCapacity(block.text),
              phone: extractPhone(block.text),
            },
            fetchedAt,
          ),
        );
      }
    }

    console.log(`[abitarelestremo] ${candidates.length} candidates`);
    return candidates;
  },
};
