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

export interface Tournament {
  id: number;
  uuid: string;
  name: string;
  status: 'setup' | 'active' | 'complete';
  visibility: 'public' | 'private';
  seeding_mode: 'automatic' | 'manual';
  team_entry_mode: 'auto_draft' | 'direct';
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
  status: 'pending' | 'ready' | 'complete' | 'bye';
  team1_name: string | null;
  team2_name: string | null;
  winner_name: string | null;
  team1_participant1_name: string | null;
  team1_participant2_name: string | null;
  team2_participant1_name: string | null;
  team2_participant2_name: string | null;
}

export interface BracketData {
  rounds: { [round: number]: Match[] };
}
