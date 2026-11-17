// src/app/admin/tournament-manage.component.ts
import { Component, OnInit, signal, computed, ElementRef, ViewChild, HostListener } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { confirmService } from '../shared/services/confirm.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { TournamentService } from '../shared/services/tournament.service';
import { AuthService } from '../shared/services/auth.service';
import { BillingService } from '../shared/services/billing.service';
import { championName } from '../shared/bracket-labels';
import { parseNameList } from '../shared/name-list';
import { Tournament, Participant, Team, TournamentMember, UserSearchResult, BillingStatus, PoolData, Sponsor } from '../shared/models/tournament.models';
import { PoolStandingsComponent } from '../shared/components/pool-standings.component';
import { BOARD_WORDS, BoardLabel, boardWord } from '../shared/board-labels';
import { GHOST_RULES, GHOST_RULE_MAX_TEXT, GhostRule, soloRuleFor } from '../shared/solo-team';
import { environment } from '../../environments/environment';
import * as QRCode from 'qrcode';

interface SetupStep {
  label: string;
  detail: string;
  state: 'done' | 'current' | 'todo';
}

@Component({
  selector: 'app-tournament-manage',
  standalone: true,
  imports: [RouterLink, FormsModule, DragDropModule, NgTemplateOutlet, PoolStandingsComponent],
  templateUrl: './tournament-manage.component.html',
  styleUrl: './tournament-manage.component.css'
})
export class TournamentManageComponent implements OnInit {
  tournament = signal<Tournament | null>(null);
  participants = signal<Participant[]>([]);
  teams = signal<Team[]>([]);
  champion = signal<string | null>(null);
  canManageSetup = computed(() => this.tournament()?.capabilities?.can_manage_setup ?? false);
  canScore = computed(() => this.tournament()?.capabilities?.can_score ?? false);
  canDelete = computed(() => this.tournament()?.capabilities?.can_delete ?? false);
  isSuperAdmin = computed(() => this.tournament()?.capabilities?.is_super_admin ?? false);
  // Freemium participant cap (FEATURE_TRACKER item 12/13 plumbing) — null for a
  // scorekeeper-only role, since the backend only computes it for staff who manage setup.
  participantCap = computed(() => this.tournament()?.capabilities?.participant_cap ?? null);
  participantCount = computed(() => this.tournament()?.capabilities?.participant_count ?? null);
  paidOverrideBusy = signal(false);
  // Stripe billing (FEATURE_TRACKER item 13). Null until /billing/status answers, and left
  // null on error — every check below treats that as "nothing to sell", so a billing
  // outage costs the organizer an upgrade button rather than the whole manage screen.
  billingStatus = signal<BillingStatus | null>(null);
  unlockBusy = signal(false);
  // Owner (or super admin) only, since this spends money; hidden once the tournament is
  // already upgraded, however that happened, and whenever the install cannot sell.
  canBuyUnlock = computed(() =>
    !!this.billingStatus()?.billing_enabled &&
    !!this.billingStatus()?.offers.tournament_unlock &&
    (this.tournament()?.capabilities?.can_manage_staff ?? false) &&
    !this.tournament()?.paid_override
  );
  deletingTournament = signal(false);
  actionsMenuOpen = signal(false);
  approvedParticipants = computed(() => this.participants().filter(p => p.registration_status !== 'pending'));
  pendingParticipants = computed(() => this.participants().filter(p => p.registration_status === 'pending'));
  // Self sign-ups waiting on approval sort first, so they are the first thing an organizer
  // sees in the list; the setup checklist already says how many there are.
  rosterInOrder = computed(() => [...this.pendingParticipants(), ...this.approvedParticipants()]);
  // Once teams exist the team list is the only roster on the page; a player's name and
  // email are corrected from inside their team's row, so this looks them up by id.
  participantById = computed(() => new Map(this.participants().map(p => [p.id, p])));
  // One line standing in for the four setup choices, all of which were already made on
  // the create form. The controls live behind it, folded away.
  settingsSummary = computed(() => {
    const t = this.tournament();
    if (!t) return '';
    const entry = t.team_entry_mode === 'direct' ? 'Entered teams' : (t.draw_mode === 'balanced' ? 'Balanced blind draw' : 'Blind draw');
    const seeding = t.seeding_mode === 'manual' ? 'Manual seeding' : t.seeding_mode === 'pool_play' ? 'Pool play' : 'Automatic seeding';
    const format = t.format === 'double' ? 'Double elimination' : 'Single elimination';
    const n = t.boards ?? 0;
    const w = this.word();
    const boards = n ? `${n} ${(n === 1 ? w.one : w.many).toLowerCase()}` : `No ${w.one.toLowerCase()} assignments`;
    return [entry, seeding, format, boards].join(' · ');
  });
  openTeamId: number | null = null;
  isManualSeeding = computed(() => this.tournament()?.seeding_mode === 'manual');
  isPoolPlay = computed(() => this.tournament()?.seeding_mode === 'pool_play');
  // Pool play (FEATURE_TRACKER item 18). Loaded with the bracket once the tournament is live;
  // null for every other seeding mode.
  pool = signal<PoolData | null>(null);
  startingPool = signal(false);
  seedingError = signal('');
  readonly poolGameChoices = [2, 3, 4, 5];
  // Mirrors BoardQueue::MAX_BOARDS in the API.
  readonly boardWords = BOARD_WORDS;
  word = computed(() => boardWord(this.tournament()?.board_label));
  readonly boardChoices = Array.from({ length: 24 }, (_, i) => i + 1);
  isDirectEntry = computed(() => this.tournament()?.team_entry_mode === 'direct');
  // Balanced (A/B) draw: api/lib/BlindDraw.php. Off unless the organizer opens Advanced.
  isBalancedDraw = computed(() => this.tournament()?.draw_mode === 'balanced');
  drawModeBusy = signal(false);
  pairingPhrase = computed(() => this.isBalancedDraw() ? 'pair each A player with a random B' : 'randomly pair players into teams');
  groupingParticipantId = signal<number | null>(null);
  groupCounts = computed(() => {
    const a = this.approvedParticipants().filter(p => p.draw_group === 'A').length;
    const b = this.approvedParticipants().length - a;
    return { a, b, extra: Math.abs(a - b) };
  });

  // The setup sequence is a different length depending on the two modes: auto-draft with
  // automatic seeding is two steps (the draw seeds and starts the tournament in one go),
  // while manual seeding or direct entry adds an explicit generate-the-bracket step.
  // Only ever rendered while status is 'setup', so the final step is never 'done' here —
  // completing it is what ends the setup phase and removes this list from the page.
  setupSteps = computed<SetupStep[]>(() => {
    if (!this.tournament()) return [];

    const direct = this.isDirectEntry();
    const manual = this.isManualSeeding();
    const poolPlay = this.isPoolPlay();
    const teamsDrawn = this.teams().length > 0;
    const pending = this.pendingParticipants().length;

    const steps: Array<{ label: string; detail: string; done: boolean }> = [];

    if (direct) {
      steps.push({
        label: 'Add your teams',
        detail: 'Give each team a name and both members. Two teams minimum.',
        done: this.teams().length >= 2,
      });
    } else {
      steps.push({
        label: 'Add your players',
        detail: pending > 0
          ? `${pending} self sign-up${pending === 1 ? '' : 's'} waiting on your approval below.`
          : 'Paste a list of names, or share the sign-up link. Three or more; with an odd number, one plays solo.',
        done: teamsDrawn,
      });
      steps.push({
        label: 'Draw the teams',
        detail: manual
          ? 'Randomly pairs your players into teams. You set the seed order afterwards.'
          : poolPlay
            ? 'Randomly pairs your players into teams and starts pool play.'
            : 'Randomly pairs and seeds your players, builds the bracket, and starts play — all at once.',
        done: teamsDrawn,
      });
    }

    if (poolPlay) {
      if (direct) {
        steps.push({
          label: 'Start pool play',
          detail: `Schedules ${this.tournament()?.pool_games ?? 3} pool games per team and puts the tournament live.`,
          done: false,
        });
      }
      steps.push({
        label: 'Play the pool, then generate the bracket',
        detail: 'Enter pool scores as games finish. The standings set the seeds.',
        done: false,
      });
    } else if (direct || manual) {
      steps.push({
        label: manual ? 'Set the seed order, then generate' : 'Generate the bracket',
        detail: manual
          ? 'Drag teams into the order you want, then generate the bracket to start play.'
          : 'Builds the bracket from your teams and starts play.',
        done: false,
      });
    }

    const firstUndone = steps.findIndex(s => !s.done);
    return steps.map((s, i) => ({
      label: s.label,
      detail: s.detail,
      state: s.done ? 'done' : (i === firstUndone ? 'current' : 'todo'),
    }));
  });
  approvingParticipantId = signal<number | null>(null);
  visibilityBusy = signal(false);
  seedingModeBusy = signal(false);
  teamEntryModeBusy = signal(false);
  boardsBusy = signal(false);
  boardsError = signal('');
  formatBusy = signal(false);
  formatError = signal('');

  loading = signal(true);
  loadError = signal('');
  adding = signal(false);
  drawing = signal(false);
  generatingBracket = signal(false);
  addError = signal('');
  drawError = signal('');
  generateBracketError = signal('');
  toast = signal('');
  toastKind = signal<'success' | 'error'>('success');

  newParticipant = '';
  // Fast blind-draw setup. Paste mode is the default while the roster is empty (set in
  // load()), since pasting a sign-up sheet is the quickest way from nothing to a draw;
  // organizers adding a straggler to an existing roster get the single-name box.
  pasteMode = signal(false);
  private pasteModeChosen = false;
  pasteText = signal('');
  pastePreview = computed(() => parseNameList(this.pasteText(), this.participants().map(p => p.name)));
  pasteRosterAfter = computed(() => this.approvedParticipants().length + this.pastePreview().names.length);
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

  // QR codes. Two of them, pointing at different places: 'registration' is the sign-me-up
  // link (auto-draft tournaments still in setup), 'bracket' is the watch-along link that
  // needs no account and stays useful for the whole event. null means the modal is closed.
  qrKind = signal<'registration' | 'bracket' | null>(null);
  @ViewChild('qrCanvas') qrCanvasRef?: ElementRef<HTMLCanvasElement>;

  constructor(private route: ActivatedRoute, private svc: TournamentService, private router: Router, private auth: AuthService, private billing: BillingService) {}

  ngOnInit() {
    this.tournamentId = +this.route.snapshot.paramMap.get('id')!;
    this.load();
    this.loadBillingStatus();

    // Returning from Stripe Checkout. The redirect and Stripe's webhook race each other, so
    // reconcile explicitly rather than assuming the webhook already landed — otherwise an
    // organizer who has just paid comes back to an unchanged page.
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (sessionId) {
      this.confirmCheckoutReturn(sessionId);
    } else if (this.route.snapshot.queryParamMap.get('checkout') === 'cancelled') {
      this.showToast('Checkout cancelled — nothing was charged.');
      this.clearCheckoutQueryParams();
    }
  }

  private loadBillingStatus() {
    this.billing.getStatus().subscribe({
      // Left null on failure, which reads as "nothing to sell" everywhere it is checked.
      next: s => this.billingStatus.set(s),
      error: () => this.billingStatus.set(null),
    });
  }

  private confirmCheckoutReturn(sessionId: string) {
    this.billing.confirm(sessionId).subscribe({
      next: result => {
        this.showToast(
          result.status === 'paid'
            ? 'Payment received — this tournament is upgraded.'
            : "Payment is still processing. The upgrade will apply as soon as it clears.",
        );
        this.clearCheckoutQueryParams();
        // Reload so the participant cap badge reflects the new ceiling immediately.
        this.load();
      },
      error: () => {
        // The webhook remains the source of truth, so a failed reconcile is not a failed
        // payment; say the honest thing rather than implying the money went nowhere.
        this.showToast('Payment is still processing. Refresh in a moment.');
        this.clearCheckoutQueryParams();
        this.load();
      },
    });
  }

  /** Drops ?session_id= so a refresh doesn't re-reconcile an already-spent session. */
  private clearCheckoutQueryParams() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  // FEATURE_TRACKER item 13: the one-time per-tournament unlock. Sends the browser to
  // Stripe's hosted checkout; no card details ever touch this app.
  buyTournamentUnlock() {
    this.unlockBusy.set(true);
    this.billing.startTournamentUnlockCheckout(this.tournamentId).subscribe({
      next: session => this.billing.redirectTo(session.url),
      error: err => {
        this.unlockBusy.set(false);
        this.showToast(err?.error?.error ?? 'Could not start checkout. Please try again.', 'error');
      },
    });
  }

  load() {
    this.svc.getTournament(this.tournamentId).subscribe({
      next: t => {
        this.tournament.set(t);
        // Always load participants so names can be edited at any time
        this.svc.getParticipants(this.tournamentId).subscribe(p => {
          this.participants.set(p);
          if (!this.pasteModeChosen) {
            this.pasteModeChosen = true;
            this.pasteMode.set(p.length === 0);
          }
        });

        // Always load teams too — manual seeding leaves a tournament in 'setup' with
        // teams already formed while awaiting bracket generation, so this can no longer
        // be gated on status !== 'setup'.
        this.svc.getTeams(this.tournamentId).subscribe(teams => this.teams.set(teams));
        if (t.status === 'complete' || (t.status === 'active' && t.seeding_mode === 'pool_play')) {
          this.svc.getBracket(this.tournamentId).subscribe(data => {
            this.pool.set(data.pool ?? null);
            if (t.status === 'complete') this.champion.set(championName(data));
          });
        } else {
          this.pool.set(null);
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
        this.showToast('Failed to update visibility.', 'error');
      },
    });
  }

  // The super admin's manual lever, kept alongside Stripe rather than replaced by it: it
  // comps an account, and covers an install with no payment keys at all. A grant made here
  // is recorded as 'manual', so a later Stripe refund can never revoke it.
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
        this.showToast(err?.error?.error ?? 'Failed to update plan override.', 'error');
      },
    });
  }

  toggleActionsMenu() {
    this.actionsMenuOpen.update(open => !open);
  }

  @ViewChild('actionsTrigger') actionsTriggerRef?: ElementRef<HTMLButtonElement>;

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.actionsMenuOpen()) {
      this.closeActionsMenu();
      this.actionsTriggerRef?.nativeElement.focus();
    } else if (this.qrKind()) {
      this.closeQrModal();
    }
  }

  closeActionsMenu() {
    this.actionsMenuOpen.set(false);
  }

  async deleteTournamentAction() {
    const t = this.tournament();
    if (!t) return;
    const ok = await confirmService.confirm(`Delete "${t.name}"? A super admin can restore it later from Deleted tournaments.`);
    if (!ok) return;
    this.deletingTournament.set(true);
    this.svc.deleteTournament(this.tournamentId).subscribe({
      next: () => this.router.navigate(['/admin']),
      error: (err) => {
        this.deletingTournament.set(false);
        this.showToast(err?.error?.error ?? 'Failed to delete tournament.', 'error');
      },
    });
  }

  updateSeedingMode(mode: 'automatic' | 'manual' | 'pool_play') {
    if (this.tournament()?.seeding_mode === mode) return;
    this.saveSeeding({ seeding_mode: mode });
  }

  updatePoolGames(games: number) {
    if ((this.tournament()?.pool_games ?? 3) === games) return;
    this.saveSeeding({ pool_games: games });
  }

  private saveSeeding(change: Partial<Tournament>) {
    this.seedingModeBusy.set(true);
    this.seedingError.set('');
    this.svc.updateTournament(this.tournamentId, change).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.seedingModeBusy.set(false);
      },
      error: err => {
        this.seedingModeBusy.set(false);
        // A plan gate explains itself better than a generic failure. Re-set the tournament
        // so the select snaps back to what the server actually holds.
        this.seedingError.set(err?.error?.error ?? 'Failed to update seeding.');
        const t = this.tournament();
        if (t) this.tournament.set({ ...t });
      },
    });
  }

  async confirmStartPool() {
    const games = this.tournament()?.pool_games ?? 3;
    const ok = await confirmService.confirm(`Start pool play? Every team plays ${games} pool games, and teams are locked in.`);
    if (!ok) return;
    this.startingPool.set(true);
    this.generateBracketError.set('');
    this.svc.startPool(this.tournamentId).subscribe({
      next: () => {
        this.startingPool.set(false);
        this.showToast('Pool play started!');
        this.load();
      },
      error: err => {
        this.startingPool.set(false);
        this.generateBracketError.set(err?.error?.error ?? 'Failed to start pool play.');
      },
    });
  }

  // Unlike the account-plan check on the create form, a tournament can also be unlocked by
  // a super-admin-granted paid_override, so this asks the tournament rather than the user.
  // Pool play and double elimination share one gate: either paid lever (item 12 or 13).
  canUsePaidFeatures(): boolean {
    return this.canUseDoubleElimination();
  }

  canUseDoubleElimination(): boolean {
    return this.auth.isPaidPlan() || !!this.tournament()?.paid_override;
  }

  updateFormat(format: 'single' | 'double') {
    if ((this.tournament()?.format || 'single') === format) return;
    this.formatBusy.set(true);
    this.formatError.set('');
    this.svc.updateTournament(this.tournamentId, { format }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.formatBusy.set(false);
      },
      error: err => {
        this.formatBusy.set(false);
        this.formatError.set(err?.error?.error || 'Failed to update tournament format.');
      },
    });
  }

  updateBoards(boards: number) {
    if ((this.tournament()?.boards ?? 0) === boards) return;
    this.boardsBusy.set(true);
    this.boardsError.set('');
    this.svc.updateTournament(this.tournamentId, { boards }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.boardsBusy.set(false);
        const w = this.word();
        this.showToast(boards
          ? `Using ${boards} ${(boards === 1 ? w.one : w.many).toLowerCase()}.`
          : `${w.one} assignments off.`);
      },
      error: err => {
        this.boardsBusy.set(false);
        this.boardsError.set(err?.error?.error || 'Failed to update boards.');
        const t = this.tournament();
        if (t) this.tournament.set({ ...t });
      },
    });
  }

  updateBoardLabel(label: BoardLabel) {
    if (this.word().value === label) return;
    this.boardsBusy.set(true);
    this.boardsError.set('');
    this.svc.updateTournament(this.tournamentId, { board_label: label }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.boardsBusy.set(false);
      },
      error: err => {
        this.boardsBusy.set(false);
        this.boardsError.set(err?.error?.error || 'Failed to update.');
        const t = this.tournament();
        if (t) this.tournament.set({ ...t });
      },
    });
  }

  // ── Sponsor logos (FEATURE_TRACKER item 20) ───────────────────────────────────────
  // Pro to add; editing, reordering and removing stay open on any plan. Loaded the first time
  // the fold opens, since most organizers never will. The server checks every upload's bytes;
  // the checks here only save a round trip on an obviously wrong file.
  static readonly SPONSOR_MAX_BYTES = 1048576;
  static readonly SPONSOR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  readonly maxSponsors = 8;
  sponsors = signal<Sponsor[]>([]);
  sponsorsLoaded = signal(false);
  sponsorName = '';
  sponsorUrl = '';
  sponsorImage = signal<string | null>(null);
  sponsorFileName = signal('');
  sponsorBusy = signal(false);
  sponsorError = signal('');
  editingSponsorId: number | null = null;
  editingSponsorUrl = '';
  sponsorsSummary = computed(() => {
    if (!this.sponsorsLoaded()) return this.canUsePaidFeatures() ? 'Logos on the bracket and TV' : 'Pro';
    const n = this.sponsors().length;
    return n ? `${n} logo${n === 1 ? '' : 's'}` : 'None yet';
  });

  onSponsorsToggle(open: boolean) {
    if (!open || this.sponsorsLoaded()) return;
    this.svc.getSponsors(this.tournamentId).subscribe({
      next: list => { this.sponsors.set(list); this.sponsorsLoaded.set(true); },
      error: () => this.showToast('Could not load the sponsors.', 'error'),
    });
  }

  sponsorSrc(s: Sponsor): string {
    return `${environment.apiUrl}/${s.image_url}`;
  }

  onSponsorFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.sponsorError.set('');
    this.sponsorImage.set(null);
    this.sponsorFileName.set('');
    if (!file) return;
    if (!TournamentManageComponent.SPONSOR_TYPES.includes(file.type)) {
      this.sponsorError.set('Use a PNG, JPEG or WebP image.');
      input.value = '';
      return;
    }
    if (file.size > TournamentManageComponent.SPONSOR_MAX_BYTES) {
      this.sponsorError.set('That image is over 1 MB. Use a smaller logo.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.sponsorImage.set(reader.result as string);
      this.sponsorFileName.set(file.name);
    };
    reader.readAsDataURL(file);
  }

  addSponsor() {
    const image = this.sponsorImage();
    const name = this.sponsorName.trim();
    if (!image || !name) return;
    this.sponsorBusy.set(true);
    this.sponsorError.set('');
    this.svc.addSponsor(this.tournamentId, name, this.sponsorUrl.trim(), image).subscribe({
      next: list => {
        this.sponsors.set(list);
        this.sponsorBusy.set(false);
        this.sponsorName = '';
        this.sponsorUrl = '';
        this.sponsorImage.set(null);
        this.sponsorFileName.set('');
        this.showToast(`Added ${name}.`);
      },
      error: err => {
        this.sponsorBusy.set(false);
        this.sponsorError.set(err?.error?.error || 'Failed to add the logo.');
      },
    });
  }

  moveSponsor(s: Sponsor, by: -1 | 1) {
    const list = [...this.sponsors()];
    const i = list.findIndex(x => x.id === s.id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.sponsors.set(list);
    this.svc.reorderSponsors(this.tournamentId, list.map(x => x.id)).subscribe({
      next: saved => this.sponsors.set(saved),
      error: () => this.showToast('Failed to reorder the logos.', 'error'),
    });
  }

  startEditSponsor(s: Sponsor) {
    this.editingSponsorId = s.id;
    this.editingSponsorUrl = s.url ?? '';
  }

  saveSponsorUrl(s: Sponsor) {
    this.svc.updateSponsor(s.id, { url: this.editingSponsorUrl.trim() || null }).subscribe({
      next: list => { this.sponsors.set(list); this.editingSponsorId = null; this.showToast('Link saved.'); },
      error: err => this.showToast(err?.error?.error || 'Failed to save the link.', 'error'),
    });
  }

  async removeSponsor(s: Sponsor) {
    if (!(await confirmService.confirm(`Remove ${s.name}'s logo from the bracket and TV?`))) return;
    this.svc.deleteSponsor(s.id).subscribe({
      next: list => { this.sponsors.set(list); this.showToast(`Removed ${s.name}.`); },
      error: () => this.showToast('Failed to remove the logo.', 'error'),
    });
  }

  // ── Odd player out (FEATURE_TRACKER item 19) ──────────────────────────────────────
  // An odd field draws anyway: the odd player out gets a ghost partner, a team of one. The
  // rule for how that team plays is set where the organizer meets it, in the draw box and
  // on the solo team, rather than among the settings. Walking is free; the rest are Pro.
  readonly ghostRules = GHOST_RULES;
  readonly ghostRuleMaxText = GHOST_RULE_MAX_TEXT;
  oddField = computed(() => this.approvedParticipants().length % 2 === 1);
  /** Three is the floor: two teams, one of them solo. */
  canDrawField = computed(() => this.approvedParticipants().length >= 3);
  drawTeamCount = computed(() => Math.ceil(this.approvedParticipants().length / 2));
  ghostRule = computed<GhostRule>(() => this.tournament()?.ghost_rule ?? 'walk');
  /** The select's value: a picked `custom` waits here until its text is saved. */
  ghostRuleDraft = signal<GhostRule | null>(null);
  ghostRuleText = '';
  ghostRuleBusy = signal(false);
  oddDrawSentence = computed(() => soloRuleFor(this.tournament(), ['One player']));
  partnerName = '';
  addingPartner = signal(false);

  isSolo(t: Team): boolean {
    return t.participant2_id == null;
  }

  soloSentence(t: Team): string {
    return soloRuleFor(this.tournament(), [t.participant1_name]);
  }

  onGhostRuleChange(rule: GhostRule) {
    if (rule === 'custom') {
      this.ghostRuleDraft.set('custom');
      this.ghostRuleText = this.tournament()?.ghost_rule_text ?? '';
      return;
    }
    this.ghostRuleDraft.set(null);
    this.saveGhostRule(rule);
  }

  saveGhostRule(rule: GhostRule, text?: string) {
    this.ghostRuleBusy.set(true);
    this.svc.updateTournament(this.tournamentId, { ghost_rule: rule, ghost_rule_text: text ?? null }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.ghostRuleDraft.set(null);
        this.ghostRuleBusy.set(false);
        this.showToast('Solo rule saved.');
      },
      error: err => {
        this.ghostRuleBusy.set(false);
        this.showToast(err?.error?.error || 'Failed to save the solo rule.', 'error');
        this.ghostRuleDraft.set(null);
        const t = this.tournament();
        if (t) this.tournament.set({ ...t }); // re-sync the select
      },
    });
  }

  /** Swap a latecomer in for the ghost, until the solo team's first game is scored. */
  addPartner(t: Team) {
    const name = this.partnerName.trim();
    if (!name) return;
    this.addingPartner.set(true);
    this.svc.addTeamPartner(t.id, name).subscribe({
      next: () => {
        this.addingPartner.set(false);
        this.partnerName = '';
        this.showToast(`${name} joined ${t.participant1_name}.`);
        this.load();
      },
      error: err => {
        this.addingPartner.set(false);
        this.showToast(err?.error?.error || 'Failed to add the player.', 'error');
      },
    });
  }

  updateDrawMode(mode: 'random' | 'balanced') {
    if ((this.tournament()?.draw_mode ?? 'random') === mode) return;
    this.drawModeBusy.set(true);
    this.svc.updateTournament(this.tournamentId, { draw_mode: mode }).subscribe({
      next: updated => {
        this.tournament.set(updated);
        this.drawModeBusy.set(false);
      },
      error: err => {
        this.drawModeBusy.set(false);
        this.showToast(err?.error?.error || 'Failed to update the draw.', 'error');
        const t = this.tournament();
        if (t) this.tournament.set({ ...t }); // re-sync the checkbox
      },
    });
  }

  toggleDrawGroup(p: Participant) {
    const group = p.draw_group === 'A' ? 'B' : 'A';
    this.groupingParticipantId.set(p.id);
    this.svc.setParticipantDrawGroup(p.id, group).subscribe({
      next: () => {
        this.participants.update(list => list.map(x => x.id === p.id ? { ...x, draw_group: group } : x));
        this.groupingParticipantId.set(null);
      },
      error: err => {
        this.groupingParticipantId.set(null);
        this.showToast(err?.error?.error || 'Failed to change the group.', 'error');
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
        this.showToast('Failed to update team entry mode.', 'error');
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
      () => this.showToast('Could not copy link.', 'error'),
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
      () => this.showToast('Could not copy link.', 'error'),
    );
  }

  private bracketUrl(): string | null {
    const uuid = this.tournament()?.uuid;
    if (!uuid) return null;
    // The uuid form, not the numeric id: this is what gets handed to people with no
    // account, and it's the only form that works for a private tournament.
    return `${location.origin}${environment.baseHref}bracket/${uuid}`;
  }

  qrUrl(): string {
    const kind = this.qrKind();
    if (!kind) return '';
    return (kind === 'bracket' ? this.bracketUrl() : this.registrationUrl()) ?? '';
  }

  openQrModal(kind: 'registration' | 'bracket') {
    const url = kind === 'bracket' ? this.bracketUrl() : this.registrationUrl();
    if (!url) return;
    this.qrKind.set(kind);
    // Wait a tick for the @if-gated <canvas> to actually exist in the DOM.
    setTimeout(() => {
      const canvas = this.qrCanvasRef?.nativeElement;
      if (!canvas) return;
      QRCode.toCanvas(canvas, url, { width: 240, margin: 2 }, err => {
        if (err) this.showToast('Could not generate QR code.', 'error');
      });
    });
  }

  closeQrModal() {
    this.qrKind.set(null);
  }

  // New tab rather than in-place: the print dialog fires on load there, and the organizer
  // keeps this page exactly where they left it.
  openPoster() {
    const uuid = this.tournament()?.uuid;
    const kind = this.qrKind();
    if (!uuid || !kind) return;
    // The poster route names the sign-up variant after its own route segment
    // ('register'), where this modal calls it 'registration'.
    const posterKind = kind === 'bracket' ? 'bracket' : 'register';
    window.open(`${location.origin}${environment.baseHref}poster/${uuid}/${posterKind}`, '_blank');
  }

  copyQrLink() {
    const url = this.qrUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => this.showToast('Link copied!'),
      () => this.showToast('Could not copy link.', 'error'),
    );
  }

  downloadQrCode() {
    const canvas = this.qrCanvasRef?.nativeElement;
    if (!canvas) return;
    const link = document.createElement('a');
    const name = (this.tournament()?.name ?? 'tournament').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    link.download = `${name}-${this.qrKind() ?? 'qr'}-qr.png`;
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

  addPastedParticipants() {
    if (this.pastePreview().names.length === 0) return;
    this.adding.set(true);
    this.addError.set('');
    this.svc.addParticipantsBulk(this.tournamentId, this.pasteText()).subscribe({
      next: r => {
        this.adding.set(false);
        this.pasteText.set('');
        const skipped = r.skipped_duplicates.length + r.skipped_too_long;
        this.showToast(`Added ${r.added.length} player${r.added.length === 1 ? '' : 's'}.`
          + (skipped ? ` Skipped ${skipped} already listed or too long.` : ''));
        // Reload rather than splice in: the participant/cap badge in the header comes from
        // the tournament's capabilities, which only the server can recount.
        this.load();
      },
      error: err => {
        this.adding.set(false);
        this.addError.set(err?.error?.error ?? 'Failed to add players.');
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
        this.showToast(err?.error?.error ?? 'Failed to delete team.', 'error');
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
              this.showToast('Failed to update notification email.', 'error');
              this.savingParticipantId.set(null);
            },
          });
        } else {
          this.savingParticipantId.set(null);
        }
        this.cancelEditParticipant();
      },
      error: () => {
        this.showToast('Failed to update participant.', 'error');
        this.savingParticipantId.set(null);
      },
    });
  }

  async deleteParticipant(p: Participant) {
    // Prevent deletes client-side if tournament not in setup, or teams have already been
    // drawn (manual seeding leaves a tournament in 'setup' with teams formed while
    // awaiting bracket generation — the roster is locked for that window too).
    if (this.tournament()?.status !== 'setup' || this.teams().length > 0) {
      this.showToast('Cannot delete participants after teams have been drawn.', 'error');
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
      error: (err) => this.showToast(err?.error?.error ?? 'Failed to delete participant.', 'error'),
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
        this.showToast(err?.error?.error ?? 'Failed to approve participant.', 'error');
      },
    });
  }

  async drawTeams() {
    const redrawing = this.teams().length > 0;
    const prompt = redrawing
      ? 'Redraw teams? This will re-shuffle pairings and reset any seed order you\'ve set.'
      : this.isManualSeeding()
        ? 'Draw teams? You\'ll be able to set the final seed order before generating the bracket.'
        : this.isPoolPlay()
          ? `Draw teams and start pool play? Every team plays ${this.tournament()?.pool_games ?? 3} pool games. This cannot be undone.`
          : 'Draw teams and start the tournament? This cannot be undone.';
    const odd = this.oddField();
    const ok = await confirmService.confirm(odd ? `${prompt} With an odd number, one player is drawn to play solo.` : prompt);
    if (!ok) return;
    this.drawing.set(true);
    this.drawError.set('');
    this.svc.drawTeams(this.tournamentId, odd).subscribe({
      next: () => {
        this.drawing.set(false);
        this.showToast(this.isManualSeeding() ? 'Teams drawn — set your seed order below.'
          : this.isPoolPlay() ? 'Teams drawn! Pool play has started.' : 'Teams drawn! Bracket generated.');
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
        this.showToast('Failed to save new seed order.', 'error');
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

  // A team row opens into a small panel: the team's name, its two players, and (for an
  // entered team still in setup) removal. Only one is open at a time.
  toggleTeam(t: Team) {
    if (this.openTeamId === t.id) {
      this.openTeamId = null;
      this.cancelEditTeam();
      this.cancelEditParticipant();
    } else {
      this.openTeamId = t.id;
      this.cancelEditParticipant();
      this.startEditTeam(t);
      this.partnerName = '';
    }
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
        this.showToast('Team name saved.');
      },
      error: () => this.showToast('Failed to update team.', 'error'),
    });
  }

  private showToast(msg: string, kind: 'success' | 'error' = 'success') {
    this.toastKind.set(kind);
    this.toast.set(msg);
    setTimeout(() => this.toast.set(''), 2500);
  }
}
