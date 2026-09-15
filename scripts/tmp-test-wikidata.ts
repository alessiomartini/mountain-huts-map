// Throwaway smoke test for the batched enrich-wikidata.ts rewrite — NOT part
// of the pipeline, deleted after this verification run.
import { politeFetch } from './lib/http.ts';
import { enrichWikidata } from './enrich-wikidata.ts';
import type { RawCandidate } from './lib/source-record.ts';

interface OverpassEl {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Gran Paradiso / Monte Rosa area: dense with well-known, wikidata-tagged rifugi.
const bbox = '45.4,7.0,45.95,7.9';
const query = `[out:json][timeout:60];\n(\n  node["tourism"="alpine_hut"](${bbox});\n  way["tourism"="alpine_hut"](${bbox});\n);\nout center tags;`;

async function main() {
  const res = await politeFetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeoutMs: 90_000,
  });
  if (!res.ok) throw new Error(`Overpass responded ${res.status}`);
  const json = (await res.json()) as { elements: OverpassEl[] };

  const withWikidata = json.elements.filter((e) => e.tags?.wikidata && e.tags?.name).slice(0, 10);
  console.log(`[test] ${json.elements.length} alpine_hut elements found, sampling ${withWikidata.length} with a wikidata tag:`);
  for (const e of withWikidata) console.log(`  - ${e.tags!.name} (${e.tags!.wikidata})`);

  const candidates: RawCandidate[] = withWikidata.map((e) => ({
    sourceName: 'osm',
    sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    fetchedAt: new Date().toISOString(),
    name: e.tags!.name!,
    wikidataQid: e.tags!.wikidata,
    coords: e.type === 'node' ? { lat: e.lat!, lon: e.lon! } : { lat: e.center!.lat, lon: e.center!.lon },
  }));

  const t0 = Date.now();
  const enriched = await enrichWikidata(candidates);
  const elapsedS = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n[test] enrichWikidata() on ${candidates.length} candidates took ${elapsedS}s, produced ${enriched.length} records:\n`);
  for (const c of enriched) {
    const desc = c.descriptionIt ?? c.descriptionEn;
    console.log(
      `  [${c.sourceName}] ${c.name} | elev=${c.elevationM ?? '?'} | mountainGroup=${c.mountainGroupHint ?? '-'} | desc=${desc ? desc.slice(0, 50) + '...' : 'none'} | photos=${c.photos?.length ?? 0}`,
    );
  }
}

main().catch((err) => {
  console.error('[test] FAILED:', err);
  process.exitCode = 1;
});
