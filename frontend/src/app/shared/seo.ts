// src/app/shared/seo.ts
import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Where the site is served. Canonical links and og:url have to be absolute. */
export const SITE_URL = 'https://bracketway.com';
export const SITE_NAME = 'Bracketway';

/** Tags this strategy owns. Removed on pages that don't describe themselves. */
const OWNED_META = ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:url"', 'property="og:type"'];

/**
 * Sets each page's <title>, meta description, canonical link and Open Graph basics from
 * its route: `title` on the route, `description` in its `data`.
 *
 * On the prerendered pages (app.routes.server.ts) this runs at build time, so the tags are
 * in the HTML that search engines and link previews read. In the browser it keeps them right
 * as the visitor moves between pages.
 *
 * A route without a title gets the plain site name and loses the description and canonical,
 * so a tag from the previous page never lingers on one it doesn't describe. That includes
 * /bracket/..., whose tags api/preview.php writes into the served HTML for crawlers; the
 * browser has no use for them once the page has loaded.
 */
@Injectable({ providedIn: 'root' })
export class SeoTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    const description = deepestData(snapshot.root)['description'] as string | undefined;

    this.title.setTitle(pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME);

    if (!pageTitle || !description) {
      OWNED_META.forEach(selector => this.meta.removeTag(selector));
      this.setCanonical(null);
      return;
    }

    const url = canonicalUrl(snapshot.url);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.setCanonical(url);
  }

  private setCanonical(url: string | null): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }
}

/** Route data merges down the tree; the deepest activated route has the final say. */
function deepestData(route: ActivatedRouteSnapshot): Record<string, unknown> {
  let current = route;
  while (current.firstChild) current = current.firstChild;
  return current.data;
}

/** The page's address without query string or fragment, so tracking links don't split it. */
export function canonicalUrl(routerUrl: string): string {
  const path = routerUrl.split(/[?#]/)[0];
  return SITE_URL + (path === '' ? '/' : path);
}
