// src/app/register/self-register.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';

@Component({
  selector: 'app-self-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="notif-wrap">
      <div class="notif-card">
        <div class="notif-header">
          <span class="notif-icon">◈</span>
          <h1>{{ tournamentName() || 'Register' }}</h1>
        </div>

        @if (loading()) {
          <div class="notif-status">Loading…</div>
        } @else if (notFound()) {
          <div class="notif-error">This registration link is invalid.</div>
        } @else if (closed()) {
          <div class="notif-error">
            Registration is closed for this tournament — the teams have already been drawn.
            Check with the organizer.
          </div>
        } @else if (success()) {
          <div class="notif-success">
            Thanks, {{ registeredName() }} — you're on the list, pending the organizer's approval.
            @if (registeredEmail()) {
              <p style="margin-top:8px">
                One more step for match updates: tap the confirmation link in the email we just sent.
              </p>
            }
            <p style="margin-top:8px">
              No need to register again — the organizer can see your name.
            </p>
          </div>
        } @else {
          <!-- Someone reaching this page has usually just scanned a QR code at the venue and
               may never have heard of Bracketway. Two things need saying before they type:
               they are signing up as an individual and will be paired with a stranger (self
               registration is only open on auto-draft tournaments, so this is always true
               here), and submitting the form does not by itself get them into the bracket. -->
          <p class="reg-intro">Add your name to the player list for this tournament.</p>
          <ul class="reg-notes">
            <li>Teams are drawn at random — sign up as yourself, and the organizer pairs
              everyone up before the bracket is built.</li>
            <li>Your spot is confirmed once the organizer approves the list.</li>
          </ul>

          <label style="display:flex;flex-direction:column;gap:6px;font-size:.85rem;color:var(--text-dim)">
            Name
            <input class="input" type="text" [(ngModel)]="name" placeholder="Full name" (keyup.enter)="submit()" [disabled]="submitting()" />
          </label>
          <label style="display:flex;flex-direction:column;gap:6px;font-size:.85rem;color:var(--text-dim)">
            Email (optional)
            <input class="input" type="email" [(ngModel)]="email" placeholder="you@example.com" (keyup.enter)="submit()" [disabled]="submitting()" />
            <span class="reg-hint">
              Match results for this tournament only. We'll send one confirmation link you'll
              need to tap.
            </span>
          </label>
          <!-- Honeypot: hidden from real users; bots that fill every field trip this. -->
          <input type="text" [(ngModel)]="website" name="website" tabindex="-1" autocomplete="off"
            aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px" />

          @if (error()) { <div class="notif-error">{{ error() }}</div> }

          <button class="btn btn-primary" [disabled]="submitting()" (click)="submit()">
            @if (submitting()) { Registering… } @else { Register }
          </button>
        }
        <a class="notif-link" routerLink="/">Return to home</a>
      </div>
    </div>
  `,
  styles: [`
    .reg-intro { font-size: 0.875rem; color: var(--text-dim); }
    .reg-notes {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: -4px 0 4px;
      padding: 12px;
      list-style: none;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .reg-notes li {
      display: flex;
      gap: 8px;
      font-size: 0.8rem;
      line-height: 1.5;
      color: var(--text-dim);
    }
    .reg-notes li::before {
      content: '';
      width: 5px;
      height: 5px;
      margin-top: 7px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
    }
    .reg-hint { font-size: 0.72rem; line-height: 1.45; color: var(--muted); }
  `],
})
export class SelfRegisterComponent implements OnInit {
  loading = signal(true);
  notFound = signal(false);
  closed = signal(false);
  submitting = signal(false);
  error = signal('');
  success = signal(false);
  tournamentName = signal('');
  registeredName = signal('');
  registeredEmail = signal(false);

  name = '';
  email = '';
  website = ''; // honeypot — never set programmatically, must stay whatever the user leaves it as

  private uuid = '';

  constructor(private svc: TournamentService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.uuid = this.route.snapshot.paramMap.get('uuid') ?? '';
    if (!this.uuid) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    this.svc.getTournamentByUuid(this.uuid).subscribe({
      next: t => {
        this.loading.set(false);
        this.tournamentName.set(t.name);
        // Mirror the backend's gate (ParticipantController::selfRegister) rather than
        // only checking status: a direct-entry tournament has no unpaired-participant
        // pool for a walk-up to join, so its registrations are rejected server-side.
        // Without this the form rendered happily and only failed on submit.
        if (t.status !== 'setup' || (t.team_entry_mode ?? 'auto_draft') !== 'auto_draft') {
          this.closed.set(true);
        }
      },
      error: () => {
        this.loading.set(false);
        this.notFound.set(true);
      },
    });
  }

  submit() {
    const name = this.name.trim();
    if (!name) {
      this.error.set('Enter your name.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    this.svc.selfRegisterParticipant(this.uuid, name, this.email.trim(), this.website).subscribe({
      next: () => {
        this.submitting.set(false);
        this.success.set(true);
        this.registeredName.set(name);
        this.registeredEmail.set(!!this.email.trim());
      },
      error: err => {
        this.submitting.set(false);
        this.error.set(err?.error?.error ?? 'Failed to register.');
      },
    });
  }
}
