// rifugi.cai.it/shelters — the spec flags this as "almost certainly an SPA
// backed by a JSON endpoint" and asks us to use that JSON directly rather
// than parse the rendered DOM. We can't inspect the live page from this
// sandbox (network egress here is restricted to a small allowlist — see
// README), so this scans the HTML for an embedded API URL / Next.js data
// blob and follows it if found. If neither pattern matches, it logs
// exactly what it looked for and returns zero records rather than
// guessing at an endpoint — this needs one real run against the live site
// to confirm or adjust the detection.
import { fetchHtml, toRawCandidate } from '../lib/scraper-base.ts';
import { cached, THIRTY_DAYS_MS } from '../lib/cache.ts';
import { politeFetch } from '../lib/http.ts';
import type { SiteScraper } from './types.ts';

const LISTING_URL = 'https://rifugi.cai.it/shelters';

const API_URL_RE = /"(\/api\/[a-zA-Z0-9\/_-]+)"/g;

interface GenericShelterJson {
  name?: string;
  nome?: string;
  lat?: number;
  latitude?: number;
  lon?: number;
  lng?: number;
  longitude?: number;
  elevation?: number;
  quota?: number;
  capacity?: number;
  posti_letto?: number;
  phone?: string;
  telefono?: string;
  website?: string;
  sito?: string;
  slug?: string;
  id?: string | number;
}

function normalizeShelter(raw: GenericShelterJson): GenericShelterJson & { name: string } | null {
  const name = raw.name ?? raw.nome;
  if (!name) return null;
  return { ...raw, name };
}

async function findApiCandidates(html: string): Promise<string[]> {
  const urls = new Set<string>();

  if (/<script id="__NEXT_DATA__"[^>]*>/.test(html)) urls.add('__NEXT_DATA__');

  for (const match of html.matchAll(API_URL_RE)) {
    if (/shelter|rifug|hut/i.test(match[1])) urls.add(match[1]);
  }

  return [...urls];
}

export const cai: SiteScraper = {
  sourceName: 'cai',
  async run() {
    const fetchedAt = new Date().toISOString();
    const html = await fetchHtml(LISTING_URL, 'cai');
    if (!html) return [];

    const apiHints = await findApiCandidates(html);
    if (apiHints.length === 0) {
      console.warn(
        `[cai] Could not find an embedded API URL or __NEXT_DATA__ blob on ${LISTING_URL}. ` +
          'This scraper needs a manual look at the live page to find the real data endpoint; returning 0 records for now.',
      );
      return [];
    }

    const shelters: GenericShelterJson[] = [];
    for (const hint of apiHints) {
      if (hint === '__NEXT_DATA__') {
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) continue;
        try {
          const data = JSON.parse(match[1]);
          const found = deepFindShelterArray(data);
          if (found) shelters.push(...found);
        } catch (err) {
          console.warn(`[cai] Failed to parse __NEXT_DATA__: ${(err as Error).message}`);
        }
        continue;
      }

      const apiUrl = new URL(hint, LISTING_URL).toString();
      try {
        const { data } = await cached('cai-api', apiUrl, THIRTY_DAYS_MS, async () => {
          const res = await politeFetch(apiUrl, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`responded ${res.status}`);
          return await res.json();
        });
        const found = deepFindShelterArray(data);
        if (found) shelters.push(...found);
      } catch (err) {
        console.warn(`[cai] Failed to fetch API endpoint ${apiUrl}: ${(err as Error).message}`);
      }
    }

    const candidates = shelters
      .map(normalizeShelter)
      .filter((s): s is GenericShelterJson & { name: string } => s !== null)
      .map((s) =>
        toRawCandidate(
          'cai',
          {
            name: s.name,
            sourceUrl: s.slug ? `${LISTING_URL}/${s.slug}` : LISTING_URL,
            lat: s.lat ?? s.latitude ?? null,
            lon: s.lon ?? s.lng ?? s.longitude ?? null,
            elevationM: s.elevation ?? s.quota ?? null,
            capacity: s.capacity ?? s.posti_letto ?? null,
            phone: s.phone ?? s.telefono ?? null,
            website: s.website ?? s.sito ?? null,
          },
          fetchedAt,
        ),
      );

    console.log(`[cai] ${candidates.length} candidates`);
    return candidates;
  },
};

/** Walks an unknown JSON blob looking for the first array of objects that look like shelters. */
function deepFindShelterArray(data: unknown, depth = 0): GenericShelterJson[] | null {
  if (depth > 6 || data == null) return null;
  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null && ('name' in data[0] || 'nome' in data[0])) {
      return data as GenericShelterJson[];
    }
    for (const item of data) {
      const found = deepFindShelterArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof data === 'object') {
    for (const value of Object.values(data as Record<string, unknown>)) {
      const found = deepFindShelterArray(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
