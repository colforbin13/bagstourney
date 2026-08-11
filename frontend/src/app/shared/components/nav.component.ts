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
          <circle cx="4" cy="4" r="3.2" fill="var(--accent)"/>
          <circle cx="4" cy="22" r="3.2" fill="var(--accent)"/>
          <circle cx="26" cy="13" r="3.6" fill="var(--text)"/>
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
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Tournaments</a>
          <a routerLink="/admin" routerLinkActive="active">Admin</a>
          @if (auth.isSuperAdmin()) {
            <a routerLink="/admin/users" routerLinkActive="active">Users</a>
          }
          <div class="nav-profile" [class.open]="profileMenuOpen()">
            <button type="button" class="nav-user-trigger" (click)="toggleProfileMenu($event)">
              {{ auth.username() }} <span class="caret" aria-hidden="true">▾</span>
            </button>
            @if (profileMenuOpen()) {
              <div class="nav-profile-backdrop" (click)="closeProfileMenu()"></div>
            }
            <div class="nav-profile-menu">
              <a routerLink="/admin/profile" routerLinkActive="active" (click)="closeProfileMenu()">Profile</a>
              <button type="button" class="nav-profile-item" (click)="auth.logout(); closeProfileMenu()">Sign out</button>
            </div>
          </div>
        } @else {
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
      padding: 0 16px;
      height: 52px;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      background: var(--bg);
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
      font-size: 1.15rem;
      letter-spacing: .02em;
      color: var(--text);
      line-height: 1;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .nav-links a {
      font-size: 0.85rem;
      color: var(--text-dim);
      text-decoration: none;
      &:hover, &.active { color: var(--text); }
    }
    .nav-profile { position: relative; }
    .nav-user-trigger {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.8rem;
      color: var(--text-dim);
      font-family: var(--mono);
      padding: 0 8px;
      border: none;
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      background: transparent;
      cursor: pointer;
      &:hover { color: var(--text); }
    }
    .nav-profile.open .nav-user-trigger { color: var(--text); }
    .caret { font-size: 0.6rem; }
    .nav-profile-backdrop { position: fixed; inset: 0; z-index: 105; }
    .nav-profile-menu {
      display: none;
      flex-direction: column;
      gap: 1px;
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 160px;
      padding: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 8px 24px rgba(0, 0, 0, .25);
      z-index: 110;
    }
    .nav-profile.open .nav-profile-menu { display: flex; }
    .nav-profile-menu a, .nav-profile-menu .nav-profile-item {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      padding: 8px 10px;
      border-radius: calc(var(--radius) - 1px);
      font-family: var(--sans);
      font-size: 0.8rem;
      color: var(--text);
      text-decoration: none;
      cursor: pointer;
      &:hover, &.active { background: var(--surface-2); color: var(--text); }
    }
    .nav-toggle {
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      width: 32px;
      height: 32px;
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
        align-items: flex-start;
        gap: 14px;
        padding: 16px;
        background: var(--bg);
        border-bottom: 1px solid var(--border);

        &.open { display: flex; }
      }

      .nav-profile { position: static; width: 100%; }
      .nav-user-trigger {
        border: none;
        padding: 0;
        font-size: 0.85rem;
        pointer-events: none;
      }
      .caret { display: none; }
      .nav-profile-backdrop { display: none; }
      .nav-profile-menu {
        display: flex !important;
        position: static;
        flex-direction: column;
        align-items: flex-start;
        gap: 14px;
        width: 100%;
        min-width: 0;
        padding: 14px 0 0;
        border: none;
        border-top: 1px solid var(--border);
        box-shadow: none;
        background: transparent;
      }
      .nav-profile-menu a, .nav-profile-menu .nav-profile-item {
        padding: 0;
        font-size: 0.85rem;
        color: var(--text-dim);
        &:hover, &.active { background: transparent; color: var(--text); }
      }
    }
  `]
})
export class NavComponent {
  menuOpen = signal(false);
  profileMenuOpen = signal(false);

  constructor(public auth: AuthService) {}

  closeMenu() {
    this.menuOpen.set(false);
  }

  toggleProfileMenu(event: Event) {
    // Stop this from bubbling to the .nav-links click handler, which would
    // otherwise collapse the mobile hamburger menu the trigger lives inside.
    event.stopPropagation();
    this.profileMenuOpen.update(open => !open);
  }

  closeProfileMenu() {
    this.profileMenuOpen.set(false);
  }
}
