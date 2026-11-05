// src/app/admin/billing.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BillingComponent } from './billing.component';
import { BillingService } from '../shared/services/billing.service';
import { AuthService } from '../shared/services/auth.service';
import { BillingStatus } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('BillingComponent', () => {
  let fixture: ComponentFixture<BillingComponent>;
  let component: BillingComponent;
  let httpMock: HttpTestingController;

  const status = (over: Partial<BillingStatus> = {}): BillingStatus => ({
    billing_enabled: true,
    test_mode: false,
    plan: 'free',
    plan_source: 'manual',
    plan_expires_at: null,
    has_subscription: false,
    can_manage_billing: false,
    offers: { tournament_unlock: true, subscription_monthly: true, subscription_annual: true },
    free_participant_cap: 32,
    paid_participant_cap: 256,
    ...over,
  });

  /** Builds the component with a chosen set of query params, as if arriving at the URL. */
  async function setup(queryParams: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [BillingComponent, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BillingComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('loads status and offered plans on a plain visit', async () => {
    await setup();
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status());
    httpMock.expectOne(`${environment.apiUrl}/billing/plans`).flush({
      plans: [{ key: 'subscription_monthly', unit_amount: 900, currency: 'usd', interval: 'month', interval_count: 1 }],
    });

    expect(component.status()!.plan).toBe('free');
    expect(component.subscriptionOptions().length).toBe(1);
  });

  it('does not ask Stripe for prices when the account already subscribes', async () => {
    // /billing/plans is the one call that hits Stripe on a page load. Skipping it for a
    // subscriber keeps that cost off the common path — httpMock.verify() in afterEach is
    // what proves the request was never made.
    await setup();
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status({ has_subscription: true, plan: 'paid', plan_source: 'stripe' }));

    expect(component.plans()).toEqual([]);
  });

  it('does not ask for prices when billing is switched off', async () => {
    await setup();
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status({ billing_enabled: false }));

    expect(component.plans()).toEqual([]);
  });

  it('shows an unavailable message instead of buy buttons when billing is off', async () => {
    // An install with no Stripe keys must not offer a checkout that would 503.
    await setup();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status({ billing_enabled: false }));
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain("isn't set up");
    expect(text).not.toContain('Subscribe');
  });

  it('reconciles the checkout session it returns with, before loading status', async () => {
    // The redirect back from Stripe races the webhook. Without this call an organizer who
    // has just paid can land here still reading "Free".
    await setup({ session_id: 'cs_test_return' });
    fixture.detectChanges();

    const confirmReq = httpMock.expectOne(r => r.url === `${environment.apiUrl}/billing/confirm`);
    expect(confirmReq.request.params.get('session_id')).toBe('cs_test_return');
    confirmReq.flush({ status: 'paid', kind: 'subscription', already_fulfilled: false });

    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status({ plan: 'paid', plan_source: 'stripe', has_subscription: true }));

    expect(component.toast()).toContain('Payment received');
    expect(component.toastIsError()).toBeFalse();
  });

  it('reports a still-settling payment as pending rather than an error', async () => {
    await setup({ session_id: 'cs_test_slow' });
    fixture.detectChanges();

    httpMock.expectOne(r => r.url === `${environment.apiUrl}/billing/confirm`)
      .flush({ status: 'pending', kind: 'tournament_unlock', already_fulfilled: false });
    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status());
    httpMock.expectOne(`${environment.apiUrl}/billing/plans`).flush({ plans: [] });

    expect(component.toast()).toContain('still processing');
    expect(component.toastIsError()).toBeFalse();
  });

  it('still loads status when the reconcile call itself fails', async () => {
    // A failed reconcile is not a failed payment — the webhook remains the source of truth,
    // so the screen must not dead-end.
    await setup({ session_id: 'cs_test_err' });
    fixture.detectChanges();

    httpMock.expectOne(r => r.url === `${environment.apiUrl}/billing/confirm`)
      .flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status());
    httpMock.expectOne(`${environment.apiUrl}/billing/plans`).flush({ plans: [] });

    expect(component.status()).not.toBeNull();
    expect(component.toast()).toContain('still processing');
  });

  it('says nothing was charged when checkout is cancelled', async () => {
    await setup({ checkout: 'cancelled' });
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status());
    httpMock.expectOne(`${environment.apiUrl}/billing/plans`).flush({ plans: [] });

    expect(component.toast()).toContain('nothing was charged');
  });

  it('redirects to Stripe when a subscription checkout starts', async () => {
    await setup();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status());
    httpMock.expectOne(`${environment.apiUrl}/billing/plans`).flush({ plans: [] });

    // Stubbed rather than allowed to run: assigning window.location.href would navigate the
    // Karma runner out of the test page.
    const billing = TestBed.inject(BillingService);
    const redirect = spyOn(billing, 'redirectTo');

    component.subscribe('monthly');
    httpMock.expectOne(`${environment.apiUrl}/billing/checkout/subscription`)
      .flush({ url: 'https://checkout.stripe.com/c/pay/cs_test_1', session_id: 'cs_test_1' });

    expect(redirect).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
  });

  it('surfaces the server error and clears the busy state when checkout fails', async () => {
    await setup();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status());
    httpMock.expectOne(`${environment.apiUrl}/billing/plans`).flush({ plans: [] });

    component.subscribe('monthly');
    httpMock.expectOne(`${environment.apiUrl}/billing/checkout/subscription`)
      .flush({ error: 'This account already has an active subscription.' }, { status: 409, statusText: 'Conflict' });

    // A stuck spinner would leave the organizer unable to retry.
    expect(component.checkoutBusy()).toBeFalse();
    expect(component.toast()).toContain('already has an active subscription');
    expect(component.toastIsError()).toBeTrue();
  });

  it('refreshes the cached session plan so paid features unlock without a re-login', async () => {
    // The bug this prevents: a JWT lasts 8 hours and the cached profile is only written at
    // sign-in, so without this an organizer who has just paid keeps seeing free-tier UI.
    await setup();
    const auth = TestBed.inject(AuthService);
    const setPlan = spyOn(auth, 'setPlan');
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status({ plan: 'paid', plan_source: 'stripe', has_subscription: true }));

    expect(setPlan).toHaveBeenCalledWith('paid');
  });

  it('does not offer to manage billing for a hand-granted plan', async () => {
    // A comped account has no Stripe customer, so the portal button would open nothing.
    await setup();
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status({ plan: 'paid', plan_source: 'manual', can_manage_billing: false }));
    httpMock.expectOne(`${environment.apiUrl}/billing/plans`).flush({ plans: [] });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Granted by an administrator');
    expect(text).not.toContain('Manage billing');
  });

  describe('formatDate', () => {
    beforeEach(async () => {
      await setup();
      fixture.detectChanges();
      httpMock.expectOne(`${environment.apiUrl}/billing/status`).flush(status());
      httpMock.expectOne(`${environment.apiUrl}/billing/plans`).flush({ plans: [] });
    });

    it('renders the MySQL datetime shape the API actually sends', () => {
      // "2026-12-01 00:00:00" — Safari refuses to parse that without the T and returns
      // Invalid Date, so a naive new Date(str) shows "—" for every renewal date on iOS.
      expect(component.formatDate('2026-12-01 00:00:00')).toContain('2026');
      expect(component.formatDate('2026-12-01 00:00:00')).not.toBe('—');
    });

    it('shows a dash rather than a wrong date when there is nothing to show', () => {
      expect(component.formatDate(null)).toBe('—');
      expect(component.formatDate('not a date')).toBe('—');
    });
  });
});
