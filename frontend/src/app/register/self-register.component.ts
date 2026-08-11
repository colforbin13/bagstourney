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
          <div class="notif-error">Registration is closed for this tournament.</div>
        } @else if (success()) {
          <div class="notif-success">
            Thanks, {{ registeredName() }}! You're on the list, pending the organizer's approval.
            @if (registeredEmail()) {
              <p style="margin-top:8px">Check your email to confirm match updates.</p>
            }
          </div>
        } @else {
          <label style="display:flex;flex-direction:column;gap:6px;font-size:.85rem;color:var(--text-dim)">
            Name
            <input class="input" type="text" [(ngModel)]="name" placeholder="Full name" (keyup.enter)="submit()" [disabled]="submitting()" />
          </label>
          <label style="display:flex;flex-direction:column;gap:6px;font-size:.85rem;color:var(--text-dim)">
            Email (optional — get match updates)
            <input class="input" type="email" [(ngModel)]="email" placeholder="you@example.com" (keyup.enter)="submit()" [disabled]="submitting()" />
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
        if (t.status !== 'setup') this.closed.set(true);
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
