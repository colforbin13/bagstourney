// src/app/shared/components/footer.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { FooterComponent } from './footer.component';
import { AuthService } from '../services/auth.service';

describe('FooterComponent', () => {
  function render(loggedIn: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [
        Router,
        { provide: ActivatedRoute, useValue: {} },
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } },
      ],
    });
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('should link to pricing and every legal page', () => {
    const hrefs = Array.from<HTMLAnchorElement>(render(false).querySelectorAll('.app-footer-links a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/pricing', '/terms', '/refunds', '/privacy']);
  });

  it('should invite signed-out visitors to sign up', () => {
    const cta = render(false).querySelector<HTMLAnchorElement>('.app-footer-cta');
    expect(cta?.getAttribute('href')).toBe('/admin/register');
    expect(cta?.textContent?.trim()).toBe('Run your own tournament for free');
  });

  it('should not show the sign-up invite to signed-in organizers', () => {
    expect(render(true).querySelector('.app-footer-cta')).toBeNull();
  });

  it('should keep Powered by Bracketway for everyone', () => {
    expect(render(true).querySelector('.app-footer-brand')?.textContent).toContain('Powered by Bracketway');
  });
});
