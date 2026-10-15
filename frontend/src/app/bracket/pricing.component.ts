// src/app/bracket/pricing.component.ts
//
// The public Pricing page: what's free, what Pro adds, what a one-time tournament upgrade
// adds, and the questions people ask before paying. Public for the same reason as
// how-it-works — it matters most to someone who hasn't signed up yet.
//
// Nothing here hard-codes a price or a cap. Amounts come live from Stripe through
// GET /billing/plans (Stripe is the price of record, so changing a price is a dashboard
// edit, not a deploy), and the participant caps ride along in the same response. If the
// call fails, or billing is off on this installation, the tiers are still described —
// only the price lines disappear.
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';
import { BillingService } from '../shared/services/billing.service';
import { BillingPlanOption } from '../shared/models/tournament.models';
import { LEGAL } from '../shared/legal';

// Mirrors FREEMIUM_*_MAX_PARTICIPANTS in api/middleware/auth.php. Used only until the API
// answers (or if it can't), so the page never renders a blank where a number belongs.
const FALLBACK_FREE_CAP = 32;
const FALLBACK_PAID_CAP = 256;

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <header class="intro">
        <p class="eyebrow">Pricing</p>
        <h1>Free to run. Pro when it gets big.</h1>
        <p class="lede">
          Most tournaments never need to pay for anything. Upgrade when your field outgrows the
          free tier or you want double elimination or pool play, either for every tournament you run or
          just for one.
        </p>
      </header>

      @if (billingUnavailable()) {
        <div class="notice">Paid plans aren't on sale yet. Everything in Free works today.</div>
      }

      <div class="tiers">
        <section class="tier">
          <h2 class="tier-name">Free</h2>
          <div class="tier-price">{{ zeroPrice() }}</div>
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
            <li>Buy it from the tournament's own page</li>
          </ul>
        </section>
      </div>

      @if (hasAnyPrice()) {
        <p class="tax-note">Sales tax is added at checkout where it applies.</p>
      }

      <section class="faq">
        <h2 class="faq-title">Questions</h2>
        @for (item of faq; track item.q) {
          <details class="faq-item">
            <summary>{{ item.q }}</summary>
            <p>{{ item.a(freeCap(), paidCap()) }}</p>
          </details>
        }
      </section>

      <div class="closing">
        @if (auth.isLoggedIn()) {
          <a class="btn btn-primary" routerLink="/admin/billing">Go to Billing</a>
          <a class="btn" routerLink="/admin">Your tournaments</a>
        } @else {
          <a class="btn btn-primary" routerLink="/admin/register">Create a free account</a>
          <a class="btn" routerLink="/how-it-works">How it works</a>
        }
      </div>
    </div>
  `,
  styles: [`
    .intro { margin-bottom: 32px; }
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
    @media (min-width: 720px) {
      .tiers { grid-template-columns: repeat(3, 1fr); }
    }
    .tier {
      display: flex;
      flex-direction: column;
      padding: 20px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .tier-featured { border: 2px solid var(--accent); }
    .tier-name { font-size: 1.5rem; margin-bottom: 6px; }
    .tier-price { font-size: 1.6rem; font-weight: 600; line-height: 1.2; }
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
      content: '✓';
      position: absolute;
      left: 0;
      color: var(--marker);
      font-weight: 600;
    }
    .tax-note { font-size: 0.78rem; color: var(--muted); margin-top: 12px; }

    .faq { margin-top: 40px; }
    .faq-title { font-size: 1.4rem; margin-bottom: 8px; }
    .faq-item { border-top: 1px solid var(--border); }
    .faq-item:last-child { border-bottom: 1px solid var(--border); }
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

    .closing { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 36px; }
  `]
})
export class PricingComponent implements OnInit {
  auth = inject(AuthService);
  billing = inject(BillingService);

  private plans = signal<BillingPlanOption[]>([]);
  private billingEnabled = signal<boolean | null>(null);
  readonly freeCap = signal(FALLBACK_FREE_CAP);
  readonly paidCap = signal(FALLBACK_PAID_CAP);

  readonly monthly = computed(() => this.plan('subscription_monthly'));
  readonly annual = computed(() => this.plan('subscription_annual'));
  readonly unlock = computed(() => this.plan('tournament_unlock'));
  readonly hasAnyPrice = computed(() => this.plans().some(p => p.unit_amount !== null));
  /** Only an explicit "billing is off" from the API — a failed request just hides prices. */
  readonly billingUnavailable = computed(() => this.billingEnabled() === false);
  /** $0 in the same currency the paid prices use, so the three columns read alike. */
  readonly zeroPrice = computed(() => this.billing.formatAmount(0, this.plans()[0]?.currency ?? 'usd'));

  // Answers take the caps as arguments so a changed cap can't leave a stale number in prose.
  readonly faq: { q: string; a: (free: number, paid: number) => string }[] = [
    {
      q: 'Do I need to pay to run a tournament?',
      a: free => `No. Free covers tournaments of up to ${free} players with single elimination, and you can run as many as you like. You only pay for a bigger field, double elimination or pool play.`,
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
      // The page is still complete without prices; say nothing rather than alarm a visitor.
      error: () => this.plans.set([]),
    });
  }

  private plan(key: BillingPlanOption['key']): BillingPlanOption | null {
    const p = this.plans().find(x => x.key === key);
    return p && p.unit_amount !== null ? p : null;
  }
}
