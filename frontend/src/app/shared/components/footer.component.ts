// src/app/shared/components/footer.component.ts
//
// Two endings, picked by route.
//
// Persuade pages (DESIGN.md, Sheet and Stock) end on the sheet foot: the green sheet comes
// back edge to edge, with the page's one action on the left, the other marketing pages as
// a ruled index on the right, and the legal links along the bottom. It is the only ending
// those pages have, so nothing in it repeats.
//
// Everything else (brackets, working screens, the legal pages, and the home page, whose
// tear-off strip lives in its hero) gets the quiet footer on white stock.
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export interface FootLink {
  label: string;
  /** What the page is for, in a few words. Keep each one true to the page it names. */
  note: string;
  link: string;
}

/** The marketing pages the sheet foot points to, in order. The current page is left out. */
export const FOOT_LINKS: FootLink[] = [
  { label: 'How it works', note: 'The whole run, step by step', link: '/how-it-works' },
  { label: 'Pricing', note: 'Free for tournaments up to 32 players', link: '/pricing' },
  { label: 'Blind draw generator', note: 'Random teams from a list of names', link: '/blind-draw-generator' },
  { label: 'Fundraiser guide', note: 'Plan a cornhole fundraiser, start to finish', link: '/cornhole-fundraiser' },
  { label: 'Sports', note: 'Any game played in two-player teams', link: '/sports' },
];

// Pages that end on the sheet foot: the marketing pages above, plus the comparison page,
// which is reached from search rather than from the index.
const SHEET_PAGES = [...FOOT_LINKS.map(l => l.link), '/scoreholio-alternative'];

const pathOf = (url: string) => url.split(/[?#]/)[0];

/** True when the page at this URL ends on the sheet foot. Query and fragment are ignored. */
export function endsOnSheet(url: string): boolean {
  return SHEET_PAGES.includes(pathOf(url));
}

interface FootPitch {
  line: string;
  label: string;
  link: string;
}

const SIGNED_OUT: FootPitch = { line: 'Run your own tournament for free', label: 'Start free', link: '/admin/register' };
const SIGNED_IN: FootPitch = { line: 'Run your next tournament', label: 'Set one up', link: '/admin' };
// A signed-in organizer reading Pricing is deciding about their plan, not starting an event.
const SIGNED_IN_PRICING: FootPitch = { line: 'Manage your plan', label: 'Go to billing', link: '/admin/billing' };

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (onSheet()) {
      <footer class="sheet-foot">
        <div class="foot-main">
          <div class="foot-pitch">
            <h2 class="foot-line">{{ pitch().line }}</h2>
            <a class="foot-go" [routerLink]="pitch().link">{{ pitch().label }}</a>
          </div>
          <nav class="foot-index" aria-label="More about Bracketway">
            @for (row of index(); track row.link) {
              <a class="foot-row" [routerLink]="row.link">
                <span class="foot-row-label">{{ row.label }}</span>
                <span class="foot-row-note">{{ row.note }}</span>
                <svg class="foot-row-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M3 9h11M9.5 4l5 5-5 5" stroke="currentColor" stroke-width="2"/>
                </svg>
              </a>
            }
          </nav>
        </div>
        <div class="foot-base">
          <a routerLink="/" class="foot-brand">
            <svg width="20" height="17" viewBox="0 0 30 26" fill="none" aria-hidden="true">
              <circle cx="4" cy="4" r="3.2" fill="currentColor"/>
              <circle cx="4" cy="22" r="3.2" fill="currentColor"/>
              <circle cx="26" cy="13" r="3" fill="var(--sheet)" stroke="currentColor" stroke-width="1.6"/>
              <path d="M7 4H14C16 4 16 13 18 13" stroke="currentColor" stroke-width="1.6" fill="none"/>
              <path d="M7 22H14C16 22 16 13 18 13" stroke="currentColor" stroke-width="1.6" fill="none"/>
            </svg>
            <span>Bracketway</span>
          </a>
          <nav class="foot-legal" aria-label="Site information">
            <a routerLink="/terms">Terms</a>
            <a routerLink="/refunds">Refunds</a>
            <a routerLink="/privacy">Privacy</a>
          </nav>
        </div>
      </footer>
    } @else {
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
            <circle cx="26" cy="13" r="3" fill="var(--sheet)" stroke="var(--accent)" stroke-width="1.6"/>
            <path d="M7 4H14C16 4 16 13 18 13" stroke="var(--accent)" stroke-width="1.6" fill="none"/>
            <path d="M7 22H14C16 22 16 13 18 13" stroke="var(--accent)" stroke-width="1.6" fill="none"/>
          </svg>
          <span>Powered by Bracketway</span>
        </a>
        <nav class="app-footer-links" aria-label="Site information">
          <a routerLink="/blind-draw-generator">Blind draw generator</a>
          <a routerLink="/cornhole-fundraiser">Fundraiser guide</a>
          <a routerLink="/pricing">Pricing</a>
          <a routerLink="/terms">Terms</a>
          <a routerLink="/refunds">Refunds</a>
          <a routerLink="/privacy">Privacy</a>
        </nav>
      </footer>
    }
  `,
  styles: [`
    /* ── The quiet footer, on white stock ── */
    .app-footer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 36px 16px 28px;
      margin-top: 24px;
      border-top: 2.5px dashed var(--text);
    }
    .app-footer-links {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px 16px;
      a {
        color: var(--text-dim);
        font-size: 0.82rem;
        text-decoration: none;
        padding: 4px 0;
        &:hover { color: var(--text); text-decoration: underline; }
      }
    }
    /* Posters and the printed bracket shouldn't carry site links. */
    @media print { .app-footer-links, .app-footer-cta { display: none; } }
    .app-footer-cta {
      color: var(--text);
      font-size: 1rem;
      font-weight: 800;
    }
    .app-footer-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--text-dim);
      font-size: 0.82rem;
      font-weight: 600;
      text-decoration: none;
      &:hover { color: var(--text); text-decoration: none; }
    }

    /* ── The sheet foot, on the green sheet ──
       Everything here is toner: dimmed toner falls under 4.5:1 on the sheet. */
    .sheet-foot {
      background: var(--sheet);
      color: var(--text);
      border-top: 2.5px dashed var(--text);
      padding: clamp(36px, 5vw, 64px) var(--page-gutter) 0;
    }
    .foot-main {
      display: grid;
      grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
      gap: clamp(32px, 6vw, 96px);
      align-items: start;
    }
    .foot-line {
      max-width: 11ch;
      font-size: clamp(2.2rem, 4.6vw, 3.75rem);
      font-weight: 900;
      font-stretch: 106%;
      line-height: .95;
      letter-spacing: -.04em;
      text-wrap: balance;
    }
    .foot-go {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 56px;
      margin-top: clamp(20px, 2.4vw, 28px);
      padding: 0 28px;
      background: var(--text);
      color: var(--surface);
      font-size: 1.2rem;
      font-weight: 800;
      letter-spacing: -.01em;
      text-decoration: none;
      transition: transform .18s cubic-bezier(.16, 1, .3, 1), background .15s;
      &:hover { background: var(--accent-dim); transform: translateY(-2px); }
      &:active { transform: translateY(0); }
    }

    /* The index: ruled rows, printed straight on the sheet. */
    .foot-index { border-top: 3px solid var(--text); }
    .foot-row {
      display: grid;
      grid-template-columns: 14rem minmax(0, 1fr) auto;
      align-items: baseline;
      column-gap: 16px;
      padding: 15px 0;
      border-bottom: 1.5px solid var(--text);
      color: var(--text);
      text-decoration: none;
      transition: background .15s, padding .25s cubic-bezier(.16, 1, .3, 1);
      &:hover { background: var(--sheet-deep); padding-left: 8px; padding-right: 8px; }
      &:focus-visible { outline-offset: -3px; }
    }
    .foot-row-label {
      font-size: 1.15rem;
      font-weight: 800;
      font-stretch: 106%;
      letter-spacing: -.015em;
    }
    .foot-row-note { font-size: .95rem; font-weight: 500; }
    .foot-row-arrow { align-self: center; flex-shrink: 0; }

    .foot-base {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0 24px;
      margin-top: clamp(36px, 5vw, 64px);
      padding: 6px 0 10px;
      border-top: 1.5px solid var(--text);
    }
    .foot-brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      color: var(--text);
      font-size: 1.1rem;
      font-weight: 900;
      font-stretch: 112%;
      letter-spacing: -.03em;
      text-decoration: none;
    }
    .foot-legal {
      display: flex;
      gap: 24px;
      a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        color: var(--text);
        font-size: .875rem;
        font-weight: 600;
        text-decoration: none;
        &:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
      }
    }

    @media (max-width: 860px) {
      .foot-main { grid-template-columns: minmax(0, 1fr); }
      /* Stacked, the action moves out to the right edge so the row isn't half empty. */
      .foot-pitch {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: 20px 32px;
      }
      .foot-line { max-width: 14ch; }
      .foot-go { margin-top: 0; }
    }
    @media (max-width: 520px) {
      .foot-go { display: flex; width: 100%; }
      /* The note drops under its label, with the arrow held against both lines. */
      .foot-row {
        grid-template-columns: minmax(0, 1fr) auto;
        row-gap: 2px;
        padding: 13px 0;
      }
      .foot-row-label, .foot-row-note { grid-column: 1; }
      .foot-row-arrow { grid-column: 2; grid-row: 1 / span 2; }
    }
    @media (prefers-reduced-motion: reduce) {
      .foot-go, .foot-row { transition: none; }
      .foot-go:hover { transform: none; }
    }
  `]
})
export class FooterComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => pathOf(e.urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );

  readonly onSheet = computed(() => endsOnSheet(this.path()));
  readonly index = computed(() => FOOT_LINKS.filter(l => l.link !== this.path()));
  readonly pitch = computed<FootPitch>(() => {
    if (!this.auth.isLoggedIn()) return SIGNED_OUT;
    return this.path() === '/pricing' ? SIGNED_IN_PRICING : SIGNED_IN;
  });
}
