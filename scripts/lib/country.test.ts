import { describe, expect, it } from 'vitest';
import { countryAt } from './country.ts';

describe('countryAt', () => {
  const cases: Array<[string, number, number, string]> = [
    ['Rifugio Vittorio Emanuele (IT)', 45.5, 7.25, 'IT'],
    ['Zermatt (CH), inside the alps-it bbox', 46.02, 7.75, 'CH'],
    ['Chamonix (FR), inside the alps-it bbox', 45.92, 6.87, 'FR'],
    ['Innsbruck (AT)', 47.26, 11.39, 'AT'],
    ['Bergen (NO)', 60.39, 5.32, 'NO'],
    ['Bolzano (IT)', 46.5, 11.35, 'IT'],
  ];
  for (const [name, lat, lon, code] of cases) {
    it(name, () => expect(countryAt(lat, lon)).toBe(code));
  }
  it('returns null at sea', () => expect(countryAt(40.0, 5.0)).toBeNull());
});
