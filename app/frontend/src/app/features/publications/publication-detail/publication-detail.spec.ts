import {
  ComponentFixture,
  TestBed
} from '@angular/core/testing';

import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter
} from '@angular/router';

import {
  of,
  throwError
} from 'rxjs';

import {
  vi
} from 'vitest';

import {
  PublicationDetail
} from './publication-detail';

import {
  PublicationDetail as PublicationDetailModel
} from '../models/publication-detail.model';

import {
  PublicationService
} from '../services/publication.service';

describe('PublicationDetail', () => {
  let fixture:
    ComponentFixture<PublicationDetail>;

  let component:
    PublicationDetail;

  const publicationServiceMock = {
    getPublicationById: vi.fn()
  };

  const activatedRouteMock = {
    snapshot: {
      paramMap:
        convertToParamMap({
          id: 'PUB-2024-0891'
        }),

      queryParamMap:
        convertToParamMap({})
    }
  };

  const publication:
    PublicationDetailModel = {
      id: 'PUB-2024-0891',
      categoria: 'electronicos',
      subcategoria: 'laptops',
      titulo:
        'Laptop Lenovo ThinkPad T480s i7 16GB RAM + Mochila TEC',
      descripcion:
        'Laptop Lenovo ThinkPad T480s en excelentes condiciones.',
      precio: 180000,
      precioAnterior: 215000,
      condicion: 'como-nuevo',
      estado: 'activa',
      ubicacion: 'Campus TEC San Carlos',
      puntoEntrega: 'Biblioteca TEC',
      fechaPublicacion:
        '2026-09-25T10:00:00Z',

      imagenes: [
        'thinkpad-1.jpg',
        'thinkpad-2.jpg'
      ],

      especificaciones: {
        procesador:
          'Intel Core i7-8650U',
        memoriaRam:
          '16 GB DDR4',
        almacenamiento:
          '512 GB SSD NVMe',
        bateria:
          '92% de salud',
        garantia:
          '3 días de prueba'
      },

      incluye: [
        'Mochila oficial TEC',
        'Cargador Lenovo USB-C original'
      ],

      vendedor: {
        id: 101,
        nombre:
          'Sebastián Murillo',
        carrera:
          'Ingeniería en Computación',
        verificado: true,
        calificacion: 4.9,
        ventasRealizadas: 14,
        tiempoRespuesta: '< 15 min'
      }
    };

  beforeEach(async () => {
    publicationServiceMock
      .getPublicationById
      .mockReset();

    publicationServiceMock
      .getPublicationById
      .mockReturnValue(
        of(publication)
      );

    activatedRouteMock
      .snapshot
      .paramMap =
        convertToParamMap({
          id: 'PUB-2024-0891'
        });

    activatedRouteMock
      .snapshot
      .queryParamMap =
        convertToParamMap({});

    await TestBed.configureTestingModule({
      imports: [
        PublicationDetail
      ],

      providers: [
        provideRouter([]),

        {
          provide: ActivatedRoute,
          useValue: activatedRouteMock
        },

        {
          provide: PublicationService,
          useValue:
            publicationServiceMock
        }
      ]
    }).compileComponents();
  });

  function createComponent(): void {
    fixture =
      TestBed.createComponent(
        PublicationDetail
      );

    component =
      fixture.componentInstance;

    fixture.detectChanges();
  }

  it('should create the component', () => {
    createComponent();

    expect(component).toBeTruthy();
  });

  it('should request the publication using the route id', () => {
    createComponent();

    expect(
      publicationServiceMock
        .getPublicationById
    ).toHaveBeenCalledWith(
      'PUB-2024-0891'
    );
  });

  it('should load the publication successfully', () => {
    createComponent();

    expect(
      component.publication()
    ).toEqual(publication);

    expect(
      component.loading()
    ).toBe(false);

    expect(
      component.error()
    ).toBe(false);
  });

  it('should use the first gallery image after loading', () => {
    createComponent();

    expect(
      component.selectedImage()
    ).toBe(
      'thinkpad-1.jpg'
    );
  });

  it('should detect when navigation comes from my publications', () => {
    activatedRouteMock
      .snapshot
      .queryParamMap =
        convertToParamMap({
          from:
            'mis-publicaciones'
        });

    createComponent();

    expect(
      component.fromMyPublications()
    ).toBe(true);

    expect(
      component.backRoute()
    ).toBe(
      '/mis-publicaciones'
    );

    expect(
      component.backLabel()
    ).toBe(
      'Volver a mis publicaciones'
    );
  });

  it('should use the default return route when opened from home', () => {
    createComponent();

    expect(
      component.fromMyPublications()
    ).toBe(false);

    expect(
      component.backRoute()
    ).toBe('/');

    expect(
      component.backLabel()
    ).toBe(
      'Volver a publicaciones'
    );
  });

  it('should render the contextual breadcrumb for my publications', () => {
    activatedRouteMock
      .snapshot
      .queryParamMap =
        convertToParamMap({
          from:
            'mis-publicaciones'
        });

    createComponent();

    const breadcrumb:
      HTMLElement =
        fixture.nativeElement
          .querySelector(
            '.breadcrumb'
          );

    expect(
      breadcrumb.textContent
    ).toContain(
      'Mis Publicaciones'
    );

    expect(
      breadcrumb.textContent
    ).toContain(
      publication.titulo
    );
  });

  it('should link to the publication owner conversation', () => {
    createComponent();

    const messageLink:
      HTMLAnchorElement =
        fixture.nativeElement
          .querySelector(
            '.seller-card__message'
          );

    expect(messageLink).toBeTruthy();
    expect(messageLink.textContent)
      .toContain('Enviar mensaje');
    expect(messageLink.getAttribute('href'))
      .toContain('/mensajes?');
    expect(messageLink.getAttribute('href'))
      .toContain('publicacion=PUB-2024-0891');
    expect(messageLink.getAttribute('href'))
      .toContain('vendedor=101');
  });

  it('should not offer messaging from my own publication', () => {
    activatedRouteMock
      .snapshot
      .queryParamMap =
        convertToParamMap({
          from:
            'mis-publicaciones'
        });

    createComponent();

    expect(
      fixture.nativeElement
        .querySelector(
          '.seller-card__message'
        )
    ).toBeNull();
  });

  it('should set an error when the route has no publication id', () => {
    activatedRouteMock
      .snapshot
      .paramMap =
        convertToParamMap({});

    createComponent();

    expect(
      publicationServiceMock
        .getPublicationById
    ).not.toHaveBeenCalled();

    expect(
      component.loading()
    ).toBe(false);

    expect(
      component.error()
    ).toBe(true);
  });

  it('should set an error when the API request fails', () => {
    publicationServiceMock
      .getPublicationById
      .mockReturnValue(
        throwError(
          () =>
            new Error(
              'API error'
            )
        )
      );

    createComponent();

    expect(
      component.publication()
    ).toBeNull();

    expect(
      component.loading()
    ).toBe(false);

    expect(
      component.error()
    ).toBe(true);
  });

  it('should preserve the contextual back route when the API request fails', () => {
    activatedRouteMock
      .snapshot
      .queryParamMap =
        convertToParamMap({
          from:
            'mis-publicaciones'
        });

    publicationServiceMock
      .getPublicationById
      .mockReturnValue(
        throwError(
          () =>
            new Error(
              'Not found'
            )
        )
      );

    createComponent();

    expect(
      component.backRoute()
    ).toBe(
      '/mis-publicaciones'
    );

    expect(
      component.backLabel()
    ).toBe(
      'Volver a mis publicaciones'
    );

    const backLink:
      HTMLAnchorElement =
        fixture.nativeElement
          .querySelector(
            '.state-message a'
          );

    expect(
      backLink.getAttribute(
        'href'
      )
    ).toBe(
      '/mis-publicaciones'
    );
  });

  it('should return multiple gallery images', () => {
    createComponent();

    expect(
      component.getGalleryImages(
        publication
      )
    ).toEqual([
      'thinkpad-1.jpg',
      'thinkpad-2.jpg'
    ]);
  });

  it('should use the single image when imagenes is unavailable', () => {
    createComponent();

    const singleImagePublication:
      PublicationDetailModel = {
        ...publication,
        imagenes: undefined,
        imagen: 'single.jpg'
      };

    expect(
      component.getGalleryImages(
        singleImagePublication
      )
    ).toEqual([
      'single.jpg'
    ]);
  });

  it('should use the placeholder when no images exist', () => {
    createComponent();

    const publicationWithoutImages:
      PublicationDetailModel = {
        ...publication,
        imagenes: undefined,
        imagen: undefined
      };

    expect(
      component.getGalleryImages(
        publicationWithoutImages
      )
    ).toEqual([
      '/images/publication-placeholder.svg'
    ]);
  });

  it('should change the selected image', () => {
    createComponent();

    component.selectImage(
      'thinkpad-2.jpg'
    );

    expect(
      component.selectedImage()
    ).toBe(
      'thinkpad-2.jpg'
    );
  });

  it('should format publication values', () => {
    createComponent();

    expect(
      component.formatCondition(
        'como-nuevo'
      )
    ).toBe(
      'Como Nuevo'
    );

    expect(
      component.formatCondition(
        null
      )
    ).toBe(
      'No especificada'
    );

    expect(
      component.formatCategory(
        'produccion-industrial'
      )
    ).toBe(
      'Produccion Industrial'
    );

    expect(
      component.formatPrice(
        180000
      )
    ).toBe(
      new Intl.NumberFormat(
        'es-CR'
      ).format(180000)
    );
  });

  it('should replace a broken image with the placeholder', () => {
    createComponent();

    const image =
      document.createElement('img');

    component.onImageError({
      target: image
    } as unknown as Event);

    expect(
      image.src
    ).toContain(
      '/images/publication-placeholder.svg'
    );
  });
});
