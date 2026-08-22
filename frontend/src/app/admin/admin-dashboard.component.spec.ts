// src/app/admin/admin-dashboard.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { confirmService } from '../shared/services/confirm.service';
import { Tournament } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('AdminDashboardComponent', () => {
  let component: AdminDashboardComponent;
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let httpMock: HttpTestingController;

  const mockTournament: Tournament = {
    id: 1, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
    visibility: 'public', seeding_mode: 'automatic', team_entry_mode: 'auto_draft',
    created_at: '2026-01-01', paid_override: false,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent, HttpClientTestingModule],
      // ActivatedRoute is needed now that the card header carries a static routerLink,
      // which RouterLink instantiates on construction rather than only when a row renders.
      providers: [Router, { provide: ActivatedRoute, useValue: {} }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function bootstrap(list: Tournament[] = []) {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments`).flush(list);
  }

  it('should load the tournament list on init', () => {
    bootstrap([mockTournament]);
    expect(component.tournaments()).toEqual([mockTournament]);
    expect(component.loading()).toBe(false);
  });

  it('should require a name before creating', () => {
    bootstrap();
    component.newName = '   ';
    component.create();
    expect(component.createError()).toBe('Enter a tournament name.');
    httpMock.expectNone(`${environment.apiUrl}/tournaments`);
  });

  it('should create a tournament with the chosen visibility, seeding mode, team entry mode, and format', () => {
    bootstrap();
    component.newName = 'New Tournament';
    component.newVisibility = 'private';
    component.newSeedingMode = 'manual';
    component.newTeamEntryMode = 'direct';
    component.newFormat = 'double';
    component.create();

    const req = httpMock.expectOne(`${environment.apiUrl}/tournaments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'New Tournament', visibility: 'private', seeding_mode: 'manual',
      team_entry_mode: 'direct', format: 'double',
    });
    req.flush({ ...mockTournament, name: 'New Tournament', visibility: 'private', seeding_mode: 'manual', team_entry_mode: 'direct', format: 'double' });

    expect(component.tournaments()[0].name).toBe('New Tournament');
    expect(component.newName).toBe('');
    expect(component.newVisibility).toBe('public');
    expect(component.newSeedingMode).toBe('automatic');
    expect(component.newTeamEntryMode).toBe('auto_draft');
    expect(component.newFormat).toBe('single');
    expect(component.creating()).toBe(false);
  });

  it('should surface the server message when creation is refused', () => {
    // A stale cached profile can let the UI offer double elimination to an account whose
    // plan has since lapsed, so the server's explanation has to reach the organizer.
    bootstrap();
    component.newName = 'New Tournament';
    component.newFormat = 'double';
    component.create();

    httpMock.expectOne(`${environment.apiUrl}/tournaments`)
      .flush({ error: 'Double elimination is a paid-plan feature. Upgrade to use it.' },
             { status: 403, statusText: 'Forbidden' });

    expect(component.createError()).toBe('Double elimination is a paid-plan feature. Upgrade to use it.');
    expect(component.creating()).toBe(false);
  });

  it('should fall back to a generic message when the server sends no explanation', () => {
    bootstrap();
    component.newName = 'New Tournament';
    component.create();

    httpMock.expectOne(`${environment.apiUrl}/tournaments`)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(component.createError()).toBe('Failed to create tournament.');
    expect(component.creating()).toBe(false);
  });

  it('should delete a tournament after confirmation', async () => {
    bootstrap([mockTournament]);
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));

    await component.delete(mockTournament);

    const req = httpMock.expectOne(`${environment.apiUrl}/tournaments/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });

    expect(component.tournaments()).toEqual([]);
  });

  it('should not delete a tournament if confirmation is declined', async () => {
    bootstrap([mockTournament]);
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(false));

    await component.delete(mockTournament);

    httpMock.expectNone(`${environment.apiUrl}/tournaments/1`);
    expect(component.tournaments()).toEqual([mockTournament]);
  });

  it('should explain each creation choice, and change the hint with the selection', () => {
    bootstrap();

    expect(component.visibilityHint()).toContain('Listed on the home page');
    component.newVisibility = 'private';
    expect(component.visibilityHint()).toContain('Unlisted');

    expect(component.teamEntryHint()).toContain('paired at random');
    component.newTeamEntryMode = 'direct';
    expect(component.teamEntryHint()).toContain('self sign-up is unavailable');

    expect(component.seedingHint()).toContain('assigned for you');
    component.newSeedingMode = 'manual';
    expect(component.seedingHint()).toContain('Drag teams');
  });

  it('should warn that seeding mode locks at the draw, in both modes', () => {
    bootstrap();
    expect(component.seedingHint()).toContain('Locked once teams are drawn');
    component.newSeedingMode = 'manual';
    expect(component.seedingHint()).toContain('Locked once teams are drawn');
  });

  it('should render the hints in the DOM rather than as hover-only tooltips', () => {
    bootstrap();
    fixture.detectChanges();

    const hints: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.field-hint'));
    expect(hints.length).toBe(4);
    expect(fixture.nativeElement.querySelectorAll('select[title]').length).toBe(0);
  });

  it('should default to single elimination', () => {
    bootstrap();
    expect(component.newFormat).toBe('single');
  });

  it('should offer double elimination but disable it without a paid plan', () => {
    spyOn(component, 'isPaidPlan').and.returnValue(false);
    bootstrap();
    fixture.detectChanges();

    const option: HTMLOptionElement = fixture.nativeElement.querySelector('option[value="double"]');
    // Shown rather than hidden: the paid tier should be visible to the people it is meant
    // to convert. Disabling is UX only — the server refuses the format regardless.
    expect(option).toBeTruthy();
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain('paid plan');
    expect(component.formatHint()).toContain('available on a paid plan');
  });

  it('should enable double elimination on a paid plan', () => {
    spyOn(component, 'isPaidPlan').and.returnValue(true);
    bootstrap();
    fixture.detectChanges();

    const option: HTMLOptionElement = fixture.nativeElement.querySelector('option[value="double"]');
    expect(option.disabled).toBe(false);
    expect(option.textContent).not.toContain('paid plan');
    expect(component.formatHint()).not.toContain('available on a paid plan');
  });

  it('should explain that the format locks once the bracket is generated', () => {
    bootstrap();
    component.newFormat = 'double';
    expect(component.formatHint()).toContain('losers bracket');
    expect(component.formatHint()).toContain('Locked once the bracket is generated');
  });

  it('should point a first-time organizer at the walkthrough', () => {
    bootstrap([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.card-head-link').getAttribute('href')).toBe('/how-it-works');
    expect(fixture.nativeElement.querySelector('.empty').textContent).toContain('See how it works');
  });
});
