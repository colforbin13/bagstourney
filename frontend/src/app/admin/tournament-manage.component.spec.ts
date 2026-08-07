// src/app/admin/tournament-manage.component.spec.ts
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TournamentManageComponent } from './tournament-manage.component';
import { TournamentService } from '../shared/services/tournament.service';
import { confirmService } from '../shared/services/confirm.service';
import { TournamentMember, UserSearchResult } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('TournamentManageComponent', () => {
  let component: TournamentManageComponent;
  let fixture: ComponentFixture<TournamentManageComponent>;
  let httpMock: HttpTestingController;
  const tournamentId = 1;

  const mockMembers: TournamentMember[] = [
    { user_id: 1, username: 'owner1', email: 'owner1@example.com', role: 'owner', global_role: 'organizer', created_at: '2026-01-01' },
    { user_id: 2, username: 'mgr1', email: 'mgr1@example.com', role: 'manager', global_role: 'organizer', created_at: '2026-01-02' },
  ];

  const mockSearchResults: UserSearchResult[] = [
    { id: 3, username: 'newperson', email: 'newperson@example.com', role: 'organizer' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TournamentManageComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: String(tournamentId) }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TournamentManageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Triggers ngOnInit (load() + loadMembers()) and flushes the tournament/participants
  // requests with a minimal 'setup' tournament, leaving the tournament-members request
  // for each test to flush individually (its outcome is what's under test).
  function bootstrapCore() {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
      .flush({ id: tournamentId, name: 'Test Tournament', status: 'setup', created_at: '2026-01-01' });
    httpMock.expectOne(`${environment.apiUrl}/participants/${tournamentId}`).flush([]);
  }

  it('should create', () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
    expect(component).toBeTruthy();
  });

  it('should show the staff panel when the member list loads successfully', () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    expect(component.staffVisible()).toBe(true);
    expect(component.members()).toEqual(mockMembers);
  });

  it('should hide the staff panel when the member list request fails (not owner/super admin)', () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`)
      .flush({ error: 'You do not have permission to manage this tournament' }, { status: 403, statusText: 'Forbidden' });

    expect(component.staffVisible()).toBe(false);
    expect(component.members()).toEqual([]);
  });

  it('should not search for queries under 2 characters', fakeAsync(() => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    component.staffSearchQuery = 'a';
    component.onStaffSearchInput();
    tick(300);

    httpMock.expectNone(req => req.url === `${environment.apiUrl}/users/search`);
    expect(component.staffSearchResults()).toEqual([]);
  }));

  it('should search users after a debounce once 2+ characters are entered', fakeAsync(() => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    component.staffSearchQuery = 'newp';
    component.onStaffSearchInput();
    tick(300);

    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/users/search`);
    expect(req.request.params.get('q')).toBe('newp');
    req.flush(mockSearchResults);

    expect(component.staffSearchResults()).toEqual(mockSearchResults);
  }));

  it('should add a selected user as a staff member', () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    component.selectStaffUser(mockSearchResults[0]);
    component.addStaffMember('scorekeeper');

    const req = httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ user_id: 3, role: 'scorekeeper' });
    req.flush({ success: true }, { status: 201, statusText: 'Created' });

    // addStaffMember() reloads the member list on success
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
    expect(component.selectedStaffUser()).toBeNull();
  });

  it('should surface an error without clearing selection when adding a staff member fails', () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    component.selectStaffUser(mockSearchResults[0]);
    component.addStaffMember('manager');

    const req = httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`);
    req.flush({ error: 'User not found or inactive' }, { status: 400, statusText: 'Bad Request' });

    expect(component.memberError()).toBe('User not found or inactive');
    expect(component.selectedStaffUser()).toEqual(mockSearchResults[0]);
  });

  it('should change a non-owner member role', () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    component.changeMemberRole(mockMembers[1], 'scorekeeper');

    const req = httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}/2`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ role: 'scorekeeper' });
    req.flush({ success: true });

    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
  });

  it('should remove a member after confirmation', async () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));
    await component.removeMember(mockMembers[1]);

    const req = httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}/2`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });

    expect(component.members().find(m => m.user_id === 2)).toBeUndefined();
  });

  it('should not remove a member if confirmation is declined', async () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(false));
    await component.removeMember(mockMembers[1]);

    httpMock.expectNone(`${environment.apiUrl}/tournament-members/${tournamentId}/2`);
    expect(component.members()).toEqual(mockMembers);
  });

  it('should transfer ownership to the selected user after confirmation', async () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    component.selectStaffUser(mockSearchResults[0]);
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));
    await component.transferOwnershipTo();

    const req = httpMock.expectOne(`${environment.apiUrl}/tournament-ownership/${tournamentId}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ user_id: 3 });
    req.flush({ success: true });

    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
    expect(component.selectedStaffUser()).toBeNull();
  });

  it('should not transfer ownership if confirmation is declined', async () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    component.selectStaffUser(mockSearchResults[0]);
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(false));
    await component.transferOwnershipTo();

    httpMock.expectNone(`${environment.apiUrl}/tournament-ownership/${tournamentId}`);
    expect(component.selectedStaffUser()).toEqual(mockSearchResults[0]);
  });
});
