// src/app/shared/services/superadmin.guard.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { superAdminGuard } from './superadmin.guard';
import { AuthService } from './auth.service';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('superAdminGuard', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService, Router]
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    expect(superAdminGuard).toBeTruthy();
  });

  it('should return true if user is super admin', () => {
    TestBed.runInInjectionContext(() => {
      spyOn(authService, 'isSuperAdmin').and.returnValue(true);
      const result = superAdminGuard(null as any, null as any);
      expect(result).toBe(true);
    });
  });

  it('should navigate to /admin if user is not super admin', () => {
    TestBed.runInInjectionContext(() => {
      spyOn(authService, 'isSuperAdmin').and.returnValue(false);
      spyOn(router, 'navigate');
      
      const result = superAdminGuard(null as any, null as any);
      
      expect(result).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/admin']);
    });
  });
});
