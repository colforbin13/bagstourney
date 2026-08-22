// src/app/admin/admin-dashboard.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { AuthService } from '../shared/services/auth.service';
import { Tournament } from '../shared/models/tournament.models';
import { confirmService } from '../shared/services/confirm.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Admin</h1>
      </div>

      <!-- New tournament -->
      <div class="card" style="margin-bottom:24px">
        <div class="card-head">
          <div class="section-label">New Tournament</div>
          <a class="card-head-link" routerLink="/how-it-works">How it works →</a>
        </div>
        <input class="input" type="text" [(ngModel)]="newName"
          placeholder="Tournament name"
          (keyup.enter)="create()" style="margin-bottom:10px" />
        <!-- Each choice carries a hint that reflects the current selection. These used to
             be title-attribute tooltips, which never fire on touch — and this is a
             mobile-first app, so on the primary platform they explained nothing at all.
             Two of the three are also effectively one-way once teams are drawn. -->
        <div class="row" style="flex-wrap:wrap">
          <label class="field">
            <select class="input" [(ngModel)]="newVisibility">
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
            <span class="field-hint">{{ visibilityHint() }}</span>
          </label>
          <label class="field">
            <select class="input" [(ngModel)]="newTeamEntryMode">
              <option value="auto_draft">Auto-draft teams</option>
              <option value="direct">Enter teams directly</option>
            </select>
            <span class="field-hint">{{ teamEntryHint() }}</span>
          </label>
          <label class="field">
            <select class="input" [(ngModel)]="newSeedingMode">
              <option value="automatic">Automatic seeding</option>
              <option value="manual">Manual seeding</option>
            </select>
            <span class="field-hint">{{ seedingHint() }}</span>
          </label>
          <!-- Double elimination is shown to everyone but only selectable on a paid plan.
               Hiding it outright would make the paid tier invisible to exactly the people
               it is meant to convert. The disabled option is UX only — the server refuses
               the format at both creation and bracket generation. -->
          <label class="field">
            <select class="input" [(ngModel)]="newFormat">
              <option value="single">Single elimination</option>
              <option value="double" [disabled]="!isPaidPlan()">
                Double elimination{{ isPaidPlan() ? '' : ' (paid plan)' }}
              </option>
            </select>
            <span class="field-hint">{{ formatHint() }}</span>
          </label>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px">
          <button class="btn btn-primary" [disabled]="creating()" (click)="create()">
            @if (creating()) { <span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span> }
            Create
          </button>
        </div>
        @if (createError()) {
          <div class="form-error">{{ createError() }}</div>
        }
      </div>

      <!-- Tournament list -->
      <div class="section-label">Tournaments</div>
      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (tournaments().length === 0) {
        <div class="empty">
          No tournaments yet — create one above.
          <div style="margin-top:6px">New to this? <a routerLink="/how-it-works">See how it works.</a></div>
        </div>
      } @else {
        <div class="list">
          @for (t of tournaments(); track t.id) {
            <div class="list-item">
              <div class="list-main">
                <a class="list-name" [routerLink]="['/admin/tournament', t.id]">{{ t.name }}</a>
                <span class="badge badge-{{ t.status }}">{{ t.status }}</span>
              </div>
              <div class="list-actions">
                <a class="btn btn-sm" [routerLink]="['/bracket', t.id]">View</a>
                <a class="btn btn-sm" [routerLink]="['/admin/tournament', t.id]">Manage</a>
                <button class="btn btn-sm btn-danger" (click)="delete(t)">Delete</button>
              </div>
            </div>
          }
        </div>
      }

      @if (toast()) {
        <div class="toast toast-success">{{ toast() }}</div>
      }
    </div>
  `,
  styles: [`
    .section-label {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-bottom: 10px;
    }
    .row { display: flex; gap: 8px; }
    .card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    .card-head .section-label { margin-bottom: 0; }
    .card-head-link { font-size: 0.75rem; color: var(--accent); white-space: nowrap; }
    .field {
      display: flex;
      flex-direction: column;
      gap: 5px;
      flex: 1;
      min-width: 160px;
    }
    .field-hint { font-size: 0.7rem; line-height: 1.4; color: var(--muted); }
    .form-error { font-size: 0.8rem; color: var(--danger); margin-top: 8px; }
    .list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      flex-wrap: wrap;
    }
    .list-main { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
    .list-name {
      font-weight: 500;
      font-size: 0.9rem;
      color: var(--text);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      &:hover { color: var(--accent); }
    }
    .list-actions { display: flex; gap: 6px; flex-shrink: 0; }
  `]
})
export class AdminDashboardComponent implements OnInit {
  tournaments = signal<Tournament[]>([]);
  loading = signal(true);
  creating = signal(false);
  createError = signal('');
  toast = signal('');
  newName = '';
  newVisibility: 'public' | 'private' = 'public';
  newSeedingMode: 'automatic' | 'manual' = 'automatic';
  newTeamEntryMode: 'auto_draft' | 'direct' = 'auto_draft';
  newFormat: 'single' | 'double' = 'single';

  constructor(private svc: TournamentService, private auth: AuthService) {}

  isPaidPlan(): boolean { return this.auth.isPaidPlan(); }

  ngOnInit() { this.load(); }

  visibilityHint(): string {
    return this.newVisibility === 'public'
      ? 'Listed on the home page for anyone to follow.'
      : 'Unlisted — only reachable by its link, which anyone can then watch.';
  }

  // The self-registration link being auto-draft-only is enforced server-side
  // (ParticipantController::selfRegister) but was invisible at the point of choosing.
  teamEntryHint(): string {
    return this.newTeamEntryMode === 'auto_draft'
      ? 'Players enter individually and get paired at random. Required for the QR sign-up link.'
      : 'You enter each team yourself. No random pairing, and player self sign-up is unavailable.';
  }

  seedingHint(): string {
    return this.newSeedingMode === 'automatic'
      ? 'Seeds assigned for you at the draw. Locked once teams are drawn.'
      : 'Drag teams into the seed order you want, then generate the bracket. Locked once teams are drawn.';
  }

  formatHint(): string {
    if (this.newFormat === 'double') {
      return 'Every team gets a second chance — one loss drops you to the losers bracket, two are out. Locked once the bracket is generated.';
    }
    return this.isPaidPlan()
      ? 'One loss and you are out. Locked once the bracket is generated.'
      : 'One loss and you are out. Double elimination is available on a paid plan.';
  }

  load() {
    this.svc.getTournaments().subscribe({
      next: data => { this.tournaments.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  create() {
    const name = this.newName.trim();
    if (!name) { this.createError.set('Enter a tournament name.'); return; }
    this.creating.set(true);
    this.createError.set('');
    this.svc.createTournament(name, this.newVisibility, this.newSeedingMode, this.newTeamEntryMode, this.newFormat).subscribe({
      next: t => {
        this.newName = '';
        this.newVisibility = 'public';
        this.newSeedingMode = 'automatic';
        this.newTeamEntryMode = 'auto_draft';
        this.newFormat = 'single';
        this.creating.set(false);
        this.tournaments.update(list => [t, ...list]);
        this.showToast('Tournament created!');
      },
      // Prefer the server's own message — a plan gate explains itself far better than a
      // generic failure, and a stale cached profile means the UI can let a request through
      // that the server then refuses.
      error: err => {
        this.creating.set(false);
        this.createError.set(err?.error?.error || 'Failed to create tournament.');
      },
    });
  }

  async delete(t: Tournament) {
    const ok = await confirmService.confirm(`Delete "${t.name}"? A super admin can restore it later from Deleted Tournaments.`);
    if (!ok) return;
    this.svc.deleteTournament(t.id).subscribe({
      next: () => {
        this.tournaments.update(list => list.filter(x => x.id !== t.id));
        this.showToast('Deleted.');
      },
    });
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
