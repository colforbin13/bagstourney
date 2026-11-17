// src/app/bracket/tournament-list.component.ts
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { AuthService } from '../shared/services/auth.service';
import { Tournament } from '../shared/models/tournament.models';
import { DrawnTeam, pairTeams, shuffle } from '../shared/blind-draw';
import { isExampleTournament } from '../shared/examples';

interface TournamentGroup {
  key: Tournament['status'] | 'example';
  label: string;
  items: Tournament[];
}

// The names on the hero's example sign-up sheet. Made up, and labelled as an example on the
// page: the point is to let a visitor press the button and watch a blind draw happen.
const SAMPLE_PLAYERS = ['Dana', 'Marcus', 'Priya', 'Tom', 'Shanice', 'Luis'];

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
        <div class="hero-inner">
          <div class="hero-copy">
            <h1 class="hero-title">Set it up in minutes. Settle it at the venue.</h1>
            <p class="hero-what">Tournament manager for two-player teams</p>
            <p class="hero-lede">
              Sign-ups, team draws, seeding and live scoring. Run the tournament and stop
              redrawing a whiteboard bracket every round.
            </p>
            <!-- The page itself is identical for everyone; only these two destinations move,
                 since sending a signed-in organizer to the register/sign-in screens would be
                 a dead end. -->
            <div class="hero-actions">
              @if (auth.isLoggedIn()) {
                <a class="hero-go" routerLink="/admin">Create a tournament</a>
                <a class="hero-alt" routerLink="/tournaments">Your tournaments</a>
              } @else {
                <a class="hero-go" routerLink="/admin/register">Create a tournament</a>
                <a class="hero-alt" routerLink="/admin/login">Sign in</a>
              }
            </div>
          </div>

          <!-- The blind draw, working. Same shuffle and pairing as the free generator and a
               real tournament; the names are an example and nothing leaves the page. -->
          <section class="sheet" aria-labelledby="sheet-title">
            <h2 class="sheet-title" id="sheet-title">{{ teams() ? 'Teams' : 'Sign-up sheet' }}</h2>
            <ol class="sheet-lines" aria-live="polite">
              @if (teams(); as drawn) {
                @for (team of drawn; track team.players[0] + draws()) {
                  <li class="sheet-line is-drawn" [style.--i]="$index">
                    <span class="sheet-n">{{ team.seed }}</span>
                    <span>{{ team.players[0] }} <span class="sheet-and">and</span> {{ team.players[1] }}</span>
                  </li>
                }
              } @else {
                @for (name of players; track name) {
                  <li class="sheet-line"><span class="sheet-n">{{ $index + 1 }}</span><span>{{ name }}</span></li>
                }
              }
            </ol>
            <button type="button" class="sheet-draw" (click)="draw()">
              {{ teams() ? 'Draw again' : 'Draw the teams' }}
            </button>
            <p class="sheet-foot">
              An example blind draw. <a routerLink="/blind-draw-generator">Try it with your own names</a>
            </p>
          </section>
          <!-- Below the sheet on a phone, so the working draw is on the first screen. -->
          <div class="hero-extra">
          <!-- The one place a sport gets named on this page. Everything else stays neutral,
                 because the app genuinely doesn't care which game it is — but a visitor who
                 can't see their own game in the copy assumes it isn't supported. -->
            <p class="hero-sports">
              Bags, KanJam, pickleball, horseshoes, darts, euchre: any bracket of two-player
              teams. <a routerLink="/sports">See the full list</a>
            </p>
            <p class="hero-note"><a routerLink="/pricing">Free to start</a> · Nothing to install · Works on your phone</p>
          </div>
        </div>

        <!-- The strip of tear-off tabs along the bottom of the flyer. -->
        <nav class="tabs" aria-label="Start here">
          <a class="tab tab-go" [routerLink]="auth.isLoggedIn() ? '/admin' : '/admin/register'"><span>Start free</span></a>
          <a class="tab" routerLink="/blind-draw-generator"><span>Blind draw</span></a>
          <a class="tab" routerLink="/how-it-works"><span>How it works</span></a>
          <a class="tab" routerLink="/pricing"><span>Pricing</span></a>
          <a class="tab" routerLink="/cornhole-fundraiser"><span>Fundraisers</span></a>
          <a class="tab" routerLink="/sports"><span>Sports</span></a>
          <a class="tab" routerLink="/" fragment="tournaments"><span>Live brackets</span></a>
        </nav>
      </header>

      <section class="steps">
        <ol class="steps-inner">
          <li class="step">
            <span class="step-num" aria-hidden="true">1</span>
            <h2 class="step-title">Get everyone in</h2>
            <p class="step-body">
              Paste in your list of players, or share a link and QR code at the door and let them
              sign themselves up while you're still setting up.
            </p>
          </li>
          <li class="step">
            <span class="step-num" aria-hidden="true">2</span>
            <h2 class="step-title">Draw the teams</h2>
            <p class="step-body">
              Blind draw random pairs or enter set teams. Seed them automatically, put them in
              your own order, or let pool play decide.
            </p>
          </li>
          <li class="step">
            <span class="step-num" aria-hidden="true">3</span>
            <h2 class="step-title">Score it live</h2>
            <p class="step-body">
              Tap scores in as each game finishes. Winners advance on their own, and everyone
              watching sees the bracket move the moment it happens.
            </p>
          </li>
        </ol>
        <!-- Weighted toward what Bracketway puts *in the room* — a screen on the wall,
             signs by the door — since that's the part people don't expect from a bracket
             tool, and the part they can picture. -->
        <ul class="features">
          <li>Bracket on the TV</li>
          <li>Printable QR signs</li>
          <li>Phone sign-up</li>
          <li>Live public bracket</li>
          <li>Email score updates</li>
          <li>Scorekeeper accounts</li>
          <li>Board assignments</li>
        </ul>
        <a class="walkthrough-link" routerLink="/how-it-works">Read the full walkthrough</a>
      </section>
    }

    <div class="page" [class.page-landing]="showLanding()" id="tournaments">
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
            <div class="group-label">{{ group.label }}</div>
            @if (group.key === 'example') {
              <p class="group-note">Made-up events that show how different formats look. Open one to see its bracket.</p>
            }
            <div class="list">
              @for (t of group.items; track t.id) {
                <a class="row" [routerLink]="['/bracket', t.uuid]">
                  <div class="row-body">
                    <div class="row-top">
                      <span class="row-name">{{ t.name }}</span>
                      <span class="badge badge-{{ t.status }}" [class.badge-quiet]="group.key === 'example'">{{ statusLabel(t, group.key === 'example') }}</span>
                      @if (group.key === 'example') {
                        <span class="row-example">Example</span>
                      }
                    </div>
                    @if (t.stats?.champion_name; as champion) {
                      <div class="row-champion">Won by {{ champion }}</div>
                    }
                    @if (meta(t); as metaLine) {
                      <div class="row-meta">{{ metaLine }}</div>
                    }
                    @if (progress(t) !== null) {
                      <div class="row-progress"><span [style.width.%]="progress(t)"></span></div>
                    }
                  </div>
                  <svg class="row-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path d="M3 9h11M9.5 4l5 5-5 5" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </a>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    /* ── Landing: the flyer ──
       The hero is one green sheet. It runs straight on from the nav, which is the same
       paper, and ends in a strip of tear-off tabs. */
    .hero {
      background: var(--sheet);
      color: var(--text);
      display: flex;
      flex-direction: column;
      min-height: min(calc(100dvh - 52px), 900px);
    }
    .hero-inner {
      flex: 1;
      width: 100%;
      max-width: 1320px;
      margin: 0 auto;
      padding: clamp(24px, 3.2vw, 44px) clamp(16px, 4vw, 56px) clamp(24px, 2.6vw, 36px);
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
      grid-template-areas: "copy sheet" "extra sheet";
      grid-template-rows: auto 1fr;
      gap: 0 clamp(24px, 3vw, 44px);
      align-items: start;
    }
    .hero-copy { grid-area: copy; }
    .sheet { grid-area: sheet; }
    .hero-extra {
      grid-area: extra;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 28px;
      margin-top: 18px;
    }
    .hero-title {
      font-size: clamp(2.7rem, min(7.6vw, 10.6vh), 6rem);
      font-weight: 900;
      font-stretch: 106%;
      line-height: .93;
      letter-spacing: -.04em;
      text-wrap: balance;
    }
    .hero-what {
      margin-top: clamp(18px, 2.4vw, 30px);
      font-size: clamp(1.1rem, 1.7vw, 1.4rem);
      font-weight: 800;
      letter-spacing: -.01em;
    }
    .hero-lede {
      max-width: 62ch;
      margin-top: 8px;
      font-size: clamp(1rem, 1.35vw, 1.2rem);
      line-height: 1.5;
      font-weight: 500;
      text-wrap: pretty;
    }
    .hero-sports {
      max-width: 52ch;
      font-size: 0.95rem;
      line-height: 1.5;
      a { white-space: nowrap; font-weight: 700; }
    }
    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px 24px;
      margin-top: 22px;
    }
    .hero-go {
      display: inline-flex;
      align-items: center;
      min-height: 56px;
      padding: 0 28px;
      background: var(--text);
      color: var(--surface);
      font-size: 1.2rem;
      font-weight: 800;
      letter-spacing: -.01em;
      text-decoration: none;
      transition: transform .18s cubic-bezier(.16, 1, .3, 1), background .15s;
      &:hover { background: var(--accent-dim); transform: translateY(-2px); }
      &:active { transform: translateY(0); }
    }
    .hero-alt { font-size: 1.05rem; font-weight: 700; padding: 12px 0; }
    .hero-note { font-size: 0.9rem; font-weight: 500; }

    /* The sign-up sheet: white stock, ruled lines, set down slightly crooked. */
    .sheet {
      background: var(--surface);
      padding: 22px 24px 18px;
      transform: rotate(1.2deg);
      box-shadow: 0 1px 0 rgba(0, 0, 0, .22), 0 14px 22px -16px rgba(0, 0, 0, .45);
    }
    .sheet-title {
      font-size: 1.7rem;
      font-weight: 900;
      padding-bottom: 10px;
      border-bottom: 3px solid var(--text);
    }
    /* Six name lines or three team lines: the same height either way, so the draw bar
       stays under the finger. */
    .sheet-lines { list-style: none; --line: 2.9rem; }
    .sheet-line {
      display: flex;
      align-items: flex-end;
      gap: 12px;
      height: var(--line);
      padding-bottom: 6px;
      border-bottom: 1.5px solid var(--text);
      font-size: 1.12rem;
      font-weight: 600;
    }
    .sheet-n { width: 1.2em; font-weight: 400; color: var(--text-dim); }
    .sheet-and { font-weight: 400; }
    .sheet-line.is-drawn {
      height: calc(var(--line) * 2);
      font-size: 1.3rem;
      animation: set-down .5s cubic-bezier(.16, 1, .3, 1) both;
      animation-delay: calc(var(--i) * 70ms);
    }
    @keyframes set-down {
      /* Rows stay readable the whole time: they only slide and settle, never hide. */
      from { transform: translate(-18px, -12px) rotate(-3deg); }
      to   { transform: none; }
    }
    .sheet-draw {
      display: block;
      width: 100%;
      min-height: 54px;
      margin-top: 18px;
      border: none;
      background: var(--text);
      color: var(--surface);
      font-family: var(--sans);
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -.01em;
      cursor: pointer;
      transition: background .15s;
      &:hover { background: var(--accent-dim); }
      &:active { background: #000; }
    }
    .sheet-foot { margin-top: 12px; font-size: 0.85rem; color: var(--text-dim); }

    /* Tear-off tabs. Dashed cut lines, lettering turned on its side, the first one inked. */
    .tabs {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      border-top: 2.5px dashed var(--text);
    }
    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      height: clamp(128px, 16vh, 160px);
      border-right: 2.5px dashed var(--text);
      color: var(--text);
      text-decoration: none;
      transition: background .15s;
      &:last-child { border-right: none; }
      span {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        font-size: clamp(.9rem, min(1.5vw, 2vh), 1.3rem);
        font-weight: 800;
        letter-spacing: -.01em;
        white-space: nowrap;
        transition: transform .25s cubic-bezier(.16, 1, .3, 1);
      }
      &:hover { background: var(--sheet-deep); }
      &:hover span { transform: rotate(180deg) translateY(6px); }
      &:focus-visible { outline-offset: -5px; }
    }
    .tab-go {
      background: var(--text);
      color: var(--sheet);
      &:hover { background: var(--accent-dim); }
      &:focus-visible { outline-color: var(--sheet); }
    }

    /* ── Steps: one full-width ruled band each ── */
    .steps {
      background: var(--surface);
      padding: clamp(32px, 5vw, 64px) var(--page-gutter) clamp(28px, 4vw, 48px);
      border-bottom: 1px solid var(--border);
    }
    .steps-inner { list-style: none; border-top: 3px solid var(--text); }
    .step {
      display: grid;
      grid-template-columns: clamp(48px, 8vw, 110px) minmax(0, 5fr) minmax(0, 6fr);
      gap: 8px clamp(16px, 3vw, 40px);
      align-items: baseline;
      padding: clamp(18px, 2.6vw, 30px) 0;
      border-bottom: 1.5px solid var(--text);
    }
    .step-num {
      font-size: clamp(2.6rem, 6vw, 4.6rem);
      font-weight: 900;
      font-stretch: 106%;
      line-height: .8;
      letter-spacing: -.04em;
    }
    .step-title { font-size: clamp(1.5rem, 3.2vw, 2.4rem); font-weight: 900; font-stretch: 106%; }
    .step-body { font-size: 1.02rem; line-height: 1.55; max-width: 56ch; color: var(--text-dim); text-wrap: pretty; }

    .features {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 26px;
      margin-top: clamp(24px, 3vw, 36px);
      list-style: none;
    }
    .features li {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 0.98rem;
      font-weight: 700;
    }
    .features li::before {
      content: '';
      width: 8px;
      height: 8px;
      background: var(--sheet);
      outline: 1.5px solid var(--text);
      flex-shrink: 0;
    }
    .walkthrough-link {
      display: block;
      margin-top: 22px;
      font-weight: 700;
    }

    /* ── Tournament list: a ruled sheet ── */
    .list-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 22px;
    }
    /* On the landing page the list shares the header's margins, like the hero and steps. */
    .page-landing { max-width: none; padding: clamp(32px, 5vw, 56px) var(--page-gutter) 56px; }
    .list-title { font-size: 1.9rem; font-stretch: 106%; }
    .filter { width: auto; max-width: 220px; font-size: 0.875rem; padding: 7px 10px; }

    .group + .group { margin-top: 32px; }
    .group-label {
      font-size: 0.85rem;
      font-weight: 800;
      padding-bottom: 6px;
      border-bottom: 2px solid var(--text);
    }

    .group-note { margin-top: 8px; font-size: 0.9rem; color: var(--text-dim); }
    /* An example's status, never the highlighter: see statusLabel(). */
    .badge.badge-quiet { background: var(--surface); color: var(--text); border: 1px solid var(--text); }
    .row-example { font-size: 0.82rem; font-weight: 600; color: var(--text-dim); }

    .list { display: flex; flex-direction: column; }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 4px;
      border-bottom: 1px solid var(--border);
      text-decoration: none;
      color: var(--text);
      transition: background .15s, padding .2s cubic-bezier(.16, 1, .3, 1);
      &:hover { background: var(--surface-2); padding-left: 12px; padding-right: 12px; text-decoration: none; }
    }
    .row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    .row-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .row-name { font-weight: 700; font-size: 1.05rem; }
    .row-champion { font-size: 0.9rem; font-weight: 600; color: var(--marker); }
    .row-meta { font-size: 0.82rem; color: var(--muted); }
    .row-progress {
      height: 5px;
      background: var(--surface-2);
      overflow: hidden;
      span { display: block; height: 100%; background: var(--text); }
    }
    .row-arrow { color: var(--text); flex-shrink: 0; }

    /* Seven features as aligned columns, four then three, so none is left alone on a line. */
    @media (min-width: 861px) {
      .features { display: grid; grid-template-columns: repeat(4, max-content); gap: 10px 40px; }
    }
    @media (max-width: 860px) {
      .hero { min-height: 0; }
      .hero-inner { grid-template-columns: minmax(0, 1fr); grid-template-areas: "copy" "sheet" "extra"; }
      .sheet { max-width: 420px; margin-top: 26px; transform: rotate(.8deg); }
      .hero-extra { margin-top: 26px; }
      .step { grid-template-columns: clamp(40px, 12vw, 64px) minmax(0, 1fr); }
      .step-body { grid-column: 2; }
    }
    @media (max-width: 520px) {
      .tab { height: 138px; }
      .tab span { font-size: .9rem; }
      /* Phone first screen: the draw bar and its caption have to clear Safari's bottom
         toolbar, which leaves about 680px of an iPhone 16 Pro clear on first load. Every
         step below buys part of that; the sheet keeps all six names. */
      .hero-inner { padding-top: 16px; }
      .hero-title { font-size: 2.45rem; }
      .hero-actions { margin-top: 14px; }
      .hero-go { flex: 1; justify-content: center; padding: 0 16px; min-height: 48px; font-size: 1.1rem; }
      .hero-alt { padding: 8px 0; }
      .hero-what { font-size: 1rem; margin-top: 12px; }
      .hero-lede { font-size: .98rem; }
      .sheet { margin-top: 14px; padding: 12px 18px 10px; }
      .sheet-title { font-size: 1.25rem; padding-bottom: 4px; }
      .sheet-lines { --line: 1.95rem; }
      .sheet-line { font-size: 1.02rem; padding-bottom: 4px; }
      .sheet-line.is-drawn { font-size: 1.12rem; }
      .sheet-draw { min-height: 46px; margin-top: 12px; font-size: 1.1rem; }
      .sheet-foot { margin-top: 8px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sheet-line.is-drawn { animation: none; }
      .tab span, .hero-go, .row { transition: none; }
    }
  `]
})
export class TournamentListComponent implements OnInit {
  tournaments = signal<Tournament[]>([]);
  loading = signal(true);
  filter = signal('');

  // The hero's example sign-up sheet. `teams` is null until the visitor presses the button;
  // `draws` only exists so a redraw re-keys the rows and replays their entrance.
  readonly players = SAMPLE_PLAYERS;
  readonly teams = signal<DrawnTeam[] | null>(null);
  readonly draws = signal(0);

  draw() {
    this.teams.set(pairTeams(shuffle(this.players)));
    this.draws.update(n => n + 1);
  }

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
    // Seeded examples are not real activity, so they never sit under "Live now" or
    // "Completed"; they get their own labelled group at the end.
    const all = this.matching();
    const rows = all.filter(t => !isExampleTournament(t));
    return ([
      { key: 'active',   label: 'Live now',   items: rows.filter(t => t.status === 'active') },
      { key: 'setup',    label: 'In setup',   items: rows.filter(t => t.status === 'setup') },
      { key: 'complete', label: 'Completed',  items: rows.filter(t => t.status === 'complete') },
      { key: 'example',  label: 'Example brackets', items: all.filter(t => isExampleTournament(t)) },
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

  // The pink "Live" badge means a real game is being played right now. A made-up example
  // is never that, however its seeded state reads, so it says where it stands instead.
  statusLabel(t: Tournament, example = false): string {
    if (t.status === 'active') return example ? 'In progress' : 'Live';
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
      // Pool play: live with pool rounds but no bracket yet.
      else if (!s.total_rounds && s.pool_rounds) {
        parts.push(s.pool_current_round ? `Pool round ${s.pool_current_round} of ${s.pool_rounds}` : 'Pool play finished');
      }
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
