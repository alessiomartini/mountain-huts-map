// parcorobievalt.com/rifugi-bivacchi — local coverage for the Orobie/Val
// Tellina area. Best-effort heading-block extraction; see scripts/sources/README.md.
import { extractHeadingBlocks, extractCapacity, extractElevationM, extractPhone, fetchHtml, loadHtml, parseCoordinate, toRawCandidate } from '../lib/scraper-base.ts';
import type { SiteScraper } from './types.ts';

const URL = 'https://www.parcorobievalt.com/rifugi-bivacchi';
const COORD_RE = /(\d{1,2}[°.,]\d+)\s*[°]?\s*[NnEe]?\s*[,;/]\s*(\d{1,2}[°.,]\d+)/;

export const parcorobievalt: SiteScraper = {
  sourceName: 'parcorobievalt',
  async run() {
    const fetchedAt = new Date().toISOString();
    const html = await fetchHtml(URL, 'parcorobievalt');
    if (!html) return [];

    const $ = loadHtml(html);
    const blocks = extractHeadingBlocks($, 'article, .entry-content, main, .content', 'h2, h3, h4');
    if (blocks.length === 0) {
      console.warn(`[parcorobievalt] No heading blocks found on ${URL} — page structure may have changed.`);
      return [];
    }

    const candidates = blocks
      .filter((b) => b.heading && b.heading.length <= 120)
      .map((block) => {
        const coordMatch = block.text.match(COORD_RE);
        return toRawCandidate(
          'parcorobievalt',
          {
            name: block.heading,
            sourceUrl: URL,
            lat: coordMatch ? parseCoordinate(coordMatch[1]) : null,
            lon: coordMatch ? parseCoordinate(coordMatch[2]) : null,
            elevationM: extractElevationM(block.text),
            capacity: extractCapacity(block.text),
            phone: extractPhone(block.text),
          },
          fetchedAt,
        );
      });

    console.log(`[parcorobievalt] ${candidates.length} candidates`);
    return candidates;
  },
};
