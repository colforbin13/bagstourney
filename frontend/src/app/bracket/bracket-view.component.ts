// src/app/bracket/bracket-view.component.ts
import { Component, OnInit, AfterViewInit, OnDestroy, signal, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { AuthService } from '../shared/services/auth.service';
import { Tournament, Match, BracketData } from '../shared/models/tournament.models';
import { roundLabel as labelForRound, teamParticipants as participantsFor } from '../shared/bracket-labels';

interface ScoreEntry { team1: string; team2: string; }

interface Connector { y1: number; y2: number; mid: number; }

/** One round column of one half of the mirrored (TV) layout. */
interface MirrorRound {
  pos: number;
  label: string;
  matches: { match: Match; gridRow: string }[];
  connectors: Connector[];
}

interface MirrorLayout {
  /** Row units per side — half the height the single-sided layout would need. */
  rows: number;
  /** Outer → inner: round 1 first, the round before the final last. */
  left: MirrorRound[];
  /** Inner → outer, i.e. already reversed for left-to-right rendering. */
  right: MirrorRound[];
  final: Match | null;
}

@Component({
  selector: 'app-bracket-view',
  standalone: true,
  imports: [RouterLink, FormsModule, NgTemplateOutlet],
  templateUrl: './bracket-view.component.html',
  styleUrl: './bracket-view.component.css'
})
export class BracketViewComponent implements OnInit, AfterViewInit, OnDestroy {
  tournament  = signal<Tournament | null>(null);
  bracketData = signal<BracketData | null>(null);
  loading     = signal(true);
  submitting  = signal<number | null>(null);
  error       = signal('');
  successMsg  = signal('');

  scores: Record<number, ScoreEntry> = {};
  editingMatch: number | null = null;

  autoReload = true;
  private autoReloadTimer: number | null = null;
  readonly autoReloadIntervalMs = 60000;

  // ── TV / kiosk mode ────────────────────────────────────────────────────────
  // Driven by the ?kiosk=1 query parameter rather than component state alone, so the
  // whole thing is a bookmarkable URL — which is the only practical way to get a Fire TV
  // stick or similar onto the right screen, since typing a URL once beats hunting for a
  // toggle with a remote.
  kiosk = signal(false);
  fitScale = signal(1);

  // Must stay in step with the max-width used by the mobile block in the component's CSS.
  private static readonly NARROW_QUERY = '(max-width: 600px)';
  private narrowMedia = window.matchMedia(BracketViewComponent.NARROW_QUERY);
  isNarrow = signal(window.matchMedia(BracketViewComponent.NARROW_QUERY).matches);
  private onNarrowChange = (e: MediaQueryListEvent) => this.isNarrow.set(e.matches);

  // Breathing room around the scaled bracket. Generous on purpose: many TVs overscan and
  // crop a few percent off every edge, which would otherwise clip the outer rounds.
  private readonly kioskMarginPx = 28;
  // Cap on enlargement for small brackets on big screens. Beyond roughly this, scaled
  // text starts to look soft, and a four-team bracket filling a 65" screen is silly.
  private readonly maxKioskScale = 2.5;

  private resizeCenter = () => { this.centerBracket(); this.recomputeFit(); };
  private onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.kiosk()) this.setKiosk(false);
  };

  // ── Computed bracket data ──────────────────────────────────────────────────

  rounds = computed(() => {
    const data = this.bracketData();
    if (!data) return [];
    return Object.entries(data.rounds)
      .map(([num, matches]) => ({ num: +num, matches: matches as Match[] }))
      .sort((a, b) => a.num - b.num)
      .map((r, i) => ({ ...r, pos: i + 1 }));
  });

  totalRounds = computed(() => this.rounds().length);

  // Must stay in sync with --row-unit, which this binds onto .bracket-matches — single
  // source of truth for both the CSS grid track size and the connector-line pixel math
  // below, which needs the same value to compute match centers.
  readonly rowUnitPx = 150;
  readonly gutterWidth = 32;

  champion = computed(() => {
    const rs = this.rounds();
    if (!rs.length) return null;
    const final = rs[rs.length - 1]?.matches[0];
    return final?.winner_name ?? null;
  });

  // Whether the current viewer can actually submit/edit scores for this tournament —
  // distinct from auth.isLoggedIn(), which only says they're logged in as *someone*,
  // not that they have a role on *this* tournament.
  canScore = computed(() => this.tournament()?.capabilities?.can_score ?? false);

  // Kiosk mode is a display, not a console — score inputs and Save/Edit buttons are
  // suppressed even for staff, so nothing on a screen in a crowded room is one stray
  // click away from rewriting a result.
  showScoring = computed(() => this.canScore() && !this.kiosk());

  // ── Grid helpers ───────────────────────────────────────────────────────────

  /**
   * How many grid row units the entire round column needs.
   * Round 1 has N matches each spanning 1 row unit → N total rows.
   * Round 2 has N/2 matches each spanning 2 row units → still N total rows.
   * So every round needs the same number of rows: the round-1 match count × 1.
   * We derive that from totalRounds: bracketSize = 2^totalRounds, so
   * round-1 match count = bracketSize / 2 = 2^(totalRounds-1).
   */
  totalGridRows(roundPos: number): number {
    // All rounds share the same total row count so heights stay consistent.
    // total rows = number of round-1 matches = 2^(totalRounds - 1)
    const total = this.totalRounds();
    return Math.pow(2, total - 1);
  }

  /**
   * Each match card spans 2^(roundPos-1) row units.
   * Match N (1-based) starts at row: (N-1) * span + 1.
   * Returns a CSS grid-row string e.g. "3 / span 2".
   */
  matchGridRow(matchNumber: number, roundPos: number): string {
    const span  = Math.pow(2, roundPos - 1);
    const start = (matchNumber - 1) * span + 1;
    return `${start} / span ${span}`;
  }

  // ── Bracket connector lines ─────────────────────────────────────────────────
  // Drawn in the gutter between two round columns, purely from match_number/round
  // position math — no DOM measurement needed, since .bracket-matches is a fixed-size
  // grid (rowUnitPx × totalGridRows) and every match's vertical center is therefore
  // exactly derivable, the same way matchGridRow() derives its grid-row placement.

  /** Vertical pixel center of a match's row-block, relative to its round's own top. */
  private matchCenterPx(matchNumber: number, roundPos: number): number {
    const span = Math.pow(2, roundPos - 1);
    const rowStart = (matchNumber - 1) * span + 1;
    return (rowStart - 1 + span / 2) * this.rowUnitPx;
  }

  // ── Mirrored layout ────────────────────────────────────────────────────────
  // The bracket plays inward from both edges toward the final in the middle, the way a
  // printed tournament bracket reads: half of round 1 down the left, half down the right.
  // That halves the height and roughly doubles the width, which is the whole point — a
  // 16-slot bracket was 899×1231 and had to be shrunk to fit any screen, where mirrored
  // it is about 1592×630 and fits with room to spare, so the text lands much larger.
  //
  // Not used for a 2-team bracket (round 1 *is* the final, nothing to mirror), nor on a
  // narrow screen, which keeps the existing stacked layout untouched. That switch has to
  // happen in the markup rather than in CSS: collapsing the mirrored DOM into one column
  // would read round 1, round 2, final, round 2, round 1 down the page, instead of
  // grouping each round together the way the phone layout always has. Kiosk mode ignores
  // the width entirely — a stick browser reporting a narrow viewport still wants the real
  // bracket, and it gets scaled to fit regardless.
  useMirrorLayout = computed(() => this.totalRounds() >= 2 && (this.kiosk() || !this.isNarrow()));

  mirrorLayout = computed<MirrorLayout | null>(() => {
    const rs = this.rounds();
    const n = rs.length;
    if (n < 2) return null;

    // Every round contributes the same number of row units per side:
    // (matches per side) × (span each) = 2^(n-pos-1) × 2^(pos-1) = 2^(n-2).
    const rows = Math.pow(2, n - 2);

    const buildSide = (side: 'left' | 'right'): MirrorRound[] => {
      const out: MirrorRound[] = [];
      for (let pos = 1; pos <= n - 1; pos++) {
        const round = rs[pos - 1];
        const perSide = Math.pow(2, n - pos - 1);
        const span = Math.pow(2, pos - 1);
        // The left half takes match numbers 1..perSide, the right half the rest — the
        // same split a printed bracket makes, so pairings stay intact on both sides.
        const offset = side === 'left' ? 0 : perSide;

        const matches: { match: Match; gridRow: string }[] = [];
        for (let k = 1; k <= perSide; k++) {
          const match = round.matches.find(m => m.match_number === k + offset);
          if (!match) continue;
          matches.push({ match, gridRow: `${(k - 1) * span + 1} / span ${span}` });
        }

        out.push({ pos, label: this.roundLabel(pos, n), matches, connectors: this.mirrorConnectors(perSide, span) });
      }
      return out;
    };

    return {
      rows,
      left: buildSide('left'),
      right: buildSide('right').reverse(),
      final: rs[n - 1]?.matches[0] ?? null,
    };
  });

  /**
   * Connectors for one half of one round, in that half's own coordinates. Identical
   * geometry to roundConnectors() but indexed within the half rather than the whole
   * round. The last round before the final has a single match per side, which falls out
   * of this as y1 === y2 === mid — a straight line into the final, exactly right, since
   * that match spans every row and so shares the final's vertical center.
   */
  private mirrorConnectors(perSide: number, span: number): Connector[] {
    const centerOf = (k: number) => ((k - 1) * span + span / 2) * this.rowUnitPx;
    const out: Connector[] = [];
    for (let k = 1; k <= perSide; k += 2) {
      const y1 = centerOf(k);
      const y2 = k + 1 <= perSide ? centerOf(k + 1) : y1;
      out.push({ y1, y2, mid: (y1 + y2) / 2 });
    }
    return out;
  }

  /**
   * One entry per match-pair in this round, describing where its connector into the
   * next round should be drawn: y1/y2 are the two matches' own centers (where their
   * horizontal stubs start), mid is the merge point — which, by the same span doubling
   * matchGridRow() relies on, lands exactly on the next round's match center too.
   * Empty for the final round, which has no next round to connect to.
   */
  roundConnectors(round: { matches: Match[]; pos: number }): { y1: number; y2: number; mid: number }[] {
    if (round.pos >= this.totalRounds()) return [];
    const byNumber = new Map(round.matches.map(m => [m.match_number, m]));
    const pairs: { y1: number; y2: number; mid: number }[] = [];
    for (let i = 1; i <= round.matches.length; i += 2) {
      const a = byNumber.get(i);
      if (!a) continue;
      const b = byNumber.get(i + 1);
      const y1 = this.matchCenterPx(a.match_number, round.pos);
      const y2 = b ? this.matchCenterPx(b.match_number, round.pos) : y1;
      pairs.push({ y1, y2, mid: (y1 + y2) / 2 });
    }
    return pairs;
  }

  /**
   * SVG path for one pair's connector: each match's stub out to the gutter midpoint
   * (drawn as two separate subpaths from either end, meeting at `mid` with no visible
   * seam), then one stub continuing from the midpoint into the next round's match.
   */
  connectorPath(c: { y1: number; y2: number; mid: number }): string {
    const half = this.gutterWidth / 2;
    return `M 0 ${c.y1} H ${half} V ${c.mid} M 0 ${c.y2} H ${half} V ${c.mid} M ${half} ${c.mid} H ${this.gutterWidth}`;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  private tournamentId!: number;
  private uuid: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private svc: TournamentService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    const param = this.route.snapshot.paramMap.get('id')!;
    if (/^\d+$/.test(param)) {
      this.tournamentId = +param;
    } else {
      this.uuid = param;
    }

    // Subscribed rather than read from the snapshot so toggling the mode (which just
    // rewrites the query string) drives the same code path as arriving on the URL cold.
    this.route.queryParamMap.subscribe(params => {
      const on = params.get('kiosk') === '1';
      this.kiosk.set(on);
      document.body.classList.toggle('kiosk-mode', on);
      setTimeout(() => this.recomputeFit(), 0);
    });

    this.load();

    // A bracket on a wall during a tournament is worthless if it's showing the score from
    // an hour ago. The checkbox has always rendered ticked by default, but nothing ever
    // started the timer unless you toggled it off and on again — so the default state was
    // a lie. Start it here to match what the checkbox claims.
    if (this.autoReload) this.startAutoReload(false);
  }

  ngAfterViewInit() {
    setTimeout(() => { this.centerBracket(); this.recomputeFit(); }, 0);
    window.addEventListener('resize', this.resizeCenter);
    window.addEventListener('keydown', this.onKeydown);
    this.narrowMedia.addEventListener('change', this.onNarrowChange);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeCenter);
    window.removeEventListener('keydown', this.onKeydown);
    this.narrowMedia.removeEventListener('change', this.onNarrowChange);
    document.body.classList.remove('kiosk-mode');
    this.stopAutoReload();
  }

  // ── TV / kiosk mode ────────────────────────────────────────────────────────

  setKiosk(on: boolean) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { kiosk: on ? 1 : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Scales the bracket so the whole thing fits the viewport at once — the point of the
   * mode, since a bracket beyond about eight teams is taller than a 1080p screen and no
   * one is going to scroll a television.
   *
   * A CSS transform is the tool here because it scales the connector SVGs and the text
   * along with the layout, keeping the bracket's proportions exactly as designed. Note
   * that offsetWidth/offsetHeight report the *pre-transform* box, so re-fitting never has
   * to reset the scale and measure again.
   */
  private recomputeFit() {
    if (!this.kiosk()) { this.fitScale.set(1); return; }
    try {
      const stage = document.querySelector('.fit-stage') as HTMLElement | null;
      const inner = document.querySelector('.fit-inner') as HTMLElement | null;
      if (!stage || !inner) return;

      const naturalW = inner.offsetWidth;
      const naturalH = inner.offsetHeight;
      if (!naturalW || !naturalH) return;

      const availW = stage.clientWidth - this.kioskMarginPx * 2;
      const availH = stage.clientHeight - this.kioskMarginPx * 2;
      if (availW <= 0 || availH <= 0) return;

      const scale = Math.min(availW / naturalW, availH / naturalH);
      this.fitScale.set(Math.min(this.maxKioskScale, Math.max(0.1, scale)));
    } catch { /* ignore */ }
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  // Fires the tournament and bracket fetches in parallel, keyed consistently off however
  // this page was reached: numeric id (authenticated admin routes) or uuid (the public,
  // non-guessable bracket link — including for private tournaments, where knowing the
  // uuid is itself the access grant; the numeric-id endpoints require a role and would
  // 404 for an anonymous viewer even after the tournament itself resolved by uuid). This
  // must stay uuid-based on every call, not just the first: auto-reload (startAutoReload())
  // calls this same method on a timer, and previously fell back to the numeric-id path,
  // silently breaking a private tournament's live bracket updates after the first load.
  load() {
    this.loading.set(true);
    if (this.uuid) {
      this.svc.getTournamentByUuid(this.uuid).subscribe({
        next: t => { this.tournament.set(t); this.tournamentId = t.id; },
        error: () => this.showError('Tournament not found.'),
      });
      this.svc.getBracketByUuid(this.uuid).subscribe({
        next: data => this.applyBracketData(data),
        error: () => this.loading.set(false),
      });
    } else {
      this.svc.getTournament(this.tournamentId).subscribe({
        next: t => this.tournament.set(t),
        error: () => this.showError('Tournament not found.'),
      });
      this.svc.getBracket(this.tournamentId).subscribe({
        next: data => this.applyBracketData(data),
        error: () => this.loading.set(false),
      });
    }
  }

  private applyBracketData(data: BracketData) {
    this.bracketData.set(data);
    Object.values(data.rounds).flat().forEach((m: Match) => {
      if (!this.scores[m.id]) {
        this.scores[m.id] = { team1: '', team2: '' };
      }
    });
    this.loading.set(false);
    // The bracket's natural size changes as rounds arrive (and can change again on an
    // auto-reload, once byes resolve into real matchups), so re-fit after each render.
    setTimeout(() => { this.centerBracket(); this.recomputeFit(); }, 0);
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  // Both kept as methods so the templates call them unchanged; the logic is shared with
  // the score-entry screen.
  teamParticipants(teamName: string | null, p1: string | null, p2: string | null): string | null {
    return participantsFor(teamName, p1, p2);
  }

  roundLabel(pos: number, total: number): string {
    return labelForRound(pos, total);
  }

  // ── Auto-reload ────────────────────────────────────────────────────────────

  onAutoReloadToggle(enabled: boolean) {
    this.autoReload = !!enabled;
    this.autoReload ? this.startAutoReload() : this.stopAutoReload();
  }

  // `immediate` is false when starting up, where ngOnInit has already issued the first
  // load — ticking the checkbox by hand, on the other hand, should refresh right away.
  private startAutoReload(immediate = true) {
    if (this.autoReloadTimer != null) return;
    if (immediate) this.load();
    this.autoReloadTimer = window.setInterval(() => {
      if (!this.loading()) this.load();
    }, this.autoReloadIntervalMs) as unknown as number;
  }

  private stopAutoReload() {
    if (this.autoReloadTimer != null) {
      clearInterval(this.autoReloadTimer);
      this.autoReloadTimer = null;
    }
  }

  // ── Bracket centering ──────────────────────────────────────────────────────

  private centerBracket() {
    try {
      const el = document.querySelector('.bracket') as HTMLElement | null;
      if (!el) return;
      if (el.scrollWidth <= el.clientWidth) { el.scrollLeft = 0; return; }
      el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) / 2);
    } catch { /* ignore */ }
  }

  // ── Score submission ───────────────────────────────────────────────────────

  submitScore(match: Match) {
    const entry = this.scores[match.id];
    const s1 = parseInt(entry.team1, 10);
    const s2 = parseInt(entry.team2, 10);

    if (isNaN(s1) || isNaN(s2)) { this.showError('Enter scores for both teams.'); return; }
    if (s1 === s2)               { this.showError('Scores cannot be tied.');       return; }

    this.submitting.set(match.id);
    this.svc.updateScore(match.id, s1, s2).subscribe({
      next: () => {
        this.submitting.set(null);
        this.editingMatch = null;
        this.showSuccess('Score saved!');
        this.load();
      },
      error: (err) => {
        this.submitting.set(null);
        this.showError(err?.error?.error ?? 'Failed to save score.');
      },
    });
  }

  startEdit(match: Match) {
    this.editingMatch = match.id;
    this.scores[match.id] = {
      team1: match.team1_score !== null ? String(match.team1_score) : '',
      team2: match.team2_score !== null ? String(match.team2_score) : '',
    };
  }

  cancelEdit() { this.editingMatch = null; }

  // ── Toasts ─────────────────────────────────────────────────────────────────

  private showError(msg: string) {
    this.error.set(msg);
    setTimeout(() => this.error.set(''), 3000);
  }

  private showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(''), 2000);
  }
}