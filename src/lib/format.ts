import type { Hut } from './hut-schema.ts';
import type { Lang, TranslateParams } from '../i18n/index.ts';

type T = (key: string, params?: TranslateParams) => string;

export function displayName(hut: Hut, lang: Lang): string {
  return hut.names[lang] ?? hut.name;
}

export function displayElevation(hut: Hut, lang: Lang): string {
  if (hut.elevation_m == null) return '—';
  return new Intl.NumberFormat(lang).format(hut.elevation_m) + ' m';
}

export function displayPrice(hut: Hut, t: T): string {
  if (hut.price.type === 'free') return t('price.free');
  if (hut.price.night_from != null) return t('price.paidFrom', { amount: hut.price.night_from });
  return t('price.paid');
}

export function displayMountainLabel(hut: Hut, t: T): string | null {
  if (hut.location.mountain_group) return hut.location.mountain_group;
  if (hut.location.nearest_peak) return t('hut.nearMountain', { name: hut.location.nearest_peak.name });
  return null;
}

export function displayLocationLine(hut: Hut): string | null {
  const parts = [hut.location.municipality, hut.location.province, hut.location.region].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function categoryColor(category: Hut['category']): string {
  return category === 'bivacco' ? 'var(--color-bivacco)' : 'var(--color-rifugio)';
}
