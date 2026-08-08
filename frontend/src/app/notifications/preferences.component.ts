// src/app/notifications/preferences.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="notif-wrap">
      <div class="notif-card">
        <div class="notif-header">
          <span class="notif-icon">◈</span>
          <h1>Email Preferences</h1>
        </div>

        @if (loading()) {
          <div class="notif-status">Loading…</div>
        } @else if (invalidLink()) {
          <div class="notif-error">This preferences link is invalid or has expired.</div>
        } @else {
          <p class="notif-status">{{ tournamentName() }} ({{ email() }})</p>

          <label class="notif-checkbox">
            <input type="checkbox" [(ngModel)]="matchCompleted" />
            Match completed — when a match I'm playing in finishes
          </label>
          <label class="notif-checkbox">
            <input type="checkbox" [(ngModel)]="roundCompleted" />
            Round completed — next round's matchups
          </label>
          <label class="notif-checkbox">
            <input type="checkbox" [(ngModel)]="tournamentFinalized" />
            Tournament finalized — final results
          </label>

          @if (error()) { <div class="notif-error">{{ error() }}</div> }
          @if (saved()) { <div class="notif-success">Preferences saved.</div> }

          <button class="btn btn-primary" [disabled]="saving()" (click)="save()">
            @if (saving()) { Saving… } @else { Save preferences }
          </button>
        }
        <a class="notif-link" routerLink="/">Return to home</a>
      </div>
    </div>
  `,
  // Shared .notif-* layout/status/error/success/checkbox classes live in
  // frontend/src/assets/styles/global.scss — reused identically by the other two
  // notification pages (confirm-subscription, unsubscribe), so they're defined once there.
})
export class PreferencesComponent implements OnInit {
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  saved = signal(false);
  invalidLink = signal(false);
  email = signal('');
  tournamentName = signal('');

  matchCompleted = true;
  roundCompleted = true;
  tournamentFinalized = true;

  private participantId = 0;
  private token = '';

  constructor(private svc: TournamentService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.participantId = +(this.route.snapshot.queryParamMap.get('pid') ?? 0);
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!this.participantId || !this.token) {
      this.loading.set(false);
      this.invalidLink.set(true);
      return;
    }

    this.svc.getNotificationPreferences(this.participantId, this.token).subscribe({
      next: prefs => {
        this.loading.set(false);
        this.email.set(prefs.email);
        this.tournamentName.set(prefs.tournament_name);
        this.matchCompleted = prefs.categories.match_completed;
        this.roundCompleted = prefs.categories.round_completed;
        this.tournamentFinalized = prefs.categories.tournament_finalized;
      },
      error: () => {
        this.loading.set(false);
        this.invalidLink.set(true);
      },
    });
  }

  save() {
    this.saving.set(true);
    this.error.set('');
    this.saved.set(false);
    this.svc.updateNotificationPreferences(this.participantId, this.token, {
      match_completed: this.matchCompleted,
      round_completed: this.roundCompleted,
      tournament_finalized: this.tournamentFinalized,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.error ?? 'Failed to save preferences.');
      },
    });
  }
}
