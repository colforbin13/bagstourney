// src/app/bracket/sports.component.ts
//
// The "what can I actually run on this?" page. Bracketway started as a bag-toss tool and
// the copy elsewhere used to say so; the engine never cared, so the rest of the site is
// now sport-neutral and this page carries the specifics instead. Keeping the naming in
// one place means adding a sport is an edit here, not a sweep through every page.
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';

interface SportGroup {
  name: string;
  blurb: string;
  sports: string[];
}

@Component({
  selector: 'app-sports',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <header class="intro">
        <p class="eyebrow">Sports &amp; games</p>
        <h1>If it's two-player teams, it runs here.</h1>
        <p class="lede">
          Bracketway doesn't know or care what game you're playing. It draws teams of two,
          seeds them, builds a single-elimination bracket, and tracks a score per side. Any
          game that fits that shape fits here — these are the ones organizers actually run.
        </p>
      </header>

      @for (group of groups; track group.name) {
        <section class="group">
          <h2 class="group-name">{{ group.name }}</h2>
          <p class="group-blurb">{{ group.blurb }}</p>
          <ul class="sports">
            @for (sport of group.sports; track sport) {
              <li>{{ sport }}</li>
            }
          </ul>
        </section>
      }

      <section class="aside">
        <h2 class="aside-title">Don't see yours?</h2>
        <p>
          The list isn't a set of modes you pick from — there's no sport field on a
          tournament, and nothing in the app behaves differently based on what you're
          playing. If your game is played by two-person teams, head to head, one loss and
          you're out, it already works. Name the tournament after it and go.
        </p>
        <p>
          The one real requirement is a <strong>score per team per match</strong>, whether
          that's 21 points, 11, games won, or hands taken. Bracketway records both numbers
          and advances whoever's is higher.
        </p>
      </section>

      <div class="closing">
        @if (auth.isLoggedIn()) {
          <a class="btn btn-primary" routerLink="/admin">Set one up</a>
        } @else {
          <a class="btn btn-primary" routerLink="/admin/register">Create an account</a>
        }
        <a class="btn" routerLink="/how-it-works">How it works</a>
      </div>
    </div>
  `,
  styles: [`
    .intro { margin-bottom: 40px; }
    .eyebrow {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .intro h1 { font-size: clamp(2rem, 7vw, 2.8rem); line-height: 1; margin-bottom: 16px; }
    .lede { font-size: 1rem; line-height: 1.6; color: var(--text-dim); }

    .group { border-top: 2px solid var(--border); padding-top: 16px; margin-bottom: 32px; }
    .group-name { font-size: 1.4rem; margin-bottom: 8px; }
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
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-family: var(--mono);
      font-size: 0.78rem;
      color: var(--text);
    }

    .aside {
      margin-top: 8px;
      padding: 18px;
      background: var(--surface-2);
      border: 1px solid var(--border);
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

    .closing { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 36px; }
  `]
})
export class SportsComponent {
  readonly groups: SportGroup[] = [
    {
      name: 'Yard & tailgate',
      blurb: 'Where most Bracketway tournaments happen — a driveway, a parking lot, a field behind the pavilion.',
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
      name: 'Racket & net — doubles',
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
      name: 'Cards — partners',
      blurb: "Not a sport, but the shape is identical: partners across the table, a score per side, loser goes home.",
      sports: [
        'Euchre',
        'Spades',
        'Bid Whist',
        'Pinochle',
      ],
    },
  ];

  constructor(public auth: AuthService) {}
}
