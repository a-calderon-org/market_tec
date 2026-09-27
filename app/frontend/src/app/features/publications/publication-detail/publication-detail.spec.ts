import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { PublicationDetail } from './publication-detail';
import { PublicationDetail as PublicationDetailModel } from '../models/publication-detail.model';
import { PublicationService } from '../services/publication.service';

describe('PublicationDetail', () => {
  let fixture: ComponentFixture<PublicationDetail>;
  let component: PublicationDetail;

  const publicationServiceMock = {
    getPublicationById: vi.fn()
  };

  const activatedRouteMock = {
    snapshot: {
      paramMap: convertToParamMap({
        id: 'PUB-2024-0891'
      })
    }
  };

  const publication: PublicationDetailModel = {
    id: 'PUB-2024-0891',
    categoria: 'electronicos',
    subcategoria: 'laptops',
    titulo: 'Laptop Lenovo ThinkPad T480s i7 16GB RAM + Mochila TEC',
    descripcion:
      'Laptop Lenovo ThinkPad T480s en excelentes condiciones.',
    precio: 180000,
    precioAnterior: 215000,
    condicion: 'como-nuevo',
    estado: 'activa',
    ubicacion: 'Campus TEC San Carlos',
    puntoEntrega: 'Biblioteca TEC',
    fechaPublicacion: '2026-09-25T10:00:00Z',

    imagenes: [
      'https://example.com/images/thinkpad-1.jpg',
      'https://example.com/images/thinkpad-2.jpg',
      'https://example.com/images/thinkpad-3.jpg'
    ],

    especificaciones: {
      procesador: 'Intel Core i7-8650U',
      memoriaRam: '16 GB DDR4',
      almacenamiento: '512 GB SSD NVMe',
      bateria: '92% de salud',
      garantia: '3 días de prueba'
    },

    incluye: [
      'Mochila oficial TEC',
      'Cargador Lenovo USB-C original',
      'Windows 11 Pro activado'
    ],

    vendedor: {
      id: 101,
      nombre: 'Sebastián Murillo',
      carrera: 'Ingeniería en Computación',
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

    activatedRouteMock.snapshot.paramMap =
      convertToParamMap({
        id: 'PUB-2024-0891'
      });

    publicationServiceMock
      .getPublicationById
      .mockReturnValue(
        of(publication)
      );

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
          useValue: publicationServiceMock
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
      publicationServiceMock.getPublicationById
    ).toHaveBeenCalledWith(
      'PUB-2024-0891'
    );

    expect(
      publicationServiceMock.getPublicationById
    ).toHaveBeenCalledTimes(1);
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

  it('should select the first gallery image after loading', () => {
    createComponent();

    expect(
      component.selectedImage()
    ).toBe(
      publication.imagenes![0]
    );
  });

  it('should set the error state when the service fails', () => {
    publicationServiceMock
      .getPublicationById
      .mockReturnValue(
        throwError(
          () => new Error('API error')
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

  it('should set the error state when the route has no publication id', () => {
    activatedRouteMock.snapshot.paramMap =
      convertToParamMap({});

    createComponent();

    expect(
      publicationServiceMock.getPublicationById
    ).not.toHaveBeenCalled();

    expect(
      component.loading()
    ).toBe(false);

    expect(
      component.error()
    ).toBe(true);
  });

  it('should return the gallery images when imagenes is available', () => {
    createComponent();

    const images =
      component.getGalleryImages(
        publication
      );

    expect(images).toEqual(
      publication.imagenes
    );
  });

  it('should use imagen when imagenes is not available', () => {
    createComponent();

    const publicationWithSingleImage:
      PublicationDetailModel = {
        ...publication,
        imagenes: undefined,
        imagen: 'single-image.jpg'
      };

    expect(
      component.getGalleryImages(
        publicationWithSingleImage
      )
    ).toEqual([
      'single-image.jpg'
    ]);
  });

  it('should use the placeholder when no images are available', () => {
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

  it('should change the selected gallery image', () => {
    createComponent();

    component.selectImage(
      'second-image.jpg'
    );

    expect(
      component.selectedImage()
    ).toBe(
      'second-image.jpg'
    );
  });

  it('should format publication values correctly', () => {
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

  it('should replace a broken image with the local placeholder', () => {
    createComponent();

    const image =
      document.createElement(
        'img'
      );

    component.onImageError({
      target: image
    } as unknown as Event);

    expect(
      image.src
    ).toContain(
      '/images/publication-placeholder.svg'
    );
  });

  it('should render optional publication detail information', () => {
    createComponent();

    const element: HTMLElement =
      fixture.nativeElement;

    expect(
      element.textContent
    ).toContain(
      publication.titulo
    );

    expect(
      element.textContent
    ).toContain(
      'Intel Core i7-8650U'
    );

    expect(
      element.textContent
    ).toContain(
      '16 GB DDR4'
    );

    expect(
      element.textContent
    ).toContain(
      'Biblioteca TEC'
    );

    expect(
      element.textContent
    ).toContain(
      'Sebastián Murillo'
    );

    expect(
      element.textContent
    ).toContain(
      '4.9'
    );
  });
});