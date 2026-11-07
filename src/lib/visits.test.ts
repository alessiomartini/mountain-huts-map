import { describe, expect, it } from 'vitest';
import {
  BODY_MAX,
  RATE_LIMIT_MAX,
  hashIp,
  isAuthorized,
  isRateLimited,
  parseModeration,
  validateVisit,
} from './visits.ts';

const NOW = new Date('2026-11-07T10:00:00Z');
const base = { hut: 'rifugio-test', body: 'Bella gita, sentiero ben segnato.' };

describe('validateVisit', () => {
  it('accepts a minimal valid visit', () => {
    const r = validateVisit(base, NOW);
    expect(r).toEqual({
      ok: true,
      value: { hut: 'rifugio-test', body: base.body, visitedMonth: null, displayName: null, lang: 'it' },
    });
  });

  it('accepts month, name and lang; trims and normalises', () => {
    const r = validateVisit({ ...base, body: `  ${base.body}\u0000 `, visitedMonth: '2026-08', displayName: '  Anna   F. ', lang: 'en' }, NOW);
    expect(r.ok && r.value).toMatchObject({ body: base.body, visitedMonth: '2026-08', displayName: 'Anna F.', lang: 'en' });
  });

  it('treats empty optional fields as absent', () => {
    const r = validateVisit({ ...base, visitedMonth: '', displayName: '' }, NOW);
    expect(r.ok && r.value).toMatchObject({ visitedMonth: null, displayName: null });
  });

  it('rejects non-objects and bad slugs', () => {
    expect(validateVisit(null, NOW)).toMatchObject({ ok: false, error: 'invalid_body' });
    expect(validateVisit({ ...base, hut: 'Bad Slug' }, NOW)).toMatchObject({ ok: false, error: 'invalid_hut' });
    expect(validateVisit({ ...base, hut: '../x' }, NOW)).toMatchObject({ ok: false, error: 'invalid_hut' });
    expect(validateVisit({ body: base.body }, NOW)).toMatchObject({ ok: false, error: 'invalid_hut' });
  });

  it('enforces text length', () => {
    expect(validateVisit({ ...base, body: 'corto' }, NOW)).toMatchObject({ ok: false, error: 'text_too_short' });
    expect(validateVisit({ ...base, body: '   ' }, NOW)).toMatchObject({ ok: false, error: 'text_too_short' });
    expect(validateVisit({ ...base, body: 'x'.repeat(BODY_MAX + 1) }, NOW)).toMatchObject({ ok: false, error: 'text_too_long' });
    expect(validateVisit({ ...base, body: 'x'.repeat(BODY_MAX) }, NOW).ok).toBe(true);
    expect(validateVisit({ ...base, body: 42 }, NOW)).toMatchObject({ ok: false, error: 'invalid_text' });
  });

  it('validates month format and rejects the future', () => {
    expect(validateVisit({ ...base, visitedMonth: '2026-11' }, NOW).ok).toBe(true);
    expect(validateVisit({ ...base, visitedMonth: '2026-12' }, NOW)).toMatchObject({ ok: false, error: 'invalid_month' });
    expect(validateVisit({ ...base, visitedMonth: '2026-13' }, NOW)).toMatchObject({ ok: false, error: 'invalid_month' });
    expect(validateVisit({ ...base, visitedMonth: '08/2026' }, NOW)).toMatchObject({ ok: false, error: 'invalid_month' });
    expect(validateVisit({ ...base, visitedMonth: '1800-01' }, NOW)).toMatchObject({ ok: false, error: 'invalid_month' });
  });

  it('rejects over-long names', () => {
    expect(validateVisit({ ...base, displayName: 'n'.repeat(41) }, NOW)).toMatchObject({ ok: false, error: 'invalid_name' });
  });

  it('flags the honeypot', () => {
    expect(validateVisit({ ...base, website: 'http://spam.example' }, NOW)).toMatchObject({ ok: false, honeypot: true });
    expect(validateVisit({ ...base, website: '' }, NOW).ok).toBe(true);
  });
});

describe('hashIp', () => {
  it('is deterministic, salted and does not contain the IP', async () => {
    const a = await hashIp('192.0.2.1', 'salt-one');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp('192.0.2.1', 'salt-one')).toBe(a);
    expect(await hashIp('192.0.2.1', 'salt-two')).not.toBe(a);
    expect(await hashIp('192.0.2.2', 'salt-one')).not.toBe(a);
    expect(a).not.toContain('192');
  });
});

describe('isRateLimited', () => {
  it('blocks at the limit', () => {
    expect(isRateLimited(0)).toBe(false);
    expect(isRateLimited(RATE_LIMIT_MAX - 1)).toBe(false);
    expect(isRateLimited(RATE_LIMIT_MAX)).toBe(true);
    expect(isRateLimited(5, 10)).toBe(false);
  });
});

describe('isAuthorized', () => {
  const token = 'fake-moderation-token-0123456789';
  it('accepts only the exact bearer token', () => {
    expect(isAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(isAuthorized(`Bearer ${token}x`, token)).toBe(false);
    expect(isAuthorized('Bearer nope', token)).toBe(false);
    expect(isAuthorized(token, token)).toBe(false);
    expect(isAuthorized(null, token)).toBe(false);
  });
  it('refuses when the secret is missing or weak', () => {
    expect(isAuthorized('Bearer abc', undefined)).toBe(false);
    expect(isAuthorized('Bearer short', 'short')).toBe(false);
  });
});

describe('parseModeration', () => {
  it('parses valid input only', () => {
    expect(parseModeration({ id: 3, status: 'approved' })).toEqual({ id: 3, status: 'approved' });
    expect(parseModeration({ id: 0, status: 'approved' })).toBeNull();
    expect(parseModeration({ id: 1.5, status: 'approved' })).toBeNull();
    expect(parseModeration({ id: 1, status: 'deleted' })).toBeNull();
    expect(parseModeration('x')).toBeNull();
  });
});
