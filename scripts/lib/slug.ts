export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Appends a short disambiguator so two huts with the same name get distinct slugs. */
export function disambiguateSlug(baseSlug: string, taken: Set<string>, disambiguator: string): string {
  if (!taken.has(baseSlug)) return baseSlug;
  const candidate = `${baseSlug}-${slugify(disambiguator)}`;
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${candidate}-${n}`)) n++;
  return `${candidate}-${n}`;
}

export function makeId(sourcePrefix: 'osm-node' | 'osm-way' | 'osm-relation' | 'wd', rawId: string | number): string {
  return `${sourcePrefix}-${rawId}`;
}
