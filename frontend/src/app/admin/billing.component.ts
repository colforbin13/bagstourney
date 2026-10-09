// src/app/admin/billing.component.ts
//
// The organizer's account billing screen (FEATURE_TRACKER item 12): subscribe, see what
// plan you are on, and jump to Stripe's portal to change a card or cancel.
//
// It is also the landing page a subscription checkout returns to. Stripe's redirect and
// Stripe's webhook race each other, and either can win, so arriving with ?session_id= makes
// this screen reconcile the purchase rather than assume the webhook already did — otherwise
// an organizer who has just paid can land here still reading "Free".
//
// Cancelling is deliberately not rebuilt here. It lives in Stripe's hosted portal, along
// with invoices and card updates, so there is no second implementation of cancellation to
// disagree with what Stripe actually did.
import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BillingService } from '../shared/services/billing.service';
import { AuthService } from '../shared/services/auth.service';
import { BillingStatus, BillingPlanOption } from '../shared/models/tournament.models';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <a routerLink="/admin" style="color:var(--text-dim);font-size:.8rem;">← Admin</a>
        <h1 style="margin-top:4px;">Billing</h1>
      </div>

      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (!status()) {
        <div class="empty">Could not load billing information.</div>
      } @else if (!status()!.billing_enabled) {
        <!-- The honest state for an install with no Stripe keys: say so plainly rather
             than showing buy buttons that would fail. -->
        <div class="empty">
          Online payment isn't set up on this installation yet.
          <div style="margin-top:8px;font-size:.85rem;">Plan changes are handled by an administrator for now.</div>
        </div>
      } @else {
        @if (status()!.test_mode) {
          <div class="notice notice-test">
            Stripe is in <strong>test mode</strong>. Checkout will accept test cards only and no real money moves.
          </div>
        }

        <section class="card">
          <div class="plan-row">
            <div>
              <div class="plan-label">Current plan</div>
              <div class="plan-name">{{ status()!.plan === 'paid' ? 'Paid' : 'Free' }}</div>
              <div class="plan-detail">
                Up to {{ status()!.plan === 'paid' ? status()!.paid_participant_cap : status()!.free_participant_cap }}
                participants per tournament@if (status()!.plan === 'paid') {, plus double elimination}.
              </div>
              @if (status()!.plan === 'paid' && status()!.plan_source === 'manual') {
                <!-- A comped account has no subscription to manage, and offering a
                     "manage billing" button that opens an empty portal is worse than
                     saying why it isn't there. -->
                <div class="plan-detail">Granted by an administrator — there's no subscription to manage.</div>
              }
              @if (status()!.plan_expires_at && status()!.plan_source === 'stripe') {
                <div class="plan-detail">Renews {{ formatDate(status()!.plan_expires_at) }}</div>
              }
            </div>

            @if (status()!.can_manage_billing) {
              <button class="btn btn-sm" [disabled]="portalBusy()" (click)="openPortal()">
                @if (portalBusy()) {
                  <span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>
                } @else {
                  Manage billing
                }
              </button>
            }
          </div>
        </section>

        @if (!status()!.has_subscription && subscriptionOptions().length > 0) {
          <h2 class="section-title">Upgrade</h2>
          <div class="offers">
            @for (opt of subscriptionOptions(); track opt.key) {
              <div class="offer">
                <div class="offer-name">{{ opt.key === 'subscription_annual' ? 'Annual' : 'Monthly' }}</div>
                <div class="offer-price">
                  {{ billing.formatAmount(opt.unit_amount, opt.currency) }}
                  <span class="offer-interval">/ {{ opt.interval ?? 'period' }}</span>
                </div>
                <div class="offer-detail">
                  Raises every tournament you own to {{ status()!.paid_participant_cap }} participants and unlocks
                  double elimination.
                </div>
                <button class="btn btn-sm btn-primary" [disabled]="checkoutBusy()"
                  (click)="subscribe(opt.key === 'subscription_annual' ? 'annual' : 'monthly')">
                  @if (checkoutBusy()) {
                    <span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>
                  } @else {
                    Subscribe
                  }
                </button>
              </div>
            }
          </div>
        }

        @if (status()!.offers.tournament_unlock) {
          <p class="footnote">
            Running one big event rather than many? A single tournament can be upgraded on its own from that
            tournament's page, with no subscription.
          </p>
        }
      }

      @if (toast()) {
        <div class="toast" [class.toast-error]="toastIsError()">{{ toast() }}</div>
      }
    </div>
  `,
  styles: [`
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin: 0; font-size: 2rem; }
    .empty { text-align: center; padding: 48px 24px; color: var(--text-dim); }
    .notice {
      padding: 12px 16px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      font-size: 0.85rem;
      margin-bottom: 16px;
    }
    .notice-test { background: var(--surface); color: var(--text-dim); }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
    }
    .plan-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .plan-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); }
    .plan-name { font-size: 1.5rem; font-weight: 600; margin: 2px 0 6px; }
    .plan-detail { font-size: 0.85rem; color: var(--text-dim); }
    .section-title { font-size: 1.1rem; margin: 28px 0 12px; }
    .offers { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .offer {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
    .offer-name { font-size: 0.75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--text-dim); }
    .offer-price { font-size: 1.6rem; font-weight: 600; }
    .offer-interval { font-size: 0.85rem; font-weight: 400; color: var(--text-dim); }
    .offer-detail { font-size: 0.85rem; color: var(--text-dim); flex: 1; }
    .footnote { font-size: 0.85rem; color: var(--text-dim); margin-top: 24px; }
    .toast {
      position: fixed;
      bottom: 24px;
      left: 24px;
      padding: 12px 16px;
      border-radius: var(--radius);
      font-size: 0.9rem;
      background: var(--marker);
      color: var(--marker-ink);
    }
    .toast-error { background: var(--danger, #b3261e); color: #fff; }
  `]
})
export class BillingComponent implements OnInit {
  billing = inject(BillingService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  status = signal<BillingStatus | null>(null);
  plans = signal<BillingPlanOption[]>([]);
  loading = signal(true);
  checkoutBusy = signal(false);
  portalBusy = signal(false);
  toast = signal('');
  toastIsError = signal(false);

  /** Only the recurring options; the per-tournament unlock is sold on a tournament page. */
  subscriptionOptions = computed(() =>
    this.plans().filter(p => p.key === 'subscription_monthly' || p.key === 'subscription_annual')
  );

  ngOnInit() {
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    const cancelled = this.route.snapshot.queryParamMap.get('checkout') === 'cancelled';

    if (cancelled) {
      this.showToast('Checkout cancelled — nothing was charged.', false);
      this.clearQueryParams();
    }

    if (sessionId) {
      this.confirmReturn(sessionId);
    } else {
      this.load();
    }
  }

  /**
   * Reconciles a checkout the organizer has just come back from, then reloads.
   *
   * 'pending' is a real and expected answer, not an error: a delayed payment method may
   * still be settling, and the webhook will finish the job when it does.
   */
  private confirmReturn(sessionId: string) {
    this.billing.confirm(sessionId).subscribe({
      next: result => {
        this.showToast(
          result.status === 'paid'
            ? 'Payment received — your plan is active.'
            : "Payment is still processing. We'll upgrade your plan as soon as it clears.",
          false,
        );
        this.clearQueryParams();
        this.load();
      },
      error: () => {
        // The webhook is still the source of truth, so a failed reconcile is not a failed
        // payment. Say the honest thing and reload rather than alarming the organizer.
        this.showToast('Payment is still processing. Refresh in a moment.', false);
        this.clearQueryParams();
        this.load();
      },
    });
  }

  /** Strips ?session_id= so a refresh doesn't re-run the reconcile against a spent session. */
  private clearQueryParams() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  load() {
    this.loading.set(true);
    this.billing.getStatus().subscribe({
      next: s => {
        this.status.set(s);
        // Keep the cached session profile honest, so paid-tier controls on other screens
        // unlock without a sign-out. Presentation only — every gate is server-side.
        this.auth.setPlan(s.plan);
        this.loading.set(false);
        // Only worth the round trip to Stripe when there is something to sell.
        if (s.billing_enabled && !s.has_subscription) {
          this.billing.getPlans().subscribe({
            next: r => this.plans.set(r.plans),
            error: () => this.plans.set([]),
          });
        }
      },
      error: () => this.loading.set(false),
    });
  }

  subscribe(interval: 'monthly' | 'annual') {
    this.checkoutBusy.set(true);
    this.billing.startSubscriptionCheckout(interval).subscribe({
      next: session => this.billing.redirectTo(session.url),
      error: err => {
        this.checkoutBusy.set(false);
        this.showToast(err?.error?.error ?? 'Could not start checkout. Please try again.', true);
      },
    });
  }

  openPortal() {
    this.portalBusy.set(true);
    this.billing.openPortal().subscribe({
      next: r => this.billing.redirectTo(r.url),
      error: err => {
        this.portalBusy.set(false);
        this.showToast(err?.error?.error ?? 'Could not open the billing portal.', true);
      },
    });
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    // The API sends a MySQL DATETIME in UTC; Safari refuses to parse that with a space.
    const parsed = new Date(dateStr.replace(' ', 'T') + 'Z');
    if (isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private showToast(msg: string, isError: boolean) {
    this.toastIsError.set(isError);
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 4000);
  }
}
