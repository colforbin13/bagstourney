// src/app/shared/bracket-labels.ts
//
// Display rules shared by the bracket view, the score-entry screen and the manage screen,
// so they can never disagree about how a bracket is presented.

import { BracketData } from './models/tournament.models';

export type BracketSideName = 'winners' | 'losers' | 'grand_final';

/**
 * Human name for a round, counted back from the end of its own bracket side: the last
 * round is the Final, the one before it the Semifinal, and so on.
 *
 * `pos` is the round's 1-based position *within its side*, not its stored `round` column.
 * That distinction matters in double elimination, where a losers bracket whose first round
 * collapsed away (which happens whenever there are byes) starts at round 2 — labelling by
 * position hides a gap that would otherwise read as a missing round.
 *
 * `total` is how many rounds that side has.
 */
export function roundLabel(
  pos: number,
  total: number,
  side: BracketSideName = 'winners',
  format: 'single' | 'double' = 'single',
): string {
  if (side === 'grand_final') {
    // Position 2 exists only when the losers-bracket side won the grand final, levelling
    // both teams at one loss. "Deciding Match" says what it is without the esports jargon
    // ("bracket reset") that most people running a backyard tournament won't know.
    return pos === 1 ? 'Grand Final' : 'Deciding Match';
  }

  const fromEnd = total - pos;

  if (format === 'single') {
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinal';
    if (fromEnd === 2) return 'Quarterfinal';
    return `Round ${pos}`;
  }

  // In double elimination neither side's last round is *the* final — the grand final is —
  // so they are qualified rather than named outright.
  const prefix = side === 'losers' ? 'Losers' : 'Winners';
  if (fromEnd === 0) return `${prefix} Final`;
  if (fromEnd === 1) return `${prefix} Semifinal`;
  return `${prefix} Round ${pos}`;
}

/**
 * The tournament's champion, or null while it is still being decided.
 *
 * Mirrors MatchController::championOf() — keep the two in step. In single elimination this
 * is simply whoever won the last round. In double elimination "the last match" stops being
 * a reliable signal: the grand final points at a deciding match that is usually never
 * played, and a grand final won by the losers-bracket side levels both teams at one loss
 * rather than crowning anyone.
 */
export function championName(data: BracketData | null): string | null {
  if (!data) return null;

  const grandFinal = (data.sides ?? []).find(s => s.side === 'grand_final');
  if (grandFinal) {
    const decider = grandFinal.rounds[1]?.matches[0];
    if (decider?.winner_name) return decider.winner_name;

    const final = grandFinal.rounds[0]?.matches[0];
    const winnersSideWon = !!final?.winner_id && final.winner_id === final.team1_id;
    return winnersSideWon ? final!.winner_name ?? null : null;
  }

  const winners = (data.sides ?? []).find(s => s.side === 'winners');
  const lastRound = winners?.rounds[winners.rounds.length - 1];
  return lastRound?.matches[0]?.winner_name ?? null;
}

/**
 * Participant names to show beneath a team name, or null when they'd just repeat it.
 * Only useful once a team has been renamed away from the auto-generated "P1 & P2" —
 * the same default-name comparison the backend uses in ParticipantController::update()
 * to decide whether a team name is still auto-generated.
 */
export function teamParticipants(teamName: string | null, p1: string | null, p2: string | null): string | null {
  if (!teamName || !p1 || !p2) return null;
  if (teamName === `${p1} & ${p2}`) return null;
  return `${p1} · ${p2}`;
}
