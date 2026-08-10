// src/app/bracket/bracket-view.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BracketViewComponent } from './bracket-view.component';
import { TournamentService } from '../shared/services/tournament.service';
import { AuthService } from '../shared/services/auth.service';
import { Tournament, TournamentCapabilities, BracketData } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('BracketViewComponent', () => {
  let component: BracketViewComponent;
  let fixture: ComponentFixture<BracketViewComponent>;
  let httpMock: HttpTestingController;
  const tournamentId = 1;

  const emptyBracket: BracketData = { rounds: {} };

  function tournamentWith(capabilities?: TournamentCapabilities): Tournament {
    return {
      id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'active',
      visibility: 'public', seeding_mode: 'automatic', created_at: '2026-01-01', capabilities,
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BracketViewComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        AuthService,
        Router,
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: String(tournamentId) }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BracketViewComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Triggers ngOnInit (load()) and flushes the tournament/bracket requests it fires in
  // parallel.
  function bootstrap(tournament: Tournament) {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`).flush(tournament);
    httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(emptyBracket);
  }

  it('should create', () => {
    bootstrap(tournamentWith());
    expect(component).toBeTruthy();
  });

  it('canScore should be false for an anonymous viewer (no capabilities on the response)', () => {
    bootstrap(tournamentWith(undefined));
    expect(component.canScore()).toBe(false);
  });

  it('canScore should be false for a logged-in user with no role on this tournament', () => {
    bootstrap(tournamentWith({
      role: null, is_super_admin: false,
      can_manage_setup: false, can_manage_staff: false, can_score: false, can_delete: false,
    }));
    expect(component.canScore()).toBe(false);
  });

  it('canScore should be true for a scorekeeper on this tournament', () => {
    bootstrap(tournamentWith({
      role: 'scorekeeper', is_super_admin: false,
      can_manage_setup: false, can_manage_staff: false, can_score: true, can_delete: false,
    }));
    expect(component.canScore()).toBe(true);
  });

  it('should show an error and not crash when the tournament fails to load', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
      .flush({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(emptyBracket);

    expect(component.error()).toBe('Tournament not found.');
  });

  describe('teamParticipants', () => {
    it('returns null when the team name is still the auto-generated default', () => {
      bootstrap(tournamentWith());
      expect(component.teamParticipants('Alice & Bob', 'Alice', 'Bob')).toBeNull();
    });

    it('returns the participant names when the team name has been customized', () => {
      bootstrap(tournamentWith());
      expect(component.teamParticipants('The Champions', 'Alice', 'Bob')).toBe('Alice · Bob');
    });

    it('returns null when the team or participant names are missing (TBD/bye slots)', () => {
      bootstrap(tournamentWith());
      expect(component.teamParticipants(null, null, null)).toBeNull();
      expect(component.teamParticipants('Alice & Bob', null, null)).toBeNull();
    });
  });

  describe('bracket connector geometry', () => {
    function loadTwoRoundBracket() {
      const bracket: BracketData = {
        rounds: {
          1: [
            {
              id: 1, tournament_id: tournamentId, round: 1, match_number: 1,
              team1_id: 10, team2_id: 20, team1_score: null, team2_score: null,
              winner_id: null, next_match_id: 3, next_match_slot: 1, status: 'ready',
              team1_name: 'A', team2_name: 'B', winner_name: null,
              team1_participant1_name: null, team1_participant2_name: null,
              team2_participant1_name: null, team2_participant2_name: null,
            } as any,
            {
              id: 2, tournament_id: tournamentId, round: 1, match_number: 2,
              team1_id: 30, team2_id: 40, team1_score: null, team2_score: null,
              winner_id: null, next_match_id: 3, next_match_slot: 2, status: 'ready',
              team1_name: 'C', team2_name: 'D', winner_name: null,
              team1_participant1_name: null, team1_participant2_name: null,
              team2_participant1_name: null, team2_participant2_name: null,
            } as any,
          ],
          2: [
            {
              id: 3, tournament_id: tournamentId, round: 2, match_number: 1,
              team1_id: null, team2_id: null, team1_score: null, team2_score: null,
              winner_id: null, next_match_id: null, next_match_slot: null, status: 'pending',
              team1_name: null, team2_name: null, winner_name: null,
              team1_participant1_name: null, team1_participant2_name: null,
              team2_participant1_name: null, team2_participant2_name: null,
            } as any,
          ],
        },
      };
      fixture.detectChanges();
      httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`).flush(tournamentWith());
      httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(bracket);
      fixture.detectChanges();
    }

    it('computes pair midpoints using the same span math matchGridRow uses, so lines land on match centers', () => {
      loadTwoRoundBracket();
      const round1 = component.rounds()[0];

      const pairs = component.roundConnectors(round1);

      expect(pairs.length).toBe(1);
      expect(pairs[0].y1).toBe(75);    // match 1's center: rowUnitPx * 0.5
      expect(pairs[0].y2).toBe(225);   // match 2's center: rowUnitPx * 1.5
      expect(pairs[0].mid).toBe(150);  // lands exactly on round 2's own single-match center
    });

    it('returns no connectors for the final round', () => {
      loadTwoRoundBracket();
      const finalRound = component.rounds()[1];

      expect(component.roundConnectors(finalRound)).toEqual([]);
    });

    it('builds an SVG path as two stubs meeting at the midpoint, then one stub continuing into the next round', () => {
      const path = component.connectorPath({ y1: 75, y2: 225, mid: 150 });

      expect(path).toBe('M 0 75 H 16 V 150 M 0 225 H 16 V 150 M 16 150 H 32');
    });
  });

  it('renders a muted participant sub-label only for teams with a customized name', () => {
    const bracket: BracketData = {
      rounds: {
        1: [
          {
            id: 1, tournament_id: tournamentId, round: 1, match_number: 1,
            team1_id: 10, team2_id: 20, team1_score: null, team2_score: null,
            winner_id: null, next_match_id: null, next_match_slot: null, status: 'ready',
            team1_name: 'The Champions', team2_name: 'Carol & Dave', winner_name: null,
            team1_participant1_name: 'Alice', team1_participant2_name: 'Bob',
            team2_participant1_name: 'Carol', team2_participant2_name: 'Dave',
          } as any,
        ],
      },
    };

    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`).flush(tournamentWith());
    httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(bracket);
    fixture.detectChanges();

    const labels = Array.from(fixture.nativeElement.querySelectorAll('.team-participants'))
      .map((el: any) => el.textContent.trim());
    expect(labels).toEqual(['Alice · Bob']);
  });

  describe('when the route param is a uuid (public bracket link)', () => {
    const uuid = 'abc-123-def-456';

    beforeEach(async () => {
      await TestBed.resetTestingModule().configureTestingModule({
        imports: [BracketViewComponent, HttpClientTestingModule],
        providers: [
          TournamentService,
          AuthService,
          Router,
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: uuid }) } } },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(BracketViewComponent);
      component = fixture.componentInstance;
      httpMock = TestBed.inject(HttpTestingController);
    });

    // Regression coverage for a real bug: the bracket must be fetched via the uuid-keyed
    // endpoint, not the numeric-id one — the numeric-id matches endpoint requires a
    // tournament role and 404s for an anonymous viewer, which broke a private
    // tournament's own shareable /bracket/{uuid} link (it resolved the tournament fine,
    // by design, but then never loaded the bracket).
    it('fetches the tournament and bracket by uuid, not by the resolved numeric id', () => {
      fixture.detectChanges();

      const uuidReq = httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/${uuid}`);
      expect(uuidReq.request.method).toBe('GET');
      uuidReq.flush(tournamentWith());

      const bracketReq = httpMock.expectOne(`${environment.apiUrl}/matches/by-uuid/${uuid}`);
      expect(bracketReq.request.method).toBe('GET');
      bracketReq.flush(emptyBracket);

      expect(component.tournament()?.id).toBe(tournamentId);
      expect(component.loading()).toBe(false);
      httpMock.expectNone(`${environment.apiUrl}/matches/${tournamentId}`);
    });

    it('shows an error but still resolves the independent bracket fetch if the uuid does not resolve to a tournament', () => {
      fixture.detectChanges();

      httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/${uuid}`)
        .flush({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });
      httpMock.expectOne(`${environment.apiUrl}/matches/by-uuid/${uuid}`).flush(emptyBracket);

      expect(component.error()).toBe('Tournament not found.');
      expect(component.loading()).toBe(false);
    });

    // Regression coverage: auto-reload (shown only to anonymous viewers, per the
    // template's `@if (!auth.isLoggedIn())` guard) calls the same load() on a timer —
    // it must keep using the uuid-keyed endpoints on every refresh, not just the first.
    it('keeps using the uuid-keyed endpoints when auto-reload re-triggers load()', () => {
      fixture.detectChanges();
      httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/${uuid}`).flush(tournamentWith());
      httpMock.expectOne(`${environment.apiUrl}/matches/by-uuid/${uuid}`).flush(emptyBracket);

      component.onAutoReloadToggle(true);

      httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/${uuid}`).flush(tournamentWith());
      httpMock.expectOne(`${environment.apiUrl}/matches/by-uuid/${uuid}`).flush(emptyBracket);
      httpMock.expectNone(`${environment.apiUrl}/matches/${tournamentId}`);
    });
  });
});
