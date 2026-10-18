// src/app/bracket/blind-draw-generator.component.ts
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';
import { parseNameList } from '../shared/name-list';
import {
  DrawnTeam, MAX_PLAYERS, MIN_PLAYERS, PreviewRound, Slot, isBye, pairTeams, previewBracket, shuffle, teamName,
} from '../shared/blind-draw';

/**
 * The free blind draw generator: paste names, get random two-player teams and a seeded
 * bracket preview, no account needed. Marketing handoff item 3. It's prerendered
 * (app.routes.server.ts) so its copy can rank for the searches organizers make, and it ends
 * in "Run it live", which leads to sign-up.
 *
 * Nothing leaves the browser. The draw happens only on a click, never at build time, so the
 * prerendered page can't ship a frozen result.
 */
@Component({
  selector: 'app-blind-draw-generator',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <header class="intro">
        <p class="eyebrow">Free tool</p>
        <h1>Blind draw generator</h1>
        <p class="lede">
          Paste in your players and get random two-player teams and a seeded bracket, ready for
          cornhole, bags, darts, pickleball or any doubles game. Free, no account, nothing to
          install.
        </p>
      </header>

      <section class="card tool">
        <label for="names" class="section-label">Players, one per line</label>
        <textarea id="names" class="input" rows="8" [value]="text()" (input)="onInput($event)"
          placeholder="Ann&#10;Bob&#10;Cara&#10;Dev"></textarea>
        <p class="status" [class.warn]="problem()" aria-live="polite">{{ status() }}</p>
        <div class="actions">
          <button type="button" class="btn btn-primary" [disabled]="!!problem()" (click)="draw()">
            {{ teams() ? 'Draw again' : 'Draw teams' }}
          </button>
          @if (teams()) {
            <button type="button" class="btn" (click)="copy()">{{ copied() ? 'Copied' : 'Copy teams' }}</button>
          }
        </div>
      </section>

      @if (teams(); as list) {
        <section class="result">
          <h2>Teams</h2>
          <ol class="teams">
            @for (team of list; track team.seed) {
              <li><span class="seed">{{ team.seed }}</span>{{ name(team) }}</li>
            }
          </ol>

          <h2>Bracket</h2>
          <div class="bracket">
            @for (round of rounds(); track round.label) {
              <div class="round">
                <h3>{{ round.label }}</h3>
                @for (match of round.matches; track match.number) {
                  <div class="match" [class.bye]="isBye(match)">
                    <span>{{ slot(match.top) }}</span>
                    <span>{{ slot(match.bottom) }}</span>
                  </div>
                }
              </div>
            }
          </div>
        </section>
      }

      <section class="card live">
        <h2>Run it live</h2>
        <p>
          Players sign up from a QR code at the door, you tap in scores from your phone, winners
          advance on their own and the bracket updates on the TV as it happens. Free up to 32
          players.
        </p>
        @if (auth.isLoggedIn()) {
          <a class="btn btn-primary" routerLink="/admin">Create a tournament</a>
        } @else {
          <a class="btn btn-primary" routerLink="/admin/register">Run it live, free</a>
        }
      </section>

      <section class="about">
        <h2>How a blind draw works</h2>
        <p>
          In a blind draw, players sign up on their own and are paired into teams at random, so
          nobody picks a partner. It mixes regulars with newcomers, keeps stacked teams from
          forming, and is the usual format for bar leagues, fundraisers and social nights.
        </p>
        <h2>Running a blind draw cornhole tournament</h2>
        <ol>
          <li>Collect names as players arrive. You need an even number, since teams are pairs.</li>
          <li>Draw the teams in front of everyone, so the pairing is visibly random.</li>
          <li>Seed the bracket from the draw order. With an uneven field, the top seeds get byes.</li>
          <li>Play it out as single elimination, or double elimination so every team gets two games.</li>
        </ol>
        <p>
          Bracketway does all of this for a real event, from sign-ups to the final. See
          <a routerLink="/how-it-works">how it works</a>.
        </p>
      </section>
    </div>
  `,
  styles: [`
    .intro { margin-bottom: 24px; }
    .eyebrow {
      font-family: var(--mono); font-size: 0.68rem; letter-spacing: .16em;
      text-transform: uppercase; color: var(--muted); margin-bottom: 12px;
    }
    .intro h1 { font-size: clamp(2rem, 7vw, 2.8rem); line-height: 1; margin-bottom: 16px; }
    .lede { font-size: 1rem; line-height: 1.6; color: var(--text-dim); }
    .tool textarea { width: 100%; resize: vertical; font: inherit; }
    .status { font-size: 0.85rem; color: var(--text-dim); margin: 8px 0 12px; }
    .status.warn { color: var(--accent); }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    h2 { font-size: 1.15rem; margin: 28px 0 12px; }
    .teams { list-style: none; padding: 0; display: grid; gap: 6px; }
    .teams li { display: flex; gap: 10px; align-items: baseline; }
    .seed { font-family: var(--mono); font-size: 0.75rem; color: var(--muted); min-width: 22px; text-align: right; }
    .bracket { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
    .round { display: flex; flex-direction: column; justify-content: space-around; gap: 8px; min-width: 170px; }
    .round h3 {
      font-family: var(--mono); font-size: 0.68rem; letter-spacing: .12em;
      text-transform: uppercase; color: var(--muted); font-weight: 400;
    }
    .match {
      display: grid; background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); font-size: 0.82rem;
    }
    .match span { padding: 6px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .match span + span { border-top: 1px solid var(--border); }
    .match.bye { opacity: .6; }
    .live { margin-top: 32px; }
    .live h2 { margin-top: 0; }
    .live p { color: var(--text-dim); line-height: 1.6; margin-bottom: 16px; }
    .about p, .about li { color: var(--text-dim); line-height: 1.6; }
    .about ol { padding-left: 20px; display: grid; gap: 6px; margin-bottom: 12px; }
  `],
})
export class BlindDrawGeneratorComponent {
  readonly auth = inject(AuthService);

  readonly text = signal('');
  readonly teams = signal<DrawnTeam[] | null>(null);
  readonly copied = signal(false);
  readonly isBye = isBye;

  private readonly parsed = computed(() => parseNameList(this.text()));
  readonly rounds = computed<PreviewRound[]>(() => previewBracket(this.teams() ?? []));

  /** Why the draw can't run yet, or null when it can. */
  readonly problem = computed(() => {
    const n = this.parsed().names.length;
    if (n < MIN_PLAYERS) return n === 0 ? 'Add at least 4 players to draw teams.' : `${n} so far. Add at least ${MIN_PLAYERS} players.`;
    if (n > MAX_PLAYERS) return `${n} players is over the ${MAX_PLAYERS} this preview handles. A live tournament takes more.`;
    if (n % 2 !== 0) return `${n} players is an odd number. Teams are pairs, so add or remove one.`;
    return null;
  });

  readonly status = computed(() => {
    const { names, duplicates } = this.parsed();
    const skipped = duplicates.length ? ` (${duplicates.length} repeated ${duplicates.length === 1 ? 'name' : 'names'} skipped)` : '';
    return (this.problem() ?? `${names.length} players make ${names.length / 2} teams.`) + skipped;
  });

  onInput(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }

  draw(): void {
    if (this.problem()) return;
    this.teams.set(pairTeams(shuffle(this.parsed().names)));
    this.copied.set(false);
  }

  name(team: DrawnTeam): string {
    return teamName(team);
  }

  slot(slot: Slot): string {
    if (slot.kind === 'team') return `${slot.team.seed}. ${teamName(slot.team)}`;
    return slot.kind === 'bye' ? 'Bye' : 'Winner advances';
  }

  async copy(): Promise<void> {
    const list = this.teams();
    if (!list) return;
    const lines = list.map(t => `${t.seed}. ${teamName(t)}`).join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      this.copied.set(true);
    } catch {
      // Clipboard blocked (an insecure page or a denied permission): the list is on screen.
    }
  }
}
