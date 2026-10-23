// src/app/bracket/fundraiser-guide.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FundraiserGuideComponent } from './fundraiser-guide.component';
import { AuthService } from '../shared/services/auth.service';

describe('FundraiserGuideComponent', () => {
  function render(loggedIn: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [FundraiserGuideComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { isLoggedIn: () => loggedIn } }],
    });
    const fixture = TestBed.createComponent(FundraiserGuideComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('should carry the guide in the template, where the prerendered page can serve it', () => {
    const text = render(false).textContent!;
    expect(text).toContain('How to run a cornhole fundraiser tournament');
    expect(text).toContain('Board sponsors');
    expect(text).toContain('free for up to 32 players');
    expect(text).toContain('$12.99');
  });

  it('should send signed-out visitors to sign up and organizers to their dashboard', () => {
    expect(render(false).querySelector('.cta .btn-primary')!.getAttribute('href')).toBe('/admin/register');
    TestBed.resetTestingModule();
    expect(render(true).querySelector('.cta .btn-primary')!.getAttribute('href')).toBe('/admin');
  });
});
