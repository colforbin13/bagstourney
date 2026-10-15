// src/app/shared/components/footer.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  it('should link to pricing and every legal page', () => {
    TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [Router, { provide: ActivatedRoute, useValue: {} }],
    });
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();

    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.app-footer-links a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/pricing', '/terms', '/refunds', '/privacy']);
  });
});
