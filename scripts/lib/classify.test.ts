import { describe, expect, it } from 'vitest';
import { classifyByNameOnly, classifyHut } from './classify.ts';

describe('classifyHut', () => {
  it('classifies a well-tagged rifugio as rifugio, high confidence, no review', () => {
    const result = classifyHut({
      tourism: 'alpine_hut',
      name: 'Rifugio Torino',
      operator: 'CAI Torino - gestione privata',
      phone: '+39 011 1234567',
      opening_hours: 'Jun-Sep',
      fee: 'yes',
      capacity: 90,
    });
    expect(result.category).toBe('rifugio');
    expect(result.osm_type).toBe('alpine_hut');
    expect(result.category_confidence).toBe('high');
    expect(result.needsReview).toBe(false);
  });

  it('classifies a well-tagged wilderness_hut as bivacco, no review', () => {
    const result = classifyHut({
      tourism: 'wilderness_hut',
      name: 'Bivacco Gervasutti',
      capacity: 6,
      fee: 'no',
      unmanned: 'yes',
    });
    expect(result.category).toBe('bivacco');
    expect(result.osm_type).toBe('wilderness_hut');
    expect(result.needsReview).toBe(false);
  });

  it('reclassifies a bivacco mistagged as alpine_hut when the heuristic is confident', () => {
    // This is the exact failure mode the spec calls out: small, free,
    // unmanned, CAI-operated, named "Bivacco X" — but tagged alpine_hut.
    const result = classifyHut({
      tourism: 'alpine_hut',
      name: 'Bivacco Città di Chivasso',
      operator: 'CAI Chivasso',
      capacity: 9,
      fee: 'no',
      unmanned: 'yes',
    });
    expect(result.category).toBe('bivacco');
    expect(result.osm_type).toBe('alpine_hut'); // raw tag preserved even though we override category
    expect(result.category_confidence).toBe('low');
    expect(result.needsReview).toBe(true);
  });

  it('keeps the tag but flags for review on a weak/ambiguous conflict', () => {
    const result = classifyHut({
      tourism: 'alpine_hut',
      name: 'Rifugio Ambiguo',
      capacity: 10, // <=12 is a weak bivacco signal
      fee: 'no', // another weak bivacco signal
      // but the name starts with "Rifugio" (rifugio signal) — tag wins, low net heuristic gap
    });
    expect(result.category).toBe('rifugio'); // tag-derived category kept
    expect(result.needsReview).toBe(true);
    expect(result.category_confidence).toBe('medium');
  });

  it('excludes an open weather_shelter entirely', () => {
    const result = classifyHut({ amenity: 'shelter', shelter_type: 'weather_shelter', name: 'Riparo Anonimo' });
    expect(result.category).toBeNull();
    expect(result.needsReview).toBe(false);
  });

  it('classifies a basic_hut shelter as bivacco', () => {
    const result = classifyHut({ amenity: 'shelter', shelter_type: 'basic_hut', name: 'Bivacco Semplice' });
    expect(result.category).toBe('bivacco');
    expect(result.osm_type).toBe('basic_hut');
  });

  it('returns null category for unrecognized tagging', () => {
    const result = classifyHut({ name: 'Qualcosa Non Classificato' });
    expect(result.category).toBeNull();
  });
});

describe('classifyByNameOnly', () => {
  it('recognizes "bivacco" in the name', () => {
    expect(classifyByNameOnly('Bivacco Lanfranconi')).toBe('bivacco');
  });
  it('recognizes "rifugio" and its foreign equivalents', () => {
    expect(classifyByNameOnly('Rifugio Quintino Sella')).toBe('rifugio');
    expect(classifyByNameOnly('Refuge du Goûter')).toBe('rifugio');
    expect(classifyByNameOnly('Fannaråkhytta')).toBe('rifugio');
  });
  it('returns null when the name gives no clue', () => {
    expect(classifyByNameOnly('Punta Helbronner')).toBeNull();
  });
});
