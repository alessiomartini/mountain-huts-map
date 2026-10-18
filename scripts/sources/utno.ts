// ut.no — DNT's official cabin catalogue (Norway). Its GraphQL API
// (api.ut.no/v1/graphql) answers 403 to anonymous `cabin`/`cabins` queries,
// and the site has no sitemap, so there is no public list of cabins. But
// ~800 OSM huts carry `website=https://ut.no/hytte/<id>/...`, and each cabin
// page is public (robots.txt allows /hytte/) with the facts in __NEXT_DATA__.
// So: take the OSM huts (cached Overpass results) that link to ut.no, fetch
// their page, and emit a candidate with OSM's coords and ut.no's facts.
// ponytail: coverage = OSM huts that link to ut.no; cabins OSM doesn't link are missed.
import { fetchOsmAll } from '../fetch-osm.ts';
import { fetchHtml, toRawCandidate } from '../lib/scraper-base.ts';
import { hasCoords, type RawCandidate } from '../lib/source-record.ts';
import type { ServiceLevel } from '../../src/lib/hut-schema.ts';
import type { SiteScraper } from './types.ts';

const UT_ID_RE = /ut\.no\/+hytte\/(\d+)/;

const SERVICE_LEVELS: Record<string, ServiceLevel> = {
  STAFFED: 'staffed',
  SELF_SERVICE: 'self_service',
  FOOD_SERVICE: 'staffed',
  NO_SERVICE: 'unstaffed',
  NO_SERVICE_NO_BEDS: 'unstaffed',
  EMERGENCY_SHELTER: 'unstaffed',
  // CLOSED, RENTAL, UNKNOWN -> 'unknown'
};

interface UtCabin {
  name?: string;
  serviceLevel?: string | null;
  bedsStaffed?: number | null;
  bedsSelfService?: number | null;
  bedsNoService?: number | null;
  phone?: string | null;
  email?: string | null;
  bookingUrl?: string | null;
  ownerGroupConnection?: { name?: string } | null;
}

export function parseUtCabin(html: string): UtCabin | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1])?.props?.pageProps?.publicCabinData ?? null;
  } catch {
    return null;
  }
}

export function cabinToCandidate(cabin: UtCabin, osm: RawCandidate & { coords: { lat: number; lon: number } }, url: string, fetchedAt: string): RawCandidate {
  const beds = Math.max(cabin.bedsStaffed ?? 0, cabin.bedsSelfService ?? 0, cabin.bedsNoService ?? 0);
  const candidate = toRawCandidate(
    'utno',
    {
      name: cabin.name || osm.name,
      sourceUrl: url,
      lat: osm.coords.lat,
      lon: osm.coords.lon,
      capacity: beds > 0 ? beds : null,
      phone: cabin.phone ?? null,
      website: url,
    },
    fetchedAt,
  );
  candidate.operator = cabin.ownerGroupConnection?.name ?? null; // toRawCandidate drops operator
  candidate.contact = { ...candidate.contact, email: cabin.email ?? null };
  candidate.serviceLevel = SERVICE_LEVELS[cabin.serviceLevel ?? ''] ?? 'unknown';
  candidate.countryHint = 'NO';
  candidate.links = [{ label: 'UT.no', url, kind: 'official' }];
  if (cabin.bookingUrl) candidate.links.push({ label: 'DNT hyttebestilling', url: cabin.bookingUrl, kind: 'official' });
  return candidate;
}

export const utno: SiteScraper = {
  sourceName: 'utno',
  async run() {
    const fetchedAt = new Date().toISOString();
    const osm = (await fetchOsmAll()).filter(hasCoords);
    const candidates: RawCandidate[] = [];
    const seen = new Set<string>();

    for (const hut of osm) {
      const id = hut.contact?.website?.match(UT_ID_RE)?.[1];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const url = `https://ut.no/hytte/${id}`;
      const html = await fetchHtml(url, 'utno');
      const cabin = html ? parseUtCabin(html) : null;
      if (!cabin) {
        if (html) console.warn(`[utno] No cabin data in ${url} — page structure may have changed.`);
        continue;
      }
      candidates.push(cabinToCandidate(cabin, hut, url, fetchedAt));
    }

    console.log(`[utno] ${candidates.length} candidates (${seen.size} OSM huts link to ut.no)`);
    return candidates;
  },
};
