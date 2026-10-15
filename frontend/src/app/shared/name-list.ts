// src/app/shared/name-list.ts
//
// Splits a pasted list of player names, for the live preview on fast blind-draw setup.
// Mirrors api/lib/NameList.php, which does the real parse when the list is saved, so a
// drift between the two costs a preview count, never a wrong roster. Keep them in step.
//
//   - one name per line, or tab-separated cells (a spreadsheet row);
//   - a single line splits on commas/semicolons ("Ann, Bob, Cara"), but once there are
//     several lines each line is one name, so "Smith, John" stays one person;
//   - leading list markers ("1.", "2)", "-", "*", "•") and extra spaces are removed;
//   - repeats, of the roster or earlier in the paste, are skipped case-insensitively.

export const MAX_NAME_LENGTH = 255;

const MARKER = /^(?:\d{1,3}[.)]|[-*•·–])\s*/u;

export interface ParsedNames {
  names: string[];
  duplicates: string[];
  tooLong: string[];
}

export function parseNameList(text: string, existing: string[] = []): ParsedNames {
  const seen = new Set(existing.map(key));
  const result: ParsedNames = { names: [], duplicates: [], tooLong: [] };

  for (const raw of split(text)) {
    const name = clean(raw);
    if (!name) continue;
    // PHP's mb_strlen counts code points, as does spreading the string.
    if ([...name].length > MAX_NAME_LENGTH) { result.tooLong.push(name); continue; }
    const k = key(name);
    if (seen.has(k)) { result.duplicates.push(name); continue; }
    seen.add(k);
    result.names.push(name);
  }
  return result;
}

function split(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n|\t/);
  const nonEmpty = lines.filter(l => l.trim() !== '');
  return nonEmpty.length === 1 ? nonEmpty[0].split(/[,;]/) : lines;
}

function clean(raw: string): string {
  return raw.replace(/[\s ​]+/gu, ' ').trim().replace(MARKER, '').trim();
}

function key(name: string): string {
  return clean(name).toLowerCase();
}
