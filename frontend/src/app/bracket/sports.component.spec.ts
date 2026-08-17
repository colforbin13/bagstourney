// src/app/bracket/sports.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { SportsComponent } from './sports.component';
import { AuthService } from '../shared/services/auth.service';

describe('SportsComponent', () => {
  let component: SportsComponent;
  let fixture: ComponentFixture<SportsComponent>;

  function setup(loggedIn = false) {
    TestBed.configureTestingModule({
      imports: [SportsComponent],
      providers: [
        Router,
        { provide: ActivatedRoute, useValue: {} },
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } },
      ],
    });

    fixture = TestBed.createComponent(SportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    setup();
    expect(component).toBeTruthy();
  });

  it('should render a section per group, each with its sports', () => {
    setup();
    const sections = fixture.nativeElement.querySelectorAll('.group');
    expect(sections.length).toBe(component.groups.length);

    const names: string[] = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.group-name'))
      .map(h => h.textContent!.trim());
    expect(names).toEqual(component.groups.map(g => g.name));

    const rendered = fixture.nativeElement.querySelectorAll('.sports li').length;
    const declared = component.groups.reduce((n, g) => n + g.sports.length, 0);
    expect(rendered).toBe(declared);
  });

  it('should name the sports organizers arrive looking for', () => {
    setup();
    const text: string = fixture.nativeElement.textContent;
    for (const sport of ['Bags (Cornhole)', 'KanJam', 'Pickleball', 'Euchre']) {
      expect(text).toContain(sport);
    }
  });

  // The whole point of the page is that no sport is special-cased — a reader who doesn't
  // find their game needs to be told it still works, or the list reads as a whitelist.
  it('should tell a reader whose game is missing that it still works', () => {
    setup();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain("Don't see yours?");
    expect(text).toContain('no sport field on a tournament');
  });

  it('should close with sign-up actions for an anonymous reader', () => {
    setup();
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.closing a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin/register', '/how-it-works']);
  });

  it('should close with in-app actions for a signed-in reader', () => {
    setup(true);
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.closing a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin', '/how-it-works']);
  });

  // Guards the one spelling Matt called out explicitly. "Can Jam"/"Kan Jam" are wrong.
  it('should spell KanJam as one word', () => {
    setup();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('KanJam');
    expect(text).not.toMatch(/Kan Jam|Can Jam/i);
  });
});
