// src/app/bracket/pricing.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { PricingComponent } from './pricing.component';
import { AuthService } from '../shared/services/auth.service';
import { environment } from '../../environments/environment';

describe('PricingComponent', () => {
  let component: PricingComponent;
  let fixture: ComponentFixture<PricingComponent>;
  let httpMock: HttpTestingController;

  const plansUrl = `${environment.apiUrl}/billing/plans`;
  const livePlans = {
    billing_enabled: true,
    free_participant_cap: 32,
    paid_participant_cap: 256,
    plans: [
      { key: 'tournament_unlock', unit_amount: 1299, currency: 'usd', interval: null, interval_count: null },
      { key: 'subscription_monthly', unit_amount: 999, currency: 'usd', interval: 'month', interval_count: 1 },
    ],
  };

  function setup(loggedIn = false) {
    TestBed.configureTestingModule({
      imports: [PricingComponent, HttpClientTestingModule],
      providers: [
        Router,
        { provide: ActivatedRoute, useValue: {} },
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } },
      ],
    });

    fixture = TestBed.createComponent(PricingComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  }

  afterEach(() => httpMock.verify());

  it('should create', () => {
    setup();
    httpMock.expectOne(plansUrl).flush(livePlans);
    expect(component).toBeTruthy();
  });

  it('should show the live Stripe prices on the Pro and one-tournament tiers', () => {
    setup();
    httpMock.expectOne(plansUrl).flush(livePlans);
    fixture.detectChanges();

    const prices = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.tier-price'))
      .map(el => el.textContent!.replace(/\s+/g, ' ').trim());
    expect(prices.length).toBe(3);
    expect(prices[1]).toContain('9.99');
    expect(prices[1]).toContain('/ month');
    expect(prices[2]).toContain('12.99');
    expect(text()).toContain('Sales tax is added at checkout');
  });

  it('should name the paid plan Pro', () => {
    setup();
    httpMock.expectOne(plansUrl).flush(livePlans);
    fixture.detectChanges();
    const names = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.tier-name'))
      .map(h => h.textContent!.trim());
    expect(names).toEqual(['Free', 'Pro', 'One tournament']);
  });

  it('should only offer an annual price when one is configured', () => {
    setup();
    httpMock.expectOne(plansUrl).flush(livePlans);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tier-alt')).toBeNull();

    TestBed.resetTestingModule();
    setup();
    httpMock.expectOne(plansUrl).flush({
      ...livePlans,
      plans: [...livePlans.plans,
        { key: 'subscription_annual', unit_amount: 9999, currency: 'usd', interval: 'year', interval_count: 1 }],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tier-alt').textContent).toContain('99.99');
  });

  // The caps come from the API so the copy can't drift from what the server enforces.
  it('should describe the caps the API reports, not hard-coded ones', () => {
    setup();
    httpMock.expectOne(plansUrl).flush({ ...livePlans, free_participant_cap: 20, paid_participant_cap: 100 });
    fixture.detectChanges();
    expect(text()).toContain('Up to 20 players per tournament (10 two-player teams)');
    expect(text()).toContain('Up to 100 players in every tournament you create');
    expect(text()).toContain('tournaments of up to 20 players');
  });

  it('should still describe every tier, without prices, when billing is off', () => {
    setup();
    httpMock.expectOne(plansUrl).flush({ billing_enabled: false, plans: [], free_participant_cap: 32, paid_participant_cap: 256 });
    fixture.detectChanges();

    expect(text()).toContain("Paid plans aren't on sale yet");
    expect(fixture.nativeElement.querySelectorAll('.tier').length).toBe(3);
    // Only Free's $0 is left.
    expect(fixture.nativeElement.querySelectorAll('.tier-price').length).toBe(1);
    expect(text()).not.toContain('Sales tax is added');
  });

  it('should fall back quietly when the price request fails', () => {
    setup();
    httpMock.expectOne(plansUrl).flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(text()).not.toContain("Paid plans aren't on sale yet");
    expect(text()).toContain('Up to 32 players per tournament');
    expect(text()).toContain('Up to 256 players');
    // The built-in prices are the real ones, so a failed request keeps them.
    expect(text()).toContain('$9.99');
  });

  // What the prerendered page shows: the build has no API, so nothing ever answers.
  it('should show the built-in prices before the API answers', () => {
    setup();
    fixture.detectChanges();
    const prices = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.tier-price'))
      .map(el => el.textContent ?? '');
    expect(prices[1]).toContain('$9.99');
    expect(fixture.nativeElement.querySelector('.tier-alt').textContent).toContain('$99.99');
    expect(prices[2]).toContain('$12.99');
    httpMock.expectOne(plansUrl);
  });

  it('should answer the questions people ask before paying', () => {
    setup();
    httpMock.expectOne(plansUrl).flush(livePlans);
    fixture.detectChanges();
    const questions = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.faq-item summary'))
      .map(s => s.textContent!.trim());
    expect(questions.length).toBe(component.faq.length);
    expect(questions).toContain('What happens if I cancel Pro?');
    expect(text()).toContain('never interrupts an event in progress');
  });

  it('should tell buyers the statement descriptor and the refund windows', () => {
    setup();
    httpMock.expectOne(plansUrl).flush(livePlans);
    fixture.detectChanges();
    expect(text()).toContain('your card statement shows LINK.COM');
    expect(text()).toContain('refundable for 14 days');
    expect(text()).toContain('7 days (monthly) or 30 days (annual)');
  });

  it('should close with sign-up actions for an anonymous visitor', () => {
    setup();
    httpMock.expectOne(plansUrl).flush(livePlans);
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.closing a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin/register', '/how-it-works']);
  });

  it('should send a signed-in organizer to Billing', () => {
    setup(true);
    httpMock.expectOne(plansUrl).flush(livePlans);
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.closing a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin/billing', '/admin']);
  });
});
