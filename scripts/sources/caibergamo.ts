// caibergamo.it/geoportale/rifugi-bivacchi — a geoportal, so the spec's
// instruction is to find the GeoJSON/WMS/WFS endpoint rather than parse the
// map page's DOM. Same caveat as cai.ts: written without live access to the
// site, so this scans for an embedded GeoJSON/WFS URL and follows it; if
// none is found it says so and returns zero records rather than guessing.
import { fetchHtml, toRawCandidate } from '../lib/scraper-base.ts';
import { cached, THIRTY_DAYS_MS } from '../lib/cache.ts';
import { politeFetch } from '../lib/http.ts';
import type { SiteScraper } from './types.ts';

const LISTING_URL = 'https://www.caibergamo.it/geoportale/rifugi-bivacchi';

const GEO_URL_RE = /https?:\/\/[^\s"'<>]+(?:geojson|wfs|service=WFS)[^\s"'<>]*/gi;

interface GeoJsonFeature {
  properties?: Record<string, unknown>;
  geometry?: { type: string; coordinates: number[] };
}

export const caibergamo: SiteScraper = {
  sourceName: 'caibergamo',
  async run() {
    const fetchedAt = new Date().toISOString();
    const html = await fetchHtml(LISTING_URL, 'caibergamo');
    if (!html) return [];

    const matches = [...new Set([...html.matchAll(GEO_URL_RE)].map((m) => m[0]))];
    if (matches.length === 0) {
      console.warn(
        `[caibergamo] Could not find a GeoJSON/WFS endpoint referenced in ${LISTING_URL}. ` +
          'This needs a manual look at the geoportal (browser dev tools network tab) to find the real data URL; returning 0 records for now.',
      );
      return [];
    }

    const candidates = [];
    for (const url of matches) {
      try {
        const { data } = await cached('caibergamo-geo', url, THIRTY_DAYS_MS, async () => {
          const res = await politeFetch(url, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`responded ${res.status}`);
          return (await res.json()) as { features?: GeoJsonFeature[] };
        });

        for (const feature of data.features ?? []) {
          const props = feature.properties ?? {};
          const name = (props.name ?? props.nome ?? props.NOME) as string | undefined;
          if (!name || feature.geometry?.type !== 'Point') continue;
          const [lon, lat] = feature.geometry.coordinates;
          candidates.push(
            toRawCandidate(
              'caibergamo',
              {
                name,
                sourceUrl: LISTING_URL,
                lat,
                lon,
                elevationM: (props.quota ?? props.elevation ?? null) as number | null,
                capacity: (props.posti_letto ?? props.capacity ?? null) as number | null,
              },
              fetchedAt,
            ),
          );
        }
      } catch (err) {
        console.warn(`[caibergamo] Failed to fetch/parse ${url}: ${(err as Error).message}`);
      }
    }

    console.log(`[caibergamo] ${candidates.length} candidates`);
    return candidates;
  },
};
