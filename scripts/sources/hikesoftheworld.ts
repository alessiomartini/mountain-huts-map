// hikesoftheworld.com/region/bivacchi — English-language hiking site,
// regional listing. Best-effort extraction; see scripts/sources/README.md.
import { extractHeadingBlocks, extractCapacity, extractElevationM, extractPhone, fetchHtml, loadHtml, parseCoordinate, toRawCandidate } from '../lib/scraper-base.ts';
import type { SiteScraper } from './types.ts';

const URL = 'https://www.hikesoftheworld.com/region/bivacchi';
const COORD_RE = /(\d{1,2}[°.,]\d+)\s*[°]?\s*[NnEe]?\s*[,;/]\s*(\d{1,2}[°.,]\d+)/;

export const hikesoftheworld: SiteScraper = {
  sourceName: 'hikesoftheworld',
  async run() {
    const fetchedAt = new Date().toISOString();
    const html = await fetchHtml(URL, 'hikesoftheworld');
    if (!html) return [];

    const $ = loadHtml(html);
    const blocks = extractHeadingBlocks($, 'article, .entry-content, main, .content', 'h2, h3, h4');
    let entries: Array<{ heading: string; text: string }> = blocks;

    if (entries.length === 0) {
      // Fall back to card-like list items if there's no heading-per-hut structure.
      const cards = $('.card, .post, li').toArray();
      entries = cards
        .map((el) => {
          const $el = $(el);
          return { heading: $el.find('h2, h3, h4, a').first().text().trim(), text: $el.text().trim() };
        })
        .filter((e) => e.heading);
    }

    if (entries.length === 0) {
      console.warn(`[hikesoftheworld] No entries found on ${URL} — page structure may have changed.`);
      return [];
    }

    const candidates = entries
      .filter((e) => e.heading.length <= 120)
      .map((entry) => {
        const coordMatch = entry.text.match(COORD_RE);
        return toRawCandidate(
          'hikesoftheworld',
          {
            name: entry.heading,
            sourceUrl: URL,
            lat: coordMatch ? parseCoordinate(coordMatch[1]) : null,
            lon: coordMatch ? parseCoordinate(coordMatch[2]) : null,
            elevationM: extractElevationM(entry.text),
            capacity: extractCapacity(entry.text),
            phone: extractPhone(entry.text),
          },
          fetchedAt,
        );
      });

    console.log(`[hikesoftheworld] ${candidates.length} candidates`);
    return candidates;
  },
};
