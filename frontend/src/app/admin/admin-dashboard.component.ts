// src/app/admin/admin-dashboard.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament, UserAccount } from '../shared/models/tournament.models';
import { AuthService } from '../shared/services/auth.service';
import { confirmService } from '../shared/services/confirm.service';
import { ChangePasswordComponent } from './change-password.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule, ChangePasswordComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Admin</h1>
      </div>

      @if (auth.isSuperAdmin()) {
        <div class="card" style="margin-bottom:24px">
          <div class="section-label">User Management</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <p style="margin: 0; color: var(--text-dim); font-size: 0.9rem;">Manage site users, roles, and account status</p>
            <a class="btn btn-primary" routerLink="/admin/users">Manage Users</a>
          </div>
        </div>
      }

      @if (auth.isSuperAdmin()) {
        <div class="card" style="margin-bottom:24px">
          <div class="section-label">Create user</div>
          <div class="row user-row">
            <input class="input" [(ngModel)]="newUserUsername" placeholder="Username" />
            <input class="input" type="email" [(ngModel)]="newUserEmail" placeholder="Email" />
            <input class="input" type="password" [(ngModel)]="newUserPassword" placeholder="Password (12+ chars)" />
            <select class="input" [(ngModel)]="newUserRole">
              <option value="organizer">Organizer</option>
              <option value="super_admin">Super admin</option>
            </select>
            <button class="btn btn-primary" [disabled]="creatingUser()" (click)="createUser()">Create user</button>
          </div>
          @if (userError()) { <div class="form-error">{{ userError() }}</div> }
        </div>
      }

      <!-- Change Password -->
      <app-change-password></app-change-password>

      <!-- New tournament -->
      <div class="card" style="margin-bottom:24px">
        <div class="section-label">New Tournament</div>
        <div class="row">
          <input class="input" type="text" [(ngModel)]="newName"
            placeholder="Tournament name"
            (keyup.enter)="create()" />
          <button class="btn btn-primary" [disabled]="creating()" (click)="create()">
            @if (creating()) { <span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span> }
            Create
          </button>
        </div>
        @if (createError()) {
          <div class="form-error">{{ createError() }}</div>
        }
      </div>

      <!-- Tournament list -->
      <div class="section-label">Tournaments</div>
      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (tournaments().length === 0) {
        <div class="empty">No tournaments yet.</div>
      } @else {
        <div class="list">
          @for (t of tournaments(); track t.id) {
            <div class="list-item">
              <div class="list-main">
                <a class="list-name" [routerLink]="['/admin/tournament', t.id]">{{ t.name }}</a>
                <span class="badge badge-{{ t.status }}">{{ t.status }}</span>
              </div>
              <div class="list-actions">
                <a class="btn btn-sm" [routerLink]="['/bracket', t.id]">View</a>
                <a class="btn btn-sm" [routerLink]="['/admin/tournament', t.id]">Manage</a>
                <button class="btn btn-sm btn-danger" (click)="delete(t)">Delete</button>
              </div>
            </div>
          }
        </div>
      }

      @if (toast()) {
        <div class="toast toast-success">{{ toast() }}</div>
      }
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
    .row { display: flex; gap: 8px; }
    .user-row { flex-wrap: wrap; }
    .user-row .input { flex: 1 1 160px; min-width: 140px; }
    .form-error { font-size: 0.8rem; color: var(--danger); margin-top: 8px; }
    .list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      flex-wrap: wrap;
    }
    .list-main { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
    .list-name {
      font-weight: 500;
      font-size: 0.9rem;
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      &:hover { color: var(--accent); }
    }
    .list-actions { display: flex; gap: 6px; flex-shrink: 0; }
  `]
})
export class AdminDashboardComponent implements OnInit {
  tournaments = signal<Tournament[]>([]);
  loading = signal(true);
  creating = signal(false);
  createError = signal('');
  toast = signal('');
  newName = '';

  newUserUsername = '';
  newUserEmail = '';
  newUserPassword = '';
  newUserRole: 'organizer' | 'super_admin' = 'organizer';
  creatingUser = signal(false);
  userError = signal('');

  constructor(private svc: TournamentService, public auth: AuthService) {}

  ngOnInit() { this.load(); }

  load() {
    this.svc.getTournaments().subscribe({
      next: data => { this.tournaments.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  create() {
    const name = this.newName.trim();
    if (!name) { this.createError.set('Enter a tournament name.'); return; }
    this.creating.set(true);
    this.createError.set('');
    this.svc.createTournament(name).subscribe({
      next: t => {
        this.newName = '';
        this.creating.set(false);
        this.tournaments.update(list => [t, ...list]);
        this.showToast('Tournament created!');
      },
      error: () => { this.creating.set(false); this.createError.set('Failed to create tournament.'); },
    });
  }

  createUser() {
    if (!this.newUserUsername.trim() || !this.newUserEmail.trim() || this.newUserPassword.length < 12) {
      this.userError.set('Enter a username, valid email, and password of at least 12 characters.');
      return;
    }
    this.creatingUser.set(true);
    this.userError.set('');
    this.svc.createUser({
      username: this.newUserUsername.trim(), email: this.newUserEmail.trim(),
      password: this.newUserPassword, role: this.newUserRole,
    }).subscribe({
      next: () => {
        this.newUserUsername = ''; this.newUserEmail = ''; this.newUserPassword = '';
        this.creatingUser.set(false); this.showToast('User created.');
      },
      error: err => { this.creatingUser.set(false); this.userError.set(err?.error?.error ?? 'Failed to create user.'); },
    });
  }

  async delete(t: Tournament) {
    const ok = await confirmService.confirm(`Delete "${t.name}"? This cannot be undone.`);
    if (!ok) return;
    this.svc.deleteTournament(t.id).subscribe({
      next: () => {
        this.tournaments.update(list => list.filter(x => x.id !== t.id));
        this.showToast('Deleted.');
      },
    });
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
