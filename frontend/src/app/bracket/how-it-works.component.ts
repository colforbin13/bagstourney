// src/app/bracket/how-it-works.component.ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';

@Component({
  selector: 'app-how-it-works',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <header class="intro">
        <p class="eyebrow">How it works</p>
        <h1>From a pile of players to a champion.</h1>
        <p class="lede">
          The whole run of a tournament, start to finish, so you know what you're getting into
          before you set one up. It takes about five minutes of actual work. Nothing below
          depends on which game you're playing — see
          <a routerLink="/sports">the sports people run</a> if you're wondering whether yours
          fits.
        </p>
      </header>

      <ol class="walkthrough">
        <li class="chapter">
          <span class="chapter-num">Step 01</span>
          <h2>Create the tournament</h2>
          <p>
            A name is the only thing you have to decide. The three other choices all have
            sensible defaults, but they're worth understanding, because two of them lock once
            you draw teams.
          </p>
          <dl class="choices">
            <dt>Public or private</dt>
            <dd>
              Public tournaments are listed on the home page for anyone to follow. Private ones
              are unlisted and reachable only by their link — though anyone holding that link
              can watch. Changeable at any time.
            </dd>
            <dt>Auto-draft or direct entry</dt>
            <dd>
              Auto-draft means players sign up as individuals and get randomly paired into
              teams. Direct entry means you type in each team yourself, partners already
              decided. <strong>The player sign-up link only works with auto-draft</strong> —
              there's no pool of unpaired players for a walk-up to join otherwise.
            </dd>
            <dt>Automatic or manual seeding</dt>
            <dd>
              Automatic seeds teams for you at the draw and starts play immediately. Manual
              gives you a drag-and-drop ladder to arrange first. Pick manual if you know who
              the strong teams are and want them apart in the bracket.
            </dd>
            <dt>Single or double elimination</dt>
            <dd>
              Single elimination is one loss and you're out. Double elimination gives every
              team a second chance: your first loss drops you into a losers bracket, and only
              a second knocks you out. It's kinder to a team that draws the eventual champion
              early, at the cost of roughly twice as many games.
              <strong>Double elimination is a paid-plan feature</strong>, and unlike the other
              choices here it's locked once the bracket is generated — the bracket's whole
              shape depends on it.
            </dd>
          </dl>
        </li>

        <li class="chapter">
          <span class="chapter-num">Step 02</span>
          <h2>Get your players in</h2>
          <p>
            Type them in one at a time, or open the tournament's sign-up link — there's a QR
            code for it — and let people add themselves from their phones while you're still
            setting up.
          </p>
          <p>
            Self sign-ups land as <em>pending</em> and don't join the roster until you approve
            them, so a stray scan or a joker typing nonsense never quietly ends up in your
            bracket. You'll want an even number of players, four at minimum.
          </p>
        </li>

        <li class="chapter">
          <span class="chapter-num">Step 03</span>
          <h2>Draw the teams</h2>
          <p>
            One button pairs every approved player at random into two-person teams. If you
            chose automatic seeding, this also seeds them, builds the bracket, and starts play
            in a single step. If you chose manual, you get the ladder to reorder first.
          </p>
          <p>
            Don't like the pairings? Redraw them as many times as you want, right up until you
            generate the bracket.
          </p>
        </li>

        <li class="chapter">
          <span class="chapter-num">Step 04</span>
          <h2>The bracket gets built</h2>
          <p>
            Your teams get slotted into the nearest bracket that fits them — 8 teams into 8
            slots, 9 teams into 16. In single elimination, losing once ends your run.
          </p>
          <p>
            In double elimination the same tree becomes the <strong>winners bracket</strong>,
            and a second <strong>losers bracket</strong> runs alongside it collecting everyone
            knocked out of the first. The two survivors meet in a grand final. If the team
            coming up from the losers bracket wins it, both sides have one loss each and a
            single deciding rematch is played.
          </p>
          <p>
            When the count isn't a clean power of two, the leftover slots become
            <strong>byes</strong>: the teams facing them advance automatically without playing
            a first-round match. That's normal and it's why a 9-team tournament shows fewer
            matches than you might expect — a bye is a free pass, not a game.
          </p>
        </li>

        <li class="chapter">
          <span class="chapter-num">Step 05</span>
          <h2>Score it as you play</h2>
          <p>
            Tap in each match's score as it finishes. The winner advances to the next round on
            its own — you never move anyone by hand — and the public bracket updates for
            everyone watching the moment you save.
          </p>
          <p>
            Players who gave an email address when they signed up can get results mailed to
            them as rounds complete. It's opt-in on their end: they confirm once by tapping a
            link, and can unsubscribe from any message after that.
          </p>
          <p>
            Running the scores is its own screen, too — it lists just the matches that can be
            played right now, so whoever's keeping score isn't hunting through a whole bracket
            on their phone between games.
          </p>
        </li>

        <li class="chapter">
          <span class="chapter-num">Step 06</span>
          <h2>Put it on the wall</h2>
          <p>
            Open the bracket on any TV, streaming stick, or laptop plugged into a screen and
            switch on <strong>TV mode</strong>: the site's own furniture disappears and the
            bracket scales up to fill the display, refreshing itself as scores land. No app,
            no cast, nothing to install — it's a web page, so bookmark it once and the screen
            looks after itself for the rest of the day.
          </p>
          <p>
            For everyone not standing in front of that screen, print a sign. Bracketway makes
            you a full-page QR sheet — one to follow the bracket from a phone, one to sign up
            — ready to print or save as a PDF.
          </p>
        </li>

        <li class="chapter">
          <span class="chapter-num">Step 07</span>
          <h2>Someone wins</h2>
          <p>
            Score the final and the tournament closes itself out, champion and all. It stays
            up afterwards — the bracket link keeps working, so people can go back and argue
            about the semifinal for as long as they like.
          </p>
        </li>
      </ol>

      <section class="aside">
        <h2 class="aside-title">A note on who can do what</h2>
        <p>
          You don't have to run everything yourself. A tournament's owner can add other people
          as <strong>managers</strong> (full setup control) or <strong>scorekeepers</strong>
          (score entry only, no ability to change the roster or the bracket). Handy when you
          want a friend at the far end of the venue entering scores without being able to
          redraw your teams by accident.
        </p>
      </section>

      <div class="closing">
        @if (auth.isLoggedIn()) {
          <a class="btn btn-primary" routerLink="/admin">Set one up</a>
          <a class="btn" routerLink="/tournaments">Browse tournaments</a>
        } @else {
          <a class="btn btn-primary" routerLink="/admin/register">Create an account</a>
          <a class="btn" routerLink="/">Back to home</a>
        }
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

    .walkthrough { display: flex; flex-direction: column; gap: 36px; list-style: none; }
    .chapter { border-top: 2px solid var(--border); padding-top: 16px; }
    .chapter-num {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .chapter h2 { font-size: 1.6rem; margin: 8px 0 12px; }
    .chapter p {
      font-size: 0.9rem;
      line-height: 1.65;
      color: var(--text-dim);
      & + p { margin-top: 12px; }
    }
    .chapter strong { color: var(--text); font-weight: 600; }

    .choices {
      margin-top: 16px;
      padding: 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .choices dt {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text);
      margin-bottom: 5px;
    }
    .choices dd {
      font-size: 0.82rem;
      line-height: 1.55;
      color: var(--text-dim);
      & + dt { margin-top: 14px; }
    }

    .aside {
      margin-top: 40px;
      padding: 18px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .aside-title { font-size: 1.2rem; margin-bottom: 10px; }
    .aside p { font-size: 0.85rem; line-height: 1.6; color: var(--text-dim); }
    .aside strong { color: var(--text); font-weight: 600; }

    .closing { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 36px; }
  `]
})
export class HowItWorksComponent {
  constructor(public auth: AuthService) {}
}
