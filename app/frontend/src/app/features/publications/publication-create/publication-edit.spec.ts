import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, firstValueFrom } from 'rxjs';
import { routes } from '../../../app.routes';
import { AuthSessionService } from '../../../core/auth/v2/auth-session.service';
import { AUTH_V2_BUSINESS_TRANSPORT } from '../../../core/auth/v2/business-transport';
import { DEFAULT_FEATURE_FLAGS, FEATURE_FLAGS } from '../../../core/feature-flags';
import { GoogleAuthService } from '../../auth/services/google-auth.service';
import { PublicationDetail } from '../models/publication-detail.model';
import { PublicationFeedbackService } from '../services/publication-feedback.service';
import { PublicationCreate } from './publication-create';

describe('Edición de una publicación desde Mis publicaciones', () => {
  const identity = { userId: 'usr-propietario', epoch: 1 };
  const detail: PublicationDetail = {
    id: 'monitor-dell', categoria: 'electronicos', subcategoria: '', titulo: 'Monitor Dell',
    descripcion: '', precio: 0, condicion: null, ubicacion: '', estado: 'activo',
    fechaPublicacion: '2026-11-11T00:00:00Z',
    imagenes: ['https://example.invalid/monitor.jpg'],
    vendedor: { id: null, userId: identity.userId, nombre: 'Vendedor', carrera: '', verificado: true },
  };
  const editUrl = '/publicaciones/monitor-dell/editar';
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
        { provide: FEATURE_FLAGS, useValue: {
          ...DEFAULT_FEATURE_FLAGS, authCoreV2: true, authCoreV2Adapter: 'http', catalogInternalJwt: true,
        } },
        { provide: AUTH_V2_BUSINESS_TRANSPORT, useValue: 'restricted' },
        { provide: GoogleAuthService, useValue: { restoreSession: async () => true } },
        { provide: AuthSessionService, useValue: {
          currentIdentity: () => identity,
          isCurrentIdentity: (value: typeof identity) => value === identity,
        } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    TestBed.inject(PublicationFeedbackService).dismiss();
    http.verify();
  });

  function flushList(item: PublicationDetail): void {
    http.expectOne(req => req.method === 'GET' && req.url.endsWith('/publicaciones'))
      .flush({ items: [item], totalRecords: 1, page: 1, pageSize: 100 });
  }

  function flushDetail(item: PublicationDetail): void {
    http.expectOne(req => req.method === 'GET' && req.url.endsWith('/publicaciones/monitor-dell')).flush(item);
  }

  it('abre el enlace Editar, guarda por PUT y vuelve a mostrar el título actualizado', async () => {
    const harness = await RouterTestingHarness.create('/mis-publicaciones');
    flushList(detail);
    harness.detectChanges();
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a[aria-label="Editar Monitor Dell"]');
    expect(link?.getAttribute('href')).toBe(editUrl);

    const form = await harness.navigateByUrl(link!.getAttribute('href')!, PublicationCreate);
    flushDetail(detail);
    harness.detectChanges();
    expect(form.form.getRawValue()).toMatchObject({ titulo: 'Monitor Dell', precio: 0, condicion: null });
    const title = harness.routeNativeElement!.querySelector<HTMLInputElement>('#publication-title')!;
    title.value = 'Monitor Dell 24 pulgadas';
    title.dispatchEvent(new Event('input'));
    harness.detectChanges();
    const save = harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(save.disabled).toBe(false);
    expect(save.textContent).toContain('Guardar cambios');
    save.click();
    const update = http.expectOne(req => req.method === 'PUT' && req.url.endsWith('/publicaciones/monitor-dell'));
    expect(update.request.body).toEqual({
      categoria: 'electronicos', subcategoria: '', titulo: title.value, descripcion: '',
      precio: 0, condicion: null, ubicacion: '', imagenes: detail.imagenes,
    });

    const navigation = firstValueFrom(TestBed.inject(Router).events.pipe(
      filter(event => event instanceof NavigationEnd),
    ));
    const updated = { ...detail, titulo: title.value };
    update.flush(updated);
    await navigation;
    harness.detectChanges();
    flushList(updated);
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/mis-publicaciones');
    expect(harness.routeNativeElement?.textContent).toContain(updated.titulo);
    expect(TestBed.inject(PublicationFeedbackService).saved()).toBe('updated');
  });

  it('bloquea el formulario cuando el usuario abre directamente la edición de una publicación ajena', async () => {
    const harness = await RouterTestingHarness.create(editUrl);
    flushDetail({ ...detail, vendedor: { ...detail.vendedor, userId: 'usr-otro' } });
    harness.detectChanges();

    expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('Solo el propietario puede editar');
    http.expectNone(req => req.method === 'PUT');
  });

  it('conserva los cambios del formulario si el servidor rechaza el PUT con 403', async () => {
    const harness = await RouterTestingHarness.create();
    const form = await harness.navigateByUrl(editUrl, PublicationCreate);
    flushDetail(detail);
    form.form.controls.titulo.setValue('Monitor Dell editado');
    form.submit();
    http.expectOne(req => req.method === 'PUT').flush(null, { status: 403, statusText: 'Forbidden' });
    harness.detectChanges();

    expect(TestBed.inject(Router).url).toBe(editUrl);
    expect(form.form.controls.titulo.value).toBe('Monitor Dell editado');
    expect(harness.routeNativeElement?.textContent).toContain('Solo el propietario puede editar');
    expect(TestBed.inject(PublicationFeedbackService).saved()).toBeNull();
  });
});
