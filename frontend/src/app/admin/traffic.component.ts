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
    <div class="page-wide">
      <div class="page-header">
        <h1>Traffic</h1>
        <div class="ranges" role="group" aria-label="Date range">
          @for (r of ranges; track r) {
            <button type="button" class="btn btn-sm" [class.btn-primary]="days() === r" (click)="load(r)">{{ r }} days</button>
          }
        </div>
      </div>

      @if (loading() && !data()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (error()) {
        <div class="empty">{{ error() }}</div>
      } @else if (data(); as d) {
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
          <h2>Visits per day</h2>
          <div class="chart" role="img" [attr.aria-label]="'Visits per day, ' + d.from + ' to ' + d.to">
            @for (day of d.daily; track day.day) {
              <div class="bar-slot" [title]="day.day + ': ' + day.visits + ' visits, ' + day.views + ' views'">
                <div class="bar" [style.height.%]="barHeight(day.visits)"></div>
              </div>
            }
          </div>
          <div class="axis"><span>{{ d.from }}</span><span>{{ d.to }}</span></div>
        </section>

        <div class="columns">
          <section class="card">
            <h2>Top pages</h2>
            @if (d.pages.length === 0) {
              <p class="none">No page views yet.</p>
            } @else {
              <table>
                <thead><tr><th>Page</th><th class="num">Views</th><th class="num">Landings</th></tr></thead>
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
              <table>
                <thead><tr><th>Source</th><th class="num">Visits</th></tr></thead>
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
      }
    </div>
  `,
  styles: [`
    .page-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 2rem; }
    .ranges { display: flex; gap: 6px; }

    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .tile {
      display: flex; flex-direction: column; gap: 2px;
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px;
    }
    .label { font-family: var(--mono); font-size: 0.65rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
    .value { font-family: var(--display); font-size: 2rem; line-height: 1.1; }
    .note { font-size: 0.75rem; color: var(--text-dim); }

    section.card { margin-bottom: 16px; }
    h2 { font-size: 1.2rem; margin: 0 0 12px; }

    .chart { display: flex; align-items: flex-end; gap: 2px; height: 160px; }
    .bar-slot { flex: 1; height: 100%; display: flex; align-items: flex-end; }
    .bar { width: 100%; min-height: 1px; background: var(--accent); border-radius: 2px 2px 0 0; }
    .axis { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 0.7rem; color: var(--muted); margin-top: 6px; }

    .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .columns section.card { margin-bottom: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); border-bottom: 2px solid var(--border); padding: 6px 4px; }
    td { padding: 6px 4px; border-bottom: 1px solid var(--border); word-break: break-word; }
    .num { text-align: right; white-space: nowrap; }
    .none { color: var(--text-dim); font-size: 0.85rem; margin: 0; }

    .footnote { font-size: 0.8rem; color: var(--text-dim); line-height: 1.6; margin-top: 20px; }
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

  ngOnInit(): void {
    this.load(this.days());
  }

  load(days: number): void {
    this.days.set(days);
    this.loading.set(true);
    this.error.set('');
    this.svc.getTrafficSummary(days).subscribe({
      next: data => { this.data.set(data); this.loading.set(false); },
      error: () => { this.error.set('Could not load traffic.'); this.loading.set(false); },
    });
  }

  barHeight(visits: number): number {
    return (visits / this.maxVisits()) * 100;
  }

  pageName(path: string): string {
    return PAGE_NAMES[path] ?? path;
  }
}
