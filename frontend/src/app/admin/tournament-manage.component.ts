// src/app/admin/tournament-manage.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament, Participant, Team } from '../shared/models/tournament.models';

@Component({
  selector: 'app-tournament-manage',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <a routerLink="/admin" style="color:var(--text-dim);font-size:.8rem;">← Admin</a>
          <h1 style="margin-top:4px;">{{ tournament()?.name }}</h1>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          @if (tournament()) {
            <span class="badge badge-{{ tournament()!.status }}">{{ tournament()!.status }}</span>
          }
          <a class="btn btn-sm" [routerLink]="['/bracket', tournamentId]">View bracket</a>
        </div>
      </div>

      <!-- ── SETUP PHASE ── -->
      @if (tournament()?.status === 'setup') {
        <!-- Add participant -->
        <div class="card" style="margin-bottom:24px">
          <div class="section-label">Add Participant</div>
          <div class="row">
            <input class="input" type="text" [(ngModel)]="newParticipant"
              placeholder="Full name" (keyup.enter)="addParticipant()" />
            <button class="btn btn-primary" [disabled]="adding()" (click)="addParticipant()">
              @if (adding()) { <span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span> }
              Add
            </button>
          </div>
          @if (addError()) { <div class="form-error">{{ addError() }}</div> }
        </div>

        <!-- Participants list -->
        <div class="section-label">
          Participants
          <span class="count">{{ participants().length }}</span>
          @if (participants().length % 2 !== 0 && participants().length > 0) {
            <span class="warn">— Need an even number</span>
          }
        </div>

        @if (participants().length === 0) {
          <div class="empty" style="padding:24px 0">No participants yet.</div>
        } @else {
          <div class="participant-list">
            @for (p of participants(); track p.id) {
              <div class="participant-item">
                <span>{{ p.name }}</span>
                <button class="btn btn-sm btn-danger" (click)="deleteParticipant(p)">✕</button>
              </div>
            }
          </div>
        }

        <!-- Draw button -->
        @if (participants().length >= 2 && participants().length % 2 === 0) {
          <hr class="divider" />
          <div class="draw-section">
            <div>
              <div style="font-weight:500;margin-bottom:4px;">Ready to draw teams?</div>
              <div style="font-size:.8rem;color:var(--text-dim);">
                {{ participants().length }} participants → {{ participants().length / 2 }} teams.
                This will randomly pair players, seed teams, and generate the bracket.
              </div>
            </div>
            <button class="btn btn-primary" [disabled]="drawing()" (click)="drawTeams()">
              @if (drawing()) {
                <span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span>
                Drawing…
              } @else {
                Draw Teams & Start
              }
            </button>
          </div>
          @if (drawError()) { <div class="form-error" style="margin-top:12px">{{ drawError() }}</div> }
        }
      }

      <!-- ── ACTIVE / COMPLETE PHASE ── -->
      @if (tournament()?.status !== 'setup') {
        <div class="section-label" style="margin-bottom:10px">Teams</div>
        @if (teams().length === 0) {
          <div class="empty">No teams.</div>
        } @else {
          <div class="team-list">
            @for (team of teams(); track team.id) {
              <div class="team-item">
                <span class="seed">#{{ team.seed }}</span>
                <div class="team-info">
                  <div class="team-name">{{ team.name }}</div>
                  <div class="team-players">{{ team.participant1_name }} · {{ team.participant2_name }}</div>
                </div>
              </div>
            }
          </div>
        }

        @if (tournament()?.status === 'complete') {
          <hr class="divider" />
          <div class="card" style="border-color:var(--accent);background:var(--surface);text-align:center;color:var(--accent)">
            <div style="font-family:var(--mono);font-size:.65rem;letter-spacing:.1em;color:var(--accent-dim);margin-bottom:6px">CHAMPION</div>
            <div style="font-size:1.1rem;font-weight:600;color:var(--accent)">{{ champion() }}</div>
          </div>
        }
      }

      <!-- Toast -->
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
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .count {
      background: var(--border);
      color: var(--text-dim);
      border-radius: 10px;
      padding: 0 6px;
      font-size: .65rem;
    }
    .warn { color: var(--danger); font-size: .65rem; }
    .row { display: flex; gap: 8px; }
    .form-error { font-size: .8rem; color: var(--danger); margin-top: 8px; }

    /* Participants */
    .participant-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
    .participant-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: .875rem;
    }

    /* Draw section */
    .draw-section {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    /* Teams */
    .team-list { display: flex; flex-direction: column; gap: 8px; }
    .team-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .seed {
      font-family: var(--mono);
      font-size: .7rem;
      color: var(--text-dim);
      width: 24px;
      flex-shrink: 0;
    }
    .team-info { display: flex; flex-direction: column; gap: 2px; }
    .team-name { font-weight: 500; font-size: .875rem; }
    .team-players { font-size: .75rem; color: var(--text-dim); }
  `]
})
export class TournamentManageComponent implements OnInit {
  tournament = signal<Tournament | null>(null);
  participants = signal<Participant[]>([]);
  teams = signal<Team[]>([]);
  champion = signal<string | null>(null);

  loading = signal(true);
  adding = signal(false);
  drawing = signal(false);
  addError = signal('');
  drawError = signal('');
  toast = signal('');

  newParticipant = '';
  tournamentId!: number;

  constructor(private route: ActivatedRoute, private svc: TournamentService) {}

  ngOnInit() {
    this.tournamentId = +this.route.snapshot.paramMap.get('id')!;
    this.load();
  }

  load() {
    this.svc.getTournament(this.tournamentId).subscribe(t => {
      this.tournament.set(t);
      if (t.status === 'setup') {
        this.svc.getParticipants(this.tournamentId).subscribe(p => this.participants.set(p));
      } else {
        this.svc.getTeams(this.tournamentId).subscribe(teams => this.teams.set(teams));
        if (t.status === 'complete') {
          this.svc.getBracket(this.tournamentId).subscribe(data => {
            const rounds = Object.entries(data.rounds).map(([n, m]) => ({ n: +n, m })).sort((a, b) => b.n - a.n);
            const final = rounds[0]?.m[0] as any;
            this.champion.set(final?.winner_name ?? null);
          });
        }
      }
      this.loading.set(false);
    });
  }

  addParticipant() {
    const name = this.newParticipant.trim();
    if (!name) { this.addError.set('Enter a name.'); return; }
    this.adding.set(true);
    this.addError.set('');
    this.svc.addParticipant(this.tournamentId, name).subscribe({
      next: p => {
        this.newParticipant = '';
        this.adding.set(false);
        this.participants.update(list => [...list, p].sort((a, b) => a.name.localeCompare(b.name)));
      },
      error: err => {
        this.adding.set(false);
        this.addError.set(err?.error?.error ?? 'Failed to add participant.');
      },
    });
  }

  deleteParticipant(p: Participant) {
    this.svc.deleteParticipant(p.id).subscribe({
      next: () => this.participants.update(list => list.filter(x => x.id !== p.id)),
    });
  }

  drawTeams() {
    if (!confirm('Draw teams and start the tournament? This cannot be undone.')) return;
    this.drawing.set(true);
    this.drawError.set('');
    this.svc.drawTeams(this.tournamentId).subscribe({
      next: () => {
        this.drawing.set(false);
        this.showToast('Teams drawn! Bracket generated.');
        this.load();
      },
      error: err => {
        this.drawing.set(false);
        this.drawError.set(err?.error?.error ?? 'Failed to draw teams.');
      },
    });
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
