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

type ExampleShape = Pick<Tournament, 'format' | 'seeding_mode' | 'team_entry_mode' | 'draw_mode' | 'status'>;

/**
 * What an example is there to show, in the words an organizer would use for their own event.
 * This is what the home page labels each example with: the made-up name tells a visitor
 * nothing about why they'd open it. Read off the tournament's own settings, so a new
 * example describes itself.
 */
export function exampleShows(t: ExampleShape): string {
  let shows: string;
  if (t.seeding_mode === 'pool_play') shows = 'Pool play into a bracket';
  else if (t.format === 'double') shows = 'Double elimination';
  else if (t.seeding_mode === 'manual') shows = 'Set teams, seeded by hand';
  else if (t.team_entry_mode === 'auto_draft') shows = 'Blind draw';
  else shows = 'Set teams';

  if (t.format === 'double' && t.team_entry_mode === 'auto_draft' && t.draw_mode === 'balanced') {
    shows += ', balanced draw';
  }
  if (t.status === 'active') shows += ', in progress';
  return shows;
}

/** Simplest format first, and a finished bracket before one still being played. */
export function exampleOrder(t: ExampleShape): number {
  let rank: number;
  if (t.seeding_mode === 'pool_play') rank = 2;
  else if (t.format === 'double') rank = 3;
  else if (t.seeding_mode === 'manual') rank = 1;
  else rank = 0;
  return rank * 2 + (t.status === 'active' ? 1 : 0);
}

/**
 * Public links to the seeded examples that show a paid feature, for the pages that explain
 * those features (How it works, Pricing). Those pages are prerendered with no API to ask,
 * so the links have to be written down. They are the examples' own public bracket links;
 * if an example is ever deleted or reseeded, update or drop its entry here.
 */
export const EXAMPLE_BRACKETS = {
  /** Saturday Night Bags at the Legion Hall: double elimination, in progress, four boards. */
  doubleElimination: '/bracket/9d0ebc02-519f-4be4-a36d-fbccefb3a36a',
  boards: '/bracket/9d0ebc02-519f-4be4-a36d-fbccefb3a36a',
  /** Westbrook Cornhole League Fall Finals: three pool rounds, then a seeded bracket. */
  poolPlay: '/bracket/e94edcba-7fae-46e8-8c57-c9cf386a599b',
};
