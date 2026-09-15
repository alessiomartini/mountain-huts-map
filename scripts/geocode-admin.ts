// Geographic context for an already-merged hut record (spec §2.3): admin
// division (region/province/municipality) via local point-in-polygon
// against cached boundary GeoJSON, plus mountain group / nearest peak.
//
// Deliberately NOT using Nominatim in a loop (its rate limit can't survive
// thousands of lookups) — administrative boundaries are downloaded once
// and cached on disk; see BOUNDARY_SOURCES below for exactly what to place
// where. When a boundary file is missing this degrades to nulls for that
// field rather than failing the run: the rest of the record is still useful
// without a province name.
import { existsSync, readFileSync } from 'node:fs';
import { cached, THIRTY_DAYS_MS } from './lib/cache.ts';
import { politeFetch } from './lib/http.ts';
import { haversineMeters, isInBBox, pointInGeometry, type BBox, type GeoJSONGeometry } from './lib/geo.ts';
import { REGIONS } from './regions.config.ts';

export interface NearestPeak {
  name: string;
  ele: number | null;
  distance_m: number;
}

export interface GeoContext {
  country: string | null;
  region: string | null;
  province: string | null;
  municipality: string | null;
  mountain_group: string | null;
  nearest_peak: NearestPeak | null;
}

interface BoundarySource {
  countryCode: string;
  level: 'region' | 'province' | 'municipality';
  /** Place the downloaded GeoJSON here yourself; see scripts/.cache/boundaries/README.md. */
  cachePath: string;
  /** Property key holding the human-readable name in that particular dataset. */
  nameProperty: string;
}

// What to download and where to put it is documented in
// scripts/.cache/boundaries/README.md (gitignored dir, like the rest of the cache).
const BOUNDARY_SOURCES: BoundarySource[] = [
  { countryCode: 'IT', level: 'region', cachePath: 'scripts/.cache/boundaries/istat-regioni.geojson', nameProperty: 'reg_name' },
  { countryCode: 'IT', level: 'province', cachePath: 'scripts/.cache/boundaries/istat-province.geojson', nameProperty: 'prov_name' },
  { countryCode: 'IT', level: 'municipality', cachePath: 'scripts/.cache/boundaries/istat-comuni.geojson', nameProperty: 'name' },
  { countryCode: 'NO', level: 'region', cachePath: 'scripts/.cache/boundaries/kartverket-fylker.geojson', nameProperty: 'name' },
  { countryCode: 'NO', level: 'municipality', cachePath: 'scripts/.cache/boundaries/kartverket-kommuner.geojson', nameProperty: 'navn' },
];

interface BoundaryFeature {
  countryCode: string;
  level: BoundarySource['level'];
  name: string;
  geometry: GeoJSONGeometry;
}

let loadedBoundaries: BoundaryFeature[] | null = null;
const warnedMissing = new Set<string>();

function loadBoundaries(): BoundaryFeature[] {
  if (loadedBoundaries) return loadedBoundaries;
  const features: BoundaryFeature[] = [];
  for (const source of BOUNDARY_SOURCES) {
    if (!existsSync(source.cachePath)) {
      if (!warnedMissing.has(source.cachePath)) {
        warnedMissing.add(source.cachePath);
        console.warn(
          `[geocode-admin] Missing ${source.cachePath} — ${source.level} lookups for ${source.countryCode} will be null. See scripts/.cache/boundaries/README.md.`,
        );
      }
      continue;
    }
    try {
      const geojson = JSON.parse(readFileSync(source.cachePath, 'utf-8')) as {
        features: Array<{ properties: Record<string, unknown>; geometry: GeoJSONGeometry }>;
      };
      for (const feature of geojson.features) {
        if (feature.geometry?.type !== 'Polygon' && feature.geometry?.type !== 'MultiPolygon') continue;
        const name = feature.properties[source.nameProperty];
        if (typeof name !== 'string') continue;
        features.push({ countryCode: source.countryCode, level: source.level, name, geometry: feature.geometry });
      }
    } catch (err) {
      console.warn(`[geocode-admin] Failed to parse ${source.cachePath}: ${(err as Error).message}`);
    }
  }
  loadedBoundaries = features;
  return features;
}

function locateAdmin(lat: number, lon: number, countryCode: string | null): Pick<GeoContext, 'region' | 'province' | 'municipality'> {
  const boundaries = loadBoundaries();
  const result: Pick<GeoContext, 'region' | 'province' | 'municipality'> = {
    region: null,
    province: null,
    municipality: null,
  };
  for (const feature of boundaries) {
    if (countryCode && feature.countryCode !== countryCode) continue;
    if (result[feature.level] !== null) continue;
    if (pointInGeometry(lon, lat, feature.geometry)) {
      result[feature.level] = feature.name;
    }
  }
  return result;
}

// Rough bounding boxes purely as a last-resort country guess when no
// countryHint was available (e.g. a Wikipedia-only candidate outside any
// OSM region query). Prefer countryHint whenever you have it.
const COUNTRY_BBOX_FALLBACK: Array<{ code: string; bbox: [number, number, number, number] }> = [
  { code: 'IT', bbox: [35.0, 6.0, 47.2, 19.0] },
  { code: 'NO', bbox: [57.5, 4.0, 71.5, 31.5] },
];

function guessCountry(lat: number, lon: number): string | null {
  for (const { code, bbox } of COUNTRY_BBOX_FALLBACK) {
    const [south, west, north, east] = bbox;
    if (lat >= south && lat <= north && lon >= west && lon <= east) return code;
  }
  return null;
}

// Named peaks and mountain-range relations are fetched ONCE PER REGION
// (whole-bbox query, cached to disk) and matched locally against every
// hut's coordinates in-memory — not one Overpass round-trip per hut. An
// earlier version queried Overpass per-hut with `around:`, which is
// correct but doesn't scale: measured against real data, it turned a few
// hundred huts into a few hundred sequential Overpass calls and made a
// single data:refresh run take the better part of an hour. This mirrors
// the same "bulk fetch once, match locally" approach already used for
// admin boundaries above.

interface OverpassPeakElement {
  lat?: number;
  lon?: number;
  tags?: { name?: string; ele?: string };
}

interface RegionPeak {
  name: string;
  ele: number | null;
  lat: number;
  lon: number;
}

const peaksByRegion = new Map<string, RegionPeak[]>();

async function getRegionPeaks(regionId: string, bbox: BBox): Promise<RegionPeak[]> {
  const alreadyLoaded = peaksByRegion.get(regionId);
  if (alreadyLoaded) return alreadyLoaded;

  const [south, west, north, east] = bbox;
  const query = `[out:json][timeout:90];node["natural"="peak"]["name"](${south},${west},${north},${east});out;`;
  let peaks: RegionPeak[] = [];
  try {
    const { data } = await cached('region-peaks', `${regionId}:${query}`, THIRTY_DAYS_MS, async () => {
      const res = await politeFetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        minDelayMs: 2000,
        timeoutMs: 100_000,
      });
      if (!res.ok) throw new Error(`Overpass region-peaks responded ${res.status}`);
      return (await res.json()) as { elements: OverpassPeakElement[] };
    });
    peaks = data.elements
      .filter((el): el is Required<Pick<OverpassPeakElement, 'lat' | 'lon'>> & OverpassPeakElement => el.lat != null && el.lon != null && !!el.tags?.name)
      .map((el) => ({ name: el.tags!.name!, ele: el.tags!.ele ? Number.parseFloat(el.tags!.ele!) : null, lat: el.lat, lon: el.lon }));
    console.log(`[geocode-admin] ${regionId}: ${peaks.length} named peaks loaded`);
  } catch (err) {
    console.warn(`[geocode-admin] Failed to load named peaks for region "${regionId}": ${(err as Error).message}. nearest_peak will be null for this region.`);
  }
  peaksByRegion.set(regionId, peaks);
  return peaks;
}

const PEAK_SEARCH_RADIUS_M = 3000;

async function findNearestNamedPeak(lat: number, lon: number): Promise<NearestPeak | null> {
  const region = REGIONS.find((r) => isInBBox(lat, lon, r.bbox));
  if (!region) return null; // outside every known region's bbox
  const peaks = await getRegionPeaks(region.id, region.bbox);

  let nearest: NearestPeak | null = null;
  for (const peak of peaks) {
    const distance_m = haversineMeters({ lat, lon }, { lat: peak.lat, lon: peak.lon });
    if (distance_m > PEAK_SEARCH_RADIUS_M) continue;
    if (!nearest || distance_m < nearest.distance_m) {
      nearest = { name: peak.name, ele: peak.ele, distance_m: Math.round(distance_m) };
    }
  }
  return nearest;
}

interface OverpassRelationGeomElement {
  members?: Array<{ role: string; geometry?: Array<{ lat: number; lon: number }> }>;
  tags?: { name?: string };
}

interface RegionRange {
  name: string;
  rings: [number, number][][]; // each outer-role way's geometry, as its own ring
}

const rangesByRegion = new Map<string, RegionRange[]>();

/**
 * Best-effort "does a named mountain_range relation contain this point".
 * Limitation: each outer-role way is tested as its own ring rather than
 * stitched into the relation's full boundary, so a range whose outer
 * boundary is split across multiple ways can under-detect containment.
 * That only means a missed mountain_group, never a wrong one — the record
 * still carries nearest_peak either way.
 */
async function getRegionRanges(regionId: string, bbox: BBox): Promise<RegionRange[]> {
  const alreadyLoaded = rangesByRegion.get(regionId);
  if (alreadyLoaded) return alreadyLoaded;

  const [south, west, north, east] = bbox;
  const query = `[out:json][timeout:90];relation["natural"="mountain_range"]["name"](${south},${west},${north},${east});out geom;`;
  let ranges: RegionRange[] = [];
  try {
    const { data } = await cached('region-ranges', `${regionId}:${query}`, THIRTY_DAYS_MS, async () => {
      const res = await politeFetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        minDelayMs: 2000,
        timeoutMs: 100_000,
      });
      if (!res.ok) throw new Error(`Overpass region-ranges responded ${res.status}`);
      return (await res.json()) as { elements: OverpassRelationGeomElement[] };
    });
    for (const el of data.elements) {
      if (!el.tags?.name) continue;
      const rings: [number, number][][] = [];
      for (const member of el.members ?? []) {
        if (member.role !== 'outer' || !member.geometry) continue;
        const ring: [number, number][] = member.geometry.map((p) => [p.lon, p.lat]);
        if (ring.length >= 4) rings.push(ring);
      }
      if (rings.length > 0) ranges.push({ name: el.tags.name, rings });
    }
    console.log(`[geocode-admin] ${regionId}: ${ranges.length} named mountain ranges loaded`);
  } catch (err) {
    console.warn(`[geocode-admin] Failed to load mountain ranges for region "${regionId}": ${(err as Error).message}. mountain_group will rely on other sources for this region.`);
  }
  rangesByRegion.set(regionId, ranges);
  return ranges;
}

async function findContainingMountainRange(lat: number, lon: number): Promise<string | null> {
  const region = REGIONS.find((r) => isInBBox(lat, lon, r.bbox));
  if (!region) return null;
  const ranges = await getRegionRanges(region.id, region.bbox);

  for (const range of ranges) {
    for (const ring of range.rings) {
      if (pointInGeometry(lon, lat, { type: 'Polygon', coordinates: [ring] })) return range.name;
    }
  }
  return null;
}

export interface GeoContextOptions {
  countryHint?: string | null;
  mountainGroupHint?: string | null;
}

export async function resolveGeoContext(lat: number, lon: number, options: GeoContextOptions = {}): Promise<GeoContext> {
  const country = options.countryHint ?? guessCountry(lat, lon);
  const admin = locateAdmin(lat, lon, country);
  const mountain_group = options.mountainGroupHint ?? (await findContainingMountainRange(lat, lon));
  const nearest_peak = await findNearestNamedPeak(lat, lon);

  return { country, ...admin, mountain_group, nearest_peak };
}
