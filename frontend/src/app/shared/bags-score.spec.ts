// src/app/shared/bags-score.spec.ts
import {
  BagsRound,
  BagsSettings,
  DEFAULT_SETTINGS,
  isValidRound,
  isValidSettings,
  scoreGame,
  throwPoints,
} from './bags-score';

/** A round: first team's in/on, then the second team's. */
const r = (aIn: number, aOn: number, bIn: number, bOn: number): BagsRound => [
  { in: aIn, on: aOn },
  { in: bIn, on: bOn },
];
const settings = (over: Partial<BagsSettings> = {}): BagsSettings => ({ ...DEFAULT_SETTINGS, ...over });
const straight = (over: Partial<BagsSettings> = {}) => settings({ mode: 'straight', ...over });

describe('bags scoring', () => {
  describe('points', () => {
    it('counts 3 for in the hole and 1 for on the board', () => {
      expect(throwPoints({ in: 0, on: 0 })).toBe(0);
      expect(throwPoints({ in: 1, on: 2 })).toBe(5);
      expect(throwPoints({ in: 4, on: 0 })).toBe(12);
    });

    it('defaults to cancellation scoring to 21 with no bust rule', () => {
      expect(DEFAULT_SETTINGS).toEqual({ mode: 'cancellation', target: 21, bust: 'off' });
    });
  });

  describe('validation', () => {
    it('accepts up to four bags a side', () => {
      expect(isValidRound(r(4, 0, 2, 2))).toBeTrue();
      expect(isValidRound(r(0, 0, 0, 0))).toBeTrue();
    });

    it('rejects more than four bags, negatives, fractions and junk', () => {
      expect(isValidRound(r(3, 2, 0, 0))).toBeFalse();
      expect(isValidRound(r(-1, 0, 0, 0))).toBeFalse();
      expect(isValidRound(r(1.5, 0, 0, 0))).toBeFalse();
      expect(isValidRound([{ in: 1, on: 0 }])).toBeFalse();
      expect(isValidRound(null)).toBeFalse();
      expect(isValidRound([{ in: '1', on: 0 }, { in: 0, on: 0 }])).toBeFalse();
    });

    it('rejects a round thrown after the game was won', () => {
      expect(() => scoreGame(settings(), [r(4, 0, 0, 0), r(4, 0, 0, 0)])).not.toThrow();
      expect(() => scoreGame(settings({ target: 12 }), [r(4, 0, 0, 0), r(1, 0, 0, 0)])).toThrowError(RangeError);
    });

    it('rejects an invalid round anywhere in the history', () => {
      expect(() => scoreGame(settings(), [r(1, 0, 0, 0), r(5, 0, 0, 0)])).toThrowError(RangeError);
    });

    it('checks the settings', () => {
      expect(isValidSettings(settings())).toBeTrue();
      expect(isValidSettings(settings({ bust: 15, target: 21 }))).toBeTrue();
      expect(isValidSettings(settings({ bust: 'previous', target: 5 }))).toBeTrue();
      expect(isValidSettings(settings({ bust: 15, target: 15 }))).toBeFalse();
      expect(isValidSettings(settings({ bust: 13, target: 11 }))).toBeFalse();
      expect(isValidSettings(settings({ target: 0 }))).toBeFalse();
      expect(isValidSettings(settings({ target: 100 }))).toBeFalse();
      expect(isValidSettings(settings({ target: 20.5 }))).toBeFalse();
      expect(isValidSettings({ ...settings(), mode: 'other' })).toBeFalse();
      expect(isValidSettings({ ...settings(), bust: 17 })).toBeFalse();
      expect(isValidSettings(null)).toBeFalse();
      expect(() => scoreGame({ ...settings(), target: -1 }, [])).toThrowError(RangeError);
    });
  });

  describe('cancellation scoring', () => {
    it('awards only the difference, to the side ahead', () => {
      const game = scoreGame(settings(), [r(2, 1, 1, 1), r(0, 1, 1, 2)]);
      expect(game.rounds[0].raw).toEqual([7, 4]);
      expect(game.rounds[0].awarded).toEqual([3, 0]);
      expect(game.rounds[1].awarded).toEqual([0, 4]);
      expect(game.scores).toEqual([3, 4]);
      expect(game.winner).toBeNull();
    });

    it('scores nothing on an even round', () => {
      const game = scoreGame(settings(), [r(1, 2, 1, 2), r(0, 0, 0, 0)]);
      expect(game.scores).toEqual([0, 0]);
      expect(game.rounds.map((x) => x.awarded)).toEqual([[0, 0], [0, 0]]);
    });

    it('wins on reaching or passing the target', () => {
      expect(scoreGame(settings(), [r(4, 0, 0, 0), r(3, 0, 0, 0)]).winner).toBe(0); // 21 exactly
      const over = scoreGame(settings(), [r(0, 0, 4, 0), r(0, 0, 4, 0)]); // 24
      expect(over.scores).toEqual([0, 24]);
      expect(over.winner).toBe(1);
    });

    it('plays to a non-default target', () => {
      const game = scoreGame(settings({ target: 11 }), [r(3, 0, 0, 0), r(0, 0, 0, 2)]);
      expect(game.scores).toEqual([9, 2]);
      expect(game.winner).toBeNull();
      expect(scoreGame(settings({ target: 11 }), [r(3, 0, 0, 0), r(1, 0, 0, 1)]).winner).toBe(0);
    });
  });

  describe('straight scoring', () => {
    it('lets both sides keep everything', () => {
      const game = scoreGame(straight(), [r(2, 1, 1, 1)]);
      expect(game.rounds[0].awarded).toEqual([7, 4]);
      expect(game.scores).toEqual([7, 4]);
    });

    it('gives the win to the higher total when both pass the target together', () => {
      const game = scoreGame(straight(), [r(4, 0, 4, 0), r(3, 0, 2, 2)]); // 21 vs 20: only the first finishes
      expect(game.winner).toBe(0);
      const both = scoreGame(straight(), [r(3, 0, 3, 0), r(3, 0, 3, 0), r(1, 0, 2, 0)]); // 21 vs 24
      expect(both.scores).toEqual([21, 24]);
      expect(both.winner).toBe(1);
      expect(both.extraRounds).toBeFalse();
    });

    it('plays extra rounds on a tie at the target, until a round separates them', () => {
      const tied = scoreGame(straight(), [r(4, 0, 4, 0), r(3, 0, 3, 0)]);
      expect(tied.scores).toEqual([21, 21]);
      expect(tied.winner).toBeNull();
      expect(tied.extraRounds).toBeTrue();

      const stillTied = scoreGame(straight(), [r(4, 0, 4, 0), r(3, 0, 3, 0), r(0, 1, 0, 1)]);
      expect(stillTied.extraRounds).toBeTrue();
      expect(stillTied.winner).toBeNull();

      const decided = scoreGame(straight(), [r(4, 0, 4, 0), r(3, 0, 3, 0), r(0, 1, 0, 1), r(0, 0, 0, 1)]);
      expect(decided.scores).toEqual([22, 23]);
      expect(decided.winner).toBe(1);
      expect(decided.extraRounds).toBeFalse();
    });
  });

  describe('bust rule', () => {
    // Team 1 gets to 18, then throws 6: one over-and-back case per option.
    const toEighteenThenSix = [r(4, 0, 0, 0), r(2, 0, 0, 0), r(2, 0, 0, 0)];

    it('sets a side that goes over back to 13', () => {
      const game = scoreGame(settings({ bust: 13 }), toEighteenThenSix);
      expect(game.rounds[2].awarded).toEqual([6, 0]);
      expect(game.rounds[2].busted).toEqual([true, false]);
      expect(game.scores).toEqual([13, 0]);
      expect(game.winner).toBeNull();
    });

    it('sets a side that goes over back to 15', () => {
      const game = scoreGame(settings({ bust: 15 }), toEighteenThenSix);
      expect(game.scores).toEqual([15, 0]);
      expect(game.winner).toBeNull();
    });

    it('sets a side that goes over back to its score before the round', () => {
      const game = scoreGame(settings({ bust: 'previous' }), toEighteenThenSix);
      expect(game.scores).toEqual([18, 0]);
      expect(game.rounds[2].busted).toEqual([true, false]);
      expect(game.winner).toBeNull();
    });

    it('lets a side that busted come back and win', () => {
      // 18, bust to 15, then an exact 6.
      expect(scoreGame(settings({ bust: 15 }), [...toEighteenThenSix, r(2, 0, 0, 0)]).scores).toEqual([21, 0]);
    });

    it('wins only on an exact hit', () => {
      for (const bust of [13, 15, 'previous'] as const) {
        const game = scoreGame(settings({ bust }), [r(4, 0, 0, 0), r(3, 0, 0, 0)]);
        expect(game.scores).withContext(String(bust)).toEqual([21, 0]);
        expect(game.winner).withContext(String(bust)).toBe(0);
      }
    });

    it('keeps the round history consistent with the score', () => {
      const game = scoreGame(settings({ bust: 13 }), toEighteenThenSix);
      expect(game.rounds.map((x) => x.scores)).toEqual([[12, 0], [18, 0], [13, 0]]);
    });

    it('checks each side on its own under straight scoring, and both can bust', () => {
      const game = scoreGame(straight({ bust: 15 }), [r(4, 0, 4, 0), r(2, 0, 2, 0), r(2, 0, 1, 0)]);
      // 18/18, then 24 and 21: the first busts to 15, the second hits it exactly.
      expect(game.rounds[2].busted).toEqual([true, false]);
      expect(game.scores).toEqual([15, 21]);
      expect(game.winner).toBe(1);

      const bothBust = scoreGame(straight({ bust: 'previous' }), [r(4, 0, 4, 0), r(2, 0, 2, 0), r(2, 0, 1, 1)]);
      expect(bothBust.rounds[2].busted).toEqual([true, true]);
      expect(bothBust.scores).toEqual([18, 18]);
      expect(bothBust.winner).toBeNull();
    });

    it('drops the bust rule in extra rounds, so a tie on the target can be broken', () => {
      const rounds = [r(4, 0, 4, 0), r(3, 0, 3, 0), r(1, 0, 0, 0)];
      const game = scoreGame(straight({ bust: 'previous' }), rounds);
      expect(game.rounds[1].scores).toEqual([21, 21]);
      expect(game.rounds[2].busted).toEqual([false, false]);
      expect(game.scores).toEqual([24, 21]);
      expect(game.winner).toBe(0);
    });

    it('applies to the target the game is played to', () => {
      const game = scoreGame(settings({ bust: 'previous', target: 11 }), [r(3, 0, 0, 0), r(1, 0, 0, 0)]);
      expect(game.scores).toEqual([9, 0]);
      expect(game.rounds[1].busted).toEqual([true, false]);
    });
  });

  describe('replay', () => {
    const rounds = [r(2, 1, 1, 1), r(0, 2, 3, 0), r(4, 0, 0, 0), r(1, 1, 1, 1)];

    it('gives the same state for the same rounds every time', () => {
      expect(scoreGame(settings({ bust: 13 }), rounds)).toEqual(scoreGame(settings({ bust: 13 }), rounds));
    });

    it('undoes a round by replaying without it', () => {
      const full = scoreGame(settings(), rounds);
      const undone = scoreGame(settings(), rounds.slice(0, -1));
      expect(undone.rounds).toEqual(full.rounds.slice(0, -1));
      expect(undone.scores).toEqual(full.rounds[full.rounds.length - 2].scores);
    });

    it('does not keep references to the rounds it was given', () => {
      const input = [r(1, 0, 0, 0)];
      const game = scoreGame(settings(), input);
      input[0][0].in = 4;
      expect(game.rounds[0].throws[0].in).toBe(1);
    });

    it('starts at nil with nobody winning', () => {
      expect(scoreGame(settings(), [])).toEqual({ scores: [0, 0], rounds: [], winner: null, extraRounds: false });
    });
  });
});
