import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthApiError } from '../../core/auth/v2/auth-contract';
import { PasswordCredentialsService } from '../../core/auth/v2/password-credentials.service';
import { of, throwError } from 'rxjs';
import { User } from '../profile/models/user.model';
import { UserService } from '../profile/services/user.service';
import { PasswordSetup } from './password-setup';

describe('PasswordSetup', () => {
  let fixture: ComponentFixture<PasswordSetup>;
  let component: PasswordSetup;
  let router: Router;
  const passwords = { status: vi.fn(), setInitial: vi.fn() };
  const STRONG = 'correct horse battery';
  const users = { getMyProfile: vi.fn(), updateMyProfile: vi.fn() };
  const NEW_ACCOUNT: User = {
    id: 'u-1', nombreUsuario: 'u-1', nombre: 'Usuario', apellidos: '', correo: 'ana@estudiantec.cr',
    fotoPerfil: 'about:blank', fechaRegistro: '2026-11-10T00:00:00Z', verificado: true, estado: 'activo',
  };

  async function open(
    status: { configured: boolean; setupAvailable: boolean } | Error,
    profile?: User,
  ): Promise<void> {
    TestBed.resetTestingModule();
    passwords.status.mockReset();
    passwords.setInitial.mockReset().mockResolvedValue(undefined);
    users.getMyProfile.mockReset().mockReturnValue(profile ? of(profile) : throwError(() => new Error('no profile')));
    users.updateMyProfile.mockReset().mockImplementation((body) => of({ ...NEW_ACCOUNT, ...body }));
    if (status instanceof Error) passwords.status.mockRejectedValue(status);
    else passwords.status.mockResolvedValue(status);
    await TestBed.configureTestingModule({
      imports: [PasswordSetup],
      providers: [
        provideRouter([]),
        { provide: PasswordCredentialsService, useValue: passwords },
        { provide: UserService, useValue: users },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PasswordSetup);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    // El estado y el perfil se consultan en secuencia: se deja terminar toda la cadena asíncrona.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement;
  const text = (): string => el().textContent ?? '';

  it('shows the form only when the one-use setup grant exists', async () => {
    await open({ configured: false, setupAvailable: true });
    expect(component.state()).toBe('ready');
    expect(el().querySelectorAll('input[type="password"]').length).toBe(2);
    expect(text()).toContain('Configura tu contraseña');
    expect(text()).toContain('Omitir por ahora');
  });

  it('a new institutional account completes names and password together, never a username', async () => {
    // Perfil provisional que crea el Magic Link: nombre «Usuario», sin apellidos.
    await open({ configured: false, setupAvailable: true }, NEW_ACCOUNT);

    expect(component.askNames()).toBe(true);
    expect(text()).toContain('Completa tu registro');
    expect(el().querySelector('input[autocomplete="given-name"]')).not.toBeNull();
    expect(el().querySelector('input[autocomplete="family-name"]')).not.toBeNull();
    expect(el().querySelector('input[autocomplete="username"]')).toBeNull();
    expect(component.form.getRawValue().nombre).toBe('');

    component.form.patchValue({ contrasena: STRONG, confirmacion: STRONG });
    expect(component.form.invalid).toBe(true); // nombre y apellidos obligatorios
    component.form.patchValue({ nombre: ' Ana ', apellidos: ' Mora Solís ' });
    await component.submit();

    expect(users.updateMyProfile).toHaveBeenCalledExactlyOnceWith({
      nombreUsuario: 'u-1', nombre: 'Ana', apellidos: 'Mora Solís',
    });
    expect(passwords.setInitial).toHaveBeenCalledExactlyOnceWith(STRONG);
    expect(component.state()).toBe('done');
  });

  it('skipping the password still leads to the missing names', async () => {
    await open({ configured: false, setupAvailable: true }, NEW_ACCOUNT);
    await component.continueToApp();
    expect(router.navigate).toHaveBeenCalledWith(['/registro/datos'], { replaceUrl: true });
  });

  it('without a grant there is no form, and the student is told how to continue', async () => {
    await open({ configured: false, setupAvailable: false });
    expect(component.state()).toBe('unavailable');
    expect(el().querySelector('input')).toBeNull();
    expect(text()).toContain('verifica tu correo');
    expect(passwords.setInitial).not.toHaveBeenCalled();
  });

  it('an account that already has a password gets no form', async () => {
    await open({ configured: true, setupAvailable: false });
    expect(component.state()).toBe('configured');
    expect(el().querySelector('input')).toBeNull();
  });

  it('reports a failing status query instead of pretending the setup works', async () => {
    await open(new AuthApiError(503, 'AUTH_TEMPORARILY_UNAVAILABLE'));
    expect(component.state()).toBe('failed');
    expect(text()).toContain('No se pudo guardar la contraseña en este momento');
    expect(el().querySelector('input')).toBeNull();
  });

  it('validates length and confirmation; the submit is disabled until both are right', async () => {
    await open({ configured: false, setupAvailable: true });
    const submit = el().querySelector('form .login-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    component.form.patchValue({ contrasena: 'short', confirmacion: 'short' });
    component.form.markAllAsTouched();
    fixture.detectChanges();
    expect(text()).toContain('Usa al menos 10 caracteres');
    expect(submit.disabled).toBe(true);
    component.form.patchValue({ contrasena: STRONG, confirmacion: 'something else 1' });
    component.form.markAllAsTouched();
    fixture.detectChanges();
    expect(text()).toContain('no coinciden');
    expect(submit.disabled).toBe(true);
    component.form.patchValue({ contrasena: STRONG, confirmacion: STRONG });
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
    component.form.patchValue({ contrasena: 'x'.repeat(129), confirmacion: 'x'.repeat(129) });
    expect(component.form.controls.contrasena.hasError('maxlength')).toBe(true);
  });

  it('saves with the real endpoint, clears the form and confirms', async () => {
    await open({ configured: false, setupAvailable: true });
    component.form.patchValue({ contrasena: STRONG, confirmacion: STRONG });
    await component.submit();
    fixture.detectChanges();
    expect(passwords.setInitial).toHaveBeenCalledExactlyOnceWith(STRONG);
    expect(component.state()).toBe('done');
    expect(component.form.getRawValue()).toEqual({ contrasena: '', confirmacion: '', nombre: '', apellidos: '' });
    expect(text()).toContain('Contraseña guardada');
    expect(text()).toContain('sin pedir un enlace');
    (el().querySelector('.login-submit') as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true });
  });

  it('shows a specific message for weak or expired setups and keeps the form usable', async () => {
    await open({ configured: false, setupAvailable: true });
    for (const [code, expected] of [['WEAK_PASSWORD', 'demasiado débil'], ['PASSWORD_SETUP_NOT_AUTHORIZED', 'venció'],
      ['PASSWORD_ALREADY_SET', 'ya tiene una contraseña']] as const) {
      passwords.setInitial.mockRejectedValueOnce(new AuthApiError(422, code));
      component.form.patchValue({ contrasena: STRONG, confirmacion: STRONG });
      await component.submit();
      expect(component.errorMessage()).toContain(expected);
      expect(component.state()).toBe('ready');
      expect(component.saving()).toBe(false);
    }
  });

  it('never sends an invalid form and can be skipped', async () => {
    await open({ configured: false, setupAvailable: true });
    await component.submit();
    expect(passwords.setInitial).not.toHaveBeenCalled();
    await component.continueToApp();
    expect(router.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true });
  });

  it('toggles visibility of both fields', async () => {
    await open({ configured: false, setupAvailable: true });
    component.toggleVisibility();
    fixture.detectChanges();
    expect(el().querySelectorAll('input[type="text"]').length).toBe(2);
  });
});
