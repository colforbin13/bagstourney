// src/app/admin/change-password.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ChangePasswordComponent } from './change-password.component';
import { TournamentService } from '../shared/services/tournament.service';
import { environment } from '../../environments/environment';
import {} from 'jasmine';

describe('ChangePasswordComponent', () => {
  let component: ChangePasswordComponent;
  let fixture: ComponentFixture<ChangePasswordComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChangePasswordComponent, HttpClientTestingModule],
      providers: [TournamentService]
    }).compileComponents();

    fixture = TestBed.createComponent(ChangePasswordComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display validation error if fields are empty', () => {
    component.changePassword();
    expect(component.error()).toBe('All fields are required.');
  });

  it('should display error if password too short', () => {
    component.currentPassword = 'current123';
    component.newPassword = 'short';
    component.confirmPassword = 'short';
    
    component.changePassword();
    
    expect(component.error()).toBe('New password must be at least 12 characters.');
  });

  it('should display error if passwords do not match', () => {
    component.currentPassword = 'currentPass123';
    component.newPassword = 'newPassword1234';
    component.confirmPassword = 'differentPass12';
    
    component.changePassword();
    
    expect(component.error()).toBe('Passwords do not match.');
  });

  it('should submit change password request with valid input', () => {
    component.currentPassword = 'currentPass123';
    component.newPassword = 'newPassword1234';
    component.confirmPassword = 'newPassword1234';
    
    component.changePassword();
    
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/change-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      current_password: 'currentPass123',
      new_password: 'newPassword1234'
    });
    
    req.flush({ message: 'Password changed successfully' });
    
    expect(component.currentPassword).toBe('');
    expect(component.newPassword).toBe('');
    expect(component.confirmPassword).toBe('');
    expect(component.success()).toBe('Password changed successfully!');
  });

  it('should display error on failed password change', () => {
    component.currentPassword = 'currentPass123';
    component.newPassword = 'newPassword1234';
    component.confirmPassword = 'newPassword1234';
    
    component.changePassword();
    
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/change-password`);
    req.error(new ErrorEvent('Unauthorized'), { status: 401 });
    
    expect(component.error()).toContain('Failed to change password');
  });

  it('should disable button while loading', () => {
    component.currentPassword = 'currentPass123';
    component.newPassword = 'newPassword1234';
    component.confirmPassword = 'newPassword1234';
    
    component.changePassword();
    expect(component.loading()).toBe(true);
    
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/change-password`);
    req.flush({ message: 'Password changed successfully' });
    
    expect(component.loading()).toBe(false);
  });
});
