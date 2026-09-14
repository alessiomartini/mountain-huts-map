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
import { haversineMeters, pointInGeometry, type GeoJSONGeometry } from './lib/geo.ts';

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
  { countryCode: 'IT', level: 'region', cachePath: 'scripts/.cache/boundaries/istat-regioni.geojson', nameProperty: 'DEN_REG' },
  { countryCode: 'IT', level: 'province', cachePath: 'scripts/.cache/boundaries/istat-province.geojson', nameProperty: 'DEN_UTS' },
  { countryCode: 'IT', level: 'municipality', cachePath: 'scripts/.cache/boundaries/istat-comuni.geojson', nameProperty: 'COMUNE' },
  { countryCode: 'NO', level: 'region', cachePath: 'scripts/.cache/boundaries/kartverket-fylker.geojson', nameProperty: 'navn' },
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

interface OverpassPeakElement {
  lat?: number;
  lon?: number;
  tags?: { name?: string; ele?: string };
}

async function findNearestNamedPeak(lat: number, lon: number): Promise<NearestPeak | null> {
  const query = `[out:json][timeout:30];node["natural"="peak"]["name"](around:3000,${lat},${lon});out;`;
  try {
    const { data } = await cached('nearest-peak', query, THIRTY_DAYS_MS, async () => {
      const res = await politeFetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        minDelayMs: 2000,
      });
      if (!res.ok) throw new Error(`Overpass nearest-peak responded ${res.status}`);
      return (await res.json()) as { elements: OverpassPeakElement[] };
    });

    let nearest: NearestPeak | null = null;
    for (const el of data.elements) {
      if (el.lat == null || el.lon == null || !el.tags?.name) continue;
      const distance_m = haversineMeters({ lat, lon }, { lat: el.lat, lon: el.lon });
      if (!nearest || distance_m < nearest.distance_m) {
        nearest = { name: el.tags.name, ele: el.tags.ele ? Number.parseFloat(el.tags.ele) : null, distance_m: Math.round(distance_m) };
      }
    }
    return nearest;
  } catch (err) {
    console.warn(`[geocode-admin] nearest-peak lookup failed for (${lat},${lon}): ${(err as Error).message}`);
    return null;
  }
}

interface OverpassRelationGeomElement {
  members?: Array<{ role: string; geometry?: Array<{ lat: number; lon: number }> }>;
  tags?: { name?: string };
}

/**
 * Best-effort "does a named mountain_range relation contain this point".
 * Limitation: each outer-role way is tested as its own ring rather than
 * stitched into the relation's full boundary, so a range whose outer
 * boundary is split across multiple ways can under-detect containment.
 * That only means a missed mountain_group, never a wrong one — the record
 * still carries nearest_peak either way.
 */
async function findContainingMountainRange(lat: number, lon: number): Promise<string | null> {
  const query = `[out:json][timeout:30];relation["natural"="mountain_range"]["name"](around:15000,${lat},${lon});out geom;`;
  try {
    const { data } = await cached('mountain-range', query, THIRTY_DAYS_MS, async () => {
      const res = await politeFetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        minDelayMs: 2000,
      });
      if (!res.ok) throw new Error(`Overpass mountain-range responded ${res.status}`);
      return (await res.json()) as { elements: OverpassRelationGeomElement[] };
    });

    for (const el of data.elements) {
      if (!el.tags?.name) continue;
      for (const member of el.members ?? []) {
        if (member.role !== 'outer' || !member.geometry) continue;
        const ring: [number, number][] = member.geometry.map((p) => [p.lon, p.lat]);
        if (ring.length < 4) continue;
        if (pointInGeometry(lon, lat, { type: 'Polygon', coordinates: [ring] })) return el.tags.name;
      }
    }
    return null;
  } catch (err) {
    console.warn(`[geocode-admin] mountain-range lookup failed for (${lat},${lon}): ${(err as Error).message}`);
    return null;
  }
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
