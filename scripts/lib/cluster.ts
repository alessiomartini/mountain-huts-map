// Entity resolution: groups candidates from different sources that describe
// the same real-world hut. One pass, grid-indexed so it stays fast well
// past a few thousand records (the whole of Europe, eventually) rather than
// comparing every pair.
import { haversineMeters, nameSimilarity, type LatLon } from './geo.ts';

export interface Clusterable {
  coords: LatLon;
  name: string;
}

// Same-hut if within CLUSTER_DISTANCE_M *and* the names are similar enough,
// or unconditionally if within TIGHT_DISTANCE_M (covers garbled/abbreviated
// names from a scraper — being metres apart is enough on its own).
// One threshold set covers every case the spec calls out separately
// (OSM<->scraper 250m, OSM<->Wikipedia 200m, final dedup 150m, My Maps
// 300m is handled on its own in import-mymaps.ts since it never merges
// fields into the dataset) — clustering here *is* the final dedup pass.
const CLUSTER_DISTANCE_M = 220;
const TIGHT_DISTANCE_M = 60;
const NAME_SIMILARITY_THRESHOLD = 0.55;

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

const CELL_DEG = 0.01; // ~1.1km at the equator — generous relative to CLUSTER_DISTANCE_M

function cellCoord(value: number): number {
  return Math.floor(value / CELL_DEG);
}

export function clusterByProximityAndName<T extends Clusterable>(items: T[]): T[][] {
  const n = items.length;
  if (n === 0) return [];
  const uf = new UnionFind(n);

  const grid = new Map<string, number[]>();
  items.forEach((item, i) => {
    const key = `${cellCoord(item.coords.lat)}:${cellCoord(item.coords.lon)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i);
    else grid.set(key, [i]);
  });

  items.forEach((item, i) => {
    const baseLat = cellCoord(item.coords.lat);
    const baseLon = cellCoord(item.coords.lon);
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        const bucket = grid.get(`${baseLat + dLat}:${baseLon + dLon}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j <= i) continue;
          const other = items[j];
          const distance = haversineMeters(item.coords, other.coords);
          if (distance > CLUSTER_DISTANCE_M) continue;
          const sameHut = distance <= TIGHT_DISTANCE_M || nameSimilarity(item.name, other.name) >= NAME_SIMILARITY_THRESHOLD;
          if (sameHut) uf.union(i, j);
        }
      }
    }
  });

  const groups = new Map<number, number[]>();
  items.forEach((_, i) => {
    const root = uf.find(i);
    const group = groups.get(root);
    if (group) group.push(i);
    else groups.set(root, [i]);
  });

  return [...groups.values()].map((indices) => indices.map((i) => items[i]));
}
