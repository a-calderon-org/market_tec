import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthApiError } from '../../core/auth/v2/auth-contract';
import { PasswordCredentialsService } from '../../core/auth/v2/password-credentials.service';
import { PasswordSetup } from './password-setup';

describe('PasswordSetup', () => {
  let fixture: ComponentFixture<PasswordSetup>;
  let component: PasswordSetup;
  let router: Router;
  const passwords = { status: vi.fn(), setInitial: vi.fn() };
  const STRONG = 'correct horse battery';

  async function open(status: { configured: boolean; setupAvailable: boolean } | Error): Promise<void> {
    TestBed.resetTestingModule();
    passwords.status.mockReset();
    passwords.setInitial.mockReset().mockResolvedValue(undefined);
    if (status instanceof Error) passwords.status.mockRejectedValue(status);
    else passwords.status.mockResolvedValue(status);
    await TestBed.configureTestingModule({
      imports: [PasswordSetup],
      providers: [provideRouter([]), { provide: PasswordCredentialsService, useValue: passwords }],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(PasswordSetup);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
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
    component.form.setValue({ contrasena: 'short', confirmacion: 'short' });
    component.form.markAllAsTouched();
    fixture.detectChanges();
    expect(text()).toContain('Usa al menos 10 caracteres');
    expect(submit.disabled).toBe(true);
    component.form.setValue({ contrasena: STRONG, confirmacion: 'something else 1' });
    component.form.markAllAsTouched();
    fixture.detectChanges();
    expect(text()).toContain('no coinciden');
    expect(submit.disabled).toBe(true);
    component.form.setValue({ contrasena: STRONG, confirmacion: STRONG });
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
    component.form.setValue({ contrasena: 'x'.repeat(129), confirmacion: 'x'.repeat(129) });
    expect(component.form.controls.contrasena.hasError('maxlength')).toBe(true);
  });

  it('saves with the real endpoint, clears the form and confirms', async () => {
    await open({ configured: false, setupAvailable: true });
    component.form.setValue({ contrasena: STRONG, confirmacion: STRONG });
    await component.submit();
    fixture.detectChanges();
    expect(passwords.setInitial).toHaveBeenCalledExactlyOnceWith(STRONG);
    expect(component.state()).toBe('done');
    expect(component.form.getRawValue()).toEqual({ contrasena: '', confirmacion: '' });
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
      component.form.setValue({ contrasena: STRONG, confirmacion: STRONG });
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
