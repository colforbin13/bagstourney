// src/app/shared/services/auth.interceptor.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        Router,
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('attaches the Authorization header when a token is present', () => {
    spyOn(authService, 'token').and.returnValue('abc123');

    http.get('/api/tournaments').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/tournaments');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc123');
    req.flush(null);
  });

  it('does not attach an Authorization header when no token is present', () => {
    spyOn(authService, 'token').and.returnValue(null);

    http.get('/api/tournaments').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/tournaments');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(null);
  });

  it('forces logout and sets a session-expired message on a 401 from a protected endpoint', () => {
    spyOn(authService, 'token').and.returnValue('abc123');
    spyOn(authService, 'logout');

    http.get('/api/tournaments').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/tournaments');
    req.flush({ error: 'Invalid or expired token' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).toHaveBeenCalledWith('/admin/login');
    expect(localStorage.getItem('bb_session_msg')).toBe('Session expired — please sign in again.');
  });

  it('does not force logout on a 401 from /auth/login (wrong credentials)', () => {
    spyOn(authService, 'token').and.returnValue(null);
    spyOn(authService, 'logout');

    http.post('/api/auth/login', { username: 'x', password: 'wrong' }).subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ error: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(localStorage.getItem('bb_session_msg')).toBeNull();
  });

  it('does not force logout on a 401 from /auth/change-password (wrong current password)', () => {
    spyOn(authService, 'token').and.returnValue('abc123');
    spyOn(authService, 'logout');

    http.post('/api/auth/change-password', {}).subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/auth/change-password');
    req.flush({ error: 'Current password is incorrect' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(localStorage.getItem('bb_session_msg')).toBeNull();
  });
});
