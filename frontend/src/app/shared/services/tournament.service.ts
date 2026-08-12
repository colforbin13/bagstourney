// src/app/shared/services/tournament.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Tournament, Participant, Team, BracketData, TournamentMember, UserAccount, UserSearchResult, NotificationPreferences } from '../models/tournament.models';

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

  getTournamentByUuid(uuid: string) {
    return this.http.get<Tournament>(`${this.api}/tournaments/by-uuid/${uuid}`);
  }

  createTournament(
    name: string,
    visibility?: 'public' | 'private',
    seedingMode?: 'automatic' | 'manual',
    teamEntryMode?: 'auto_draft' | 'direct',
  ) {
    const body: Record<string, string> = { name };
    if (visibility) body['visibility'] = visibility;
    if (seedingMode) body['seeding_mode'] = seedingMode;
    if (teamEntryMode) body['team_entry_mode'] = teamEntryMode;
    return this.http.post<Tournament>(`${this.api}/tournaments`, body);
  }

  updateTournament(id: number, data: Partial<Tournament>) {
    return this.http.put<Tournament>(`${this.api}/tournaments/${id}`, data);
  }

  deleteTournament(id: number) {
    return this.http.delete(`${this.api}/tournaments/${id}`);
  }

  getDeletedTournaments() {
    return this.http.get<Tournament[]>(`${this.api}/tournaments/deleted`);
  }

  restoreTournament(id: number) {
    return this.http.post<Tournament>(`${this.api}/tournaments/${id}/restore`, {});
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

  searchUsers(query: string) {
    return this.http.get<UserSearchResult[]>(`${this.api}/users/search`, { params: { q: query } });
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

  setParticipantNotificationEmail(participantId: number, email: string) {
    return this.http.put<Participant & { warning?: string }>(
      `${this.api}/participants/${participantId}/notification-email`, { email });
  }

  approveParticipant(id: number) {
    return this.http.put<Participant>(`${this.api}/participants/${id}/approve`, {});
  }

  // Public, unauthenticated — a coordinator's shared tournament link/QR. `website` is a
  // honeypot field; leave it untouched, real users never see or fill it.
  selfRegisterParticipant(tournamentUuid: string, name: string, email: string, website: string) {
    return this.http.post<{ success: boolean; name: string }>(`${this.api}/participants/self-register`, {
      tournament_uuid: tournamentUuid, name, email, website,
    });
  }

  // Notification opt-in/opt-out (public, token-based, no login)
  confirmNotificationSubscription(participantId: number, token: string) {
    return this.http.post<{ message: string; manage_preferences_url?: string }>(
      `${this.api}/notifications/confirm`, { participant_id: participantId, token });
  }

  unsubscribeNotificationCategory(participantId: number, token: string, category: string) {
    return this.http.post<{ message: string }>(`${this.api}/notifications/unsubscribe`,
      { participant_id: participantId, token, category });
  }

  getNotificationPreferences(participantId: number, token: string) {
    return this.http.get<NotificationPreferences>(`${this.api}/notifications/preferences`,
      { params: { pid: participantId, token } });
  }

  updateNotificationPreferences(participantId: number, token: string, categories: Partial<NotificationPreferences['categories']>) {
    return this.http.put<{ message: string }>(`${this.api}/notifications/preferences`,
      { participant_id: participantId, token, ...categories });
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

  // Direct team entry: create one team at a time from typed-in member names, rather
  // than adding participants individually and letting the app randomize pairing.
  createTeamDirect(tournamentId: number, teamName: string, participant1Name: string, participant2Name: string) {
    return this.http.post<Team>(`${this.api}/teams/direct`, {
      tournament_id: tournamentId,
      team_name: teamName,
      participant1_name: participant1Name,
      participant2_name: participant2Name,
    });
  }

  deleteTeam(id: number) {
    return this.http.delete(`${this.api}/teams/${id}`);
  }

  // Manual seeding: persist a drag-and-drop reorder as the new seed order (top to bottom
  // = seed 1..N), then separately confirm it to actually build the bracket.
  reorderTeams(tournamentId: number, teamIdsInOrder: number[]) {
    return this.http.put<Team[]>(`${this.api}/teams/reorder`, { tournament_id: tournamentId, team_ids: teamIdsInOrder });
  }

  generateBracket(tournamentId: number) {
    return this.http.post<Team[]>(`${this.api}/teams/generate-bracket`, { tournament_id: tournamentId });
  }

  // Bracket / Matches
  getBracket(tournamentId: number) {
    return this.http.get<BracketData>(`${this.api}/matches/${tournamentId}`);
  }

  getBracketByUuid(uuid: string) {
    return this.http.get<BracketData>(`${this.api}/matches/by-uuid/${uuid}`);
  }

  updateScore(matchId: number, team1Score: number, team2Score: number) {
    return this.http.put(`${this.api}/matches/${matchId}`, { team1_score: team1Score, team2_score: team2Score });
  }
}
