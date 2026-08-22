// src/app/shared/testing/bracket-fixtures.ts
//
// Builders for BracketData fixtures, shared by the bracket-view, score-entry and service
// specs. The API groups matches by bracket side and then by round; expressing that inline
// in every spec buried what each test was actually about.

import { BracketData, BracketSide, Match } from '../models/tournament.models';

/** A single-elimination bracket from a plain `{ round: matches }` map. */
export function singleEliminationBracket(rounds: { [round: number]: Match[] }): BracketData {
  const ordered = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  return {
    format: 'single',
    sides: [{ side: 'winners', rounds: ordered.map(r => ({ round: r, matches: rounds[r] })) }],
    // The legacy key the API still sends for single elimination, so specs exercise the same
    // payload shape a real response has.
    rounds,
  };
}

/**
 * A double-elimination bracket. Each side is given as a `{ round: matches }` map; sides are
 * emitted in play order and empty ones are dropped, matching MatchController::bracket().
 */
export function doubleEliminationBracket(input: {
  winners: { [round: number]: Match[] };
  losers?: { [round: number]: Match[] };
  grandFinal?: { [round: number]: Match[] };
}): BracketData {
  const toSide = (side: BracketSide['side'], rounds?: { [round: number]: Match[] }): BracketSide | null => {
    if (!rounds || !Object.keys(rounds).length) return null;
    const ordered = Object.keys(rounds).map(Number).sort((a, b) => a - b);
    return { side, rounds: ordered.map(r => ({ round: r, matches: rounds[r] })) };
  };

  const sides = [
    toSide('winners', input.winners),
    toSide('losers', input.losers),
    toSide('grand_final', input.grandFinal),
  ].filter((s): s is BracketSide => s !== null);

  // No `rounds` key: there is no correct single-tree shape for a two-tree bracket, so the
  // API omits it rather than shipping one that is wrong.
  return { format: 'double', sides };
}

/** An empty bracket, as returned before any teams are drawn. */
export function emptyBracket(): BracketData {
  return { format: 'single', sides: [], rounds: {} };
}
