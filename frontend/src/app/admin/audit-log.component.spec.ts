// src/app/admin/audit-log.component.spec.ts
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuditLogComponent } from './audit-log.component';
import { TournamentService } from '../shared/services/tournament.service';
import { AuditLogEntry, AuditLogResponse } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('AuditLogComponent', () => {
  let component: AuditLogComponent;
  let fixture: ComponentFixture<AuditLogComponent>;
  let httpMock: HttpTestingController;

  const mockEntry: AuditLogEntry = {
    id: 1,
    created_at: '2026-08-14T12:00:00Z',
    action: 'tournament_created',
    target_type: 'tournament',
    target_id: '9',
    details: { name: 'Summer Bags' },
    tournament_id: 9,
    tournament_name: 'Summer Bags',
    actor_user_id: 3,
    actor_username: 'claude-organizer',
    actor_email: 'claude-organizer@irishguys.org',
  };

  const mockResponse: AuditLogResponse = {
    rows: [mockEntry],
    total: 1,
    page: 1,
    page_size: 50,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditLogComponent, HttpClientTestingModule],
      providers: [TournamentService, provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushInitialLoad(response: AuditLogResponse = mockResponse) {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`);
    req.flush(response);
  }

  it('should load entries on init with default sort/paging', () => {
    flushInitialLoad();

    expect(component.entries()).toEqual([mockEntry]);
    expect(component.total()).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('should request the default sort (created_at desc) and page size on first load', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`);
    expect(req.request.params.get('sort')).toBe('created_at');
    expect(req.request.params.get('dir')).toBe('desc');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('page_size')).toBe('50');
    req.flush(mockResponse);
  });

  it('should show an error message when the request fails', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`);
    req.error(new ErrorEvent('Network error'));

    expect(component.error()).toBe('Failed to load audit log.');
    expect(component.loading()).toBe(false);
  });

  it('should debounce search input before reloading', fakeAsync(() => {
    flushInitialLoad();

    component.onSearchInput('tournament');
    httpMock.expectNone(`${environment.apiUrl}/audit-log`);

    tick(400);
    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`);
    expect(req.request.params.get('search')).toBe('tournament');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(mockResponse);
  }));

  it('should reset to page 1 when the action filter changes', () => {
    flushInitialLoad();

    component.page.set(3);
    component.onActionFilterChange('participant_approved');

    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`);
    expect(req.request.params.get('action')).toBe('participant_approved');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(mockResponse);
  });

  it('should toggle sort direction when the same column is clicked twice', () => {
    flushInitialLoad();

    component.setSort('action');
    let req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`);
    expect(req.request.params.get('sort')).toBe('action');
    expect(req.request.params.get('dir')).toBe('asc');
    req.flush(mockResponse);

    component.setSort('action');
    req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`);
    expect(req.request.params.get('dir')).toBe('desc');
    req.flush(mockResponse);
  });

  it('should advance and retreat pages via goToPage', () => {
    flushInitialLoad({ rows: [mockEntry], total: 120, page: 1, page_size: 50 });

    component.goToPage(2);
    const req = httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`);
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ rows: [mockEntry], total: 120, page: 2, page_size: 50 });

    expect(component.totalPages()).toBe(3);
  });

  it('should format details as readable Key: value lines', () => {
    expect(component.formatDetails({ role: 'manager', paid_override: true, ids: [1, 2] }))
      .toBe('Role: manager\nPaid override: true\nIds: [1,2]');
    expect(component.formatDetails(null)).toBe('—');
    expect(component.formatDetails({})).toBe('—');
  });

  it('should name actions in sentence case', () => {
    expect(component.actionLabel('tournament_member_granted')).toBe('Tournament member granted');
  });

  it('should report the sorted column to assistive tech', () => {
    flushInitialLoad();
    fixture.detectChanges();
    const sorted = fixture.nativeElement.querySelectorAll('th[aria-sort]');
    expect(sorted.length).toBe(1);
    expect(sorted[0].getAttribute('aria-sort')).toBe('descending');
    expect(sorted[0].querySelector('button')).not.toBeNull();
    expect(component.ariaSort('action')).toBeNull();
  });

  it('should keep the rows on screen while the next page loads', () => {
    flushInitialLoad({ rows: [mockEntry], total: 120, page: 1, page_size: 50 });
    component.goToPage(2);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.results.is-refreshing')).not.toBeNull();
    expect(el.querySelector('.audit-table')).not.toBeNull();

    httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`).flush(mockResponse);
    fixture.detectChanges();
    expect(el.querySelector('.results.is-refreshing')).toBeNull();
  });

  it('should bring the top of the rows back into view after Next', async () => {
    flushInitialLoad({ rows: [mockEntry], total: 120, page: 1, page_size: 50 });
    fixture.detectChanges();
    const results: HTMLElement = fixture.nativeElement.querySelector('.results');
    spyOn(results, 'getBoundingClientRect').and.returnValue({ top: -400 } as DOMRect);
    const scroll = spyOn(results, 'scrollIntoView');

    component.goToPage(2);
    httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`).flush(mockResponse);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  });

  it('should not scroll after a sort, which starts at the top already', async () => {
    flushInitialLoad();
    fixture.detectChanges();
    const results: HTMLElement = fixture.nativeElement.querySelector('.results');
    const scroll = spyOn(results, 'scrollIntoView');
    component.setSort('action');
    httpMock.expectOne(r => r.url === `${environment.apiUrl}/audit-log`).flush(mockResponse);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(scroll).not.toHaveBeenCalled();
  });

  it("should not link to a deleted tournament's management page", () => {
    flushInitialLoad({ ...mockResponse, rows: [{ ...mockEntry, tournament_deleted_at: '2026-08-15T00:00:00Z' }] });
    fixture.detectChanges();
    const links: HTMLAnchorElement[] = Array.from(fixture.nativeElement.querySelectorAll('.audit-table a'));
    expect(links.some(a => a.getAttribute('href')?.startsWith('/admin/tournament/'))).toBeFalse();
    expect(links.some(a => a.getAttribute('href') === '/admin/deleted-tournaments')).toBeTrue();
  });
});
