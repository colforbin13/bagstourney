// src/app/bracket/scoreholio-comparison.component.ts
//
// "Bracketway vs Scoreholio" — a marketing guide page for the "Scoreholio alternative" search.
// Prerendered (app.routes.server.ts), so its content lives in the template.
//
// Deliberately even-handed: it says where Scoreholio is the better pick, because a comparison
// that only flatters us reads as an ad and earns neither rankings nor trust. Every Scoreholio
// fact here came from scoreholio.com and docs.scoreholio.com, checked in October 2026 (see
// CHECKED below). Their plans change; re-check before editing, and update CHECKED when you do.
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Row {
  topic: string;
  bracketway: string;
  scoreholio: string;
}

@Component({
  selector: 'app-scoreholio-comparison',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="sheet-head">
      <h1>Bracketway vs Scoreholio</h1>
      <p class="lede">
        Scoreholio is the best-known tournament app in cornhole. Bracketway
        is a simpler tool built for a different night: a fundraiser, a bar tournament or a
        backyard bracket, where nobody should have to download anything. Here's how they differ, so you can pick the one that fits your event.
      </p>
    </header>

    <article class="sheet-body">
      <section class="ruled measure">
        <h2>Side by side</h2>
        <div class="rows">
          @for (row of rows; track row.topic) {
            <div class="row">
              <h3>{{ row.topic }}</h3>
              <div class="cols">
                <div><span class="who">Bracketway</span>{{ row.bracketway }}</div>
                <div><span class="who">Scoreholio</span>{{ row.scoreholio }}</div>
              </div>
            </div>
          }
        </div>
        <p class="checked">Scoreholio details from scoreholio.com and its documentation, checked {{ checked }}.</p>
      </section>

      <section class="ruled measure">
        <h2>When Scoreholio is the better choice</h2>
        <ul>
          <li>You run a <strong>weekly league</strong> or a season, and want standings that carry over from week to week.</li>
          <li>Your players are competitive and care about <strong>stats, rankings and PPR</strong>.</li>
          <li>You want <strong>rotating partners</strong> (Switcholio), round robin, ladders or King of the Court.</li>
          <li>You need <strong>double elimination or a 32-team bracket without paying</strong>: Scoreholio's free plan includes both.</li>
        </ul>
      </section>

      <section class="ruled measure">
        <h2>When Bracketway is the better choice</h2>
        <ul>
          <li>
            <strong>Your players shouldn't need an app or an account.</strong> They sign up from a
            link or a QR code at the door with just their name, and follow the bracket in any
            browser.
          </li>
          <li>
            <strong>It's a one-off event</strong>, like a school or church fundraiser, a company
            outing or a bar night, and you want it set up in minutes rather than learning a
            league system.
          </li>
          <li>
            <strong>You want the classic blind draw</strong>, done in one tap: paste a list of
            names, draw teams (balanced A/B if you like), and the bracket builds itself.
          </li>
          <li>
            <strong>You'd rather pay once for one big event.</strong> A single tournament upgrade
            is $12.99 with no subscription.
          </li>
          <li>
            <strong>It's not cornhole.</strong> Bracketway runs any game played in two-player
            teams, from KanJam to euchre, with no sport settings to work around.
          </li>
        </ul>
      </section>

      <section class="card cta measure">
        <h2>Try Bracketway free</h2>
        <p>
          Free for tournaments up to 32 players, with nothing to install for you or your players.
          Pro adds bigger fields, double elimination, pool play and board assignments.
        </p>
        <p class="aside">
          Planning a fundraiser? Read <a routerLink="/cornhole-fundraiser">how to run a cornhole fundraiser</a>.
        </p>
      </section>

      <p class="disclaimer measure">
        Scoreholio is a trademark of its owner. Bracketway is not affiliated with or endorsed by
        Scoreholio. Spotted something out of date? Email support&#64;bracketway.com and we'll fix it.
      </p>
    </article>
  `,
  styles: [`
    section { margin-bottom: clamp(32px, 4vw, 44px); }
    h2 { font-size: clamp(1.5rem, 2.6vw, 1.9rem); font-weight: 900; font-stretch: 106%; margin-bottom: 12px; }
    p, li { color: var(--text-dim); line-height: 1.65; }
    strong { color: var(--text); font-weight: 600; }
    ul { padding-left: 20px; display: grid; gap: 8px; }
    .rows { display: grid; gap: 10px; }
    .row { border: 1.5px solid var(--text); border-radius: var(--radius); background: var(--surface); padding: 12px 14px; }
    .row h3 { font-size: 0.95rem; margin-bottom: 8px; }
    .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 0.85rem; line-height: 1.5; color: var(--text-dim); }
    @media (max-width: 520px) { .cols { grid-template-columns: 1fr; gap: 8px; } }
    .who {
      display: block; font-family: var(--mono); font-size: 0.78rem; letter-spacing: 0;
      color: var(--muted); margin-bottom: 2px;
    }
    .checked, .disclaimer { font-size: 0.78rem; color: var(--muted); margin-top: 10px; }
    .cta h2 { margin-top: 0; }
    .aside { font-size: 0.85rem; margin-top: 12px; }
  `],
})
export class ScoreholioComparisonComponent {
  /** When the Scoreholio facts below were last verified. */
  readonly checked = 'October 2026';

  readonly rows: Row[] = [
    {
      topic: 'Free plan',
      bracketway: 'Free for tournaments up to 32 players (16 teams), single elimination, as many tournaments as you like.',
      scoreholio: 'Free "Social" organizer plan: brackets up to 32 teams on up to 8 courts, with single and double elimination, round robin and Switcholio.',
    },
    {
      topic: 'Paid plans',
      bracketway: 'Pro is $9.99 a month or $99.99 a year. Or upgrade one tournament for $12.99, no subscription.',
      scoreholio: 'Organizer plans from $4.99 to $19.99 a month ($49.99 to $199.99 a year), billed through the App Store or Google Play.',
    },
    {
      topic: 'What players need',
      bracketway: 'Nothing. They sign up from a link or QR code with just their name, and follow the bracket in any browser.',
      scoreholio: 'The free Scoreholio app or website. Registering for an event uses a Scoreholio player account.',
    },
    {
      topic: 'Team draw',
      bracketway: 'Blind draw from a pasted list, an optional balanced A/B draw, or teams entered directly.',
      scoreholio: 'Blind draw with optional A/B/C skill pools, set teams, and rotating partners (Switcholio).',
    },
    {
      topic: 'Formats',
      bracketway: 'Single elimination. Double elimination and pool play into a seeded bracket on Pro.',
      scoreholio: 'Single and double elimination, round robin, pool play, ladders, King of the Court and set schedules. Swiss on its top plan.',
    },
    {
      topic: 'Leagues and stats',
      bracketway: 'Built for one-off tournaments. No weekly leagues or player stats yet.',
      scoreholio: 'Weekly leagues, seasons on its top plan, and player stats and rankings.',
    },
    {
      topic: 'TV display',
      bracketway: 'A TV mode that runs in the browser on any TV, laptop or streaming stick, plus printable QR signs. Free.',
      scoreholio: 'TV and Fire Stick dashboards on every plan; custom dashboards on its top plan.',
    },
    {
      topic: 'Boards and courts',
      bracketway: 'Board assignments with an up-next queue on Pro.',
      scoreholio: 'Court assignments on every plan: up to 8 courts free, up to 128 on its top plan.',
    },
  ];
}
