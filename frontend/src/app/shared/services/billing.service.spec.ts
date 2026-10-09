// src/app/shared/services/billing.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BillingService } from './billing.service';
import { environment } from '../../../environments/environment';
import { BillingStatus } from '../models/tournament.models';

describe('BillingService', () => {
  let service: BillingService;
  let httpMock: HttpTestingController;

  const mockStatus: BillingStatus = {
    billing_enabled: true,
    test_mode: true,
    plan: 'free',
    plan_source: 'manual',
    plan_expires_at: null,
    has_subscription: false,
    can_manage_billing: false,
    offers: { tournament_unlock: true, subscription_monthly: true, subscription_annual: false },
    free_participant_cap: 32,
    paid_participant_cap: 256,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BillingService]
    });
    service = TestBed.inject(BillingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches billing status', () => {
    let received: BillingStatus | undefined;
    service.getStatus().subscribe(s => received = s);

    const req = httpMock.expectOne(`${environment.apiUrl}/billing/status`);
    expect(req.request.method).toBe('GET');
    req.flush(mockStatus);

    expect(received).toEqual(mockStatus);
  });

  it('starts a subscription checkout for the requested interval', () => {
    service.startSubscriptionCheckout('annual').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/billing/checkout/subscription`);
    expect(req.request.method).toBe('POST');
    // The interval decides which price the organizer is charged, so it is worth pinning
    // that it actually reaches the request body.
    expect(req.request.body).toEqual({ interval: 'annual' });
    req.flush({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', session_id: 'cs_test_1' });
  });

  it('starts a per-tournament checkout against the given tournament', () => {
    service.startTournamentUnlockCheckout(42).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/billing/checkout/tournament`);
    expect(req.request.method).toBe('POST');
    // Sending the wrong id would upgrade the wrong tournament for real money.
    expect(req.request.body).toEqual({ tournament_id: 42 });
    req.flush({ url: 'https://checkout.stripe.com/c/pay/cs_test_2', session_id: 'cs_test_2' });
  });

  it('opens the billing portal', () => {
    service.openPortal().subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/billing/portal`);
    expect(req.request.method).toBe('POST');
    req.flush({ url: 'https://billing.stripe.com/p/session/test' });
  });

  it('confirms a returned checkout session by query parameter', () => {
    service.confirm('cs_test_9').subscribe();

    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/billing/confirm`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('session_id')).toBe('cs_test_9');
    req.flush({ status: 'paid', kind: 'subscription', already_fulfilled: false });
  });

  it('fetches plan prices', () => {
    service.getPlans().subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/billing/plans`);
    expect(req.request.method).toBe('GET');
    req.flush({ plans: [] });
  });

  describe('formatAmount', () => {
    it('renders minor units as a currency amount', () => {
      // Stripe reports 1500 for $15.00; showing "1500" would be a fifteen-hundred-dollar
      // typo on a buy button.
      const formatted = service.formatAmount(1500, 'usd');
      expect(formatted).toContain('15');
      expect(formatted).toMatch(/\$|USD/);
    });

    it('returns an empty string when there is no amount', () => {
      expect(service.formatAmount(null, 'usd')).toBe('');
      expect(service.formatAmount(1500, null)).toBe('');
    });

    it('falls back to a plain amount for an unrecognised currency', () => {
      // Intl throws on a bad currency code. A price that renders plainly beats an upgrade
      // screen that fails to render at all.
      expect(service.formatAmount(1500, 'notacurrency')).toBe('15.00 NOTACURRENCY');
    });
  });
});
