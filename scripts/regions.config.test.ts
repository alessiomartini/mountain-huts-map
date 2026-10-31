import { describe, expect, it } from 'vitest';
import { REGIONS } from './regions.config.ts';
import { dedupeByExternalId } from './fetch-osm.ts';
import type { RawCandidate } from './lib/source-record.ts';

function overlapArea(a: number[], b: number[]): number {
  const h = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const w = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return h > 0 && w > 0 ? h * w : 0;
}

describe('REGIONS', () => {
  it('has unique ids', () => {
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
  });
  it('has valid bboxes and two-letter countries', () => {
    for (const r of REGIONS) {
      const [s, w, n, e] = r.bbox;
      expect(s).toBeLessThan(n);
      expect(w).toBeLessThan(e);
      expect(s).toBeGreaterThanOrEqual(-90);
      expect(n).toBeLessThanOrEqual(90);
      expect(w).toBeGreaterThanOrEqual(-180);
      expect(e).toBeLessThanOrEqual(180);
      expect(r.country).toMatch(/^[A-Z]{2}$/);
    }
  });
  it('has no overlapping bboxes except the known alps-it/apennines one', () => {
    const allowed = new Set(['alps-it|apennines']);
    for (let i = 0; i < REGIONS.length; i++) {
      for (let j = i + 1; j < REGIONS.length; j++) {
        if (allowed.has(`${REGIONS[i].id}|${REGIONS[j].id}`)) continue;
        expect(overlapArea(REGIONS[i].bbox, REGIONS[j].bbox), `${REGIONS[i].id} vs ${REGIONS[j].id}`).toBe(0);
      }
    }
  });
});

describe('dedupeByExternalId', () => {
  it('keeps the first of repeated ids and all candidates without id', () => {
    const mk = (externalId?: string): RawCandidate => ({ sourceName: 'osm', sourceUrl: '', fetchedAt: '', name: 'x', externalId });
    const out = dedupeByExternalId([mk('node/1'), mk('node/1'), mk('way/2'), mk(), mk()]);
    expect(out.map((c) => c.externalId)).toEqual(['node/1', 'way/2', undefined, undefined]);
  });
});
