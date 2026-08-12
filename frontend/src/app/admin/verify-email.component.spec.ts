// src/app/admin/verify-email.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { VerifyEmailComponent } from './verify-email.component';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';

describe('VerifyEmailComponent', () => {
  let component: VerifyEmailComponent;
  let fixture: ComponentFixture<VerifyEmailComponent>;
  let httpMock: HttpTestingController;

  async function setup(queryParams: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [VerifyEmailComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VerifyEmailComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should show an error and not call the API when token is missing', async () => {
    await setup();
    httpMock.expectNone(`${environment.apiUrl}/auth/verify-email`);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('This verification link is missing required information.');
  });

  it('should auto-verify on load and show the success message', async () => {
    await setup({ token: 'tok123' });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/verify-email`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'tok123' });
    req.flush({ message: 'Email verified. You can now sign in.' });

    expect(component.loading()).toBe(false);
    expect(component.success()).toBe('Email verified. You can now sign in.');
  });

  it('should show an error when verification fails', async () => {
    await setup({ token: 'bad-token' });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/verify-email`);
    req.flush({ error: 'Invalid or expired verification link' }, { status: 400, statusText: 'Bad Request' });

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('Invalid or expired verification link');
  });
});
