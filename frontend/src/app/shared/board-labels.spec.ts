// src/app/shared/board-labels.spec.ts
import { boardWord } from './board-labels';

describe('boardWord', () => {
  it('names the playing spot in both forms', () => {
    expect(boardWord('court')).toEqual({ value: 'court', one: 'Court', many: 'Courts' });
  });

  it('falls back to board for a missing or unknown value', () => {
    expect(boardWord(undefined).one).toBe('Board');
    expect(boardWord('rink').one).toBe('Board');
  });
});
