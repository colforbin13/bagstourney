// src/app/shared/services/auth.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService, AuthenticatedUser } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  const user: AuthenticatedUser = { id: 1, username: 'organizer1', email: 'organizer1@example.com', role: 'organizer' };
  // Header/payload only need to decode; signature is never verified client-side.
  const fakeToken = 'x.' + btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })) + '.y';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService, provideRouter([])],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should expose the account plan from the login response', () => {
    service.login('organizer1', 'password12345').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: fakeToken, user: { ...user, plan: 'paid' } });

    expect(service.isPaidPlan()).toBe(true);
  });

  it('should treat a free plan as not paid', () => {
    service.login('organizer1', 'password12345').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ token: fakeToken, user: { ...user, plan: 'free' } });

    expect(service.isPaidPlan()).toBe(false);
  });

  it('should treat a profile with no plan as not paid', () => {
    // A session cached before the field existed. Under-promising is safe here; the server
    // gates every paid feature regardless of what the UI believes.
    service.login('organizer1', 'password12345').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: fakeToken, user });

    expect(service.isPaidPlan()).toBe(false);
  });

  it('should store the session on successful login', () => {
    service.login('organizer1', 'password12345').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush({ token: fakeToken, user });

    expect(service.isLoggedIn()).toBe(true);
    expect(service.user()).toEqual(user);
    expect(localStorage.getItem('bb_token')).toBe(fakeToken);
  });

  it('should not store a session on register — the account is unverified and cannot authenticate yet', () => {
    service.register('newuser', 'newuser@example.com', 'password12345').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'password12345',
    });
    req.flush({ message: 'Account created. Check your email to verify your address before signing in.' });

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('bb_token')).toBeNull();
  });

  it('should clear the session on logout', () => {
    service.login('organizer1', 'password12345').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: fakeToken, user });
    expect(service.isLoggedIn()).toBe(true);

    service.logout('/');

    expect(service.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('bb_token')).toBeNull();
  });
});
