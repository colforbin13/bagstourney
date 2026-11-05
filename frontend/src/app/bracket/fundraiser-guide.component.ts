// src/app/bracket/fundraiser-guide.component.ts
//
// "How to run a cornhole fundraiser" — the first guide page from the marketing handoff.
// Schools, churches, clubs and boosters plan spring and summer fundraisers over the winter,
// and this is the search they make. It's prerendered (app.routes.server.ts), so everything
// a search engine should read lives in the template, and it ends in sign-up.
//
// The numbers in it (game length, boards per team) are rules of thumb, worded as such. Prices
// and the free cap come from the same facts as the pricing page; update both together.
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';

@Component({
  selector: 'app-fundraiser-guide',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="page">
      <header class="intro">
        <p class="eyebrow">Guide</p>
        <h1>How to run a cornhole fundraiser tournament</h1>
        <p class="lede">
          A cornhole tournament is one of the easiest fundraisers to put on. Almost anyone can
          play, the equipment is cheap or borrowed, and players stick around for food and drinks
          between games. Here's how to plan one, from the first meeting to handing over the
          trophy.
        </p>
      </header>

      <section id="timeline">
        <h2>A planning timeline</h2>
        <dl class="timeline">
          <dt>6 to 8 weeks out</dt>
          <dd>
            Pick a date and a venue, and set a goal for how much you want to raise. Ask a bar,
            brewery, park district or parish hall early: spring and summer weekends go fast.
            Start asking local businesses to sponsor.
          </dd>
          <dt>4 weeks out</dt>
          <dd>
            Decide the format, entry fee and player cap. Open sign-ups and start sharing the
            link through your school, church or club newsletter, social media and flyers.
          </dd>
          <dt>1 to 2 weeks out</dt>
          <dd>
            Line up boards and bags, volunteers for check-in and scorekeeping, and prizes. Print
            sponsor signs and a QR sign for the door.
          </dd>
          <dt>The day before</dt>
          <dd>
            Close online sign-ups or set aside room for walk-ups. Charge phones and test the TV
            you'll show the bracket on.
          </dd>
        </dl>
      </section>

      <section id="format">
        <h2>Pick a format</h2>
        <p>
          <strong>Blind draw or bring a partner.</strong> In a blind draw, people sign up on
          their own and are paired at random on the day. It's the friendliest choice for a
          fundraiser: nobody needs a partner to come, regulars mix with first-timers, and
          stacked teams can't form. If a few strong players worry you, a balanced (A/B) draw
          pairs each stronger player with a random newer one. Letting people bring their own
          partner works too, and sells well to couples and coworkers.
        </p>
        <p>
          <strong>Single or double elimination.</strong> Single elimination is fastest, but half
          the field is out after one game. For a fundraiser, where people paid to play, double
          elimination is usually worth the extra time: every team plays at least twice, and
          only a second loss sends them home. Another option is a few pool games for everyone
          first, then a bracket seeded from the results.
        </p>
        <p>
          <strong>How long it takes.</strong> A casual game to 21 usually takes 10 to 20
          minutes. A single-elimination bracket for 16 teams is 15 games; on 4 sets of boards
          that's about 4 rounds, or roughly an hour and a half with breaks. Double elimination
          about doubles the game count, so plan for 3 hours or add boards.
        </p>
      </section>

      <section id="money">
        <h2>Set prices and raise more</h2>
        <ul>
          <li>
            <strong>Entry fee.</strong> Charge per player or per team, at a price that fits your
            crowd. Many fundraisers keep every dollar for the cause and play for a trophy or
            donated prizes; others pay a share back to the top teams to draw stronger players.
          </li>
          <li>
            <strong>Board sponsors.</strong> Each set of boards is a natural sponsor spot. Sell a
            sign on every set, plus a name on the flyer and a thank-you at the trophy.
          </li>
          <li>
            <strong>Food and drink.</strong> Venues often give back a share of sales on the day,
            and that can beat the entry fees. Ask when you book.
          </li>
          <li>
            <strong>Side events.</strong> A raffle, silent auction or longest-streak contest
            keeps people busy between games. Raffles and 50/50 drawings are regulated in many
            places, often needing a license, so check your state and local rules first.
          </li>
          <li>
            <strong>Walk-up donations.</strong> Put the donation link or QR code next to the
            bracket on the TV, where everyone looks between games.
          </li>
        </ul>
      </section>

      <section id="equipment">
        <h2>Boards, bags and space</h2>
        <p>
          Plan on one set of boards (two boards and eight bags) for every four to six teams, so
          nobody waits too long between games. Borrow sets from members, or ask a local league
          to lend theirs in exchange for a mention. Regulation boards are 2 by 4 feet with their
          front edges 27 feet apart, but a backyard event can shorten that for kids and casual
          players. Leave a few feet of walking room between lanes, and mark each set with a
          number so players know where to go.
        </p>
      </section>

      <section id="signups">
        <h2>Sign-ups</h2>
        <p>
          Collecting names online before the day saves a long line at the door. Share one
          sign-up link everywhere, put a QR code on the flyer, and keep a few spots for
          walk-ups. A cap keeps the day on schedule: work back from your boards and your time
          slot using the numbers above. If you're taking payment online, collect it through
          your organization's usual donation page and check names off at check-in.
        </p>
      </section>

      <section id="day-of">
        <h2>Running the day</h2>
        <ol>
          <li>Check players in as they arrive, and approve any walk-ups.</li>
          <li>Draw the teams in front of everyone, so the pairings are visibly random.</li>
          <li>Put the bracket on a TV so players can see who they play next and on which board.</li>
          <li>Have one or two volunteers enter scores from their phones as games finish.</li>
          <li>Thank your sponsors out loud before the final, while everyone is watching.</li>
        </ol>
      </section>

      <section id="after">
        <h2>After the final</h2>
        <p>
          Announce the champions, take the photo with the trophy, and share the final bracket
          link with everyone who played. Post the total raised and thank the sponsors by name:
          it's the best advertising you'll have for next year's event.
        </p>
      </section>

      <section class="card cta">
        <h2>Run it on Bracketway</h2>
        <p>
          Bracketway handles the sign-up link and QR sign, the blind draw, the bracket on the
          TV, board assignments and live scoring from any phone. It's free for up to 32 players.
          For a bigger field or double elimination, upgrade that one tournament for $12.99, with
          no subscription.
        </p>
        <div class="actions">
          @if (auth.isLoggedIn()) {
            <a class="btn btn-primary" routerLink="/admin">Create a tournament</a>
          } @else {
            <a class="btn btn-primary" routerLink="/admin/register">Start your fundraiser free</a>
          }
          <a class="btn" routerLink="/how-it-works">How it works</a>
        </div>
        <p class="aside">
          Just need teams? The free <a routerLink="/blind-draw-generator">blind draw generator</a>
          pairs players and drafts a bracket with no account.
        </p>
      </section>
    </article>
  `,
  styles: [`
    .intro { margin-bottom: 28px; }
    .eyebrow {
      font-family: var(--mono); font-size: 0.68rem; letter-spacing: .16em;
      text-transform: uppercase; color: var(--muted); margin-bottom: 12px;
    }
    .intro h1 { font-size: clamp(2rem, 7vw, 2.8rem); line-height: 1; margin-bottom: 16px; }
    .lede { font-size: 1rem; line-height: 1.6; color: var(--text-dim); }
    section { margin-bottom: 32px; }
    h2 { font-size: 1.4rem; margin-bottom: 12px; }
    p, li, dd { color: var(--text-dim); line-height: 1.65; }
    p + p { margin-top: 12px; }
    strong { color: var(--text); font-weight: 600; }
    ul, ol { padding-left: 20px; display: grid; gap: 8px; }
    .timeline dt { font-weight: 600; margin-top: 14px; }
    .timeline dt:first-child { margin-top: 0; }
    .timeline dd { margin: 4px 0 0; }
    .cta h2 { margin-top: 0; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 12px; }
    .aside { font-size: 0.85rem; }
  `],
})
export class FundraiserGuideComponent {
  readonly auth = inject(AuthService);
}
