// src/app/shared/models/tournament.models.ts

export interface AuditLogEntry {
  id: number;
  created_at: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  tournament_id: number | null;
  tournament_name: string | null;
  actor_user_id: number | null;
  actor_username: string | null;
  actor_email: string | null;
}

export interface AuditLogResponse {
  rows: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface TournamentCapabilities {
  role: 'owner' | 'manager' | 'scorekeeper' | null;
  is_super_admin: boolean;
  can_manage_setup: boolean;
  can_manage_staff: boolean;
  can_score: boolean;
  can_delete: boolean;
  // Freemium participant cap (FEATURE_TRACKER item 12/13 plumbing) — only populated for
  // staff (owner/manager/super_admin); null for a scorekeeper-only role or anonymous view.
  participant_cap: number | null;
  participant_count: number | null;
}

// Summary counts for a tournament list row, so the public list can show progress and a
// champion without fetching each bracket. Only present on GET /tournaments (the list
// endpoint) — never on a single-tournament fetch.
export interface TournamentStats {
  team_count: number;
  // Playable matches only — byes are excluded from both numbers, since they are never
  // played and never complete.
  match_count: number;
  matches_played: number;
  total_rounds: number;
  // Lowest round still holding an unplayed match; null once every match is done (or
  // before a bracket exists).
  current_round: number | null;
  champion_name: string | null;
}

export interface Tournament {
  id: number;
  uuid: string;
  name: string;
  status: 'setup' | 'active' | 'complete';
  visibility: 'public' | 'private';
  seeding_mode: 'automatic' | 'manual';
  team_entry_mode: 'auto_draft' | 'direct';
  // FEATURE_TRACKER item 16. Double elimination is a paid-plan feature and locks once the
  // bracket is generated. Optional so responses predating migration 016 still parse.
  format?: 'single' | 'double';
  created_at: string;
  // FEATURE_TRACKER item 13 plumbing: a per-tournament plan unlock, settable only by a
  // super admin (see TournamentController::update()) until real billing exists.
  paid_override: boolean;
  // Only present via GET /tournaments/deleted (super admin recovery screen) — active
  // tournaments never carry this field.
  deleted_at?: string;
  // Only present when GET /tournaments/:id is called with a valid session — omitted for
  // anonymous public bracket views, and never persisted (always read fresh per request).
  capabilities?: TournamentCapabilities;
  // Only present on the GET /tournaments list response — see TournamentStats.
  stats?: TournamentStats;
}

export interface TournamentMember {
  user_id: number;
  username: string | null;
  email: string | null;
  role: 'owner' | 'manager' | 'scorekeeper';
  global_role: 'super_admin' | 'organizer';
  created_at: string;
}

export interface UserSearchResult {
  id: number;
  username: string;
  email: string;
  role: 'super_admin' | 'organizer';
}

export interface UserAccount {
  id: number;
  username: string;
  email: string;
  role: 'super_admin' | 'organizer';
  status: 'active' | 'disabled';
  // FEATURE_TRACKER item 12 plumbing: account-level plan, settable only by a super admin
  // until real billing exists.
  plan: 'free' | 'paid';
  created_at?: string;
}

export interface Participant {
  id: number;
  tournament_id: number;
  name: string;
  registration_status?: 'approved' | 'pending';
  email?: string | null;
  notification_lifecycle?: 'none' | 'pending' | 'confirmed' | 'suppressed';
  notify_match_completed?: boolean;
  notify_round_completed?: boolean;
  notify_tournament_finalized?: boolean;
}

export interface NotificationPreferences {
  email: string;
  tournament_name: string;
  categories: {
    match_completed: boolean;
    round_completed: boolean;
    tournament_finalized: boolean;
  };
}

export interface Team {
  id: number;
  tournament_id: number;
  name: string;
  participant1_id: number;
  participant2_id: number;
  participant1_name: string;
  participant2_name: string;
  seed: number;
}

export interface Match {
  id: number;
  tournament_id: number;
  round: number;
  match_number: number;
  team1_id: number | null;
  team2_id: number | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_id: number | null;
  next_match_id: number | null;
  next_match_slot: 1 | 2 | null;
  // FEATURE_TRACKER item 16. Optional so responses predating migration 016 still parse;
  // absent means a single-elimination match, i.e. bracket_side 'winners' with no loser edge.
  loser_match_id?: number | null;
  loser_match_slot?: 1 | 2 | null;
  bracket_side?: 'winners' | 'losers' | 'grand_final';
  is_reset?: 0 | 1;
  status: 'pending' | 'ready' | 'complete' | 'bye';
  team1_name: string | null;
  team2_name: string | null;
  winner_name: string | null;
  team1_participant1_name: string | null;
  team1_participant2_name: string | null;
  team2_participant1_name: string | null;
  team2_participant2_name: string | null;
}

export interface BracketRound {
  /** Structural round number within the side. Can start above 1 in a losers bracket whose
   *  first round collapsed away, so render by position rather than by this value. */
  round: number;
  matches: Match[];
}

export interface BracketSide {
  side: 'winners' | 'losers' | 'grand_final';
  rounds: BracketRound[];
}

export interface BracketData {
  format: 'single' | 'double';
  /** Ordered winners → losers → grand final. Single elimination has only `winners`. */
  sides: BracketSide[];
  /** Legacy grouping, present only for single elimination. Kept so a client cached before
   *  the two-tree response existed still renders; new code should read `sides`. */
  rounds?: { [round: number]: Match[] };
}
