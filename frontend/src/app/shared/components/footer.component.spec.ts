// src/app/shared/components/footer.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FOOT_LINKS, FooterComponent, endsOnSheet } from './footer.component';
import { AuthService } from '../services/auth.service';

describe('FooterComponent', () => {
  // Every page the footer can sit under, so navigating to one doesn't fall through.
  const routes = ['pricing', 'how-it-works', 'sports', 'scoreholio-alternative', 'bracket/12']
    .map(path => ({ path, children: [] }));

  async function render(loggedIn: boolean, url = '/bracket/12'): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [
        provideRouter(routes),
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } },
      ],
    });
    const fixture = TestBed.createComponent(FooterComponent);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    return fixture.nativeElement;
  }
  const hrefs = (el: HTMLElement, selector: string) =>
    Array.from<HTMLAnchorElement>(el.querySelectorAll(selector)).map(a => a.getAttribute('href'));

  describe('the quiet footer', () => {
    it('should link to the generator, the fundraiser guide, pricing and every legal page', async () => {
      expect(hrefs(await render(false), '.app-footer-links a'))
        .toEqual(['/blind-draw-generator', '/cornhole-fundraiser', '/pricing', '/terms', '/refunds', '/privacy']);
    });

    it('should invite signed-out visitors to sign up', async () => {
      const cta = (await render(false)).querySelector<HTMLAnchorElement>('.app-footer-cta');
      expect(cta?.getAttribute('href')).toBe('/admin/register');
      expect(cta?.textContent?.trim()).toBe('Run your own tournament for free');
    });

    it('should not show the sign-up invite to signed-in organizers', async () => {
      expect((await render(true)).querySelector('.app-footer-cta')).toBeNull();
    });

    it('should keep Powered by Bracketway for everyone', async () => {
      expect((await render(true)).querySelector('.app-footer-brand')?.textContent).toContain('Powered by Bracketway');
    });

    it('should not print the sheet foot under a bracket', async () => {
      expect((await render(false)).querySelector('.sheet-foot')).toBeNull();
    });
  });

  describe('the sheet foot', () => {
    it('should know which pages end on it', () => {
      expect(endsOnSheet('/pricing')).toBeTrue();
      expect(endsOnSheet('/pricing?utm_source=x#faq')).toBeTrue();
      expect(endsOnSheet('/scoreholio-alternative')).toBeTrue();
      expect(endsOnSheet('/')).toBeFalse();
      expect(endsOnSheet('/terms')).toBeFalse();
      expect(endsOnSheet('/bracket/12')).toBeFalse();
    });

    it('should be the only ending on a Persuade page', async () => {
      const el = await render(false, '/pricing');
      expect(el.querySelector('.sheet-foot')).not.toBeNull();
      expect(el.querySelector('.app-footer')).toBeNull();
      expect(el.querySelectorAll('footer').length).toBe(1);
    });

    it('should lead a signed-out visitor to sign up', async () => {
      const el = await render(false, '/sports');
      expect(el.querySelector('.foot-line')?.textContent).toBe('Run your own tournament for free');
      const go = el.querySelector<HTMLAnchorElement>('.foot-go');
      expect(go?.getAttribute('href')).toBe('/admin/register');
      expect(go?.textContent?.trim()).toBe('Start free');
    });

    it('should send a signed-in organizer to set one up', async () => {
      const go = (await render(true, '/how-it-works')).querySelector<HTMLAnchorElement>('.foot-go');
      expect(go?.getAttribute('href')).toBe('/admin');
      expect(go?.textContent?.trim()).toBe('Set one up');
    });

    it('should send a signed-in organizer reading Pricing to Billing', async () => {
      const go = (await render(true, '/pricing')).querySelector<HTMLAnchorElement>('.foot-go');
      expect(go?.getAttribute('href')).toBe('/admin/billing');
      expect(go?.textContent?.trim()).toBe('Go to billing');
    });

    it('should index the other marketing pages, leaving out the one being read', async () => {
      expect(hrefs(await render(false, '/pricing'), '.foot-row'))
        .toEqual(['/how-it-works', '/blind-draw-generator', '/cornhole-fundraiser', '/sports']);
    });

    it('should index every marketing page from the comparison page, which is not in the index', async () => {
      expect(hrefs(await render(false, '/scoreholio-alternative'), '.foot-row')).toEqual(FOOT_LINKS.map(l => l.link));
    });

    it('should say what each indexed page is for', async () => {
      const notes = Array.from((await render(false, '/sports')).querySelectorAll('.foot-row-note'))
        .map(n => n.textContent?.trim());
      expect(notes.length).toBe(4);
      notes.forEach(note => expect(note).toBeTruthy());
    });

    it('should carry the legal pages and the way home', async () => {
      const el = await render(false, '/pricing');
      expect(hrefs(el, '.foot-legal a')).toEqual(['/terms', '/refunds', '/privacy']);
      expect(el.querySelector('.foot-brand')?.getAttribute('href')).toBe('/');
    });
  });
});
