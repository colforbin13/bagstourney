// src/app/shared/bags-score.ts
//
// The free bags scorekeeper's logic (/cornhole-score-keeper). Runs entirely in the browser:
// nothing is saved to the server and no account is involved. Pure, so every rule is tested
// without a component.
//
// A game is its settings plus the rounds thrown so far, and the score is always replayed
// from those. That keeps undo (drop the last round) and a refresh mid-game (store settings +
// rounds, replay on load) from ever drifting out of step with the history.
//
// Rules, as settled in .scratch/bags-scorekeeper/spec.md:
// - In the hole is 3, on the board is 1, four bags a side a round.
// - Cancellation scoring (the default): only the difference counts, to the side ahead.
//   Straight scoring: both sides keep everything.
// - Without a bust rule, reaching or passing the target wins. With one, a side must land on
//   the target exactly, and going over sets it back to 13, 15, or its score before the round.
// - Under straight scoring both sides can finish in the same round: the higher total wins.
//   On a tie the game goes to extra rounds with no bust rule, until a round leaves the
//   totals unequal. (Without that, two sides tied on the target under "previous score"
//   could never separate.) Cancellation scoring can't produce this: only one side scores.

export const IN_POINTS = 3;
export const ON_POINTS = 1;
export const BAGS_PER_ROUND = 4;
export const DEFAULT_TARGET = 21;
export const MAX_TARGET = 99;

export type ScoringMode = 'cancellation' | 'straight';
/** Where a side that goes over the target lands; 'off' means going over just wins. */
export type BustRule = 'off' | 13 | 15 | 'previous';

export interface BagsSettings {
  mode: ScoringMode;
  target: number;
  bust: BustRule;
}

export const DEFAULT_SETTINGS: BagsSettings = { mode: 'cancellation', target: DEFAULT_TARGET, bust: 'off' };

/** One side's bags for a round. */
export interface SideThrow {
  in: number;
  on: number;
}

/** Index 0 is the first team, index 1 the second. */
export type Side = 0 | 1;
export type Pair<T> = [T, T];
export type BagsRound = Pair<SideThrow>;

export interface RoundResult {
  /** 1-based. */
  round: number;
  throws: BagsRound;
  /** What each side's bags were worth this round. */
  raw: Pair<number>;
  /** What each side was awarded after cancellation, before any bust. */
  awarded: Pair<number>;
  /** True where the side went over the target and was set back. */
  busted: Pair<boolean>;
  /** The running score after this round. */
  scores: Pair<number>;
}

export interface GameState {
  scores: Pair<number>;
  rounds: RoundResult[];
  winner: Side | null;
  /** Both sides finished level under straight scoring; play on until a round separates them. */
  extraRounds: boolean;
}

export function throwPoints(t: SideThrow): number {
  return t.in * IN_POINTS + t.on * ON_POINTS;
}

const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

export function isValidThrow(t: unknown): t is SideThrow {
  if (typeof t !== 'object' || t === null) return false;
  const { in: bagsIn, on } = t as SideThrow;
  return isCount(bagsIn) && isCount(on) && bagsIn + on <= BAGS_PER_ROUND;
}

export function isValidRound(r: unknown): r is BagsRound {
  return Array.isArray(r) && r.length === 2 && isValidThrow(r[0]) && isValidThrow(r[1]);
}

export function isValidSettings(s: unknown): s is BagsSettings {
  if (typeof s !== 'object' || s === null) return false;
  const { mode, target, bust } = s as BagsSettings;
  if (mode !== 'cancellation' && mode !== 'straight') return false;
  if (!Number.isInteger(target) || target < 1 || target > MAX_TARGET) return false;
  if (bust === 'off' || bust === 'previous') return true;
  // Being set back to 13 or 15 only makes sense below the target.
  return (bust === 13 || bust === 15) && target > bust;
}

/**
 * Replays a game. Throws a RangeError on invalid settings, an invalid round, or a round
 * after the game was already won, so a caller restoring a stored game can fall back to a
 * fresh one.
 */
export function scoreGame(settings: BagsSettings, rounds: readonly BagsRound[]): GameState {
  if (!isValidSettings(settings)) throw new RangeError('Invalid bags settings');
  const { mode, target, bust } = settings;

  let scores: Pair<number> = [0, 0];
  let winner: Side | null = null;
  let extraRounds = false;
  const results: RoundResult[] = [];

  rounds.forEach((throws, i) => {
    if (winner !== null) throw new RangeError(`Round ${i + 1} comes after the game was won`);
    if (!isValidRound(throws)) throw new RangeError(`Round ${i + 1} is not a valid round`);

    const raw: Pair<number> = [throwPoints(throws[0]), throwPoints(throws[1])];
    const awarded: Pair<number> =
      mode === 'cancellation' ? [Math.max(raw[0] - raw[1], 0), Math.max(raw[1] - raw[0], 0)] : [...raw];

    const bustApplies = bust !== 'off' && !extraRounds;
    const busted: Pair<boolean> = [false, false];
    const next = scores.map((score, s) => {
      const total = score + awarded[s];
      if (!bustApplies || total <= target) return total;
      busted[s] = true;
      return bust === 'previous' ? score : (bust as number);
    }) as Pair<number>;

    const finished = (s: Side) => (extraRounds ? true : bustApplies ? next[s] === target : next[s] >= target);
    const [f0, f1] = [finished(0), finished(1)];
    if (f0 && f1) {
      if (next[0] === next[1]) extraRounds = true;
      else {
        winner = next[0] > next[1] ? 0 : 1;
        extraRounds = false;
      }
    } else if (f0) winner = 0;
    else if (f1) winner = 1;

    scores = next;
    results.push({ round: i + 1, throws: [{ ...throws[0] }, { ...throws[1] }], raw, awarded, busted, scores: [...next] });
  });

  return { scores, rounds: results, winner, extraRounds };
}
