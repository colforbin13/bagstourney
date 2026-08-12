// src/app/admin/deleted-tournaments.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament } from '../shared/models/tournament.models';
import { confirmService } from '../shared/services/confirm.service';

@Component({
  selector: 'app-deleted-tournaments',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <a routerLink="/admin" style="color:var(--text-dim);font-size:.8rem;">← Admin</a>
        <h1 style="margin-top:4px;">Deleted Tournaments</h1>
      </div>

      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (tournaments().length === 0) {
        <div class="empty">No deleted tournaments.</div>
      } @else {
        <div class="list">
          @for (t of tournaments(); track t.id) {
            <div class="list-item">
              <div class="list-item-main">
                <span class="list-item-name">{{ t.name }}</span>
                <span class="deleted-at">Deleted {{ formatDate(t.deleted_at) }}</span>
              </div>
              <button class="btn btn-sm btn-primary" [disabled]="restoringId() === t.id" (click)="restore(t)">
                @if (restoringId() === t.id) {
                  <span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>
                } @else {
                  Restore
                }
              </button>
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
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 2rem; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .list-item-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .list-item-name { font-weight: 500; }
    .deleted-at { font-size: 0.8rem; color: var(--text-dim); }
    .empty { text-align: center; padding: 48px 24px; color: var(--text-dim); }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 24px;
      padding: 12px 16px;
      border-radius: var(--radius);
      font-size: 0.9rem;
      background: var(--marker);
      color: var(--marker-ink);
    }
  `]
})
export class DeletedTournamentsComponent implements OnInit {
  tournaments = signal<Tournament[]>([]);
  loading = signal(true);
  restoringId = signal<number | null>(null);
  toast = signal('');

  constructor(private svc: TournamentService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.getDeletedTournaments().subscribe({
      next: data => { this.tournaments.set(data); this.loading.set(false); },
      error: () => { this.loading.set(false); },
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
        this.showToast(`"${t.name}" restored.`);
      },
      error: () => { this.restoringId.set(null); },
    });
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
