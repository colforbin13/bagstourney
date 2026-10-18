// src/app/shared/blind-draw.ts
//
// The free blind draw generator's logic (/blind-draw-generator). Runs entirely in the
// browser: nothing is saved and no account is involved. Pure functions, so the pairing and
// the bracket shape are tested without a component.
//
// Mirrors what a real tournament does, so the preview is what an organizer would get:
// players are shuffled and paired in order (TeamController::draw()), the pair order is the
// seed order, and the bracket is seeded and padded with byes the way
// api/lib/BracketBuilder.php::singleElimination() does it.

/** The app's own rule: teams are pairs, and a bracket needs at least two of them. */
export const MIN_PLAYERS = 4;
/** 32 teams: enough for a bar night or a fundraiser, and a preview that still reads on a phone. */
export const MAX_PLAYERS = 64;

export interface DrawnTeam {
  seed: number;
  players: [string, string];
}

/** A bracket slot: a team, a bye, or a winner not yet known. */
export type Slot = { kind: 'team'; team: DrawnTeam } | { kind: 'bye' } | { kind: 'tbd' };

export interface PreviewMatch {
  number: number;
  top: Slot;
  bottom: Slot;
}

export interface PreviewRound {
  label: string;
  matches: PreviewMatch[];
}

/**
 * Shuffles a copy of the list (Fisher-Yates). `random` returns a float in [0, 1); the
 * default draws from the browser's cryptographic generator so the draw can't be predicted,
 * which matters to players who suspect the organizer of fixing teams.
 */
export function shuffle<T>(items: readonly T[], random: () => number = cryptoRandom): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pairs players in order into teams seeded 1, 2, 3, ... An odd player out is not paired. */
export function pairTeams(players: readonly string[]): DrawnTeam[] {
  const teams: DrawnTeam[] = [];
  for (let i = 0; i + 1 < players.length; i += 2) {
    teams.push({ seed: teams.length + 1, players: [players[i], players[i + 1]] });
  }
  return teams;
}

/**
 * The balanced, or A/B, draw: every A player is paired with a random B, so the weakest
 * players can't end up together. Mirrors api/lib/BlindDraw.php: with uneven groups, the
 * extra players are paired within their own group rather than refused, and the team order
 * (the seed order) is shuffled last so a leftover team isn't always the bottom seed.
 */
export function pairBalanced(a: readonly string[], b: readonly string[], random: () => number = cryptoRandom): DrawnTeam[] {
  const as = shuffle(a, random);
  const bs = shuffle(b, random);
  const mixed = Math.min(as.length, bs.length);
  const pairs: [string, string][] = [];
  for (let i = 0; i < mixed; i++) pairs.push([as[i], bs[i]]);
  const leftover = as.length > mixed ? as.slice(mixed) : bs.slice(mixed);
  for (let i = 0; i + 1 < leftover.length; i += 2) pairs.push([leftover[i], leftover[i + 1]]);
  return shuffle(pairs, random).map((players, i) => ({ seed: i + 1, players }));
}

export function teamName(team: DrawnTeam): string {
  return `${team.players[0]} & ${team.players[1]}`;
}

/**
 * The single-elimination bracket for these teams, seeded 1 v N with the field rounded up to
 * a power of two. Top seeds get the byes, and a team with a bye is already shown in round 2,
 * as the live bracket does once it auto-advances them.
 */
export function previewBracket(teams: readonly DrawnTeam[]): PreviewRound[] {
  if (teams.length < 2) return [];
  const size = bracketSizeFor(teams.length);
  const bySeed = new Map(teams.map(t => [t.seed, t]));
  const slotFor = (seed: number): Slot => {
    const team = bySeed.get(seed);
    return team ? { kind: 'team', team } : { kind: 'bye' };
  };

  const order = seedOrder(size);
  const rounds: PreviewMatch[][] = [];
  let matchNumber = 1;
  const first: PreviewMatch[] = [];
  for (let i = 0; i < order.length; i += 2) {
    first.push({ number: matchNumber++, top: slotFor(order[i]), bottom: slotFor(order[i + 1]) });
  }
  rounds.push(first);

  for (let previous = first; previous.length > 1; previous = rounds[rounds.length - 1]) {
    const next: PreviewMatch[] = [];
    for (let i = 0; i < previous.length; i += 2) {
      next.push({ number: matchNumber++, top: advance(previous[i]), bottom: advance(previous[i + 1]) });
    }
    rounds.push(next);
  }

  return rounds.map((matches, i) => ({ label: roundName(i, rounds.length), matches }));
}

/** A match whose only entrant has a bye sends that team on; anything else is still to play. */
function advance(match: PreviewMatch): Slot {
  if (match.top.kind === 'team' && match.bottom.kind === 'bye') return match.top;
  if (match.bottom.kind === 'team' && match.top.kind === 'bye') return match.bottom;
  return { kind: 'tbd' };
}

/** True when a first-round match is a bye rather than a game to play. */
export function isBye(match: PreviewMatch): boolean {
  return match.top.kind === 'bye' || match.bottom.kind === 'bye';
}

function roundName(index: number, total: number): string {
  const fromEnd = total - index;
  if (fromEnd === 1) return 'Final';
  if (fromEnd === 2) return 'Semifinals';
  if (fromEnd === 3) return 'Quarterfinals';
  return `Round ${index + 1}`;
}

/** Smallest power of two that holds every team. Same as BracketBuilder::bracketSizeFor(). */
export function bracketSizeFor(teams: number): number {
  let size = 2;
  while (size < teams) size *= 2;
  return size;
}

/** Bracket position order for 1 v N seeding. Same recursion as BracketBuilder::seedOrder(). */
export function seedOrder(size: number): number[] {
  if (size <= 1) return [1];
  return seedOrder(size / 2).flatMap(seed => [seed, size + 1 - seed]);
}

function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}
