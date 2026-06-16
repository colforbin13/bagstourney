// src/app/bracket/tournament-list.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament } from '../shared/models/tournament.models';

@Component({
  selector: 'app-tournament-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Tournaments</h1>
      </div>

      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (tournaments().length === 0) {
        <div class="empty">No tournaments yet.</div>
      } @else {
        <div class="list">
          @for (t of tournaments(); track t.id) {
            <a class="list-item" [routerLink]="['/bracket', t.id]">
              <div class="list-item-main">
                <span class="list-item-name">{{ t.name }}</span>
                <span class="badge badge-{{ t.status }}">{{ t.status }}</span>
              </div>
              <span class="list-item-arrow">→</span>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .list { display: flex; flex-direction: column; gap: 8px; }
    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      text-decoration: none;
      color: var(--text);
      transition: border-color .15s;
      &:hover { border-color: var(--muted); text-decoration: none; }
    }
    .list-item-main { display: flex; align-items: center; gap: 10px; }
    .list-item-name { font-weight: 500; }
    .list-item-arrow { color: var(--muted); font-size: 0.9rem; }
  `]
})
export class TournamentListComponent implements OnInit {
  tournaments = signal<Tournament[]>([]);
  loading = signal(true);

  constructor(private svc: TournamentService) {}

  ngOnInit() {
    this.svc.getTournaments().subscribe({
      next: data => { this.tournaments.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
