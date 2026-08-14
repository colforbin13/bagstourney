// src/app/shared/components/nav.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NavComponent } from './nav.component';
import { AuthService } from '../services/auth.service';

describe('NavComponent', () => {
  let component: NavComponent;
  let fixture: ComponentFixture<NavComponent>;

  function setup(loggedIn: boolean, isSuperAdmin = false) {
    const mockAuth = {
      isLoggedIn: () => loggedIn,
      isSuperAdmin: () => isSuperAdmin,
      username: () => 'testuser',
      logout: jasmine.createSpy('logout'),
    };

    TestBed.configureTestingModule({
      imports: [NavComponent],
      providers: [
        Router,
        { provide: ActivatedRoute, useValue: {} },
        { provide: AuthService, useValue: mockAuth },
      ],
    });

    fixture = TestBed.createComponent(NavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    setup(true);
    expect(component).toBeTruthy();
  });

  it('should start with the mobile menu closed', () => {
    setup(true);
    expect(component.menuOpen()).toBe(false);
  });

  it('should toggle the menu open and closed when the nav-toggle button is clicked', () => {
    setup(true);
    const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.nav-toggle');

    toggle.click();
    expect(component.menuOpen()).toBe(true);

    toggle.click();
    expect(component.menuOpen()).toBe(false);
  });

  it('should close the menu when a link inside nav-links is clicked', () => {
    setup(true);
    component.menuOpen.set(true);
    fixture.detectChanges();

    const links: HTMLElement = fixture.nativeElement.querySelector('.nav-links');
    links.click();

    expect(component.menuOpen()).toBe(false);
  });

  it('should close the menu when the brand link is clicked', () => {
    setup(true);
    component.menuOpen.set(true);
    fixture.detectChanges();

    const brand: HTMLElement = fixture.nativeElement.querySelector('.nav-brand');
    brand.click();

    expect(component.menuOpen()).toBe(false);
  });

  it('should apply the open class to nav-links only when menuOpen is true', () => {
    setup(true);
    const links: HTMLElement = fixture.nativeElement.querySelector('.nav-links');
    expect(links.classList.contains('open')).toBe(false);

    component.menuOpen.set(true);
    fixture.detectChanges();
    expect(links.classList.contains('open')).toBe(true);
  });

  it('should not show the Users link for a non-super-admin', () => {
    setup(true, false);
    expect(fixture.nativeElement.textContent).not.toContain('Users');
  });

  it('should show the Users link for a super admin', () => {
    setup(true, true);
    expect(fixture.nativeElement.textContent).toContain('Users');
  });

  it('should not show the Audit Log link for a non-super-admin', () => {
    setup(true, false);
    expect(fixture.nativeElement.textContent).not.toContain('Audit Log');
  });

  it('should show the Audit Log link for a super admin', () => {
    setup(true, true);
    expect(fixture.nativeElement.textContent).toContain('Audit Log');
  });

  it('should show sign in / create account links when logged out', () => {
    setup(false);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sign in');
    expect(text).toContain('Create account');
    expect(text).not.toContain('Sign out');
  });
});
