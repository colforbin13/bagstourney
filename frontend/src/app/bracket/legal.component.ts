// src/app/bracket/legal.component.ts
//
// Terms of service, Refund policy and Privacy policy. One component serving three routes
// (the route's `data.doc` picks which), because they share every bit of layout and the
// same handful of facts from shared/legal.ts. Stripe's go-live checklist asks for all
// three, and they're linked from the footer and from Stripe's own Checkout page.
//
// Written in plain English on purpose, and only promising what the code actually does —
// e.g. a full refund of a tournament upgrade removes it (BillingController), and a lapsed
// plan never touches a generated bracket (the format and cap gates).
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LEGAL } from '../shared/legal';

export type LegalDoc = 'terms' | 'refunds' | 'privacy';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page legal">
      @switch (doc) {
        @case ('terms') {
          <header class="intro">
            <p class="eyebrow">Legal</p>
            <h1>Terms of service</h1>
            <p class="effective">Effective {{ L.effectiveDate }}</p>
          </header>

          <section>
            <h2>Who we are</h2>
            <p>
              Bracketway is run by {{ L.operator }}, doing business as {{ L.brand }} ("we", "us").
              You can reach us at <a [href]="'mailto:' + L.supportEmail">{{ L.supportEmail }}</a>.
              By using Bracketway you agree to these terms.
            </p>
          </section>

          <section>
            <h2>Your account</h2>
            <p>
              You need an account to create and run tournaments. Give us an email address that
              works, keep your password to yourself, and you're responsible for what happens
              under your account. You must be at least 18, or have a parent's or guardian's
              permission, to create an account or buy a plan.
            </p>
          </section>

          <section>
            <h2>What you put in</h2>
            <p>
              Tournament names, player names, scores and anything else you enter stay yours. You
              let us store and display them so the service works, including on bracket pages,
              QR posters, the TV display and link previews, which anyone with the link can see.
              Only enter people's names and email addresses if you have their permission.
            </p>
            <p>
              Don't use Bracketway for anything unlawful, abusive or misleading, don't try to
              break or overload it, and don't try to get at other people's data. We may remove
              content or suspend an account that breaks these terms.
            </p>
          </section>

          <section>
            <h2>Free and paid plans</h2>
            <p>
              What each plan includes is on the <a routerLink="/pricing">Pricing page</a>. We may
              change features and limits over time, but a change never affects a bracket that
              has already been generated.
            </p>
            <p>
              Payments are processed by Stripe through Link, which sells our plans as the
              merchant of record. Its own terms appear at checkout. Sales tax is calculated and
              added at checkout where it applies.
            </p>
            <p>
              <strong>Pro subscriptions</strong> renew automatically each month or year until
              you cancel. Cancel anytime from Billing, under Manage billing. You keep Pro until
              the end of the period you've paid for, and you won't be charged again. If we change
              a price, we'll tell you before it applies, and it takes effect from your next
              renewal.
            </p>
            <p>
              <strong>One-time tournament upgrades</strong> apply to a single tournament for as
              long as it exists, and can't be moved to another tournament.
            </p>
            <p>
              Refunds are covered by our <a routerLink="/refunds">Refund policy</a>.
            </p>
          </section>

          <section>
            <h2>Availability</h2>
            <p>
              We work to keep Bracketway running, but it's provided "as is", without a guarantee
              that it will always be available or error-free. Keep your own record of anything
              you can't afford to lose. If we ever shut down a paid plan, we'll give notice and
              refund any prepaid time you haven't used.
            </p>
          </section>

          <section>
            <h2>Liability</h2>
            <p>
              To the extent the law allows, we aren't liable for indirect or consequential losses,
              and our total liability to you is limited to what you paid us in the 12 months
              before the claim. Nothing in these terms limits rights you have under consumer law
              that can't be waived.
            </p>
          </section>

          <section>
            <h2>Ending things</h2>
            <p>
              You can stop using Bracketway at any time. To close your account, email us. We may
              close an account that breaks these terms, after giving notice where we reasonably
              can.
            </p>
          </section>

          <section>
            <h2>Changes and governing law</h2>
            <p>
              We may update these terms. The effective date above will change, and we'll email
              account holders about any significant change before it applies. These terms are
              governed by the laws of the State of {{ L.governingState }}.
            </p>
          </section>
        }

        @case ('refunds') {
          <header class="intro">
            <p class="eyebrow">Legal</p>
            <h1>Refund policy</h1>
            <p class="effective">Effective {{ L.effectiveDate }}</p>
          </header>

          <section>
            <h2>Pro subscriptions</h2>
            <p>
              Cancel anytime from Billing, under Manage billing. You keep Pro until the end of the
              period you've already paid for, and you won't be charged again.
            </p>
            <p>
              If a subscription charge caught you out, ask within
              <strong>{{ L.refundDays.monthly }} days</strong> of a monthly charge or
              <strong>{{ L.refundDays.annual }} days</strong> of an annual charge, and we'll refund
              that charge in full and cancel the subscription. After that window, charges aren't
              refunded, and you keep Pro until the period ends.
            </p>
          </section>

          <section>
            <h2>One-time tournament upgrades</h2>
            <p>
              We'll refund an upgrade in full if you ask within
              <strong>{{ L.refundDays.tournamentUpgrade }} days</strong> of buying it, as long as
              that tournament's bracket hasn't been generated yet. Once the bracket exists, the
              upgrade has been used and isn't refundable. A refunded upgrade is removed from the
              tournament.
            </p>
          </section>

          <section>
            <h2>How to ask</h2>
            <p>
              Email <a [href]="'mailto:' + L.supportEmail">{{ L.supportEmail }}</a> with the email
              address on your account and the date of the charge. You can also ask Link's support,
              which handles payments for us; it can issue refunds itself in some cases.
            </p>
            <p>
              Refunds go back to the original payment method and include any sales tax you paid.
              They usually show up within 5 to 10 business days, depending on your bank.
            </p>
          </section>

          <section>
            <h2>Everything else</h2>
            <p>
              Anything this page doesn't cover, we'll look at case by case. Nothing here limits
              rights you have under consumer law.
            </p>
          </section>
        }

        @case ('privacy') {
          <header class="intro">
            <p class="eyebrow">Legal</p>
            <h1>Privacy policy</h1>
            <p class="effective">Effective {{ L.effectiveDate }}</p>
          </header>

          <section>
            <h2>What we collect</h2>
            <ul>
              <li>
                <strong>Organizer accounts:</strong> your email address, username, and password.
                The password is stored only as a one-way hash, and we never see it.
              </li>
              <li>
                <strong>Tournaments:</strong> what organizers enter, such as tournament names,
                player names, teams and scores.
              </li>
              <li>
                <strong>Player email addresses:</strong> only when a player or organizer adds one
                for score updates. We email it only after the player confirms they want updates.
              </li>
              <li>
                <strong>Payments:</strong> handled entirely by Stripe and Link. We never see or
                store card numbers. We keep the Stripe customer and subscription IDs, and which
                plan you're on.
              </li>
              <li>
                <strong>Technical data:</strong> our web server logs IP addresses and browser
                details, which we use to keep the service running and secure. Your browser stores
                your sign-in so you stay logged in.
              </li>
            </ul>
            <p>
              We don't use advertising trackers or third-party analytics. We count visits
              ourselves: which page was opened, and the site or link that sent you there, kept
              only as daily totals, with no cookies and no IP address. Pages load fonts from
              Google Fonts, which means Google sees your IP address when a page loads.
            </p>
          </section>

          <section>
            <h2>What's public</h2>
            <p>
              Bracket pages, QR posters and the TV display show tournament and player names to
              anyone with the link, and public tournaments are listed on the site. Player email
              addresses are never shown publicly.
            </p>
          </section>

          <section>
            <h2>How we use it</h2>
            <p>
              To run the service: signing you in, account emails like verification and password
              resets, the score updates players asked for, billing, and support. We don't sell
              personal information, and we don't use it for advertising.
            </p>
          </section>

          <section>
            <h2>Who we share it with</h2>
            <p>
              Only the services that run parts of Bracketway for us: Stripe and Link for payments,
              Postmark for account emails, and Brevo for score-update emails. Each gets only what
              it needs for its part. We'd also disclose information if the law required it.
            </p>
          </section>

          <section>
            <h2>How long we keep it</h2>
            <p>
              Account and tournament data is kept while your account exists. Billing records are
              kept as long as tax and accounting rules require.
            </p>
          </section>

          <section>
            <h2>Your choices</h2>
            <p>
              Every score-update email has an unsubscribe link. To see, correct or delete your
              information, or close your account, email
              <a [href]="'mailto:' + L.supportEmail">{{ L.supportEmail }}</a>.
            </p>
            <p>
              Bracketway isn't aimed at children under 13. If you enter a minor's name as a
              player, make sure you have a parent's or guardian's permission.
            </p>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              If this policy changes, the effective date above will change, and we'll email
              account holders about any significant change.
            </p>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .intro { margin-bottom: 28px; }
    .eyebrow {
      font-family: var(--mono);
      font-size: 0.68rem;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .intro h1 { font-size: clamp(2rem, 7vw, 2.8rem); line-height: 1; margin-bottom: 10px; }
    .effective { font-family: var(--mono); font-size: 0.75rem; color: var(--muted); }

    section { border-top: 1px solid var(--border); padding-top: 16px; margin-bottom: 24px; }
    h2 { font-size: 1.3rem; margin-bottom: 8px; }
    p, li { font-size: 0.92rem; line-height: 1.65; color: var(--text-dim); }
    p + p { margin-top: 10px; }
    ul { padding-left: 18px; }
    li + li { margin-top: 6px; }
    strong { color: var(--text); font-weight: 600; }
  `]
})
export class LegalComponent {
  readonly L = LEGAL;
  readonly doc: LegalDoc = inject(ActivatedRoute).snapshot.data['doc'] ?? 'terms';
}
