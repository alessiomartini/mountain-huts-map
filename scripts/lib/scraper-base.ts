// Shared plumbing for scripts/sources/*.ts. Fetching/caching/robots-checking
// is verified and solid; the fact-extraction regexes below are pattern-based
// (elevation, capacity, phone) rather than tied to a fixed column position,
// specifically so they survive an unknown/changing table layout better than
// a hard-coded selector would. See scripts/sources/README.md for the caveat
// that these were written without live access to the target sites and need
// a real run to confirm against actual markup.
import * as cheerio from 'cheerio';
import { cached, THIRTY_DAYS_MS } from './cache.ts';
import { politeFetch, isAllowedByRobots } from './http.ts';

export async function fetchHtml(url: string, cacheNamespace: string): Promise<string | null> {
  try {
    const allowed = await isAllowedByRobots(url);
    if (!allowed) {
      console.warn(`[${cacheNamespace}] robots.txt disallows ${url}, skipping`);
      return null;
    }
  } catch {
    // If robots.txt itself can't be checked, err on the side of not scraping.
    console.warn(`[${cacheNamespace}] Could not verify robots.txt for ${url}, skipping to be safe`);
    return null;
  }

  try {
    const { data, fromCache } = await cached(cacheNamespace, url, THIRTY_DAYS_MS, async () => {
      const res = await politeFetch(url, { minDelayMs: 1500 + Math.floor(Math.random() * 500) });
      if (!res.ok) throw new Error(`responded ${res.status}`);
      return await res.text();
    });
    if (!fromCache) console.log(`[${cacheNamespace}] fetched ${url}`);
    return data;
  } catch (err) {
    console.warn(`[${cacheNamespace}] Failed to fetch ${url}: ${(err as Error).message}`);
    return null;
  }
}

export function loadHtml(html: string) {
  return cheerio.load(html);
}

/**
 * Common "article with one heading per hut" shape: splits a container's
 * content into (heading text, following-text-until-next-heading) blocks.
 * Useful for regional listing pages that read like a blog post rather than
 * a table. Returns [] if no headings match, letting the caller fall back
 * to another strategy or give up and log a warning.
 */
export function extractHeadingBlocks(
  $: cheerio.CheerioAPI,
  containerSelector: string,
  headingSelector = 'h2, h3, h4',
): Array<{ heading: string; text: string; headingEl: ReturnType<cheerio.CheerioAPI> }> {
  const blocks: Array<{ heading: string; text: string; headingEl: ReturnType<cheerio.CheerioAPI> }> = [];
  const container = $(containerSelector).first();
  if (container.length === 0) return blocks;

  const headings = container.find(headingSelector).toArray();
  headings.forEach((headingNode, i) => {
    const heading = $(headingNode);
    const headingText = heading.text().trim();
    if (!headingText) return;
    let text = '';
    let node = heading.next();
    const stopAt = i + 1 < headings.length ? headings[i + 1] : null;
    while (node.length && node.get(0) !== stopAt) {
      text += ' ' + node.text();
      node = node.next();
    }
    blocks.push({ heading: headingText, text: text.trim(), headingEl: heading });
  });
  return blocks;
}

/** Decimal, comma-decimal, or sexagesimal ("45°12'34\"N") coordinate text -> decimal degrees. */
export function parseCoordinate(raw: string): number | null {
  const s = raw.trim();
  if (/^-?\d+[.,]\d+$/.test(s)) return Number.parseFloat(s.replace(',', '.'));

  const dms = s.match(/(\d+)\s*°\s*(\d+)?\s*'?\s*(\d+(?:[.,]\d+)?)?\s*"?\s*([NSEWnsew])?/);
  if (dms && dms[1]) {
    const deg = Number.parseFloat(dms[1]);
    const min = dms[2] ? Number.parseFloat(dms[2]) : 0;
    const sec = dms[3] ? Number.parseFloat(dms[3].replace(',', '.')) : 0;
    let value = deg + min / 60 + sec / 3600;
    if (dms[4] && /[SWsw]/.test(dms[4])) value = -value;
    return value;
  }
  return null;
}

export function extractElevationM(text: string): number | null {
  const m = text.match(/(\d{3,4})\s*(?:m\s*s\.?l\.?m\.?|m(?:etri)?\b)/i);
  return m ? Number.parseInt(m[1], 10) : null;
}

export function extractCapacity(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*post[oi]?\s*(?:letto)?/i);
  return m ? Number.parseInt(m[1], 10) : null;
}

export function extractPhone(text: string): string | null {
  const m = text.match(/(?:\+39\s?)?0\d{1,3}[\s.-]?\d{5,8}|(?:\+39\s?)?3\d{2}[\s.-]?\d{6,7}/);
  return m ? m[0].trim() : null;
}

export function toRawCandidate(
  sourceName: string,
  facts: import('../sources/types.ts').ScrapedFacts,
  fetchedAt: string,
): import('./source-record.ts').RawCandidate {
  const hasCoords = facts.lat != null && facts.lon != null;
  return {
    sourceName,
    sourceUrl: facts.sourceUrl,
    fetchedAt,
    name: facts.name,
    coords: hasCoords ? { lat: facts.lat!, lon: facts.lon! } : null,
    noCoords: !hasCoords,
    elevationM: facts.elevationM ?? null,
    capacity: facts.capacity ?? null,
    contact: { phone: facts.phone ?? null, website: facts.website ?? null },
    access: { opening_hours: facts.openingHours ?? null },
    // Facts only — never the site's own descriptive prose (spec §0.2).
    scraperOnly: true,
  };
}
