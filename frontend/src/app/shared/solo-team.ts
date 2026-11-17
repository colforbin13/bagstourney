// src/app/shared/solo-team.ts
//
// Odd player handling (FEATURE_TRACKER item 19). A blind draw with an odd number of players
// gives the odd one out a ghost partner: a team of one, stored with no second player and
// named "Sam (solo)" (api/lib/SoloTeam.php). The tournament's ghost rule says how that team
// plays; the app only records final scores, so the rule is something players are told, on
// the bracket, the TV and the score cards. Walking is free; the others are Pro.

import { BracketData, Tournament } from './models/tournament.models';

export type GhostRule = 'walk' | 'four_bags' | 'sub' | 'custom';

/** Same limit as SoloTeam::MAX_TEXT. */
export const GHOST_RULE_MAX_TEXT = 120;

export const GHOST_RULES: { value: GhostRule; label: string; pro: boolean }[] = [
  { value: 'walk', label: 'Walks: throws both turns, walking between ends', pro: false },
  { value: 'four_bags', label: 'Throws only their own four bags each inning', pro: true },
  { value: 'sub', label: 'You pick a player to throw the other turn each game', pro: true },
  { value: 'custom', label: 'Your own house rule', pro: true },
];

/**
 * The sentence players read, e.g. "Sam plays solo, throwing both turns and walking between
 * ends." A draw makes at most one solo team; the list form just keeps this right regardless.
 */
export function soloRuleSentence(players: string[], rule: GhostRule | undefined, text?: string | null): string {
  if (!players.length) return '';
  const who = players.length === 1 ? players[0] : players.slice(0, -1).join(', ') + ' and ' + players[players.length - 1];
  const they = players.length === 1 ? 'plays' : 'play';
  switch (rule) {
    case 'four_bags':
      return `${who} ${they} solo, throwing only ${players.length === 1 ? 'their' : 'each'} own four bags each inning.`;
    case 'sub':
      return `${who} ${they} solo. Each game the organizer picks a player to throw the other turn.`;
    case 'custom':
      if (text?.trim()) return `${who} ${they} solo: ${text.trim()}`;
      return `${who} ${they} solo.`;
    default:
      return `${who} ${they} solo, throwing both turns and walking between ends.`;
  }
}

/** The tournament's rule sentence for these players. */
export function soloRuleFor(tournament: Tournament | null, players: string[]): string {
  return soloRuleSentence(players, tournament?.ghost_rule, tournament?.ghost_rule_text);
}

/**
 * Solo teams in a bracket response, team id → the one player's name. Read from the bracket's
 * matches and the pool standings, since a pool game carries no player names of its own.
 */
export function soloTeams(data: BracketData | null): Map<number, string> {
  const out = new Map<number, string>();
  if (!data) return out;
  for (const row of data.pool?.standings ?? []) {
    if (row.participant1_name && !row.participant2_name) out.set(row.team_id, row.participant1_name);
  }
  for (const side of data.sides ?? []) {
    for (const round of side.rounds) {
      for (const m of round.matches) {
        if (m.team1_id && m.team1_participant1_name && !m.team1_participant2_name) out.set(m.team1_id, m.team1_participant1_name);
        if (m.team2_id && m.team2_participant1_name && !m.team2_participant2_name) out.set(m.team2_id, m.team2_participant1_name);
      }
    }
  }
  return out;
}
