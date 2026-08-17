// src/app/bracket/tournament-list.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { TournamentListComponent } from './tournament-list.component';
import { TournamentService } from '../shared/services/tournament.service';
import { AuthService } from '../shared/services/auth.service';
import { Tournament, TournamentStats } from '../shared/models/tournament.models';

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1,
    uuid: 'uuid-1',
    name: 'Backyard Classic',
    status: 'active',
    visibility: 'public',
    seeding_mode: 'automatic',
    team_entry_mode: 'auto_draft',
    created_at: new Date().toISOString(),
    paid_override: false,
    ...overrides,
  };
}

function makeStats(overrides: Partial<TournamentStats> = {}): TournamentStats {
  return {
    team_count: 8,
    match_count: 7,
    matches_played: 3,
    total_rounds: 3,
    current_round: 2,
    champion_name: null,
    ...overrides,
  };
}

describe('TournamentListComponent', () => {
  let component: TournamentListComponent;
  let fixture: ComponentFixture<TournamentListComponent>;

  // `landing` mirrors the route data in app.routes.ts: true on `/`, false on `/tournaments`.
  function setup(tournaments: Tournament[], loggedIn = false, landing = true) {
    const mockSvc = { getTournaments: () => of(tournaments) };
    const mockAuth = { isLoggedIn: () => loggedIn };

    TestBed.configureTestingModule({
      imports: [TournamentListComponent],
      providers: [
        Router,
        { provide: ActivatedRoute, useValue: { snapshot: { data: { landing } } } },
        { provide: TournamentService, useValue: mockSvc },
        { provide: AuthService, useValue: mockAuth },
      ],
    });

    fixture = TestBed.createComponent(TournamentListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create and load tournaments', () => {
    setup([makeTournament()]);
    expect(component).toBeTruthy();
    expect(component.loading()).toBe(false);
    expect(component.tournaments().length).toBe(1);
  });

  it('should show the landing content to anonymous visitors', () => {
    setup([makeTournament()]);
    expect(component.showLanding()).toBe(true);
    expect(fixture.nativeElement.querySelector('.hero')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.step').length).toBe(3);
  });

  it('should show the same landing content to a signed-in user on /', () => {
    setup([makeTournament()], true);
    expect(component.showLanding()).toBe(true);
    expect(fixture.nativeElement.querySelector('.hero')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.step').length).toBe(3);
  });

  it('should hide the landing content on the slimmed-down /tournaments route', () => {
    setup([makeTournament()], true, false);
    expect(component.showLanding()).toBe(false);
    expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
    expect(fixture.nativeElement.querySelector('.steps')).toBeNull();
    expect(fixture.nativeElement.querySelector('.list-title').textContent).toContain('Tournaments');
  });

  it('should hide the landing content on /tournaments for an anonymous visitor too', () => {
    setup([makeTournament()], false, false);
    expect(component.showLanding()).toBe(false);
    expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
  });

  it('should advertise the venue features, which are the differentiated ones', () => {
    setup([makeTournament()]);
    const features: string[] = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.features li'))
      .map(li => li.textContent!.trim());

    expect(features).toContain('Bracket on the TV');
    expect(features).toContain('Printable QR signs');
    expect(features.length).toBe(6);
  });

  // The rest of the landing copy is deliberately sport-neutral, so this line is the only
  // thing telling a visitor their game is covered — it must not quietly disappear.
  it('should name example sports in the hero and link to the full list', () => {
    setup([makeTournament()]);
    const sports: HTMLElement = fixture.nativeElement.querySelector('.hero-sports');
    expect(sports).toBeTruthy();
    expect(sports.textContent).toContain('KanJam');
    expect(sports.querySelector('a')!.getAttribute('href')).toBe('/sports');
  });

  it('should point the hero actions at register/sign-in for an anonymous visitor', () => {
    setup([makeTournament()]);
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.hero-actions a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin/register', '/admin/login']);
  });

  it('should point the hero actions somewhere useful for a signed-in user', () => {
    setup([makeTournament()], true);
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.hero-actions a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin', '/tournaments']);
  });

  it('should group live tournaments ahead of completed ones', () => {
    setup([
      makeTournament({ id: 1, name: 'Old One', status: 'complete' }),
      makeTournament({ id: 2, name: 'Running', status: 'active' }),
    ]);
    const groups = component.groups();
    expect(groups.map(g => g.key)).toEqual(['active', 'complete']);
    expect(groups[0].items[0].name).toBe('Running');
  });

  it('should omit groups that have no tournaments', () => {
    setup([makeTournament({ status: 'active' })]);
    expect(component.groups().length).toBe(1);
    expect(component.groups()[0].key).toBe('active');
  });

  it('should build a meta line from the stats for a live tournament', () => {
    setup([makeTournament({ stats: makeStats() })]);
    const line = component.meta(component.tournaments()[0]);
    expect(line).toContain('8 teams');
    expect(line).toContain('Round 2 of 3');
    expect(line).toContain('3 of 7 matches');
    expect(line).toContain('Started today');
  });

  it('should leave round and match progress out of a completed tournament meta line', () => {
    setup([makeTournament({ status: 'complete', stats: makeStats({ matches_played: 7, current_round: null }) })]);
    const line = component.meta(component.tournaments()[0]);
    expect(line).toContain('8 teams');
    expect(line).not.toContain('Round');
    expect(line).not.toContain('matches');
  });

  it('should survive a tournament with no stats at all', () => {
    setup([makeTournament({ stats: undefined })]);
    expect(() => component.meta(component.tournaments()[0])).not.toThrow();
    expect(component.progress(component.tournaments()[0])).toBeNull();
  });

  it('should compute progress only for live tournaments with playable matches', () => {
    const live = makeTournament({ stats: makeStats({ matches_played: 3, match_count: 7 }) });
    const done = makeTournament({ id: 2, status: 'complete', stats: makeStats({ matches_played: 7 }) });
    const empty = makeTournament({ id: 3, stats: makeStats({ match_count: 0, matches_played: 0 }) });
    setup([live, done, empty]);
    expect(component.progress(live)).toBe(43);
    expect(component.progress(done)).toBeNull();
    expect(component.progress(empty)).toBeNull();
  });

  it('should render the champion for a completed tournament', () => {
    setup([makeTournament({ status: 'complete', stats: makeStats({ champion_name: 'Team Ringer' }) })]);
    expect(fixture.nativeElement.querySelector('.row-champion').textContent).toContain('Team Ringer');
  });

  it('should label statuses in plain language', () => {
    setup([makeTournament()]);
    expect(component.statusLabel(makeTournament({ status: 'active' }))).toBe('Live');
    expect(component.statusLabel(makeTournament({ status: 'complete' }))).toBe('Final');
    expect(component.statusLabel(makeTournament({ status: 'setup' }))).toBe('Setup');
  });

  it('should not offer the filter on a short list', () => {
    setup([makeTournament()]);
    expect(component.showFilter()).toBe(false);
    expect(fixture.nativeElement.querySelector('.filter')).toBeNull();
  });

  it('should offer the filter once the list is long enough to need it', () => {
    setup(Array.from({ length: 7 }, (_, i) => makeTournament({ id: i + 1, name: `T${i}` })));
    expect(component.showFilter()).toBe(true);
    expect(fixture.nativeElement.querySelector('.filter')).toBeTruthy();
  });

  it('should filter tournaments by name, case-insensitively', () => {
    setup([
      makeTournament({ id: 1, name: 'Backyard Classic' }),
      makeTournament({ id: 2, name: 'Garage Invitational' }),
    ]);
    component.filter.set('garage');
    expect(component.groups()[0].items.length).toBe(1);
    expect(component.groups()[0].items[0].name).toBe('Garage Invitational');

    component.filter.set('nothing matches this');
    expect(component.groups().length).toBe(0);
  });

  it('should show an empty state when there are no tournaments', () => {
    setup([]);
    expect(fixture.nativeElement.querySelector('.empty').textContent)
      .toContain('No public tournaments running right now');
  });

  it('should point a signed-in user at the admin page when they have no tournaments', () => {
    setup([], true);
    expect(fixture.nativeElement.querySelector('.empty').textContent).toContain('No tournaments yet');
  });

  it('should describe how long ago a tournament started', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
    setup([makeTournament()]);
    expect(component.meta(makeTournament({ created_at: daysAgo(0) }))).toContain('Started today');
    expect(component.meta(makeTournament({ created_at: daysAgo(1) }))).toContain('Started yesterday');
    expect(component.meta(makeTournament({ created_at: daysAgo(3) }))).toContain('Started 3 days ago');
    expect(component.meta(makeTournament({ created_at: daysAgo(30) }))).toMatch(/Started [A-Z][a-z]{2} \d+/);
  });

  it('should not crash on an unparseable created_at', () => {
    setup([makeTournament({ created_at: 'not-a-date' })]);
    expect(component.meta(component.tournaments()[0])).toBe('');
  });
});
