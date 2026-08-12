// src/app/admin/verify-email.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-header">
          <span class="login-icon">◈</span>
          <h1>Verify Email</h1>
        </div>

        @if (loading()) {
          <div class="login-status">Verifying…</div>
        } @else if (success()) {
          <div class="login-success">{{ success() }}</div>
        } @else if (error()) {
          <div class="login-error">{{ error() }}</div>
        }
        <a class="register-link" routerLink="/admin/login">Back to sign in</a>
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
    .login-status { font-size: 0.85rem; color: var(--text-dim); }
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
export class VerifyEmailComponent implements OnInit {
  loading = signal(true);
  error = signal('');
  success = signal('');

  constructor(private svc: TournamentService, private route: ActivatedRoute) {}

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!token) {
      this.loading.set(false);
      this.error.set('This verification link is missing required information.');
      return;
    }

    this.svc.verifyEmail(token).subscribe({
      next: result => {
        this.loading.set(false);
        this.success.set(result.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'Failed to verify email.');
      },
    });
  }
}
