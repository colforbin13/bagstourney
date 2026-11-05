// src/app/shared/components/pool-standings.component.ts
//
// The pool-play standings table (FEATURE_TRACKER item 18), shared by the manage screen, the
// public bracket page and its TV/kiosk mode so all three rank and label teams identically.
// Rows arrive already ranked by the API (api/lib/PoolPlay.php); this only draws them.
import { Component, computed, input } from '@angular/core';
import { PoolData, PoolStanding } from '../models/tournament.models';
import { teamParticipants } from '../bracket-labels';

@Component({
  selector: 'app-pool-standings',
  standalone: true,
  template: `
    @if (pool(); as p) {
      <div class="pool-head">
        <span class="pool-title">{{ title() }}</span>
        <span class="pool-progress">{{ progress() }}</span>
      </div>
      <table class="standings" [class.large]="large()">
        <thead>
          <tr>
            <th scope="col" class="num">#</th>
            <th scope="col">Team</th>
            <th scope="col" class="num" title="Wins-losses">W-L</th>
            <th scope="col" class="num" title="Point differential">+/-</th>
            <th scope="col" class="num opt" title="Points scored">PF</th>
          </tr>
        </thead>
        <tbody>
          @for (row of p.standings; track row.team_id) {
            <tr>
              <td class="num rank">{{ row.rank }}</td>
              <td>
                <div class="team">{{ row.team_name }}</div>
                @if (members(row); as m) { <div class="members">{{ m }}</div> }
              </td>
              <td class="num">{{ row.wins }}-{{ row.losses }}</td>
              <td class="num">{{ row.point_diff > 0 ? '+' : '' }}{{ row.point_diff }}</td>
              <td class="num opt">{{ row.points_for }}</td>
            </tr>
          }
        </tbody>
      </table>
      @if (!p.locked) {
        <div class="tiebreak-note">
          Ranked by win percentage, then point differential per game, points scored per game,
          head-to-head, then a random draw. The order here is the bracket's seed order.
        </div>
      }
    }
  `,
  styles: [`
    .pool-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .pool-title { font-family: var(--mono); font-size: .65rem; letter-spacing: .08em; text-transform: uppercase; color: var(--text-dim); }
    .pool-progress { font-family: var(--mono); font-size: .7rem; color: var(--muted); }
    .standings { width: 100%; border-collapse: collapse; font-size: .85rem; }
    .standings th { font-family: var(--mono); font-size: .62rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); font-weight: 500; text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
    .standings td { padding: 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .standings tr:last-child td { border-bottom: none; }
    .num { text-align: right !important; font-family: var(--mono); white-space: nowrap; width: 1%; }
    .rank { color: var(--muted); }
    .team { font-weight: 500; }
    .members { font-size: .75rem; color: var(--muted); margin-top: 2px; }
    .tiebreak-note { font-size: .72rem; color: var(--muted); margin-top: 8px; line-height: 1.4; }
    /* TV/kiosk: read from across a room. The pool view is not scaled like the bracket. */
    .standings.large { font-size: 2rem; }
    .standings.large th { font-size: 1rem; padding: 8px 12px; }
    .standings.large td { padding: 14px 12px; }
    .standings.large .members { font-size: 1.1rem; }
    @media (max-width: 420px) { .opt { display: none; } }
  `],
})
export class PoolStandingsComponent {
  pool = input<PoolData | null | undefined>(null);
  /** Bigger type for the TV/kiosk view. */
  large = input(false);

  title = computed(() => (this.pool()?.locked ? 'Pool standings · final' : 'Pool standings'));

  progress = computed(() => {
    const p = this.pool();
    if (!p || !p.started) return '';
    if (p.complete) return `All ${p.games_total} pool games played`;
    const round = p.rounds.find(r => r.matches.some(m => m.status !== 'complete'))?.round;
    const total = p.rounds.length;
    return `${round ? `Round ${round} of ${total} · ` : ''}${p.games_played} of ${p.games_total} games played`;
  });

  members(row: PoolStanding): string | null {
    return teamParticipants(row.team_name, row.participant1_name, row.participant2_name);
  }
}
