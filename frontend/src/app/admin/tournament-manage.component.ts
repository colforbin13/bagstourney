// src/app/admin/tournament-manage.component.ts
import { Component, OnInit, signal, computed } from '@angular/core';
import { confirmService } from '../shared/services/confirm.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament, Participant, Team, TournamentMember, UserSearchResult } from '../shared/models/tournament.models';

@Component({
  selector: 'app-tournament-manage',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="page">
    @if (loadError()) {
      <div class="empty" style="padding:48px 24px">
        {{ loadError() }}
        <div style="margin-top:16px"><a routerLink="/admin" class="btn btn-sm">Back to Admin</a></div>
      </div>
    } @else {
      <!-- Header -->
      <div class="page-header">
        <div>
          <a routerLink="/admin" style="color:var(--text-dim);font-size:.8rem;">← Admin</a>
          <h1 style="margin-top:4px;">{{ tournament()?.name }}</h1>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          @if (tournament()) {
            <span class="badge badge-{{ tournament()!.status }}">{{ tournament()!.status }}</span>
            <span class="badge badge-visibility-{{ tournament()!.visibility }}">{{ tournament()!.visibility }}</span>
            @if (canManageSetup()) {
              <button class="btn btn-sm" [disabled]="visibilityBusy()" (click)="toggleVisibility()">
                Make {{ tournament()!.visibility === 'private' ? 'Public' : 'Private' }}
              </button>
              <button class="btn btn-sm" (click)="copyPublicLink()">Copy link</button>
            }
          }
          <a class="btn btn-sm" [routerLink]="['/bracket', tournamentId]">View bracket</a>
        </div>
      </div>

      <!-- ── STAFF & ACCESS ── -->
      @if (staffVisible()) {
        <div class="card" style="margin-bottom:24px">
          <div class="section-label">Staff &amp; Access</div>

          <div class="member-list">
            @for (m of members(); track m.user_id) {
              <div class="member-item">
                <div class="member-info">
                  <span class="member-name">{{ m.username ?? m.email }}</span>
                  <span class="member-meta">{{ m.email }} · {{ m.global_role }}</span>
                </div>
                @if (m.role === 'owner') {
                  <span class="badge badge-owner">Owner</span>
                } @else {
                  <select class="input" style="width:auto"
                    [ngModel]="m.role"
                    (ngModelChange)="changeMemberRole(m, $event)"
                    [disabled]="memberBusyUserId() === m.user_id">
                    <option value="manager">Manager</option>
                    <option value="scorekeeper">Scorekeeper</option>
                  </select>
                  <button class="btn btn-sm btn-danger"
                    [disabled]="memberBusyUserId() === m.user_id"
                    (click)="removeMember(m)">Remove</button>
                }
              </div>
            }
          </div>

          @if (memberError()) { <div class="form-error">{{ memberError() }}</div> }

          <hr class="divider" />

          <div class="section-label">Add or Transfer Staff</div>
          <div class="user-search">
            <input class="input" type="text" [(ngModel)]="staffSearchQuery"
              (ngModelChange)="onStaffSearchInput()"
              placeholder="Search by username or email (2+ characters)" />
            @if (staffSearchResults().length > 0) {
              <div class="search-results">
                @for (u of staffSearchResults(); track u.id) {
                  <button type="button" class="search-result" (click)="selectStaffUser(u)">
                    {{ u.username }} <span class="dim">({{ u.email }} · {{ u.role }})</span>
                  </button>
                }
              </div>
            }
          </div>

          @if (selectedStaffUser()) {
            <div class="row" style="margin-top:8px;align-items:center;flex-wrap:wrap">
              <span>Selected: <strong>{{ selectedStaffUser()!.username }}</strong></span>
              <button class="btn btn-sm btn-primary" [disabled]="staffActionBusy()" (click)="addStaffMember('manager')">Add as Manager</button>
              <button class="btn btn-sm btn-primary" [disabled]="staffActionBusy()" (click)="addStaffMember('scorekeeper')">Add as Scorekeeper</button>
              <button class="btn btn-sm btn-danger" [disabled]="staffActionBusy()" (click)="transferOwnershipTo()">Transfer Ownership</button>
              <button class="btn btn-sm" [disabled]="staffActionBusy()" (click)="cancelStaffSelection()">Cancel</button>
            </div>
          }
        </div>
      }

      <!-- ── SETUP PHASE ── -->
      @if (tournament()?.status === 'setup') {
        <!-- Add participant -->
        @if (canManageSetup()) {
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
        }

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
                  <input class="input" type="text" [(ngModel)]="editingParticipantName" placeholder="Name" [disabled]="savingParticipantId() === p.id" />
                  <input class="input" type="email" [(ngModel)]="editingParticipantEmail" placeholder="Email (optional)" [disabled]="savingParticipantId() === p.id" />
                  <button class="btn btn-sm" [disabled]="savingParticipantId() === p.id" (click)="saveParticipant(p)">
                    @if (savingParticipantId() === p.id) { Saving… } @else { Save }
                  </button>
                  <button class="btn btn-sm" [disabled]="savingParticipantId() === p.id" (click)="cancelEditParticipant()">Cancel</button>
                } @else {
                  <span style="flex:1">
                    {{ p.name }}
                    @if (notificationStatusLabel(p); as label) {
                      <span class="notify-status">— {{ label }}</span>
                    }
                  </span>
                  @if (canManageSetup()) {
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-sm" (click)="startEditParticipant(p)">Edit</button>
                      <button class="btn btn-sm btn-danger" (click)="deleteParticipant(p)">✕</button>
                    </div>
                  }
                }
              </div>
            }
          </div>
        }

        <!-- Draw button -->
        @if (canManageSetup() && participants().length >= 4 && participants().length % 2 === 0) {
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
                  <input class="input" type="text" [(ngModel)]="editingParticipantName" placeholder="Name" [disabled]="savingParticipantId() === p.id" />
                  <input class="input" type="email" [(ngModel)]="editingParticipantEmail" placeholder="Email (optional)" [disabled]="savingParticipantId() === p.id" />
                  <button class="btn btn-sm" [disabled]="savingParticipantId() === p.id" (click)="saveParticipant(p)">
                    @if (savingParticipantId() === p.id) { Saving… } @else { Save }
                  </button>
                  <button class="btn btn-sm" [disabled]="savingParticipantId() === p.id" (click)="cancelEditParticipant()">Cancel</button>
                } @else {
                  <span style="flex:1">
                    {{ p.name }}
                    @if (notificationStatusLabel(p); as label) {
                      <span class="notify-status">— {{ label }}</span>
                    }
                  </span>
                  @if (canManageSetup()) {
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-sm" (click)="startEditParticipant(p)">Edit</button>
                    </div>
                  }
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
                @if (canManageSetup()) {
                  <div style="display:flex;gap:8px">
                    @if (editingTeamId === team.id) {
                      <button class="btn btn-sm" (click)="saveTeam(team)">Save</button>
                      <button class="btn btn-sm" (click)="cancelEditTeam()">Cancel</button>
                    } @else {
                      <button class="btn btn-sm" (click)="startEditTeam(team)">Edit</button>
                    }
                  </div>
                }
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
    .notify-status { color: var(--text-dim); font-size: .75rem; }

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

    /* Staff & Access */
    .member-list { display: flex; flex-direction: column; gap: 6px; }
    .member-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .member-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .member-name { font-weight: 500; font-size: .875rem; }
    .member-meta { font-size: .75rem; color: var(--text-dim); }
    .badge-owner { background: var(--accent); color: #fff; border: 1px solid var(--accent); }
    .badge-visibility-public  { background: var(--surface); color: var(--text-dim); border: 1px solid var(--border); }
    .badge-visibility-private { background: var(--surface); color: var(--muted); border: 1px solid var(--border); }
    .user-search { position: relative; }
    .search-results {
      position: absolute;
      z-index: 5;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      max-height: 220px;
      overflow-y: auto;
    }
    .search-result {
      display: block;
      width: 100%;
      text-align: left;
      padding: 8px 12px;
      font-size: .85rem;
      background: none;
      border: none;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      color: var(--text);
      &:last-child { border-bottom: none; }
      &:hover { background: var(--bg); }
    }
    .dim { color: var(--text-dim); }
  `]
})
export class TournamentManageComponent implements OnInit {
  tournament = signal<Tournament | null>(null);
  participants = signal<Participant[]>([]);
  teams = signal<Team[]>([]);
  champion = signal<string | null>(null);
  canManageSetup = computed(() => this.tournament()?.capabilities?.can_manage_setup ?? false);
  visibilityBusy = signal(false);

  loading = signal(true);
  loadError = signal('');
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
  editingParticipantEmail = '';
  savingParticipantId = signal<number | null>(null);

  editingTeamId: number | null = null;
  editingTeamName = '';

  // Staff & Access
  members = signal<TournamentMember[]>([]);
  staffVisible = signal(false);
  memberBusyUserId = signal<number | null>(null);
  memberError = signal('');

  staffSearchQuery = '';
  staffSearchResults = signal<UserSearchResult[]>([]);
  selectedStaffUser = signal<UserSearchResult | null>(null);
  staffActionBusy = signal(false);
  private staffSearchDebounce?: ReturnType<typeof setTimeout>;

  constructor(private route: ActivatedRoute, private svc: TournamentService) {}

  ngOnInit() {
    this.tournamentId = +this.route.snapshot.paramMap.get('id')!;
    this.load();
  }

  load() {
    this.svc.getTournament(this.tournamentId).subscribe({
      next: t => {
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

        // Only ask for the member list when the tournament response says we're allowed
        // to manage staff — avoids an always-attempted request that a manager or
        // scorekeeper would just get a 403 back from.
        if (t.capabilities?.can_manage_staff) {
          this.loadMembers();
        }

        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('This tournament could not be found, or you do not have access to it.');
      },
    });
  }

  toggleVisibility() {
    const t = this.tournament();
    if (!t) return;
    const next: 'public' | 'private' = t.visibility === 'private' ? 'public' : 'private';
    this.visibilityBusy.set(true);
    this.svc.updateTournament(this.tournamentId, { visibility: next }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.visibilityBusy.set(false);
        this.showToast(next === 'private' ? 'Tournament is now private.' : 'Tournament is now public.');
      },
      error: () => {
        this.visibilityBusy.set(false);
        this.showToast('Failed to update visibility.');
      },
    });
  }

  copyPublicLink() {
    const uuid = this.tournament()?.uuid;
    if (!uuid) return;
    navigator.clipboard.writeText(`${location.origin}/bracket/${uuid}`).then(
      () => this.showToast('Link copied!'),
      () => this.showToast('Could not copy link.'),
    );
  }

  loadMembers() {
    this.svc.getTournamentMembers(this.tournamentId).subscribe({
      next: members => {
        this.members.set(members);
        this.staffVisible.set(true);
      },
      error: () => {
        this.members.set([]);
        this.staffVisible.set(false);
      },
    });
  }

  onStaffSearchInput() {
    clearTimeout(this.staffSearchDebounce);
    const q = this.staffSearchQuery.trim();
    if (q.length < 2) {
      this.staffSearchResults.set([]);
      return;
    }
    this.staffSearchDebounce = setTimeout(() => {
      this.svc.searchUsers(q).subscribe({
        next: results => this.staffSearchResults.set(results),
        error: () => this.staffSearchResults.set([]),
      });
    }, 250);
  }

  selectStaffUser(u: UserSearchResult) {
    this.selectedStaffUser.set(u);
    this.staffSearchResults.set([]);
    this.staffSearchQuery = '';
  }

  cancelStaffSelection() {
    this.selectedStaffUser.set(null);
  }

  addStaffMember(role: 'manager' | 'scorekeeper') {
    const user = this.selectedStaffUser();
    if (!user) return;
    this.staffActionBusy.set(true);
    this.memberError.set('');
    this.svc.addTournamentMember(this.tournamentId, user.id, role).subscribe({
      next: () => {
        this.staffActionBusy.set(false);
        this.selectedStaffUser.set(null);
        this.showToast(`${user.username} added as ${role}.`);
        this.loadMembers();
      },
      error: err => {
        this.staffActionBusy.set(false);
        this.memberError.set(err?.error?.error ?? 'Failed to add staff member.');
      },
    });
  }

  async transferOwnershipTo() {
    const user = this.selectedStaffUser();
    if (!user) return;
    const ok = await confirmService.confirm(
      `Transfer ownership of this tournament to ${user.username}? You will become a manager.`
    );
    if (!ok) return;
    this.staffActionBusy.set(true);
    this.memberError.set('');
    this.svc.transferTournamentOwnership(this.tournamentId, user.id).subscribe({
      next: () => {
        this.staffActionBusy.set(false);
        this.selectedStaffUser.set(null);
        this.showToast(`Ownership transferred to ${user.username}.`);
        this.loadMembers();
      },
      error: err => {
        this.staffActionBusy.set(false);
        this.memberError.set(err?.error?.error ?? 'Failed to transfer ownership.');
      },
    });
  }

  changeMemberRole(m: TournamentMember, newRole: 'manager' | 'scorekeeper') {
    if (newRole === m.role) return;
    this.memberBusyUserId.set(m.user_id);
    this.memberError.set('');
    this.svc.updateTournamentMember(this.tournamentId, m.user_id, newRole).subscribe({
      next: () => {
        this.memberBusyUserId.set(null);
        this.showToast('Role updated.');
        this.loadMembers();
      },
      error: err => {
        this.memberBusyUserId.set(null);
        this.memberError.set(err?.error?.error ?? 'Failed to update role.');
        this.loadMembers(); // revert the select back to the actual role
      },
    });
  }

  async removeMember(m: TournamentMember) {
    const ok = await confirmService.confirm(`Remove ${m.username} from this tournament's staff?`);
    if (!ok) return;
    this.memberBusyUserId.set(m.user_id);
    this.memberError.set('');
    this.svc.removeTournamentMember(this.tournamentId, m.user_id).subscribe({
      next: () => {
        this.memberBusyUserId.set(null);
        this.members.update(list => list.filter(x => x.user_id !== m.user_id));
        this.showToast('Removed.');
      },
      error: err => {
        this.memberBusyUserId.set(null);
        this.memberError.set(err?.error?.error ?? 'Failed to remove member.');
      },
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
    this.editingParticipantEmail = p.email ?? '';
  }

  cancelEditParticipant() {
    this.editingParticipantId = null;
    this.editingParticipantName = '';
    this.editingParticipantEmail = '';
  }

  notificationStatusLabel(p: Participant): string | null {
    switch (p.notification_lifecycle) {
      case 'pending': return 'pending confirmation';
      case 'confirmed': return 'subscribed';
      case 'suppressed': return 'suppressed';
      default: return null;
    }
  }

  saveParticipant(p: Participant) {
    // Guards against a double-click firing two overlapping saves — the second call would
    // otherwise regenerate and silently invalidate the confirm token the first call just
    // issued (each call to setParticipantNotificationEmail() starts a fresh opt-in flow).
    if (this.savingParticipantId() === p.id) return;
    const name = this.editingParticipantName.trim();
    const email = this.editingParticipantEmail.trim();
    if (!name) return;
    this.savingParticipantId.set(p.id);
    this.svc.updateParticipant(p.id, name).subscribe({
      next: updated => {
        this.participants.update(list => list.map(item => item.id === p.id ? updated : item));
        // Refresh teams display so team participant_name fields reflect the change
        if (this.tournament()?.status !== 'setup') {
          this.svc.getTeams(this.tournamentId).subscribe(t => this.teams.set(t));
        }
        if (email !== (p.email ?? '')) {
          this.svc.setParticipantNotificationEmail(p.id, email).subscribe({
            next: withEmail => {
              this.participants.update(list => list.map(item => item.id === p.id ? { ...item, ...withEmail } : item));
              if (withEmail.warning) this.showToast(withEmail.warning);
              this.savingParticipantId.set(null);
            },
            error: () => {
              this.showToast('Failed to update notification email.');
              this.savingParticipantId.set(null);
            },
          });
        } else {
          this.savingParticipantId.set(null);
        }
        this.cancelEditParticipant();
      },
      error: () => {
        this.showToast('Failed to update participant.');
        this.savingParticipantId.set(null);
      },
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
