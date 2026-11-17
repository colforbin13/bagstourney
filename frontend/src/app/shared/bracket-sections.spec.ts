// src/app/shared/bracket-sections.spec.ts
import { BracketData, Match, PoolData } from './models/tournament.models';
import { bracketSections, liveSection, rotationSections, requestedSection } from './bracket-sections';
import { singleEliminationBracket, doubleEliminationBracket } from './testing/bracket-fixtures';

describe('bracket sections', () => {
  let nextId = 1;
  const match = (status: Match['status'], extra: Partial<Match> = {}): Match => ({
    id: nextId++, tournament_id: 1, round: 1, match_number: 1,
    team1_id: 1, team2_id: 2, team1_score: null, team2_score: null, winner_id: null,
    next_match_id: null, next_match_slot: null, status,
    team1_name: 'A', team2_name: 'B', winner_name: null,
    team1_participant1_name: null, team1_participant2_name: null,
    team2_participant1_name: null, team2_participant2_name: null,
    ...extra,
  } as Match);

  const won = (by: 1 | 2) => match('complete', { winner_id: by, winner_name: by === 1 ? 'A' : 'B' });

  const pool = (over: Partial<PoolData> = {}): PoolData => ({
    games_per_team: 2, started: true, games_played: 0, games_total: 2, complete: false, locked: false,
    rounds: [], standings: [], ...over,
  });

  function double(state: { winners: Match[]; losers: Match[]; final: Match[] }): BracketData {
    return doubleEliminationBracket({
      winners: { 1: state.winners },
      losers: { 1: state.losers },
      grandFinal: { 1: [state.final[0]], 2: [state.final[1]] },
    });
  }

  describe('bracketSections()', () => {
    it('gives single elimination without pool play one section, so no buttons appear', () => {
      const data = singleEliminationBracket({ 1: [match('ready')] });
      expect(bracketSections(data).map(s => s.key)).toEqual(['bracket']);
    });

    it('puts pool play in front of the bracket', () => {
      const data = { ...singleEliminationBracket({ 1: [match('ready')] }), pool: pool({ complete: true, locked: true }) };
      expect(bracketSections(data).map(s => s.key)).toEqual(['pool', 'bracket']);
    });

    it('leaves out a pool that has not been scheduled yet', () => {
      const data = { ...singleEliminationBracket({ 1: [match('ready')] }), pool: pool({ started: false }) };
      expect(bracketSections(data).map(s => s.key)).toEqual(['bracket']);
    });

    it('has only the pool while the bracket does not exist yet', () => {
      const data: BracketData = { format: 'single', sides: [], pool: pool() };
      expect(bracketSections(data).map(s => s.key)).toEqual(['pool']);
    });

    it('splits double elimination into winners, losers and finals', () => {
      const data = double({ winners: [match('ready')], losers: [match('pending')], final: [match('pending'), match('pending')] });
      expect(bracketSections(data).map(s => s.label)).toEqual(['Winners', 'Losers', 'Finals']);
    });

    it('counts a bye as settled', () => {
      const data = double({ winners: [won(1), match('bye')], losers: [match('pending')], final: [match('pending'), match('pending')] });
      expect(bracketSections(data).find(s => s.key === 'winners')!.done).toBe(true);
    });

    it('calls the finals done when the winners side takes the first game, with the reset never played', () => {
      const final = match('complete', { team1_id: 1, team2_id: 2, winner_id: 1, winner_name: 'A' });
      const data = double({ winners: [won(1)], losers: [won(2)], final: [final, match('pending')] });
      expect(bracketSections(data).find(s => s.key === 'finals')!.done).toBe(true);
    });

    it('keeps the finals open when the losers side forces the deciding match', () => {
      const final = match('complete', { team1_id: 1, team2_id: 2, winner_id: 2, winner_name: 'B' });
      const data = double({ winners: [won(1)], losers: [won(2)], final: [final, match('ready')] });
      expect(bracketSections(data).find(s => s.key === 'finals')!.done).toBe(false);
    });
  });

  describe('liveSection()', () => {
    it('picks the first section with a game left', () => {
      const data = double({ winners: [won(1)], losers: [match('ready')], final: [match('pending'), match('pending')] });
      expect(liveSection(bracketSections(data))).toBe('losers');
    });

    it('moves past a finished pool to the bracket', () => {
      const data = { ...singleEliminationBracket({ 1: [match('ready')] }), pool: pool({ complete: true, locked: true }) };
      expect(liveSection(bracketSections(data))).toBe('bracket');
    });

    it('settles on the last section once everything is over', () => {
      const data = { ...singleEliminationBracket({ 1: [won(1)] }), pool: pool({ complete: true, locked: true }) };
      expect(liveSection(bracketSections(data))).toBe('bracket');
    });

    it('is null with nothing to show', () => {
      expect(liveSection([])).toBeNull();
    });
  });

  describe('rotationSections()', () => {
    it('skips finished sections', () => {
      const data = {
        ...double({ winners: [won(1)], losers: [match('ready')], final: [match('pending'), match('pending')] }),
        pool: pool({ complete: true, locked: true }),
      };
      expect(rotationSections(bracketSections(data)).map(s => s.key)).toEqual(['losers', 'finals']);
    });

    it('leaves out sections no team has reached yet', () => {
      const tbd = () => match('pending', { team1_id: null, team2_id: null, team1_name: null, team2_name: null });
      const data = double({ winners: [match('ready')], losers: [tbd()], final: [tbd(), tbd()] });
      expect(rotationSections(bracketSections(data)).map(s => s.key)).toEqual(['winners']);
    });

    it('brings a section in as soon as one team has arrived in it', () => {
      const tbd = () => match('pending', { team1_id: null, team2_id: null, team1_name: null, team2_name: null });
      const oneIn = match('pending', { team2_id: null, team2_name: null });
      const data = double({ winners: [match('ready')], losers: [oneIn], final: [tbd(), tbd()] });
      expect(rotationSections(bracketSections(data)).map(s => s.key)).toEqual(['winners', 'losers']);
    });

    it('rotates through both trees while both are being played', () => {
      const data = double({ winners: [match('ready')], losers: [match('ready')], final: [match('pending'), match('pending')] });
      expect(rotationSections(bracketSections(data)).map(s => s.key)).toEqual(['winners', 'losers', 'finals']);
    });

    it('holds on the last section once the tournament is decided', () => {
      const final = match('complete', { team1_id: 1, team2_id: 2, winner_id: 1, winner_name: 'A' });
      const data = double({ winners: [won(1)], losers: [won(2)], final: [final, match('pending')] });
      expect(rotationSections(bracketSections(data)).map(s => s.key)).toEqual(['finals']);
    });
  });

  describe('requestedSection()', () => {
    const sections = bracketSections(double({ winners: [match('ready')], losers: [match('ready')], final: [match('pending'), match('pending')] }));

    it('honours a view this bracket has', () => {
      expect(requestedSection(sections, 'losers')).toBe('losers');
    });

    it('ignores one it does not, or none at all', () => {
      expect(requestedSection(sections, 'pool')).toBeNull();
      expect(requestedSection(sections, 'nonsense')).toBeNull();
      expect(requestedSection(sections, null)).toBeNull();
    });
  });
});
