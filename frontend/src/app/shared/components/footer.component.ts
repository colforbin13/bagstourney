// src/app/shared/components/footer.component.ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="app-footer">
      <a routerLink="/" class="app-footer-brand">
        <svg width="14" height="12" viewBox="0 0 30 26" fill="none" aria-hidden="true">
          <circle cx="4" cy="4" r="3.2" fill="var(--accent)"/>
          <circle cx="4" cy="22" r="3.2" fill="var(--accent)"/>
          <circle cx="26" cy="13" r="3.6" fill="var(--muted)"/>
          <path d="M7 4H14C16 4 16 13 18 13" stroke="var(--accent)" stroke-width="1.6" fill="none"/>
          <path d="M7 22H14C16 22 16 13 18 13" stroke="var(--accent)" stroke-width="1.6" fill="none"/>
        </svg>
        <span>Powered by Bracketway</span>
      </a>
    </footer>
  `,
  styles: [`
    .app-footer {
      display: flex;
      justify-content: center;
      padding: 32px 16px 24px;
    }
    .app-footer-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 0.75rem;
      text-decoration: none;
      &:hover { color: var(--text-dim); text-decoration: none; }
    }
  `]
})
export class FooterComponent {}
