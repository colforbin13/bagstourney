// src/app/shared/services/traffic.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { TrafficService } from './traffic.service';
import { AuthService } from './auth.service';

describe('TrafficService', () => {
  let service: TrafficService;
  let sent: Record<string, unknown>[];
  let events: Subject<unknown>;
  const isSuperAdmin = signal(false);

  function setup(platform = 'browser', referrer = 'https://alternativeto.net/software/challonge/') {
    events = new Subject();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: Router, useValue: { events } },
        { provide: AuthService, useValue: { isSuperAdmin } },
        { provide: DOCUMENT, useValue: { referrer, defaultView: window } },
      ],
    });
    service = TestBed.inject(TrafficService);
    sent = [];
    spyOn(service as any, 'send').and.callFake((body: string) => sent.push(JSON.parse(body)));
  }

  beforeEach(() => {
    isSuperAdmin.set(false);
    sessionStorage.removeItem('bb_visit');
  });

  afterEach(() => sessionStorage.removeItem('bb_visit'));

  it('marks only the first page of a session as a visit, with its referrer and tag', () => {
    setup();
    service.record('/pricing?utm_source=qr#plans');
    service.record('/bracket/7');
    expect(sent).toEqual([
      { path: '/pricing', visit: true, referrer: 'https://alternativeto.net/software/challonge/', utm_source: 'qr' },
      { path: '/bracket/7', visit: false },
    ]);
  });

  it('does not recount a visit after a reload in the same tab', () => {
    sessionStorage.setItem('bb_visit', '1');
    setup();
    service.record('/');
    expect(sent).toEqual([{ path: '/', visit: false }]);
  });

  it('skips admin screens but counts sign-in and sign-up', () => {
    setup();
    service.record('/admin');
    service.record('/admin/tournament/3/score');
    service.record('/admin/register');
    expect(sent.map(s => s['path'])).toEqual(['/admin/register']);
  });

  it('sends nothing for a signed-in super admin', () => {
    setup();
    isSuperAdmin.set(true);
    service.record('/');
    expect(sent).toEqual([]);
  });

  it('records each completed navigation once started', () => {
    setup();
    service.start();
    service.start();
    events.next(new NavigationEnd(1, '/x', '/how-it-works'));
    events.next({ type: 'not a navigation end' });
    expect(sent).toEqual([{ path: '/how-it-works', visit: true, referrer: 'https://alternativeto.net/software/challonge/' }]);
  });

  it('does nothing while prerendering', () => {
    setup('server');
    service.start();
    events.next(new NavigationEnd(1, '/', '/'));
    expect(sent).toEqual([]);
  });

  it('sends a beacon to the pageview endpoint', () => {
    events = new Subject();
    const beacon = jasmine.createSpy('sendBeacon').and.returnValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { events } },
        { provide: AuthService, useValue: { isSuperAdmin } },
        { provide: DOCUMENT, useValue: { referrer: '', defaultView: { navigator: { sendBeacon: beacon }, sessionStorage } } },
      ],
    });
    TestBed.inject(TrafficService).record('/');
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.calls.mostRecent().args[0]).toMatch(/\/analytics\/pageview$/);
  });
});
