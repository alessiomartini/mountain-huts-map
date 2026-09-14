import { describe, expect, it } from 'vitest';
import { clusterByProximityAndName } from './cluster.ts';

describe('clusterByProximityAndName', () => {
  it('merges two records with the same coordinates and similar names', () => {
    const items = [
      { name: 'Bivacco Lanfranconi', coords: { lat: 45.9, lon: 7.6 } },
      { name: 'Lanfranconi', coords: { lat: 45.9001, lon: 7.6001 } }, // ~13m away, same hut minus the generic prefix
    ];
    const clusters = clusterByProximityAndName(items);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(2);
  });

  it('keeps two genuinely distinct huts apart even if close', () => {
    const items = [
      { name: 'Rifugio Alpha', coords: { lat: 46.0, lon: 8.0 } },
      { name: 'Bivacco Beta', coords: { lat: 46.0005, lon: 8.0005 } }, // ~60m away, different names entirely
    ];
    const clusters = clusterByProximityAndName(items);
    expect(clusters).toHaveLength(2);
  });

  it('merges records that are extremely close regardless of name (garbled scraped name)', () => {
    const items = [
      { name: 'Rifugio Quintino Sella al Felik', coords: { lat: 45.85, lon: 7.87 } },
      { name: 'Quintino Sella', coords: { lat: 45.85001, lon: 7.87001 } }, // a few metres away
    ];
    const clusters = clusterByProximityAndName(items);
    expect(clusters).toHaveLength(1);
  });

  it('does not merge similarly named huts that are far apart', () => {
    const items = [
      { name: 'Rifugio Vittorio Emanuele II', coords: { lat: 45.5, lon: 7.3 } },
      { name: 'Rifugio Vittorio Emanuele II', coords: { lat: 46.5, lon: 10.9 } }, // hundreds of km away
    ];
    const clusters = clusterByProximityAndName(items);
    expect(clusters).toHaveLength(2);
  });

  it('handles an empty input', () => {
    expect(clusterByProximityAndName([])).toEqual([]);
  });

  it('transitively merges a chain of nearby duplicates from three sources', () => {
    const items = [
      { name: 'Rifugio Gastaldi', coords: { lat: 45.2, lon: 7.1 } },
      { name: 'Rifugio Gastaldi', coords: { lat: 45.2003, lon: 7.1003 } },
      { name: 'Gastaldi', coords: { lat: 45.2006, lon: 7.1006 } },
    ];
    const clusters = clusterByProximityAndName(items);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });
});
