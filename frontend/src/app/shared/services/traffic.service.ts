// src/app/shared/services/traffic.service.ts
//
// Counts page views for the super-admin Traffic page. Self-hosted on purpose: no cookies, no
// third-party script, nothing about the visitor beyond the page and where they came from (see
// api/lib/PageView.php for what the server keeps, and the privacy policy for what we promise).
//
// One beacon per navigation. The first page a tab loads in a session is marked as a visit and
// carries the referrer and any ?utm_source tag; later pages only add to that page's views.
// Signed-in admin screens aren't sent, and nothing is sent while a super admin is signed in,
// so the owner browsing their own site doesn't count as traffic.
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const VISIT_KEY = 'bb_visit';
/** Admin screens that are still public pages worth counting. */
const COUNTED_ADMIN = ['/admin/login', '/admin/register'];

@Injectable({ providedIn: 'root' })
export class TrafficService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private started = false;
  private visited = false;

  /** Called once from AppComponent. Does nothing during prerendering. */
  start(): void {
    if (!this.isBrowser || this.started) return;
    this.started = true;
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.record(e.urlAfterRedirects));
  }

  record(url: string): void {
    if (this.auth.isSuperAdmin()) return;
    const [path, query = ''] = url.split('#')[0].split('?');
    if ((path === '/admin' || path.startsWith('/admin/')) && !COUNTED_ADMIN.includes(path)) return;

    const visit = this.claimVisit();
    const payload: Record<string, string | boolean> = { path, visit };
    if (visit) {
      payload['referrer'] = this.document.referrer || '';
      const utm = new URLSearchParams(query).get('utm_source');
      if (utm) payload['utm_source'] = utm;
    }
    this.send(JSON.stringify(payload));
  }

  /** True for the first page of a session: kept in memory across in-app navigation, and in
   *  sessionStorage across reloads, where storage is available. */
  private claimVisit(): boolean {
    if (this.visited) return false;
    this.visited = true;
    try {
      const storage = this.document.defaultView?.sessionStorage;
      if (storage?.getItem(VISIT_KEY)) return false;
      storage?.setItem(VISIT_KEY, '1');
    } catch {
      // Storage blocked: the in-memory flag still stops in-app navigation recounting.
    }
    return true;
  }

  /** Fire and forget. text/plain keeps it a simple request, with no CORS preflight in dev. */
  protected send(body: string): void {
    const url = `${environment.apiUrl}/analytics/pageview`;
    try {
      const nav = this.document.defaultView?.navigator;
      if (nav?.sendBeacon && nav.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
      void fetch(url, { method: 'POST', body, keepalive: true }).catch(() => undefined);
    } catch {
      // A page view is never worth an error in front of a visitor.
    }
  }
}
