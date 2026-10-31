// Builds scripts/data/countries-europe.geojson from the Natural Earth admin-0
// polygons as republished by datasets/geo-countries (ODC-PDDL 1.0; Natural Earth
// is public domain). Keeps only polygons inside the European window, simplifies
// them (Douglas-Peucker, ~200 m) and rounds coordinates, to stay small enough to
// commit. Usage: npx tsx scripts/build-country-boundaries.ts <countries.geojson>
import { readFileSync, writeFileSync } from 'node:fs';

type Ring = [number, number][];
const WINDOW = { south: 34, west: -12, north: 72, east: 35 };
const TOLERANCE = 0.002;

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(points: Ring, tol: number): Ring {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(points[i], points[s], points[e]);
      if (d > max) { max = d; idx = i; }
    }
    if (idx >= 0 && max > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function inWindow(ring: Ring): boolean {
  return ring.some(([lon, lat]) => lat >= WINDOW.south && lat <= WINDOW.north && lon >= WINDOW.west && lon <= WINDOW.east);
}

const src = JSON.parse(readFileSync(process.argv[2], 'utf-8')) as {
  features: Array<{ properties: Record<string, string>; geometry: { type: string; coordinates: any } }>;
};
const out: unknown[] = [];
for (const f of src.features) {
  const code = f.properties['ISO3166-1-Alpha-2'];
  if (!code || code === '-99') continue;
  const polys: Ring[][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const kept: Ring[][] = [];
  for (const poly of polys) {
    if (!inWindow(poly[0])) continue;
    const rings = poly
      .map((r) => simplify(r, TOLERANCE).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number]))
      .filter((r) => r.length >= 4);
    if (rings.length) kept.push(rings);
  }
  if (!kept.length) continue;
  out.push({ type: 'Feature', properties: { code, name: f.properties.name }, geometry: { type: 'MultiPolygon', coordinates: kept } });
}
writeFileSync('scripts/data/countries-europe.geojson', JSON.stringify({ type: 'FeatureCollection', features: out }));
console.log(`${out.length} countries written`);
