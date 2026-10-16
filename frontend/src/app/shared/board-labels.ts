// src/app/shared/board-labels.ts
//
// What a tournament calls its playing spots (FEATURE_TRACKER item 8): board for bags, court
// for pickleball, and so on. Only the word changes. Mirrors BoardController::LABELS in the
// API; an unknown value falls back to "board".

export type BoardLabel = 'board' | 'court' | 'lane' | 'table' | 'pit' | 'field';

export interface BoardWord { value: BoardLabel; one: string; many: string; }

export const BOARD_WORDS: BoardWord[] = [
  { value: 'board', one: 'Board', many: 'Boards' },
  { value: 'court', one: 'Court', many: 'Courts' },
  { value: 'lane', one: 'Lane', many: 'Lanes' },
  { value: 'table', one: 'Table', many: 'Tables' },
  { value: 'pit', one: 'Pit', many: 'Pits' },
  { value: 'field', one: 'Field', many: 'Fields' },
];

export function boardWord(label: string | null | undefined): BoardWord {
  return BOARD_WORDS.find(w => w.value === label) ?? BOARD_WORDS[0];
}
