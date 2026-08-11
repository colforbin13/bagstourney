// src/app/bracket/bracket-view.component.ts
import { Component, OnInit, AfterViewInit, OnDestroy, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { AuthService } from '../shared/services/auth.service';
import { Tournament, Match, BracketData } from '../shared/models/tournament.models';

interface ScoreEntry { team1: string; team2: string; }

@Component({
  selector: 'app-bracket-view',
  standalone: true,
  imports: [RouterLink, FormsModule],
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

  autoReload = false;
  private autoReloadTimer: number | null = null;
  readonly autoReloadIntervalMs = 30000;

  private resizeCenter = () => this.centerBracket();

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
    this.load();
  }

  ngAfterViewInit() {
    setTimeout(() => this.centerBracket(), 0);
    window.addEventListener('resize', this.resizeCenter);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeCenter);
    this.stopAutoReload();
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
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  // Participant names beneath a team name are only useful when the team name has been
  // customized away from the auto-generated "P1 & P2" default — otherwise they'd just
  // repeat what the team name already says. Same default-name comparison the backend
  // uses in ParticipantController::update() to decide whether a team name is still
  // auto-generated.
  teamParticipants(teamName: string | null, p1: string | null, p2: string | null): string | null {
    if (!teamName || !p1 || !p2) return null;
    if (teamName === `${p1} & ${p2}`) return null;
    return `${p1} · ${p2}`;
  }

  roundLabel(num: number, total: number): string {
    const fromEnd = total - num;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinal';
    if (fromEnd === 2) return 'Quarterfinal';
    return `Round ${num}`;
  }

  // ── Auto-reload ────────────────────────────────────────────────────────────

  onAutoReloadToggle(enabled: boolean) {
    this.autoReload = !!enabled;
    this.autoReload ? this.startAutoReload() : this.stopAutoReload();
  }

  private startAutoReload() {
    if (this.autoReloadTimer != null) return;
    this.load();
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