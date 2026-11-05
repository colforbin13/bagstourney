// src/app/bracket/legal.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { LegalComponent, LegalDoc } from './legal.component';
import { LEGAL } from '../shared/legal';

describe('LegalComponent', () => {
  function render(doc?: LegalDoc) {
    TestBed.configureTestingModule({
      imports: [LegalComponent],
      providers: [
        Router,
        { provide: ActivatedRoute, useValue: { snapshot: { data: doc ? { doc } : {} } } },
      ],
    });
    const fixture = TestBed.createComponent(LegalComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { component: fixture.componentInstance, el, text: el.textContent!.replace(/\s+/g, ' ') };
  }

  it('should render the page the route asks for', () => {
    expect(render('terms').el.querySelector('h1')!.textContent).toBe('Terms of service');
    TestBed.resetTestingModule();
    expect(render('refunds').el.querySelector('h1')!.textContent).toBe('Refund policy');
    TestBed.resetTestingModule();
    expect(render('privacy').el.querySelector('h1')!.textContent).toBe('Privacy policy');
  });

  it('should default to the terms when the route names no page', () => {
    expect(render().component.doc).toBe('terms');
  });

  it('should name the operator, support address and governing state in the terms', () => {
    const { el, text } = render('terms');
    expect(text).toContain(`${LEGAL.operator}, doing business as Bracketway`);
    expect(text).toContain(`State of ${LEGAL.governingState}`);
    expect(el.querySelector(`a[href="mailto:${LEGAL.supportEmail}"]`)).not.toBeNull();
    expect(text).toContain(`Effective ${LEGAL.effectiveDate}`);
  });

  // The windows are the part an organizer will hold us to, so they must come from the one
  // constant the Pricing FAQ also reads, not be retyped into prose.
  it('should state the refund windows from the shared constants', () => {
    const { text } = render('refunds');
    expect(text).toContain(`${LEGAL.refundDays.tournamentUpgrade} days of buying it`);
    expect(text).toContain(`${LEGAL.refundDays.monthly} days of a monthly charge`);
    expect(text).toContain(`${LEGAL.refundDays.annual} days of an annual charge`);
    expect(text).toContain("bracket hasn't been generated");
  });

  it('should say card data never reaches us and name every processor', () => {
    const { text } = render('privacy');
    expect(text).toContain('never see or store card numbers');
    for (const processor of ['Stripe', 'Postmark', 'Brevo']) {
      expect(text).toContain(processor);
    }
    expect(text).toContain("We don't sell personal information");
  });

  it('should link the terms to the Pricing page and Refund policy', () => {
    const hrefs = Array.from(render('terms').el.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/pricing');
    expect(hrefs).toContain('/refunds');
  });
});
