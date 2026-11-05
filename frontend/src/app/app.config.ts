// src/app/app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { TitleStrategy, provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './shared/services/auth.interceptor';
import { SeoTitleStrategy } from './shared/seo';

export const appConfig: ApplicationConfig = {
  providers: [
    // Here rather than in main.ts so the prerender build (app.config.server.ts) runs with
    // the same change detection as the browser.
    provideZoneChangeDetection(),
    // Angular keeps the window scroll position across navigations by default, so
    // following a link from halfway down one page dropped you halfway down the next.
    // 'enabled' (rather than 'top') still restores the old position on browser back and
    // forward, which is what a reader expects when returning to a long page.
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Prerendered pages are picked up as they are instead of being torn down and redrawn.
    // A no-op on client-rendered routes, which have nothing to hydrate.
    provideClientHydration(withEventReplay()),
    { provide: TitleStrategy, useClass: SeoTitleStrategy },
  ],
};
