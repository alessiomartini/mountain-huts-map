// Primary data source: OpenStreetMap via the Overpass API. One region at a
// time, cached on disk, with a mirror fallback if the main endpoint is
// congested. Never throws: a region that fails to fetch just logs a
// warning and contributes zero candidates, so the rest of the pipeline
// still runs (spec §5-bis).
import { REGIONS, type Region } from './regions.config.ts';
import { cached, THIRTY_DAYS_MS } from './lib/cache.ts';
import { splitBBox } from './lib/geo.ts';
import { politeFetch, sleep } from './lib/http.ts';
import { classifyHut, type OsmHutTags } from './lib/classify.ts';
import { makeId } from './lib/slug.ts';
import type { RawCandidate } from './lib/source-record.ts';
import type { ServiceLevel } from '../src/lib/hut-schema.ts';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// A region-sized bbox (e.g. the whole Italian Alps arc) reliably 504s on
// the public Overpass instance — this was measured, not assumed: an
// earlier version queried region.bbox directly and every region timed out
// on both endpoints. Tiling to this size keeps each query answerable.
const TILE_DEG = 1.5;

function buildQuery(bbox: Region['bbox']): string {
  const [south, west, north, east] = bbox;
  const bboxStr = `${south},${west},${north},${east}`;
  const filters = [
    '["tourism"="alpine_hut"]',
    '["tourism"="wilderness_hut"]',
    '["amenity"="shelter"]["shelter_type"="basic_hut"]',
    '["amenity"="shelter"]["shelter_type"="weather_shelter"]',
  ];
  const clauses = filters.flatMap((f) => [`node${f}(${bboxStr});`, `way${f}(${bboxStr});`]);
  return `[out:json][timeout:90];\n(\n  ${clauses.join('\n  ')}\n);\nout center tags;`;
}

// 429 (rate limited) and 504 (gateway timeout — usually the query queue
// backing up under load) are transient: worth a couple of backoff+retries on
// the same endpoint before writing it off and moving to the next one. Any
// other failure (4xx, network abort) isn't worth retrying in place.
const RETRY_ATTEMPTS_PER_ENDPOINT = 3;
const RETRY_BASE_DELAY_MS = 10_000;

async function queryOverpassEndpoint(endpoint: string, query: string): Promise<OverpassResponse> {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS_PER_ENDPOINT; attempt++) {
    const res = await politeFetch(endpoint, {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      minDelayMs: 2000,
      timeoutMs: 100_000,
    });
    if (res.ok) return (await res.json()) as OverpassResponse;

    const isTransient = res.status === 429 || res.status === 504;
    if (!isTransient || attempt === RETRY_ATTEMPTS_PER_ENDPOINT) {
      throw new Error(`Overpass ${endpoint} responded ${res.status}`);
    }
    const retryAfterHeader = res.headers.get('Retry-After');
    const delay = retryAfterHeader ? Number(retryAfterHeader) * 1000 : RETRY_BASE_DELAY_MS * attempt;
    console.warn(`[fetch-osm] ${endpoint} responded ${res.status} (attempt ${attempt}/${RETRY_ATTEMPTS_PER_ENDPOINT}); retrying in ${Math.round(delay / 1000)}s...`);
    await sleep(delay);
  }
  throw new Error(`Overpass ${endpoint}: unreachable`); // unreachable, satisfies the type checker
}

async function queryOverpass(query: string): Promise<OverpassResponse> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await queryOverpassEndpoint(endpoint, query);
    } catch (err) {
      lastError = err;
      console.warn(`[fetch-osm] ${endpoint} failed: ${(err as Error).message}. Trying next endpoint if any.`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All Overpass endpoints failed');
}

function guessServiceLevel(tags: OsmHutTags & Record<string, string | undefined>): ServiceLevel {
  // OSM has no single agreed tag for DNT's betjent/selvbetjent/ubetjent split, so
  // this is a best-effort guess from the same signals used for IT classification.
  // Norwegian records should be spot-checked against ut.no before a trip either way.
  if (tags.unmanned === 'yes') return 'unstaffed';
  if (tags.phone || tags.opening_hours) return 'staffed';
  if (tags.fee === 'yes') return 'self_service';
  return 'unknown';
}

function elementToCandidate(el: OverpassElement, fetchedAt: string, countryHint: string): RawCandidate | null {
  const tags = el.tags ?? {};
  const name = tags.name;
  if (!name) return null; // unnamed structures aren't useful on a map meant for navigation

  const classification = classifyHut(tags as OsmHutTags);
  if (classification.category === null) return null; // weather_shelter / unrecognized: excluded per spec §2.1

  const lat = el.type === 'node' ? el.lat : el.center?.lat;
  const lon = el.type === 'node' ? el.lon : el.center?.lon;

  const namesByLang: RawCandidate['namesByLang'] = {};
  if (tags['name:it']) namesByLang.it = tags['name:it'];
  if (tags['name:en']) namesByLang.en = tags['name:en'];
  if (tags['name:no']) namesByLang.no = tags['name:no'];

  const links: RawCandidate['links'] = [];
  if (tags.wikipedia) {
    const [lang, ...rest] = tags.wikipedia.split(':');
    const title = rest.join(':');
    if (lang && title) {
      links.push({
        label: `Wikipedia (${lang})`,
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        kind: 'wikipedia',
      });
    }
  }
  links.push({
    label: 'OpenStreetMap',
    url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    kind: 'osm',
  });
  if (tags.website) links.push({ label: 'Sito ufficiale', url: tags.website, kind: 'official' });

  const reviewReasons = classification.needsReview ? [...classification.reasons] : [];

  return {
    sourceName: 'osm',
    sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    fetchedAt,
    externalId: makeId(el.type === 'node' ? 'osm-node' : el.type === 'way' ? 'osm-way' : 'osm-relation', el.id),
    name,
    namesByLang,
    category: classification.category,
    osmType: classification.osm_type,
    categoryConfidence: classification.category_confidence,
    serviceLevel: guessServiceLevel(tags),
    wikidataQid: tags.wikidata,
    countryHint,
    coords: lat != null && lon != null ? { lat, lon } : null,
    noCoords: lat == null || lon == null,
    elevationM: tags.ele ? Number.parseFloat(tags.ele) : null,
    capacity: tags.capacity ? Number.parseInt(tags.capacity, 10) : tags.beds ? Number.parseInt(tags.beds, 10) : null,
    operator: tags.operator ?? null,
    price: tags.fee === 'no' ? { type: 'free' } : tags.fee === 'yes' ? { type: 'paid', currency: null, night_from: null, night_to: null, half_board_from: null, cai_member_discount: null, source_url: null, checked_on: null } : null,
    facilities: {
      fireplace: parseTriBool(tags.fireplace),
      stove: parseTriBool(tags.stove),
      drinking_water: parseTriBool(tags.drinking_water),
      toilet: parseTriBool(tags.toilet),
    },
    access: { opening_hours: tags.opening_hours ?? null },
    contact: { phone: tags.phone ?? null, email: tags.email ?? null, website: tags.website ?? null },
    descriptionIt: tags['description:it'] ?? null,
    descriptionEn: tags['description:en'] ?? null,
    links,
    verified: true, // OSM is treated as independently verified per spec §2.6
    reviewReasons,
  };
}

function parseTriBool(v: string | undefined): boolean | null {
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return null;
}

const COOLDOWN_RETRY_DELAY_MS = 30_000;

export async function fetchOsmRegion(region: Region): Promise<RawCandidate[]> {
  const tiles = splitBBox(region.bbox, TILE_DEG);
  const candidates: RawCandidate[] = [];

  async function processTile(i: number, label: string): Promise<boolean> {
    const query = buildQuery(tiles[i]);
    try {
      const { data: response, fromCache } = await cached(
        'overpass',
        `${region.id}:${query}`,
        THIRTY_DAYS_MS,
        () => queryOverpass(query),
      );
      const fetchedAt = new Date().toISOString();
      let tileCandidateCount = 0;
      for (const el of response.elements) {
        const candidate = elementToCandidate(el, fetchedAt, region.country);
        if (candidate) {
          candidates.push(candidate);
          tileCandidateCount++;
        }
      }
      console.log(
        `[fetch-osm] ${region.name} tile ${label}: ${response.elements.length} elements, ${tileCandidateCount} candidates${fromCache ? ' (cache)' : ''}`,
      );
      return true;
    } catch (err) {
      console.warn(`[fetch-osm] ${region.name} tile ${label} failed: ${(err as Error).message}.`);
      return false;
    }
  }

  const failedTileIndexes: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const ok = await processTile(i, `${i + 1}/${tiles.length}`);
    if (!ok) failedTileIndexes.push(i);
  }

  // A tile's own per-endpoint retries (queryOverpassEndpoint) handle brief
  // blips; a tile still failing after those has more likely hit sustained
  // congestion from our own preceding requests in this run. A longer
  // cooldown before one final pass gives the server room to recover instead
  // of hammering it again immediately.
  let stillFailed = failedTileIndexes;
  if (failedTileIndexes.length > 0) {
    console.log(`[fetch-osm] ${region.name}: ${failedTileIndexes.length} tile(s) failed, retrying after a ${COOLDOWN_RETRY_DELAY_MS / 1000}s cooldown...`);
    await sleep(COOLDOWN_RETRY_DELAY_MS);
    stillFailed = [];
    for (const i of failedTileIndexes) {
      const ok = await processTile(i, `${i + 1}/${tiles.length} (retry)`);
      if (!ok) stillFailed.push(i);
    }
  }

  console.log(`[fetch-osm] ${region.name}: ${candidates.length} total candidates across ${tiles.length} tiles (${stillFailed.length} tile(s) failed)`);
  return candidates;
}

export async function fetchOsmAll(): Promise<RawCandidate[]> {
  const all: RawCandidate[] = [];
  for (const region of REGIONS) {
    const candidates = await fetchOsmRegion(region);
    all.push(...candidates);
  }
  return all;
}

// Allow running standalone: `npx tsx scripts/fetch-osm.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const candidates = await fetchOsmAll();
  console.log(`[fetch-osm] Total: ${candidates.length} candidates`);
}
