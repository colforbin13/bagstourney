// src/app/shared/services/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req).pipe(
    catchError((err) => {
      if (err && err.status === 401) {
        // Store a session message for the login page, then force logout + redirect to login
        try { localStorage.setItem('bb_session_msg', 'Session expired — please sign in again.'); } catch (e) {}
        auth.logout('/admin/login');
      }
      return throwError(() => err);
    })
  );
};
