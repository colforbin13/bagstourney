// src/app/admin/profile.component.ts
import { Component } from '@angular/core';
import { AuthService } from '../shared/services/auth.service';
import { ChangePasswordComponent } from './change-password.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ChangePasswordComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Your Profile</h1>
      </div>

      <div class="card" style="margin-bottom:24px">
        <div class="section-label">Account Details</div>
        <div class="detail-row">
          <span class="detail-label">Username</span>
          <span class="detail-value">{{ auth.user()?.username ?? '—' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Email</span>
          <span class="detail-value">{{ auth.user()?.email ?? '—' }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Role</span>
          <span class="detail-value">{{ auth.user()?.role === 'super_admin' ? 'Super Admin' : 'Organizer' }}</span>
        </div>
      </div>

      <app-change-password></app-change-password>
    </div>
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
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.9rem;
      &:last-child { border-bottom: none; }
    }
    .detail-label { color: var(--text-dim); }
    .detail-value { font-weight: 500; }
  `]
})
export class ProfileComponent {
  constructor(public auth: AuthService) {}
}
