// src/app/admin/traffic.component.ts
//
// Super-admin Traffic page: visits counted by TrafficService, plus what organizers did in the
// same range, read from the real tables. Search terms aren't here; Google Search Console has
// those, and it's linked from the page.
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TournamentService } from '../shared/services/tournament.service';
import { TrafficSummary } from '../shared/models/tournament.models';

const PAGE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/tournaments': 'Tournament list',
  '/how-it-works': 'How it works',
  '/pricing': 'Pricing',
  '/sports': 'Sports',
  '/blind-draw-generator': 'Blind draw generator',
  '/cornhole-score-keeper': 'Score keeper',
  '/cornhole-fundraiser': 'Fundraiser guide',
  '/scoreholio-alternative': 'Scoreholio comparison',
  '/terms': 'Terms',
  '/refunds': 'Refunds',
  '/privacy': 'Privacy',
  '/admin/login': 'Sign in',
  '/admin/register': 'Create account',
  '/bracket/:id': 'Bracket pages',
  '/register/:id': 'Player sign-up pages',
  '/poster/:id': 'QR posters',
  '/(other)': 'Other',
};

@Component({
  selector: 'app-traffic',
  standalone: true,
  template: `
    <div class="page-table">
      <div class="page-header">
        <h1>Traffic</h1>
        <div class="ranges" role="group" aria-label="Date range">
          @if (loading() && data()) { <span class="spinner spinner-sm" role="status" aria-label="Loading"></span> }
          @for (r of ranges; track r) {
            <button type="button" class="btn btn-sm" [class.btn-primary]="pressed() === r" [attr.aria-pressed]="pressed() === r" (click)="load(r)">{{ r }} days</button>
          }
        </div>
      </div>

      @if (error()) {
        <!-- A failed switch keeps the last good numbers below rather than blanking the page. -->
        <div class="error-banner traffic-error" role="alert">
          {{ error() }}
          <button type="button" class="btn btn-sm" (click)="load(requested())">Try again</button>
        </div>
      }

      @if (loading() && !data()) {
        <div class="empty"><span class="spinner" role="status" aria-label="Loading traffic"></span></div>
      } @else if (data(); as d) {
        <div class="results" [class.is-refreshing]="loading()" [attr.aria-busy]="loading()">
        <div class="tiles">
          <div class="tile">
            <span class="label">Visits</span>
            <span class="value">{{ d.visits }}</span>
            <span class="note">{{ changeNote() }}</span>
          </div>
          <div class="tile">
            <span class="label">Page views</span>
            <span class="value">{{ d.views }}</span>
          </div>
          <div class="tile">
            <span class="label">New organizers</span>
            <span class="value">{{ d.activity.new_organizers }}</span>
          </div>
          <div class="tile">
            <span class="label">Tournaments created</span>
            <span class="value">{{ d.activity.tournaments_created }}</span>
          </div>
          <div class="tile">
            <span class="label">Players added</span>
            <span class="value">{{ d.activity.players_added }}</span>
          </div>
          <div class="tile">
            <span class="label">Pro subscribers</span>
            <span class="value">{{ d.activity.pro_subscribers }}</span>
            <span class="note">{{ d.activity.upgraded_tournaments }} tournament upgrades, all time</span>
          </div>
        </div>

        <section class="card">
          <div class="chart-head">
            <h2>Visits per day</h2>
            @if (peak(); as p) { <span class="peak">Busiest: {{ p.visits }} on {{ shortDate(p.day) }}</span> }
          </div>
          <div class="chart" role="img" [attr.aria-label]="chartLabel()">
            @for (day of d.daily; track day.day) {
              <div class="bar-slot" [title]="day.day + ': ' + day.visits + ' visits, ' + day.views + ' views'">
                <div class="bar" [style.height.%]="barHeight(day.visits)"></div>
              </div>
            }
          </div>
          <div class="axis" aria-hidden="true"><span>{{ shortDate(d.from) }}</span><span>{{ shortDate(d.to) }}</span></div>
        </section>

        <div class="columns">
          <section class="card">
            <h2>Top pages</h2>
            @if (d.pages.length === 0) {
              <p class="none">No page views yet.</p>
            } @else {
              <table class="data-table">
                <thead><tr><th scope="col">Page</th><th scope="col" class="num">Views</th><th scope="col" class="num">Landings</th></tr></thead>
                <tbody>
                  @for (p of d.pages; track p.path) {
                    <tr><td>{{ pageName(p.path) }}</td><td class="num">{{ p.views }}</td><td class="num">{{ p.visits }}</td></tr>
                  }
                </tbody>
              </table>
            }
          </section>

          <section class="card">
            <h2>Where visits came from</h2>
            @if (d.sources.length === 0) {
              <p class="none">No visits yet.</p>
            } @else {
              <table class="data-table">
                <thead><tr><th scope="col">Source</th><th scope="col" class="num">Visits</th></tr></thead>
                <tbody>
                  @for (s of d.sources; track s.source) {
                    <tr><td>{{ s.source || 'Direct or unknown' }}</td><td class="num">{{ s.visits }}</td></tr>
                  }
                </tbody>
              </table>
            }
          </section>
        </div>

        <p class="footnote">
          A visit is the first page someone opens in a browser session. Bots and signed-in admin
          screens aren't counted, and neither are you while you're signed in as a super admin.
          Add <code>?utm_source=name</code> to a link you share (a flyer QR code, a Reddit post)
          and its visits show up under that name. For the Google searches people found you
          with, use <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a>.
        </p>
        </div>
      }
    </div>
  `,
  styles: [`
    .ranges { display: flex; align-items: center; gap: 6px; }
    .traffic-error { margin-bottom: 16px; }

    .results { transition: opacity .15s; }
    .results.is-refreshing { opacity: .55; }

    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .tile {
      display: flex; flex-direction: column; gap: 2px;
      background: var(--surface); border: 1.5px solid var(--text); padding: 12px 14px;
    }
    .label { font-size: 0.78rem; font-weight: 600; color: var(--text-dim); }
    .value { font-family: var(--display); font-weight: 800; font-stretch: 108%; font-size: 2rem; line-height: 1.1; }
    .note { font-size: 0.78rem; color: var(--text-dim); }

    section.card { margin-bottom: 16px; }
    h2 { font-size: 1.2rem; margin: 0 0 12px; }
    .chart-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
    .peak { font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px; }

    .chart { display: flex; align-items: flex-end; gap: 2px; height: 160px; border-bottom: 1px solid var(--border); }
    .bar-slot { flex: 1; height: 100%; display: flex; align-items: flex-end; }
    .bar { width: 100%; min-height: 1px; background: var(--accent); }
    .axis { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-dim); margin-top: 6px; }

    .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .columns section.card { margin-bottom: 0; }
    .data-table td { padding: 8px 6px; overflow-wrap: anywhere; }
    .data-table th { padding: 6px; }
    .none { color: var(--text-dim); font-size: 0.875rem; margin: 0; }

    .footnote { font-size: 0.8rem; color: var(--text-dim); line-height: 1.6; margin-top: 20px; max-width: 75ch; }
  `],
})
export class TrafficComponent implements OnInit {
  private readonly svc = inject(TournamentService);

  readonly ranges = [7, 30, 90];
  readonly days = signal(30);
  readonly data = signal<TrafficSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  private readonly maxVisits = computed(() => Math.max(1, ...(this.data()?.daily ?? []).map(d => d.visits)));

  /** "Up 25% on the previous 30 days", or a plain count when there's nothing to compare. */
  readonly changeNote = computed(() => {
    const d = this.data();
    if (!d) return '';
    if (d.previous_visits === 0) return `${d.previous_visits} in the previous ${d.days} days`;
    const pct = Math.round(((d.visits - d.previous_visits) / d.previous_visits) * 100);
    if (pct === 0) return `Same as the previous ${d.days} days`;
    return `${pct > 0 ? 'Up' : 'Down'} ${Math.abs(pct)}% on the previous ${d.days} days`;
  });

  /** The busiest day in range, or null when there were no visits at all. */
  readonly peak = computed(() => {
    const days = this.data()?.daily ?? [];
    const top = days.reduce<TrafficSummary['daily'][number] | null>((best, d) => (!best || d.visits > best.visits ? d : best), null);
    return top && top.visits > 0 ? top : null;
  });

  /** What a screen reader hears for the chart, since the bars themselves carry no text. */
  readonly chartLabel = computed(() => {
    const d = this.data();
    if (!d) return '';
    const range = `Visits per day, ${this.shortDate(d.from)} to ${this.shortDate(d.to)}: ${d.visits} in all`;
    const p = this.peak();
    return p ? `${range}, busiest ${p.visits} on ${this.shortDate(p.day)}.` : `${range}.`;
  });

  /** The range last asked for; `days` stays the range on screen until it arrives. */
  readonly requested = signal(30);
  /** The pressed button follows the click at once, and falls back to what's shown if it fails. */
  readonly pressed = computed(() => (this.loading() ? this.requested() : this.days()));

  ngOnInit(): void {
    this.load(this.days());
  }

  load(days: number): void {
    this.requested.set(days);
    this.loading.set(true);
    this.error.set('');
    this.svc.getTrafficSummary(days).subscribe({
      next: data => { this.data.set(data); this.days.set(days); this.loading.set(false); },
      error: () => {
        this.error.set(this.data() ? `Could not load the last ${days} days. These are the last ${this.days()}.` : 'Could not load traffic.');
        this.loading.set(false);
      },
    });
  }

  barHeight(visits: number): number {
    return (visits / this.maxVisits()) * 100;
  }

  /** "2026-11-16" → "Nov 16". Read as a calendar date, not a UTC instant. */
  shortDate(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    if (!y || !m || !d) return day;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  pageName(path: string): string {
    return PAGE_NAMES[path] ?? path;
  }
}
