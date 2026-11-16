// src/app/shared/components/nav.component.ts
import { Component, computed, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav">
      <a class="nav-brand" routerLink="/" (click)="closeMenu()">
        <svg class="nav-mark" width="20" height="18" viewBox="0 0 30 26" fill="none" aria-hidden="true">
          <circle cx="4" cy="4" r="3.2" fill="var(--text)"/>
          <circle cx="4" cy="22" r="3.2" fill="var(--text)"/>
          <circle cx="26" cy="13" r="3" fill="var(--surface)" stroke="var(--text)" stroke-width="1.6"/>
          <path d="M7 4H14C16 4 16 13 18 13" stroke="var(--accent)" stroke-width="1.6" fill="none"/>
          <path d="M7 22H14C16 22 16 13 18 13" stroke="var(--accent)" stroke-width="1.6" fill="none"/>
        </svg>
        <span class="nav-title">Bracketway</span>
      </a>
      <button class="nav-toggle" type="button"
        [attr.aria-expanded]="menuOpen()" aria-label="Toggle menu"
        (click)="menuOpen.set(!menuOpen())">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" [class.open]="menuOpen()" (click)="closeMenu()">
        @if (auth.isLoggedIn()) {
          <a routerLink="/tournaments" routerLinkActive="active">Tournaments</a>

          <div class="nav-dropdown" [class.open]="adminMenuOpen()">
            <button type="button" class="nav-dropdown-trigger" (click)="toggleAdminMenu($event)">
              Admin <svg class="caret" width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            @if (adminMenuOpen()) {
              <div class="nav-dropdown-backdrop" (click)="closeAdminMenu()"></div>
            }
            <div class="nav-dropdown-menu">
              <a routerLink="/admin" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="closeAdminMenu()">Active tournaments</a>
              @if (auth.isSuperAdmin()) {
                <a routerLink="/admin/users" routerLinkActive="active" (click)="closeAdminMenu()">Users</a>
                <a routerLink="/admin/deleted-tournaments" routerLinkActive="active" (click)="closeAdminMenu()">Deleted tournaments</a>
                <a routerLink="/admin/audit-log" routerLinkActive="active" (click)="closeAdminMenu()">Audit log</a>
                <a routerLink="/admin/traffic" routerLinkActive="active" (click)="closeAdminMenu()">Traffic</a>
              }
            </div>
          </div>

          <div class="nav-dropdown" [class.open]="profileMenuOpen()">
            <button type="button" class="nav-dropdown-trigger" (click)="toggleProfileMenu($event)">
              {{ auth.username() }} <svg class="caret" width="10" height="7" viewBox="0 0 10 7" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            @if (profileMenuOpen()) {
              <div class="nav-dropdown-backdrop" (click)="closeProfileMenu()"></div>
            }
            <div class="nav-dropdown-menu">
              <a routerLink="/admin/profile" routerLinkActive="active" (click)="closeProfileMenu()">Profile</a>
              <!-- Under the account menu rather than the super-admin one: an organizer's
                   own plan is theirs to manage. -->
              <a routerLink="/admin/billing" routerLinkActive="active" (click)="closeProfileMenu()">Billing</a>
              <button type="button" class="nav-dropdown-item" (click)="auth.logout(); closeProfileMenu()">Sign out</button>
            </div>
          </div>
        } @else {
          <a routerLink="/pricing" routerLinkActive="active">Pricing</a>
          <a routerLink="/admin/login" routerLinkActive="active">Sign in</a>
          <a routerLink="/admin/register" routerLinkActive="active">Create account</a>
        }
      </div>
    </nav>
  `,
  styles: [`
    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 max(clamp(16px, 4vw, 56px), calc((100% - 1320px) / 2 + 56px));
      height: 52px;
      /* The header is the green sheet on every screen: it is what makes a working page
         recognisably Bracketway without colouring the work itself. */
      position: sticky;
      top: 0;
      background: var(--sheet);
      z-index: 100;
    }
    .nav-brand {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
    }
    .nav-mark {
      display: block;
      flex-shrink: 0;
    }
    .nav-title {
      font-family: var(--display);
      font-size: clamp(1.3rem, 1.9vw, 1.6rem);
      font-weight: 900;
      font-stretch: 112%;
      letter-spacing: -.03em;
      color: var(--text);
      line-height: 1;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .nav-links a {
      font-size: clamp(0.92rem, 1.15vw, 1.05rem);
      font-weight: 600;
      color: var(--text);
      text-decoration: none;
      padding: 6px 0;
      &:hover, &.active { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: .25em; }
    }
    .nav-dropdown { position: relative; }
    .nav-dropdown-trigger {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.92rem;
      font-weight: 600;
      color: var(--text);
      font-family: var(--sans);
      padding: 6px 10px;
      border: none;
      border-left: 1.5px solid var(--text);
      border-right: 1.5px solid var(--text);
      background: transparent;
      cursor: pointer;
      /* Above the sibling backdrop (z-index 105) so a second dropdown's trigger stays
         clickable while the first is open, instead of the backdrop swallowing the click
         and just closing it. */
      position: relative;
      z-index: 106;
      &:hover { background: var(--sheet-deep); }
    }
    /* Two dropdowns sit side by side (Admin, then Profile) — the shared border would
       otherwise double up between them. */
    .nav-dropdown + .nav-dropdown .nav-dropdown-trigger { border-left: none; }
    .nav-dropdown.open .nav-dropdown-trigger { background: var(--sheet-deep); }
    .caret { flex-shrink: 0; }
    .nav-dropdown-backdrop { position: fixed; inset: 0; z-index: 105; }
    .nav-dropdown-menu {
      display: none;
      flex-direction: column;
      gap: 1px;
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 180px;
      padding: 4px;
      background: var(--surface);
      border: 1.5px solid var(--text);
      border-radius: var(--radius);
      box-shadow: 0 10px 18px -8px rgba(0, 0, 0, .35);
      z-index: 110;
    }
    .nav-dropdown.open .nav-dropdown-menu { display: flex; }
    .nav-dropdown-menu a, .nav-dropdown-menu .nav-dropdown-item {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      padding: 8px 10px;
      border-radius: calc(var(--radius) - 1px);
      font-family: var(--sans);
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text);
      text-decoration: none;
      cursor: pointer;
      &:hover, &.active { background: var(--surface-2); color: var(--text); text-decoration: none; }
    }
    .nav-toggle {
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      align-items: flex-end;
      width: 44px;
      height: 44px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;

      span {
        display: block;
        width: 20px;
        height: 2px;
        background: var(--text);
        border-radius: 1px;
      }
    }

    @media (max-width: 640px) {
      .nav-toggle { display: flex; }

      .nav-links {
        display: none;
        position: absolute;
        top: 52px;
        left: 0;
        right: 0;
        flex-direction: column;
        align-items: stretch;
        gap: 0;
        padding: 8px 16px 12px;

        a, .nav-dropdown-item { display: flex; align-items: center; min-height: 44px; }
        background: var(--sheet);
        border-top: 2.5px dashed var(--text);
        border-bottom: 2.5px solid var(--text);

        &.open { display: flex; }
      }

      .nav-dropdown { position: static; width: 100%; }
      .nav-dropdown-trigger {
        border: none;
        padding: 0;
        font-size: 0.92rem;
        font-weight: 800;
        pointer-events: none;
      }
      .caret { display: none; }
      .nav-dropdown-backdrop { display: none; }
      .nav-dropdown-menu {
        display: flex !important;
        position: static;
        flex-direction: column;
        align-items: flex-start;
        gap: 14px;
        width: 100%;
        min-width: 0;
        padding: 14px 0 0;
        border: none;
        border-top: 1.5px solid var(--text);
        box-shadow: none;
        background: transparent;
      }
      .nav-dropdown-menu a, .nav-dropdown-menu .nav-dropdown-item {
        padding: 0;
        font-size: 0.92rem;
        color: var(--text);
        &:hover, &.active { background: transparent; color: var(--text); }
      }
    }
  `]
})
export class NavComponent {
  menuOpen = signal(false);
  adminMenuOpen = signal(false);
  profileMenuOpen = signal(false);

  constructor(public auth: AuthService) {}

  closeMenu() {
    this.menuOpen.set(false);
  }

  toggleAdminMenu(event: Event) {
    // Stop this from bubbling to the .nav-links click handler, which would
    // otherwise collapse the mobile hamburger menu the trigger lives inside.
    event.stopPropagation();
    this.profileMenuOpen.set(false);
    this.adminMenuOpen.update(open => !open);
  }

  closeAdminMenu() {
    this.adminMenuOpen.set(false);
  }

  toggleProfileMenu(event: Event) {
    event.stopPropagation();
    this.adminMenuOpen.set(false);
    this.profileMenuOpen.update(open => !open);
  }

  closeProfileMenu() {
    this.profileMenuOpen.set(false);
  }
}
