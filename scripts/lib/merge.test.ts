import { describe, expect, it } from 'vitest';
import { mergeCluster } from './merge.ts';
import type { RawCandidate } from './source-record.ts';

const NOW = new Date().toISOString();

function osmCandidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    sourceName: 'osm',
    sourceUrl: 'https://www.openstreetmap.org/node/1',
    fetchedAt: NOW,
    externalId: 'osm-node-1',
    name: 'Rifugio Test',
    category: 'rifugio',
    osmType: 'alpine_hut',
    categoryConfidence: 'high',
    coords: { lat: 45.5, lon: 7.5 },
    elevationM: 2500,
    verified: true,
    ...overrides,
  };
}

describe('mergeCluster', () => {
  it('prefers OSM coordinates over any other source, even a higher-elevation-precision one', () => {
    const wikipediaCandidate: RawCandidate = {
      sourceName: 'wikipedia',
      sourceUrl: 'https://it.wikipedia.org/wiki/Rifugio_Test',
      fetchedAt: NOW,
      name: 'Rifugio Test',
      coords: { lat: 45.50001, lon: 7.50001 }, // slightly different
      verified: true,
    };
    const result = mergeCluster([osmCandidate(), wikipediaCandidate]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.coords).toEqual({ lat: 45.5, lon: 7.5 });
  });

  it('lets a higher-precedence source win a scalar field conflict', () => {
    const scraperCandidate: RawCandidate = {
      sourceName: 'diska', // lower precedence than 'cai'
      sourceUrl: 'https://www.diska.it/rifugi_d_1.htm',
      fetchedAt: NOW,
      name: 'Rifugio Test',
      coords: { lat: 45.5, lon: 7.5 },
      capacity: 40,
      scraperOnly: true,
    };
    const caiCandidate: RawCandidate = {
      sourceName: 'cai',
      sourceUrl: 'https://rifugi.cai.it/shelters/test',
      fetchedAt: NOW,
      name: 'Rifugio Test',
      coords: { lat: 45.5, lon: 7.5 },
      capacity: 55,
    };
    const result = mergeCluster([scraperCandidate, caiCandidate]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.capacity).toBe(55); // cai (80) beats diska (70)
  });

  it('flags an elevation conflict beyond the 50m threshold but keeps the higher-precedence value', () => {
    const abitarelestremoCandidate: RawCandidate = {
      sourceName: 'abitarelestremo',
      sourceUrl: 'https://www.abitarelestremo.it/x',
      fetchedAt: NOW,
      name: 'Rifugio Test',
      coords: { lat: 45.5, lon: 7.5 },
      elevationM: 2420, // 80m off from OSM's 2500
      scraperOnly: true,
    };
    const result = mergeCluster([osmCandidate(), abitarelestremoCandidate]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.elevation_m).toBe(2500); // OSM wins
    expect(result.record.reviewReasons.some((r) => r.includes('elevation conflict'))).toBe(true);
  });

  it('does not flag an elevation difference within the 50m threshold', () => {
    const closeCandidate: RawCandidate = {
      sourceName: 'diska',
      sourceUrl: 'https://www.diska.it/x',
      fetchedAt: NOW,
      name: 'Rifugio Test',
      coords: { lat: 45.5, lon: 7.5 },
      elevationM: 2530,
      scraperOnly: true,
    };
    const result = mergeCluster([osmCandidate(), closeCandidate]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.reviewReasons.some((r) => r.includes('elevation conflict'))).toBe(false);
  });

  it('defaults a bivacco to free but respects and flags an explicit fee=yes', () => {
    const bivacco = osmCandidate({
      category: 'bivacco',
      osmType: 'wilderness_hut',
      price: { type: 'paid', currency: null, night_from: null, night_to: null, half_board_from: null, cai_member_discount: null, source_url: null, checked_on: null },
    });
    const result = mergeCluster([bivacco]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.price.type).toBe('paid'); // respected, not silently forced to free
    expect(result.record.reviewReasons.some((r) => r.includes('bivacco with a paid price'))).toBe(true);
  });

  it('defaults a bivacco with no price signal to free', () => {
    const bivacco = osmCandidate({ category: 'bivacco', osmType: 'wilderness_hut', price: undefined });
    const result = mergeCluster([bivacco]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.price).toEqual({ type: 'free' });
  });

  it('defaults an unpriced rifugio to "paid, unknown amount" rather than inventing figures or defaulting free', () => {
    const rifugio = osmCandidate({ price: undefined });
    const result = mergeCluster([rifugio]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.price.type).toBe('paid');
    if (result.record.price.type === 'paid') {
      expect(result.record.price.night_from).toBeNull();
      expect(result.record.price.currency).toBeNull();
    }
  });

  it('respects an explicit free rifugio rather than forcing "paid"', () => {
    const freeRifugio = osmCandidate({ price: { type: 'free' } });
    const result = mergeCluster([freeRifugio]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.price).toEqual({ type: 'free' });
  });

  it('falls back to name-based classification when no source provides a category, flagging it', () => {
    const scraperOnly: RawCandidate = {
      sourceName: 'hikesoftheworld',
      sourceUrl: 'https://www.hikesoftheworld.com/x',
      fetchedAt: NOW,
      name: 'Bivacco Senza Categoria',
      coords: { lat: 46.1, lon: 8.2 },
      scraperOnly: true,
    };
    const result = mergeCluster([scraperOnly]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.category).toBe('bivacco');
    expect(result.record.category_confidence).toBe('low');
    expect(result.record.reviewReasons.some((r) => r.includes('category inferred from name only'))).toBe(true);
  });

  it('rejects a cluster with no category signal at all', () => {
    const uncategorizable: RawCandidate = {
      sourceName: 'hikesoftheworld',
      sourceUrl: 'https://www.hikesoftheworld.com/x',
      fetchedAt: NOW,
      name: 'Punta Misteriosa',
      coords: { lat: 46.1, lon: 8.2 },
      scraperOnly: true,
    };
    const result = mergeCluster([uncategorizable]);
    expect(result.ok).toBe(false);
  });

  it('marks verified=true when OSM is present, even alone', () => {
    const result = mergeCluster([osmCandidate({ verified: undefined })]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.verified).toBe(true);
  });

  it('marks verified=false and isScraperOnly=true for a lone scraper candidate', () => {
    const lone: RawCandidate = {
      sourceName: 'diska',
      sourceUrl: 'https://www.diska.it/x',
      fetchedAt: NOW,
      name: 'Rifugio Solo Scraper',
      coords: { lat: 45.9, lon: 7.9 },
      scraperOnly: true,
    };
    const result = mergeCluster([lone]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.verified).toBe(false);
    expect(result.record.isScraperOnly).toBe(true);
  });

  it('marks verified=true when two independent scrapers corroborate each other, but keeps isScraperOnly=true since neither is OSM/Wikipedia', () => {
    const a: RawCandidate = {
      sourceName: 'diska',
      sourceUrl: 'https://www.diska.it/x',
      fetchedAt: NOW,
      name: 'Rifugio Corroborato',
      coords: { lat: 45.9, lon: 7.9 },
      scraperOnly: true,
    };
    const b: RawCandidate = {
      sourceName: 'abitarelestremo',
      sourceUrl: 'https://www.abitarelestremo.it/x',
      fetchedAt: NOW,
      name: 'Rifugio Corroborato',
      coords: { lat: 45.9, lon: 7.9 },
      scraperOnly: true,
    };
    const result = mergeCluster([a, b]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.verified).toBe(true); // "verified" per the general >=2-independent-sources rule
    expect(result.record.isScraperOnly).toBe(true); // but spec §2.6 requires OSM/Wikipedia specifically to leave unverified.csv
  });

  it('unions photos and links from every candidate, deduplicated by url', () => {
    const withPhoto: RawCandidate = {
      ...osmCandidate(),
      photos: [{ url: 'https://commons.wikimedia.org/a.jpg', thumb_url: 'https://commons.wikimedia.org/a-thumb.jpg', author: 'Someone', license: 'CC BY-SA 4.0', source_url: 'https://commons.wikimedia.org/wiki/File:a.jpg' }],
    };
    const wikipediaCandidate: RawCandidate = {
      sourceName: 'wikipedia',
      sourceUrl: 'https://it.wikipedia.org/wiki/Rifugio_Test',
      fetchedAt: NOW,
      name: 'Rifugio Test',
      coords: { lat: 45.5, lon: 7.5 },
      photos: [{ url: 'https://commons.wikimedia.org/a.jpg', thumb_url: 'https://commons.wikimedia.org/a-thumb.jpg', author: 'Someone', license: 'CC BY-SA 4.0', source_url: 'https://commons.wikimedia.org/wiki/File:a.jpg' }],
      links: [{ label: 'Wikipedia (it)', url: 'https://it.wikipedia.org/wiki/Rifugio_Test', kind: 'wikipedia' }],
    };
    const result = mergeCluster([withPhoto, wikipediaCandidate]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.photos).toHaveLength(1); // deduped, not 2
    expect(result.record.links.some((l) => l.kind === 'wikipedia')).toBe(true);
  });
});
