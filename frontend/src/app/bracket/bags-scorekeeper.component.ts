// src/app/bracket/bags-scorekeeper.component.ts
import { Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';
import {
  BAGS_PER_ROUND, BagsRound, BagsSettings, BustRule, DEFAULT_SETTINGS, MAX_TARGET, Pair, RoundResult, Side, SideThrow,
  isValidSettings, scoreGame, throwPoints,
} from '../shared/bags-score';

/** What survives a refresh: the game is replayed from its settings and rounds. */
interface StoredGame {
  v: 1;
  settings: BagsSettings;
  names: Pair<string>;
  rounds: BagsRound[];
}

export const STORAGE_KEY = 'bb_bags_game';
const DEFAULT_NAMES: Pair<string> = ['Team 1', 'Team 2'];
const NAME_MAX = 30;
const emptyRound = (): BagsRound => [{ in: 0, on: 0 }, { in: 0, on: 0 }];

/**
 * The free bags scorekeeper: score one game round by round, no account needed
 * (.scratch/bags-scorekeeper/spec.md). Like the blind draw generator it's a prerendered
 * search landing page that ends in an invite to run a whole tournament.
 *
 * All the rules live in shared/bags-score.ts. This component keeps only the settings, the
 * team names and the rounds thrown, and replays them, so undo is dropping the last round
 * and a refresh restores from localStorage. Storage is touched only in the browser, never
 * while prerendering, and any failure (private mode, a corrupt value) means a fresh game.
 */
@Component({
  selector: 'app-bags-scorekeeper',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="sheet-head">
      <h1>Cornhole score keeper</h1>
      <p class="lede">
        Keep score of a game of bags from your phone, round by round. Free, no account, and
        it keeps your game if the page reloads.
      </p>
    </header>

    <div class="sheet-body">
      <section class="tool" aria-label="Scoreboard">
        <div class="board">
          @for (side of sides; track side) {
            <div class="side" [class.won]="game().winner === side">
              <input class="name" [value]="names()[side]" (change)="rename(side, $any($event.target))"
                [attr.aria-label]="'Team ' + (side + 1) + ' name'" [maxLength]="nameMax" />
              <div class="score" aria-live="polite">{{ game().scores[side] }}</div>

              @if (!over()) {
                @for (kind of kinds; track kind.key) {
                  <div class="count">
                    <span class="count-label">{{ kind.label }}</span>
                    <div class="stepper">
                      <button type="button" class="step" (click)="bump(side, kind.key, -1)"
                        [disabled]="draft()[side][kind.key] === 0"
                        [attr.aria-label]="'One fewer ' + kind.aria + ' for ' + names()[side]">−</button>
                      <span class="value" [attr.data-testid]="'count-' + side + '-' + kind.key">{{ draft()[side][kind.key] }}</span>
                      <button type="button" class="step" (click)="bump(side, kind.key, 1)"
                        [disabled]="bagsThrown(side) >= bagsPerRound"
                        [attr.aria-label]="'One more ' + kind.aria + ' for ' + names()[side]">+</button>
                    </div>
                  </div>
                }
              }
            </div>
          }
        </div>

        @if (game().winner !== null) {
          <div class="result">
            <p class="winner">{{ names()[game().winner!] }} wins, {{ game().scores[game().winner!] }} to {{ game().scores[1 - game().winner!] }}</p>
            <div class="actions">
              <button type="button" class="btn btn-primary" (click)="newGame()">New game</button>
              <button type="button" class="btn" (click)="undo()">Undo last round</button>
            </div>
          </div>
        } @else {
          <p class="preview" aria-live="polite">{{ preview() }}</p>
          <div class="actions">
            <button type="button" class="btn btn-primary score-round" (click)="scoreRound()">Score round {{ game().rounds.length + 1 }}</button>
            <button type="button" class="btn" (click)="undo()" [disabled]="!game().rounds.length">Undo</button>
          </div>
        }
      </section>

      <section class="settings ruled">
        <h2>Game settings</h2>
        @if (started()) {
          <p class="locked">
            {{ settingsSummary() }}. Settings are fixed once a game starts.
          </p>
          @if (!over()) {
            <button type="button" class="btn btn-sm" (click)="newGame()">{{ confirmingNew() ? 'Tap again to clear this game' : 'New game' }}</button>
          }
        } @else {
          <fieldset>
            <legend>Scoring</legend>
            <label class="check"><input type="radio" name="mode" [checked]="settings().mode === 'cancellation'"
              (change)="setMode('cancellation')" /> Cancellation: only the difference counts</label>
            <label class="check"><input type="radio" name="mode" [checked]="settings().mode === 'straight'"
              (change)="setMode('straight')" /> Straight: both teams keep their points</label>
          </fieldset>
          <label class="field">
            <span>Play to</span>
            <input class="input target" type="number" inputmode="numeric" min="1" [max]="maxTarget"
              [value]="settings().target" (change)="setTarget($any($event.target))" />
          </label>
          <label class="field">
            <span>Going over</span>
            <select class="input" (change)="setBust($any($event.target).value)">
              <option value="off" [selected]="bustValue() === 'off'">Wins the game</option>
              <option value="13" [selected]="bustValue() === '13'" [disabled]="settings().target <= 13">Busts back to 13</option>
              <option value="15" [selected]="bustValue() === '15'" [disabled]="settings().target <= 15">Busts back to 15</option>
              <option value="previous" [selected]="bustValue() === 'previous'">Busts back to the score before the round</option>
            </select>
          </label>
        }
      </section>

      @if (game().rounds.length) {
        <section class="history ruled">
          <h2>Rounds</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{{ names()[0] }}</th>
                <th scope="col">{{ names()[1] }}</th>
              </tr>
            </thead>
            <tbody>
              @for (round of historyNewestFirst(); track round.round) {
                <tr>
                  <td class="num">{{ round.round }}</td>
                  @for (side of sides; track side) {
                    <td>
                      <span class="total">{{ round.scores[side] }}</span>
                      <span class="detail">{{ detail(round, side) }}</span>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      <section class="card live measure">
        <h2>Running a cornhole tournament?</h2>
        <p>
          Bracketway runs the whole night: players sign up from a QR code at the door, teams are
          drawn for you, scores go in from any phone, and the bracket updates on the TV as winners
          advance. Free up to 32 players.
        </p>
        @if (auth.isLoggedIn()) {
          <a class="btn btn-primary" routerLink="/admin">Create a tournament</a>
        } @else {
          <a class="btn btn-primary" routerLink="/admin/register">Run a tournament, free</a>
        }
      </section>

      <section class="about ruled measure">
        <h2>How cornhole scoring works</h2>
        <p>
          Each team throws four bags a round. A bag in the hole is worth 3 points and a bag on the
          board is worth 1. Bags that land on the ground, or hit it before the board, score
          nothing. The first team to 21 wins.
        </p>
        <h2>Cancellation scoring</h2>
        <p>
          Most games use cancellation scoring: the two teams' points cancel each other out, and
          only the team that scored more that round gets the difference. If one team scores 7
          and the other 4, the first team gets 3 and the second gets nothing. A round where
          both score the same counts for nobody. That's the default here.
        </p>
        <h2>Straight scoring</h2>
        <p>
          In straight scoring both teams keep everything they score. Games go faster, and both
          teams can reach 21 in the same round: the higher total wins, and a tie means another
          round.
        </p>
        <h2>Going over 21 (busting)</h2>
        <p>
          A common backyard rule says you have to land on 21 exactly. A team that goes over
          busts and drops back, usually to 13 or 15, or to wherever it was before the round.
          Pick the version your group plays under Game settings. Without it, reaching 21 or more
          wins.
        </p>
        <h2>Using the score keeper</h2>
        <ol>
          <li>Tap a team's name to change it, to a team name or a bag colour.</li>
          <li>After each round, count each team's bags in the hole and on the board.</li>
          <li>Tap "Score round". The score and the round list update, and a mistake is one Undo away.</li>
        </ol>
      </section>
    </div>
  `,
  styles: [`
    .tool { max-width: 560px; }
    .board { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .side { border: 1.5px solid var(--text); padding: 10px 10px 12px; min-width: 0; }
    .side.won { border-color: var(--marker); box-shadow: inset 0 0 0 1.5px var(--marker); }
    .side.won .score { color: var(--marker); }
    .name {
      width: 100%; border: none; border-bottom: 1px dashed var(--border); background: transparent;
      font: 700 16px var(--sans); color: var(--text); padding: 4px 0 6px; text-overflow: ellipsis;
    }
    .name:focus { outline: none; border-bottom: 1.5px solid var(--text); }
    .score {
      font-weight: 900; font-stretch: 106%; letter-spacing: -.04em; line-height: 1;
      font-size: clamp(3.6rem, 16vw, 5.5rem); font-variant-numeric: tabular-nums; margin: 4px 0 2px;
    }
    .count { display: grid; gap: 4px; margin-top: 8px; }
    .count-label { font-size: 0.8rem; font-weight: 600; color: var(--text-dim); white-space: nowrap; }
    .stepper { display: flex; align-items: center; justify-content: space-between; }
    .step {
      width: 44px; height: 44px; border: 1.5px solid var(--text); background: var(--surface);
      color: var(--text); font: 700 1.4rem/1 var(--sans); cursor: pointer; touch-action: manipulation;
    }
    .step:active:not(:disabled) { background: var(--surface-2); }
    .step:disabled { opacity: .35; cursor: not-allowed; }
    .value { flex: 1; min-width: 28px; text-align: center; font-weight: 800; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
    .preview { font-size: 0.9rem; color: var(--text-dim); margin: 10px 0 8px; min-height: 1.4em; }
    .actions { display: flex; gap: 10px; }
    .actions .btn { min-height: 48px; }
    .score-round { flex: 1; font-size: 1rem; }
    .result { margin-top: 14px; }
    .winner { font-size: 1.3rem; font-weight: 800; color: var(--marker); margin-bottom: 12px; }
    h2 { font-size: clamp(1.3rem, 2.2vw, 1.6rem); font-weight: 900; font-stretch: 106%; margin: 28px 0 12px; }
    .settings, .history, .about, .live { margin-top: clamp(32px, 4vw, 44px); }
    .settings > h2:first-child, .history > h2:first-child, .about > h2:first-child, .live h2 { margin-top: 0; }
    .settings { max-width: 560px; }
    fieldset { border: none; padding: 0; margin: 0 0 14px; display: grid; gap: 8px; }
    legend { font-weight: 600; margin-bottom: 8px; }
    .check { display: flex; align-items: center; gap: 10px; min-height: 44px; }
    .check input { width: 20px; height: 20px; accent-color: var(--text); }
    .field { display: grid; gap: 6px; margin-bottom: 14px; font-weight: 600; }
    .target { max-width: 120px; }
    .locked { color: var(--text-dim); line-height: 1.5; margin-bottom: 12px; }
    .btn-sm { min-height: 44px; }
    .history { max-width: 560px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    th:first-child, td.num { width: 36px; color: var(--muted); font-variant-numeric: tabular-nums; }
    .total { font-weight: 800; font-size: 1.1rem; font-variant-numeric: tabular-nums; margin-right: 8px; }
    .detail { font-size: 0.8rem; color: var(--text-dim); }
    .live p { color: var(--text-dim); line-height: 1.6; margin-bottom: 16px; }
    .about p, .about li { color: var(--text-dim); line-height: 1.6; }
    .about ol { padding-left: 20px; display: grid; gap: 6px; }
  `],
})
export class BagsScorekeeperComponent {
  readonly auth = inject(AuthService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly sides: Side[] = [0, 1];
  readonly kinds = [
    { key: 'in', label: 'In the hole', aria: 'bag in the hole' },
    { key: 'on', label: 'On the board', aria: 'bag on the board' },
  ] as const;
  readonly bagsPerRound = BAGS_PER_ROUND;
  readonly maxTarget = MAX_TARGET;
  readonly nameMax = NAME_MAX;

  readonly settings = signal<BagsSettings>({ ...DEFAULT_SETTINGS });
  readonly names = signal<Pair<string>>([...DEFAULT_NAMES]);
  readonly rounds = signal<BagsRound[]>([]);
  /** The round being counted, not yet scored. */
  readonly draft = signal<BagsRound>(emptyRound());
  /** "New game" mid-game takes a second tap, so a stray tap can't wipe the score. */
  readonly confirmingNew = signal(false);

  readonly game = computed(() => scoreGame(this.settings(), this.rounds()));
  readonly started = computed(() => this.rounds().length > 0);
  readonly over = computed(() => this.game().winner !== null);
  readonly historyNewestFirst = computed(() => [...this.game().rounds].reverse());
  readonly bustValue = computed(() => String(this.settings().bust));

  readonly preview = computed(() => {
    const game = this.game();
    const [a, b] = this.draft().map(throwPoints);
    const names = this.names();
    const tie = game.extraRounds ? `Tied at ${game.scores[0]}: play another round, no busting. ` : '';
    if (a === 0 && b === 0) return tie + 'Count each team’s bags, then score the round.';
    if (this.settings().mode === 'straight') return `${tie}This round: ${names[0]} ${a}, ${names[1]} ${b}.`;
    if (a === b) return `${tie}This round: ${a} each, so nobody scores.`;
    return `${tie}This round: ${names[a > b ? 0 : 1]} scores ${Math.abs(a - b)} (${a} to ${b}).`;
  });

  readonly settingsSummary = computed(() => {
    const { mode, target, bust } = this.settings();
    const scoring = mode === 'cancellation' ? 'Cancellation scoring' : 'Straight scoring';
    const over = bust === 'off' ? 'going over wins'
      : bust === 'previous' ? 'going over busts back to the score before the round'
      : `going over busts back to ${bust}`;
    return `${scoring} to ${target}, ${over}`;
  });

  constructor() {
    this.restore();
    effect(() => {
      const stored: StoredGame = { v: 1, settings: this.settings(), names: this.names(), rounds: this.rounds() };
      if (!this.browser) return;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // Storage full or blocked: the game still works, it just won't survive a reload.
      }
    });
  }

  bagsThrown(side: Side): number {
    const t = this.draft()[side];
    return t.in + t.on;
  }

  bump(side: Side, key: keyof SideThrow, delta: 1 | -1): void {
    const round = this.draft();
    const t = round[side];
    const value = t[key] + delta;
    if (value < 0 || (delta > 0 && t.in + t.on >= BAGS_PER_ROUND)) return;
    const next: BagsRound = [{ ...round[0] }, { ...round[1] }];
    next[side][key] = value;
    this.draft.set(next);
  }

  scoreRound(): void {
    if (this.over()) return;
    this.rounds.update(rounds => [...rounds, this.draft()]);
    this.draft.set(emptyRound());
    this.confirmingNew.set(false);
  }

  /** Drops the last round and puts its bags back in the counters, to fix and rescore. */
  undo(): void {
    const rounds = this.rounds();
    if (!rounds.length) return;
    const last = rounds[rounds.length - 1];
    this.rounds.set(rounds.slice(0, -1));
    this.draft.set([{ ...last[0] }, { ...last[1] }]);
    this.confirmingNew.set(false);
  }

  newGame(): void {
    if (this.started() && !this.over() && !this.confirmingNew()) {
      this.confirmingNew.set(true);
      return;
    }
    this.rounds.set([]);
    this.draft.set(emptyRound());
    this.confirmingNew.set(false);
  }

  rename(side: Side, input: HTMLInputElement): void {
    const name = input.value.trim().slice(0, NAME_MAX) || DEFAULT_NAMES[side];
    // Written back by hand: clearing "Team 1" sets the same signal value, so no redraw.
    input.value = name;
    const next: Pair<string> = [...this.names()];
    next[side] = name;
    this.names.set(next);
  }

  setMode(mode: BagsSettings['mode']): void {
    this.updateSettings({ mode });
  }

  setTarget(input: HTMLInputElement): void {
    const target = Math.round(Number(input.value));
    if (!input.value.trim() || !Number.isFinite(target)) {
      input.value = String(this.settings().target);
      return;
    }
    const clamped = Math.min(Math.max(target, 1), MAX_TARGET);
    const { bust } = this.settings();
    // A 13 or 15 set-back stops making sense at or below its own number.
    const keepBust = typeof bust === 'number' && clamped <= bust ? 'previous' : bust;
    this.updateSettings({ target: clamped, bust: keepBust });
    input.value = String(this.settings().target);
  }

  setBust(raw: string): void {
    const bust: BustRule = raw === '13' ? 13 : raw === '15' ? 15 : raw === 'previous' ? 'previous' : 'off';
    this.updateSettings({ bust });
  }

  detail(round: RoundResult, side: Side): string {
    const t = round.throws[side];
    const bags = `${t.in} in, ${t.on} on`;
    if (round.busted[side]) return `${bags}, bust`;
    return round.awarded[side] ? `${bags}, +${round.awarded[side]}` : bags;
  }

  /** Settings change only before the first round, so the history always matches the score. */
  private updateSettings(patch: Partial<BagsSettings>): void {
    if (this.started()) return;
    const next = { ...this.settings(), ...patch };
    if (isValidSettings(next)) this.settings.set(next);
  }

  private restore(): void {
    if (!this.browser) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredGame;
      if (stored?.v !== 1 || !Array.isArray(stored.rounds)) return;
      scoreGame(stored.settings, stored.rounds); // throws on anything invalid
      const names = Array.isArray(stored.names) ? stored.names : [];
      this.settings.set({ ...stored.settings });
      this.rounds.set(stored.rounds);
      this.names.set([0, 1].map(i =>
        typeof names[i] === 'string' && names[i].trim() ? names[i].trim().slice(0, NAME_MAX) : DEFAULT_NAMES[i]) as Pair<string>);
    } catch {
      // Blocked storage or a corrupt game: start fresh.
    }
  }
}
