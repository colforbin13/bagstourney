// src/app/bracket/bracket-view.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
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
      visibility: 'public', seeding_mode: 'automatic', team_entry_mode: 'auto_draft',
      created_at: '2026-01-01', paid_override: false, capabilities,
    };
  }

  // Pushed to by the kiosk tests to simulate ?kiosk=1 arriving, without going through a
  // real router navigation.
  let queryParams$: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject<ParamMap>(convertToParamMap({}));

    await TestBed.configureTestingModule({
      imports: [BracketViewComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        AuthService,
        Router,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: String(tournamentId) }) },
            queryParamMap: queryParams$.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BracketViewComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    // kiosk mode writes to <body>, which outlives the fixture.
    document.body.classList.remove('kiosk-mode');
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
      participant_cap: null, participant_count: null,
    }));
    expect(component.canScore()).toBe(false);
  });

  it('canScore should be true for a scorekeeper on this tournament', () => {
    bootstrap(tournamentWith({
      role: 'scorekeeper', is_super_admin: false,
      can_manage_setup: false, can_manage_staff: false, can_score: true, can_delete: false,
      participant_cap: null, participant_count: null,
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
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: convertToParamMap({ id: uuid }) },
              queryParamMap: queryParams$.asObservable(),
            },
          },
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

      // Auto-reload now starts at init, so re-enabling an already-running timer is a
      // no-op — switch it off first to get a fresh start (and its immediate reload).
      component.onAutoReloadToggle(false);
      component.onAutoReloadToggle(true);

      httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/${uuid}`).flush(tournamentWith());
      httpMock.expectOne(`${environment.apiUrl}/matches/by-uuid/${uuid}`).flush(emptyBracket);
      httpMock.expectNone(`${environment.apiUrl}/matches/${tournamentId}`);
    });
  });

  describe('mirrored layout', () => {
    /** A full bracket of `rounds` rounds: 2^(rounds-pos) matches in round `pos`. */
    function bracketOf(rounds: number): BracketData {
      const data: BracketData = { rounds: {} };
      for (let pos = 1; pos <= rounds; pos++) {
        const count = Math.pow(2, rounds - pos);
        data.rounds[pos] = Array.from({ length: count }, (_, i) => ({
          id: pos * 100 + i + 1, tournament_id: tournamentId, round: pos, match_number: i + 1,
          team1_id: null, team2_id: null, team1_score: null, team2_score: null, winner_id: null,
          next_match_id: null, next_match_slot: null, status: 'pending',
          team1_name: null, team2_name: null, winner_name: null,
          team1_participant1_name: null, team1_participant2_name: null,
          team2_participant1_name: null, team2_participant2_name: null,
        })) as unknown as BracketData['rounds'][number];
      }
      return data;
    }

    function bootstrapBracket(rounds: number) {
      fixture.detectChanges();
      httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`).flush(tournamentWith());
      httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(bracketOf(rounds));
      fixture.detectChanges();
    }

    it('should halve the height by splitting each round across two sides', () => {
      bootstrapBracket(4);
      const layout = component.mirrorLayout()!;

      // Single-sided would need 2^(4-1) = 8 row units; mirrored needs 2^(4-2) = 4.
      expect(layout.rows).toBe(4);
      expect(component.totalGridRows(1)).toBe(8);
    });

    it('should put the first half of each round on the left and the second half on the right', () => {
      bootstrapBracket(4);
      const layout = component.mirrorLayout()!;

      expect(layout.left.map(r => r.pos)).toEqual([1, 2, 3]);
      expect(layout.left[0].matches.map(m => m.match.match_number)).toEqual([1, 2, 3, 4]);
      expect(layout.left[1].matches.map(m => m.match.match_number)).toEqual([1, 2]);
      expect(layout.left[2].matches.map(m => m.match.match_number)).toEqual([1]);

      expect(layout.right[0].matches.map(m => m.match.match_number)).toEqual([2]);
      expect(layout.right[2].matches.map(m => m.match.match_number)).toEqual([5, 6, 7, 8]);
    });

    it('should render the right half inner-to-outer so it mirrors the left', () => {
      bootstrapBracket(4);
      expect(component.mirrorLayout()!.right.map(r => r.pos)).toEqual([3, 2, 1]);
    });

    it('should place the final in the middle', () => {
      bootstrapBracket(4);
      const layout = component.mirrorLayout()!;
      expect(layout.final!.round).toBe(4);
      expect(layout.final!.match_number).toBe(1);
    });

    it('should keep every round the same height on both sides', () => {
      bootstrapBracket(4);
      const layout = component.mirrorLayout()!;

      for (const side of [layout.left, layout.right]) {
        for (const round of side) {
          const span = Math.pow(2, round.pos - 1);
          const lastStart = (round.matches.length - 1) * span + 1;
          expect(lastStart + span - 1).toBe(layout.rows);
        }
      }
    });

    it('should give the round before the final a straight run into it', () => {
      bootstrapBracket(4);
      const layout = component.mirrorLayout()!;
      const semi = layout.left[2];

      // One match per side, so there is no pair to merge — the connector is a flat line,
      // and it sits at the vertical centre where the final's card also sits.
      expect(semi.connectors.length).toBe(1);
      const c = semi.connectors[0];
      expect(c.y1).toBe(c.y2);
      expect(c.mid).toBe(c.y1);
      expect(c.mid).toBe(layout.rows * component.rowUnitPx / 2);
    });

    it('should merge each pair of matches at its successor’s centre', () => {
      bootstrapBracket(4);
      const round1 = component.mirrorLayout()!.left[0];

      expect(round1.connectors.length).toBe(2);
      // Round-1 cards are one row unit tall, centred at 75 and 225; they merge at 150,
      // which is exactly the centre of the two-row round-2 card they feed.
      expect(round1.connectors[0]).toEqual({ y1: 75, y2: 225, mid: 150 });
      expect(round1.connectors[1]).toEqual({ y1: 375, y2: 525, mid: 450 });
    });

    it('should not mirror a two-team bracket, where round one is already the final', () => {
      bootstrapBracket(1);
      expect(component.useMirrorLayout()).toBe(false);
      expect(component.mirrorLayout()).toBeNull();
      expect(fixture.nativeElement.querySelector('.bracket-mirrored')).toBeNull();
      expect(fixture.nativeElement.querySelector('.bracket')).toBeTruthy();
    });

    it('should render the mirrored markup on a wide screen', () => {
      component.isNarrow.set(false);
      bootstrapBracket(4);

      expect(component.useMirrorLayout()).toBe(true);
      expect(fixture.nativeElement.querySelector('.bracket-mirrored')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.bracket-final')).toBeTruthy();
    });

    it('should leave the phone layout alone', () => {
      bootstrapBracket(4);
      component.isNarrow.set(true);
      fixture.detectChanges();

      expect(component.useMirrorLayout()).toBe(false);
      expect(fixture.nativeElement.querySelector('.bracket-mirrored')).toBeNull();
      expect(fixture.nativeElement.querySelector('.bracket')).toBeTruthy();
    });

    it('should still mirror on a narrow viewport in kiosk mode, since that is a TV', () => {
      bootstrapBracket(4);
      component.isNarrow.set(true);
      queryParams$.next(convertToParamMap({ kiosk: '1' }));
      fixture.detectChanges();

      expect(component.useMirrorLayout()).toBe(true);
      expect(fixture.nativeElement.querySelector('.bracket-mirrored')).toBeTruthy();
    });

    it('should flip the connectors on the right half only', () => {
      component.isNarrow.set(false);
      bootstrapBracket(4);

      const flipped = fixture.nativeElement.querySelectorAll('.connector-svg.flip').length;
      const total = fixture.nativeElement.querySelectorAll('.connector-svg').length;
      expect(total).toBe(6);      // three gutters per side
      expect(flipped).toBe(3);
    });
  });

  describe('TV / kiosk mode', () => {
    const scorer: TournamentCapabilities = {
      role: 'scorekeeper', is_super_admin: false,
      can_manage_setup: false, can_manage_staff: false, can_score: true, can_delete: false,
      participant_cap: null, participant_count: null,
    };

    function enterKiosk() {
      queryParams$.next(convertToParamMap({ kiosk: '1' }));
      fixture.detectChanges();
    }

    it('should stay off by default', () => {
      bootstrap(tournamentWith());
      expect(component.kiosk()).toBe(false);
      expect(component.fitScale()).toBe(1);
      expect(document.body.classList.contains('kiosk-mode')).toBe(false);
    });

    it('should turn on from the kiosk query parameter', () => {
      bootstrap(tournamentWith());
      enterKiosk();

      expect(component.kiosk()).toBe(true);
      expect(document.body.classList.contains('kiosk-mode')).toBe(true);
    });

    it('should hide the app chrome again when the parameter goes away', () => {
      bootstrap(tournamentWith());
      enterKiosk();
      queryParams$.next(convertToParamMap({}));
      fixture.detectChanges();

      expect(component.kiosk()).toBe(false);
      expect(document.body.classList.contains('kiosk-mode')).toBe(false);
    });

    it('should suppress score entry in kiosk mode even for someone who can score', () => {
      bootstrap(tournamentWith(scorer));
      expect(component.canScore()).toBe(true);
      expect(component.showScoring()).toBe(true);

      enterKiosk();

      // The permission is untouched — only the display suppresses the controls.
      expect(component.canScore()).toBe(true);
      expect(component.showScoring()).toBe(false);
    });

    it('should not leave the body class behind when the view is destroyed', () => {
      bootstrap(tournamentWith());
      enterKiosk();
      fixture.destroy();

      expect(document.body.classList.contains('kiosk-mode')).toBe(false);
    });

    it('should drive the mode through the URL so it can be bookmarked on a TV', () => {
      bootstrap(tournamentWith());
      const router = TestBed.inject(Router);
      const navigate = spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.setKiosk(true);
      expect(navigate.calls.mostRecent().args[1]!.queryParams).toEqual({ kiosk: 1 });

      component.setKiosk(false);
      expect(navigate.calls.mostRecent().args[1]!.queryParams).toEqual({ kiosk: null });
    });
  });

  describe('auto-refresh', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    // Regression: autoReload defaulted to true and the checkbox rendered ticked, but
    // startAutoReload() was only ever called from the checkbox's (change) handler — so a
    // freshly loaded bracket never actually refreshed until you toggled it off and on.
    // That is exactly the case a bracket left up on a TV during a tournament hits.
    it('should start refreshing on load without the checkbox being touched', () => {
      bootstrap(tournamentWith());
      expect(component.autoReload).toBe(true);

      jasmine.clock().tick(component.autoReloadIntervalMs + 1);

      httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`).flush(tournamentWith());
      httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(emptyBracket);
    });

    it('should issue exactly one load on startup, not two', () => {
      fixture.detectChanges();

      // bootstrap()'s expectOne would pass even with a duplicate queued behind it, so
      // match() is used here to count what startup actually fired.
      expect(httpMock.match(`${environment.apiUrl}/tournaments/${tournamentId}`).length).toBe(1);
      expect(httpMock.match(`${environment.apiUrl}/matches/${tournamentId}`).length).toBe(1);
    });

    it('should stop refreshing once unticked', () => {
      bootstrap(tournamentWith());
      component.onAutoReloadToggle(false);

      jasmine.clock().tick(component.autoReloadIntervalMs * 3);

      httpMock.expectNone(`${environment.apiUrl}/tournaments/${tournamentId}`);
    });

    it('should stop refreshing when the view is destroyed', () => {
      bootstrap(tournamentWith());
      fixture.destroy();

      jasmine.clock().tick(component.autoReloadIntervalMs * 3);

      httpMock.expectNone(`${environment.apiUrl}/tournaments/${tournamentId}`);
    });
  });
});
