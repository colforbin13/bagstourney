// src/app/admin/profile.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { ProfileComponent } from './profile.component';
import { AuthService, AuthenticatedUser } from '../shared/services/auth.service';
import { ChangePasswordComponent } from './change-password.component';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let authService: AuthService;

  const organizerUser: AuthenticatedUser = {
    id: 1, username: 'alice', email: 'alice@example.com', role: 'organizer',
  };

  async function setup(user: AuthenticatedUser | null) {
    await TestBed.configureTestingModule({
      imports: [ProfileComponent, HttpClientTestingModule],
      providers: [AuthService, Router],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    spyOn(authService, 'user').and.returnValue(user);
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup(organizerUser);
    expect(component).toBeTruthy();
  });

  it('should display the current user\'s username and email', async () => {
    await setup(organizerUser);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('alice');
    expect(text).toContain('alice@example.com');
  });

  it('should show "Organizer" for a non-super-admin role', async () => {
    await setup(organizerUser);
    expect(fixture.nativeElement.textContent).toContain('Organizer');
  });

  it('should show "Super Admin" for a super_admin role', async () => {
    await setup({ ...organizerUser, role: 'super_admin' });
    expect(fixture.nativeElement.textContent).toContain('Super Admin');
  });

  it('should render the change password form', async () => {
    await setup(organizerUser);
    expect(fixture.debugElement.query(By.directive(ChangePasswordComponent))).toBeTruthy();
  });
});
