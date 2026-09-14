// Geometry and name-matching helpers shared by the merge/dedup step and the
// admin-boundary / nearest-peak lookups.

export interface LatLon {
  lat: number;
  lon: number;
}

/** [south, west, north, east], matching regions.config.ts and the Overpass bbox order. */
export type BBox = [number, number, number, number];

export function isInBBox(lat: number, lon: number, bbox: BBox): boolean {
  const [south, west, north, east] = bbox;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

/**
 * Splits a bbox into a grid of tiles no larger than tileDeg×tileDeg. A
 * region-sized bbox (e.g. all of the Italian Alps) is too large for a
 * single Overpass query to answer before the public instance's own
 * timeout — tiling trades one big fragile request for many small robust
 * ones, each independently cacheable and independently retryable.
 */
export function splitBBox(bbox: BBox, tileDeg: number): BBox[] {
  const [south, west, north, east] = bbox;
  const tiles: BBox[] = [];
  for (let lat = south; lat < north; lat += tileDeg) {
    const tileNorth = Math.min(lat + tileDeg, north);
    for (let lon = west; lon < east; lon += tileDeg) {
      const tileEast = Math.min(lon + tileDeg, east);
      tiles.push([lat, lon, tileNorth, tileEast]);
    }
  }
  return tiles;
}

export function haversineMeters(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Generic hut/bivouac words in the languages of the regions we cover, so
// "Bivacco Lanfranconi" and "Lanfranconi" normalize to the same string for
// name-similarity matching. Extend this list, don't branch on it, when a
// new region/language is added.
const GENERIC_PREFIXES = [
  'bivacco',
  'rifugio',
  'capanna',
  'refuge',
  'berghutte',
  'hutte',
  'hut',
  'hytte',
  'turisthytte',
  'shelter',
  'baita',
];

export function normalizeName(name: string): string {
  let n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (combining diacritical marks)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const prefix of GENERIC_PREFIXES) {
    const re = new RegExp(`^${prefix}\\s+`);
    if (re.test(n)) {
      n = n.replace(re, '').trim();
      break;
    }
  }
  return n;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) dp[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** 1 = identical (after normalization), 0 = completely different. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

// Minimal GeoJSON geometry types (avoids an @types/geojson dependency for
// the handful of shapes we actually consume: Polygon/MultiPolygon, and
// Point for peak lookups).
export type Ring = [number, number][]; // [lon, lat]
export type PolygonCoords = Ring[];
export type MultiPolygonCoords = PolygonCoords[];

export type GeoJSONGeometry =
  | { type: 'Polygon'; coordinates: PolygonCoords }
  | { type: 'MultiPolygon'; coordinates: MultiPolygonCoords };

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, polygon: PolygonCoords): boolean {
  if (polygon.length === 0) return false;
  if (!pointInRing(lon, lat, polygon[0])) return false; // outside exterior ring
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lon, lat, polygon[i])) return false; // inside a hole
  }
  return true;
}

export function pointInGeometry(lon: number, lat: number, geometry: GeoJSONGeometry): boolean {
  if (geometry.type === 'Polygon') return pointInPolygon(lon, lat, geometry.coordinates);
  return geometry.coordinates.some((polygon) => pointInPolygon(lon, lat, polygon));
}
