// src/app/shared/components/footer.component.ts
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="app-footer">
      <!-- Every public bracket ends here, so this is the line that turns players and
           spectators into organizers. Signed-in organizers already have an account. -->
      @if (!auth.isLoggedIn()) {
        <a routerLink="/admin/register" class="app-footer-cta">Run your own tournament for free</a>
      }
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
      <nav class="app-footer-links" aria-label="Site information">
        <a routerLink="/blind-draw-generator">Blind draw generator</a>
        <a routerLink="/pricing">Pricing</a>
        <a routerLink="/terms">Terms</a>
        <a routerLink="/refunds">Refunds</a>
        <a routerLink="/privacy">Privacy</a>
      </nav>
    </footer>
  `,
  styles: [`
    .app-footer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 32px 16px 24px;
    }
    .app-footer-links {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 16px;
      a {
        color: var(--muted);
        font-size: 0.72rem;
        text-decoration: none;
        &:hover { color: var(--text-dim); text-decoration: underline; }
      }
    }
    /* Posters and the printed bracket shouldn't carry site links. */
    @media print { .app-footer-links, .app-footer-cta { display: none; } }
    .app-footer-cta {
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      &:hover { text-decoration: underline; }
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
export class FooterComponent {
  readonly auth = inject(AuthService);
}
