// src/app/admin/user-management.component.ts
import { Component, ElementRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../shared/services/tournament.service';
import { confirmService } from '../shared/services/confirm.service';
import { UserAccount } from '../shared/models/tournament.models';

/** A reset token just generated, held on screen until the admin dismisses it. */
interface ResetToken {
  userId: number;
  username: string;
  token: string;
  copied: boolean;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-table">
      <div class="page-header">
        <h1>User management</h1>
      </div>

      <form class="card create-user" (ngSubmit)="createUser()" novalidate>
        <h2>Create user</h2>
        <div class="create-user-fields">
          <label class="field">
            <span class="field-label">Username</span>
            <input class="input" name="username" autocomplete="off" [(ngModel)]="newUserUsername" />
          </label>
          <label class="field">
            <span class="field-label">Email</span>
            <input class="input" name="email" type="email" autocomplete="off" [(ngModel)]="newUserEmail" />
          </label>
          <label class="field">
            <span class="field-label">Password</span>
            <input class="input" name="password" type="password" autocomplete="new-password" [(ngModel)]="newUserPassword" aria-describedby="password-hint" />
            <span class="field-hint" id="password-hint">At least 12 characters</span>
          </label>
          <label class="field">
            <span class="field-label">Role</span>
            <select class="input" name="role" [(ngModel)]="newUserRole">
              <option value="organizer">Organizer</option>
              <option value="super_admin">Super admin</option>
            </select>
          </label>
          <button type="submit" class="btn btn-primary create-btn" [disabled]="creatingUser()">
            @if (creatingUser()) { <span class="spinner spinner-sm" aria-hidden="true"></span> }
            Create user
          </button>
        </div>
        @if (createUserError()) { <div class="error-banner create-error" role="alert">{{ createUserError() }}</div> }
      </form>

      @if (loading()) {
        <div class="empty"><span class="spinner" role="status" aria-label="Loading users"></span></div>
      } @else if (error()) {
        <div class="error-banner" role="alert">
          {{ error() }}
          <button type="button" class="btn btn-sm" (click)="load()">Try again</button>
        </div>
      } @else if (users().length === 0) {
        <div class="empty">No users yet.</div>
      } @else {
        <div class="table-container">
          <table class="data-table users-table">
            <thead>
              <tr>
                <th scope="col">Username</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Plan</th>
                <th scope="col">Created</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              @for (user of users(); track user.id) {
                <tr [class.is-disabled]="user.status === 'disabled'">
                  <th scope="row" class="username">{{ user.username }}</th>
                  <td class="dim">{{ user.email }}</td>
                  <td>
                    <ng-container *ngTemplateOutlet="roleSelect; context: { $implicit: user }"></ng-container>
                  </td>
                  <td>
                    <ng-container *ngTemplateOutlet="statusBadge; context: { $implicit: user }"></ng-container>
                  </td>
                  <td>
                    <ng-container *ngTemplateOutlet="planSelect; context: { $implicit: user }"></ng-container>
                  </td>
                  <td class="dim nowrap">{{ formatDate(user.created_at) }}</td>
                  <td class="actions">
                    <ng-container *ngTemplateOutlet="actionButtons; context: { $implicit: user }"></ng-container>
                  </td>
                </tr>
                @if (resetToken()?.userId === user.id) {
                  <tr class="token-tr">
                    <td colspan="7">
                      <ng-container *ngTemplateOutlet="tokenPanel"></ng-container>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <ul class="user-rows">
          @for (user of users(); track user.id) {
            <li class="user-row" [class.is-disabled]="user.status === 'disabled'">
              <div class="user-row-top">
                <span class="username">{{ user.username }}</span>
                <ng-container *ngTemplateOutlet="statusBadge; context: { $implicit: user }"></ng-container>
              </div>
              <div class="dim email">{{ user.email }}</div>
              <div class="user-row-fields">
                <label class="inline-field">
                  <span class="field-label">Role</span>
                  <ng-container *ngTemplateOutlet="roleSelect; context: { $implicit: user }"></ng-container>
                </label>
                <label class="inline-field">
                  <span class="field-label">Plan</span>
                  <ng-container *ngTemplateOutlet="planSelect; context: { $implicit: user }"></ng-container>
                </label>
              </div>
              <div class="dim">Joined {{ formatDate(user.created_at) }}</div>
              <div class="user-row-actions">
                <ng-container *ngTemplateOutlet="actionButtons; context: { $implicit: user }"></ng-container>
              </div>
              @if (resetToken()?.userId === user.id) {
                <ng-container *ngTemplateOutlet="tokenPanel"></ng-container>
              }
            </li>
          }
        </ul>
      }

      <ng-template #roleSelect let-user>
        <select
          class="input cell-select role-select"
          [value]="user.role"
          (change)="changeRole(user, $event)"
          [disabled]="isUpdating(user.id)"
          [attr.aria-label]="'Role for ' + user.username">
          <option value="organizer">Organizer</option>
          <option value="super_admin">Super admin</option>
        </select>
      </ng-template>

      <ng-template #planSelect let-user>
        <select
          class="input cell-select plan-select"
          [value]="user.plan"
          (change)="changePlan(user, $event)"
          [disabled]="isUpdating(user.id)"
          [attr.aria-label]="'Plan for ' + user.username + '. A plan set here is not revoked by Stripe.'"
          title="Manual plan override. A plan set here is not revoked by Stripe.">
          <option value="free">Free</option>
          <option value="paid">Paid</option>
        </select>
      </ng-template>

      <!-- Not badge-active: the global stylesheet owns that name for the pink "Live" badge,
           and pink means live-right-now only. Account status is quiet stock with a ruled edge. -->
      <ng-template #statusBadge let-user>
        <span class="badge" [class.status-active]="user.status === 'active'" [class.status-disabled]="user.status === 'disabled'">
          {{ user.status === 'active' ? 'Active' : 'Disabled' }}
        </span>
      </ng-template>

      <ng-template #actionButtons let-user>
        <button
          type="button"
          class="btn btn-sm"
          [disabled]="isUpdating(user.id)"
          [attr.aria-label]="'Reset password for ' + user.username"
          [attr.data-reset-for]="user.id"
          (click)="resetPassword(user)">
          Reset password
        </button>
        <button
          type="button"
          class="btn btn-sm"
          [class.btn-danger]="user.status === 'active'"
          [disabled]="isUpdating(user.id)"
          [attr.aria-label]="(user.status === 'active' ? 'Disable ' : 'Enable ') + user.username"
          (click)="toggleStatus(user)">
          {{ user.status === 'active' ? 'Disable' : 'Enable' }}
        </button>
        @if (isUpdating(user.id)) { <span class="spinner spinner-sm" role="status" aria-label="Saving"></span> }
      </ng-template>

      <!-- The token stays here until dismissed: if the clipboard write failed, this is the
           only copy there is, so it can't live in a toast that times out. -->
      <ng-template #tokenPanel>
        @if (resetToken(); as r) {
          <div class="token-panel" role="region" [attr.aria-label]="'Reset token for ' + r.username">
            <p class="token-note">
              <strong>Reset token for {{ r.username }}.</strong>
              {{ r.copied ? 'Copied to your clipboard.' : 'Copy it and send it to them.' }}
              It works once and expires in 24 hours.
            </p>
            <div class="token-row">
              <input class="input token-input" readonly [value]="r.token" aria-label="Reset token" (focus)="selectAll($event)" />
              <button type="button" class="btn btn-sm" (click)="copyToken()">Copy</button>
              <button type="button" class="btn btn-sm" (click)="dismissToken()">Done</button>
            </div>
          </div>
        }
      </ng-template>

      <!-- Always on the page, so a screen reader hears the text change; a live region
           created together with its text is often missed. -->
      <div class="sr-only" role="status">{{ toast() }}</div>
      @if (toast()) {
        <div class="toast" aria-hidden="true" [class.toast-success]="toastType() === 'success'" [class.toast-error]="toastType() === 'error'">
          {{ toast() }}
        </div>
      }
    </div>
  `,
  styles: [`
    .create-user { margin-bottom: 32px; }
    .create-user h2 { font-size: 1.2rem; margin: 0 0 14px; }
    .create-user-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 12px;
      align-items: start;
    }
    .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    /* Lines the button up with the inputs rather than their labels. */
    .create-btn { margin-top: calc(0.78rem * 1.5 + 4px); min-height: 44px; }
    /* One column on a phone: nothing beside it to line up with. */
    @media (max-width: 440px) { .create-btn { margin-top: 8px; } }

    .table-container { overflow-x: auto; }
    .users-table th[scope="row"] { font-size: 0.875rem; font-weight: 700; padding: 12px; border-bottom: 1px solid var(--border); white-space: normal; vertical-align: middle; }
    .dim { color: var(--text-dim); }
    .nowrap { white-space: nowrap; }

    /* A disabled account keeps full-strength text (dimming it failed contrast); the badge
       and a recessed row say it's off. */
    tr.is-disabled, .user-row.is-disabled { background: var(--surface-2); }

    .cell-select { width: auto; padding: 6px 8px; font-size: 0.875rem; }
    .role-select { min-width: 8.5rem; }
    .plan-select { min-width: 5.5rem; }

    .badge.status-active { background: var(--surface); color: var(--text-dim); border: 1px solid var(--border); }
    .badge.status-disabled { background: var(--surface); color: var(--danger); border: 1px solid var(--danger); }

    .actions { text-align: right; white-space: nowrap; }
    .actions .btn + .btn { margin-left: 6px; }
    .actions .spinner-sm { margin-left: 6px; }

    .token-tr td { background: var(--surface); padding: 0 12px 16px; }
    .token-tr:hover { background: transparent; }
    .token-panel {
      border: 1.5px solid var(--text);
      padding: 14px 16px;
      background: var(--surface);
    }
    .token-note { margin: 0 0 10px; font-size: 0.875rem; }
    .token-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .token-input { flex: 1 1 260px; width: auto; font-size: 0.875rem; }

    /* Phones: ruled rows instead of the table (DESIGN.md, List Rows). */
    .user-rows { display: none; list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--text); }
    .user-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px 4px;
      border-bottom: 1px solid var(--border);
      font-size: 0.875rem;
    }
    .user-row .username { font-size: 1rem; font-weight: 700; overflow-wrap: anywhere; }
    .user-row .email { overflow-wrap: anywhere; }
    .user-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .user-row-fields { display: flex; flex-wrap: wrap; gap: 8px 16px; }
    .inline-field { display: flex; align-items: center; gap: 8px; }
    .user-row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

    @media (max-width: 640px) {
      .table-container { display: none; }
      .user-rows { display: block; }
    }

    .create-error { margin-top: 14px; }
  `]
})
export class UserManagementComponent implements OnInit {
  users = signal<UserAccount[]>([]);
  loading = signal(true);
  error = signal('');
  toast = signal('');
  toastType = signal<'success' | 'error'>('success');
  updatingUserIds = signal<number[]>([]);
  resetToken = signal<ResetToken | null>(null);

  newUserUsername = '';
  newUserEmail = '';
  newUserPassword = '';
  newUserRole: 'organizer' | 'super_admin' = 'organizer';
  creatingUser = signal(false);
  createUserError = signal('');

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor(private svc: TournamentService) {}

  ngOnInit() { this.load(); }

  createUser() {
    if (!this.newUserUsername.trim() || !this.newUserEmail.trim() || this.newUserPassword.length < 12) {
      this.createUserError.set('Enter a username, valid email, and password of at least 12 characters.');
      return;
    }
    this.creatingUser.set(true);
    this.createUserError.set('');
    this.svc.createUser({
      username: this.newUserUsername.trim(), email: this.newUserEmail.trim(),
      password: this.newUserPassword, role: this.newUserRole,
    }).subscribe({
      next: user => {
        this.newUserUsername = ''; this.newUserEmail = ''; this.newUserPassword = ''; this.newUserRole = 'organizer';
        this.creatingUser.set(false);
        this.users.update(list => [user, ...list]);
        this.showToast('User created.', 'success');
      },
      error: err => {
        this.creatingUser.set(false);
        this.createUserError.set(err?.error?.error ?? 'Failed to create user.');
      },
    });
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.svc.getUsers().subscribe({
      next: data => {
        this.users.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load users.');
        this.loading.set(false);
      },
    });
  }

  isUpdating(userId: number): boolean {
    return this.updatingUserIds().includes(userId);
  }

  async changeRole(user: UserAccount, event: Event) {
    const target = event.target as HTMLSelectElement;
    const newRole = target.value as 'organizer' | 'super_admin';
    if (newRole === user.role) return;

    // Prevent demoting the last active super admin (check will be done by backend)
    if (user.role === 'super_admin' && newRole !== 'super_admin') {
      const confirm = await confirmService.confirm(
        `Demote ${user.username} from super admin to organizer? This action is audited.`
      );
      if (!confirm) {
        target.value = user.role;
        return;
      }
    }

    this.updateUser(user.id, { role: newRole }, () => { target.value = user.role; });
  }

  // FEATURE_TRACKER item 12: the manual lever for an account plan, which Stripe billing
  // otherwise sets. The server records a plan set here as 'manual', so a later
  // cancellation does not revoke it.
  changePlan(user: UserAccount, event: Event) {
    const target = event.target as HTMLSelectElement;
    const newPlan = target.value as 'free' | 'paid';
    if (newPlan === user.plan) return;
    this.updateUser(user.id, { plan: newPlan }, () => { target.value = user.plan; });
  }

  async toggleStatus(user: UserAccount) {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    const action = newStatus === 'active' ? 'enable' : 'disable';

    // Prevent disabling the last active super admin (check will be done by backend)
    if (user.role === 'super_admin' && newStatus !== 'active') {
      const confirm = await confirmService.confirm(
        `${action.charAt(0).toUpperCase() + action.slice(1)} super admin ${user.username}? This action is audited.`
      );
      if (!confirm) return;
    }

    this.updateUser(user.id, { status: newStatus });
  }

  async resetPassword(user: UserAccount) {
    const confirm = await confirmService.confirm(
      `Generate a password reset token for ${user.username}? They will need this token to set a new password.`
    );
    if (!confirm) return;

    this.updatingUserIds.update(ids => [...ids, user.id]);
    this.svc.resetUserPassword(user.id).subscribe({
      next: result => {
        this.updatingUserIds.update(ids => ids.filter(id => id !== user.id));
        // Shown in the row until dismissed, whether or not the clipboard write works.
        this.resetToken.set({ userId: user.id, username: user.username, token: result.token, copied: false });
        this.focusVisible('.token-input');
        this.writeClipboard(result.token).then(ok => {
          if (!ok) return;
          this.markCopied(result.token);
          this.showToast('Reset token copied to clipboard (expires in 24 hours).', 'success');
        });
      },
      error: err => {
        this.updatingUserIds.update(ids => ids.filter(id => id !== user.id));
        const msg = err?.error?.error ?? 'Failed to generate reset token.';
        this.showToast(msg, 'error');
      },
    });
  }

  async copyToken() {
    const r = this.resetToken();
    if (!r) return;
    if (await this.writeClipboard(r.token)) {
      this.markCopied(r.token);
      this.showToast('Reset token copied.', 'success');
    } else {
      this.showToast('Could not copy. Select the token and copy it by hand.', 'error');
    }
  }

  /** Closes the token panel and hands focus back to the button that opened it. */
  dismissToken() {
    const r = this.resetToken();
    this.resetToken.set(null);
    if (r) this.focusVisible(`[data-reset-for="${r.userId}"]`);
  }

  selectAll(event: Event) {
    (event.target as HTMLInputElement).select();
  }

  /** Focuses the first match that is actually shown: the table and the phone rows both
      render each control, and one of them is display:none. Runs after the next render. */
  private focusVisible(selector: string) {
    setTimeout(() => {
      const els = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>(selector));
      els.find(el => el.offsetParent !== null)?.focus();
    });
  }

  private markCopied(token: string) {
    this.resetToken.update(r => (r && r.token === token ? { ...r, copied: true } : r));
  }

  private writeClipboard(text: string): Promise<boolean> {
    if (!navigator.clipboard?.writeText) return Promise.resolve(false);
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }

  /** `revert` puts a select back when the server refuses the change: the model never
      changed, so Angular has nothing to re-render and the select would keep the refused value. */
  private updateUser(userId: number, data: { role?: 'organizer' | 'super_admin'; status?: 'active' | 'disabled'; plan?: 'free' | 'paid' }, revert?: () => void) {
    this.updatingUserIds.update(ids => [...ids, userId]);
    this.svc.updateUser(userId, data).subscribe({
      next: updated => {
        this.users.update(list => list.map(u => u.id === userId ? updated : u));
        this.updatingUserIds.update(ids => ids.filter(id => id !== userId));
        this.showToast('User updated.', 'success');
      },
      error: err => {
        this.updatingUserIds.update(ids => ids.filter(id => id !== userId));
        const msg = err?.error?.error ?? 'Failed to update user.';
        revert?.();
        this.showToast(msg, 'error');
      },
    });
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private showToast(msg: string, type: 'success' | 'error') {
    this.toast.set(msg);
    this.toastType.set(type);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3500);
  }
}
