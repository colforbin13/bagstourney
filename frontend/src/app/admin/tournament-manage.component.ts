// src/app/admin/tournament-manage.component.ts
import { Component, OnInit, signal } from '@angular/core';
import { confirmService } from '../shared/services/confirm.service';
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
                @if (editingParticipantId === p.id) {
                  <input class="input" type="text" [(ngModel)]="editingParticipantName" />
                  <button class="btn btn-sm" (click)="saveParticipant(p)">Save</button>
                  <button class="btn btn-sm" (click)="cancelEditParticipant()">Cancel</button>
                } @else {
                  <span style="flex:1">{{ p.name }}</span>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-sm" (click)="startEditParticipant(p)">Edit</button>
                    @if (tournament()?.status === 'setup') {
                      <button class="btn btn-sm btn-danger" (click)="deleteParticipant(p)">✕</button>
                    }
                  </div>
                }
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
        <div class="section-label" style="margin-bottom:10px">Participants</div>
        @if (participants().length === 0) {
          <div class="empty">No participants.</div>
        } @else {
          <div class="participant-list">
            @for (p of participants(); track p.id) {
              <div class="participant-item">
                @if (editingParticipantId === p.id) {
                  <input class="input" type="text" [(ngModel)]="editingParticipantName" />
                  <button class="btn btn-sm" (click)="saveParticipant(p)">Save</button>
                  <button class="btn btn-sm" (click)="cancelEditParticipant()">Cancel</button>
                } @else {
                  <span style="flex:1">{{ p.name }}</span>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-sm" (click)="startEditParticipant(p)">Edit</button>
                    @if (tournament()?.status === 'setup') {
                      <button class="btn btn-sm btn-danger" (click)="deleteParticipant(p)">✕</button>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }

        <hr class="divider" />
        <div class="section-label" style="margin-bottom:10px">Teams</div>
        @if (teams().length === 0) {
          <div class="empty">No teams.</div>
        } @else {
          <div class="team-list">
            @for (team of teams(); track team.id) {
              <div class="team-item">
                <span class="seed">#{{ team.seed }}</span>
                <div class="team-info" style="flex:1">
                  @if (editingTeamId === team.id) {
                    <input class="input" type="text" [(ngModel)]="editingTeamName" />
                  } @else {
                    <div class="team-name">{{ team.name }}</div>
                  }
                  <div class="team-players">{{ team.participant1_name }} · {{ team.participant2_name }}</div>
                </div>
                <div style="display:flex;gap:8px">
                  @if (editingTeamId === team.id) {
                    <button class="btn btn-sm" (click)="saveTeam(team)">Save</button>
                    <button class="btn btn-sm" (click)="cancelEditTeam()">Cancel</button>
                  } @else {
                    <button class="btn btn-sm" (click)="startEditTeam(team)">Edit</button>
                  }
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

  // Inline editing state
  editingParticipantId: number | null = null;
  editingParticipantName = '';

  editingTeamId: number | null = null;
  editingTeamName = '';

  constructor(private route: ActivatedRoute, private svc: TournamentService) {}

  ngOnInit() {
    this.tournamentId = +this.route.snapshot.paramMap.get('id')!;
    this.load();
  }

  load() {
    this.svc.getTournament(this.tournamentId).subscribe(t => {
      this.tournament.set(t);
      // Always load participants so names can be edited at any time
      this.svc.getParticipants(this.tournamentId).subscribe(p => this.participants.set(p));

      if (t.status !== 'setup') {
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

  // Participant inline edit
  startEditParticipant(p: Participant) {
    this.editingParticipantId = p.id;
    this.editingParticipantName = p.name;
  }

  cancelEditParticipant() {
    this.editingParticipantId = null;
    this.editingParticipantName = '';
  }

  saveParticipant(p: Participant) {
    const name = this.editingParticipantName.trim();
    if (!name) return;
    this.svc.updateParticipant(p.id, name).subscribe({
      next: updated => {
        this.participants.update(list => list.map(item => item.id === p.id ? updated : item));
        // Refresh teams display so team participant_name fields reflect the change
        if (this.tournament()?.status !== 'setup') {
          this.svc.getTeams(this.tournamentId).subscribe(t => this.teams.set(t));
        }
        this.cancelEditParticipant();
      },
      error: () => this.showToast('Failed to update participant.'),
    });
  }

  async deleteParticipant(p: Participant) {
    // Prevent deletes client-side if tournament not in setup
    if (this.tournament()?.status !== 'setup') {
      this.showToast('Cannot delete participants after teams have been drawn.');
      return;
    }
    const ok = await confirmService.confirm(`Delete participant "${p.name}"? This cannot be undone.`);
    if (!ok) return;
    this.svc.deleteParticipant(p.id).subscribe({
      next: () => this.participants.update(list => list.filter(x => x.id !== p.id)),
      error: (err) => this.showToast(err?.error?.error ?? 'Failed to delete participant.'),
    });
  }

  async drawTeams() {
    const ok = await confirmService.confirm('Draw teams and start the tournament? This cannot be undone.');
    if (!ok) return;
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

  // Team inline edit
  startEditTeam(t: Team) {
    this.editingTeamId = t.id;
    this.editingTeamName = t.name;
  }

  cancelEditTeam() {
    this.editingTeamId = null;
    this.editingTeamName = '';
  }

  saveTeam(t: Team) {
    const name = this.editingTeamName.trim();
    if (!name) return;
    this.svc.updateTeam(t.id, { name }).subscribe({
      next: updated => {
        this.teams.set(this.teams().map(item => item.id === t.id ? updated : item));
        this.cancelEditTeam();
      },
      error: () => this.showToast('Failed to update team.'),
    });
  }

  private showToast(msg: string) {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
