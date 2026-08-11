// src/app/admin/admin-dashboard.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
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
    created_at: '2026-01-01',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent, HttpClientTestingModule],
      providers: [Router],
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

  it('should create a tournament with the chosen visibility, seeding mode, and team entry mode', () => {
    bootstrap();
    component.newName = 'New Tournament';
    component.newVisibility = 'private';
    component.newSeedingMode = 'manual';
    component.newTeamEntryMode = 'direct';
    component.create();

    const req = httpMock.expectOne(`${environment.apiUrl}/tournaments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'New Tournament', visibility: 'private', seeding_mode: 'manual', team_entry_mode: 'direct',
    });
    req.flush({ ...mockTournament, name: 'New Tournament', visibility: 'private', seeding_mode: 'manual', team_entry_mode: 'direct' });

    expect(component.tournaments()[0].name).toBe('New Tournament');
    expect(component.newName).toBe('');
    expect(component.newVisibility).toBe('public');
    expect(component.newSeedingMode).toBe('automatic');
    expect(component.newTeamEntryMode).toBe('auto_draft');
    expect(component.creating()).toBe(false);
  });

  it('should surface an error when creation fails', () => {
    bootstrap();
    component.newName = 'New Tournament';
    component.create();

    httpMock.expectOne(`${environment.apiUrl}/tournaments`)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

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
});
