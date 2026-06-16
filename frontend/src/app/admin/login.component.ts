// src/app/admin/login.component.ts
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-header">
          <span class="login-icon">◈</span>
          <h1>Admin Sign In</h1>
        </div>

        <div class="form-group">
          <label class="label">Username</label>
          <input class="input" type="text" [(ngModel)]="username"
            placeholder="admin" autocomplete="username"
            (keyup.enter)="login()" />
        </div>

        <div class="form-group">
          <label class="label">Password</label>
          <input class="input" type="password" [(ngModel)]="password"
            placeholder="••••••••" autocomplete="current-password"
            (keyup.enter)="login()" />
        </div>

        @if (error()) {
          <div class="login-error">{{ error() }}</div>
        }

        <button class="btn btn-primary" style="width:100%"
          [disabled]="loading()" (click)="login()">
          @if (loading()) {
            <span class="spinner" style="width:14px;height:14px;border-width:2px"></span>
            Signing in…
          } @else {
            Sign in
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .login-wrap {
      min-height: calc(100dvh - 52px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .login-card {
      width: 100%;
      max-width: 360px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .login-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
      h1 { font-size: 1.1rem; font-weight: 600; }
    }
    .login-icon { color: var(--accent); font-size: 1.2rem; }
    .label { display: block; font-size: 0.8rem; color: var(--text-dim); margin-bottom: 6px; }
    .form-group { display: flex; flex-direction: column; }
    .login-error {
      font-size: 0.8rem;
      color: var(--danger);
      background: #1a0000;
      border: 1px solid #330000;
      border-radius: var(--radius);
      padding: 8px 12px;
    }
  `]
})
export class LoginComponent {
  username = '';
  password = '';
  loading = signal(false);
  error = signal('');
  toast = signal('');
  constructor(private auth: AuthService, private router: Router) {
    // If redirected due to session expiry, show a toast once
    try {
      const msg = localStorage.getItem('bb_session_msg');
      if (msg) {
        this.toast.set(msg);
        localStorage.removeItem('bb_session_msg');
        setTimeout(() => this.toast.set(''), 3500);
      }
    } catch (e) {}
  }
  login() {
    if (!this.username || !this.password) { this.error.set('Enter username and password.'); return; }
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.username, this.password).subscribe({
      next: () => this.router.navigate(['/admin']),
      error: () => { this.loading.set(false); this.error.set('Invalid credentials.'); },
    });
  }
}
