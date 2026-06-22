import { provideZoneChangeDetection } from "@angular/core";
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// Ensure the base href matches the environment setting (allows serving under /bags/ in prod)
const base = document.querySelector('base');
if (base && environment && environment.baseHref) {
  base.setAttribute('href', environment.baseHref);
}

bootstrapApplication(AppComponent, {...appConfig, providers: [provideZoneChangeDetection(), ...appConfig.providers]}).catch(err => console.error(err));
