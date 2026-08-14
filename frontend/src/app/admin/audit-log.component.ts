// src/app/admin/audit-log.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';
import { AuditLogEntry } from '../shared/models/tournament.models';

type SortKey = 'created_at' | 'action' | 'actor' | 'tournament';

// Every action string writeAuditLog() is ever called with (api/middleware/auth.php),
// enumerated by hand since it's a small, stable, code-defined set — not worth a round
// trip to the API just to populate a filter dropdown.
const KNOWN_ACTIONS = [
  'match_score_corrected',
  'match_score_recorded',
  'organizer_email_verified',
  'participant_approved',
  'participant_notification_confirmed',
  'participant_notification_email_cleared',
  'participant_notification_email_set',
  'participant_notification_preferences_updated',
  'participant_notification_suppressed',
  'participant_notification_unsubscribed',
  'participant_self_registered',
  'password_reset_completed',
  'password_reset_initiated',
  'tournament_created',
  'tournament_deleted',
  'tournament_member_granted',
  'tournament_member_removed',
  'tournament_member_updated',
  'tournament_ownership_transferred',
  'tournament_restored',
  'tournament_updated',
  'user_account_created',
  'user_account_updated',
  'user_password_changed',
].sort();

const PAGE_SIZES = [25, 50, 100, 200];

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-wide">
      <div class="page-header">
        <h1>Audit Log</h1>
      </div>

      <div class="card filters">
        <input class="input" style="flex:2;min-width:200px"
          [ngModel]="search()" (ngModelChange)="onSearchInput($event)"
          placeholder="Search action, actor, tournament, target, details…" />
        <select class="input" style="flex:1;min-width:160px" [ngModel]="actionFilter()" (ngModelChange)="onActionFilterChange($event)">
          <option value="">All actions</option>
          @for (a of actions; track a) { <option [value]="a">{{ a }}</option> }
        </select>
        <select class="input" style="flex:none;width:auto" [ngModel]="pageSize()" (ngModelChange)="onPageSizeChange($event)">
          @for (size of pageSizes; track size) { <option [ngValue]="size">{{ size }} / page</option> }
        </select>
      </div>

      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (error()) {
        <div class="empty">{{ error() }}</div>
      } @else if (entries().length === 0) {
        <div class="empty">No matching audit log entries.</div>
      } @else {
        <div class="table-container">
          <table class="audit-table">
            <thead>
              <tr>
                <th class="sortable" (click)="setSort('created_at')">Time{{ sortIndicator('created_at') }}</th>
                <th class="sortable" (click)="setSort('action')">Action{{ sortIndicator('action') }}</th>
                <th class="sortable" (click)="setSort('actor')">Actor{{ sortIndicator('actor') }}</th>
                <th class="sortable" (click)="setSort('tournament')">Tournament{{ sortIndicator('tournament') }}</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              @for (e of entries(); track e.id) {
                <tr>
                  <td class="time">{{ formatTimestamp(e.created_at) }}</td>
                  <td><code class="action-code">{{ e.action }}</code></td>
                  <td>
                    @if (e.actor_username || e.actor_email) {
                      <div class="actor">
                        <span>{{ e.actor_username ?? e.actor_email }}</span>
                        @if (e.actor_username && e.actor_email) { <span class="dim">{{ e.actor_email }}</span> }
                      </div>
                    } @else {
                      <span class="dim">—</span>
                    }
                  </td>
                  <td>
                    @if (e.tournament_id && e.tournament_name) {
                      <a [routerLink]="['/admin/tournament', e.tournament_id]">{{ e.tournament_name }}</a>
                    } @else {
                      <span class="dim">—</span>
                    }
                  </td>
                  <td class="dim">
                    @if (e.target_type) { {{ e.target_type }} · {{ e.target_id }} } @else { — }
                  </td>
                  <td class="details">{{ formatDetails(e.details) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <span class="dim">{{ total() }} total — page {{ page() }} of {{ totalPages() }}</span>
          <div class="pagination-buttons">
            <button class="btn btn-sm" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">Previous</button>
            <button class="btn btn-sm" [disabled]="page() >= totalPages()" (click)="goToPage(page() + 1)">Next</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 2rem; }

    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }

    .table-container { overflow-x: auto; }
    .audit-table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 0.85rem;
    }
    .audit-table th {
      background: var(--bg);
      border-bottom: 2px solid var(--border);
      padding: 10px 12px;
      text-align: left;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-dim);
      white-space: nowrap;
    }
    .audit-table th.sortable { cursor: pointer; user-select: none; &:hover { color: var(--text); } }
    .audit-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .audit-table tbody tr:hover { background-color: var(--surface-2); }

    .time { white-space: nowrap; font-family: var(--mono); font-size: 0.78rem; }
    .action-code {
      font-family: var(--mono);
      font-size: 0.78rem;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 6px;
      white-space: nowrap;
    }
    .actor { display: flex; flex-direction: column; gap: 1px; }
    .dim { color: var(--text-dim); font-size: 0.8rem; }
    .details {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--text-dim);
      max-width: 320px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    .pagination-buttons { display: flex; gap: 8px; }

    .empty { text-align: center; padding: 48px 24px; color: var(--text-dim); }
  `]
})
export class AuditLogComponent implements OnInit {
  entries = signal<AuditLogEntry[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(50);
  sortKey = signal<SortKey>('created_at');
  sortDir = signal<'asc' | 'desc'>('desc');
  search = signal('');
  actionFilter = signal('');
  loading = signal(true);
  error = signal('');

  readonly actions = KNOWN_ACTIONS;
  readonly pageSizes = PAGE_SIZES;

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(private svc: TournamentService) {}

  ngOnInit() {
    this.load();
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / this.pageSize()));
  }

  onSearchInput(value: string) {
    this.search.set(value);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 400);
  }

  onActionFilterChange(value: string) {
    this.actionFilter.set(value);
    this.page.set(1);
    this.load();
  }

  onPageSizeChange(value: number) {
    this.pageSize.set(value);
    this.page.set(1);
    this.load();
  }

  setSort(key: SortKey) {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'created_at' ? 'desc' : 'asc');
    }
    this.load();
  }

  sortIndicator(key: SortKey): string {
    if (this.sortKey() !== key) return '';
    return this.sortDir() === 'asc' ? ' ▲' : ' ▼';
  }

  goToPage(page: number) {
    this.page.set(page);
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.svc.getAuditLog({
      page: this.page(),
      page_size: this.pageSize(),
      sort: this.sortKey(),
      dir: this.sortDir(),
      search: this.search(),
      action: this.actionFilter(),
    }).subscribe({
      next: res => {
        this.entries.set(res.rows);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load audit log.');
        this.loading.set(false);
      },
    });
  }

  formatTimestamp(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  formatDetails(details: Record<string, unknown> | null): string {
    if (!details) return '—';
    const entries = Object.entries(details);
    if (entries.length === 0) return '—';
    return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  }
}
