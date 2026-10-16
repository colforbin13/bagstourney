// src/app/shared/components/boards-panel.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BoardsPanelComponent } from './boards-panel.component';
import { BracketData, Match, PoolMatch } from '../models/tournament.models';
import { singleEliminationBracket } from '../testing/bracket-fixtures';

describe('BoardsPanelComponent', () => {
  let fixture: ComponentFixture<BoardsPanelComponent>;

  function match(id: number, team1: string, team2: string): Match {
    return {
      id, tournament_id: 1, round: 1, match_number: id, team1_id: id * 10, team2_id: id * 10 + 1,
      team1_score: null, team2_score: null, winner_id: null, next_match_id: null, next_match_slot: null,
      status: 'ready', team1_name: team1, team2_name: team2, winner_name: null,
      team1_participant1_name: null, team1_participant2_name: null,
      team2_participant1_name: null, team2_participant2_name: null,
    };
  }

  function poolGame(id: number, team1: string, team2: string): PoolMatch {
    return { id, round: 1, match_number: id, team1_id: 1, team2_id: 2, team1_name: team1, team2_name: team2,
      team1_score: null, team2_score: null, winner_id: null, status: 'ready' };
  }

  function render(data: BracketData | null, nextCount?: number) {
    fixture = TestBed.createComponent(BoardsPanelComponent);
    fixture.componentRef.setInput('data', data);
    if (nextCount) fixture.componentRef.setInput('nextCount', nextCount);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BoardsPanelComponent] }).compileComponents();
  });

  it('renders nothing when boards are off', () => {
    const el = render(singleEliminationBracket({ 1: [match(1, 'A', 'B')] }));
    expect(el.querySelector('.boards')).toBeNull();
  });

  it('shows each board with its game, and the queue in order', () => {
    const el = render({
      ...singleEliminationBracket({ 1: [match(1, 'Alpha', 'Bravo'), match(2, 'Charlie', 'Delta'), match(3, 'Echo', 'Fox')] }),
      boards: { count: 2, playing: [{ board: 1, key: 'b2' }, { board: 2, key: 'b1' }], up_next: ['b3'] },
    });
    const tiles = Array.from(el.querySelectorAll('.tile')).map(t =>
      Array.from(t.children).map(c => c.textContent!.trim()).join(' '));
    expect(tiles).toEqual(['Board 1 Charlie vs Delta', 'Board 2 Alpha vs Bravo']);
    expect(el.querySelector('.next-list')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Echo vs Fox');
  });

  it('finds pool games as well as bracket games, even when their ids collide', () => {
    const el = render({
      ...singleEliminationBracket({ 1: [match(1, 'Bracket A', 'Bracket B')] }),
      pool: { games_per_team: 3, started: true, games_played: 0, games_total: 1, complete: false, locked: false,
        rounds: [{ round: 1, matches: [poolGame(1, 'Pool A', 'Pool B')] }], standings: [] },
      boards: { count: 1, playing: [{ board: 1, key: 'p1' }], up_next: [] },
    });
    expect(el.querySelector('.tile')!.textContent).toContain('Pool A');
    expect(el.querySelector('.next-list')).toBeNull();
  });

  it('lists only as many waiting games as asked', () => {
    const games = [1, 2, 3, 4, 5, 6].map(i => match(i, 'T' + i, 'U' + i));
    const el = render({
      ...singleEliminationBracket({ 1: games }),
      boards: { count: 1, playing: [{ board: 1, key: 'b1' }], up_next: ['b2', 'b3', 'b4', 'b5', 'b6'] },
    }, 3);
    expect(el.querySelectorAll('.next-list li').length).toBe(3);
  });

  it("uses the tournament's word for its playing spots", () => {
    const el = render({
      ...singleEliminationBracket({ 1: [match(1, 'Alpha', 'Bravo')] }),
      boards: { count: 2, label: 'court', playing: [{ board: 2, key: 'b1' }], up_next: [] },
    });
    expect(el.querySelector('.tile-board')!.textContent!.trim()).toBe('Court 2');
    expect(el.querySelector('.boards')!.getAttribute('aria-label')).toBe('Courts');
  });

  it('says so when no game is on a board', () => {
    const el = render({ ...singleEliminationBracket({}), boards: { count: 4, playing: [], up_next: [] } });
    expect(el.querySelector('.boards-empty')).not.toBeNull();
  });
});
