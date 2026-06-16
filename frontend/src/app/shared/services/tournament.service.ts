// src/app/shared/services/tournament.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Tournament, Participant, Team, BracketData } from '../models/tournament.models';

@Injectable({ providedIn: 'root' })
export class TournamentService {
  private api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Tournaments
  getTournaments() {
    return this.http.get<Tournament[]>(`${this.api}/tournaments`);
  }

  getTournament(id: number) {
    return this.http.get<Tournament>(`${this.api}/tournaments/${id}`);
  }

  createTournament(name: string) {
    return this.http.post<Tournament>(`${this.api}/tournaments`, { name });
  }

  updateTournament(id: number, data: Partial<Tournament>) {
    return this.http.put<Tournament>(`${this.api}/tournaments/${id}`, data);
  }

  deleteTournament(id: number) {
    return this.http.delete(`${this.api}/tournaments/${id}`);
  }

  // Participants
  getParticipants(tournamentId: number) {
    return this.http.get<Participant[]>(`${this.api}/participants/${tournamentId}`);
  }

  addParticipant(tournamentId: number, name: string) {
    return this.http.post<Participant>(`${this.api}/participants`, { tournament_id: tournamentId, name });
  }

  deleteParticipant(id: number) {
    return this.http.delete(`${this.api}/participants/${id}`);
  }

  // Teams
  getTeams(tournamentId: number) {
    return this.http.get<Team[]>(`${this.api}/teams/${tournamentId}`);
  }

  drawTeams(tournamentId: number) {
    return this.http.post<Team[]>(`${this.api}/teams`, { tournament_id: tournamentId });
  }

  // Bracket / Matches
  getBracket(tournamentId: number) {
    return this.http.get<BracketData>(`${this.api}/matches/${tournamentId}`);
  }

  updateScore(matchId: number, team1Score: number, team2Score: number) {
    return this.http.put(`${this.api}/matches/${matchId}`, { team1_score: team1Score, team2_score: team2Score });
  }
}
