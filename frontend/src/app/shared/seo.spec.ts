// src/app/shared/seo.spec.ts
import { Component, DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { TitleStrategy, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SeoTitleStrategy, canonicalUrl } from './seo';

@Component({ standalone: true, template: '' })
class BlankComponent {}

describe('SeoTitleStrategy', () => {
  let harness: RouterTestingHarness;
  let title: Title;
  let meta: Meta;
  let doc: Document;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'pricing', component: BlankComponent, title: 'Pricing', data: { description: 'Free up to 32 players.' } },
          { path: 'tournaments', component: BlankComponent, title: 'Tournaments' },
          { path: 'bracket/:id', component: BlankComponent },
        ]),
        { provide: TitleStrategy, useClass: SeoTitleStrategy },
      ],
    });
    harness = await RouterTestingHarness.create();
    title = TestBed.inject(Title);
    meta = TestBed.inject(Meta);
    doc = TestBed.inject(DOCUMENT);
  });

  afterEach(() => doc.head.querySelector('link[rel="canonical"]')?.remove());

  const canonical = () => doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;

  it('should write the title, description, canonical and Open Graph tags for a described page', async () => {
    await harness.navigateByUrl('/pricing?utm_source=flyer');

    expect(title.getTitle()).toBe('Pricing | Bracketway');
    expect(meta.getTag('name="description"')?.content).toBe('Free up to 32 players.');
    expect(meta.getTag('property="og:title"')?.content).toBe('Pricing');
    expect(meta.getTag('property="og:url"')?.content).toBe('https://bracketway.com/pricing');
    expect(canonical()).toBe('https://bracketway.com/pricing');
  });

  it('should clear the previous page\'s description and canonical on a page without one', async () => {
    await harness.navigateByUrl('/pricing');
    await harness.navigateByUrl('/tournaments');

    expect(title.getTitle()).toBe('Tournaments | Bracketway');
    expect(meta.getTag('name="description"')).toBeNull();
    expect(meta.getTag('property="og:title"')).toBeNull();
    expect(canonical()).toBeNull();
  });

  it('should fall back to the site name for an untitled page', async () => {
    await harness.navigateByUrl('/pricing');
    await harness.navigateByUrl('/bracket/7');

    expect(title.getTitle()).toBe('Bracketway');
    expect(canonical()).toBeNull();
  });
});

describe('canonicalUrl', () => {
  it('should give the landing page a trailing slash and drop queries and fragments', () => {
    expect(canonicalUrl('/')).toBe('https://bracketway.com/');
    expect(canonicalUrl('')).toBe('https://bracketway.com/');
    expect(canonicalUrl('/how-it-works#steps')).toBe('https://bracketway.com/how-it-works');
    expect(canonicalUrl('/pricing?ref=abc')).toBe('https://bracketway.com/pricing');
  });
});
