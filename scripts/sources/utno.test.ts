import { describe, expect, it } from 'vitest';
import { cabinToCandidate, parseUtCabin } from './utno.ts';

const page = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      publicCabinData: {
        name: 'Testhytta',
        serviceLevel: 'SELF_SERVICE',
        bedsStaffed: 0,
        bedsSelfService: 13,
        bedsNoService: 0,
        phone: '12345678',
        email: 'test@example.com',
        bookingUrl: 'https://hyttebestilling.dnt.no/hytte/1',
        ownerGroupConnection: { name: 'Test Turistforening' },
      },
    },
  },
})}</script></html>`;

describe('utno', () => {
  it('turns a ut.no cabin page into a candidate with OSM coords', () => {
    const cabin = parseUtCabin(page);
    expect(cabin?.name).toBe('Testhytta');
    const osm = { sourceName: 'osm', sourceUrl: '', fetchedAt: '', name: 'Testhytta', coords: { lat: 61, lon: 7 } };
    const c = cabinToCandidate(cabin!, osm, 'https://ut.no/hytte/1', 'now');
    expect(c).toMatchObject({
      sourceName: 'utno',
      coords: { lat: 61, lon: 7 },
      capacity: 13,
      serviceLevel: 'self_service',
      operator: 'Test Turistforening',
      contact: { phone: '12345678', email: 'test@example.com' },
    });
  });

  it('returns null when the page has no cabin data', () => {
    expect(parseUtCabin('<html></html>')).toBeNull();
  });
});
