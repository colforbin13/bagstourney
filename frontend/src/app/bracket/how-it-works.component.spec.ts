// src/app/bracket/how-it-works.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HowItWorksComponent } from './how-it-works.component';
import { AuthService } from '../shared/services/auth.service';

describe('HowItWorksComponent', () => {
  let component: HowItWorksComponent;
  let fixture: ComponentFixture<HowItWorksComponent>;

  function setup(loggedIn = false) {
    TestBed.configureTestingModule({
      imports: [HowItWorksComponent],
      providers: [
        Router,
        { provide: ActivatedRoute, useValue: {} },
        { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } },
      ],
    });

    fixture = TestBed.createComponent(HowItWorksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    setup();
    expect(component).toBeTruthy();
  });

  it('should walk through every stage of running a tournament', () => {
    setup();
    const chapters: string[] = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.chapter h2'))
      .map(h => h.textContent!.trim());
    expect(chapters.length).toBe(7);
    expect(chapters[0]).toContain('Create the tournament');
    expect(chapters[chapters.length - 1]).toContain('Someone wins');
  });

  it('should number the steps consecutively', () => {
    setup();
    const numbers: string[] = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.chapter-num'))
      .map(el => el.textContent!.trim());
    expect(numbers).toEqual(['Step 01', 'Step 02', 'Step 03', 'Step 04', 'Step 05', 'Step 06', 'Step 07']);
  });

  it('should cover the venue setup — screen on the wall, signs by the door', () => {
    setup();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('TV mode');
    expect(text).toContain('nothing to install');
    expect(text).toContain('save as a PDF');
  });

  it('should explain all four creation choices', () => {
    setup();
    const terms: string[] = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.choices dt'))
      .map(dt => dt.textContent!.trim());
    expect(terms).toEqual([
      'Public or private',
      'Auto-draft or direct entry',
      'Automatic or manual seeding',
      'Single or double elimination',
    ]);
  });

  it('should say double elimination is paid and locks at bracket generation', () => {
    setup();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Double elimination is a paid-plan feature');
    expect(text).toContain("locked once the bracket is generated");
  });

  it('should explain how a double-elimination bracket actually runs', () => {
    setup();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('winners bracket');
    expect(text).toContain('losers bracket');
    expect(text).toContain('grand final');
  });

  it('should explain byes, which are otherwise unexplained anywhere in the app', () => {
    setup();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('byes');
    expect(text).toContain('advance automatically');
  });

  it('should call out that the sign-up link needs auto-draft', () => {
    setup();
    expect(fixture.nativeElement.textContent).toContain('sign-up link only works with auto-draft');
  });

  it('should send a reader wondering about their own game to the sports list', () => {
    setup();
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.lede a');
    expect(link.getAttribute('href')).toBe('/sports');
  });

  it('should close with sign-up actions for an anonymous reader', () => {
    setup();
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.closing a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin/register', '/']);
  });

  it('should close with in-app actions for a signed-in reader', () => {
    setup(true);
    const hrefs = Array.from<HTMLAnchorElement>(fixture.nativeElement.querySelectorAll('.closing a'))
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin', '/tournaments']);
  });
});
