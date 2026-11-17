// src/app/shared/components/sponsor-bar.component.spec.ts
import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { SponsorBarComponent } from './sponsor-bar.component';
import { Sponsor } from '../models/tournament.models';
import { environment } from '../../../environments/environment';

describe('SponsorBarComponent', () => {
  let fixture: ComponentFixture<SponsorBarComponent>;

  const sponsor = (id: number, url: string | null = null): Sponsor => ({
    id, name: `Sponsor ${id}`, url, width: 200, height: 80, image_url: `sponsors/${id}/image?t=tok${id}`,
  });

  function render(sponsors: Sponsor[], tv = false) {
    fixture = TestBed.createComponent(SponsorBarComponent);
    fixture.componentRef.setInput('sponsors', sponsors);
    fixture.componentRef.setInput('tv', tv);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const names = (el: HTMLElement) => Array.from(el.querySelectorAll('img')).map(i => i.getAttribute('alt'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SponsorBarComponent] }).compileComponents();
  });

  it('renders nothing without sponsors', () => {
    expect(render([]).querySelector('.sponsor-bar')).toBeNull();
  });

  it('shows each logo from the API, named for screen readers', () => {
    const el = render([sponsor(1), sponsor(2)]);
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`${environment.apiUrl}/sponsors/1/image?t=tok1`);
    expect(names(el)).toEqual(['Sponsor 1', 'Sponsor 2']);
  });

  it("links a logo to the sponsor's site in a new tab, only when it has a link", () => {
    const el = render([sponsor(1, 'https://joespub.com'), sponsor(2)]);
    const links = el.querySelectorAll('a.logo');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('https://joespub.com');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toContain('noopener');
  });

  it('shows no links on a TV, where nobody can tap', () => {
    const el = render([sponsor(1, 'https://joespub.com')], true);
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.sponsor-bar.tv img')).not.toBeNull();
  });

  it('shows every logo on the page, however many', () => {
    expect(names(render([1, 2, 3, 4, 5, 6, 7, 8].map(i => sponsor(i)))).length).toBe(8);
  });

  it('takes turns in even groups on a TV when they do not all fit', fakeAsync(() => {
    const el = render([1, 2, 3, 4, 5, 6, 7, 8].map(i => sponsor(i)), true);
    expect(names(el)).toEqual(['Sponsor 1', 'Sponsor 2', 'Sponsor 3', 'Sponsor 4']);
    tick(SponsorBarComponent.ROTATE_MS);
    fixture.detectChanges();
    expect(names(el)).toEqual(['Sponsor 5', 'Sponsor 6', 'Sponsor 7', 'Sponsor 8']);
    tick(SponsorBarComponent.ROTATE_MS);
    fixture.detectChanges();
    expect(names(el)[0]).toBe('Sponsor 1');
    fixture.destroy();
    discardPeriodicTasks();
  }));

  it('does not rotate when every logo fits', fakeAsync(() => {
    const el = render([1, 2, 3].map(i => sponsor(i)), true);
    tick(SponsorBarComponent.ROTATE_MS * 2);
    fixture.detectChanges();
    expect(names(el).length).toBe(3);
    fixture.destroy();
  }));
});
