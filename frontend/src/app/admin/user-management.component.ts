// src/app/admin/user-management.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { confirmService } from '../shared/services/confirm.service';
import { UserAccount } from '../shared/models/tournament.models';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-wide">
      <div class="page-header">
        <h1>User Management</h1>
      </div>

      <div class="card" style="margin-bottom:24px">
        <div class="section-label">Create User</div>
        <div class="row create-user-row">
          <input class="input" [(ngModel)]="newUserUsername" placeholder="Username" />
          <input class="input" type="email" [(ngModel)]="newUserEmail" placeholder="Email" />
          <input class="input" type="password" [(ngModel)]="newUserPassword" placeholder="Password (12+ chars)" />
          <select class="input" [(ngModel)]="newUserRole">
            <option value="organizer">Organizer</option>
            <option value="super_admin">Super admin</option>
          </select>
          <button class="btn btn-primary" [disabled]="creatingUser()" (click)="createUser()">
            @if (creatingUser()) { <span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span> }
            Create user
          </button>
        </div>
        @if (createUserError()) { <div class="form-error">{{ createUserError() }}</div> }
      </div>

      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (users().length === 0) {
        <div class="empty">No users found.</div>
      } @else {
        <div class="table-container">
          <table class="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr [class.disabled]="user.status === 'disabled'">
                  <td class="username">{{ user.username }}</td>
                  <td class="email">{{ user.email }}</td>
                  <td class="role">
                    <select 
                      [value]="user.role" 
                      (change)="changeRole(user, $event)"
                      [disabled]="isUpdating(user.id)"
                      class="role-select">
                      <option value="organizer">Organizer</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </td>
                  <td class="status">
                    <span class="badge" [class.badge-active]="user.status === 'active'" [class.badge-disabled]="user.status === 'disabled'">
                      {{ user.status }}
                    </span>
                  </td>
                  <td class="created">{{ formatDate(user.created_at) }}</td>
                  <td class="actions">
                    <button 
                      class="btn btn-sm" 
                      title="Reset password"
                      [disabled]="isUpdating(user.id)"
                      (click)="resetPassword(user)">
                      @if (isUpdating(user.id)) {
                        <span class="spinner" style="width:10px;height:10px;border-width:1px"></span>
                      } @else {
                        Reset
                      }
                    </button>
                    <button 
                      class="btn btn-sm" 
                      [class.btn-danger]="user.status === 'active'"
                      [disabled]="isUpdating(user.id)"
                      (click)="toggleStatus(user)">
                      @if (isUpdating(user.id)) {
                        <span class="spinner" style="width:10px;height:10px;border-width:1px"></span>
                      } @else {
                        {{ user.status === 'active' ? 'Disable' : 'Enable' }}
                      }
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (toast()) {
        <div class="toast" [class.toast-success]="toastType() === 'success'" [class.toast-error]="toastType() === 'error'">
          {{ toast() }}
        </div>
      }

      @if (error()) {
        <div class="form-error">{{ error() }}</div>
      }
    </div>
  `,
  styles: [`
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 2rem; }

    .section-label {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 10px;
    }
    .row { display: flex; gap: 8px; }
    .create-user-row { flex-wrap: wrap; }
    .create-user-row .input { flex: 1 1 160px; min-width: 140px; }

    .table-container { overflow-x: auto; }
    .users-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    
    .users-table th {
      background: var(--bg);
      border-bottom: 2px solid var(--border);
      padding: 12px 16px;
      text-align: left;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
    }
    
    .users-table td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }
    
    .users-table tbody tr {
      transition: background-color 0.2s;
      &:hover { background-color: rgba(255, 255, 255, 0.02); }
      &.disabled { opacity: 0.6; }
    }
    
    .username { font-weight: 500; }
    .email { font-size: 0.9rem; color: var(--text-dim); }
    
    .role-select {
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg);
      color: var(--text);
      font-size: 0.9rem;
      cursor: pointer;
      
      &:hover { border-color: var(--accent); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
    
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      
      &.badge-active { background: rgba(34, 197, 94, 0.15); color: rgb(34, 197, 94); }
      &.badge-disabled { background: rgba(239, 68, 68, 0.15); color: rgb(239, 68, 68); }
    }
    
    .created { font-size: 0.9rem; color: var(--text-dim); }
    
    .actions { text-align: right; }
    .btn { padding: 6px 12px; font-size: 0.85rem; }
    .btn-danger { color: rgb(239, 68, 68); border-color: rgb(239, 68, 68); }
    
    .form-error { 
      color: var(--danger); 
      font-size: 0.85rem; 
      margin-top: 16px;
      padding: 12px;
      background: rgba(239, 68, 68, 0.1);
      border-radius: var(--radius);
    }
    
    .empty {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-dim);
    }
    
    .toast {
      position: fixed;
      bottom: 24px;
      left: 24px;
      padding: 12px 16px;
      border-radius: var(--radius);
      font-size: 0.9rem;
      animation: slideIn 0.3s ease-out;
      
      &.toast-success { background: rgba(34, 197, 94, 0.9); color: white; }
      &.toast-error { background: rgba(239, 68, 68, 0.9); color: white; }
    }
    
    @keyframes slideIn {
      from { transform: translateX(-100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `]
})
export class UserManagementComponent implements OnInit {
  users = signal<UserAccount[]>([]);
  loading = signal(true);
  error = signal('');
  toast = signal('');
  toastType = signal<'success' | 'error'>('success');
  updatingUserIds = signal<number[]>([]);

  newUserUsername = '';
  newUserEmail = '';
  newUserPassword = '';
  newUserRole: 'organizer' | 'super_admin' = 'organizer';
  creatingUser = signal(false);
  createUserError = signal('');

  constructor(private svc: TournamentService) {}

  ngOnInit() { this.load(); }

  createUser() {
    if (!this.newUserUsername.trim() || !this.newUserEmail.trim() || this.newUserPassword.length < 12) {
      this.createUserError.set('Enter a username, valid email, and password of at least 12 characters.');
      return;
    }
    this.creatingUser.set(true);
    this.createUserError.set('');
    this.svc.createUser({
      username: this.newUserUsername.trim(), email: this.newUserEmail.trim(),
      password: this.newUserPassword, role: this.newUserRole,
    }).subscribe({
      next: user => {
        this.newUserUsername = ''; this.newUserEmail = ''; this.newUserPassword = ''; this.newUserRole = 'organizer';
        this.creatingUser.set(false);
        this.users.update(list => [user, ...list]);
        this.showToast('User created.', 'success');
      },
      error: err => {
        this.creatingUser.set(false);
        this.createUserError.set(err?.error?.error ?? 'Failed to create user.');
      },
    });
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.svc.getUsers().subscribe({
      next: data => {
        this.users.set(data);
        this.loading.set(false);
      },
      error: err => {
        this.error.set('Failed to load users.');
        this.loading.set(false);
      },
    });
  }

  isUpdating(userId: number): boolean {
    return this.updatingUserIds().includes(userId);
  }

  async changeRole(user: UserAccount, event: Event) {
    const target = event.target as HTMLSelectElement;
    const newRole = target.value as 'organizer' | 'super_admin';
    if (newRole === user.role) return;

    // Prevent demoting the last active super admin (check will be done by backend)
    if (user.role === 'super_admin' && newRole !== 'super_admin') {
      const confirm = await confirmService.confirm(
        `Demote ${user.username} from super admin to organizer? This action is audited.`
      );
      if (!confirm) {
        target.value = user.role;
        return;
      }
    }

    this.updateUser(user.id, { role: newRole });
  }

  async toggleStatus(user: UserAccount) {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    const action = newStatus === 'active' ? 'enable' : 'disable';

    // Prevent disabling the last active super admin (check will be done by backend)
    if (user.role === 'super_admin' && newStatus !== 'active') {
      const confirm = await confirmService.confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} super admin ${user.username}? This action is audited.`
      );
      if (!confirm) return;
    }

    this.updateUser(user.id, { status: newStatus });
  }

  async resetPassword(user: UserAccount) {
    const confirm = await confirmService.confirm(
      `Generate a password reset token for ${user.username}? They will need this token to set a new password.`
    );
    if (!confirm) return;

    this.updatingUserIds.update(ids => [...ids, user.id]);
    this.svc.resetUserPassword(user.id).subscribe({
      next: result => {
        this.updatingUserIds.update(ids => ids.filter(id => id !== user.id));
        // Copy token to clipboard for easy sharing
        navigator.clipboard.writeText(result.token).then(() => {
          this.showToast('Reset token copied to clipboard (expires in 24 hours).', 'success');
        }).catch(() => {
          this.showToast(`Reset token: ${result.token}`, 'success');
        });
      },
      error: err => {
        this.updatingUserIds.update(ids => ids.filter(id => id !== user.id));
        const msg = err?.error?.error ?? 'Failed to generate reset token.';
        this.showToast(msg, 'error');
      },
    });
  }

  private updateUser(userId: number, data: { role?: 'organizer' | 'super_admin'; status?: 'active' | 'disabled' }) {
    this.updatingUserIds.update(ids => [...ids, userId]);
    this.svc.updateUser(userId, data).subscribe({
      next: updated => {
        this.users.update(list => list.map(u => u.id === userId ? updated : u));
        this.updatingUserIds.update(ids => ids.filter(id => id !== userId));
        this.showToast('User updated.', 'success');
      },
      error: err => {
        this.updatingUserIds.update(ids => ids.filter(id => id !== userId));
        const msg = err?.error?.error ?? 'Failed to update user.';
        this.showToast(msg, 'error');
      },
    });
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private showToast(msg: string, type: 'success' | 'error') {
    this.toast.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
