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
  template: `
    <div class="page-wide">
      <div class="page-header" style="max-width:680px;margin:0 auto 28px;">
        <div>
          <a routerLink="/" style="color:var(--text-dim);font-size:.8rem;">← All tournaments</a>
          <h1 style="margin-top:4px;">{{ tournament()?.name }}</h1>
        </div>
        @if (tournament()) {
          <span class="badge badge-{{ tournament()!.status }}">{{ tournament()!.status }}</span>
        }
      </div>

      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (!rounds().length) {
        <div class="empty">Bracket not generated yet.</div>
      } @else {
        <div class="bracket">
          @for (round of rounds(); track round.num) {
            <div class="bracket-round" [style.--round-offset.px]="roundTopOffset(round.pos)" [style.--round-gap.px]="roundGap(round.pos)">
              <div class="round-label">
                {{ roundLabel(round.pos, totalRounds()) }}
              </div>
              <div class="bracket-matches">
                @for (match of round.matches; track match.id) {
                  <div class="match-card" [class.match-complete]="match.status === 'complete'" [class.match-pending]="match.status === 'pending'" [class.match-bye]="match.status === 'bye'">
                    <!-- Team 1 -->
                    <div class="match-team" [class.winner]="match.winner_id === match.team1_id && match.status === 'complete'" [class.loser]="match.winner_id === match.team2_id && match.status === 'complete'">
                      <span class="team-name">
                        {{ match.team1_name ?? ((match.status === 'bye' && !match.team1_id && match.team2_id) ? 'Bye' : 'TBD') }}
                        @if (tournament()?.status === 'complete' && round.pos === totalRounds() && match.winner_id === match.team1_id) {
                          <span class="champion-icon" aria-hidden="true">🏆</span>
                        }
                      </span>
                      @if (match.status === 'complete' && this.editingMatch !== match.id) {
                        <span class="team-score">{{ match.team1_score }}</span>
                      } @else if (auth.isLoggedIn() && (match.status === 'ready' || this.editingMatch === match.id)) {
                        <input class="input score-input" type="number" min="0"
                          [(ngModel)]="scores[match.id].team1"
                          [attr.aria-label]="'Score for ' + (match.team1_name ?? 'team 1')"
                          placeholder="0" />
                      }
                    </div>
                    <!-- Divider -->
                    <div class="match-divider"></div>
                    <!-- Team 2 -->
                    <div class="match-team" [class.winner]="match.winner_id === match.team2_id && match.status === 'complete'" [class.loser]="match.winner_id === match.team1_id && match.status === 'complete'">
                      <span class="team-name">
                        {{ match.team2_name ?? ((match.status === 'bye' && !match.team2_id && match.team1_id) ? 'Bye' : 'TBD') }}
                        @if (tournament()?.status === 'complete' && round.pos === totalRounds() && match.winner_id === match.team2_id) {
                          <span class="champion-icon" aria-hidden="true">🏆</span>
                        }
                      </span>
                      @if (match.status === 'complete' && this.editingMatch !== match.id) {
                        <span class="team-score">{{ match.team2_score }}</span>
                      } @else if (auth.isLoggedIn() && (match.status === 'ready' || this.editingMatch === match.id)) {
                        <input class="input score-input" type="number" min="0"
                          [(ngModel)]="scores[match.id].team2"
                          [attr.aria-label]="'Score for ' + (match.team2_name ?? 'team 2')"
                          placeholder="0" />
                      }
                    </div>

                    <!-- Score submit (admin only, ready matches) -->
                    @if (auth.isLoggedIn()) {
                      <div class="score-actions">
                        @if (match.status === 'ready' && this.editingMatch !== match.id) {
                          <button class="btn btn-primary btn-sm"
                            [disabled]="submitting() === match.id"
                            (click)="submitScore(match)">
                            @if (submitting() === match.id) {
                              <span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>
                            } @else {
                              Save
                            }
                          </button>
                        } @else if (match.status === 'complete' && this.editingMatch !== match.id) {
                          <button class="btn btn-sm" (click)="startEdit(match)">Edit</button>
                        } @else if (this.editingMatch === match.id) {
                          <button class="btn btn-primary btn-sm" (click)="submitScore(match)" [disabled]="submitting() === match.id">
                            Save
                          </button>
                          <button class="btn btn-sm" (click)="cancelEdit()">Cancel</button>
                        }
                      </div>
                    }
                    @if (match.status === 'bye') {
                      <div class="bye-note">Bye — auto-advanced</div>
                    }
                  </div>
                }
              </div>
            </div>
          }

          @if (tournament()?.status === 'complete') {
            <div class="champion">
              <div class="champion-name">
                <span class="champion-icon" aria-hidden="true">🏆</span>
                {{ champion() }}
              </div>
            </div>
          }
        </div>

        @if (error()) {
          <div class="toast toast-error">{{ error() }}</div>
        }
        @if (successMsg()) {
          <div class="toast toast-success">{{ successMsg() }}</div>
        }
      }
    </div>
  `,
  styles: [`
    /* ── Bracket layout ── */
    .bracket {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      justify-content: center; /* center rounds when there's space */
      gap: 12px;
      overflow-x: auto;
      padding-bottom: 16px;
      min-width: min-content;
    }

    .bracket-round {
      display: flex;
      flex-direction: column;
      gap: 0;
      min-width: 200px;
      --round-offset: 0px;
    }

    .round-label {
      font-family: var(--mono);
      font-size: 0.8rem;
      letter-spacing: 0;
      text-transform: uppercase;
      color: var(--text);
      margin-bottom: 12px;
      padding-left: 2px;
      font-weight: 600;
    }

    .bracket-matches {
      display: flex;
      flex-direction: column;
      gap: var(--round-gap, 12px);
      padding-top: var(--round-offset);
      /* Ensure each match-card top-to-top equals its height + gap: handled via inline round gap */
    }

    /* ── Match card ── */
    .match-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      transition: border-color .15s;

      &.match-complete { border-color: #2a2a2a; }
      &.match-pending  { opacity: .5; }
    }

    .match-team {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      gap: 8px;

      &.winner {
        background: rgba(37,99,235,0.06); /* subtle blue highlight */
        .team-name { color: var(--accent); font-weight: 600; }
        .team-score { color: var(--accent); }
      }
      &.loser {
        .team-name { color: var(--lose); }
        .team-score { color: var(--muted); }
      }
    }

    .team-name {
      font-size: 0.95rem;
      overflow-wrap: anywhere;
      white-space: normal;
      overflow: visible;
      max-width: none;
      min-width: 0;
      flex: 1 1 auto;
    }

    .team-score {
      font-family: var(--mono);
      font-size: 0.85rem;
      font-weight: 500;
      flex-shrink: 0;
      margin-left: 8px;
    }

    .match-divider {
      height: 1px;
      background: var(--border);
    }

    /* ── Score entry ── */
    .score-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 8px 10px;
      border-top: 1px solid var(--border);
      background: var(--surface);
    }

    .score-input {
      width: 54px;
      padding: 5px 8px;
      font-family: var(--mono);
      font-size: 16px;
      text-align: center;
      flex-shrink: 0;
    }

    /* ── Champion (inline) ── */
    .champion {
      align-self: center;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--radius);
      background: transparent;
      border: none;
      color: var(--accent);
    }

    .champion-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--accent);
    }

    .champion-icon {
      font-size: 1.1rem;
      line-height: 1;
      color: var(--accent);
      display: inline-block;
      margin-left: 6px;
      vertical-align: middle;
    }

    @media (max-width: 600px) {
      .champion {
        padding: 6px 8px;
        gap: 6px;
      }
      .champion-icon { font-size: 1rem; }
    }

    /* Mobile: stack rounds vertically */
    @media (max-width: 600px) {
      .bracket {
        flex-direction: column;
        overflow-x: visible;
      }
      .bracket-round {
        min-width: unset;
        width: 100%;
        --round-offset: 0px !important;
        /* Collapse per-round spacing on mobile */
        --round-gap: 8px !important;
      }
      .bracket-matches { gap: 8px !important; }
      .team-name { max-width: none; }
    }
  `]
})
export class BracketViewComponent implements OnInit, AfterViewInit, OnDestroy {
  tournament = signal<Tournament | null>(null);
  bracketData = signal<BracketData | null>(null);
  loading = signal(true);
  submitting = signal<number | null>(null);
  error = signal('');
  successMsg = signal('');

  scores: Record<number, ScoreEntry> = {};
  // Track which match is currently being edited (by id). Null when not editing.
  editingMatch: number | null = null;

  // Measured step between top of consecutive match-cards (height + gap)
  private matchStep: number = 84;
  private matchHeight: number = 72; // fallback estimate
  private baseGap: number = 12;
  private resizeHandler = () => this.updateMatchStep();


  rounds = computed(() => {
    const data = this.bracketData();
    if (!data) return [];
    const sorted = Object.entries(data.rounds)
      .map(([num, matches]) => ({ num: +num, matches: matches as Match[] }))
      .sort((a, b) => a.num - b.num);
    // Add a 1-based position index so labels and spacing use contiguous round numbers
    return sorted.map((r, i) => ({ ...r, pos: i + 1 }));
  });

  totalRounds = computed(() => this.rounds().length);

  champion = computed(() => {
    const rs = this.rounds();
    if (!rs.length) return null;
    const lastRound = rs[rs.length - 1];
    const final = lastRound?.matches[0];
    return final?.winner_name ?? null;
  });

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

  load() {
    this.loading.set(true);
    this.svc.getTournament(this.tournamentId).subscribe(t => this.tournament.set(t));
    this.svc.getBracket(this.tournamentId).subscribe({
      next: data => {
        this.bracketData.set(data);
        // Init score entry state
        Object.values(data.rounds).flat().forEach((m: Match) => {
          this.scores[m.id] = { team1: '', team2: '' };
        });
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  roundLabel(num: number, total: number): string {
    const fromEnd = total - num;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinal';
    if (fromEnd === 2) return 'Quarterfinal';
    return `Round ${num}`;
  }

  ngAfterViewInit() {
    // Measure initial match step after first paint and update on resize
    setTimeout(() => {
      this.updateMatchStep();
      this.centerBracket();
    }, 0);
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('resize', () => this.centerBracket());
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
  }

  private updateMatchStep() {
    try {
      const matchEl = document.querySelector('.bracket .match-card') as HTMLElement | null;
      const matchesContainer = document.querySelector('.bracket-matches') as HTMLElement | null;
      if (!matchEl) return;
      const matchH = matchEl.offsetHeight;
      let gap = 12;
      if (matchesContainer) {
        const cs = getComputedStyle(matchesContainer);
        const rowGap = cs.getPropertyValue('row-gap') || cs.getPropertyValue('gap');
        if (rowGap) {
          const parsed = parseFloat(rowGap);
          if (!isNaN(parsed)) gap = parsed;
        }
      }
      this.matchHeight = matchH;
      this.baseGap = gap;
      this.matchStep = matchH + gap;
      // After measuring, center bracket (useful if layout changed)
      setTimeout(() => this.centerBracket(), 0);
    } catch (e) {
      // fallback to existing default if measurement fails
      this.matchStep = Math.max(84, this.matchStep);
    }
  }

  roundTopOffset(roundNum: number): number {
    if (roundNum <= 1) return 0;
    // Use measured matchStep (height + gap) so offsets align with rendered sizes
    const step = this.matchStep || 84;
    return ((Math.pow(2, roundNum - 1) - 1) / 2) * step;
  }

  // Gap between matches within a given round (px). This ensures top-to-top distance equals step * 2^(roundNum-1)
  roundGap(roundNum: number): number {
    const step = this.matchStep || 84;
    const matchH = this.matchHeight || (step - 12);
    const desiredTopToTop = step * Math.pow(2, Math.max(0, roundNum - 1));
    const gap = desiredTopToTop - matchH;
    return Math.max(8, Math.round(gap));
  }

  // Center the bracket horizontally (useful when container wider than content or to auto-scroll)
  private centerBracket() {
    try {
      const el = document.querySelector('.bracket') as HTMLElement | null;
      if (!el) return;
      const scrollWidth = el.scrollWidth;
      const clientWidth = el.clientWidth;
      if (scrollWidth <= clientWidth) {
        // content fits — center via justify-content (already set) but ensure scrollLeft=0
        el.scrollLeft = 0;
        return;
      }
      // scroll so content is centered
      const centerScroll = Math.round((scrollWidth - clientWidth) / 2);
      el.scrollLeft = centerScroll;
    } catch (e) {
      // ignore
    }
  }

  submitScore(match: Match) {
    const entry = this.scores[match.id];
    const s1 = parseInt(entry.team1, 10);
    const s2 = parseInt(entry.team2, 10);

    if (isNaN(s1) || isNaN(s2)) {
      this.showError('Enter scores for both teams.');
      return;
    }
    if (s1 === s2) {
      this.showError('Scores cannot be tied.');
      return;
    }

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
    // Prefill scores with existing values
    this.scores[match.id] = {
      team1: match.team1_score !== null ? String(match.team1_score) : '',
      team2: match.team2_score !== null ? String(match.team2_score) : '',
    };
  }

  cancelEdit() {
    this.editingMatch = null;
  }

  private showError(msg: string) {
    this.error.set(msg);
    setTimeout(() => this.error.set(''), 3000);
  }

  private showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(''), 2000);
  }
}
