// src/app/admin/tournament-manage.component.ts
import { Component, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { confirmService } from '../shared/services/confirm.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { TournamentService } from '../shared/services/tournament.service';
import { Tournament, Participant, Team, TournamentMember, UserSearchResult } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-tournament-manage',
  standalone: true,
  imports: [RouterLink, FormsModule, DragDropModule],
  template: `
    <div class="page">
    @if (loadError()) {
      <div class="empty" style="padding:48px 24px">
        {{ loadError() }}
        <div style="margin-top:16px"><a routerLink="/admin" class="btn btn-sm">Back to Admin</a></div>
      </div>
    } @else {
      <!-- Header -->
      <div class="page-header" style="margin-bottom:14px;">
        <div>
          <a routerLink="/admin" style="color:var(--text-dim);font-size:.8rem;">← Admin</a>
          <h1 style="margin-top:4px;">{{ tournament()?.name }}</h1>
        </div>
      </div>

      @if (tournament()) {
        <div class="tm-toolbar-row">
          <div class="tm-badges">
            <span class="badge badge-{{ tournament()!.status }}">{{ tournament()!.status }}</span>
            <span class="badge badge-visibility-{{ tournament()!.visibility }}">{{ tournament()!.visibility }}</span>
            @if (tournament()!.seeding_mode === 'manual') {
              <span class="badge badge-visibility-private">manual seeding</span>
            }
            @if (participantCap() !== null) {
              <span class="badge" [class.badge-cap-warning]="participantCount()! >= participantCap()!"
                title="Freemium plan limit — plumbing ahead of real billing">
                {{ participantCount() }}/{{ participantCap() }} participants
              </span>
            }
            @if (isSuperAdmin()) {
              <button class="btn btn-sm" [disabled]="paidOverrideBusy()" (click)="togglePaidOverride()"
                title="Manual plan override for this tournament — no billing exists yet">
                @if (paidOverrideBusy()) {
                  <span class="spinner" style="width:10px;height:10px;border-width:1px"></span>
                } @else {
                  {{ tournament()!.paid_override ? 'Remove plan override' : 'Grant plan override' }}
                }
              </button>
            }
          </div>

          <div class="tm-actions-row">
            <a class="btn btn-sm btn-primary" [routerLink]="['/bracket', tournamentId]">View bracket</a>

            @if (canManageSetup() || canDelete()) {
              <div class="dropdown">
                <button class="btn btn-sm" (click)="toggleActionsMenu()">Actions ▾</button>
                @if (actionsMenuOpen()) {
                  <div class="dropdown-backdrop" (click)="closeActionsMenu()"></div>
                  <div class="dropdown-menu">
                    @if (canManageSetup()) {
                      <button class="dropdown-item" (click)="copyPublicLink(); closeActionsMenu()">Copy link</button>
                      @if (tournament()!.status === 'setup' && !isDirectEntry() && teams().length === 0) {
                        <button class="dropdown-item" (click)="copyRegistrationLink(); closeActionsMenu()">Copy registration link</button>
                        <button class="dropdown-item" (click)="openQrModal(); closeActionsMenu()">Show registration QR code</button>
                      }
                      <button class="dropdown-item" [disabled]="visibilityBusy()" (click)="toggleVisibility(); closeActionsMenu()">
                        Make {{ tournament()!.visibility === 'private' ? 'Public' : 'Private' }}
                      </button>
                    }
                    @if (canDelete()) {
                      @if (canManageSetup()) { <div class="dropdown-divider"></div> }
                      <button class="dropdown-item dropdown-item-danger" [disabled]="deletingTournament()" (click)="deleteTournamentAction()">
                        @if (deletingTournament()) { Deleting… } @else { Delete Tournament }
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </div>
      }

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
                  <select class="input" style="width:140px;flex:none"
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
        <!-- Mode selectors: only choosable before teams exist -->
        @if (canManageSetup() && teams().length === 0) {
          <div class="card" style="margin-bottom:24px">
            <div class="section-label">Team Entry</div>
            <select class="input" [ngModel]="tournament()!.team_entry_mode"
              (ngModelChange)="updateTeamEntryMode($event)" [disabled]="teamEntryModeBusy()">
              <option value="auto_draft">Auto-draft — add participants, randomly pair them into teams</option>
              <option value="direct">Direct entry — create each team by typing both member names</option>
            </select>
          </div>
          <div class="card" style="margin-bottom:24px">
            <div class="section-label">Seeding</div>
            <select class="input" [ngModel]="tournament()!.seeding_mode"
              (ngModelChange)="updateSeedingMode($event)" [disabled]="seedingModeBusy()">
              <option value="automatic">Automatic — seed by draw order and generate the bracket immediately</option>
              <option value="manual">Manual — draw teams, then set the final seed order yourself</option>
            </select>
          </div>
        }

        @if (isDirectEntry()) {
          <!-- Add team (direct entry) -->
          @if (canManageSetup()) {
            <div class="card" style="margin-bottom:24px">
              <div class="section-label">Add Team</div>
              <div class="row" style="flex-wrap:wrap">
                <input class="input" type="text" [(ngModel)]="newTeamName"
                  placeholder="Team name" style="flex:1;min-width:140px" />
                <input class="input" type="text" [(ngModel)]="newTeamP1Name"
                  placeholder="Member 1 name" style="flex:1;min-width:140px" />
                <input class="input" type="text" [(ngModel)]="newTeamP2Name"
                  placeholder="Member 2 name" style="flex:1;min-width:140px" />
                <button class="btn btn-primary" [disabled]="addingTeam()" (click)="addTeam()">
                  @if (addingTeam()) { <span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span> }
                  Add Team
                </button>
              </div>
              @if (addTeamError()) { <div class="form-error">{{ addTeamError() }}</div> }
            </div>
          }
        } @else {
          <!-- Add participant (auto-draft) -->
          @if (canManageSetup() && teams().length === 0) {
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

          @if (pendingParticipants().length > 0) {
            <div class="card" style="margin-bottom:16px;border-color:var(--accent)">
              {{ pendingParticipants().length }} self-registration{{ pendingParticipants().length === 1 ? '' : 's' }}
              awaiting approval — approve or reject before drawing teams.
            </div>
          }

          <!-- Participants list -->
          <div class="section-label">
            Participants
            <span class="count">{{ approvedParticipants().length }}</span>
            @if (approvedParticipants().length % 2 !== 0 && approvedParticipants().length > 0) {
              <span class="warn">— Need an even number</span>
            }
          </div>

          @if (participants().length === 0) {
            <div class="empty" style="padding:24px 0">No participants yet.</div>
          } @else {
            <div class="participant-list">
              @for (p of participants(); track p.id) {
                <div class="participant-item">
                  @if (p.registration_status === 'pending') {
                    <span style="flex:1">{{ p.name }} <span class="notify-status">— pending approval</span></span>
                    @if (canManageSetup()) {
                      <div style="display:flex;gap:6px">
                        <button class="btn btn-sm btn-primary" [disabled]="approvingParticipantId() === p.id" (click)="approveParticipant(p)">Approve</button>
                        <button class="btn btn-sm btn-danger" (click)="deleteParticipant(p)">Reject</button>
                      </div>
                    }
                  } @else if (editingParticipantId === p.id) {
                    <div class="edit-form">
                      <div class="edit-form-fields">
                        <input class="input" style="flex:1;min-width:140px" type="text" [(ngModel)]="editingParticipantName" placeholder="Name" [disabled]="savingParticipantId() === p.id" />
                        <input class="input" style="flex:1;min-width:140px" type="email" [(ngModel)]="editingParticipantEmail" placeholder="Email (optional)" [disabled]="savingParticipantId() === p.id" />
                      </div>
                      <div class="edit-form-actions">
                        <button class="btn btn-sm" [disabled]="savingParticipantId() === p.id" (click)="cancelEditParticipant()">Cancel</button>
                        <button class="btn btn-sm btn-primary" [disabled]="savingParticipantId() === p.id" (click)="saveParticipant(p)">
                          @if (savingParticipantId() === p.id) { Saving… } @else { Save }
                        </button>
                      </div>
                    </div>
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
                        @if (teams().length === 0) {
                          <button class="btn btn-sm btn-danger" (click)="deleteParticipant(p)">✕</button>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </div>
          }

          <!-- Draw button (before teams exist) -->
          @if (canManageSetup() && teams().length === 0 && approvedParticipants().length >= 4 && approvedParticipants().length % 2 === 0 && pendingParticipants().length === 0) {
            <hr class="divider" />
            <div class="draw-section">
              <div>
                <div style="font-weight:500;margin-bottom:4px;">Ready to draw teams?</div>
                <div style="font-size:.8rem;color:var(--text-dim);">
                  {{ approvedParticipants().length }} participants → {{ approvedParticipants().length / 2 }} teams.
                  @if (isManualSeeding()) {
                    This will randomly pair players into teams. You'll set the final seed order before generating the bracket.
                  } @else {
                    This will randomly pair players, seed teams, and generate the bracket.
                  }
                </div>
              </div>
              <button class="btn btn-primary" [disabled]="drawing()" (click)="drawTeams()">
                @if (drawing()) {
                  <span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span>
                  Drawing…
                } @else {
                  {{ isManualSeeding() ? 'Draw Teams' : 'Draw Teams & Start' }}
                }
              </button>
            </div>
            @if (drawError()) { <div class="form-error" style="margin-top:12px">{{ drawError() }}</div> }
          }
        }

        <!-- Teams: seed order + bracket generation, shared by both entry modes -->
        @if (canManageSetup() && teams().length > 0) {
          <hr class="divider" />
          <div class="section-label">
            Teams
            <span class="count">{{ teams().length }}</span>
          </div>
          @if (isManualSeeding()) {
            <div style="font-size:.8rem;color:var(--text-dim);margin-bottom:10px">
              Drag to reorder — seed 1 plays the bracket's lowest seed first.
            </div>
          }
          <div cdkDropList class="team-seed-list" (cdkDropListDropped)="onSeedDrop($event)">
            @for (team of teams(); track team.id) {
              <div class="team-seed-item" cdkDrag [cdkDragDisabled]="!isManualSeeding()">
                @if (isManualSeeding()) {
                  <span class="drag-handle" cdkDragHandle aria-label="Drag to reorder">⠿</span>
                }
                <span class="seed">#{{ team.seed }}</span>
                <div class="team-info">
                  <div class="team-name">{{ team.name }}</div>
                  <div class="team-players">{{ team.participant1_name }} · {{ team.participant2_name }}</div>
                </div>
                @if (isDirectEntry()) {
                  <button class="btn btn-sm btn-danger" [disabled]="deletingTeamId() === team.id" (click)="deleteTeam(team)">✕</button>
                }
              </div>
            }
          </div>
          <div class="draw-section" style="margin-top:16px">
            @if (isDirectEntry()) {
              @if (teams().length < 2) {
                <div style="font-size:.8rem;color:var(--text-dim)">Add at least 2 teams to generate the bracket.</div>
              }
            } @else {
              <button class="btn btn-sm" [disabled]="drawing()" (click)="drawTeams()">
                @if (drawing()) {
                  <span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span>
                  Redrawing…
                } @else {
                  Redraw Teams
                }
              </button>
            }
            <button class="btn btn-primary" [disabled]="generatingBracket() || teams().length < 2" (click)="confirmGenerateBracket()">
              @if (generatingBracket()) {
                <span class="spinner" style="width:13px;height:13px;border-width:1.5px"></span>
                Generating…
              } @else {
                Generate Bracket
              }
            </button>
          </div>
          @if (drawError()) { <div class="form-error" style="margin-top:12px">{{ drawError() }}</div> }
          @if (generateBracketError()) { <div class="form-error" style="margin-top:12px">{{ generateBracketError() }}</div> }
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
                  <div class="edit-form">
                    <div class="edit-form-fields">
                      <input class="input" style="flex:1;min-width:140px" type="text" [(ngModel)]="editingParticipantName" placeholder="Name" [disabled]="savingParticipantId() === p.id" />
                      <input class="input" style="flex:1;min-width:140px" type="email" [(ngModel)]="editingParticipantEmail" placeholder="Email (optional)" [disabled]="savingParticipantId() === p.id" />
                    </div>
                    <div class="edit-form-actions">
                      <button class="btn btn-sm" [disabled]="savingParticipantId() === p.id" (click)="cancelEditParticipant()">Cancel</button>
                      <button class="btn btn-sm btn-primary" [disabled]="savingParticipantId() === p.id" (click)="saveParticipant(p)">
                        @if (savingParticipantId() === p.id) { Saving… } @else { Save }
                      </button>
                    </div>
                  </div>
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
                    <div class="edit-form">
                      <input class="input" type="text" [(ngModel)]="editingTeamName" />
                      <div class="edit-form-actions">
                        <button class="btn btn-sm" (click)="cancelEditTeam()">Cancel</button>
                        <button class="btn btn-sm btn-primary" (click)="saveTeam(team)">Save</button>
                      </div>
                    </div>
                  } @else {
                    <div class="team-name">{{ team.name }}</div>
                  }
                  <div class="team-players">{{ team.participant1_name }} · {{ team.participant2_name }}</div>
                </div>
                @if (canManageSetup() && editingTeamId !== team.id) {
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-sm" (click)="startEditTeam(team)">Edit</button>
                  </div>
                }
              </div>
            }
          </div>
        }

        @if (tournament()?.status === 'complete') {
          <hr class="divider" />
          <div class="card" style="border-color:var(--marker);background:var(--surface);text-align:center;color:var(--marker)">
            <div style="font-family:var(--mono);font-size:.65rem;letter-spacing:.1em;color:var(--marker);margin-bottom:6px">CHAMPION</div>
            <div style="font-size:1.1rem;font-weight:600;color:var(--marker)">{{ champion() }}</div>
          </div>
        }
      }

      <!-- Toast -->
      @if (toast()) {
        <div class="toast toast-success">{{ toast() }}</div>
      }

      <!-- Registration QR code -->
      @if (qrModalOpen()) {
        <div class="qr-modal-backdrop" (click)="closeQrModal()">
          <div class="qr-modal" (click)="$event.stopPropagation()">
            <div class="qr-modal-title">Registration QR Code</div>
            <div class="qr-modal-sub">{{ tournament()?.name }}</div>
            <canvas #qrCanvas class="qr-canvas"></canvas>
            <div class="qr-modal-actions">
              <button class="btn btn-sm" (click)="downloadQrCode()">Download PNG</button>
              <button class="btn btn-sm btn-primary" (click)="closeQrModal()">Close</button>
            </div>
          </div>
        </div>
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

    /* Toolbar row */
    .tm-toolbar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 24px;
    }
    .tm-badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .tm-actions-row { display: flex; align-items: center; gap: 8px; }

    /* Actions dropdown */
    .dropdown { position: relative; }
    .dropdown-backdrop { position: fixed; inset: 0; z-index: 40; }
    .dropdown-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      z-index: 50;
      min-width: 210px;
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 4px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 8px 24px rgba(0, 0, 0, .25);
    }
    .dropdown-item {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      padding: 8px 10px;
      border-radius: calc(var(--radius) - 1px);
      font-family: var(--sans);
      font-size: .8rem;
      color: var(--text);
      cursor: pointer;
      &:hover:not(:disabled) { background: var(--surface-2); }
      &:disabled { opacity: .5; cursor: not-allowed; }
    }
    .dropdown-item-danger {
      color: var(--danger);
      &:hover:not(:disabled) { background: rgba(var(--danger-rgb), 0.1); }
    }
    .dropdown-divider { height: 1px; background: var(--border); margin: 4px 2px; }

    /* Registration QR code modal */
    .qr-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 200;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, .45);
      padding: 24px;
    }
    .qr-modal {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 24px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 12px 40px rgba(0, 0, 0, .3);
      max-width: 90vw;
    }
    .qr-modal-title { font-weight: 600; font-size: 1rem; }
    .qr-modal-sub { font-size: .8rem; color: var(--text-dim); margin-bottom: 12px; }
    .qr-canvas { max-width: 100%; height: auto; border-radius: calc(var(--radius) - 1px); }
    .qr-modal-actions { display: flex; gap: 8px; margin-top: 16px; }

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

    /* Inline edit forms (participant / team) */
    .edit-form { display: flex; flex-direction: column; gap: 8px; width: 100%; }
    .edit-form-fields { display: flex; gap: 8px; flex-wrap: wrap; }
    .edit-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

    /* Draw section */
    .draw-section {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    /* Seed reorder (manual seeding) */
    .team-seed-list { display: flex; flex-direction: column; gap: 8px; }
    .team-seed-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .drag-handle {
      cursor: grab;
      color: var(--muted);
      font-size: 1rem;
      line-height: 1;
      touch-action: none;
      flex-shrink: 0;
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
    .badge-owner { background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent); }
    .badge-cap-warning { background: rgba(var(--danger-rgb), 0.1); color: var(--danger); border: 1px solid rgba(var(--danger-rgb), 0.35); }
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
  canDelete = computed(() => this.tournament()?.capabilities?.can_delete ?? false);
  isSuperAdmin = computed(() => this.tournament()?.capabilities?.is_super_admin ?? false);
  // Freemium participant cap (FEATURE_TRACKER item 12/13 plumbing) — null for a
  // scorekeeper-only role, since the backend only computes it for staff who manage setup.
  participantCap = computed(() => this.tournament()?.capabilities?.participant_cap ?? null);
  participantCount = computed(() => this.tournament()?.capabilities?.participant_count ?? null);
  paidOverrideBusy = signal(false);
  deletingTournament = signal(false);
  actionsMenuOpen = signal(false);
  approvedParticipants = computed(() => this.participants().filter(p => p.registration_status !== 'pending'));
  pendingParticipants = computed(() => this.participants().filter(p => p.registration_status === 'pending'));
  isManualSeeding = computed(() => this.tournament()?.seeding_mode === 'manual');
  isDirectEntry = computed(() => this.tournament()?.team_entry_mode === 'direct');
  approvingParticipantId = signal<number | null>(null);
  visibilityBusy = signal(false);
  seedingModeBusy = signal(false);
  teamEntryModeBusy = signal(false);

  loading = signal(true);
  loadError = signal('');
  adding = signal(false);
  drawing = signal(false);
  generatingBracket = signal(false);
  addError = signal('');
  drawError = signal('');
  generateBracketError = signal('');
  toast = signal('');

  newParticipant = '';
  tournamentId!: number;

  // Direct team entry
  newTeamName = '';
  newTeamP1Name = '';
  newTeamP2Name = '';
  addingTeam = signal(false);
  addTeamError = signal('');
  deletingTeamId = signal<number | null>(null);

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

  // Registration QR code
  qrModalOpen = signal(false);
  @ViewChild('qrCanvas') qrCanvasRef?: ElementRef<HTMLCanvasElement>;

  constructor(private route: ActivatedRoute, private svc: TournamentService, private router: Router) {}

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

        // Always load teams too — manual seeding leaves a tournament in 'setup' with
        // teams already formed while awaiting bracket generation, so this can no longer
        // be gated on status !== 'setup'.
        this.svc.getTeams(this.tournamentId).subscribe(teams => this.teams.set(teams));
        if (t.status === 'complete') {
          this.svc.getBracket(this.tournamentId).subscribe(data => {
            const rounds = Object.entries(data.rounds).map(([n, m]) => ({ n: +n, m })).sort((a, b) => b.n - a.n);
            const final = rounds[0]?.m[0] as any;
            this.champion.set(final?.winner_name ?? null);
          });
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

  // FEATURE_TRACKER item 13 plumbing: no billing exists yet, so this is a manual
  // stand-in for what a one-time Stripe purchase will flip automatically once it ships.
  togglePaidOverride() {
    const t = this.tournament();
    if (!t) return;
    const next = !t.paid_override;
    this.paidOverrideBusy.set(true);
    this.svc.updateTournament(this.tournamentId, { paid_override: next }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.paidOverrideBusy.set(false);
        this.showToast(next ? 'Plan override granted.' : 'Plan override removed.');
      },
      error: err => {
        this.paidOverrideBusy.set(false);
        this.showToast(err?.error?.error ?? 'Failed to update plan override.');
      },
    });
  }

  toggleActionsMenu() {
    this.actionsMenuOpen.update(open => !open);
  }

  closeActionsMenu() {
    this.actionsMenuOpen.set(false);
  }

  async deleteTournamentAction() {
    const t = this.tournament();
    if (!t) return;
    const ok = await confirmService.confirm(`Delete "${t.name}"? A super admin can restore it later from Deleted Tournaments.`);
    if (!ok) return;
    this.deletingTournament.set(true);
    this.svc.deleteTournament(this.tournamentId).subscribe({
      next: () => this.router.navigate(['/admin']),
      error: (err) => {
        this.deletingTournament.set(false);
        this.showToast(err?.error?.error ?? 'Failed to delete tournament.');
      },
    });
  }

  updateSeedingMode(mode: 'automatic' | 'manual') {
    if (this.tournament()?.seeding_mode === mode) return;
    this.seedingModeBusy.set(true);
    this.svc.updateTournament(this.tournamentId, { seeding_mode: mode }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.seedingModeBusy.set(false);
      },
      error: () => {
        this.seedingModeBusy.set(false);
        this.showToast('Failed to update seeding mode.');
      },
    });
  }

  updateTeamEntryMode(mode: 'auto_draft' | 'direct') {
    if (this.tournament()?.team_entry_mode === mode) return;
    this.teamEntryModeBusy.set(true);
    this.svc.updateTournament(this.tournamentId, { team_entry_mode: mode }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.teamEntryModeBusy.set(false);
      },
      error: () => {
        this.teamEntryModeBusy.set(false);
        this.showToast('Failed to update team entry mode.');
      },
    });
  }

  // location.origin alone omits the deployment base path (environment.baseHref — see
  // main.ts, which sets the <base href> from it at runtime), so a plain
  // `${location.origin}/bracket/...` string would silently drop it if it's ever
  // non-root again (it's "/" today).
  copyPublicLink() {
    const uuid = this.tournament()?.uuid;
    if (!uuid) return;
    navigator.clipboard.writeText(`${location.origin}${environment.baseHref}bracket/${uuid}`).then(
      () => this.showToast('Link copied!'),
      () => this.showToast('Could not copy link.'),
    );
  }

  private registrationUrl(): string | null {
    const uuid = this.tournament()?.uuid;
    if (!uuid) return null;
    return `${location.origin}${environment.baseHref}register/${uuid}`;
  }

  copyRegistrationLink() {
    const url = this.registrationUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => this.showToast('Registration link copied!'),
      () => this.showToast('Could not copy link.'),
    );
  }

  openQrModal() {
    const url = this.registrationUrl();
    if (!url) return;
    this.qrModalOpen.set(true);
    // Wait a tick for the @if-gated <canvas> to actually exist in the DOM.
    setTimeout(() => {
      const canvas = this.qrCanvasRef?.nativeElement;
      if (!canvas) return;
      QRCode.toCanvas(canvas, url, { width: 240, margin: 2 }, err => {
        if (err) this.showToast('Could not generate QR code.');
      });
    });
  }

  closeQrModal() {
    this.qrModalOpen.set(false);
  }

  downloadQrCode() {
    const canvas = this.qrCanvasRef?.nativeElement;
    if (!canvas) return;
    const link = document.createElement('a');
    const name = (this.tournament()?.name ?? 'tournament').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    link.download = `${name}-registration-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
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

  // Direct team entry
  addTeam() {
    const teamName = this.newTeamName.trim();
    const p1 = this.newTeamP1Name.trim();
    const p2 = this.newTeamP2Name.trim();
    if (!teamName || !p1 || !p2) {
      this.addTeamError.set('Enter a team name and both member names.');
      return;
    }
    this.addingTeam.set(true);
    this.addTeamError.set('');
    this.svc.createTeamDirect(this.tournamentId, teamName, p1, p2).subscribe({
      next: team => {
        this.newTeamName = '';
        this.newTeamP1Name = '';
        this.newTeamP2Name = '';
        this.addingTeam.set(false);
        this.teams.update(list => [...list, team]);
      },
      error: err => {
        this.addingTeam.set(false);
        this.addTeamError.set(err?.error?.error ?? 'Failed to add team.');
      },
    });
  }

  async deleteTeam(t: Team) {
    const ok = await confirmService.confirm(
      `Delete team "${t.name}"? This also removes ${t.participant1_name} and ${t.participant2_name}. This cannot be undone.`
    );
    if (!ok) return;
    this.deletingTeamId.set(t.id);
    this.svc.deleteTeam(t.id).subscribe({
      next: () => {
        this.deletingTeamId.set(null);
        // Reload rather than filtering client-side — the backend re-numbers the
        // remaining teams' seeds to stay contiguous, and this picks that up.
        this.load();
      },
      error: err => {
        this.deletingTeamId.set(null);
        this.showToast(err?.error?.error ?? 'Failed to delete team.');
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
        if (this.teams().length > 0) {
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
    // Prevent deletes client-side if tournament not in setup, or teams have already been
    // drawn (manual seeding leaves a tournament in 'setup' with teams formed while
    // awaiting bracket generation — the roster is locked for that window too).
    if (this.tournament()?.status !== 'setup' || this.teams().length > 0) {
      this.showToast('Cannot delete participants after teams have been drawn.');
      return;
    }
    // A pending self-registration is a real row — rejecting it is just deleting it —
    // but the confirmation wording should match what the organizer actually asked for.
    const prompt = p.registration_status === 'pending'
      ? `Reject "${p.name}"'s registration? This cannot be undone.`
      : `Delete participant "${p.name}"? This cannot be undone.`;
    const ok = await confirmService.confirm(prompt);
    if (!ok) return;
    this.svc.deleteParticipant(p.id).subscribe({
      next: () => this.participants.update(list => list.filter(x => x.id !== p.id)),
      error: (err) => this.showToast(err?.error?.error ?? 'Failed to delete participant.'),
    });
  }

  approveParticipant(p: Participant) {
    this.approvingParticipantId.set(p.id);
    this.svc.approveParticipant(p.id).subscribe({
      next: updated => {
        this.approvingParticipantId.set(null);
        this.participants.update(list => list.map(item => item.id === p.id ? { ...item, ...updated } : item));
      },
      error: err => {
        this.approvingParticipantId.set(null);
        this.showToast(err?.error?.error ?? 'Failed to approve participant.');
      },
    });
  }

  async drawTeams() {
    const redrawing = this.teams().length > 0;
    const prompt = redrawing
      ? 'Redraw teams? This will re-shuffle pairings and reset any seed order you\'ve set.'
      : this.isManualSeeding()
        ? 'Draw teams? You\'ll be able to set the final seed order before generating the bracket.'
        : 'Draw teams and start the tournament? This cannot be undone.';
    const ok = await confirmService.confirm(prompt);
    if (!ok) return;
    this.drawing.set(true);
    this.drawError.set('');
    this.svc.drawTeams(this.tournamentId).subscribe({
      next: () => {
        this.drawing.set(false);
        this.showToast(this.isManualSeeding() ? 'Teams drawn — set your seed order below.' : 'Teams drawn! Bracket generated.');
        this.load();
      },
      error: err => {
        this.drawing.set(false);
        this.drawError.set(err?.error?.error ?? 'Failed to draw teams.');
      },
    });
  }

  onSeedDrop(event: CdkDragDrop<Team[]>) {
    const reordered = [...this.teams()];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    const renumbered = reordered.map((t, i) => ({ ...t, seed: i + 1 }));
    const previous = this.teams();
    this.teams.set(renumbered);
    this.svc.reorderTeams(this.tournamentId, renumbered.map(t => t.id)).subscribe({
      error: () => {
        this.teams.set(previous);
        this.showToast('Failed to save new seed order.');
      },
    });
  }

  async confirmGenerateBracket() {
    const ok = await confirmService.confirm('Generate the bracket with the current seed order? This cannot be undone.');
    if (!ok) return;
    this.generatingBracket.set(true);
    this.generateBracketError.set('');
    this.svc.generateBracket(this.tournamentId).subscribe({
      next: () => {
        this.generatingBracket.set(false);
        this.showToast('Bracket generated!');
        this.load();
      },
      error: err => {
        this.generatingBracket.set(false);
        this.generateBracketError.set(err?.error?.error ?? 'Failed to generate bracket.');
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
