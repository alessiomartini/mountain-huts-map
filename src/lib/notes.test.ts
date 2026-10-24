import { describe, expect, it } from 'vitest';
import { buildContext, buildPayload, MAX_NOTE_LENGTH } from './notes.ts';

describe('buildContext', () => {
  it('includes language and filters from the query string', () => {
    expect(buildContext('it', '/it/', '?type=bivacco&free=1')).toBe('lang=it; filters=type=bivacco&free=1');
  });
  it('includes the hut slug on hut pages', () => {
    expect(buildContext('en', '/en/hut/bivacco-lanfranconi', '')).toBe('lang=en; hut=bivacco-lanfranconi');
  });
  it('is capped in length', () => {
    expect(buildContext('it', '/it/', '?q=' + 'x'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });
});

describe('buildPayload', () => {
  const loc = { lang: 'it', pathname: '/it/', search: '' };
  it('returns null for blank text', () => {
    expect(buildPayload('   \n', '', loc)).toBeNull();
  });
  it('builds the expected body and passes the honeypot through', () => {
    expect(buildPayload('  ciao ', 'spam', loc)).toEqual({
      text: 'ciao',
      page: '/it/',
      context: 'lang=it',
      website: 'spam',
    });
  });
  it('truncates over-long text', () => {
    expect(buildPayload('a'.repeat(MAX_NOTE_LENGTH + 50), '', loc)?.text.length).toBe(MAX_NOTE_LENGTH);
  });
});
