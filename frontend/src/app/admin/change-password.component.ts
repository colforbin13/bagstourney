// src/app/admin/change-password.component.ts
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="card" style="margin-bottom:24px">
      <div class="section-label">Change Password</div>
      <div style="max-width: 400px;">
        <div class="form-group">
          <label>Current Password</label>
          <input 
            class="input" 
            type="password" 
            [(ngModel)]="currentPassword" 
            placeholder="Enter current password"
            [disabled]="loading()"
          />
        </div>

        <div class="form-group">
          <label>New Password</label>
          <input 
            class="input" 
            type="password" 
            [(ngModel)]="newPassword" 
            placeholder="Enter new password (12+ characters)"
            [disabled]="loading()"
          />
        </div>

        <div class="form-group">
          <label>Confirm New Password</label>
          <input 
            class="input" 
            type="password" 
            [(ngModel)]="confirmPassword" 
            placeholder="Confirm new password"
            [disabled]="loading()"
          />
        </div>

        <button 
          class="btn btn-primary" 
          [disabled]="loading()"
          (click)="changePassword()">
          @if (loading()) { 
            <span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span> 
          } @else {
            Change Password
          }
        </button>

        @if (error()) {
          <div class="form-error">{{ error() }}</div>
        }
      </div>
    </div>

    @if (success()) {
      <div class="toast toast-success">{{ success() }}</div>
    }
  `,
  styles: [`
    .section-label {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 10px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-size: 0.85rem;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--text);
    }
    .input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg);
      color: var(--text);
      font-size: 0.9rem;
      
      &:disabled { opacity: 0.5; cursor: not-allowed; }
      &:focus { outline: none; border-color: var(--accent); }
    }
    .btn {
      padding: 8px 16px;
      font-size: 0.85rem;
    }
    .form-error {
      font-size: 0.8rem;
      color: var(--danger);
      margin-top: 8px;
      padding: 8px;
      background: rgba(var(--danger-rgb), 0.1);
      border-radius: 4px;
    }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 24px;
      padding: 12px 16px;
      border-radius: var(--radius);
      font-size: 0.9rem;
      background: var(--marker);
      color: var(--marker-ink);
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `]
})
export class ChangePasswordComponent {
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  loading = signal(false);
  error = signal('');
  success = signal('');

  constructor(private svc: TournamentService) {}

  changePassword() {
    this.error.set('');
    this.success.set('');

    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
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
    this.svc.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: () => {
        this.loading.set(false);
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
        this.success.set('Password changed successfully!');
        setTimeout(() => this.success.set(''), 2500);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'Failed to change password.');
      },
    });
  }
}
