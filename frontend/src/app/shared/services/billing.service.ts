// src/app/shared/services/billing.service.ts
//
// API client for the Stripe billing endpoints (FEATURE_TRACKER items 12/13). Kept separate
// from tournament.service.ts, which is already the general-purpose client for everything
// else, because billing is the one area where a mistaken call spends someone's money —
// keeping it in its own file makes every caller of it obvious.
//
// Nothing here handles card data or talks to Stripe directly: each checkout call returns a
// Stripe-hosted URL that the browser is redirected to, so no Stripe key ever reaches the
// client and the app stays out of PCI scope entirely.
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  BillingStatus,
  BillingPlanOption,
  BillingCheckoutSession,
  BillingConfirmation,
} from '../models/tournament.models';

@Injectable({ providedIn: 'root' })
export class BillingService {
  private api = environment.apiUrl;
  private http = inject(HttpClient);

  getStatus() {
    return this.http.get<BillingStatus>(`${this.api}/billing/status`);
  }

  /** Hits Stripe server-side, so only call it from a screen that actually shows prices. */
  getPlans() {
    return this.http.get<{ plans: BillingPlanOption[] }>(`${this.api}/billing/plans`);
  }

  startSubscriptionCheckout(interval: 'monthly' | 'annual') {
    return this.http.post<BillingCheckoutSession>(`${this.api}/billing/checkout/subscription`, { interval });
  }

  startTournamentUnlockCheckout(tournamentId: number) {
    return this.http.post<BillingCheckoutSession>(`${this.api}/billing/checkout/tournament`, {
      tournament_id: tournamentId,
    });
  }

  openPortal() {
    return this.http.post<{ url: string }>(`${this.api}/billing/portal`, {});
  }

  /**
   * Reconciles the session the organizer just returned from. Needed because the redirect
   * back and Stripe's webhook race each other — without this, someone who has just paid can
   * land on their own tournament page and see nothing changed.
   */
  confirm(sessionId: string) {
    return this.http.get<BillingConfirmation>(`${this.api}/billing/confirm`, {
      params: { session_id: sessionId },
    });
  }

  /**
   * Sends the browser to Stripe's hosted checkout.
   *
   * Wrapped as a method purely so tests can stub it — assigning window.location.href in a
   * spec navigates the Karma runner out of the page.
   */
  redirectTo(url: string) {
    window.location.href = url;
  }

  /**
   * Formats a Stripe minor-unit amount for display: 1500 USD reads as $15.00.
   *
   * Deliberately falls back to the raw currency code rather than throwing on a currency
   * Intl does not recognise — a price that renders plainly is better than an upgrade screen
   * that fails to render at all.
   */
  formatAmount(minorUnits: number | null, currency: string | null): string {
    if (minorUnits === null || !currency) return '';
    // Zero-decimal currencies (JPY, KRW) are not divided by 100. Intl knows which is which,
    // so ask it rather than hard-coding a list.
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() })
        .format(minorUnits / 100);
    } catch {
      return `${(minorUnits / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  }
}
