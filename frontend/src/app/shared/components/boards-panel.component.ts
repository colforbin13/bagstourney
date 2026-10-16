// src/app/shared/components/boards-panel.component.ts
//
// Board assignments (FEATURE_TRACKER item 8): which game is on which board, and what is up
// next. Shown on the public bracket page and its TV view, which is what players at a venue
// actually look at to find out where to go. The order comes from the API
// (api/lib/BoardQueue.php); this only draws it.
import { Component, computed, input } from '@angular/core';
import { BracketData } from '../models/tournament.models';

interface BoardGame { key: string; team1: string; team2: string; }

@Component({
  selector: 'app-boards-panel',
  standalone: true,
  template: `
    @if (boards(); as b) {
      <section class="boards" [class.large]="large()" aria-label="Boards">
        <div class="boards-col">
          <div class="boards-title">Now playing</div>
          @if (playing().length) {
            <div class="tiles">
              @for (p of playing(); track p.board) {
                <div class="tile">
                  <div class="tile-board">Board {{ p.board }}</div>
                  <div class="tile-team">{{ p.game.team1 }}</div>
                  <div class="tile-vs">vs</div>
                  <div class="tile-team">{{ p.game.team2 }}</div>
                </div>
              }
            </div>
          } @else {
            <div class="boards-empty">No games on the boards right now.</div>
          }
        </div>
        @if (upNext().length) {
          <div class="boards-col next">
            <div class="boards-title">Up next</div>
            <ol class="next-list">
              @for (g of upNext(); track g.key) {
                <li>{{ g.team1 }} <span class="vs">vs</span> {{ g.team2 }}</li>
              }
            </ol>
          </div>
        }
      </section>
    }
  `,
  styles: [`
    .boards { display: flex; flex-wrap: wrap; gap: 16px 28px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; }
    .boards-col { flex: 2 1 280px; min-width: 0; }
    .boards-col.next { flex: 1 1 200px; }
    .boards-title { font-family: var(--mono); font-size: .65rem; letter-spacing: .08em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
    .tile { border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--radius); padding: 8px 10px; min-width: 0; }
    .tile-board { font-family: var(--mono); font-size: .65rem; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); font-weight: 600; margin-bottom: 4px; }
    .tile-team { font-weight: 500; font-size: .85rem; overflow-wrap: anywhere; }
    .tile-vs { font-size: .7rem; color: var(--muted); margin: 1px 0; }
    .next-list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: .85rem; }
    .next-list li { overflow-wrap: anywhere; }
    .vs { color: var(--muted); font-size: .75rem; }
    .boards-empty { font-size: .85rem; color: var(--muted); }
    /* TV: read from across a room, and keep to one band so the bracket keeps its space. */
    .boards.large { border-radius: 0; border-width: 0 0 1px; padding: 10px 20px; flex-wrap: nowrap; }
    .large .boards-title { font-size: .8rem; margin-bottom: 6px; }
    .large .tiles { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
    .large .tile { padding: 6px 12px; }
    .large .tile-board { font-size: .85rem; margin-bottom: 2px; }
    .large .tile-team { font-size: 1.15rem; line-height: 1.25; }
    .large .tile-vs { font-size: .8rem; margin: 0; }
    .large .next-list { font-size: 1.1rem; gap: 6px; }
    .large .vs { font-size: .85rem; }
  `],
})
export class BoardsPanelComponent {
  data = input<BracketData | null | undefined>(null);
  /** Bigger type for the TV/kiosk view. */
  large = input(false);
  /** How many waiting games to list. */
  nextCount = input(4);

  boards = computed(() => this.data()?.boards ?? null);

  private games = computed(() => {
    const map = new Map<string, BoardGame>();
    const d = this.data();
    if (!d) return map;
    for (const round of d.pool?.rounds ?? []) {
      for (const g of round.matches) {
        map.set('p' + g.id, { key: 'p' + g.id, team1: g.team1_name, team2: g.team2_name });
      }
    }
    for (const side of d.sides ?? []) {
      for (const round of side.rounds) {
        for (const m of round.matches) {
          map.set('b' + m.id, { key: 'b' + m.id, team1: m.team1_name ?? 'TBD', team2: m.team2_name ?? 'TBD' });
        }
      }
    }
    return map;
  });

  playing = computed(() => {
    const games = this.games();
    return (this.boards()?.playing ?? [])
      .map(p => ({ board: p.board, game: games.get(p.key) }))
      .filter((p): p is { board: number; game: BoardGame } => !!p.game);
  });

  upNext = computed(() => {
    const games = this.games();
    return (this.boards()?.up_next ?? [])
      .map(key => games.get(key))
      .filter((g): g is BoardGame => !!g)
      .slice(0, this.nextCount());
  });
}
