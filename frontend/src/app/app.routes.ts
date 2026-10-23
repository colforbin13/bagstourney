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
    // Titles and descriptions on public pages are what search results show (shared/seo.ts).
    // Written for the words organizers search with, per the marketing handoff.
    title: 'Blind draw cornhole and bags tournament brackets',
    data: {
      landing: true,
      description: 'Run a cornhole, bags or any two-player team tournament from your phone: blind draw teams, seeding, live scoring and the bracket on the TV. Free up to 32 players.',
    },
  },
  {
    path: 'tournaments',
    loadComponent: () => import('./bracket/tournament-list.component').then(m => m.TournamentListComponent),
    title: 'Tournaments',
    data: { landing: false },
  },
  // Public on purpose: it's most useful to someone deciding whether to sign up at all.
  {
    path: 'how-it-works',
    loadComponent: () => import('./bracket/how-it-works.component').then(m => m.HowItWorksComponent),
    title: 'How to run a tournament',
    data: {
      description: 'From a pile of players to a champion: sign-ups, blind draw or set teams, seeding, live scoring from any phone and the bracket on the wall.',
    },
  },
  // Public for the same reason, and the answer to the first question a visitor has now
  // that the rest of the copy no longer names a sport: "does this do my game?"
  // Public: the price list matters most before someone signs up.
  {
    path: 'pricing',
    loadComponent: () => import('./bracket/pricing.component').then(m => m.PricingComponent),
    title: 'Pricing',
    data: {
      description: 'Free for tournaments up to 32 players. Pro is $9.99 a month or $99.99 a year, or upgrade one tournament for $12.99, for bigger fields, double elimination, pool play and board assignments.',
    },
  },
  // Terms, Refund and Privacy policies: one component, the route's data picks the page.
  {
    path: 'terms',
    loadComponent: () => import('./bracket/legal.component').then(m => m.LegalComponent),
    title: 'Terms of service',
    data: { doc: 'terms', description: 'The terms for using Bracketway to run tournaments.' },
  },
  {
    path: 'refunds',
    loadComponent: () => import('./bracket/legal.component').then(m => m.LegalComponent),
    title: 'Refund policy',
    data: { doc: 'refunds', description: 'When Bracketway Pro and one-time tournament upgrades can be refunded.' },
  },
  {
    path: 'privacy',
    loadComponent: () => import('./bracket/legal.component').then(m => m.LegalComponent),
    title: 'Privacy policy',
    data: { doc: 'privacy', description: 'What Bracketway collects about organizers and players, and how it is used.' },
  },
  // The free generator (marketing handoff item 3): a public tool that ranks for "blind draw"
  // searches and ends in sign-up.
  {
    path: 'blind-draw-generator',
    loadComponent: () => import('./bracket/blind-draw-generator.component').then(m => m.BlindDrawGeneratorComponent),
    title: 'Free blind draw generator for cornhole',
    data: {
      description: 'Paste in your players and get random two-player teams and a seeded bracket in one click. Free blind draw generator for cornhole, bags, darts and doubles. No account needed.',
    },
  },
  // Guide pages (marketing handoff): prerendered how-tos for the searches organizers make.
  {
    path: 'cornhole-fundraiser',
    loadComponent: () => import('./bracket/fundraiser-guide.component').then(m => m.FundraiserGuideComponent),
    title: 'How to run a cornhole fundraiser tournament',
    data: {
      description: 'Plan a cornhole fundraiser from start to finish: a timeline, blind draw or partners, single or double elimination, entry fees, board sponsors, equipment and running the day.',
    },
  },
  {
    path: 'scoreholio-alternative',
    loadComponent: () => import('./bracket/scoreholio-comparison.component').then(m => m.ScoreholioComparisonComponent),
    title: 'Bracketway vs Scoreholio: a simpler Scoreholio alternative',
    data: {
      description: 'An honest comparison of Bracketway and Scoreholio for cornhole and bags tournaments: free plans, prices, formats, leagues, and whether players need an app.',
    },
  },
  {
    path: 'sports',
    loadComponent: () => import('./bracket/sports.component').then(m => m.SportsComponent),
    title: 'Sports and games',
    data: {
      description: "Bags, cornhole, KanJam, pickleball, horseshoes, darts, euchre and more. If it's played in two-player teams, Bracketway runs the bracket.",
    },
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
  // Printable venue sign. Public by uuid for the same reason the bracket and sign-up
  // pages are: the uuid is itself the access grant, so this exposes nothing new.
  // :kind is optional and defaults to the bracket (watch-along) version.
  {
    path: 'poster/:uuid',
    loadComponent: () => import('./bracket/poster.component').then(m => m.PosterComponent),
  },
  {
    path: 'poster/:uuid/:kind',
    loadComponent: () => import('./bracket/poster.component').then(m => m.PosterComponent),
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
  // Any signed-in organizer, not super-admin-only: this is where they buy their own plan.
  // It doubles as the return page for a subscription checkout (?session_id=...).
  {
    path: 'admin/billing',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/billing.component').then(m => m.BillingComponent),
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
    path: 'admin/traffic',
    canActivate: [authGuard, superAdminGuard],
    loadComponent: () => import('./admin/traffic.component').then(m => m.TrafficComponent),
  },
  {
    path: 'admin/tournament/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/tournament-manage.component').then(m => m.TournamentManageComponent),
  },
  // Scorekeeper-facing: only authGuard here, since scorekeepers are ordinary organizers
  // with a role on this one tournament. The component checks can_score, and the backend
  // enforces it on every PUT regardless.
  {
    path: 'admin/tournament/:id/score',
    canActivate: [authGuard],
    loadComponent: () => import('./admin/score-entry.component').then(m => m.ScoreEntryComponent),
  },
  { path: '**', redirectTo: '' },
];
