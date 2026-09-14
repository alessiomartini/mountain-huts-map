// diska.it/rifugi_d_*.htm — old-style paginated listing (spec says probably
// by letter or zone: rifugi_d_1.htm, rifugi_d_2.htm, ...). We know
// rifugi_d_4.htm exists; the rest of the range is a guess, capped and
// stopped early once several consecutive pages 404/come back empty so a
// wrong upper bound doesn't spam the site. Best-effort selectors — see
// scripts/sources/README.md.
import { extractCapacity, extractElevationM, extractPhone, fetchHtml, loadHtml, parseCoordinate, toRawCandidate } from '../lib/scraper-base.ts';
import type { SiteScraper } from './types.ts';

const BASE = 'https://www.diska.it';
const MAX_PAGE = 12;
const MAX_CONSECUTIVE_EMPTY = 3;

const COORD_RE = /(\d{1,2}[°.,]\d+)\s*[°]?\s*[NnEe]?\s*[,;/]\s*(\d{1,2}[°.,]\d+)/;

export const diska: SiteScraper = {
  sourceName: 'diska',
  async run() {
    const candidates = [];
    const fetchedAt = new Date().toISOString();
    let consecutiveEmpty = 0;

    for (let page = 1; page <= MAX_PAGE; page++) {
      if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) break;
      const url = `${BASE}/rifugi_d_${page}.htm`;
      const html = await fetchHtml(url, 'diska');
      if (!html) {
        consecutiveEmpty++;
        continue;
      }

      const $ = loadHtml(html);
      // Guess: either a <table> of entries, or a list of links/rows each
      // naming one hut. Try table rows first, fall back to list items.
      let rows = $('table tr').toArray();
      if (rows.length === 0) rows = $('li').toArray();

      let pageCount = 0;
      for (const row of rows) {
        const $row = $(row);
        const text = $row.text().trim();
        if (!text || text.length < 3 || text.length > 300) continue;
        const link = $row.find('a').first();
        const name = (link.text().trim() || text.split(/[\n\t]/)[0]).trim();
        if (!name || /^(nome|rifugio|bivacco)$/i.test(name)) continue; // likely a header row

        const coordMatch = text.match(COORD_RE);
        candidates.push(
          toRawCandidate(
            'diska',
            {
              name,
              sourceUrl: url,
              lat: coordMatch ? parseCoordinate(coordMatch[1]) : null,
              lon: coordMatch ? parseCoordinate(coordMatch[2]) : null,
              elevationM: extractElevationM(text),
              capacity: extractCapacity(text),
              phone: extractPhone(text),
            },
            fetchedAt,
          ),
        );
        pageCount++;
      }

      if (pageCount === 0) {
        console.warn(`[diska] No entries found on ${url} — either the page doesn't exist or the structure changed.`);
        consecutiveEmpty++;
      } else {
        consecutiveEmpty = 0;
      }
    }

    console.log(`[diska] ${candidates.length} candidates`);
    return candidates;
  },
};
