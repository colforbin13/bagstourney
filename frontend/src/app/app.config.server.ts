// src/app/app.config.server.ts
import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { HttpBackend, HttpEvent, HttpRequest } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { EMPTY, Observable } from 'rxjs';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * Answers every API request made while prerendering with nothing at all.
 *
 * The build has no API to call, and anything it did fetch would be frozen into the HTML
 * until the next deploy: a tournament list from build day, or an error message. Completing
 * without a value leaves each page in its loading state, which is exactly what the browser
 * then picks up and fills in with live data.
 */
class NoApiDuringPrerender implements HttpBackend {
  handle(_req: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    return EMPTY;
  }
}

const serverOnlyConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Listed after appConfig's provideHttpClient() by mergeApplicationConfig, so it wins.
    { provide: HttpBackend, useClass: NoApiDuringPrerender },
  ],
};

export const serverConfig = mergeApplicationConfig(appConfig, serverOnlyConfig);
