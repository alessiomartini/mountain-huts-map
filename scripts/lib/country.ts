// Country of a point by point-in-polygon against scripts/data/countries-europe.geojson
// (Natural Earth admin-0, simplified to ~200 m by scripts/build-country-boundaries.ts).
// Replaces "every hut found in a region's bbox is in region.country", which mislabelled
// foreign huts inside overlapping bboxes. Returns null in the sea or on a gap: callers
// fall back to the source's countryHint.
import { existsSync, readFileSync } from 'node:fs';
import { pointInGeometry, type GeoJSONGeometry } from './geo.ts';

interface CountryFeature {
  code: string;
  bbox: [number, number, number, number]; // west, south, east, north
  geometry: GeoJSONGeometry;
}

export const COUNTRIES_PATH = 'scripts/data/countries-europe.geojson';

function bboxOf(geometry: GeoJSONGeometry): CountryFeature['bbox'] {
  let w = 180, s = 90, e = -180, n = -90;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
  }
  return [w, s, e, n];
}

export function parseCountries(json: string): CountryFeature[] {
  const gj = JSON.parse(json) as { features: Array<{ properties: { code: string }; geometry: GeoJSONGeometry }> };
  return gj.features.map((f) => ({ code: f.properties.code, bbox: bboxOf(f.geometry), geometry: f.geometry }));
}

let loaded: CountryFeature[] | null = null;
function load(): CountryFeature[] {
  if (loaded) return loaded;
  loaded = existsSync(COUNTRIES_PATH) ? parseCountries(readFileSync(COUNTRIES_PATH, 'utf-8')) : [];
  if (loaded.length === 0) console.warn(`[country] Missing ${COUNTRIES_PATH}: falling back to country hints.`);
  return loaded;
}

export function countryAt(lat: number, lon: number, features: CountryFeature[] = load()): string | null {
  for (const f of features) {
    const [w, s, e, n] = f.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    if (pointInGeometry(lon, lat, f.geometry)) return f.code;
  }
  return null;
}
