// src/app/bracket/tournament-list.component.ts
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { AuthService } from '../shared/services/auth.service';
import { Tournament } from '../shared/models/tournament.models';

interface TournamentGroup {
  key: Tournament['status'];
  label: string;
  items: Tournament[];
}

@Component({
  selector: 'app-tournament-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <!-- The landing content is for people who have never seen Bracketway before. A signed-in
         organizer already knows what the product is and came here for their brackets, so they
         skip straight to the list. -->
    @if (showLanding()) {
      <header class="hero">
        <div class="hero-mark" aria-hidden="true">
          <svg width="300" height="244" viewBox="0 0 160 130" fill="none">
            <g stroke="currentColor" stroke-width="1.5" fill="none">
              <path d="M4 10H24C30 10 30 30 36 30" />
              <path d="M4 50H24C30 50 30 30 36 30" />
              <path d="M4 80H24C30 80 30 100 36 100" />
              <path d="M4 120H24C30 120 30 100 36 100" />
              <path d="M36 30H56C62 30 62 65 68 65" />
              <path d="M36 100H56C62 100 62 65 68 65" />
              <path d="M68 65H96" />
            </g>
            <circle cx="102" cy="65" r="6" fill="currentColor" />
          </svg>
        </div>
        <div class="hero-inner">
          <p class="hero-eyebrow">Bag toss tournament manager</p>
          <h1 class="hero-title">Set it up in minutes.<br />Settle it on the boards.</h1>
          <p class="hero-lede">
            Sign-ups, team draws, seeding, and live scoring in one place — so you can run the
            tournament instead of redrawing a whiteboard bracket every round.
          </p>
          <!-- The page itself is identical for everyone; only these two destinations move,
               since sending a signed-in organizer to the register/sign-in screens would be
               a dead end. -->
          <div class="hero-actions">
            @if (auth.isLoggedIn()) {
              <a class="btn btn-primary" routerLink="/admin">Create a tournament</a>
              <a class="btn" routerLink="/tournaments">Your tournaments</a>
            } @else {
              <a class="btn btn-primary" routerLink="/admin/register">Create a tournament</a>
              <a class="btn" routerLink="/admin/login">Sign in</a>
            }
          </div>
          <p class="hero-note">Free to start · Nothing to install · Works on the phone in your pocket</p>
        </div>
      </header>

      <section class="steps">
        <ol class="steps-inner">
          <li class="step">
            <span class="step-num">Step 01</span>
            <h2 class="step-title">Get everyone in</h2>
            <p class="step-body">
              Type your players in yourself, or share a link and QR code at the door and let them
              sign themselves up while you set up the boards.
            </p>
          </li>
          <li class="step">
            <span class="step-num">Step 02</span>
            <h2 class="step-title">Draw the teams</h2>
            <p class="step-body">
              Auto-draft random pairs or enter teams directly, then let the seeding fall where it
              may — or drag the ladder into the order you want.
            </p>
          </li>
          <li class="step">
            <span class="step-num">Step 03</span>
            <h2 class="step-title">Score it live</h2>
            <p class="step-body">
              Tap scores in from the boards. Winners advance on their own, and everyone watching
              sees the bracket move the moment it happens.
            </p>
          </li>
        </ol>
        <ul class="features">
          <li>Shareable public bracket</li>
          <li>QR code sign-up</li>
          <li>Email score updates</li>
          <li>Scorekeeper accounts</li>
        </ul>
        <a class="walkthrough-link" routerLink="/how-it-works">Read the full walkthrough →</a>
      </section>
    }

    <div class="page">
      <div class="list-head">
        @if (showLanding()) {
          <h2 class="list-title">Tournaments in play</h2>
        } @else {
          <h1 class="list-title">Tournaments</h1>
        }
        @if (showFilter()) {
          <input class="input filter" type="search" placeholder="Filter by name"
            aria-label="Filter tournaments by name"
            [ngModel]="filter()" (ngModelChange)="filter.set($event)" />
        }
      </div>

      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (tournaments().length === 0) {
        <!-- Keyed on the session rather than the route: an organizer with nothing yet wants
             the shortcut to make one, wherever they're standing. -->
        <div class="empty">
          @if (auth.isLoggedIn()) {
            No tournaments yet. <a routerLink="/admin">Create your first one.</a>
          } @else {
            No public tournaments running right now.
          }
        </div>
      } @else if (groups().length === 0) {
        <div class="empty">No tournaments match “{{ filter() }}”.</div>
      } @else {
        @for (group of groups(); track group.key) {
          <section class="group">
            <div class="group-label section-label">{{ group.label }}</div>
            <div class="list">
              @for (t of group.items; track t.id) {
                <a class="row" [class.is-live]="t.status === 'active'" [routerLink]="['/bracket', t.uuid]">
                  <div class="row-body">
                    <div class="row-top">
                      <span class="row-name">{{ t.name }}</span>
                      <span class="badge badge-{{ t.status }}">{{ statusLabel(t) }}</span>
                    </div>
                    @if (t.stats?.champion_name; as champion) {
                      <div class="row-champion"><span aria-hidden="true">🏆</span> {{ champion }}</div>
                    }
                    @if (meta(t); as metaLine) {
                      <div class="row-meta">{{ metaLine }}</div>
                    }
                    @if (progress(t) !== null) {
                      <div class="row-progress"><span [style.width.%]="progress(t)"></span></div>
                    }
                  </div>
                  <span class="row-arrow" aria-hidden="true">→</span>
                </a>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    /* ── Landing ── */
    .hero {
      position: relative;
      overflow: hidden;
      padding: 56px 16px 48px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    /* Bracket watermark, same geometry as the nav mark. Sits behind the copy and bleeds
       off the right edge; hidden on narrow screens where it would collide with the text. */
    .hero-mark {
      position: absolute;
      top: 50%;
      right: -56px;
      transform: translateY(-50%);
      color: var(--border);
      pointer-events: none;
    }
    .hero-inner, .steps-inner, .features {
      position: relative;
      max-width: 680px;
      margin: 0 auto;
    }
    .hero-eyebrow {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 14px;
    }
    .hero-title {
      font-size: clamp(2.5rem, 9vw, 3.9rem);
      line-height: .95;
      margin-bottom: 18px;
    }
    .hero-lede {
      max-width: 46ch;
      font-size: 1rem;
      line-height: 1.6;
      color: var(--text-dim);
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 26px;
    }
    .hero-note {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: .04em;
      color: var(--muted);
      margin-top: 18px;
    }

    .steps {
      padding: 40px 16px 8px;
      border-bottom: 1px solid var(--border);
    }
    .steps-inner {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 24px;
      list-style: none;
    }
    .step { border-top: 2px solid var(--border); padding-top: 14px; }
    .step-num {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .step-title { font-size: 1.4rem; margin: 8px 0 8px; }
    .step-body { font-size: 0.875rem; line-height: 1.55; color: var(--text-dim); }

    .features {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
      margin-top: 32px;
      padding-top: 18px;
      padding-bottom: 16px;
      border-top: 1px solid var(--border);
      list-style: none;
    }
    .features li {
      display: flex;
      align-items: center;
      gap: 7px;
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .features li::before {
      content: '';
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
    }
    .walkthrough-link {
      display: block;
      max-width: 680px;
      margin: 0 auto;
      padding-bottom: 28px;
      font-size: 0.85rem;
      color: var(--accent);
    }

    /* ── Tournament list ── */
    .list-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 24px;
    }
    .list-title { font-size: 1.9rem; }
    .filter { width: auto; max-width: 220px; font-size: 0.875rem; padding: 7px 10px; }

    .group + .group { margin-top: 28px; }
    .group-label {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 10px;
    }

    .list { display: flex; flex-direction: column; gap: 8px; }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      text-decoration: none;
      color: var(--text);
      transition: border-color .15s;
      &:hover { border-color: var(--muted); text-decoration: none; }
      /* A running tournament earns a marker-coloured edge so it reads as live at a glance,
         without the row itself shouting. */
      &.is-live { border-left: 3px solid var(--marker); }
    }
    .row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .row-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .row-name { font-weight: 500; }
    .row-champion { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; }
    .row-meta {
      font-family: var(--mono);
      font-size: 0.7rem;
      letter-spacing: .03em;
      color: var(--muted);
    }
    .row-progress {
      height: 4px;
      border-radius: 2px;
      background: var(--surface-2);
      overflow: hidden;
      span { display: block; height: 100%; background: var(--marker); }
    }
    .row-arrow { color: var(--muted); font-size: 0.9rem; flex-shrink: 0; }

    @media (max-width: 720px) {
      .hero-mark { display: none; }
      .hero { padding: 40px 16px 36px; }
      .steps { padding-top: 32px; }
    }
  `]
})
export class TournamentListComponent implements OnInit {
  tournaments = signal<Tournament[]>([]);
  loading = signal(true);
  filter = signal('');

  // Set from route data, not from the session: `/` is the full landing page for everyone,
  // signed in or not, while `/tournaments` is the slimmed-down list the nav points at.
  // Defaults to showing the landing content when a route doesn't say otherwise.
  showLanding = signal(true);

  // The filter is noise until there are enough rows to actually get lost in.
  readonly showFilter = computed(() => this.tournaments().length > 6);

  private readonly matching = computed(() => {
    const query = this.filter().trim().toLowerCase();
    const all = this.tournaments();
    return query ? all.filter(t => t.name.toLowerCase().includes(query)) : all;
  });

  // Running tournaments first — someone arriving at the site mid-event is almost always
  // looking for the one happening right now, not the archive. 'setup' only ever appears
  // for a signed-in user; the public list endpoint filters those out.
  readonly groups = computed<TournamentGroup[]>(() => {
    const rows = this.matching();
    return ([
      { key: 'active',   label: 'Live now',   items: rows.filter(t => t.status === 'active') },
      { key: 'setup',    label: 'In setup',   items: rows.filter(t => t.status === 'setup') },
      { key: 'complete', label: 'Completed',  items: rows.filter(t => t.status === 'complete') },
    ] as TournamentGroup[]).filter(g => g.items.length > 0);
  });

  constructor(
    private svc: TournamentService,
    public auth: AuthService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.showLanding.set(this.route.snapshot.data['landing'] !== false);

    this.svc.getTournaments().subscribe({
      next: data => { this.tournaments.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  statusLabel(t: Tournament): string {
    if (t.status === 'active') return 'Live';
    if (t.status === 'complete') return 'Final';
    return 'Setup';
  }

  // A single mono line of whatever this tournament can actually say about itself. Stats
  // are absent on a response from an older API build, so every part is guarded.
  meta(t: Tournament): string {
    const s = t.stats;
    const parts: string[] = [];
    if (s && s.team_count > 0) {
      parts.push(`${s.team_count} ${s.team_count === 1 ? 'team' : 'teams'}`);
    }
    if (t.status === 'active' && s) {
      if (s.current_round && s.total_rounds) parts.push(`Round ${s.current_round} of ${s.total_rounds}`);
      if (s.match_count > 0) parts.push(`${s.matches_played} of ${s.match_count} matches`);
    }
    const started = this.startedLabel(t.created_at);
    if (started) parts.push(started);
    return parts.join(' · ');
  }

  // Percentage of playable matches decided, for the progress bar under a live row.
  // Null for anything that isn't an in-progress bracket, which hides the bar entirely.
  progress(t: Tournament): number | null {
    const s = t.stats;
    if (t.status !== 'active' || !s || s.match_count === 0) return null;
    return Math.round((s.matches_played / s.match_count) * 100);
  }

  private startedLabel(dateStr: string): string {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (days <= 0) return 'Started today';
    if (days === 1) return 'Started yesterday';
    if (days < 7) return `Started ${days} days ago`;
    return `Started ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
}
