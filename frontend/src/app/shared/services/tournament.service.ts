// src/app/shared/services/tournament.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Tournament, Participant, Team, BracketData, TournamentMember, UserAccount } from '../models/tournament.models';

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

  getTournamentMembers(tournamentId: number) {
    return this.http.get<TournamentMember[]>(`${this.api}/tournament-members/${tournamentId}`);
  }

  addTournamentMember(tournamentId: number, userId: number, role: 'manager' | 'scorekeeper') {
    return this.http.post(`${this.api}/tournament-members/${tournamentId}`, { user_id: userId, role });
  }

  updateTournamentMember(tournamentId: number, userId: number, role: 'manager' | 'scorekeeper') {
    return this.http.put(`${this.api}/tournament-members/${tournamentId}/${userId}`, { role });
  }

  removeTournamentMember(tournamentId: number, userId: number) {
    return this.http.delete(`${this.api}/tournament-members/${tournamentId}/${userId}`);
  }

  transferTournamentOwnership(tournamentId: number, userId: number) {
    return this.http.put(`${this.api}/tournament-ownership/${tournamentId}`, { user_id: userId });
  }

  getUsers() {
    return this.http.get<UserAccount[]>(`${this.api}/users`);
  }

  createUser(data: { username: string; email: string; password: string; role: 'organizer' | 'super_admin' }) {
    return this.http.post<UserAccount>(`${this.api}/users`, data);
  }

  updateUser(id: number, data: { role?: 'organizer' | 'super_admin'; status?: 'active' | 'disabled' }) {
    return this.http.put<UserAccount>(`${this.api}/users/${id}`, data);
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post(`${this.api}/auth/change-password`, { 
      current_password: currentPassword, 
      new_password: newPassword 
    });
  }

  resetUserPassword(userId: number) {
    return this.http.post<{ token: string; expires_at: string }>(`${this.api}/users/${userId}/password-reset`, {});
  }

  resetPasswordWithToken(token: string, newPassword: string) {
    return this.http.post(`${this.api}/auth/reset-password`, {
      token,
      new_password: newPassword,
    });
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

  updateParticipant(id: number, name: string) {
    return this.http.put<Participant>(`${this.api}/participants/${id}`, { name });
  }

  // Teams
  getTeams(tournamentId: number) {
    return this.http.get<Team[]>(`${this.api}/teams/${tournamentId}`);
  }

  drawTeams(tournamentId: number) {
    return this.http.post<Team[]>(`${this.api}/teams`, { tournament_id: tournamentId });
  }

  updateTeam(id: number, data: Partial<Team>) {
    return this.http.put<Team>(`${this.api}/teams/${id}`, data);
  }

  // Bracket / Matches
  getBracket(tournamentId: number) {
    return this.http.get<BracketData>(`${this.api}/matches/${tournamentId}`);
  }

  updateScore(matchId: number, team1Score: number, team2Score: number) {
    return this.http.put(`${this.api}/matches/${matchId}`, { team1_score: team1Score, team2_score: team2Score });
  }
}
