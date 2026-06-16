// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './shared/services/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./bracket/tournament-list.component').then(m => m.TournamentListComponent),
  },
  {
    path: 'bracket/:id',
    loadComponent: () => import('./bracket/bracket-view.component').then(m => m.BracketViewComponent),
  },
  {
    path: 'admin/login',
    loadComponent: () => import('./admin/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/admin-dashboard.component').then(m => m.AdminDashboardComponent),
  },
  {
    path: 'admin/tournament/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/tournament-manage.component').then(m => m.TournamentManageComponent),
  },
  { path: '**', redirectTo: '' },
];
