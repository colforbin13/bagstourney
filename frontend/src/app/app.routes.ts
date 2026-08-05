// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './shared/services/auth.guard';
import { superAdminGuard } from './shared/services/superadmin.guard';

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
    path: 'admin/register',
    loadComponent: () => import('./admin/register.component').then(m => m.RegisterComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/admin-dashboard.component').then(m => m.AdminDashboardComponent),
  },
  {
    path: 'admin/users',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () => import('./admin/user-management.component').then(m => m.UserManagementComponent),
  },
  {
    path: 'admin/tournament/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/tournament-manage.component').then(m => m.TournamentManageComponent),
  },
  { path: '**', redirectTo: '' },
];
