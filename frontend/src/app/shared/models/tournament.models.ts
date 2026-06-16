// src/app/shared/models/tournament.models.ts

export interface Tournament {
  id: number;
  name: string;
  status: 'setup' | 'active' | 'complete';
  created_at: string;
}

export interface Participant {
  id: number;
  tournament_id: number;
  name: string;
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
}

export interface BracketData {
  rounds: { [round: number]: Match[] };
}
