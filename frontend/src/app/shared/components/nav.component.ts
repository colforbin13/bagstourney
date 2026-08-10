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
        <span class="nav-title">Apple Lane Bag Bracket</span>
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
          <a routerLink="/admin/profile" routerLinkActive="active" class="nav-user">{{ auth.username() }}</a>
          <button class="btn btn-sm" (click)="auth.logout()">Sign out</button>
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
    .nav-user {
      font-size: 0.8rem;
      color: var(--text-dim);
      font-family: var(--mono);
      padding: 0 8px;
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
      text-decoration: none;
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
      .nav-user {
        border: none;
        padding: 0;
      }
    }
  `]
})
export class NavComponent {
  menuOpen = signal(false);

  constructor(public auth: AuthService) {}

  closeMenu() {
    this.menuOpen.set(false);
  }
}
