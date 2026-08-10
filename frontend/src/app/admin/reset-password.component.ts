// src/app/admin/reset-password.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-header">
          <span class="login-icon">◈</span>
          <h1>Reset Password</h1>
        </div>

        @if (success()) {
          <div class="login-success">{{ success() }}</div>
          <a class="register-link" routerLink="/admin/login">Return to sign in</a>
        } @else {
          <div class="form-group">
            <label class="label">Reset token</label>
            <input class="input" type="text" [(ngModel)]="token"
              placeholder="Paste the token you were given" [disabled]="loading()" />
          </div>

          <div class="form-group">
            <label class="label">New password</label>
            <input class="input" type="password" [(ngModel)]="newPassword"
              placeholder="Enter new password (12+ characters)" [disabled]="loading()" />
          </div>

          <div class="form-group">
            <label class="label">Confirm new password</label>
            <input class="input" type="password" [(ngModel)]="confirmPassword"
              placeholder="Confirm new password" [disabled]="loading()"
              (keyup.enter)="resetPassword()" />
          </div>

          @if (error()) {
            <div class="login-error">{{ error() }}</div>
          }

          <button class="btn btn-primary" style="width:100%"
            [disabled]="loading()" (click)="resetPassword()">
            @if (loading()) {
              <span class="spinner" style="width:14px;height:14px;border-width:2px"></span>
              Resetting…
            } @else {
              Reset password
            }
          </button>
          <a class="register-link" routerLink="/admin/login">Back to sign in</a>
        }
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
      background: rgba(var(--danger-rgb), 0.1);
      border: 1px solid rgba(var(--danger-rgb), 0.35);
      border-radius: var(--radius);
      padding: 8px 12px;
    }
    .login-success {
      font-size: 0.85rem;
      color: var(--text);
      background: rgba(var(--marker-rgb), 0.1);
      border: 1px solid rgba(var(--marker-rgb), 0.35);
      border-radius: var(--radius);
      padding: 10px 12px;
    }
    .register-link { color: var(--accent); font-size: .8rem; text-align: center; }
  `]
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  newPassword = '';
  confirmPassword = '';
  loading = signal(false);
  error = signal('');
  success = signal('');

  constructor(private svc: TournamentService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    const tokenParam = this.route.snapshot.queryParamMap.get('token');
    if (tokenParam) this.token = tokenParam;
  }

  resetPassword() {
    this.error.set('');

    if (!this.token || !this.newPassword || !this.confirmPassword) {
      this.error.set('All fields are required.');
      return;
    }

    if (this.newPassword.length < 12) {
      this.error.set('New password must be at least 12 characters.');
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.loading.set(true);
    this.svc.resetPasswordWithToken(this.token, this.newPassword).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('Password reset. You can now sign in with your new password.');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'Failed to reset password.');
      },
    });
  }
}
