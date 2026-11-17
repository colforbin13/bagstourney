// src/app/admin/audit-log.component.ts
import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
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

/** "tournament_member_granted" → "Tournament member granted". */
export function humanize(code: string): string {
  const words = code.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-table">
      <div class="page-header">
        <h1>Audit log</h1>
      </div>

      <div class="filters" role="search">
        <label class="filter filter-search">
          <span class="field-label">Search</span>
          <input class="input" type="search"
            [ngModel]="search()" (ngModelChange)="onSearchInput($event)"
            placeholder="Action, person, tournament or details" />
        </label>
        <label class="filter filter-action">
          <span class="field-label">Action</span>
          <select class="input" [ngModel]="actionFilter()" (ngModelChange)="onActionFilterChange($event)">
            <option value="">All actions</option>
            @for (a of actions; track a) { <option [value]="a">{{ actionLabel(a) }}</option> }
          </select>
        </label>
        <label class="filter filter-size">
          <span class="field-label">Per page</span>
          <select class="input" [ngModel]="pageSize()" (ngModelChange)="onPageSizeChange($event)">
            @for (size of pageSizes; track size) { <option [ngValue]="size">{{ size }}</option> }
          </select>
        </label>
      </div>

      @if (loading() && !loaded()) {
        <div class="empty"><span class="spinner" role="status" aria-label="Loading audit log"></span></div>
      } @else if (error()) {
        <div class="error-banner" role="alert">
          {{ error() }}
          <button type="button" class="btn btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (entries().length === 0) {
        <div class="empty">No matching audit log entries.</div>
      } @else {
        <!-- Rows stay put while the next page or sort loads, dimmed, so nothing jumps. -->
        <div class="results" [class.is-refreshing]="loading()" [attr.aria-busy]="loading()">
          <div class="table-container">
            <table class="data-table audit-table">
              <thead>
                <tr>
                  @for (col of sortColumns; track col.key) {
                    <th scope="col" [attr.aria-sort]="ariaSort(col.key)">
                      <button type="button" class="sort-btn" (click)="setSort(col.key)">
                        {{ col.label }}
                        <ng-container *ngTemplateOutlet="sortIcon; context: { $implicit: col.key }"></ng-container>
                      </button>
                    </th>
                  }
                  <th scope="col">Target</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                @for (e of entries(); track e.id) {
                  <tr>
                    <td class="time">{{ formatTimestamp(e.created_at) }}</td>
                    <td class="action">{{ actionLabel(e.action) }}</td>
                    <td><ng-container *ngTemplateOutlet="actor; context: { $implicit: e }"></ng-container></td>
                    <td><ng-container *ngTemplateOutlet="tournament; context: { $implicit: e }"></ng-container></td>
                    <td class="dim nowrap">
                      @if (e.target_type) { {{ humanize(e.target_type) }} {{ e.target_id }} } @else { — }
                    </td>
                    <td class="details">{{ formatDetails(e.details) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Phones: one ruled row per entry instead of a table twice the screen's width. -->
          <ul class="entry-rows">
            @for (e of entries(); track e.id) {
              <li class="entry-row">
                <div class="entry-top">
                  <span class="action">{{ actionLabel(e.action) }}</span>
                  <span class="dim time">{{ formatTimestamp(e.created_at) }}</span>
                </div>
                <div><ng-container *ngTemplateOutlet="actor; context: { $implicit: e }"></ng-container></div>
                @if (e.tournament_id) {
                  <div><ng-container *ngTemplateOutlet="tournament; context: { $implicit: e }"></ng-container></div>
                }
                @if (e.details && formatDetails(e.details) !== '—') {
                  <div class="details">{{ formatDetails(e.details) }}</div>
                }
              </li>
            }
          </ul>
        </div>

        <nav class="pagination" aria-label="Audit log pages">
          <span class="dim">{{ total() }} entries · page {{ page() }} of {{ totalPages() }}</span>
          <div class="pagination-buttons">
            <button type="button" class="btn btn-sm" [disabled]="page() <= 1 || loading()" (click)="goToPage(page() - 1)">Previous</button>
            <button type="button" class="btn btn-sm" [disabled]="page() >= totalPages() || loading()" (click)="goToPage(page() + 1)">Next</button>
          </div>
        </nav>
      }

      <ng-template #sortIcon let-key>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
             [class.is-idle]="sortKey() !== key"
             [style.transform]="sortKey() === key && sortDir() === 'asc' ? 'rotate(180deg)' : null">
          <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>
        </svg>
      </ng-template>

      <ng-template #actor let-e>
        @if (e.actor_username || e.actor_email) {
          <div class="actor">
            <span>{{ e.actor_username ?? e.actor_email }}</span>
            @if (e.actor_username && e.actor_email) { <span class="dim">{{ e.actor_email }}</span> }
          </div>
        } @else {
          <span class="dim">—</span>
        }
      </ng-template>

      <ng-template #tournament let-e>
        @if (e.tournament_id && e.tournament_name) {
          @if (e.tournament_deleted_at) {
            <span>{{ e.tournament_name }}</span>
            <a class="deleted-link" routerLink="/admin/deleted-tournaments">deleted</a>
          } @else {
            <a [routerLink]="['/admin/tournament', e.tournament_id]">{{ e.tournament_name }}</a>
          }
        } @else {
          <span class="dim">—</span>
        }
      </ng-template>
    </div>
  `,
  styles: [`
    .filters {
      display: grid;
      grid-template-columns: minmax(200px, 2fr) minmax(180px, 1fr) auto;
      gap: 12px;
      margin-bottom: 24px;
      max-width: 960px;
    }
    .filter { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    @media (max-width: 640px) {
      .filters { grid-template-columns: 1fr auto; }
      .filter-search { grid-column: 1 / -1; }
    }

    /* Clears the sticky 52px header when a new page scrolls the rows back into view. */
    .results { transition: opacity .15s; scroll-margin-top: 68px; }
    .results.is-refreshing { opacity: .55; }

    .table-container { overflow-x: auto; }
    .audit-table td { vertical-align: top; }
    .time { white-space: nowrap; font-size: 0.8rem; }
    .action { font-weight: 600; }
    .actor { display: flex; flex-direction: column; gap: 1px; }
    .actor .dim { font-size: 0.8rem; overflow-wrap: anywhere; }
    .dim { color: var(--text-dim); }
    .nowrap { white-space: nowrap; }
    .details {
      font-size: 0.8rem;
      color: var(--text-dim);
      max-width: 320px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .deleted-link { margin-left: 6px; font-size: 0.8rem; color: var(--text-dim); }

    .sort-btn svg { transition: transform .2s cubic-bezier(.16, 1, .3, 1); }
    .sort-btn svg.is-idle { opacity: .35; }
    @media (prefers-reduced-motion: reduce) { .sort-btn svg { transition: none; } }

    .entry-rows { display: none; list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--text); }
    .entry-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 4px;
      border-bottom: 1px solid var(--border);
      font-size: 0.875rem;
    }
    .entry-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .entry-row .details { max-width: none; }
    /* The tournament link sits on its own line here, so on a touch screen it gets a 44px
       tap area; the negative margin keeps the row's spacing as it was. */
    @media (pointer: coarse) {
      .entry-row a { display: inline-block; padding: 13px 0; margin: -13px 0; }
    }

    @media (max-width: 640px) {
      .table-container { display: none; }
      .entry-rows { display: block; }
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
      font-size: 0.875rem;
    }
    .pagination-buttons { display: flex; gap: 8px; }

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
  /** True once any page has arrived; later loads dim the rows instead of replacing them. */
  loaded = signal(false);
  error = signal('');

  readonly actions = KNOWN_ACTIONS;
  readonly pageSizes = PAGE_SIZES;
  readonly sortColumns: { key: SortKey; label: string }[] = [
    { key: 'created_at', label: 'Time' },
    { key: 'action', label: 'Action' },
    { key: 'actor', label: 'Actor' },
    { key: 'tournament', label: 'Tournament' },
  ];
  readonly humanize = humanize;

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  /** Set by Previous/Next, whose buttons sit under the table: the new page should open at its top. */
  private scrollToTopOnLoad = false;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  ariaSort(key: SortKey): 'ascending' | 'descending' | null {
    if (this.sortKey() !== key) return null;
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  goToPage(page: number) {
    this.page.set(page);
    this.scrollToTopOnLoad = true;
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
        this.loaded.set(true);
        if (this.scrollToTopOnLoad) {
          this.scrollToTopOnLoad = false;
          this.scrollResultsIntoView();
        }
      },
      error: () => {
        this.scrollToTopOnLoad = false;
        this.error.set('Failed to load audit log.');
        this.loading.set(false);
      },
    });
  }

  /** Only scrolls up: if the top of the rows is already on screen, nothing moves. */
  private scrollResultsIntoView() {
    setTimeout(() => {
      const results = this.host.nativeElement.querySelector<HTMLElement>('.results');
      if (results && results.getBoundingClientRect().top < 68) {
        results.scrollIntoView({ block: 'start' });
      }
    });
  }

  actionLabel(action: string): string {
    return humanize(action);
  }

  formatTimestamp(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
    });
  }

  /** One "Key: value" line per detail; strings print bare, everything else as JSON. */
  formatDetails(details: Record<string, unknown> | null): string {
    if (!details) return '—';
    const entries = Object.entries(details);
    if (entries.length === 0) return '—';
    return entries
      .map(([k, v]) => `${humanize(k)}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n');
  }
}
