// src/app/admin/register.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RegisterComponent } from './register.component';
import { AuthService } from '../shared/services/auth.service';
import { environment } from '../../environments/environment';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.removeItem('bb_token');
    await TestBed.configureTestingModule({
      imports: [RegisterComponent, HttpClientTestingModule],
      providers: [AuthService, provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate required fields before calling the API', () => {
    component.username = '';
    component.email = '';
    component.password = '';

    component.register();

    httpMock.expectNone(`${environment.apiUrl}/auth/register`);
    expect(component.error()).toBe('Enter a username, valid email, and password of at least 12 characters.');
  });

  it('should show a check-your-email message on success without logging in', () => {
    component.username = 'newuser';
    component.email = 'newuser@example.com';
    component.password = 'longenoughpassword';

    component.register();
    expect(component.loading()).toBe(true);

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'longenoughpassword',
    });
    req.flush({ message: 'Account created. Check your email to verify your address before signing in.' });

    expect(component.loading()).toBe(false);
    expect(component.success()).toBe('Account created. Check your email to verify your address before signing in.');
    expect(localStorage.getItem('bb_token')).toBeNull();
  });

  it('should show an error on failed registration', () => {
    component.username = 'newuser';
    component.email = 'newuser@example.com';
    component.password = 'longenoughpassword';

    component.register();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
    req.flush({ error: 'That username or email address is already registered' }, { status: 409, statusText: 'Conflict' });

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe('That username or email address is already registered');
  });
});
