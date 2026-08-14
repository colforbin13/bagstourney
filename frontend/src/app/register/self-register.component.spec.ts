// src/app/register/self-register.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { SelfRegisterComponent } from './self-register.component';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';

describe('SelfRegisterComponent', () => {
  let component: SelfRegisterComponent;
  let fixture: ComponentFixture<SelfRegisterComponent>;
  let httpMock: HttpTestingController;

  const activeTournament = {
    id: 1, uuid: 'abc-123', name: 'Summer Bags', status: 'setup',
    visibility: 'public', created_at: '2026-01-01',
  };

  async function setup(uuid = 'abc-123') {
    await TestBed.configureTestingModule({
      imports: [SelfRegisterComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ uuid }) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SelfRegisterComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should flag an invalid link and not call the API when uuid is missing', async () => {
    await setup('');
    httpMock.expectNone(r => r.url.includes('/tournaments/by-uuid/'));
    expect(component.loading()).toBe(false);
    expect(component.notFound()).toBe(true);
  });

  it('should load the tournament name for an open tournament', async () => {
    await setup();

    const req = httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`);
    expect(req.request.method).toBe('GET');
    req.flush(activeTournament);

    expect(component.loading()).toBe(false);
    expect(component.tournamentName()).toBe('Summer Bags');
    expect(component.closed()).toBe(false);
  });

  it('should show a closed message when the tournament is no longer in setup', async () => {
    await setup();

    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`)
      .flush({ ...activeTournament, status: 'active' });

    expect(component.closed()).toBe(true);
  });

  it('should show a closed message for a direct-entry tournament, matching the backend gate', async () => {
    await setup();

    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`)
      .flush({ ...activeTournament, team_entry_mode: 'direct' });
    fixture.detectChanges();

    expect(component.closed()).toBe(true);
    expect(fixture.nativeElement.querySelector('.reg-notes')).toBeNull();
    expect(fixture.nativeElement.querySelector('.notif-error').textContent).toContain('Registration is closed');
  });

  it('should stay open for an auto-draft tournament in setup', async () => {
    await setup();

    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`)
      .flush({ ...activeTournament, team_entry_mode: 'auto_draft' });

    expect(component.closed()).toBe(false);
  });

  it('should tell players teams are drawn at random and that approval is required', async () => {
    await setup();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`).flush(activeTournament);
    fixture.detectChanges();

    const notes: string = fixture.nativeElement.querySelector('.reg-notes').textContent;
    expect(notes).toContain('drawn at random');
    expect(notes).toContain('approves the list');
  });

  it('should warn that the optional email needs a confirmation tap', async () => {
    await setup();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`).flush(activeTournament);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.reg-hint').textContent).toContain('confirmation link');
  });

  it('should tell a registrant not to sign up twice', async () => {
    await setup();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`).flush(activeTournament);

    component.name = 'Alice';
    component.submit();
    httpMock.expectOne(`${environment.apiUrl}/participants/self-register`).flush({ success: true, name: 'Alice' });
    fixture.detectChanges();

    const success: string = fixture.nativeElement.querySelector('.notif-success').textContent;
    expect(success).toContain('No need to register again');
    // No email given, so the confirmation-tap prompt should stay hidden.
    expect(success).not.toContain('confirmation link');
  });

  it('should prompt for the email confirmation tap only when an email was given', async () => {
    await setup();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`).flush(activeTournament);

    component.name = 'Alice';
    component.email = 'alice@example.com';
    component.submit();
    httpMock.expectOne(`${environment.apiUrl}/participants/self-register`).flush({ success: true, name: 'Alice' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.notif-success').textContent).toContain('confirmation link');
  });

  it('should show not-found when the uuid does not resolve', async () => {
    await setup();

    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`)
      .flush({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });

    expect(component.notFound()).toBe(true);
  });

  it('should require a name before submitting', async () => {
    await setup();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`).flush(activeTournament);

    component.submit();

    expect(component.error()).toBe('Enter your name.');
    httpMock.expectNone(`${environment.apiUrl}/participants/self-register`);
  });

  it('should submit the honeypot field untouched and show success', async () => {
    await setup();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`).flush(activeTournament);

    component.name = 'Alice';
    component.email = 'alice@example.com';
    component.submit();

    const req = httpMock.expectOne(`${environment.apiUrl}/participants/self-register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      tournament_uuid: 'abc-123', name: 'Alice', email: 'alice@example.com', website: '',
    });
    req.flush({ success: true, name: 'Alice' });

    expect(component.success()).toBe(true);
    expect(component.registeredName()).toBe('Alice');
    expect(component.registeredEmail()).toBe(true);
  });

  it('should show a server error message on failure', async () => {
    await setup();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/abc-123`).flush(activeTournament);

    component.name = 'Bob';
    component.submit();

    const req = httpMock.expectOne(`${environment.apiUrl}/participants/self-register`);
    req.flush({ error: 'This tournament has reached its participant limit. Contact the organizer.' }, { status: 400, statusText: 'Bad Request' });

    expect(component.error()).toBe('This tournament has reached its participant limit. Contact the organizer.');
    expect(component.submitting()).toBe(false);
  });
});
