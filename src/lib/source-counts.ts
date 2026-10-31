/** Number of huts that cite each source (`sources[].name`); a hut counts once per source. */
export function countHutsBySource(huts: ReadonlyArray<{ sources?: ReadonlyArray<{ name: string }> }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hut of huts) {
    for (const name of new Set((hut.sources ?? []).map((s) => s.name))) {
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return counts;
}
