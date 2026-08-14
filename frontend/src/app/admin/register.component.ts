import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../shared/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="register-wrap">
      <div class="register-card">
        @if (success()) {
          <div><h1>Check your email</h1></div>
          <div class="form-success">{{ success() }}</div>
          <a routerLink="/admin/login">Back to sign in</a>
        } @else {
          <div><h1>Create organizer account</h1><p>Set up an account to create and manage tournaments.</p></div>
          <label class="label">Username<input class="input" [(ngModel)]="username" autocomplete="username" /></label>
          <label class="label">Email<input class="input" type="email" [(ngModel)]="email" autocomplete="email" /></label>
          <label class="label">Password<input class="input" type="password" [(ngModel)]="password" autocomplete="new-password" /></label>
          <div class="hint">Use at least 12 characters.</div>
          @if (error()) { <div class="form-error">{{ error() }}</div> }
          <button class="btn btn-primary" [disabled]="loading()" (click)="register()">
            @if (loading()) { Creating account… } @else { Create account }
          </button>
          <a routerLink="/admin/login">Already have an account? Sign in</a>
        }
      </div>
    </div>
  `,
  styles: [`
    .register-wrap { min-height: calc(100dvh - 52px); display:flex; align-items:center; justify-content:center; padding:24px 16px; }
    .register-card { width:100%; max-width:360px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:32px 24px; display:flex; flex-direction:column; gap:14px; }
    h1 { font-size:1.1rem; margin:0 0 6px; } p,.hint,a { font-size:.8rem; color:var(--text-dim); } a { color:var(--accent); text-align:center; }
    .label { display:flex; flex-direction:column; gap:6px; font-size:.8rem; color:var(--text-dim); }
    .form-error { font-size:.8rem; color:var(--danger); }
    .form-success { font-size:.85rem; color:var(--text); background:rgba(var(--marker-rgb),0.1); border:1px solid rgba(var(--marker-rgb),0.35); border-radius:var(--radius); padding:10px 12px; }
  `]
})
export class RegisterComponent {
  username = '';
  email = '';
  password = '';
  loading = signal(false);
  error = signal('');
  success = signal('');

  constructor(private auth: AuthService) {}

  register() {
    if (!this.username.trim() || !this.email.trim() || this.password.length < 12) {
      this.error.set('Enter a username, valid email, and password of at least 12 characters.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth.register(this.username.trim(), this.email.trim(), this.password).subscribe({
      next: res => { this.loading.set(false); this.success.set(res.message); },
      error: err => { this.loading.set(false); this.error.set(err?.error?.error ?? 'Unable to create account.'); },
    });
  }
}
