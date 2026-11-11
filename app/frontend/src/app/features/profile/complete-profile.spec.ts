import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CompleteProfile } from './complete-profile';
import { User } from './models/user.model';
import { needsNames, prefillNombre } from './profile-completion';
import { UserService } from './services/user.service';

const BASE: User = {
  id: 'u-1',
  nombreUsuario: 'u-1',
  nombre: 'Ana',
  apellidos: '',
  correo: 'ana@gmail.com',
  fotoPerfil: 'about:blank',
  fechaRegistro: '2026-11-10T00:00:00Z',
  verificado: true,
  estado: 'activo',
};

describe('profile completion rules', () => {
  it('asks only when apellidos are missing or the name is the creation placeholder', () => {
    expect(needsNames({ nombre: 'Ana', apellidos: 'Mora' })).toBe(false);
    expect(needsNames({ nombre: 'Ana', apellidos: '  ' })).toBe(true);
    expect(needsNames({ nombre: 'Google', apellidos: 'Mora' })).toBe(true);
    expect(needsNames({ nombre: 'Usuario', apellidos: '' })).toBe(true);
  });

  it('never prefills a placeholder as if it were the real name', () => {
    expect(prefillNombre({ nombre: 'Google' })).toBe('');
    expect(prefillNombre({ nombre: 'Usuario' })).toBe('');
    expect(prefillNombre({ nombre: ' Ana ' })).toBe('Ana');
  });
});

describe('CompleteProfile', () => {
  let fixture: ComponentFixture<CompleteProfile>;
  let component: CompleteProfile;
  let router: Router;
  const users = { getMyProfile: vi.fn(), updateMyProfile: vi.fn() };

  async function open(profile: User | Error): Promise<void> {
    TestBed.resetTestingModule();
    users.getMyProfile.mockReset().mockReturnValue(profile instanceof Error ? throwError(() => profile) : of(profile));
    users.updateMyProfile.mockReset().mockImplementation((body) => of({ ...BASE, ...body }));
    await TestBed.configureTestingModule({
      imports: [CompleteProfile],
      providers: [provideRouter([]), { provide: UserService, useValue: users }],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(CompleteProfile);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement;

  it('prefills the Google name, asks only for the missing data and never for a username or password', async () => {
    await open(BASE);
    expect(component.form.getRawValue()).toEqual({ nombre: 'Ana', apellidos: '' });
    expect(el().querySelector('input[autocomplete="username"]')).toBeNull();
    expect(el().querySelector('input[type="password"]')).toBeNull();

    component.form.patchValue({ apellidos: ' López ' });
    await component.submit();

    expect(users.updateMyProfile).toHaveBeenCalledExactlyOnceWith({
      nombreUsuario: 'u-1', nombre: 'Ana', apellidos: 'López',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true });
  });

  it('a complete profile goes straight to the app', async () => {
    await open({ ...BASE, apellidos: 'Mora' });
    expect(router.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true });
    expect(users.updateMyProfile).not.toHaveBeenCalled();
  });

  it('does not submit empty names', async () => {
    await open({ ...BASE, nombre: 'Google' });
    await component.submit();
    expect(users.updateMyProfile).not.toHaveBeenCalled();
  });

  it('a failed profile load never blocks access', async () => {
    await open(new Error('down'));
    expect(component.user()).toBeNull();
    expect(el().textContent).toContain('Continuar a MarketTEC');
  });
});
