// src/app/bracket/poster.component.ts
import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';
import * as QRCode from 'qrcode';

type PosterKind = 'bracket' | 'register';

/**
 * A printable sign for the venue wall: the same QR the organizer sees in the manage
 * screen's modal, blown up to fill a sheet of paper with the instructions around it.
 *
 * Deliberately produced through the browser's own print dialog rather than a PDF library.
 * Every desktop and mobile browser offers "Save as PDF" as a print destination, so this
 * still yields a PDF for anyone who wants a file — while also printing directly, which is
 * what actually gets it onto a wall, and without adding a rendering dependency for a page
 * that gets used a handful of times per tournament.
 *
 * Reachable by uuid without a session, on purpose and consistently with the rest of the
 * app: knowing a tournament's uuid is already the access grant for its public bracket and
 * its sign-up form, so it grants nothing new here.
 */
@Component({
  selector: 'app-poster',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="poster-page">
      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (loadError()) {
        <div class="empty">
          {{ loadError() }}
          <div style="margin-top:16px"><a routerLink="/" class="btn btn-sm">Back to home</a></div>
        </div>
      } @else {
        <div class="poster-controls no-print">
          <div>
            <button class="btn btn-primary" (click)="print()">Print this sign</button>
            <a class="btn" [routerLink]="otherKindLink()">
              {{ kind() === 'bracket' ? 'Sign-up version' : 'Bracket version' }}
            </a>
          </div>
          <p class="poster-tip">
            Want a file instead? Choose <strong>Save as PDF</strong> as the destination in the
            print dialog.
          </p>
        </div>

        <div class="poster">
          <div class="poster-eyebrow">{{ eyebrow() }}</div>
          <h1 class="poster-name">{{ tournament()?.name }}</h1>
          <p class="poster-headline">{{ headline() }}</p>

          <canvas #qrCanvas class="poster-qr"></canvas>

          <p class="poster-sub">{{ subhead() }}</p>
          <p class="poster-url">{{ url() }}</p>

          <div class="poster-foot">
            <svg width="16" height="14" viewBox="0 0 30 26" fill="none" aria-hidden="true">
              <circle cx="4" cy="4" r="3.2" fill="currentColor"/>
              <circle cx="4" cy="22" r="3.2" fill="currentColor"/>
              <circle cx="26" cy="13" r="3.6" fill="currentColor"/>
              <path d="M7 4H14C16 4 16 13 18 13" stroke="currentColor" stroke-width="1.6" fill="none"/>
              <path d="M7 22H14C16 22 16 13 18 13" stroke="currentColor" stroke-width="1.6" fill="none"/>
            </svg>
            <span>Bracketway</span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .poster-page { max-width: 720px; margin: 0 auto; padding: 24px 16px 60px; }

    .poster-controls {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);

      > div { display: flex; flex-wrap: wrap; gap: 8px; }
    }
    .poster-tip { font-size: 0.8rem; color: var(--text-dim); }
    .poster-tip strong { color: var(--text); }

    .poster {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 10px;
      padding: 40px 28px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .poster-eyebrow {
      font-family: var(--mono);
      font-size: 0.7rem;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .poster-name {
      font-size: clamp(1.8rem, 6vw, 2.6rem);
      line-height: 1.05;
      margin: 0;
    }
    .poster-headline { font-size: 1.05rem; color: var(--text-dim); margin: 0 0 6px; }
    /* Rendered at 1024px and displayed far smaller, so it stays sharp on paper — a
       screen-sized QR would come out visibly blocky at poster scale. */
    .poster-qr { width: 300px; max-width: 100%; height: auto; }
    .poster-sub { font-size: 0.95rem; color: var(--text-dim); max-width: 34ch; margin: 6px 0 0; }
    .poster-url {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted);
      overflow-wrap: anywhere;
      max-width: 100%;
      margin: 0;
    }
    .poster-foot {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 14px;
      color: var(--muted);
      font-size: 0.72rem;
    }

    @media print {
      .poster-page { max-width: none; padding: 0; }
      .poster {
        border: none;
        border-radius: 0;
        background: transparent;
        padding: 0;
        /* Spread the sign down the page so it reads from across a room. Deliberately a
           fixed length rather than a vh percentage: browsers disagree about whether vh
           in print means the page box or the on-screen viewport, and getting that wrong
           pushes the sign onto a second sheet. 240mm clears the printable area of US
           Letter (about 255mm after margins) as well as A4 (about 273mm). */
        min-height: 240mm;
        justify-content: center;
        gap: 14px;
      }
      .poster-name { font-size: 34pt; }
      .poster-headline { font-size: 15pt; }
      .poster-eyebrow { font-size: 10pt; }
      .poster-qr { width: 108mm; }
      .poster-sub { font-size: 12pt; max-width: 46ch; }
      .poster-url { font-size: 9pt; }
      .poster-foot { margin-top: 20px; }
    }
  `]
})
export class PosterComponent implements OnInit, AfterViewInit {
  tournament = signal<{ id: number; uuid: string; name: string } | null>(null);
  loading = signal(true);
  loadError = signal('');
  kind = signal<PosterKind>('bracket');

  @ViewChild('qrCanvas') qrCanvasRef?: ElementRef<HTMLCanvasElement>;

  private uuid = '';

  readonly eyebrow = computed(() => this.kind() === 'bracket' ? 'Follow along' : 'Sign up to play');

  readonly headline = computed(() => this.kind() === 'bracket'
    ? 'Scan to watch the bracket'
    : 'Scan to join this tournament');

  readonly subhead = computed(() => this.kind() === 'bracket'
    ? 'Live scores and who plays next, on your phone. No sign-up needed.'
    : 'Add your name to the player list. The organizer approves entries before teams are drawn.');

  readonly url = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const path = this.kind() === 'bracket' ? 'bracket' : 'register';
    return `${location.origin}${environment.baseHref}${path}/${t.uuid}`;
  });

  otherKindLink() {
    return ['/poster', this.uuid, this.kind() === 'bracket' ? 'register' : 'bracket'];
  }

  constructor(private route: ActivatedRoute, private svc: TournamentService) {}

  ngOnInit() {
    // Subscribed rather than read from the snapshot: switching between the two signs
    // navigates to the same route with a different :kind, so Angular reuses this
    // component instance and never re-runs ngOnInit. Reading the snapshot once left the
    // page showing the sign you arrived on no matter which button you pressed.
    this.route.paramMap.subscribe(params => {
      const uuid = params.get('uuid') ?? '';
      const kindParam = params.get('kind');
      this.kind.set(kindParam === 'register' ? 'register' : 'bracket');

      if (!uuid) {
        this.loading.set(false);
        this.loadError.set('This link is invalid.');
        return;
      }

      if (uuid !== this.uuid) {
        this.uuid = uuid;
        this.loadTournament();
      } else if (this.tournament()) {
        // Same tournament, other sign — only the encoded URL changes.
        this.renderQr();
      }
    });
  }

  private loadTournament() {
    this.loading.set(true);
    this.loadError.set('');
    this.svc.getTournamentByUuid(this.uuid).subscribe({
      next: t => {
        this.tournament.set(t);
        this.loading.set(false);
        this.renderQr();
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Tournament not found.');
      },
    });
  }

  ngAfterViewInit() {
    // The canvas is behind an @if on the fetch, so rendering is driven from the response
    // instead — this only covers a cached/synchronous resolution.
    if (this.tournament()) this.renderQr();
  }

  private renderQr() {
    const url = this.url();
    if (!url) return;
    setTimeout(() => {
      const canvas = this.qrCanvasRef?.nativeElement;
      if (!canvas) return;
      // 1024px into roughly 108mm of paper is about 240dpi — comfortably past the point
      // where a phone camera cares, and past where the eye sees stair-stepping.
      // Deliberately does *not* auto-open the print dialog. A dialog thrown up on load
      // gets in the way of reading the sign, of switching to the other variant, and of
      // choosing a paper size — and it reappears on every navigation between the two. The
      // Print button is right at the top instead.
      QRCode.toCanvas(canvas, url, { width: 1024, margin: 1 }, err => {
        if (err) { this.loadError.set('Could not generate the QR code.'); return; }
        // qrcode writes the render size onto the element as an inline style
        // ("width: 1024px; height: 1024px"), which outranks the stylesheet and would
        // otherwise pin the sign's QR at 1024px on screen *and* on paper, ignoring the
        // print size entirely. The bitmap must stay 1024 for sharpness; only the
        // displayed size needs to come from CSS.
        canvas.style.removeProperty('width');
        canvas.style.removeProperty('height');
      });
    });
  }

  print() {
    window.print();
  }
}
