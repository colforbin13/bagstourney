// src/app/notifications/unsubscribe.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { UnsubscribeComponent } from './unsubscribe.component';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';

describe('UnsubscribeComponent', () => {
  let component: UnsubscribeComponent;
  let fixture: ComponentFixture<UnsubscribeComponent>;
  let httpMock: HttpTestingController;

  async function setup(queryParams: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [UnsubscribeComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UnsubscribeComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', async () => {
    await setup({ pid: '7', token: 'tok123', category: 'match_completed' });
    expect(component).toBeTruthy();
  });

  it('should flag an invalid link and not call the API automatically', async () => {
    await setup({ pid: '7', token: 'tok123', category: 'not_a_real_category' });
    expect(component.invalidLink()).toBe(true);
    httpMock.expectNone(`${environment.apiUrl}/notifications/unsubscribe`);
  });

  it('should not call the API until the confirm button is clicked', async () => {
    await setup({ pid: '7', token: 'tok123', category: 'round_completed' });
    httpMock.expectNone(`${environment.apiUrl}/notifications/unsubscribe`);
    expect(component.categoryLabel()).toBe('round completed');
  });

  it('should call the API and show success when confirmed', async () => {
    await setup({ pid: '7', token: 'tok123', category: 'round_completed' });

    component.confirm();

    const req = httpMock.expectOne(`${environment.apiUrl}/notifications/unsubscribe`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ participant_id: 7, token: 'tok123', category: 'round_completed' });
    req.flush({ message: 'You will no longer receive these emails.' });

    expect(component.loading()).toBe(false);
    expect(component.success()).toBe('You will no longer receive these emails.');
  });

  it('should show an error when the API call fails', async () => {
    await setup({ pid: '7', token: 'bad-token', category: 'round_completed' });

    component.confirm();

    const req = httpMock.expectOne(`${environment.apiUrl}/notifications/unsubscribe`);
    req.flush({ error: 'Invalid or expired link' }, { status: 400, statusText: 'Bad Request' });

    expect(component.error()).toBe('Invalid or expired link');
  });
});
