// src/app/shared/bracket-labels.spec.ts
import { roundLabel, championName, teamParticipants } from './bracket-labels';
import { Match } from './models/tournament.models';
import { doubleEliminationBracket, singleEliminationBracket, emptyBracket } from './testing/bracket-fixtures';

function match(over: Partial<Match>): Match {
  return {
    id: 1, tournament_id: 1, round: 1, match_number: 1,
    team1_id: null, team2_id: null, team1_score: null, team2_score: null, winner_id: null,
    next_match_id: null, next_match_slot: null, status: 'pending',
    team1_name: null, team2_name: null, winner_name: null,
    team1_participant1_name: null, team1_participant2_name: null,
    team2_participant1_name: null, team2_participant2_name: null,
    ...over,
  } as Match;
}

describe('roundLabel', () => {
  it('names single-elimination rounds counting back from the final', () => {
    expect(roundLabel(4, 4)).toBe('Final');
    expect(roundLabel(3, 4)).toBe('Semifinal');
    expect(roundLabel(2, 4)).toBe('Quarterfinal');
    expect(roundLabel(1, 4)).toBe('Round 1');
  });

  it('qualifies both trees in double elimination, since neither ends the tournament', () => {
    expect(roundLabel(3, 3, 'winners', 'double')).toBe('Winners Final');
    expect(roundLabel(2, 3, 'winners', 'double')).toBe('Winners Semifinal');
    expect(roundLabel(1, 3, 'winners', 'double')).toBe('Winners Round 1');

    expect(roundLabel(4, 4, 'losers', 'double')).toBe('Losers Final');
    expect(roundLabel(3, 4, 'losers', 'double')).toBe('Losers Semifinal');
    expect(roundLabel(1, 4, 'losers', 'double')).toBe('Losers Round 1');
  });

  it('names the grand final and the match that follows a losers-bracket win', () => {
    expect(roundLabel(1, 2, 'grand_final', 'double')).toBe('Grand Final');
    expect(roundLabel(2, 2, 'grand_final', 'double')).toBe('Deciding Match');
  });

  it('labels by position, so a losers bracket starting at round 2 reads normally', () => {
    // With byes the first losers round collapses away entirely. Positions stay 1..n.
    expect(roundLabel(1, 3, 'losers', 'double')).toBe('Losers Round 1');
  });
});

describe('championName', () => {
  it('is null for an empty bracket', () => {
    expect(championName(emptyBracket())).toBeNull();
    expect(championName(null)).toBeNull();
  });

  it('takes the last round winner in single elimination', () => {
    const data = singleEliminationBracket({
      1: [match({ id: 1, winner_name: 'Alpha', status: 'complete' })],
      2: [match({ id: 2, round: 2, winner_name: 'Bravo', status: 'complete' })],
    });
    expect(championName(data)).toBe('Bravo');
  });

  it('crowns the grand-final winner when the winners-bracket side takes it', () => {
    const data = doubleEliminationBracket({
      winners: { 1: [match({ id: 1 })] },
      grandFinal: {
        1: [match({ id: 10, team1_id: 5, team2_id: 6, winner_id: 5, winner_name: 'Alpha', status: 'complete' })],
        2: [match({ id: 11, round: 2, is_reset: 1 })],
      },
    });
    expect(championName(data)).toBe('Alpha');
  });

  it('crowns nobody when the losers-bracket side wins the grand final', () => {
    // Both teams now carry one loss; the deciding match settles it.
    const data = doubleEliminationBracket({
      winners: { 1: [match({ id: 1 })] },
      grandFinal: {
        1: [match({ id: 10, team1_id: 5, team2_id: 6, winner_id: 6, winner_name: 'Bravo', status: 'complete' })],
        2: [match({ id: 11, round: 2, is_reset: 1, status: 'ready' })],
      },
    });
    expect(championName(data)).toBeNull();
  });

  it('crowns the deciding match winner once it has been played', () => {
    const data = doubleEliminationBracket({
      winners: { 1: [match({ id: 1 })] },
      grandFinal: {
        1: [match({ id: 10, team1_id: 5, team2_id: 6, winner_id: 6, winner_name: 'Bravo', status: 'complete' })],
        2: [match({ id: 11, round: 2, is_reset: 1, winner_id: 6, winner_name: 'Bravo', status: 'complete' })],
      },
    });
    expect(championName(data)).toBe('Bravo');
  });
});

describe('teamParticipants', () => {
  it('stays null while the team name is still the auto-generated default', () => {
    expect(teamParticipants('Alice & Bob', 'Alice', 'Bob')).toBeNull();
  });

  it('shows the members once the team has been renamed', () => {
    expect(teamParticipants('The Ringers', 'Alice', 'Bob')).toBe('Alice · Bob');
  });
});
