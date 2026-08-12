// src/app/shared/services/auth.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AuthenticatedUser {
  id: number;
  username: string | null;
  email: string | null;
  role: 'super_admin' | 'organizer';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token = signal<string | null>(localStorage.getItem('bb_token'));
  private _username = signal<string | null>(localStorage.getItem('bb_user'));
  private _user = signal<AuthenticatedUser | null>(this.readUser());

  readonly isLoggedIn = computed(() => !!this._token());
  readonly username = computed(() => this._username());
  readonly user = computed(() => this._user());
  readonly isSuperAdmin = computed(() => this._user()?.role === 'super_admin');
  readonly token = computed(() => this._token());

  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private http: HttpClient, private router: Router) {
    // A token can already be expired at load (tab reopened after JWT_EXPIRY elapsed), or
    // expire later while the tab stays open — either way, clear it proactively instead of
    // waiting for a rejected request so the nav never shows a stale "logged in" state.
    this.scheduleExpiryCheck(this._token());
  }

  login(username: string, password: string) {
    return this.http.post<{ token: string; user: AuthenticatedUser }>(
      `${environment.apiUrl}/auth/login`,
      { username, password }
    ).pipe(
      tap(res => this.storeSession(res))
    );
  }

  // Registration no longer logs the caller in immediately — the account is created
  // 'disabled' pending email verification (FEATURE_TRACKER item 9), and the backend
  // rejects any non-active user on every authenticated request, so storing a session
  // here would just produce a confusing forced logout on the very next API call.
  register(username: string, email: string, password: string) {
    return this.http.post<{ message: string }>(
      `${environment.apiUrl}/auth/register`,
      { username, email, password }
    );
  }

  logout(redirect: string = '/') {
    this.clearSession();
    this.router.navigate([redirect]);
  }

  private readUser(): AuthenticatedUser | null {
    try {
      const raw = localStorage.getItem('bb_user_profile');
      return raw ? JSON.parse(raw) as AuthenticatedUser : null;
    } catch {
      return null;
    }
  }

  private storeSession(res: { token: string; user: AuthenticatedUser }) {
    this._token.set(res.token);
    this._username.set(res.user.username ?? res.user.email);
    this._user.set(res.user);
    localStorage.setItem('bb_token', res.token);
    localStorage.setItem('bb_user', res.user.username ?? res.user.email ?? '');
    localStorage.setItem('bb_user_profile', JSON.stringify(res.user));
    this.scheduleExpiryCheck(res.token);
  }

  private clearSession(): void {
    if (this.expiryTimer !== null) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this._token.set(null);
    this._username.set(null);
    this._user.set(null);
    localStorage.removeItem('bb_token');
    localStorage.removeItem('bb_user');
    localStorage.removeItem('bb_user_profile');
  }

  // JWTs are signed HS256 (see api/middleware/auth.php) but that's irrelevant here — this
  // is a UX nicety, not an authorization check, so we just read the exp claim without
  // verifying the signature. The backend remains the real authorization boundary.
  private decodeExpiryMs(token: string): number | null {
    const payload = token.split('.')[1];
    if (!payload) return null;
    try {
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      const claims = JSON.parse(atob(padded));
      return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private scheduleExpiryCheck(token: string | null): void {
    if (this.expiryTimer !== null) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    if (!token) return;
    const expiryMs = this.decodeExpiryMs(token);
    if (expiryMs === null) return;
    const delay = expiryMs - Date.now();
    if (delay <= 0) {
      this.clearSession();
      return;
    }
    // JWT_EXPIRY is 8h, well within setTimeout's ~24.8-day max delay.
    this.expiryTimer = setTimeout(() => this.clearSession(), delay);
  }
}
