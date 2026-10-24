// Pure logic for the note/feedback widget (payload building), kept apart from
// the DOM code so it can be unit-tested.

export const NOTES_ENDPOINT = 'https://site-notes.alemarti-2001.workers.dev/mountain-huts-map/notes';
export const MAX_NOTE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 300;

export interface NotePayload {
  text: string;
  page: string;
  context: string;
  website: string;
}

/**
 * Short description of where the visitor is: language, hut page slug (if any)
 * and the active map filters, which the map keeps in the URL query string.
 */
export function buildContext(lang: string, pathname: string, search: string): string {
  const parts = [`lang=${lang}`];
  const hut = pathname.match(/\/hut\/([^/]+)\/?$/);
  if (hut) parts.push(`hut=${decodeURIComponent(hut[1])}`);
  const query = search.replace(/^\?/, '');
  if (query) parts.push(`filters=${query}`);
  return parts.join('; ').slice(0, MAX_CONTEXT_LENGTH);
}

/** Returns null when the text is empty after trimming. `website` is the honeypot value, sent as-is. */
export function buildPayload(
  rawText: string,
  honeypot: string,
  loc: { lang: string; pathname: string; search: string },
): NotePayload | null {
  const text = rawText.trim().slice(0, MAX_NOTE_LENGTH);
  if (!text) return null;
  return {
    text,
    page: loc.pathname,
    context: buildContext(loc.lang, loc.pathname, loc.search),
    website: honeypot,
  };
}
