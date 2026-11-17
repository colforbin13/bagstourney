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

  it('should keep the reset token on screen when the clipboard is unavailable', async () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/users`).flush(mockUsers);
    const user = mockUsers[1];

    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject(new Error('denied')));

    await component.resetPassword(user);
    httpMock.expectOne(`${environment.apiUrl}/users/${user.id}/password-reset`)
      .flush({ token: 'tok-789', expires_at: '2026-08-06T15:00:00Z' });
    await new Promise(resolve => setTimeout(resolve, 50));
    fixture.detectChanges();

    expect(component.resetToken()).toEqual({ userId: user.id, username: 'user1', token: 'tok-789', copied: false });
    const input = fixture.nativeElement.querySelector('.token-input') as HTMLInputElement;
    expect(input.value).toBe('tok-789');
    expect(fixture.nativeElement.textContent).toContain('Copy it and send it to them.');
    // No toast is the only record of it any more.
    expect(component.toast()).not.toContain('tok-789');
  });

  it('should keep the reset token panel after a successful copy until dismissed', async () => {
    component.users.set(mockUsers);
    const user = mockUsers[1];
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    await component.resetPassword(user);
    httpMock.expectOne(`${environment.apiUrl}/users/${user.id}/password-reset`)
      .flush({ token: 'tok-1', expires_at: '2026-08-06T15:00:00Z' });
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(component.resetToken()?.copied).toBeTrue();
  });

  it('should put a select back when the server refuses the change', () => {
    component.users.set(mockUsers);
    const user = mockUsers[0]; // super_admin, plan free
    const select = document.createElement('select');
    ['free', 'paid'].forEach(v => select.add(new Option(v, v)));
    select.value = 'paid';

    component.changePlan(user, { target: select } as unknown as Event);
    httpMock.expectOne(`${environment.apiUrl}/users/${user.id}`)
      .flush({ error: 'Not allowed' }, { status: 409, statusText: 'Conflict' });

    expect(select.value).toBe('free');
    expect(component.toast()).toBe('Not allowed');
  });

  it('should keep one status region on the page for toasts', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/users`).flush(mockUsers);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const region = el.querySelector('[role="status"].sr-only');
    expect(region).not.toBeNull();
    expect(region!.textContent!.trim()).toBe('');

    component['showToast']('User updated.', 'success');
    fixture.detectChanges();
    expect(el.querySelector('[role="status"].sr-only')).toBe(region);
    expect(region!.textContent!.trim()).toBe('User updated.');
    expect(el.querySelector('.toast')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('should move focus to the token and back to its button when done', async () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/users`).flush(mockUsers);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);

    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    await component.resetPassword(mockUsers[1]);
    httpMock.expectOne(`${environment.apiUrl}/users/2/password-reset`).flush({ token: 'tok', expires_at: '' });
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect((document.activeElement as HTMLElement).classList).toContain('token-input');

    component.dismissToken();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect((document.activeElement as HTMLElement).getAttribute('data-reset-for')).toBe('2');
    fixture.nativeElement.remove();
  });

  it('should give every row control an accessible name', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/users`).flush(mockUsers);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const selects = Array.from(el.querySelectorAll('.users-table select'));
    expect(selects.length).toBe(6);
    expect(selects.every(s => !!s.getAttribute('aria-label'))).toBeTrue();
    expect(selects[0].getAttribute('aria-label')).toBe('Role for admin1');
    const unlabelled = Array.from(el.querySelectorAll('.create-user input, .create-user select'))
      .filter(i => !(i as HTMLInputElement).labels?.length);
    expect(unlabelled.length).toBe(0);
  });

  it('should offer a retry instead of an empty list when loading fails', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/users`).error(new ErrorEvent('Network error'));
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Failed to load users.');
    expect(text).not.toContain('No users');
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

