// src/main.server.ts
//
// Build-time entry point for prerendering (see app.routes.server.ts). Nothing runs this in
// production: the build renders the public pages to static HTML once, and Apache serves
// those files. There is no Node server.
import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { serverConfig } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(AppComponent, serverConfig, context);

export default bootstrap;
