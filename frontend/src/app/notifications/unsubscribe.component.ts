// src/app/notifications/unsubscribe.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';

const CATEGORY_LABELS: Record<string, string> = {
  match_completed: 'match completed',
  round_completed: 'round completed',
  tournament_finalized: 'tournament finalized',
};

@Component({
  selector: 'app-unsubscribe',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="notif-wrap">
      <div class="notif-card">
        <div class="notif-header">
          <span class="notif-icon">◈</span>
          <h1>Unsubscribe</h1>
        </div>

        @if (invalidLink()) {
          <div class="notif-error">This unsubscribe link is missing required information.</div>
        } @else if (success()) {
          <div class="notif-success">{{ success() }}</div>
        } @else {
          <p class="notif-status">Stop receiving "{{ categoryLabel() }}" emails for this tournament?</p>
          @if (error()) { <div class="notif-error">{{ error() }}</div> }
          <button class="btn btn-primary" [disabled]="loading()" (click)="confirm()">
            @if (loading()) { Unsubscribing… } @else { Confirm unsubscribe }
          </button>
        }
        <a class="notif-link" routerLink="/">Return to home</a>
      </div>
    </div>
  `,
  // Shared .notif-* layout/status/error/success classes live in
  // frontend/src/assets/styles/global.scss — reused identically by the other two
  // notification pages (confirm-subscription, preferences), so they're defined once there.
})
export class UnsubscribeComponent implements OnInit {
  loading = signal(false);
  error = signal('');
  success = signal('');
  invalidLink = signal(false);

  private participantId = 0;
  private token = '';
  private category = '';

  constructor(private svc: TournamentService, private route: ActivatedRoute) {}

  ngOnInit() {
    this.participantId = +(this.route.snapshot.queryParamMap.get('pid') ?? 0);
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.category = this.route.snapshot.queryParamMap.get('category') ?? '';

    if (!this.participantId || !this.token || !CATEGORY_LABELS[this.category]) {
      this.invalidLink.set(true);
    }
  }

  categoryLabel(): string {
    return CATEGORY_LABELS[this.category] ?? this.category;
  }

  confirm() {
    this.loading.set(true);
    this.error.set('');
    this.svc.unsubscribeNotificationCategory(this.participantId, this.token, this.category).subscribe({
      next: result => {
        this.loading.set(false);
        this.success.set(result.message);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'Failed to unsubscribe.');
      },
    });
  }
}
