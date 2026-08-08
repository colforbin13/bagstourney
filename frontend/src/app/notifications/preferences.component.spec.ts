// src/app/notifications/preferences.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { PreferencesComponent } from './preferences.component';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';

describe('PreferencesComponent', () => {
  let component: PreferencesComponent;
  let fixture: ComponentFixture<PreferencesComponent>;
  let httpMock: HttpTestingController;

  async function setup(queryParams: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [PreferencesComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PreferencesComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should show an invalid-link error and not call the API when pid or token is missing', async () => {
    await setup();
    httpMock.expectNone(`${environment.apiUrl}/notifications/preferences`);
    expect(component.loading()).toBe(false);
    expect(component.invalidLink()).toBe(true);
  });

  it('should load and populate preferences on init', async () => {
    await setup({ pid: '7', token: 'tok123' });

    const req = httpMock.expectOne(
      r => r.url === `${environment.apiUrl}/notifications/preferences`
        && r.params.get('pid') === '7' && r.params.get('token') === 'tok123'
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      email: 'player@example.com',
      tournament_name: 'Summer Bags',
      categories: { match_completed: true, round_completed: false, tournament_finalized: true },
    });

    expect(component.loading()).toBe(false);
    expect(component.email()).toBe('player@example.com');
    expect(component.tournamentName()).toBe('Summer Bags');
    expect(component.matchCompleted).toBe(true);
    expect(component.roundCompleted).toBe(false);
    expect(component.tournamentFinalized).toBe(true);
  });

  it('should flag an invalid link when loading preferences fails', async () => {
    await setup({ pid: '7', token: 'bad-token' });

    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/notifications/preferences`);
    req.flush({ error: 'Invalid or expired link' }, { status: 400, statusText: 'Bad Request' });

    expect(component.loading()).toBe(false);
    expect(component.invalidLink()).toBe(true);
  });

  it('should save the current checkbox values', async () => {
    await setup({ pid: '7', token: 'tok123' });

    httpMock.expectOne(r => r.url === `${environment.apiUrl}/notifications/preferences`)
      .flush({
        email: 'player@example.com',
        tournament_name: 'Summer Bags',
        categories: { match_completed: true, round_completed: true, tournament_finalized: true },
      });

    component.roundCompleted = false;
    component.save();

    const req = httpMock.expectOne(
      r => r.url === `${environment.apiUrl}/notifications/preferences` && r.method === 'PUT'
    );
    expect(req.request.body).toEqual({
      participant_id: 7, token: 'tok123',
      match_completed: true, round_completed: false, tournament_finalized: true,
    });
    req.flush({ message: 'Preferences updated.' });

    expect(component.saving()).toBe(false);
    expect(component.saved()).toBe(true);
  });
});
