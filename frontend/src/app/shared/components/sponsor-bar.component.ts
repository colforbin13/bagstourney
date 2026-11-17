// src/app/shared/components/sponsor-bar.component.ts
//
// Sponsor logos (FEATURE_TRACKER item 20): a narrow bar across the bottom of the public
// bracket page and of TV mode, the same spot in every view so a sponsor is always on screen.
// The bracket page parks it at the bottom of the window as people scroll; on a TV it is a
// band under the bracket. Renders nothing when there are no sponsors.
//
// On the page a logo with a link opens the sponsor's site in a new tab. On a TV nobody can
// tap, so logos are plain images there, and when more are up than fit across the band they
// take turns in groups.
import { Component, OnDestroy, computed, effect, input, signal } from '@angular/core';
import { Sponsor } from '../models/tournament.models';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sponsor-bar',
  standalone: true,
  template: `
    @if (sponsors().length) {
      <aside class="sponsor-bar" [class.tv]="tv()" aria-label="Sponsors">
        <span class="label">{{ sponsors().length === 1 ? 'Sponsor' : 'Sponsors' }}</span>
        <div class="logos">
          @for (s of shown(); track s.id) {
            @if (s.url && !tv()) {
              <a class="logo" [href]="s.url" target="_blank" rel="noopener noreferrer sponsored" [title]="s.name">
                <img [src]="src(s)" [alt]="s.name" />
              </a>
            } @else {
              <span class="logo"><img [src]="src(s)" [alt]="s.name" /></span>
            }
          }
        </div>
      </aside>
    }
  `,
  styles: [`
    .sponsor-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      height: 56px;
      padding: 0 16px;
      background: var(--surface);
      border-top: 1px solid var(--border);
    }
    .label {
      flex-shrink: 0;
      font-family: var(--mono);
      font-size: 0.72rem;
      letter-spacing: 0;
      color: var(--muted);
    }
    .logos {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 24px;
      overflow-x: auto;
      scrollbar-width: none;
      height: 100%;
    }
    .logo { flex-shrink: 0; display: flex; align-items: center; height: 100%; }
    .logo img { display: block; max-height: 36px; max-width: 140px; width: auto; height: auto; object-fit: contain; }
    a.logo:hover img { opacity: .8; }

    /* TV: read from across a room, laid out rather than scrolled. */
    .sponsor-bar.tv { height: 76px; padding: 0 24px; gap: 24px; }
    .tv .label { font-size: 0.9rem; }
    .tv .logos { justify-content: space-evenly; overflow: hidden; gap: 40px; }
    .tv .logo img { max-height: 54px; max-width: 220px; }

    @media (max-width: 600px) {
      .sponsor-bar:not(.tv) { height: 48px; gap: 12px; }
      .sponsor-bar:not(.tv) .logo img { max-height: 30px; max-width: 110px; }
    }
  `],
})
export class SponsorBarComponent implements OnDestroy {
  sponsors = input<Sponsor[]>([]);
  /** TV mode: bigger, no links, and rotating in groups when they don't all fit. */
  tv = input(false);

  /** Logos a TV band shows at once; more than this take turns. */
  static readonly TV_GROUP = 5;
  /** How long each group stays up. */
  static readonly ROTATE_MS = 12000;

  private group = signal(0);
  private timer: number | null = null;

  private groups = computed(() => {
    const all = this.sponsors();
    if (!this.tv() || all.length <= SponsorBarComponent.TV_GROUP) return [all];
    // Even groups (8 logos: 4 and 4, not 5 and 3), so the band looks the same each turn.
    const count = Math.ceil(all.length / SponsorBarComponent.TV_GROUP);
    const size = Math.ceil(all.length / count);
    const out: Sponsor[][] = [];
    for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
    return out;
  });

  shown = computed(() => {
    const groups = this.groups();
    return groups[this.group() % groups.length];
  });

  private rotate = effect(() => {
    const rotating = this.groups().length > 1;
    if (rotating && this.timer == null) {
      this.timer = window.setInterval(() => this.group.update(g => g + 1), SponsorBarComponent.ROTATE_MS);
    } else if (!rotating) {
      this.stop();
    }
  });

  src(s: Sponsor): string {
    return `${environment.apiUrl}/${s.image_url}`;
  }

  ngOnDestroy() {
    this.stop();
  }

  private stop() {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
