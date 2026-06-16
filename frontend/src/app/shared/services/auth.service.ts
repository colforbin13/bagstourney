// src/app/shared/services/auth.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _token = signal<string | null>(localStorage.getItem('bb_token'));
  private _username = signal<string | null>(localStorage.getItem('bb_user'));

  readonly isLoggedIn = computed(() => !!this._token());
  readonly username = computed(() => this._username());
  readonly token = computed(() => this._token());

  constructor(private http: HttpClient, private router: Router) {}

  login(username: string, password: string) {
    return this.http.post<{ token: string; username: string }>(
      `${environment.apiUrl}/auth/login`,
      { username, password }
    ).pipe(
      tap(res => {
        this._token.set(res.token);
        this._username.set(res.username);
        localStorage.setItem('bb_token', res.token);
        localStorage.setItem('bb_user', res.username);
      })
    );
  }

  logout(redirect: string = '/') {
    this._token.set(null);
    this._username.set(null);
    localStorage.removeItem('bb_token');
    localStorage.removeItem('bb_user');
    this.router.navigate([redirect]);
  }
}
