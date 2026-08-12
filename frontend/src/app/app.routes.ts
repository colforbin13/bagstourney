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
    path: 'reset-password',
    loadComponent: () => import('./admin/reset-password.component').then(m => m.ResetPasswordComponent),
  },
  {
    path: 'notifications/confirm',
    loadComponent: () => import('./notifications/confirm-subscription.component').then(m => m.ConfirmSubscriptionComponent),
  },
  {
    path: 'notifications/unsubscribe',
    loadComponent: () => import('./notifications/unsubscribe.component').then(m => m.UnsubscribeComponent),
  },
  {
    path: 'notifications/preferences',
    loadComponent: () => import('./notifications/preferences.component').then(m => m.PreferencesComponent),
  },
  {
    path: 'register/:uuid',
    loadComponent: () => import('./register/self-register.component').then(m => m.SelfRegisterComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/admin-dashboard.component').then(m => m.AdminDashboardComponent),
  },
  {
    path: 'admin/profile',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/profile.component').then(m => m.ProfileComponent),
  },
  {
    path: 'admin/users',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () => import('./admin/user-management.component').then(m => m.UserManagementComponent),
  },
  {
    path: 'admin/deleted-tournaments',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () => import('./admin/deleted-tournaments.component').then(m => m.DeletedTournamentsComponent),
  },
  {
    path: 'admin/tournament/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/tournament-manage.component').then(m => m.TournamentManageComponent),
  },
  { path: '**', redirectTo: '' },
];
