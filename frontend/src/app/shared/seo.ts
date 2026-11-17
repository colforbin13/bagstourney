// src/app/shared/seo.ts
import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Where the site is served. Canonical links and og:url have to be absolute. */
export const SITE_URL = 'https://bracketway.com';
export const SITE_NAME = 'Bracketway';

/**
 * The brand card every described page previews with: the same image, size and card type
 * api/lib/LinkPreview.php gives a shared bracket link, so a link to the site and a link to
 * a bracket look alike in a chat. It has to be an absolute URL.
 */
export const SHARE_IMAGE = {
  url: `${SITE_URL}/assets/og-card.png`,
  width: '1200',
  height: '630',
  alt: `${SITE_NAME}: tournament brackets for two-player teams`,
};

/**
 * Tags this strategy owns. Removed on pages that don't describe themselves. Open Graph
 * tags are keyed by `property` and Twitter's by `name`; some crawlers are strict about it.
 */
const OWNED_META = [
  'name="description"',
  'property="og:title"', 'property="og:description"', 'property="og:url"', 'property="og:type"',
  'property="og:site_name"',
  'property="og:image"', 'property="og:image:width"', 'property="og:image:height"', 'property="og:image:alt"',
  'name="twitter:card"', 'name="twitter:title"', 'name="twitter:description"', 'name="twitter:image"',
];

/**
 * Sets each page's <title>, meta description, canonical link, Open Graph tags and Twitter
 * card from its route: `title` on the route, `description` in its `data`.
 *
 * On the prerendered pages (app.routes.server.ts) this runs at build time, so the tags are
 * in the HTML that search engines and link previews read. In the browser it keeps them right
 * as the visitor moves between pages.
 *
 * A route without a title gets the plain site name and loses the description and canonical,
 * so a tag from the previous page never lingers on one it doesn't describe. That includes
 * /bracket/..., whose tags api/preview.php writes into the served HTML for crawlers; the
 * bracket page puts its own canonical back once it knows the tournament's public link.
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
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:image', content: SHARE_IMAGE.url });
    this.meta.updateTag({ property: 'og:image:width', content: SHARE_IMAGE.width });
    this.meta.updateTag({ property: 'og:image:height', content: SHARE_IMAGE.height });
    this.meta.updateTag({ property: 'og:image:alt', content: SHARE_IMAGE.alt });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: SHARE_IMAGE.url });
    this.setCanonical(url);
  }

  private setCanonical(url: string | null): void {
    setCanonicalLink(this.document, url);
  }
}

/**
 * Points the page's <link rel="canonical"> at `url`, adding the link if needed, or removes it
 * for null. Exported for pages that only learn their own address after loading, such as a
 * bracket reached by any of several URLs.
 */
export function setCanonicalLink(document: Document, url: string | null): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!url) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
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
