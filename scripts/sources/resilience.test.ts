// Spec §5-bis: "simulate a site offline or with changed HTML and verify the
// pipeline logs a warning and continues without failing." These tests mock
// global fetch directly rather than hitting the network (which this
// environment can't reach anyway) — they exercise the exact resilience
// contract every scripts/sources/*.ts file relies on.
import { existsSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHtml } from '../lib/scraper-base.ts';
import { paesidivaltellina } from './paesidivaltellina.ts';

function mockRobotsAllowsEverything() {
  return new Response('', { status: 404 });
}

const CACHE_NAMESPACES = ['resilience-test', 'paesidivaltellina'];

beforeEach(() => {
  vi.restoreAllMocks();
  for (const ns of CACHE_NAMESPACES) {
    if (existsSync(`scripts/.cache/${ns}`)) rmSync(`scripts/.cache/${ns}`, { recursive: true });
  }
});
afterEach(() => {
  for (const ns of CACHE_NAMESPACES) {
    if (existsSync(`scripts/.cache/${ns}`)) rmSync(`scripts/.cache/${ns}`, { recursive: true });
  }
});

describe('fetchHtml resilience', () => {
  it('returns null (not a throw) when the site is completely unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchHtml('https://this-site-is-down.example/', 'resilience-test');

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns null when robots.txt disallows the path, without ever fetching the page', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /\n', { status: 200 });
        throw new Error('should not fetch the page itself when robots.txt disallows it');
      });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await fetchHtml('https://example.com/some-page', 'resilience-test');

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // only the robots.txt check, never the page
  });
});

describe('a scraper facing changed/unexpected HTML', () => {
  it('returns zero candidates and logs a warning instead of throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return mockRobotsAllowsEverything();
      // The site is up, but its markup no longer has the heading structure we expect.
      return new Response('<html><body><div>Site redesigned, no headings here</div></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const candidates = await paesidivaltellina.run();

    expect(candidates).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns zero candidates and does not throw when the site 500s', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return mockRobotsAllowsEverything();
      return new Response('Internal Server Error', { status: 500 });
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(paesidivaltellina.run()).resolves.toEqual([]);
  });
});
