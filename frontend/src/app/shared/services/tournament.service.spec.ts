// src/app/shared/services/tournament.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TournamentService } from './tournament.service';
import { environment } from '../../../environments/environment';
import { UserAccount, Tournament } from '../models/tournament.models';

describe('TournamentService', () => {
  let service: TournamentService;
  let httpMock: HttpTestingController;

  const mockUser: UserAccount = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'organizer',
    status: 'active',
    created_at: '2026-01-01'
  };

  const mockTournament: Tournament = {
    id: 1,
    uuid: 'test-uuid-1234',
    name: 'Test Tournament',
    status: 'setup',
    visibility: 'public',
    seeding_mode: 'automatic',
    team_entry_mode: 'auto_draft',
    created_at: '2026-01-01'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TournamentService]
    });
    service = TestBed.inject(TournamentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getUsers', () => {
    it('should fetch list of users', () => {
      const mockUsers = [mockUser];

      service.getUsers().subscribe(users => {
        expect(users.length).toBe(1);
        expect(users[0]).toEqual(mockUser);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      expect(req.request.method).toBe('GET');
      req.flush(mockUsers);
    });
  });

  describe('createUser', () => {
    it('should create a new user', () => {
      const newUser = {
        username: 'newuser',
        email: 'new@example.com',
        password: 'SecurePassword123',
        role: 'organizer' as const
      };
      
      const createdUser: UserAccount = {
        id: 1,
        username: 'newuser',
        email: 'new@example.com',
        role: 'organizer',
        status: 'active',
        created_at: '2026-01-01'
      };

      service.createUser(newUser).subscribe(user => {
        expect(user.id).toBe(1);
        expect(user.username).toBe('newuser');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(newUser);
      req.flush(createdUser);
    });
  });

  describe('updateUser', () => {
    it('should update user role', () => {
      const updateData = { role: 'super_admin' as const };

      service.updateUser(1, updateData).subscribe(user => {
        expect(user.role).toBe('organizer');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updateData);
      req.flush(mockUser);
    });

    it('should update user status', () => {
      const updateData = { status: 'disabled' as const };

      service.updateUser(1, updateData).subscribe(user => {
        expect(user.status).toBe('active');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updateData);
      req.flush(mockUser);
    });

    it('should update both role and status', () => {
      const updateData = { 
        role: 'super_admin' as const,
        status: 'disabled' as const
      };

      service.updateUser(1, updateData).subscribe(user => {
        expect(user).toEqual(mockUser);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/1`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(updateData);
      req.flush(mockUser);
    });
  });

  describe('getTournaments', () => {
    it('should fetch list of tournaments', () => {
      const mockTournaments = [mockTournament];

      service.getTournaments().subscribe(tournaments => {
        expect(tournaments.length).toBe(1);
        expect(tournaments[0]).toEqual(mockTournament);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments`);
      expect(req.request.method).toBe('GET');
      req.flush(mockTournaments);
    });
  });

  describe('createTournament', () => {
    it('should create a new tournament', () => {
      const name = 'New Tournament';

      service.createTournament(name).subscribe(tournament => {
        expect(tournament.id).toBe(1);
        expect(tournament.name).toBe('Test Tournament');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name });
      req.flush(mockTournament);
    });

    it('should include visibility in the request body when given', () => {
      service.createTournament('New Tournament', 'private').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments`);
      expect(req.request.body).toEqual({ name: 'New Tournament', visibility: 'private' });
      req.flush(mockTournament);
    });

    it('should include seeding_mode in the request body when given', () => {
      service.createTournament('New Tournament', 'public', 'manual').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments`);
      expect(req.request.body).toEqual({ name: 'New Tournament', visibility: 'public', seeding_mode: 'manual' });
      req.flush(mockTournament);
    });

    it('should include team_entry_mode in the request body when given', () => {
      service.createTournament('New Tournament', 'public', 'automatic', 'direct').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments`);
      expect(req.request.body).toEqual({
        name: 'New Tournament', visibility: 'public', seeding_mode: 'automatic', team_entry_mode: 'direct',
      });
      req.flush(mockTournament);
    });
  });

  describe('createTeamDirect', () => {
    it('should POST the team name and both participant names to /teams/direct', () => {
      const mockTeam: any = {};
      service.createTeamDirect(1, 'The Ringers', 'Alice', 'Bob').subscribe(team => {
        expect(team).toEqual(mockTeam);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/direct`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        tournament_id: 1, team_name: 'The Ringers', participant1_name: 'Alice', participant2_name: 'Bob',
      });
      req.flush(mockTeam);
    });
  });

  describe('deleteTeam', () => {
    it('should DELETE /teams/{id}', () => {
      service.deleteTeam(5).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/5`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true });
    });
  });

  describe('reorderTeams', () => {
    it('should PUT the ordered team ids to /teams/reorder', () => {
      const mockTeams: any[] = [];
      service.reorderTeams(1, [3, 1, 2]).subscribe(teams => {
        expect(teams).toEqual(mockTeams);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/reorder`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ tournament_id: 1, team_ids: [3, 1, 2] });
      req.flush(mockTeams);
    });
  });

  describe('generateBracket', () => {
    it('should POST tournament_id to /teams/generate-bracket', () => {
      const mockTeams: any[] = [];
      service.generateBracket(1).subscribe(teams => {
        expect(teams).toEqual(mockTeams);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/teams/generate-bracket`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ tournament_id: 1 });
      req.flush(mockTeams);
    });
  });

  describe('getTournament', () => {
    it('should fetch a single tournament', () => {
      service.getTournament(1).subscribe(tournament => {
        expect(tournament).toEqual(mockTournament);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments/1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockTournament);
    });
  });

  describe('getTournamentByUuid', () => {
    it('should fetch a tournament by its uuid', () => {
      service.getTournamentByUuid('test-uuid-1234').subscribe(tournament => {
        expect(tournament).toEqual(mockTournament);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/tournaments/by-uuid/test-uuid-1234`);
      expect(req.request.method).toBe('GET');
      req.flush(mockTournament);
    });
  });

  describe('getBracketByUuid', () => {
    it('should fetch bracket data by tournament uuid', () => {
      const mockBracket = { rounds: {} };

      service.getBracketByUuid('test-uuid-1234').subscribe(bracket => {
        expect(bracket).toEqual(mockBracket);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/matches/by-uuid/test-uuid-1234`);
      expect(req.request.method).toBe('GET');
      req.flush(mockBracket);
    });
  });

  describe('changePassword', () => {
    it('should call POST /auth/change-password with correct body', () => {
      service.changePassword('oldPass123', 'newPass1234').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/change-password`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        current_password: 'oldPass123',
        new_password: 'newPass1234'
      });
      req.flush({ message: 'Password changed successfully' });
    });

    it('should handle error response', () => {
      let errorReceived = false;
      service.changePassword('wrongPass', 'newPass1234').subscribe({
        error: () => { errorReceived = true; }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/change-password`);
      req.error(new ErrorEvent('Unauthorized'), { status: 401 });

      expect(errorReceived).toBe(true);
    });
  });

  describe('resetUserPassword', () => {
    it('should call POST /users/:id/password-reset', () => {
      service.resetUserPassword(42).subscribe(result => {
        expect(result.token).toBe('abc123');
        expect(result.expires_at).toBe('2026-08-06T15:00:00Z');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/42/password-reset`);
      expect(req.request.method).toBe('POST');
      req.flush({ token: 'abc123', expires_at: '2026-08-06T15:00:00Z' });
    });

    it('should handle error response on password reset', () => {
      let errorReceived = false;
      service.resetUserPassword(99).subscribe({
        error: () => { errorReceived = true; }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users/99/password-reset`);
      req.error(new ErrorEvent('Forbidden'), { status: 403 });

      expect(errorReceived).toBe(true);
    });
  });

  describe('resetPasswordWithToken', () => {
    it('should call POST /auth/reset-password with correct body', () => {
      service.resetPasswordWithToken('abc123', 'newPass1234').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        token: 'abc123',
        new_password: 'newPass1234'
      });
      req.flush({ message: 'Password reset successfully' });
    });

    it('should handle error response for an invalid or expired token', () => {
      let errorReceived = false;
      service.resetPasswordWithToken('bad-token', 'newPass1234').subscribe({
        error: () => { errorReceived = true; }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
      req.error(new ErrorEvent('Bad Request'), { status: 400 });

      expect(errorReceived).toBe(true);
    });
  });

  describe('setParticipantNotificationEmail', () => {
    it('should call PUT /participants/:id/notification-email with the email', () => {
      service.setParticipantNotificationEmail(7, 'player@example.com').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/participants/7/notification-email`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ email: 'player@example.com' });
      req.flush({ id: 7, tournament_id: 1, name: 'Alice', email: 'player@example.com' });
    });
  });

  describe('approveParticipant', () => {
    it('should call PUT /participants/:id/approve', () => {
      service.approveParticipant(7).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/participants/7/approve`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({});
      req.flush({ id: 7, tournament_id: 1, name: 'Alice', registration_status: 'approved' });
    });
  });

  describe('selfRegisterParticipant', () => {
    it('should call POST /participants/self-register with the tournament uuid, name, email, and honeypot field', () => {
      service.selfRegisterParticipant('test-uuid-1234', 'Alice', 'alice@example.com', '').subscribe(result => {
        expect(result.name).toBe('Alice');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/participants/self-register`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        tournament_uuid: 'test-uuid-1234', name: 'Alice', email: 'alice@example.com', website: '',
      });
      req.flush({ success: true, name: 'Alice' });
    });
  });

  describe('confirmNotificationSubscription', () => {
    it('should call POST /notifications/confirm with participant_id and token', () => {
      service.confirmNotificationSubscription(7, 'tok123').subscribe(result => {
        expect(result.message).toBe('Subscription confirmed.');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/notifications/confirm`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ participant_id: 7, token: 'tok123' });
      req.flush({ message: 'Subscription confirmed.' });
    });

    it('should handle an invalid or expired token', () => {
      let errorReceived = false;
      service.confirmNotificationSubscription(7, 'bad-token').subscribe({
        error: () => { errorReceived = true; }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/notifications/confirm`);
      req.error(new ErrorEvent('Bad Request'), { status: 400 });

      expect(errorReceived).toBe(true);
    });
  });

  describe('unsubscribeNotificationCategory', () => {
    it('should call POST /notifications/unsubscribe with the category', () => {
      service.unsubscribeNotificationCategory(7, 'tok123', 'round_completed').subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/notifications/unsubscribe`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ participant_id: 7, token: 'tok123', category: 'round_completed' });
      req.flush({ message: 'You will no longer receive these emails.' });
    });
  });

  describe('getNotificationPreferences', () => {
    it('should call GET /notifications/preferences with pid and token params', () => {
      service.getNotificationPreferences(7, 'tok123').subscribe(prefs => {
        expect(prefs.email).toBe('player@example.com');
        expect(prefs.categories.match_completed).toBe(true);
      });

      const req = httpMock.expectOne(
        r => r.url === `${environment.apiUrl}/notifications/preferences`
          && r.params.get('pid') === '7' && r.params.get('token') === 'tok123'
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        email: 'player@example.com',
        tournament_name: 'Summer Bags',
        categories: { match_completed: true, round_completed: true, tournament_finalized: true },
      });
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should call PUT /notifications/preferences with the changed categories', () => {
      service.updateNotificationPreferences(7, 'tok123', { round_completed: false }).subscribe();

      const req = httpMock.expectOne(`${environment.apiUrl}/notifications/preferences`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ participant_id: 7, token: 'tok123', round_completed: false });
      req.flush({ message: 'Preferences updated.' });
    });
  });
});
