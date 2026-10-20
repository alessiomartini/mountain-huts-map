import { describe, expect, it } from 'vitest';
import { SCRAPERS } from './index.ts';
import { SOURCE_ATTRIBUTION } from './attribution.ts';

describe('source attribution registry', () => {
  it('has an entry for every scraper module', () => {
    for (const scraper of SCRAPERS) {
      expect(SOURCE_ATTRIBUTION[scraper.sourceName], `missing attribution for "${scraper.sourceName}"`).toBeDefined();
    }
  });

  it('has no entry without a scraper unless marked retired', () => {
    const live = new Set(SCRAPERS.map((s) => s.sourceName));
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
});
