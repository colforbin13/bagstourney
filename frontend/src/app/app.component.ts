// src/app/app.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './shared/components/nav.component';
import { ConfirmModalComponent } from './shared/components/confirm-modal.component';
import { FooterComponent } from './shared/components/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavComponent, ConfirmModalComponent, FooterComponent],
  template: `
    <app-nav />
    <router-outlet />
    <app-footer />
    <app-confirm-modal />
  `,
})
export class AppComponent {}
