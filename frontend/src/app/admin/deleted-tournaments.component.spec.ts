// src/app/admin/deleted-tournaments.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DeletedTournamentsComponent } from './deleted-tournaments.component';
import { confirmService } from '../shared/services/confirm.service';
import { Tournament } from '../shared/models/tournament.models';
import { environment } from '../../environments/environment';

describe('DeletedTournamentsComponent', () => {
  let fixture: ComponentFixture<DeletedTournamentsComponent>;
  let component: DeletedTournamentsComponent;
  let httpMock: HttpTestingController;

  const listUrl = `${environment.apiUrl}/tournaments/deleted`;
  const deleted = [
    { id: 7, name: 'Spring Fundraiser Classic', deleted_at: '2026-11-16T12:00:00Z' },
    { id: 8, name: 'Thursday Bags', deleted_at: '2026-11-17T12:00:00Z' },
  ] as unknown as Tournament[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeletedTournamentsComponent, HttpClientTestingModule],
    }).compileComponents();
    fixture = TestBed.createComponent(DeletedTournamentsComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function loadWith(list: Tournament[]) {
    fixture.detectChanges();
    httpMock.expectOne(listUrl).flush(list);
    fixture.detectChanges();
  }

  it('lists deleted tournaments as rows with a count', () => {
    loadWith(deleted);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.list-row').length).toBe(2);
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('2');
    expect(el.textContent).toContain('Spring Fundraiser Classic');
    expect(el.querySelector('button')?.getAttribute('aria-label')).toBe('Restore Spring Fundraiser Classic');
  });

  it('says so when there is nothing to restore', () => {
    loadWith([]);
    expect(fixture.nativeElement.textContent).toContain('No deleted tournaments.');
  });

  it('reports a failed load instead of claiming the list is empty, and retries', () => {
    fixture.detectChanges();
    httpMock.expectOne(listUrl).flush({}, { status: 500, statusText: 'err' });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Could not load deleted tournaments.');
    expect(el.textContent).not.toContain('No deleted tournaments.');

    (el.querySelector('.error-banner button') as HTMLButtonElement).click();
    httpMock.expectOne(listUrl).flush(deleted);
    fixture.detectChanges();
    expect(el.querySelectorAll('.list-row').length).toBe(2);
  });

  it('removes a restored tournament and confirms it', async () => {
    loadWith(deleted);
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));

    await component.restore(deleted[0]);
    httpMock.expectOne(`${environment.apiUrl}/tournaments/7/restore`).flush(deleted[0]);

    expect(component.tournaments().map(t => t.id)).toEqual([8]);
    expect(component.toastType()).toBe('success');
    expect(component.toast()).toContain('restored');
  });

  it('keeps the tournament and says so when a restore fails', async () => {
    loadWith(deleted);
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(true));

    await component.restore(deleted[0]);
    httpMock.expectOne(`${environment.apiUrl}/tournaments/7/restore`).flush({}, { status: 500, statusText: 'err' });

    expect(component.tournaments().length).toBe(2);
    expect(component.restoringId()).toBeNull();
    expect(component.toastType()).toBe('error');
    expect(component.toast()).toContain('Could not restore');
  });

  it('does nothing when the restore is cancelled', async () => {
    loadWith(deleted);
    spyOn(confirmService, 'confirm').and.returnValue(Promise.resolve(false));
    await component.restore(deleted[0]);
    httpMock.expectNone(`${environment.apiUrl}/tournaments/7/restore`);
  });
});
