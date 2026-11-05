// src/app/bracket/scoreholio-comparison.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ScoreholioComparisonComponent } from './scoreholio-comparison.component';
import { AuthService } from '../shared/services/auth.service';

describe('ScoreholioComparisonComponent', () => {
  function render(loggedIn: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [ScoreholioComparisonComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } }],
    });
    const fixture = TestBed.createComponent(ScoreholioComparisonComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('should show every comparison row with both sides, and when the facts were checked', () => {
    const el = render(false);
    const rows = el.querySelectorAll('.row');
    expect(rows.length).toBeGreaterThan(5);
    rows.forEach(row => expect(row.querySelectorAll('.cols > div').length).toBe(2));
    expect(el.querySelector('.checked')!.textContent).toContain('October 2026');
  });

  it('should be even-handed: say where Scoreholio is the better choice, and disclaim affiliation', () => {
    const text = render(false).textContent!;
    expect(text).toContain('When Scoreholio is the better choice');
    expect(text).toContain('not affiliated');
  });

  it('should send signed-out visitors to sign up and organizers to their dashboard', () => {
    expect(render(false).querySelector('.cta .btn-primary')!.getAttribute('href')).toBe('/admin/register');
    TestBed.resetTestingModule();
    expect(render(true).querySelector('.cta .btn-primary')!.getAttribute('href')).toBe('/admin');
  });
});
