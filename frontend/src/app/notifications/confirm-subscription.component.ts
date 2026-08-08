// src/app/notifications/confirm-subscription.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';

@Component({
  selector: 'app-confirm-subscription',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="notif-wrap">
      <div class="notif-card">
        <div class="notif-header">
          <span class="notif-icon">◈</span>
          <h1>Confirm Subscription</h1>
        </div>

        @if (loading()) {
          <div class="notif-status">Confirming…</div>
        } @else if (success()) {
          <div class="notif-success">{{ success() }}</div>
          @if (managePreferencesUrl()) {
            <a class="notif-link" [href]="managePreferencesUrl()">Manage my email preferences</a>
          }
        } @else if (error()) {
          <div class="notif-error">{{ error() }}</div>
        }
        <a class="notif-link" routerLink="/">Return to home</a>
      </div>
    </div>
  `,
  // Shared .notif-* layout/status/error/success classes live in
  // frontend/src/assets/styles/global.scss — reused identically by the other two
  // notification pages (unsubscribe, preferences), so they're defined once there.
})
export class ConfirmSubscriptionComponent implements OnInit {
  loading = signal(true);
  error = signal('');
  success = signal('');
  managePreferencesUrl = signal('');

  private participantId = 0;
  private token = '';

  constructor(private svc: TournamentService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.participantId = +(this.route.snapshot.queryParamMap.get('pid') ?? 0);
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';

    if (!this.participantId || !this.token) {
      this.loading.set(false);
      this.error.set('This confirmation link is missing required information.');
      return;
    }

    this.svc.confirmNotificationSubscription(this.participantId, this.token).subscribe({
      next: result => {
        this.loading.set(false);
        this.success.set(result.message);
        if (result.manage_preferences_url) this.managePreferencesUrl.set(result.manage_preferences_url);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'Failed to confirm subscription.');
      },
    });
  }
}
