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

  constructor(private http: HttpClient, private router: Router) {}

  login(username: string, password: string) {
    return this.http.post<{ token: string; user: AuthenticatedUser }>(
      `${environment.apiUrl}/auth/login`,
      { username, password }
    ).pipe(
      tap(res => this.storeSession(res))
    );
  }

  register(username: string, email: string, password: string) {
    return this.http.post<{ token: string; user: AuthenticatedUser }>(
      `${environment.apiUrl}/auth/register`,
      { username, email, password }
    ).pipe(tap(res => this.storeSession(res)));
  }

  logout(redirect: string = '/') {
    this._token.set(null);
    this._username.set(null);
    this._user.set(null);
    localStorage.removeItem('bb_token');
    localStorage.removeItem('bb_user');
    localStorage.removeItem('bb_user_profile');
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
  }
}
