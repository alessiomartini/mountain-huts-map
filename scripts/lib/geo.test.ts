import { describe, expect, it } from 'vitest';
import { splitBBox, isInBBox } from './geo.ts';

describe('splitBBox', () => {
  it('covers the whole original bbox with no gaps', () => {
    const bbox: [number, number, number, number] = [44.0, 6.0, 47.2, 13.9];
    const tiles = splitBBox(bbox, 1.5);
    // Every point on a fine grid inside the original bbox must fall in at least one tile.
    for (let lat = 44.0; lat < 47.2; lat += 0.3) {
      for (let lon = 6.0; lon < 13.9; lon += 0.3) {
        const covered = tiles.some((tile) => isInBBox(lat, lon, tile));
        expect(covered).toBe(true);
      }
    }
  });

  it('keeps every tile within the original bbox bounds', () => {
    const bbox: [number, number, number, number] = [44.0, 6.0, 47.2, 13.9];
    const tiles = splitBBox(bbox, 1.5);
    for (const [south, west, north, east] of tiles) {
      expect(south).toBeGreaterThanOrEqual(44.0);
      expect(west).toBeGreaterThanOrEqual(6.0);
      expect(north).toBeLessThanOrEqual(47.2);
      expect(east).toBeLessThanOrEqual(13.9);
    }
  });

  it('produces a single tile when the bbox is already smaller than tileDeg', () => {
    const tiles = splitBBox([45.0, 7.0, 45.5, 7.5], 1.5);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual([45.0, 7.0, 45.5, 7.5]);
  });
});
