import { describe, expect, it } from 'vitest';
import { countHutsBySource } from './source-counts.ts';

describe('countHutsBySource', () => {
  it('counts each hut once per source', () => {
    const counts = countHutsBySource([
      { sources: [{ name: 'cai' }, { name: 'cai' }, { name: 'osm' }] },
      { sources: [{ name: 'cai' }] },
      { sources: [] },
      {},
    ]);
    expect(counts).toEqual({ cai: 2, osm: 1 });
  });
});
