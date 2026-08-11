// src/app/admin/tournament-manage.component.spec.ts
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TournamentManageComponent } from './tournament-manage.component';
import { TournamentService } from '../shared/services/tournament.service';
import { confirmService } from '../shared/services/confirm.service';
import { TournamentMember, UserSearchResult, TournamentCapabilities, Participant, Team } from '../shared/models/tournament.models';
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

  const ownerCapabilities: TournamentCapabilities = {
    role: 'owner', is_super_admin: false,
    can_manage_setup: true, can_manage_staff: true, can_score: true, can_delete: true,
  };

  const managerCapabilities: TournamentCapabilities = {
    role: 'manager', is_super_admin: false,
    can_manage_setup: true, can_manage_staff: false, can_score: true, can_delete: false,
  };

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

  // Triggers ngOnInit (load()) and flushes the tournament/participants requests with a
  // minimal 'setup' tournament. loadMembers() is only invoked by load() itself when the
  // returned capabilities allow it (see tournament-manage.component.ts), so callers that
  // expect it to fire must also flush the tournament-members request afterward.
  function bootstrapCore(capabilities: TournamentCapabilities = ownerCapabilities, visibility: 'public' | 'private' = 'public') {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
      .flush({
        id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
        visibility, seeding_mode: 'automatic', created_at: '2026-01-01', capabilities,
      });
    httpMock.expectOne(`${environment.apiUrl}/participants/${tournamentId}`).flush([]);
    httpMock.expectOne(`${environment.apiUrl}/teams/${tournamentId}`).flush([]);
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

  it('should not request or show the staff panel when capabilities say can_manage_staff is false', () => {
    bootstrapCore(managerCapabilities);

    httpMock.expectNone(`${environment.apiUrl}/tournament-members/${tournamentId}`);
    expect(component.staffVisible()).toBe(false);
    expect(component.members()).toEqual([]);
  });

  it('should hide the staff panel if the member list request unexpectedly fails despite capabilities allowing it', () => {
    bootstrapCore(); // owner capabilities → load() still requests the member list
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`)
      .flush({ error: 'You do not have permission to manage this tournament' }, { status: 403, statusText: 'Forbidden' });

    expect(component.staffVisible()).toBe(false);
    expect(component.members()).toEqual([]);
  });

  it('should not show setup controls when capabilities say can_manage_setup is false', () => {
    const scorekeeperCapabilities: TournamentCapabilities = {
      role: 'scorekeeper', is_super_admin: false,
      can_manage_setup: false, can_manage_staff: false, can_score: true, can_delete: false,
    };
    bootstrapCore(scorekeeperCapabilities);

    expect(component.canManageSetup()).toBe(false);
  });

  it('should show a load error and not crash when the tournament request fails', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
      .flush({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });

    expect(component.loadError()).toBe('This tournament could not be found, or you do not have access to it.');
    expect(component.loading()).toBe(false);
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

  it('should toggle visibility from public to private', () => {
    bootstrapCore(ownerCapabilities, 'public');
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

    component.toggleVisibility();

    const req = httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ visibility: 'private' });
    req.flush({
      id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
      visibility: 'private', created_at: '2026-01-01', capabilities: ownerCapabilities,
    });

    expect(component.tournament()?.visibility).toBe('private');
    expect(component.visibilityBusy()).toBe(false);
  });

  it('should copy the public bracket link to the clipboard', async () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    component.copyPublicLink();
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${location.origin}/bracket/test-uuid-1234`);
  });

  it('should copy the registration link to the clipboard', async () => {
    bootstrapCore();
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    component.copyRegistrationLink();
    await Promise.resolve();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${location.origin}/register/test-uuid-1234`);
  });

  function bootstrapWithParticipant(participant: Participant) {
    bootstrapWithParticipants([participant]);
  }

  function bootstrapWithParticipants(list: Participant[]) {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
      .flush({
        id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
        visibility: 'public', seeding_mode: 'automatic', created_at: '2026-01-01', capabilities: ownerCapabilities,
      });
    httpMock.expectOne(`${environment.apiUrl}/participants/${tournamentId}`).flush(list);
    httpMock.expectOne(`${environment.apiUrl}/teams/${tournamentId}`).flush([]);
    httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
  }

  describe('self-registration approval', () => {
    it('should split participants into approved and pending', () => {
      bootstrapWithParticipants([
        { id: 1, tournament_id: tournamentId, name: 'Alice', registration_status: 'approved' },
        { id: 2, tournament_id: tournamentId, name: 'Bob', registration_status: 'pending' },
      ]);

      expect(component.approvedParticipants().map(p => p.id)).toEqual([1]);
      expect(component.pendingParticipants().map(p => p.id)).toEqual([2]);
    });

    it('should approve a pending participant', () => {
      bootstrapWithParticipants([
        { id: 2, tournament_id: tournamentId, name: 'Bob', registration_status: 'pending' },
      ]);

      component.approveParticipant(component.participants()[0]);

      const req = httpMock.expectOne(`${environment.apiUrl}/participants/2/approve`);
      expect(req.request.method).toBe('PUT');
      req.flush({ id: 2, tournament_id: tournamentId, name: 'Bob', registration_status: 'approved' });

      expect(component.pendingParticipants().length).toBe(0);
      expect(component.approvedParticipants().length).toBe(1);
    });

    it('should hide the draw section while any registration is pending, even with enough approved participants', () => {
      bootstrapWithParticipants([
        { id: 1, tournament_id: tournamentId, name: 'A', registration_status: 'approved' },
        { id: 2, tournament_id: tournamentId, name: 'B', registration_status: 'approved' },
        { id: 3, tournament_id: tournamentId, name: 'C', registration_status: 'approved' },
        { id: 4, tournament_id: tournamentId, name: 'D', registration_status: 'approved' },
        { id: 5, tournament_id: tournamentId, name: 'E', registration_status: 'pending' },
      ]);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Draw Teams');
      expect(fixture.nativeElement.textContent).toContain('awaiting approval');
    });
  });

  describe('saveParticipant', () => {
    const participant: Participant = { id: 5, tournament_id: tournamentId, name: 'Alice', email: 'alice@example.com' };

    it('should not call the notification-email endpoint when the email is unchanged', () => {
      bootstrapWithParticipant(participant);

      component.startEditParticipant(participant);
      component.saveParticipant(participant);

      const nameReq = httpMock.expectOne(`${environment.apiUrl}/participants/5`);
      expect(nameReq.request.method).toBe('PUT');
      nameReq.flush({ ...participant });

      httpMock.expectNone(`${environment.apiUrl}/participants/5/notification-email`);
    });

    it('should call the notification-email endpoint when the email changes', () => {
      bootstrapWithParticipant(participant);

      component.startEditParticipant(participant);
      component.editingParticipantEmail = 'newalice@example.com';
      component.saveParticipant(participant);

      const nameReq = httpMock.expectOne(`${environment.apiUrl}/participants/5`);
      nameReq.flush({ ...participant });

      const emailReq = httpMock.expectOne(`${environment.apiUrl}/participants/5/notification-email`);
      expect(emailReq.request.method).toBe('PUT');
      expect(emailReq.request.body).toEqual({ email: 'newalice@example.com' });
      emailReq.flush({ ...participant, email: 'newalice@example.com', notification_lifecycle: 'pending' });

      expect(component.participants()[0].notification_lifecycle).toBe('pending');
    });

    // Regression coverage: a double-click used to fire two overlapping
    // setParticipantNotificationEmail() calls, each regenerating a confirm token and
    // silently invalidating the one the other call just issued.
    it('should ignore a second saveParticipant call for the same participant while the first is still in flight', () => {
      bootstrapWithParticipant(participant);

      component.startEditParticipant(participant);
      component.saveParticipant(participant);
      expect(component.savingParticipantId()).toBe(participant.id);

      component.saveParticipant(participant); // should be a no-op

      const nameReq = httpMock.expectOne(`${environment.apiUrl}/participants/5`);
      nameReq.flush({ ...participant });

      expect(component.savingParticipantId()).toBeNull();
    });
  });

  describe('manual seeding', () => {
    const mockTeams: Team[] = [
      { id: 10, tournament_id: tournamentId, name: 'A & B', participant1_id: 1, participant2_id: 2, participant1_name: 'A', participant2_name: 'B', seed: 1 },
      { id: 11, tournament_id: tournamentId, name: 'C & D', participant1_id: 3, participant2_id: 4, participant1_name: 'C', participant2_name: 'D', seed: 2 },
    ];

    function bootstrapAwaitingSeeds() {
      fixture.detectChanges();
      httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
        .flush({
          id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
          visibility: 'public', seeding_mode: 'manual', created_at: '2026-01-01', capabilities: ownerCapabilities,
        });
      httpMock.expectOne(`${environment.apiUrl}/participants/${tournamentId}`).flush([]);
      httpMock.expectOne(`${environment.apiUrl}/teams/${tournamentId}`).flush(mockTeams);
      httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
    }

    it('should PUT the chosen seeding mode', () => {
      bootstrapCore();
      httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

      component.updateSeedingMode('manual');

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ seeding_mode: 'manual' });
      req.flush({
        id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
        visibility: 'public', seeding_mode: 'manual', created_at: '2026-01-01', capabilities: ownerCapabilities,
      });

      expect(component.isManualSeeding()).toBe(true);
      expect(component.seedingModeBusy()).toBe(false);
    });

    it('should show the shared Teams panel (drag-to-reorder) once teams exist while still in setup', () => {
      bootstrapAwaitingSeeds();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Drag to reorder');
      expect(fixture.nativeElement.textContent).toContain('Generate Bracket');
      expect(fixture.nativeElement.textContent).not.toContain('Add Participant');
      expect(component.teams()).toEqual(mockTeams);
    });

    it('should persist a drag-and-drop reorder as the new seed order', () => {
      bootstrapAwaitingSeeds();

      component.onSeedDrop({ previousIndex: 0, currentIndex: 1 } as any);

      expect(component.teams().map(t => t.id)).toEqual([11, 10]);
      expect(component.teams().map(t => t.seed)).toEqual([1, 2]);

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/reorder`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ tournament_id: tournamentId, team_ids: [11, 10] });
      req.flush([]);
    });

    it('should revert the local order if persisting the reorder fails', () => {
      bootstrapAwaitingSeeds();
      const original = component.teams();

      component.onSeedDrop({ previousIndex: 0, currentIndex: 1 } as any);
      httpMock.expectOne(`${environment.apiUrl}/teams/reorder`)
        .flush({ error: 'boom' }, { status: 400, statusText: 'Bad Request' });

      expect(component.teams()).toEqual(original);
    });

    it('should generate the bracket after confirmation', async () => {
      bootstrapAwaitingSeeds();
      spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));

      await component.confirmGenerateBracket();

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/generate-bracket`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ tournament_id: tournamentId });
      req.flush(mockTeams);

      httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
        .flush({
          id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'active',
          visibility: 'public', seeding_mode: 'manual', created_at: '2026-01-01', capabilities: ownerCapabilities,
        });
      httpMock.expectOne(`${environment.apiUrl}/participants/${tournamentId}`).flush([]);
      httpMock.expectOne(`${environment.apiUrl}/teams/${tournamentId}`).flush(mockTeams);
      httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

      expect(component.generatingBracket()).toBe(false);
    });

    it('should not generate the bracket if confirmation is declined', async () => {
      bootstrapAwaitingSeeds();
      spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(false));

      await component.confirmGenerateBracket();

      httpMock.expectNone(`${environment.apiUrl}/teams/generate-bracket`);
      expect(component.generatingBracket()).toBe(false);
    });

    it('should block deleting a participant once teams have been drawn, even while still in setup', async () => {
      bootstrapAwaitingSeeds();
      const participant: Participant = { id: 1, tournament_id: tournamentId, name: 'A', registration_status: 'approved' };
      component.participants.set([participant]);

      await component.deleteParticipant(participant);

      httpMock.expectNone(`${environment.apiUrl}/participants/1`);
      expect(component.participants()).toEqual([participant]);
    });
  });

  describe('direct team entry', () => {
    function bootstrapDirect(teams: Team[] = [], seedingMode: 'automatic' | 'manual' = 'automatic') {
      fixture.detectChanges();
      httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
        .flush({
          id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
          visibility: 'public', seeding_mode: seedingMode, team_entry_mode: 'direct',
          created_at: '2026-01-01', capabilities: ownerCapabilities,
        });
      httpMock.expectOne(`${environment.apiUrl}/participants/${tournamentId}`).flush([]);
      httpMock.expectOne(`${environment.apiUrl}/teams/${tournamentId}`).flush(teams);
      httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);
    }

    it('should PUT the chosen team entry mode', () => {
      bootstrapCore();
      httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

      component.updateTeamEntryMode('direct');

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ team_entry_mode: 'direct' });
      req.flush({
        id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
        visibility: 'public', seeding_mode: 'automatic', team_entry_mode: 'direct',
        created_at: '2026-01-01', capabilities: ownerCapabilities,
      });

      expect(component.isDirectEntry()).toBe(true);
      expect(component.teamEntryModeBusy()).toBe(false);
    });

    it('should show the Add Team form instead of Add Participant', () => {
      bootstrapDirect();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Add Team');
      expect(fixture.nativeElement.textContent).not.toContain('Add Participant');
    });

    it('should require a team name and both member names before adding a team', () => {
      bootstrapDirect();
      component.newTeamName = '  ';
      component.newTeamP1Name = 'Alice';
      component.newTeamP2Name = 'Bob';

      component.addTeam();

      expect(component.addTeamError()).toBe('Enter a team name and both member names.');
      httpMock.expectNone(`${environment.apiUrl}/teams/direct`);
    });

    it('should POST the team and both member names, then append the created team', () => {
      bootstrapDirect();
      component.newTeamName = 'The Ringers';
      component.newTeamP1Name = 'Alice';
      component.newTeamP2Name = 'Bob';

      component.addTeam();

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/direct`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        tournament_id: tournamentId, team_name: 'The Ringers', participant1_name: 'Alice', participant2_name: 'Bob',
      });
      const created: Team = {
        id: 20, tournament_id: tournamentId, name: 'The Ringers',
        participant1_id: 1, participant2_id: 2, participant1_name: 'Alice', participant2_name: 'Bob', seed: 1,
      };
      req.flush(created);

      expect(component.teams()).toEqual([created]);
      expect(component.newTeamName).toBe('');
      expect(component.newTeamP1Name).toBe('');
      expect(component.newTeamP2Name).toBe('');
      expect(component.addingTeam()).toBe(false);
    });

    it('should surface a server error without clearing the form', () => {
      bootstrapDirect();
      component.newTeamName = 'The Ringers';
      component.newTeamP1Name = 'Alice';
      component.newTeamP2Name = 'Bob';

      component.addTeam();

      httpMock.expectOne(`${environment.apiUrl}/teams/direct`)
        .flush({ error: 'This tournament uses auto-draft team entry — add participants and draw teams instead' },
          { status: 400, statusText: 'Bad Request' });

      expect(component.addTeamError()).toBe('This tournament uses auto-draft team entry — add participants and draw teams instead');
      expect(component.newTeamName).toBe('The Ringers');
    });

    it('should show a delete button per team, not the auto-draft Redraw Teams button', () => {
      const team: Team = {
        id: 20, tournament_id: tournamentId, name: 'The Ringers',
        participant1_id: 1, participant2_id: 2, participant1_name: 'Alice', participant2_name: 'Bob', seed: 1,
      };
      bootstrapDirect([team]);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Redraw Teams');
      expect(fixture.nativeElement.textContent).toContain('Add at least 2 teams');
    });

    it('should delete a team after confirmation and reload', async () => {
      const team: Team = {
        id: 20, tournament_id: tournamentId, name: 'The Ringers',
        participant1_id: 1, participant2_id: 2, participant1_name: 'Alice', participant2_name: 'Bob', seed: 1,
      };
      bootstrapDirect([team]);
      spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));

      await component.deleteTeam(team);

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/20`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });

      // deleteTeam() reloads rather than filtering client-side (seeds get re-numbered
      // server-side), so the full load() sequence fires again.
      httpMock.expectOne(`${environment.apiUrl}/tournaments/${tournamentId}`)
        .flush({
          id: tournamentId, uuid: 'test-uuid-1234', name: 'Test Tournament', status: 'setup',
          visibility: 'public', seeding_mode: 'automatic', team_entry_mode: 'direct',
          created_at: '2026-01-01', capabilities: ownerCapabilities,
        });
      httpMock.expectOne(`${environment.apiUrl}/participants/${tournamentId}`).flush([]);
      httpMock.expectOne(`${environment.apiUrl}/teams/${tournamentId}`).flush([]);
      httpMock.expectOne(`${environment.apiUrl}/tournament-members/${tournamentId}`).flush(mockMembers);

      expect(component.deletingTeamId()).toBeNull();
    });

    it('should not delete a team if confirmation is declined', async () => {
      const team: Team = {
        id: 20, tournament_id: tournamentId, name: 'The Ringers',
        participant1_id: 1, participant2_id: 2, participant1_name: 'Alice', participant2_name: 'Bob', seed: 1,
      };
      bootstrapDirect([team]);
      spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(false));

      await component.deleteTeam(team);

      httpMock.expectNone(`${environment.apiUrl}/teams/20`);
      expect(component.teams()).toEqual([team]);
    });

    it('should disable Generate Bracket with fewer than 2 teams', () => {
      const team: Team = {
        id: 20, tournament_id: tournamentId, name: 'The Ringers',
        participant1_id: 1, participant2_id: 2, participant1_name: 'Alice', participant2_name: 'Bob', seed: 1,
      };
      bootstrapDirect([team]);
      fixture.detectChanges();

      const generateBtn: HTMLButtonElement = Array.from(fixture.nativeElement.querySelectorAll('button'))
        .find((b: any) => b.textContent.trim() === 'Generate Bracket') as HTMLButtonElement;
      expect(generateBtn.disabled).toBe(true);
    });
  });
});
