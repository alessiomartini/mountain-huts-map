// Adding a language = add its code here + one JSON file (it.json as the
// template) + import it below. Nothing else in the app should need to
// change — components always go through t(), never a hardcoded string.
import it from './it.json';
import en from './en.json';

export const LANGS = ['it', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'it';

type TranslationDict = typeof it;
const dictionaries: Record<Lang, TranslationDict> = { it, en };

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

/** First path segment as a Lang, or DEFAULT_LANG if missing/unrecognized. */
export function getLangFromUrl(url: URL): Lang {
  const [, maybeLang] = url.pathname.split('/');
  return maybeLang && isLang(maybeLang) ? maybeLang : DEFAULT_LANG;
}

/** getStaticPaths() helper for pages nested directly under src/pages/[lang]/. */
export function getLangStaticPaths() {
  return LANGS.map((lang) => ({ params: { lang } }));
}

/** Same path with the [lang] segment swapped — what the language switcher links to. */
export function getRouteForLang(url: URL, lang: Lang): string {
  const segments = url.pathname.split('/');
  if (segments[1] && isLang(segments[1])) {
    segments[1] = lang;
  } else {
    segments.splice(1, 0, lang);
  }
  return segments.join('/') || `/${lang}/`;
}

function lookup(dict: unknown, path: string[]): unknown {
  let node = dict;
  for (const key of path) {
    if (typeof node !== 'object' || node === null || !(key in node)) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

export type TranslateParams = Record<string, string | number>;

export function useTranslations(lang: Lang) {
  const dict = dictionaries[lang];
  return function t(key: string, params?: TranslateParams): string {
    const value = lookup(dict, key.split('.'));
    if (typeof value !== 'string') {
      console.warn(`[i18n] Missing key "${key}" for lang "${lang}"`);
      return key;
    }
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (match, token: string) => (token in params ? String(params[token]) : match));
  };
}

export { dictionaries };
