import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { App } from './app';
import { GoogleAuthService } from './features/auth/services/google-auth.service';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let googleAuth: GoogleAuthService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])]
    }).compileComponents();

    googleAuth = TestBed.inject(GoogleAuthService);
    router = TestBed.inject(Router);
    googleAuth.user.set(null);

    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
  });

  it('should create the application shell', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show only an icon for the login theme control', () => {
    const themeButton = fixture.nativeElement.querySelector('.header-icon-button') as HTMLButtonElement;

    expect(themeButton).toBeTruthy();
    expect(themeButton.textContent?.trim()).toBe('');
    expect(themeButton.getAttribute('aria-label')).toContain('Cambiar a modo');
  });

  it('should group authenticated navigation in the global header', () => {
    googleAuth.user.set({
      id: 'google-user',
      email: 'usuario@estudiantec.cr',
      name: 'Usuario TEC'
    });
    fixture.detectChanges();

    const header = fixture.nativeElement.querySelector('.app-header') as HTMLElement;
    const links = Array.from(
      header.querySelectorAll<HTMLAnchorElement>('.app-navigation a')
    );

    expect(header).toBeTruthy();
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/', '/mensajes', '/mis-publicaciones'
    ]);
    expect(
      header.querySelector<HTMLButtonElement>('.profile-avatar')?.getAttribute('aria-expanded')
    ).toBe('false');
    expect(header.querySelector('.profile-avatar')?.textContent?.trim()).toBe('UT');
    expect(
      header.querySelector('.app-header__actions')?.lastElementChild
        ?.classList.contains('profile-avatar')
    ).toBe(true);
    expect(header.textContent).toContain('Cerrar sesión');
  });

  it('should log out from the global header and return to login', async () => {
    googleAuth.user.set({
      id: 'google-user',
      email: 'usuario@estudiantec.cr',
      name: 'Usuario TEC'
    });
    fixture.detectChanges();

    vi.spyOn(googleAuth, 'logout').mockImplementation(async () => {
      googleAuth.user.set(null);
    });
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const button = fixture.nativeElement.querySelector('.logout-button') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();

    expect(googleAuth.logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
