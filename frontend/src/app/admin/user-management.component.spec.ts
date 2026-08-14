// src/app/admin/user-management.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UserManagementComponent } from './user-management.component';
import { TournamentService } from '../shared/services/tournament.service';
import { confirmService } from '../shared/services/confirm.service';
import { UserAccount } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('UserManagementComponent', () => {
  let component: UserManagementComponent;
  let fixture: ComponentFixture<UserManagementComponent>;
  let httpMock: HttpTestingController;
  let tournamentService: TournamentService;

  const mockUsers: UserAccount[] = [
    { id: 1, username: 'admin1', email: 'admin1@example.com', role: 'super_admin', status: 'active', plan: 'free', created_at: '2026-01-01' },
    { id: 2, username: 'user1', email: 'user1@example.com', role: 'organizer', status: 'active', plan: 'free', created_at: '2026-01-02' },
    { id: 3, username: 'user2', email: 'user2@example.com', role: 'organizer', status: 'disabled', plan: 'paid', created_at: '2026-01-03' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserManagementComponent, HttpClientTestingModule],
      providers: [TournamentService]
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    tournamentService = TestBed.inject(TournamentService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load users on init', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('GET');
    req.flush(mockUsers);
    
    expect(component.users()).toEqual(mockUsers);
    expect(component.loading()).toBe(false);
  });

  it('should handle error when loading users', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(`${environment.apiUrl}/users`);
    req.error(new ErrorEvent('Network error'));
    
    expect(component.error()).toBe('Failed to load users.');
    expect(component.loading()).toBe(false);
  });

  it('should update user role', () => {
    component.users.set(mockUsers);
    const user = mockUsers[1];
    
    component['updateUser'](user.id, { role: 'super_admin' });
    
    const req = httpMock.expectOne(`${environment.apiUrl}/users/${user.id}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ role: 'super_admin' });
    
    const updatedUser = { ...user, role: 'super_admin' as const };
    req.flush(updatedUser);
    
    expect(component.users().find(u => u.id === user.id)?.role).toBe('super_admin');
    expect(component.toast()).toBe('User updated.');
  });

  it('should disable user account', () => {
    component.users.set(mockUsers);
    const user = mockUsers[1];
    
    component['updateUser'](user.id, { status: 'disabled' });
    
    const req = httpMock.expectOne(`${environment.apiUrl}/users/${user.id}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'disabled' });
    
    const updatedUser = { ...user, status: 'disabled' as const };
    req.flush(updatedUser);
    
    expect(component.users().find(u => u.id === user.id)?.status).toBe('disabled');
  });

  it('should handle error when updating user', () => {
    component.users.set(mockUsers);
    const user = mockUsers[1];
    
    component['updateUser'](user.id, { role: 'super_admin' });
    
    const req = httpMock.expectOne(`${environment.apiUrl}/users/${user.id}`);
    req.error(new ErrorEvent('Server error'), { status: 500, statusText: 'Server Error' });
    
    expect(component.toastType()).toBe('error');
    expect(component.toast()).toContain('Failed to update user');
  });

  it('should format date correctly', () => {
    const dateStr = '2026-08-05T15:00:00Z';
    const formatted = component.formatDate(dateStr);
    expect(formatted).toContain('Aug');
    expect(formatted).toContain('2026');
  });

  it('should return dash for empty date', () => {
    const formatted = component.formatDate('');
    expect(formatted).toBe('—');
    
    const nullFormatted = component.formatDate();
    expect(nullFormatted).toBe('—');
  });

  it('should check if user is updating', () => {
    component.updatingUserIds.set([1, 2]);
    expect(component.isUpdating(1)).toBe(true);
    expect(component.isUpdating(3)).toBe(false);
  });

  it('should toggle status from active to disabled', () => {
    component.users.set(mockUsers);
    const user = mockUsers[1];
    spyOn(window, 'confirm').and.returnValue(true);
    
    component.toggleStatus(user);
    
    const req = httpMock.expectOne(`${environment.apiUrl}/users/${user.id}`);
    expect(req.request.body).toEqual({ status: 'disabled' });
    
    const updatedUser = { ...user, status: 'disabled' as const };
    req.flush(updatedUser);
    
    expect(component.users().find(u => u.id === user.id)?.status).toBe('disabled');
  });

  it('should change role with confirmation for super admin demotion', async () => {
    component.users.set(mockUsers);
    const user = mockUsers[0]; // super_admin
    const event = {
      target: {
        value: 'organizer'
      }
    } as any;
    
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));
    await component.changeRole(user, event);
    
    const req = httpMock.expectOne(`${environment.apiUrl}/users/${user.id}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ role: 'organizer' });
    
    const updatedUser = { ...user, role: 'organizer' as const };
    req.flush(updatedUser);
    
    expect(component.users().find(u => u.id === user.id)?.role).toBe('organizer');
  });

  it('should change plan', () => {
    component.users.set(mockUsers);
    const user = mockUsers[1]; // plan: 'free'
    const event = { target: { value: 'paid' } } as any;

    component.changePlan(user, event);

    const req = httpMock.expectOne(`${environment.apiUrl}/users/${user.id}`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ plan: 'paid' });

    const updatedUser = { ...user, plan: 'paid' as const };
    req.flush(updatedUser);

    expect(component.users().find(u => u.id === user.id)?.plan).toBe('paid');
  });

  it('should not call the API when the plan is unchanged', () => {
    component.users.set(mockUsers);
    const user = mockUsers[1]; // plan: 'free'
    const event = { target: { value: 'free' } } as any;

    component.changePlan(user, event);

    httpMock.expectNone(`${environment.apiUrl}/users/${user.id}`);
    expect(component.updatingUserIds()).toEqual([]);
  });

  it('should generate password reset token', async () => {
    component.users.set(mockUsers);
    const user = mockUsers[1];
    
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    
    // resetPassword awaits confirmService.confirm() before making the HTTP call,
    // so the request isn't registered until that microtask resolves.
    await component.resetPassword(user);

    const req = httpMock.expectOne(`${environment.apiUrl}/users/${user.id}/password-reset`);
    expect(req.request.method).toBe('POST');

    req.flush({ token: 'abc123def456', expires_at: '2026-08-06T15:00:00Z' });

    // Wait for the clipboard operation to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc123def456');
    expect(component.toast()).toContain('Reset token copied');
    expect(component.toastType()).toBe('success');
  });

  it('should handle error when generating reset token', async () => {
    component.users.set(mockUsers);
    const user = mockUsers[1];
    
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));
    
    await component.resetPassword(user);

    const req = httpMock.expectOne(`${environment.apiUrl}/users/${user.id}/password-reset`);
    req.error(new ErrorEvent('Server error'), { status: 500 });

    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(component.toastType()).toBe('error');
    expect(component.toast()).toContain('Failed to generate reset token');
  });

  it('should not generate reset token if user cancels confirmation', async () => {
    component.users.set(mockUsers);
    const user = mockUsers[1];
    
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(false));
    
    const resetPromise = component.resetPassword(user);
    await resetPromise;
    
    // Should not make any HTTP request if canceled
    httpMock.expectNone(`${environment.apiUrl}/users/${user.id}/password-reset`);
    expect(component.updatingUserIds().length).toBe(0);
  });

  describe('createUser', () => {
    it('should display a validation error if fields are missing or invalid', () => {
      component.newUserUsername = '';
      component.newUserEmail = '';
      component.newUserPassword = 'short';

      component.createUser();

      expect(component.createUserError()).toBe('Enter a username, valid email, and password of at least 12 characters.');
    });

    it('should create a user and prepend it to the list', () => {
      component.users.set(mockUsers);
      component.newUserUsername = 'newperson';
      component.newUserEmail = 'newperson@example.com';
      component.newUserPassword = 'newPassword1234';
      component.newUserRole = 'organizer';

      component.createUser();

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        username: 'newperson', email: 'newperson@example.com',
        password: 'newPassword1234', role: 'organizer',
      });

      const created: UserAccount = { id: 4, username: 'newperson', email: 'newperson@example.com', role: 'organizer', status: 'active', plan: 'free', created_at: '2026-01-04' };
      req.flush(created, { status: 201, statusText: 'Created' });

      expect(component.users()[0]).toEqual(created);
      expect(component.users().length).toBe(4);
      expect(component.newUserUsername).toBe('');
      expect(component.creatingUser()).toBe(false);
    });

    it('should surface a server error without clearing the form', () => {
      component.newUserUsername = 'newperson';
      component.newUserEmail = 'newperson@example.com';
      component.newUserPassword = 'newPassword1234';

      component.createUser();

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      req.flush({ error: 'That username or email address is already registered' }, { status: 409, statusText: 'Conflict' });

      expect(component.createUserError()).toBe('That username or email address is already registered');
      expect(component.newUserUsername).toBe('newperson');
      expect(component.creatingUser()).toBe(false);
    });
  });
});

