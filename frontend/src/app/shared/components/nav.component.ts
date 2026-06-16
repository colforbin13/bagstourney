// src/app/shared/components/nav.component.ts
import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="nav">
      <a class="nav-brand" routerLink="/">
        <span class="nav-icon">◈</span>
        <span class="nav-title">Bag&nbsp;Bracket</span>
      </a>
      <div class="nav-links">
        @if (auth.isLoggedIn()) {
          <a routerLink="/admin" routerLinkActive="active">Admin</a>
          <button class="btn btn-sm" (click)="auth.logout()">Sign out</button>
        } @else {
          <a routerLink="/admin/login" routerLinkActive="active">Admin</a>
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
    .nav-icon {
      color: var(--accent);
      font-size: 1.1rem;
    }
    .nav-title {
      font-family: var(--mono);
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text);
      letter-spacing: .02em;
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
  `]
})
export class NavComponent {
  constructor(public auth: AuthService) {}
}
