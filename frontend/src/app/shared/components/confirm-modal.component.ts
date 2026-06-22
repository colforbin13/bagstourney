import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { confirmService } from '../services/confirm.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="visible" class="cb-modal-backdrop">
      <div class="cb-modal" role="dialog" aria-modal="true">
        <div class="cb-modal-body">
          <div class="cb-modal-message">{{ message }}</div>
          <div class="cb-modal-actions">
            <button class="btn" (click)="onCancel()">Cancel</button>
            <button class="btn btn-primary" (click)="onConfirm()">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cb-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }
    .cb-modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      min-width: 320px;
      max-width: 90%;
      box-shadow: 0 12px 40px rgba(0,0,0,0.3);
    }
    .cb-modal-body { padding: 20px; }
    .cb-modal-message { margin-bottom: 16px; font-size: 0.95rem; }
    .cb-modal-actions { display:flex; justify-content:flex-end; gap:8px; }
  `]
})
export class ConfirmModalComponent implements OnDestroy {
  visible = false;
  message = '';
  private pending: { resolve: (b: boolean) => void } | null = null;
  private sub: Subscription;

  constructor() {
    this.sub = confirmService.observable.subscribe(v => {
      if (!v) {
        this.visible = false;
        this.message = '';
        this.pending = null;
        return;
      }
      this.visible = true;
      this.message = v.message;
      this.pending = { resolve: v.resolve };
    });
  }

  onConfirm() {
    if (this.pending) this.pending.resolve(true);
    confirmService.clear();
  }

  onCancel() {
    if (this.pending) this.pending.resolve(false);
    confirmService.clear();
  }

  ngOnDestroy() { this.sub.unsubscribe(); }
}
