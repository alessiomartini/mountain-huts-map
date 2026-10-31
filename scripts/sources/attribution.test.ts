import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCRAPERS } from './index.ts';
import { PIPELINE_SOURCES, SOURCE_ATTRIBUTION } from './attribution.ts';

describe('source attribution registry', () => {
  it('has an entry for every scraper module', () => {
    for (const scraper of SCRAPERS) {
      expect(SOURCE_ATTRIBUTION[scraper.sourceName], `missing attribution for "${scraper.sourceName}"`).toBeDefined();
    }
  });

  it('has no entry without a scraper or pipeline script unless marked retired', () => {
    const live = new Set([...SCRAPERS.map((s) => s.sourceName), ...PIPELINE_SOURCES]);
    for (const [key, entry] of Object.entries(SOURCE_ATTRIBUTION)) {
      if (!live.has(key)) expect(entry.retired, `"${key}" has no scraper and is not retired`).toBe(true);
    }
  });

  it('gives every entry a name and an https URL', () => {
    for (const [key, entry] of Object.entries(SOURCE_ATTRIBUTION)) {
      expect(entry.name.length, key).toBeGreaterThan(0);
      expect(entry.url.startsWith('https://'), key).toBe(true);
    }
  });

  it('has an entry for every source named in huts.json', () => {
    const huts = JSON.parse(readFileSync(new URL('../../src/data/huts.json', import.meta.url), 'utf8')) as Array<{ sources?: Array<{ name: string }> }>;
    const names = new Set(huts.flatMap((h) => (h.sources ?? []).map((s) => s.name)));
    for (const name of names) expect(SOURCE_ATTRIBUTION[name], `missing attribution for "${name}" used in huts.json`).toBeDefined();
  });

  it('keeps the OpenStreetMap copyright link and ODbL licence', () => {
    expect(SOURCE_ATTRIBUTION.osm.url).toBe('https://www.openstreetmap.org/copyright');
    expect(SOURCE_ATTRIBUTION.osm.license?.name).toContain('ODbL');
  });
});
