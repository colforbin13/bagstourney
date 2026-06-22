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

  champion = computed(() => {
    const rs = this.rounds();
    if (!rs.length) return null;
    const final = rs[rs.length - 1]?.matches[0];
    return final?.winner_name ?? null;
  });

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

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  private tournamentId!: number;

  constructor(
    private route: ActivatedRoute,
    private svc: TournamentService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.tournamentId = +this.route.snapshot.paramMap.get('id')!;
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

  load() {
    this.loading.set(true);
    this.svc.getTournament(this.tournamentId).subscribe(t => this.tournament.set(t));
    this.svc.getBracket(this.tournamentId).subscribe({
      next: data => {
        this.bracketData.set(data);
        Object.values(data.rounds).flat().forEach((m: Match) => {
          if (!this.scores[m.id]) {
            this.scores[m.id] = { team1: '', team2: '' };
          }
        });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

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