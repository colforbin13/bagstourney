// src/app/app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Which pages the build writes out as finished HTML.
 *
 * Search engines rank what is in the HTML as served, and a client-only app serves the same
 * empty shell for every URL. These are the public pages a visitor finds through search, so
 * they are rendered once at build time and served as plain files (see the rewrites in
 * .htaccess). They come out as a signed-out visitor sees them, then the app takes over in
 * the browser and swaps in the signed-in nav and buttons where that applies.
 *
 * Everything else stays client-rendered from index.csr.html: tournament data changes by the
 * minute, and the admin screens are behind a sign-in no crawler has.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'how-it-works', renderMode: RenderMode.Prerender },
  { path: 'pricing', renderMode: RenderMode.Prerender },
  { path: 'sports', renderMode: RenderMode.Prerender },
  { path: 'terms', renderMode: RenderMode.Prerender },
  { path: 'refunds', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
