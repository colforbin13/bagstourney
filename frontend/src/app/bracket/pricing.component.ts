// src/app/bracket/pricing.component.ts
//
// The public Pricing page: what's free, what Pro adds, what a one-time tournament upgrade
// adds, and the questions people ask before paying. Public for the same reason as
// how-it-works — it matters most to someone who hasn't signed up yet.
//
// Stripe is the price of record. In the browser, amounts come live from Stripe through
// GET /billing/plans, and the participant caps ride along in the same response, so a price
// changed in the dashboard shows to visitors without a deploy. The page starts from built-in
// copies of the prices and caps (FALLBACK_PLANS and the caps below), because it is also
// prerendered at build time with no API to ask, and that HTML is what search engines read.
// Those copies need a deploy to change. If the call fails, the built-in prices stay up; if
// billing is off on this installation, the tiers are still described without price lines.
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { BillingService } from '../shared/services/billing.service';
import { BillingPlanOption } from '../shared/models/tournament.models';
import { LEGAL } from '../shared/legal';
import { RouterLink } from '@angular/router';
import { EXAMPLE_BRACKETS } from '../shared/examples';

// Mirrors FREEMIUM_*_MAX_PARTICIPANTS in api/middleware/auth.php. Used only until the API
// answers (or if it can't), so the page never renders a blank where a number belongs.
const FALLBACK_FREE_CAP = 32;
const FALLBACK_PAID_CAP = 256;

// The live Stripe prices, as of 2026-10-18 (per Matt). The page is prerendered at build time,
// when there is no API to ask (app.routes.server.ts), so without these the HTML search engines
// read would name the plans but not what they cost. The API's answer replaces them in the
// browser, so a price changed in Stripe shows correctly to visitors; update these to match so
// the prerendered page does too.
const FALLBACK_PLANS: BillingPlanOption[] = [
  { key: 'subscription_monthly', unit_amount: 999, currency: 'usd', interval: 'month', interval_count: 1 },
  { key: 'subscription_annual', unit_amount: 9999, currency: 'usd', interval: 'year', interval_count: 1 },
  { key: 'tournament_unlock', unit_amount: 1299, currency: 'usd', interval: null, interval_count: null },
];

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="sheet-head">
      <h1>Free to run. Pro when it gets big.</h1>
      <p class="lede">
        Most tournaments never need to pay for anything. Upgrade when your field outgrows the
        free tier, or when you want double elimination, pool play or board assignments. You can
        upgrade everything you run, or just one tournament.
      </p>
    </header>

    <div class="sheet-body">

      @if (billingUnavailable()) {
        <div class="notice">Paid plans aren't on sale yet. Everything in Free works today.</div>
      }

      <div class="tiers ruled">
        <section class="tier">
          <h2 class="tier-name">Free</h2>
          <div class="tier-price">{{ zeroPrice() }}</div>
          <p class="tier-pitch">For trying it out, or any smaller event.</p>
          <ul class="tier-list">
            <li>Up to {{ freeCap() }} players per tournament ({{ freeCap() / 2 }} two-player teams)</li>
            <li>Single elimination</li>
            <li>Live scoring from any phone</li>
            <li>QR sign-ups, posters and the TV display</li>
            <li>As many tournaments as you like</li>
          </ul>
        </section>

        <section class="tier tier-featured">
          <h2 class="tier-name">Pro</h2>
          @if (monthly(); as m) {
            <div class="tier-price">
              {{ billing.formatAmount(m.unit_amount, m.currency) }} <span class="per">/ month</span>
            </div>
          }
          @if (annual(); as a) {
            <div class="tier-alt">or {{ billing.formatAmount(a.unit_amount, a.currency) }} / year</div>
          }
          <p class="tier-pitch">For organizers who run tournaments regularly.</p>
          <ul class="tier-list">
            <li>Everything in Free</li>
            <li>Up to {{ paidCap() }} players in every tournament you create</li>
            <li>Double elimination</li>
            <li>Pool play to seed the bracket</li>
            <li>Board assignments with an up-next queue</li>
            <li>Sponsor logos on the bracket and TV</li>
            <li>Cancel anytime</li>
          </ul>
        </section>

        <section class="tier">
          <h2 class="tier-name">One tournament</h2>
          @if (unlock(); as u) {
            <div class="tier-price">
              {{ billing.formatAmount(u.unit_amount, u.currency) }} <span class="per">once</span>
            </div>
          }
          <p class="tier-pitch">For one big event, with no subscription.</p>
          <ul class="tier-list">
            <li>Everything in Free</li>
            <li>Up to {{ paidCap() }} players in that tournament</li>
            <li>Double elimination</li>
            <li>Pool play to seed the bracket</li>
            <li>Board assignments with an up-next queue</li>
            <li>Sponsor logos on the bracket and TV</li>
            <li>Buy it from the tournament's own page</li>
          </ul>
        </section>
      </div>

      @if (hasAnyPrice()) {
        <p class="tax-note">Sales tax is added at checkout where it applies.</p>
      }

      <p class="see-examples">
        See what Pro adds on made-up events:
        <a [routerLink]="examples.doubleElimination">double elimination with board assignments</a>
        and <a [routerLink]="examples.poolPlay">pool play into a bracket</a>.
      </p>

      <section class="faq ruled">
        <h2 class="faq-title">Questions</h2>
        @for (item of faq; track item.q) {
          <details class="faq-item">
            <summary>{{ item.q }}</summary>
            <p>{{ item.a(freeCap(), paidCap()) }}</p>
          </details>
        }
      </section>

    </div>
  `,
  styles: [`
    .notice {
      padding: 12px 16px;
      margin-bottom: 20px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
      font-size: 0.85rem;
      color: var(--text-dim);
    }

    /* Stacked on a phone, three across once there's room. */
    .tiers { display: grid; gap: 16px; grid-template-columns: 1fr; }
    .tier {
      display: flex;
      flex-direction: column;
      padding: 20px;
      background: var(--surface);
      border: 1.5px solid var(--text);
      border-radius: var(--radius);
    }
    /* Pro stands out by a heavier frame and marker-green name and price; marker, not sheet
       green, because sheet green is too light to read as text on white. */
    .tier-featured { border: 3px solid var(--text); padding: 18.5px; }
    .tier-featured .tier-name, .tier-featured .tier-price { color: var(--marker); }
    .tier-name { font-size: 1.5rem; font-stretch: 106%; margin-bottom: 6px; }
    .tier-price { font-size: 1.9rem; font-weight: 800; line-height: 1.2; }
    .per { font-size: 0.85rem; font-weight: 400; color: var(--text-dim); }
    .tier-alt { font-size: 0.8rem; color: var(--text-dim); margin-top: 2px; }
    .tier-pitch { font-size: 0.85rem; color: var(--text-dim); margin-top: 8px; }
    .tier-list {
      list-style: none;
      margin-top: 14px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }
    .tier-list li {
      font-size: 0.85rem;
      line-height: 1.5;
      padding: 4px 0 4px 18px;
      position: relative;
    }
    .tier-list li::before {
      content: '';
      position: absolute;
      left: 2px;
      top: .62em;
      width: 5px;
      height: 9px;
      border-right: 2px solid var(--text);
      border-bottom: 2px solid var(--text);
      transform: rotate(45deg);
    }
    /* Across, each card shares the row's five tracks (name, price, yearly price, pitch,
       features), so every feature list starts on the same line whatever sits above it. */
    @media (min-width: 720px) {
      .tiers { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(5, auto); row-gap: 0; }
      .tier { display: grid; grid-row: span 5; grid-template-rows: subgrid; align-content: start; }
      .tier-name { grid-row: 1; }
      .tier-price { grid-row: 2; }
      .tier-alt { grid-row: 3; }
      .tier-pitch { grid-row: 4; }
      .tier-list { grid-row: 5; align-self: start; }
    }
    .tax-note { font-size: 0.78rem; color: var(--muted); margin-top: 12px; }
    .see-examples { margin-top: 20px; max-width: 62ch; font-size: 0.95rem; color: var(--text-dim); }

    .faq { margin-top: clamp(40px, 5vw, 64px); max-width: 820px; }
    .faq-title { font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 900; font-stretch: 106%; margin-bottom: 12px; }
    .faq-item { border-top: 1.5px solid var(--text); }
    .faq-item:last-child { border-bottom: 1.5px solid var(--text); }
    .faq-item summary {
      cursor: pointer;
      padding: 14px 0;
      font-weight: 600;
      font-size: 0.95rem;
    }
    .faq-item p {
      font-size: 0.88rem;
      line-height: 1.6;
      color: var(--text-dim);
      padding-bottom: 14px;
    }

  `]
})
export class PricingComponent implements OnInit {
  billing = inject(BillingService);

  private plans = signal<BillingPlanOption[]>(FALLBACK_PLANS);
  private billingEnabled = signal<boolean | null>(null);
  readonly freeCap = signal(FALLBACK_FREE_CAP);
  readonly paidCap = signal(FALLBACK_PAID_CAP);

  readonly monthly = computed(() => this.plan('subscription_monthly'));
  readonly annual = computed(() => this.plan('subscription_annual'));
  readonly unlock = computed(() => this.plan('tournament_unlock'));
  readonly hasAnyPrice = computed(() => this.plans().some(p => p.unit_amount !== null));
  /** Only an explicit "billing is off" from the API. A failed request keeps the built-in prices. */
  readonly billingUnavailable = computed(() => this.billingEnabled() === false);

  /** Made-up tournaments that show the paid formats. */
  readonly examples = EXAMPLE_BRACKETS;
  /** $0 in the same currency the paid prices use, so the three columns read alike. */
  readonly zeroPrice = computed(() => this.billing.formatAmount(0, this.plans()[0]?.currency ?? 'usd'));

  // Answers take the caps as arguments so a changed cap can't leave a stale number in prose.
  readonly faq: { q: string; a: (free: number, paid: number) => string }[] = [
    {
      q: 'Do I need to pay to run a tournament?',
      a: free => `No. Free covers tournaments of up to ${free} players with single elimination, and you can run as many as you like. You only pay for a bigger field, double elimination, pool play or board assignments.`,
    },
    {
      q: 'Should I get Pro or upgrade one tournament?',
      a: () => "If you run one big event a year, upgrade just that tournament. If you run them regularly, Pro covers every tournament you create for one monthly price.",
    },
    {
      q: 'Can I upgrade a tournament after I\'ve set it up?',
      a: () => "Yes. The bigger player limit applies as soon as you upgrade, so you can keep adding players. Double elimination has to be chosen before the bracket is generated, because the bracket's whole shape depends on it.",
    },
    {
      q: 'What happens if I cancel Pro?',
      a: free => `You keep Pro until the end of the period you've paid for. After that, new choices fall back to the free tier of ${free} players and single elimination. A bracket that's already been generated keeps running exactly as it is, so a lapse never interrupts an event in progress.`,
    },
    {
      q: 'Does Pro cover tournaments I help run?',
      a: () => "Pro applies to the tournaments you create. If you're a manager or scorekeeper on someone else's tournament, that tournament uses its creator's plan.",
    },
    {
      q: 'Who handles the payment, and why is there sales tax?',
      a: () => 'Payments are processed by Stripe through Link, which sells the plan on our behalf, so your card statement shows LINK.COM. Stripe works out any sales tax for where you live, adds it at checkout, and emails your receipt.',
    },
    {
      q: 'Can I get a refund?',
      a: () => `Yes, within limits. A one-time upgrade is refundable for ${LEGAL.refundDays.tournamentUpgrade} days if that tournament's bracket hasn't been generated yet. A Pro charge is refundable if you ask within ${LEGAL.refundDays.monthly} days (monthly) or ${LEGAL.refundDays.annual} days (annual). The full details are in our Refund policy, linked at the bottom of every page.`,
    },
    {
      q: 'How do I cancel or change my card?',
      a: () => 'Open Billing from your account menu and choose Manage billing. Cancelling, updating your card and downloading receipts all happen there.',
    },
  ];

  ngOnInit() {
    this.billing.getPlans().subscribe({
      next: r => {
        this.plans.set(r.plans ?? []);
        this.billingEnabled.set(r.billing_enabled ?? null);
        if (r.free_participant_cap) this.freeCap.set(r.free_participant_cap);
        if (r.paid_participant_cap) this.paidCap.set(r.paid_participant_cap);
      },
      // Keep the fallback prices: they are the real ones, and the page reads complete without
      // alarming a visitor. An explicit "billing is off" still hides them, via billingEnabled.
      error: () => {},
    });
  }

  private plan(key: BillingPlanOption['key']): BillingPlanOption | null {
    const p = this.plans().find(x => x.key === key);
    return p && p.unit_amount !== null ? p : null;
  }
}
