// src/app/admin/traffic.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TrafficComponent } from './traffic.component';
import { TrafficSummary } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('TrafficComponent', () => {
  let fixture: ComponentFixture<TrafficComponent>;
  let component: TrafficComponent;
  let httpMock: HttpTestingController;

  const summary = (over: Partial<TrafficSummary> = {}): TrafficSummary => ({
    days: 30,
    from: '2026-09-24',
    to: '2026-10-23',
    visits: 15,
    views: 40,
    previous_visits: 10,
    daily: [
      { day: '2026-10-22', visits: 5, views: 10 },
      { day: '2026-10-23', visits: 10, views: 30 },
    ],
    pages: [{ path: '/bracket/:id', views: 30, visits: 9 }, { path: '/made-up', views: 1, visits: 0 }],
    sources: [{ source: 'alternativeto.net', visits: 6 }, { source: '', visits: 9 }],
    activity: { new_organizers: 2, tournaments_created: 3, players_added: 48, pro_subscribers: 1, upgraded_tournaments: 4 },
    ...over,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrafficComponent, HttpClientTestingModule],
    }).compileComponents();
    fixture = TestBed.createComponent(TrafficComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flush(days: number, data: TrafficSummary) {
    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/analytics`);
    expect(req.request.params.get('days')).toBe(String(days));
    req.flush(data);
    fixture.detectChanges();
  }

  it('loads the last 30 days and shows the totals', () => {
    fixture.detectChanges();
    flush(30, summary());
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Visits');
    expect(text).toContain('48');
    expect(text).toContain('Up 50% on the previous 30 days');
    expect(text).toContain('4 tournament upgrades');
  });

  it('names known pages and labels direct traffic', () => {
    fixture.detectChanges();
    flush(30, summary());
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Bracket pages');
    expect(text).toContain('/made-up');
    expect(text).toContain('alternativeto.net');
    expect(text).toContain('Direct or unknown');
  });

  it('scales bars to the busiest day', () => {
    fixture.detectChanges();
    flush(30, summary());
    expect(component.barHeight(10)).toBe(100);
    expect(component.barHeight(5)).toBe(50);
    expect(fixture.nativeElement.querySelectorAll('.bar').length).toBe(2);
  });

  it('switches range', () => {
    fixture.detectChanges();
    flush(30, summary());
    component.load(7);
    flush(7, summary({ days: 7, visits: 5, previous_visits: 10 }));
    expect(component.days()).toBe(7);
    expect(component.changeNote()).toBe('Down 50% on the previous 7 days');
  });

  it('describes a range with nothing to compare against', () => {
    fixture.detectChanges();
    flush(30, summary({ previous_visits: 0 }));
    expect(component.changeNote()).toBe('0 in the previous 30 days');
    component.load(7);
    flush(7, summary({ days: 7, visits: 4, previous_visits: 4 }));
    expect(component.changeNote()).toBe('Same as the previous 7 days');
  });

  it('shows empty states before any traffic', () => {
    fixture.detectChanges();
    flush(30, summary({ visits: 0, views: 0, daily: [], pages: [], sources: [] }));
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('No page views yet.');
    expect(text).toContain('No visits yet.');
    expect(component.barHeight(0)).toBe(0);
  });

  it('shows an error when the summary fails', () => {
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === `${environment.apiUrl}/analytics`).flush({}, { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not load traffic.');
  });
});
