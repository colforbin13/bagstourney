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
    return { id: tournamentId, name: 'Test Tournament', status: 'active', created_at: '2026-01-01', capabilities };
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
});
