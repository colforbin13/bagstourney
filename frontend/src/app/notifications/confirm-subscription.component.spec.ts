// src/app/notifications/confirm-subscription.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ConfirmSubscriptionComponent } from './confirm-subscription.component';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';

describe('ConfirmSubscriptionComponent', () => {
  let component: ConfirmSubscriptionComponent;
  let fixture: ComponentFixture<ConfirmSubscriptionComponent>;
  let httpMock: HttpTestingController;

  async function setup(queryParams: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [ConfirmSubscriptionComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmSubscriptionComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', async () => {
    await setup({ pid: '7', token: 'tok123' });
    httpMock.expectOne(`${environment.apiUrl}/notifications/confirm`).flush({ message: 'Subscription confirmed.' });
    expect(component).toBeTruthy();
  });

  it('should show an error and not call the API when pid or token is missing', async () => {
    await setup();
    httpMock.expectNone(`${environment.apiUrl}/notifications/confirm`);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('This confirmation link is missing required information.');
  });

  it('should auto-confirm on load and show the success message', async () => {
    await setup({ pid: '7', token: 'tok123' });

    const req = httpMock.expectOne(`${environment.apiUrl}/notifications/confirm`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ participant_id: 7, token: 'tok123' });
    req.flush({ message: 'Subscription confirmed.', manage_preferences_url: 'https://example.com/notifications/preferences?pid=7&token=abc' });

    expect(component.loading()).toBe(false);
    expect(component.success()).toBe('Subscription confirmed.');
    expect(component.managePreferencesUrl()).toBe('https://example.com/notifications/preferences?pid=7&token=abc');
  });

  it('should show an error when confirmation fails', async () => {
    await setup({ pid: '7', token: 'bad-token' });

    const req = httpMock.expectOne(`${environment.apiUrl}/notifications/confirm`);
    req.flush({ error: 'Invalid or expired confirmation link' }, { status: 400, statusText: 'Bad Request' });

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('Invalid or expired confirmation link');
  });
});
