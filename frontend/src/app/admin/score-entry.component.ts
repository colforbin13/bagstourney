// src/app/admin/score-entry.component.ts
import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament, Match, BracketData, PoolMatch } from '../shared/models/tournament.models';
import { roundLabel, teamParticipants } from '../shared/bracket-labels';

// `key` rather than the match id identifies a row: pool games (FEATURE_TRACKER item 18) live
// in their own table, so a pool game and a bracket match can share an id.
interface ScoreRow { key: string; kind: 'bracket' | 'pool'; match: Match; label: string; }
interface ScoreEntry { team1: string; team2: string; }

/**
 * A scorekeeper's screen: the matches that can be played right now, and nothing else.
 * The bracket view can already take scores, but it makes you find the right card inside a
 * whole bracket — awkward on a phone out where play is happening, which is where scores
 * actually get entered. This lists only what's playable, largest-first.
 */
@Component({
  selector: 'app-score-entry',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page">
      @if (loadError()) {
        <div class="empty" style="padding:48px 24px">
          {{ loadError() }}
          <div style="margin-top:16px"><a routerLink="/admin" class="btn btn-sm">Back to Admin</a></div>
        </div>
      } @else {
        <div class="page-header" style="margin-bottom:16px">
          <div style="min-width:0">
            <a [routerLink]="['/admin/tournament', tournamentId]" style="color:var(--text-dim);font-size:.8rem;">← Manage</a>
            <h1 style="margin-top:4px">Enter Scores</h1>
            <div class="sub">{{ tournament()?.name }}</div>
          </div>
          <a class="btn btn-sm" [routerLink]="['/bracket', tournamentId]">View bracket</a>
        </div>

        @if (loading()) {
          <div class="empty"><span class="spinner"></span></div>
        } @else if (!canScore()) {
          <div class="empty">You don't have score access for this tournament.</div>
        } @else {
          <div class="section-label">
            Ready to play
            <span class="count">{{ readyMatches().length }}</span>
          </div>

          @if (readyMatches().length === 0) {
            <div class="empty">
              @if (tournament()?.status === 'complete') {
                This tournament is finished.
              } @else if (tournament()?.status === 'setup') {
                The bracket hasn't been generated yet.
              } @else if (bracketData()?.pool?.complete && !bracketData()?.pool?.locked) {
                Pool play is finished. The bracket is generated from the manage screen.
              } @else {
                Nothing to score right now — every ready match has been played.
              }
            </div>
          } @else {
            <div class="match-list">
              @for (row of readyMatches(); track row.key) {
                <div class="score-card">
                  <div class="score-card-round">{{ row.label }} · Match {{ row.match.match_number }}</div>
                  <div class="score-row">
                    <div class="score-team">
                      <div class="score-team-name">{{ row.match.team1_name }}</div>
                      @if (members(row.match.team1_name, row.match.team1_participant1_name, row.match.team1_participant2_name); as m) {
                        <div class="score-team-members">{{ m }}</div>
                      }
                    </div>
                    <input class="input score-input" type="number" inputmode="numeric" min="0"
                      [(ngModel)]="scores[row.key].team1"
                      [attr.aria-label]="'Score for ' + row.match.team1_name" placeholder="0" />
                  </div>
                  <div class="score-row">
                    <div class="score-team">
                      <div class="score-team-name">{{ row.match.team2_name }}</div>
                      @if (members(row.match.team2_name, row.match.team2_participant1_name, row.match.team2_participant2_name); as m) {
                        <div class="score-team-members">{{ m }}</div>
                      }
                    </div>
                    <input class="input score-input" type="number" inputmode="numeric" min="0"
                      [(ngModel)]="scores[row.key].team2"
                      [attr.aria-label]="'Score for ' + row.match.team2_name" placeholder="0" />
                  </div>
                  @if (rowError()[row.key]; as err) {
                    <div class="form-error">{{ err }}</div>
                  }
                  <button class="btn btn-primary score-save" [disabled]="submitting() === row.key"
                    (click)="save(row)">
                    @if (submitting() === row.key) {
                      <span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span> Saving…
                    } @else {
                      Save result
                    }
                  </button>
                </div>
              }
            </div>
          }

          @if (completedMatches().length > 0) {
            <hr class="divider" />
            <button type="button" class="link-btn" (click)="showCompleted.set(!showCompleted())">
              {{ showCompleted() ? 'Hide' : 'Show' }} completed matches ({{ completedMatches().length }})
            </button>

            @if (showCompleted()) {
              <div class="match-list" style="margin-top:12px">
                @for (row of completedMatches(); track row.key) {
                  <div class="score-card is-complete">
                    <div class="score-card-round">{{ row.label }} · Match {{ row.match.match_number }}</div>
                    @if (editing() === row.key) {
                      <div class="score-row">
                        <div class="score-team"><div class="score-team-name">{{ row.match.team1_name }}</div></div>
                        <input class="input score-input" type="number" inputmode="numeric" min="0"
                          [(ngModel)]="scores[row.key].team1"
                          [attr.aria-label]="'Score for ' + row.match.team1_name" />
                      </div>
                      <div class="score-row">
                        <div class="score-team"><div class="score-team-name">{{ row.match.team2_name }}</div></div>
                        <input class="input score-input" type="number" inputmode="numeric" min="0"
                          [(ngModel)]="scores[row.key].team2"
                          [attr.aria-label]="'Score for ' + row.match.team2_name" />
                      </div>
                      @if (rowError()[row.key]; as err) {
                        <div class="form-error">{{ err }}</div>
                      }
                      <div class="edit-actions">
                        <button class="btn btn-sm" (click)="cancelEdit()">Cancel</button>
                        <button class="btn btn-sm btn-primary" [disabled]="submitting() === row.key"
                          (click)="save(row)">Save</button>
                      </div>
                    } @else {
                      <div class="score-row done">
                        <span class="score-team-name" [class.won]="row.match.winner_id === row.match.team1_id">{{ row.match.team1_name }}</span>
                        <span class="final-score">{{ row.match.team1_score }}</span>
                      </div>
                      <div class="score-row done">
                        <span class="score-team-name" [class.won]="row.match.winner_id === row.match.team2_id">{{ row.match.team2_name }}</span>
                        <span class="final-score">{{ row.match.team2_score }}</span>
                      </div>
                      <button class="btn btn-sm" (click)="startEdit(row)">Fix this score</button>
                    }
                  </div>
                }
              </div>
            }
          }
        }
      }

      @if (toast()) {
        <div class="toast" [class.toast-success]="toastType() === 'success'" [class.toast-error]="toastType() === 'error'">{{ toast() }}</div>
      }
    </div>
  `,
  styles: [`
    .sub { font-size: .85rem; color: var(--text-dim); margin-top: 4px; }
    .section-label {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .count {
      background: var(--border);
      color: var(--text);
      border-radius: 10px;
      padding: 1px 7px;
      font-size: .65rem;
    }
    .match-list { display: flex; flex-direction: column; gap: 12px; }
    .score-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: var(--radius);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .score-card.is-complete { border-left-color: var(--marker); }
    .score-card-round {
      font-family: var(--mono);
      font-size: .65rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .score-row { display: flex; align-items: center; gap: 12px; }
    .score-row.done { justify-content: space-between; font-size: .9rem; }
    .score-team { flex: 1; min-width: 0; }
    .score-team-name { font-weight: 500; font-size: .95rem; }
    .score-team-name.won { color: var(--marker); font-weight: 600; }
    .score-team-members { font-size: .75rem; color: var(--muted); margin-top: 2px; }
    /* Wide and tall on purpose — this gets tapped on a phone, outdoors, one-handed. */
    .score-input { width: 76px; flex-shrink: 0; text-align: center; font-size: 1.1rem; padding: 12px 8px; }
    .final-score { font-family: var(--mono); font-size: 1rem; }
    .score-save { width: 100%; justify-content: center; padding: 12px; }
    .edit-actions { display: flex; gap: 8px; justify-content: flex-end; }
    .form-error { font-size: .8rem; color: var(--danger); }
    .link-btn {
      border: none;
      background: transparent;
      padding: 0;
      font-family: inherit;
      font-size: .85rem;
      color: var(--accent);
      text-decoration: underline;
      cursor: pointer;
    }
  `]
})
export class ScoreEntryComponent implements OnInit, OnDestroy {
  tournament = signal<Tournament | null>(null);
  bracketData = signal<BracketData | null>(null);
  loading = signal(true);
  loadError = signal('');
  submitting = signal<string | null>(null);
  rowError = signal<Record<string, string>>({});
  showCompleted = signal(false);
  editing = signal<string | null>(null);
  toast = signal('');
  toastType = signal<'success' | 'error'>('success');

  scores: Record<string, ScoreEntry> = {};
  tournamentId!: number;

  // Another scorekeeper at the far end of the venue may be filling the same bracket in, so
  // the list refreshes itself. Typed-but-unsaved scores survive it — see applyBracket().
  private refreshTimer: number | null = null;
  readonly refreshIntervalMs = 30000;

  canScore = computed(() => this.tournament()?.capabilities?.can_score ?? false);

  // Flattened in play order: pool games first (while the pool is still open), then the whole
  // winners bracket, then the losers bracket, then the grand final. Labels are qualified
  // per side, so "Round 2" alone can never be ambiguous between the two trees.
  private flatMatches = computed<ScoreRow[]>(() => {
    const data = this.bracketData();
    if (!data) return [];
    const out: ScoreRow[] = [];
    // Once the bracket exists the pool is locked server-side, so its games drop off this
    // screen rather than offering a "Fix this score" that can only fail.
    if (data.pool && !data.pool.locked) {
      for (const round of data.pool.rounds) {
        for (const pm of round.matches) {
          out.push({ key: 'p' + pm.id, kind: 'pool', match: poolAsMatch(pm), label: `Pool round ${round.round}` });
        }
      }
    }
    for (const side of data.sides ?? []) {
      const total = side.rounds.length;
      side.rounds.forEach((round, i) => {
        const label = roundLabel(i + 1, total, side.side, data.format);
        for (const match of round.matches) out.push({ key: 'b' + match.id, kind: 'bracket', match, label });
      });
    }
    return out;
  });

  // Byes never appear: they're auto-advanced placeholders with no score to enter.
  readyMatches = computed(() => this.flatMatches().filter(r => r.match.status === 'ready'));

  // Newest first — a scorekeeper fixing a typo almost always means the one just entered.
  completedMatches = computed(() =>
    this.flatMatches().filter(r => r.match.status === 'complete').reverse());

  constructor(private route: ActivatedRoute, private svc: TournamentService) {}

  ngOnInit() {
    const param = this.route.snapshot.paramMap.get('id');
    if (!param || !/^\d+$/.test(param)) {
      this.loading.set(false);
      this.loadError.set('Tournament not found.');
      return;
    }
    this.tournamentId = +param;
    this.load();
    this.refreshTimer = window.setInterval(() => {
      if (!this.loading() && this.submitting() === null) this.load(true);
    }, this.refreshIntervalMs) as unknown as number;
  }

  ngOnDestroy() {
    if (this.refreshTimer != null) clearInterval(this.refreshTimer);
  }

  load(silent = false) {
    if (!silent) this.loading.set(true);
    this.svc.getTournament(this.tournamentId).subscribe({
      next: t => this.tournament.set(t),
      error: () => { this.loading.set(false); this.loadError.set('Tournament not found, or you do not have access to it.'); },
    });
    this.svc.getBracket(this.tournamentId).subscribe({
      next: data => this.applyBracket(data),
      error: () => this.loading.set(false),
    });
  }

  private applyBracket(data: BracketData) {
    this.bracketData.set(data);
    for (const row of this.flatMatches()) {
      // Only seed a row that has no entry yet, so a background refresh never wipes a
      // score somebody is halfway through typing.
      if (!this.scores[row.key]) {
        this.scores[row.key] = {
          team1: row.match.team1_score?.toString() ?? '',
          team2: row.match.team2_score?.toString() ?? '',
        };
      }
    }
    this.loading.set(false);
  }

  // Only shown once a team has been renamed away from its auto-generated "P1 & P2", so
  // the line doesn't just repeat the team name back. Shared with the bracket view.
  members(teamName: string | null, p1: string | null, p2: string | null): string | null {
    return teamParticipants(teamName, p1, p2);
  }

  startEdit(row: ScoreRow) {
    this.scores[row.key] = {
      team1: row.match.team1_score?.toString() ?? '',
      team2: row.match.team2_score?.toString() ?? '',
    };
    this.editing.set(row.key);
  }

  cancelEdit() {
    this.editing.set(null);
    this.rowError.set({});
  }

  save(row: ScoreRow) {
    const match = row.match;
    const entry = this.scores[row.key];
    const team1 = Number(entry?.team1);
    const team2 = Number(entry?.team2);

    if (entry?.team1 === '' || entry?.team2 === '' || Number.isNaN(team1) || Number.isNaN(team2)) {
      this.setRowError(row.key, 'Enter both scores.');
      return;
    }
    if (team1 < 0 || team2 < 0) {
      this.setRowError(row.key, 'Scores cannot be negative.');
      return;
    }
    // Checked here as well as server-side so the message lands next to the inputs rather
    // than as a toast after a round trip.
    if (team1 === team2) {
      this.setRowError(row.key, 'Scores cannot be tied — there has to be a winner.');
      return;
    }

    this.setRowError(row.key, '');
    this.submitting.set(row.key);
    const request = row.kind === 'pool'
      ? this.svc.updatePoolScore(match.id, team1, team2)
      : this.svc.updateScore(match.id, team1, team2);
    request.subscribe({
      next: () => {
        this.submitting.set(null);
        this.editing.set(null);
        const winner = team1 > team2 ? match.team1_name : match.team2_name;
        this.showToast(`${winner} wins.`, 'success');
        // Reload rather than patch: saving a result can make the next match ready, and
        // editing a finished one can clear results downstream.
        this.load(true);
      },
      error: err => {
        this.submitting.set(null);
        this.setRowError(row.key, err?.error?.error ?? 'Could not save that score.');
      },
    });
  }

  private setRowError(key: string, message: string) {
    this.rowError.update(errs => ({ ...errs, [key]: message }));
  }

  private showToast(msg: string, type: 'success' | 'error') {
    this.toast.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toast.set(''), 2500);
  }
}

// A pool game in the shape the score cards already render. It has no forward edges and no
// participant-name columns, so those are null; the cards only show the team names.
function poolAsMatch(pm: PoolMatch): Match {
  return {
    id: pm.id, tournament_id: 0, round: pm.round, match_number: pm.match_number,
    team1_id: pm.team1_id, team2_id: pm.team2_id,
    team1_score: pm.team1_score, team2_score: pm.team2_score, winner_id: pm.winner_id,
    next_match_id: null, next_match_slot: null, status: pm.status,
    team1_name: pm.team1_name, team2_name: pm.team2_name, winner_name: null,
    team1_participant1_name: null, team1_participant2_name: null,
    team2_participant1_name: null, team2_participant2_name: null,
  };
}
