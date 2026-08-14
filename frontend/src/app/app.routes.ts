// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './shared/services/auth.guard';
import { superAdminGuard } from './shared/services/superadmin.guard';

export const routes: Routes = [
  // Both paths render the same component; `landing` decides whether the hero and
  // how-it-works content appear above the list. `/` is the full landing page for
  // everyone, signed in or not — `/tournaments` is the bare list the nav links to.
  {
    path: '',
    loadComponent: () => import('./bracket/tournament-list.component').then(m => m.TournamentListComponent),
    data: { landing: true },
  },
  {
    path: 'tournaments',
    loadComponent: () => import('./bracket/tournament-list.component').then(m => m.TournamentListComponent),
    data: { landing: false },
  },
  // Public on purpose: it's most useful to someone deciding whether to sign up at all.
  {
    path: 'how-it-works',
    loadComponent: () => import('./bracket/how-it-works.component').then(m => m.HowItWorksComponent),
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
    path: 'verify-email',
    loadComponent: () => import('./admin/verify-email.component').then(m => m.VerifyEmailComponent),
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
    path: 'admin/audit-log',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () => import('./admin/audit-log.component').then(m => m.AuditLogComponent),
  },
  {
    path: 'admin/tournament/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/tournament-manage.component').then(m => m.TournamentManageComponent),
  },
  { path: '**', redirectTo: '' },
];
