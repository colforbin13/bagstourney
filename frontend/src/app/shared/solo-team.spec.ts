// src/app/shared/solo-team.spec.ts
import { Match, PoolData } from './models/tournament.models';
import { soloRuleSentence, soloTeams } from './solo-team';
import { singleEliminationBracket } from './testing/bracket-fixtures';

describe('solo team', () => {
  describe('soloRuleSentence()', () => {
    it('defaults to walking, the free rule', () => {
      expect(soloRuleSentence(['Sam'], undefined)).toBe('Sam plays solo, throwing both turns and walking between ends.');
      expect(soloRuleSentence(['Sam'], 'walk')).toBe('Sam plays solo, throwing both turns and walking between ends.');
    });

    it('describes each Pro rule', () => {
      expect(soloRuleSentence(['Sam'], 'four_bags')).toBe('Sam plays solo, throwing only their own four bags each inning.');
      expect(soloRuleSentence(['Sam'], 'sub')).toContain('organizer picks a player');
      expect(soloRuleSentence(['Sam'], 'custom', ' Throws 6 bags ')).toBe('Sam plays solo: Throws 6 bags');
    });

    it('still says who is solo when a custom rule has no text', () => {
      expect(soloRuleSentence(['Sam'], 'custom', '')).toBe('Sam plays solo.');
    });

    it('names several players together', () => {
      expect(soloRuleSentence(['Sam', 'Lee'], 'walk')).toBe('Sam and Lee play solo, throwing both turns and walking between ends.');
    });

    it('is empty with nobody solo', () => {
      expect(soloRuleSentence([], 'walk')).toBe('');
    });
  });

  describe('soloTeams()', () => {
    const match = (team1: [number, string, string | null], team2: [number, string, string | null]): Match => ({
      id: team1[0] * 100 + team2[0], tournament_id: 1, round: 1, match_number: 1,
      team1_id: team1[0], team2_id: team2[0], team1_score: null, team2_score: null, winner_id: null,
      next_match_id: null, next_match_slot: null, status: 'ready',
      team1_name: '', team2_name: '', winner_name: null,
      team1_participant1_name: team1[1], team1_participant2_name: team1[2],
      team2_participant1_name: team2[1], team2_participant2_name: team2[2],
    } as Match);

    it('finds a team of one in the bracket', () => {
      const data = singleEliminationBracket({ 1: [match([1, 'Ann', 'Bob'], [2, 'Sam', null])] });
      expect([...soloTeams(data)]).toEqual([[2, 'Sam']]);
    });

    it('finds one in the pool standings, since pool games carry no player names', () => {
      const pool = {
        games_per_team: 2, started: true, games_played: 0, games_total: 2, complete: false, locked: false, rounds: [],
        standings: [
          { team_id: 7, team_name: 'Sam (solo)', participant1_name: 'Sam', participant2_name: null } as any,
          { team_id: 8, team_name: 'Ann & Bob', participant1_name: 'Ann', participant2_name: 'Bob' } as any,
        ],
      } as PoolData;
      expect([...soloTeams({ format: 'single', sides: [], pool })]).toEqual([[7, 'Sam']]);
    });

    it('ignores an empty slot that is only waiting for a winner', () => {
      const tbd = { ...match([1, 'Ann', 'Bob'], [2, 'Cy', 'Di']), team2_id: null, team2_participant1_name: null, team2_participant2_name: null } as Match;
      expect(soloTeams(singleEliminationBracket({ 1: [tbd] })).size).toBe(0);
    });
  });
});
