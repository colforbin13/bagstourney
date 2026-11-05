// src/app/shared/name-list.spec.ts
//
// Same cases as tests/NameListTest.php, so the preview and the saved roster agree.
import { parseNameList, MAX_NAME_LENGTH } from './name-list';

describe('parseNameList', () => {
  it('takes one name per line', () => {
    expect(parseNameList('Ann\nBob\nCara\nDev').names).toEqual(['Ann', 'Bob', 'Cara', 'Dev']);
  });

  it('handles Windows and old Mac line endings', () => {
    expect(parseNameList('Ann\r\nBob\rCara').names).toEqual(['Ann', 'Bob', 'Cara']);
  });

  it('ignores blank lines and surrounding space', () => {
    expect(parseNameList('\n  Ann  \n\n\t\n Bob\n\n').names).toEqual(['Ann', 'Bob']);
  });

  it('splits a single line on commas and semicolons', () => {
    expect(parseNameList('Ann, Bob,Cara; Dev').names).toEqual(['Ann', 'Bob', 'Cara', 'Dev']);
  });

  it('does not split on commas once there are several lines', () => {
    expect(parseNameList('Smith, John\nDoe, Jane').names).toEqual(['Smith, John', 'Doe, Jane']);
  });

  it('splits a spreadsheet row on tabs', () => {
    expect(parseNameList('Ann\tBob\tCara').names).toEqual(['Ann', 'Bob', 'Cara']);
  });

  it('strips list markers', () => {
    expect(parseNameList('1. Ann\n2) Bob\n- Cara\n* Dev\n• Eve\n10.Finn').names)
      .toEqual(['Ann', 'Bob', 'Cara', 'Dev', 'Eve', 'Finn']);
  });

  it('leaves a name that starts with a number alone', () => {
    expect(parseNameList('3 Putt Pete\nAnn').names).toEqual(['3 Putt Pete', 'Ann']);
  });

  it('collapses internal whitespace', () => {
    expect(parseNameList('Ann   Marie Smith\nBob').names).toEqual(['Ann Marie Smith', 'Bob']);
  });

  it('skips repeats in the paste case-insensitively', () => {
    const r = parseNameList('Ann\nBob\nann\nBOB\nAnn  ');
    expect(r.names).toEqual(['Ann', 'Bob']);
    expect(r.duplicates).toEqual(['ann', 'BOB', 'Ann']);
  });

  it('skips names already on the roster', () => {
    const r = parseNameList('Ann\nBob\nCara', ['bob', 'Zed']);
    expect(r.names).toEqual(['Ann', 'Cara']);
    expect(r.duplicates).toEqual(['Bob']);
  });

  it('keeps unicode names and compares them case-insensitively', () => {
    const r = parseNameList('José\nZoë\nJOSÉ');
    expect(r.names).toEqual(['José', 'Zoë']);
    expect(r.duplicates).toEqual(['JOSÉ']);
  });

  it('reports overlong names instead of truncating them', () => {
    const long = 'a'.repeat(MAX_NAME_LENGTH + 1);
    const exact = 'b'.repeat(MAX_NAME_LENGTH);
    const r = parseNameList(`Ann\n${long}\n${exact}`);
    expect(r.names).toEqual(['Ann', exact]);
    expect(r.tooLong).toEqual([long]);
  });

  it('gives nothing for empty input', () => {
    expect(parseNameList(' \n\n ,  ')).toEqual({ names: [], duplicates: [], tooLong: [] });
  });

  it('does not treat a marker alone as a name', () => {
    expect(parseNameList('Ann\n-\n3.').names).toEqual(['Ann']);
  });
});
