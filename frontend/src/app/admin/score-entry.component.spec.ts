// src/app/admin/score-entry.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { ScoreEntryComponent } from './score-entry.component';
import { TournamentService } from '../shared/services/tournament.service';
import { BracketData, Match, Tournament, TournamentCapabilities } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('ScoreEntryComponent', () => {
  let component: ScoreEntryComponent;
  let fixture: ComponentFixture<ScoreEntryComponent>;
  let httpMock: HttpTestingController;
  const tournamentId = 1;

  const scorer: TournamentCapabilities = {
    role: 'scorekeeper', is_super_admin: false,
    can_manage_setup: false, can_manage_staff: false, can_score: true, can_delete: false,
    participant_cap: null, participant_count: null,
  };

  const spectator: TournamentCapabilities = {
    role: null, is_super_admin: false,
    can_manage_setup: false, can_manage_staff: false, can_score: false, can_delete: false,
    participant_cap: null, participant_count: null,
  };

  function tournamentWith(capabilities: TournamentCapabilities, status: Tournament['status'] = 'active'): Tournament {
    return {
      id: tournamentId, uuid: 'test-uuid', name: 'Test Tournament', status,
      visibility: 'public', seeding_mode: 'automatic', team_entry_mode: 'auto_draft',
      created_at: '2026-01-01', paid_override: false, capabilities,
    };
  }

  function match(over: Partial<Match>): Match {
    return {
      id: 1, tournament_id: tournamentId, round: 1, match_number: 1,
      team1_id: 10, team2_id: 11, team1_score: null, team2_score: null, winner_id: null,
      next_match_id: null, next_match_slot: null, status: 'ready',
      team1_name: 'Alpha', team2_name: 'Bravo', winner_name: null,
      team1_participant1_name: 'Ada', team1_participant2_name: 'Bo',
      team2_participant1_name: 'Cy', team2_participant2_name: 'Dee',
      ...over,
    } as Match;
  }

  // A two-round bracket: two ready semifinals, one pending final.
  const bracket: BracketData = {
    rounds: {
      1: [
        match({ id: 101, match_number: 1, status: 'ready' }),
        match({ id: 102, match_number: 2, status: 'ready', team1_name: 'Charlie', team2_name: 'Delta' }),
      ],
      2: [match({ id: 201, round: 2, match_number: 1, status: 'pending', team1_name: null, team2_name: null })],
    },
  } as unknown as BracketData;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScoreEntryComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        Router,
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: String(tournamentId) }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScoreEntryComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture.destroy();   // clears the refresh interval
    httpMock.verify();
  });

  function bootstrap(t: Tournament = tournamentWith(scorer), data: BracketData = bracket) {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`).flush(t);
    httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(data);
    fixture.detectChanges();
  }

  it('should create', () => {
    bootstrap();
    expect(component).toBeTruthy();
  });

  it('should list only matches that are ready to play', () => {
    bootstrap();

    expect(component.readyMatches().map(r => r.match.id)).toEqual([101, 102]);
    expect(fixture.nativeElement.querySelectorAll('.score-card').length).toBe(2);
  });

  it('should leave out byes, which have no score to enter', () => {
    bootstrap(tournamentWith(scorer), {
      rounds: { 1: [match({ id: 301, status: 'bye' }), match({ id: 302, status: 'ready' })] },
    } as unknown as BracketData);

    expect(component.readyMatches().map(r => r.match.id)).toEqual([302]);
  });

  it('should name rounds counting back from the final', () => {
    bootstrap();
    expect(component.readyMatches()[0].label).toBe('Semifinal');
  });

  it('should refuse a tied score without calling the API', () => {
    bootstrap();
    component.scores[101] = { team1: '21', team2: '21' };

    component.save(component.readyMatches()[0].match);

    expect(component.rowError()[101]).toContain('tied');
    httpMock.expectNone(`${environment.apiUrl}/matches/101`);
  });

  it('should refuse a half-filled score', () => {
    bootstrap();
    component.scores[101] = { team1: '21', team2: '' };

    component.save(component.readyMatches()[0].match);

    expect(component.rowError()[101]).toContain('both scores');
    httpMock.expectNone(`${environment.apiUrl}/matches/101`);
  });

  it('should refuse a negative score', () => {
    bootstrap();
    component.scores[101] = { team1: '-3', team2: '21' };

    component.save(component.readyMatches()[0].match);

    expect(component.rowError()[101]).toContain('negative');
    httpMock.expectNone(`${environment.apiUrl}/matches/101`);
  });

  it('should submit a valid score and reload, since the next match may now be ready', () => {
    bootstrap();
    component.scores[101] = { team1: '21', team2: '13' };

    component.save(component.readyMatches()[0].match);

    const req = httpMock.expectOne(`${environment.apiUrl}/matches/101`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ team1_score: 21, team2_score: 13 });
    req.flush({});

    // Reload after a successful save.
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`).flush(tournamentWith(scorer));
    httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(bracket);
    expect(component.submitting()).toBeNull();
  });

  it('should surface a server rejection against the match it belongs to', () => {
    bootstrap();
    component.scores[101] = { team1: '21', team2: '13' };

    component.save(component.readyMatches()[0].match);
    httpMock.expectOne(`${environment.apiUrl}/matches/101`)
      .flush({ error: 'Match is not ready to play' }, { status: 400, statusText: 'Bad Request' });

    expect(component.rowError()[101]).toBe('Match is not ready to play');
    expect(component.submitting()).toBeNull();
  });

  it('should not wipe a half-typed score when a background refresh lands', () => {
    bootstrap();
    component.scores[101] = { team1: '15', team2: '' };

    component.load(true);
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`).flush(tournamentWith(scorer));
    httpMock.expectOne(`${environment.apiUrl}/matches/${tournamentId}`).flush(bracket);

    expect(component.scores[101]).toEqual({ team1: '15', team2: '' });
  });

  it('should offer completed matches for correction, newest first', () => {
    bootstrap(tournamentWith(scorer), {
      rounds: {
        1: [
          match({ id: 101, match_number: 1, status: 'complete', team1_score: 21, team2_score: 9, winner_id: 10 }),
          match({ id: 102, match_number: 2, status: 'complete', team1_score: 21, team2_score: 15, winner_id: 10 }),
        ],
        2: [match({ id: 201, round: 2, match_number: 1, status: 'ready' })],
      },
    } as unknown as BracketData);

    expect(component.completedMatches().map(r => r.match.id)).toEqual([102, 101]);
    expect(component.readyMatches().map(r => r.match.id)).toEqual([201]);
  });

  it('should seed the inputs with the existing result when correcting a score', () => {
    const done = match({ id: 101, status: 'complete', team1_score: 21, team2_score: 9 });
    bootstrap(tournamentWith(scorer), { rounds: { 1: [done] } } as unknown as BracketData);

    component.startEdit(done);

    expect(component.editing()).toBe(101);
    expect(component.scores[101]).toEqual({ team1: '21', team2: '9' });
  });

  it('should tell a viewer without score access that they cannot enter scores', () => {
    bootstrap(tournamentWith(spectator));

    expect(component.canScore()).toBe(false);
    expect(fixture.nativeElement.querySelector('.empty').textContent).toContain("don't have score access");
    expect(fixture.nativeElement.querySelector('.score-card')).toBeNull();
  });

  it('should explain an empty list differently once the tournament is finished', () => {
    bootstrap(tournamentWith(scorer, 'complete'), {
      rounds: { 1: [match({ id: 101, status: 'complete', team1_score: 21, team2_score: 9 })] },
    } as unknown as BracketData);

    expect(fixture.nativeElement.querySelector('.empty').textContent).toContain('finished');
  });

  it('should explain an empty list differently before the bracket exists', () => {
    bootstrap(tournamentWith(scorer, 'setup'), { rounds: {} } as BracketData);
    expect(fixture.nativeElement.querySelector('.empty').textContent).toContain("hasn't been generated");
  });

  it('should reject a non-numeric route id without calling the API', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ScoreEntryComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        Router,
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'not-a-number' }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScoreEntryComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    expect(component.loadError()).toBe('Tournament not found.');
    httpMock.expectNone(r => r.url.includes('/tournaments/'));
  });
});
