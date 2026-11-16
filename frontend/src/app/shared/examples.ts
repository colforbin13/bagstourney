// src/app/shared/examples.ts
//
// Example tournaments: made-up events seeded to show what different formats look like.
// They are public so anyone can open one, but they are not real activity, so the home page
// lists them apart from real tournaments and the bracket page says what they are.
//
// There is no column for this (decided 2026-11-16: no schema change). The rule is
// ownership: every tournament created by the account that holds the examples counts as
// one. Anything else that account makes public becomes an example too, so keep it for
// examples only.
import { Tournament } from './models/tournament.models';

/** `users.id` of the account that owns the seeded example tournaments. */
export const EXAMPLE_OWNER_USER_ID = 5;

export function isExampleTournament(t: Pick<Tournament, 'created_by_user_id'> | null | undefined): boolean {
  return !!t && Number(t.created_by_user_id) === EXAMPLE_OWNER_USER_ID;
}
