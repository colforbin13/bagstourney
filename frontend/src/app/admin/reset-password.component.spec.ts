// src/app/admin/reset-password.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ResetPasswordComponent } from './reset-password.component';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let httpMock: HttpTestingController;

  async function setup(queryParams: Record<string, string> = {}) {
    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent, HttpClientTestingModule],
      providers: [
        TournamentService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('should prefill the token from the query string', async () => {
    await setup({ token: 'from-url-token' });
    expect(component.token).toBe('from-url-token');
  });

  it('should display validation error if fields are empty', async () => {
    await setup();
    component.resetPassword();
    expect(component.error()).toBe('All fields are required.');
  });

  it('should display error if password too short', async () => {
    await setup();
    component.token = 'abc123';
    component.newPassword = 'short';
    component.confirmPassword = 'short';

    component.resetPassword();

    expect(component.error()).toBe('New password must be at least 12 characters.');
  });

  it('should display error if passwords do not match', async () => {
    await setup();
    component.token = 'abc123';
    component.newPassword = 'newPassword1234';
    component.confirmPassword = 'differentPass12';

    component.resetPassword();

    expect(component.error()).toBe('Passwords do not match.');
  });

  it('should submit reset password request with valid input', async () => {
    await setup();
    component.token = 'abc123';
    component.newPassword = 'newPassword1234';
    component.confirmPassword = 'newPassword1234';

    component.resetPassword();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      token: 'abc123',
      new_password: 'newPassword1234',
    });

    req.flush({ message: 'Password reset successfully' });

    expect(component.success()).toBe('Password reset. You can now sign in with your new password.');
  });

  it('should display error on failed reset', async () => {
    await setup();
    component.token = 'bad-token';
    component.newPassword = 'newPassword1234';
    component.confirmPassword = 'newPassword1234';

    component.resetPassword();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
    req.flush({ error: 'Invalid or expired reset token' }, { status: 400, statusText: 'Bad Request' });

    expect(component.error()).toBe('Invalid or expired reset token');
  });

  it('should disable button while loading', async () => {
    await setup();
    component.token = 'abc123';
    component.newPassword = 'newPassword1234';
    component.confirmPassword = 'newPassword1234';

    component.resetPassword();
    expect(component.loading()).toBe(true);

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
    req.flush({ message: 'Password reset successfully' });

    expect(component.loading()).toBe(false);
  });
});
