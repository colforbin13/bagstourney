// src/app/admin/deleted-tournaments.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament } from '../shared/models/tournament.models';
import { confirmService } from '../shared/services/confirm.service';

@Component({
  selector: 'app-deleted-tournaments',
  standalone: true,
  template: `
    <div class="page-table">
      <div class="page-header">
        <h1>Deleted tournaments</h1>
      </div>

      @if (loading()) {
        <div class="empty"><span class="spinner" role="status" aria-label="Loading deleted tournaments"></span></div>
      } @else if (error()) {
        <div class="error-banner deleted-error" role="alert">
          {{ error() }}
          <button type="button" class="btn btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (tournaments().length === 0) {
        <div class="empty">No deleted tournaments.</div>
      } @else {
        <section class="deleted-list" aria-labelledby="deleted-heading">
          <h2 id="deleted-heading" class="list-heading">
            Can be restored <span class="count">{{ tournaments().length }}</span>
          </h2>
          <ul>
            @for (t of tournaments(); track t.id) {
              <li class="list-row">
                <div class="list-row-main">
                  <span class="list-row-name">{{ t.name }}</span>
                  <span class="list-row-meta">Deleted {{ formatDate(t.deleted_at) }}</span>
                </div>
                <button type="button" class="btn btn-sm" [disabled]="restoringId() === t.id"
                  [attr.aria-label]="'Restore ' + t.name" (click)="restore(t)">
                  @if (restoringId() === t.id) {
                    <span class="spinner spinner-sm" aria-hidden="true"></span> Restoring
                  } @else {
                    Restore
                  }
                </button>
              </li>
            }
          </ul>
        </section>
      }

      <div class="sr-only" role="status">{{ toast() }}</div>
      @if (toast()) {
        <div class="toast" aria-hidden="true" [class.toast-success]="toastType() === 'success'" [class.toast-error]="toastType() === 'error'">{{ toast() }}</div>
      }
    </div>
  `,
  styles: [`
    /* A list of names reads best at the working column's width, aligned to the header's
       gutter like the other admin screens. */
    .deleted-list { max-width: 760px; }
    .list-heading {
      display: flex;
      align-items: baseline;
      gap: 8px;
      font-size: 0.85rem;
      font-weight: 800;
      font-stretch: 100%;
      letter-spacing: 0;
      padding-bottom: 6px;
      border-bottom: 2px solid var(--text);
      margin: 0;
    }
    .count { font-weight: 600; color: var(--text-dim); }
    ul { list-style: none; margin: 0; padding: 0; }
    .list-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 56px;
      padding: 14px 4px;
      border-bottom: 1px solid var(--border);
    }
    .list-row-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .list-row-name { font-weight: 700; overflow-wrap: anywhere; }
    .list-row-meta { font-size: 0.8rem; color: var(--text-dim); }
    .deleted-error { max-width: 760px; }
  `]
})
export class DeletedTournamentsComponent implements OnInit {
  tournaments = signal<Tournament[]>([]);
  loading = signal(true);
  error = signal('');
  restoringId = signal<number | null>(null);
  toast = signal('');
  toastType = signal<'success' | 'error'>('success');

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private svc: TournamentService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.svc.getDeletedTournaments().subscribe({
      next: data => { this.tournaments.set(data); this.loading.set(false); },
      // Saying "No deleted tournaments" here would be untrue, and would hide a tournament
      // someone is trying to get back.
      error: () => { this.error.set('Could not load deleted tournaments.'); this.loading.set(false); },
    });
  }

  async restore(t: Tournament) {
    const ok = await confirmService.confirm(`Restore "${t.name}"? It will come back as a private tournament — make it public again from its management page if you want that.`);
    if (!ok) return;

    this.restoringId.set(t.id);
    this.svc.restoreTournament(t.id).subscribe({
      next: () => {
        this.restoringId.set(null);
        this.tournaments.update(list => list.filter(x => x.id !== t.id));
        this.showToast(`"${t.name}" restored.`, 'success');
      },
      error: err => {
        this.restoringId.set(null);
        this.showToast(err?.error?.error ?? `Could not restore "${t.name}". Try again.`, 'error');
      },
    });
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private showToast(msg: string, type: 'success' | 'error') {
    this.toast.set(msg);
    this.toastType.set(type);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3500);
  }
}
