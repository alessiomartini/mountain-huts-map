import { describe, expect, it } from 'vitest';
import { validateHuts } from './validate.ts';

function validHut(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'osm-node-123456',
    slug: 'bivacco-lanfranconi',
    name: 'Bivacco Lanfranconi',
    names: { it: 'Bivacco Lanfranconi', en: 'Lanfranconi Bivouac' },
    category: 'bivacco',
    osm_type: 'wilderness_hut',
    service_level: 'unstaffed',
    category_confidence: 'high',
    coords: { lat: 45.9, lon: 7.6 },
    elevation_m: 2900,
    location: {
      country: 'IT',
      region: 'Valle d\'Aosta',
      province: 'Aosta',
      municipality: 'Courmayeur',
      mountain_group: 'Monte Bianco',
      nearest_peak: null,
    },
    capacity: 9,
    price: { type: 'free' },
    facilities: { fireplace: null, stove: true, drinking_water: null, blankets: null, toilet: null, winter_room: null },
    access: { opening_hours: null, access_note_it: null, access_note_en: null },
    contact: { phone: null, email: null, website: null },
    description: { it: null, en: null },
    photos: [],
    links: [],
    sources: [{ name: 'osm', url: 'https://www.openstreetmap.org/node/123456', fetched_at: new Date().toISOString() }],
    verified: true,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('validateHuts', () => {
  it('accepts a well-formed record', () => {
    const { valid, errors } = validateHuts([validHut()]);
    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(1);
  });

  it('rejects a record with no sources', () => {
    const { valid, errors } = validateHuts([validHut({ sources: [] })]);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('rejects an invalid category', () => {
    const { errors } = validateHuts([validHut({ category: 'chalet' })]);
    expect(errors).toHaveLength(1);
  });

  it('rejects a non-kebab-case slug', () => {
    const { errors } = validateHuts([validHut({ slug: 'Bivacco Lanfranconi' })]);
    expect(errors).toHaveLength(1);
  });

  it('rejects out-of-range coordinates', () => {
    const { errors } = validateHuts([validHut({ coords: { lat: 200, lon: 7.6 } })]);
    expect(errors).toHaveLength(1);
  });

  it('rejects a price paid object with a negative night_from', () => {
    const { errors } = validateHuts([
      validHut({ price: { type: 'paid', currency: 'EUR', night_from: -10, night_to: null, half_board_from: null, cai_member_discount: null, source_url: null, checked_on: null } }),
    ]);
    expect(errors).toHaveLength(1);
  });

  it('keeps valid records and drops only the invalid one out of several', () => {
    const { valid, errors } = validateHuts([validHut({ id: 'a', slug: 'a' }), validHut({ id: 'b', slug: 'b', category: 'nope' })]);
    expect(valid).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe('b');
  });
});
