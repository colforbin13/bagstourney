// src/app/shared/components/pool-standings.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PoolStandingsComponent } from './pool-standings.component';
import { PoolData, PoolStanding } from '../models/tournament.models';

describe('PoolStandingsComponent', () => {
  let fixture: ComponentFixture<PoolStandingsComponent>;

  function standing(over: Partial<PoolStanding>): PoolStanding {
    return {
      team_id: 1, team_name: 'Ann & Bob', participant1_name: 'Ann', participant2_name: 'Bob',
      rank: 1, played: 2, wins: 2, losses: 0, points_for: 42, points_against: 20, point_diff: 22, win_pct: 1,
      ...over,
    };
  }

  function pool(over: Partial<PoolData> = {}): PoolData {
    return {
      games_per_team: 3, started: true, games_played: 3, games_total: 6, complete: false, locked: false,
      rounds: [
        { round: 1, matches: [{ id: 1, round: 1, match_number: 1, team1_id: 1, team2_id: 2, team1_name: 'A', team2_name: 'B', team1_score: 21, team2_score: 3, winner_id: 1, status: 'complete' }] },
        { round: 2, matches: [{ id: 2, round: 2, match_number: 1, team1_id: 1, team2_id: 3, team1_name: 'A', team2_name: 'C', team1_score: null, team2_score: null, winner_id: null, status: 'ready' }] },
      ],
      standings: [
        standing({}),
        standing({ team_id: 2, team_name: 'The Sandbaggers', participant1_name: 'Cy', participant2_name: 'Dee', rank: 2, wins: 0, losses: 2, point_diff: -22 }),
      ],
      ...over,
    };
  }

  function render(p: PoolData | null) {
    fixture = TestBed.createComponent(PoolStandingsComponent);
    fixture.componentRef.setInput('pool', p);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PoolStandingsComponent] }).compileComponents();
  });

  it('renders a row per team in rank order with record and signed differential', () => {
    const el = render(pool());
    const rows = Array.from(el.querySelectorAll('tbody tr'))
      .map(r => Array.from(r.querySelectorAll('td')).map(td => td.firstElementChild?.textContent?.trim() ?? td.textContent!.trim()));
    expect(rows[0]).toEqual(['1', 'Ann & Bob', '2-0', '+22', '42']);
    expect(rows[1].slice(0, 4)).toEqual(['2', 'The Sandbaggers', '0-2', '-22']);
  });

  it('shows player names only for a renamed team', () => {
    const el = render(pool());
    const members = Array.from(el.querySelectorAll('.members')).map(m => m.textContent!.trim());
    expect(members).toEqual(['Cy · Dee']);
  });

  it('reports the current round and games played', () => {
    expect(render(pool()).querySelector('.pool-progress')!.textContent).toContain('Round 2 of 2 · 3 of 6 games played');
  });

  it('marks final standings once the bracket has locked them, without the seeding note', () => {
    const el = render(pool({ locked: true, complete: true, games_played: 6 }));
    expect(el.querySelector('.pool-title')!.textContent).toContain('final');
    expect(el.querySelector('.tiebreak-note')).toBeNull();
    expect(el.querySelector('.pool-progress')!.textContent).toContain('All 6 pool games played');
  });

  it('renders nothing without a pool', () => {
    expect(render(null).querySelector('table')).toBeNull();
  });
});
