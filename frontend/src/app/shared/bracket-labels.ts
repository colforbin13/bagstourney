// src/app/shared/bracket-labels.ts
//
// Display rules shared by the bracket view and the score-entry screen, so the two can
// never disagree about how a match is presented.

/**
 * Human name for a round, counted back from the final: the last round is the Final, the
 * one before it the Semifinal, and so on. `pos` is the round's 1-based position in the
 * bracket, not its stored `round` column, and `total` is how many rounds it has.
 */
export function roundLabel(pos: number, total: number): string {
  const fromEnd = total - pos;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Quarterfinal';
  return `Round ${pos}`;
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
