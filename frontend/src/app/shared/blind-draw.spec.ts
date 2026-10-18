// src/app/shared/blind-draw.spec.ts
import { DrawnTeam, bracketSizeFor, isBye, pairBalanced, pairTeams, previewBracket, seedOrder, shuffle, teamName } from './blind-draw';

const players = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const label = (slot: { kind: string; team?: DrawnTeam }) =>
  slot.kind === 'team' ? `#${slot.team!.seed}` : slot.kind;

describe('blind draw generator', () => {
  describe('shuffle', () => {
    it('keeps every player exactly once and leaves the input alone', () => {
      const input = players(10);
      const out = shuffle(input);
      expect([...out].sort()).toEqual([...input].sort());
      expect(input).toEqual(players(10));
    });

    it('uses the random source it is given', () => {
      // Always picking index 0 rotates the list in a known way.
      expect(shuffle(['a', 'b', 'c', 'd'], () => 0)).toEqual(['b', 'c', 'd', 'a']);
    });
  });

  describe('pairTeams', () => {
    it('pairs players in order and seeds the pairs 1, 2, 3', () => {
      const teams = pairTeams(['Ann', 'Bob', 'Cara', 'Dev']);
      expect(teams).toEqual([
        { seed: 1, players: ['Ann', 'Bob'] },
        { seed: 2, players: ['Cara', 'Dev'] },
      ]);
      expect(teamName(teams[0])).toBe('Ann & Bob');
    });

    it('leaves an odd player out', () => {
      expect(pairTeams(players(5)).length).toBe(2);
    });
  });

  describe('pairBalanced', () => {
    const as = (n: number) => Array.from({ length: n }, (_, i) => `A${i + 1}`);
    const bs = (n: number) => Array.from({ length: n }, (_, i) => `B${i + 1}`);
    const kind = (t: DrawnTeam) => t.players.map(p => p[0]).join('');

    it('pairs every A with a B and seeds the teams 1, 2, 3', () => {
      for (let run = 0; run < 100; run++) {
        const teams = pairBalanced(as(6), bs(6));
        expect(teams.map(kind)).toEqual(Array(6).fill('AB'));
        expect(teams.map(t => t.seed)).toEqual([1, 2, 3, 4, 5, 6]);
        expect(teams.flatMap(t => t.players).sort()).toEqual([...as(6), ...bs(6)].sort());
      }
    });

    it('pairs the extra players of an uneven split with each other', () => {
      // The Reddit case: 14 strong players and 12 others.
      const teams = pairBalanced(as(14), bs(12));
      expect(teams.length).toBe(13);
      expect(teams.filter(t => kind(t) === 'AB').length).toBe(12);
      expect(teams.filter(t => kind(t) === 'AA').length).toBe(1);
      expect(pairBalanced(as(3), bs(7)).filter(t => kind(t) === 'BB').length).toBe(2);
    });

    it('does not always seed the leftover team last', () => {
      const seeds = new Set<number>();
      for (let run = 0; run < 100; run++) {
        pairBalanced(as(2), bs(6)).filter(t => kind(t) === 'BB').forEach(t => seeds.add(t.seed));
      }
      expect(seeds.size).toBeGreaterThan(1);
    });
  });

  describe('previewBracket', () => {
    it('matches BracketBuilder on seed order and bracket size', () => {
      expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
      expect([2, 3, 4, 5, 8, 9, 17].map(bracketSizeFor)).toEqual([2, 4, 4, 8, 8, 16, 32]);
    });

    it('seeds four teams 1 v 4 and 2 v 3 with a final to follow', () => {
      const rounds = previewBracket(pairTeams(players(8)));
      expect(rounds.map(r => r.label)).toEqual(['Semifinals', 'Final']);
      expect(rounds[0].matches.map(m => [label(m.top), label(m.bottom)])).toEqual([['#1', '#4'], ['#2', '#3']]);
      expect(rounds[1].matches.map(m => [label(m.top), label(m.bottom)])).toEqual([['tbd', 'tbd']]);
    });

    it('gives the top seeds the byes and moves them straight to round 2', () => {
      // 6 teams in an 8-team bracket: seeds 1 and 2 sit out round 1.
      const rounds = previewBracket(pairTeams(players(12)));
      expect(rounds.map(r => r.label)).toEqual(['Quarterfinals', 'Semifinals', 'Final']);
      const first = rounds[0].matches;
      expect(first.filter(isBye).length).toBe(2);
      expect(first.map(m => [label(m.top), label(m.bottom)])).toEqual([
        ['#1', 'bye'], ['#4', '#5'], ['#2', 'bye'], ['#3', '#6'],
      ]);
      expect(rounds[1].matches.map(m => [label(m.top), label(m.bottom)])).toEqual([['#1', 'tbd'], ['#2', 'tbd']]);
    });

    it('numbers every match once, round by round, and ends in one final', () => {
      const rounds = previewBracket(pairTeams(players(64)));
      expect(rounds.length).toBe(5);
      expect(rounds[0].label).toBe('Round 1');
      const numbers = rounds.flatMap(r => r.matches.map(m => m.number));
      expect(numbers).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
      expect(rounds[4].matches.length).toBe(1);
    });

    it('has nothing to show for fewer than two teams', () => {
      expect(previewBracket(pairTeams(players(2)))).toEqual([]);
    });
  });
});
