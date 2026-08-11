// src/app/shared/services/superadmin.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.isSuperAdmin()) return true;
  inject(Router).navigate(['/admin']);
  return false;
};
