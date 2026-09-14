// paesidivaltellina.eu/rifugiebivacchi.htm — local Valtellina coverage,
// old-style single static page per the spec. Best-effort extraction; see
// scripts/sources/README.md.
import { extractCapacity, extractElevationM, extractPhone, fetchHtml, loadHtml, parseCoordinate, toRawCandidate } from '../lib/scraper-base.ts';
import type { SiteScraper } from './types.ts';

const URL = 'https://www.paesidivaltellina.eu/rifugiebivacchi.htm';
const COORD_RE = /(\d{1,2}[°.,]\d+)\s*[°]?\s*[NnEe]?\s*[,;/]\s*(\d{1,2}[°.,]\d+)/;

export const paesidivaltellina: SiteScraper = {
  sourceName: 'paesidivaltellina',
  async run() {
    const fetchedAt = new Date().toISOString();
    const html = await fetchHtml(URL, 'paesidivaltellina');
    if (!html) return [];

    const $ = loadHtml(html);
    // Old-style page: try a table first, then paragraphs/list items led by a bold/link name.
    let rows = $('table tr').toArray();
    let useTable = rows.length > 0;
    if (!useTable) rows = $('p, li').toArray();

    const candidates = [];
    for (const row of rows) {
      const $row = $(row);
      const text = $row.text().trim();
      if (!text || text.length < 3 || text.length > 400) continue;
      const name = (useTable ? $row.find('td').first().text() : $row.find('b, strong, a').first().text() || text.split(/[.\n]/)[0]).trim();
      if (!name || name.length > 120 || /^(nome|rifugio|bivacco)$/i.test(name)) continue;

      const coordMatch = text.match(COORD_RE);
      candidates.push(
        toRawCandidate(
          'paesidivaltellina',
          {
            name,
            sourceUrl: URL,
            lat: coordMatch ? parseCoordinate(coordMatch[1]) : null,
            lon: coordMatch ? parseCoordinate(coordMatch[2]) : null,
            elevationM: extractElevationM(text),
            capacity: extractCapacity(text),
            phone: extractPhone(text),
          },
          fetchedAt,
        ),
      );
    }

    if (candidates.length === 0) {
      console.warn(`[paesidivaltellina] No entries found on ${URL} — page structure may have changed.`);
    }
    console.log(`[paesidivaltellina] ${candidates.length} candidates`);
    return candidates;
  },
};
