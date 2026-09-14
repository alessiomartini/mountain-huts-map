import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function writeCsv(path: string, headers: string[], rows: Array<Record<string, unknown>>): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
  }
  writeFileSync(path, lines.join('\n') + '\n');
}
