// src/app/admin/admin-dashboard.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament } from '../shared/models/tournament.models';
import { confirmService } from '../shared/services/confirm.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Admin</h1>
      </div>

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

  constructor(private svc: TournamentService) {}

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
