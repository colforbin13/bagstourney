// src/app/bracket/sports.component.ts
//
// The "what can I actually run on this?" page. Bracketway started as a bag-toss tool and
// the copy elsewhere used to say so; the engine never cared, so the rest of the site is
// now sport-neutral and this page carries the specifics instead. Keeping the naming in
// one place means adding a sport is an edit here, not a sweep through every page.
import { Component } from '@angular/core';

interface SportGroup {
  name: string;
  blurb: string;
  sports: string[];
}

@Component({
  selector: 'app-sports',
  standalone: true,
  template: `
    <header class="sheet-head">
      <h1>If it's two-player teams, it runs here.</h1>
      <p class="lede">
        Bracketway doesn't need to know what game you're playing. It draws teams of two,
        seeds them, builds the bracket, and tracks a score per side. Any
        game that fits that shape fits here. Here are the common ones.
      </p>
    </header>

    <div class="sheet-body">
      <div class="groups">
        @for (group of groups; track group.name) {
          <section class="group ruled">
            <h2 class="group-name">{{ group.name }}</h2>
            <p class="group-blurb">{{ group.blurb }}</p>
            <ul class="sports">
              @for (sport of group.sports; track sport) {
                <li>{{ sport }}</li>
              }
            </ul>
          </section>
        }
      </div>

      <section class="aside measure">
        <h2 class="aside-title">Don't see yours?</h2>
        <p>
          The list isn't a set of modes you pick from. There's no sport field on a
          tournament, and nothing in the app behaves differently based on what you're
          playing. If your game is played by two-player teams, head to head, it already
          works. Name the tournament after it and go.
        </p>
        <p>
          The one real requirement is a <strong>score per team per match</strong>, whether
          that's 21 points, 11, games won, or hands taken. Bracketway records both numbers
          and advances whoever's is higher.
        </p>
      </section>
    </div>
  `,
  styles: [`
    /* Two groups across once there's room; each opens on a toner rule. */
    .groups { display: grid; gap: clamp(28px, 4vw, 44px) clamp(24px, 4vw, 56px); }
    @media (min-width: 860px) { .groups { grid-template-columns: 1fr 1fr; } }
    .group-name { font-size: clamp(1.4rem, 2.4vw, 1.8rem); font-weight: 900; font-stretch: 106%; margin-bottom: 8px; }
    .group-blurb {
      font-size: 0.85rem;
      line-height: 1.6;
      color: var(--text-dim);
      margin-bottom: 16px;
    }
    /* A plain wrapping chip list rather than a grid: the groups have uneven counts, and
       a grid leaves ragged holes at every breakpoint. */
    .sports {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      list-style: none;
    }
    .sports li {
      padding: 7px 12px;
      background: var(--surface);
      border: 1.5px solid var(--text);
      border-radius: var(--radius);
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--text);
    }

    .aside {
      margin-top: clamp(36px, 5vw, 56px);
      padding: 18px;
      background: var(--surface-2);
      border: 1.5px solid var(--text);
      border-radius: var(--radius);
    }
    .aside-title { font-size: 1.2rem; margin-bottom: 10px; }
    .aside p {
      font-size: 0.85rem;
      line-height: 1.6;
      color: var(--text-dim);
      & + p { margin-top: 12px; }
    }
    .aside strong { color: var(--text); font-weight: 600; }
  `]
})
export class SportsComponent {
  readonly groups: SportGroup[] = [
    {
      name: 'Yard & tailgate',
      blurb: 'A driveway, a parking lot, a field behind the pavilion.',
      sports: [
        'Bags (Cornhole)',
        'KanJam',
        'Ladder Toss',
        'Washers',
        'Horseshoes',
        'Spikeball',
        'Bocce',
        'Polish Horseshoes',
      ],
    },
    {
      name: 'Racket and net doubles',
      blurb: 'Doubles play is already two-player teams, so a club ladder or a weekend open drops straight in.',
      sports: [
        'Pickleball',
        'Tennis',
        'Badminton',
        'Table Tennis',
        'Beach Volleyball',
      ],
    },
    {
      name: 'Bar & table',
      blurb: 'League night, a charity night, or a bracket taped to the wall by the dartboard.',
      sports: [
        'Darts',
        'Shuffleboard',
        'Pool',
        'Beer Pong',
      ],
    },
    {
      name: 'Partner card games',
      blurb: "Not a sport, but the shape is identical: partners across the table, a score per side, loser goes home.",
      sports: [
        'Euchre',
        'Spades',
        'Bid Whist',
        'Pinochle',
      ],
    },
  ];
}
