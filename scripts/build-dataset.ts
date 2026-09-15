// Orchestrates the full data:refresh pipeline: fetch every source, cluster
// candidates that describe the same real-world hut, merge fields by
// precedence, validate, and write src/data/huts.json. Nothing else writes
// that file. Every source module already catches its own errors (spec
// §5-bis); this file adds one more layer so a bug in the orchestration
// itself still can't wipe out a previous good huts.json — writes only
// happen at the very end, after everything succeeded.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchOsmAll } from './fetch-osm.ts';
import { enrichWikidata } from './enrich-wikidata.ts';
import { runAllScrapers } from './sources/index.ts';
import { clusterByProximityAndName } from './lib/cluster.ts';
import { mergeCluster } from './lib/merge.ts';
import { resolveGeoContext } from './geocode-admin.ts';
import { validateHuts } from '../src/lib/validate.ts';
import { writeCsv } from './lib/csv.ts';
import { slugify, disambiguateSlug } from './lib/slug.ts';
import { REGIONS } from './regions.config.ts';
import { isInBBox } from './lib/geo.ts';
import { loadMyMapsPlacemarks, matchMyMapsPlacemarks } from './import-mymaps.ts';
import { hasCoords, type RawCandidate } from './lib/source-record.ts';
import type { Hut } from '../src/lib/hut-schema.ts';

const OVERRIDES_PATH = 'src/data/overrides.json';
const OUTPUT_PATH = 'src/data/huts.json';

function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return base;
  if (override === null || typeof override !== 'object' || Array.isArray(override)) return override as T;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return override as T;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    result[key] = deepMerge(result[key], value);
  }
  return result as T;
}

function loadOverrides(): Record<string, unknown> {
  if (!existsSync(OVERRIDES_PATH)) return {};
  try {
    return JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8'));
  } catch (err) {
    console.warn(`[build-dataset] Failed to parse ${OVERRIDES_PATH}: ${(err as Error).message}. Ignoring overrides for this run.`);
    return {};
  }
}

type NeedsReviewRow = {
  id: string;
  name: string;
  reason: string;
};

async function main() {
  console.log('=== mountain-huts-map data:refresh ===\n');

  console.log('--- OSM (Overpass) ---');
  const osmCandidates = await fetchOsmAll();

  console.log('\n--- Wikidata / Wikipedia / Commons ---');
  const wikidataCandidates = await enrichWikidata(osmCandidates);

  console.log('\n--- Regional scrapers ---');
  const scraperCandidates = await runAllScrapers();

  const allCandidates: RawCandidate[] = [...osmCandidates, ...wikidataCandidates, ...scraperCandidates];
  const withCoords = allCandidates.filter(hasCoords);
  const withoutCoords = allCandidates.filter((c) => !hasCoords(c));

  if (withoutCoords.length > 0) {
    writeCsv(
      'scripts/out/candidates-no-coords.csv',
      ['name', 'sourceName', 'sourceUrl'],
      withoutCoords.map((c) => ({ name: c.name, sourceName: c.sourceName, sourceUrl: c.sourceUrl })),
    );
  }

  console.log(`\n--- Merging ${withCoords.length} geolocated candidates ---`);
  const clusters = clusterByProximityAndName(withCoords);
  console.log(`Clustered into ${clusters.length} candidate huts`);

  const overrides = loadOverrides();
  const usedSlugs = new Set<string>();
  const needsReview: NeedsReviewRow[] = [];
  const unverifiedRows: Array<{ id: string; name: string; sources: string }> = [];
  const mergedRecords: Array<Record<string, unknown>> = [];

  let clusterIndex = 0;
  for (const cluster of clusters) {
    clusterIndex++;
    const result = mergeCluster(cluster);
    if (!result.ok) {
      needsReview.push({ id: `(dropped-${clusterIndex})`, name: cluster[0]?.name ?? '?', reason: result.reason });
      continue;
    }
    const merged = result.record;

    const geo = await resolveGeoContext(merged.coords.lat, merged.coords.lon, {
      countryHint: merged.countryHint,
      mountainGroupHint: merged.mountainGroupHint,
    });

    const id = merged.primaryExternalId ?? `scraper-${slugify(merged.name)}-${clusterIndex}`;
    const baseSlug = slugify(merged.name);
    const slug = disambiguateSlug(baseSlug, usedSlugs, geo.municipality ?? geo.province ?? String(clusterIndex));
    usedSlugs.add(slug);

    let hutRecord: Record<string, unknown> = {
      id,
      slug,
      name: merged.name,
      names: merged.namesByLang,
      category: merged.category,
      osm_type: merged.osm_type,
      service_level: merged.service_level,
      category_confidence: merged.category_confidence,
      coords: merged.coords,
      elevation_m: merged.elevation_m,
      location: {
        country: geo.country,
        region: geo.region,
        province: geo.province,
        municipality: geo.municipality,
        mountain_group: geo.mountain_group,
        nearest_peak: geo.nearest_peak,
      },
      capacity: merged.capacity,
      operator: merged.operator,
      price: merged.price,
      facilities: merged.facilities,
      access: merged.access,
      contact: merged.contact,
      description: merged.description,
      photos: merged.photos,
      links: merged.links,
      sources: merged.sources,
      verified: merged.verified,
      updated_at: new Date().toISOString(),
    };

    if (overrides[id]) {
      hutRecord = deepMerge(hutRecord, overrides[id]);
      console.log(`[build-dataset] Applied override for ${id}`);
    }

    if (geo.nearAdminBorder) {
      needsReview.push({
        id,
        name: merged.name,
        reason: 'Coordinates sit right on (or in a boundary-data gap next to) an administrative border — region/province/municipality may be incomplete.',
      });
    }

    for (const reason of merged.reviewReasons) needsReview.push({ id, name: merged.name, reason });
    if (merged.isScraperOnly) unverifiedRows.push({ id, name: merged.name, sources: merged.sources.map((s) => s.name).join(';') });

    mergedRecords.push(hutRecord);
  }

  console.log('\n--- Google My Maps cross-check ---');
  const placemarks = await loadMyMapsPlacemarks();
  const mymapsResult = matchMyMapsPlacemarks(
    placemarks,
    mergedRecords.map((r) => ({ name: r.name as string, coords: r.coords as { lat: number; lon: number } })),
  );
  console.log(`My Maps: ${mymapsResult.matchedCount} matched, ${mymapsResult.unmatchedCount} unmatched (see scripts/out/candidates-from-mymaps.csv)`);

  console.log('\n--- Validating ---');
  const { valid, errors } = validateHuts(mergedRecords);
  for (const error of errors) {
    needsReview.push({ id: error.id ?? '(unknown)', name: '(schema validation failed)', reason: error.issues.join('; ') });
  }

  const sorted = [...valid].sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + '\n');

  if (needsReview.length > 0) writeCsv('scripts/out/needs-review.csv', ['id', 'name', 'reason'], needsReview);
  if (unverifiedRows.length > 0) writeCsv('scripts/out/unverified.csv', ['id', 'name', 'sources'], unverifiedRows);

  printSummary(sorted, errors.length, needsReview.length);
}

function printSummary(huts: Hut[], invalidCount: number, needsReviewCount: number): void {
  console.log('\n=== Summary ===');
  console.log(`Total published: ${huts.length}`);
  console.log(`Rejected by schema validation: ${invalidCount}`);
  console.log(`Flagged for review: ${needsReviewCount}`);

  console.log('\nBy region:');
  for (const region of REGIONS) {
    const count = huts.filter((h) => isInBBox(h.coords.lat, h.coords.lon, region.bbox)).length;
    console.log(`  ${region.name}: ${count}`);
  }

  console.log('\nBy category:');
  for (const category of ['bivacco', 'rifugio'] as const) {
    console.log(`  ${category}: ${huts.filter((h) => h.category === category).length}`);
  }

  const withoutElevation = huts.filter((h) => h.elevation_m == null).length;
  const withoutPhoto = huts.filter((h) => h.photos.length === 0).length;
  const withoutDescription = huts.filter((h) => !h.description.it && !h.description.en).length;
  const verified = huts.filter((h) => h.verified).length;

  console.log(`\nWithout elevation: ${withoutElevation}`);
  console.log(`Without photos: ${withoutPhoto}`);
  console.log(`Without description: ${withoutDescription}`);
  console.log(`Verified: ${verified} / ${huts.length}`);
}

main().catch((err) => {
  console.error('[build-dataset] Fatal error:', err);
  process.exitCode = 1;
});
