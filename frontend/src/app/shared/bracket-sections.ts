// src/app/shared/bracket-sections.ts
//
// The parts a long bracket page splits into (FEATURE_TRACKER item 25): pool play, then the
// winners bracket, losers bracket and finals for double elimination, or just "Bracket" for
// single elimination. The bracket page shows one at a time behind a row of buttons; TV mode
// cycles through the ones still being played. Pure, so the "which part is live" rules can be
// tested without rendering anything.

import { BracketData, Match } from './models/tournament.models';
import { championName } from './bracket-labels';

export type SectionKey = 'pool' | 'bracket' | 'winners' | 'losers' | 'finals';

export interface BracketSection {
  key: SectionKey;
  /** Short, for the buttons. */
  label: string;
  /** Long, for the TV's title bar. */
  heading: string;
  /** No game left to play here. */
  done: boolean;
  /** No team has reached this section yet: every slot in it is still TBD. */
  waiting: boolean;
}

const settled = (m: Match) => m.status === 'complete' || m.status === 'bye';
const placed = (m: Match) => m.team1_id != null || m.team2_id != null;

/**
 * Every section this bracket has, in play order. Single elimination without pool play has
 * exactly one, so callers show it the way they always have, with no buttons.
 */
export function bracketSections(data: BracketData | null): BracketSection[] {
  if (!data) return [];
  const out: BracketSection[] = [];

  const pool = data.pool;
  if (pool?.started) {
    out.push({ key: 'pool', label: 'Pool play', heading: 'Pool play', done: pool.complete || pool.locked, waiting: false });
  }

  const champion = championName(data) !== null;
  for (const side of data.sides ?? []) {
    const matches = side.rounds.flatMap(r => r.matches);
    if (!matches.length) continue;
    const waiting = !matches.some(placed);
    // The grand final's deciding match is never played when the winners side wins the
    // first game, so "every match settled" would never come true there. The champion rule
    // is the one that knows when it is over.
    if (side.side === 'grand_final') {
      out.push({ key: 'finals', label: 'Finals', heading: 'Grand final', done: champion, waiting });
    } else if (side.side === 'losers') {
      out.push({ key: 'losers', label: 'Losers', heading: 'Losers bracket', done: matches.every(settled), waiting });
    } else if (data.format === 'double') {
      out.push({ key: 'winners', label: 'Winners', heading: 'Winners bracket', done: matches.every(settled), waiting });
    } else {
      out.push({ key: 'bracket', label: 'Bracket', heading: 'Bracket', done: champion, waiting });
    }
  }
  return out;
}

/**
 * The section being played right now: the first one with a game left. Once everything is
 * over, the last one, which is where the champion is.
 */
export function liveSection(sections: BracketSection[]): SectionKey | null {
  if (!sections.length) return null;
  return (sections.find(s => !s.done) ?? sections[sections.length - 1]).key;
}

/**
 * What a TV cycles through: every section being played right now. Finished ones are skipped
 * so the room isn't kept on a result it already knows, and so are ones no team has reached
 * yet: a losers bracket or final that is nothing but TBD has nothing to read. With nothing
 * left to play, the last section alone, so the screen settles on the champion.
 */
export function rotationSections(sections: BracketSection[]): BracketSection[] {
  const live = sections.filter(s => !s.done && !s.waiting);
  if (live.length) return live;
  // Only reachable with a bracket that has no teams in it at all; show it rather than nothing.
  const open = sections.filter(s => !s.done);
  if (open.length) return open;
  return sections.length ? [sections[sections.length - 1]] : [];
}

/** The `?view=` value, if it names a section this bracket has; otherwise null. */
export function requestedSection(sections: BracketSection[], view: string | null): SectionKey | null {
  return sections.find(s => s.key === view)?.key ?? null;
}
