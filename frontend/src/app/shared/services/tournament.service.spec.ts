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
    name: 'Test Tournament',
    status: 'setup',
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
});
