import {
  ComponentFixture,
  TestBed
} from '@angular/core/testing';

import {
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
  MyPublications
} from './my-publications';

import {
  UserPublication
} from '../models/my-publications.model';

import {
  PublicationService
} from '../services/publication.service';

describe('MyPublications', () => {
  let fixture: ComponentFixture<MyPublications>;
  let component: MyPublications;

  const publicationServiceMock = {
    getUserPublications: vi.fn()
  };

  const publications: UserPublication[] = [
    {
      id: 'PUB-2024-0891',
      titulo: 'Laptop Lenovo ThinkPad T480s',
      categoria: 'electronicos',
      subcategoria: 'laptops',
      precio: 180000,
      condicion: 'como-nuevo',
      estado: 'activa',
      ubicacion: 'Campus TEC San Carlos',
      imagen: 'lenovo.jpg',
      fechaPublicacion: '2026-09-20T10:00:00Z'
    },
    {
      id: 'PUB-2024-0742',
      titulo: 'Monitor Dell 24 IPS 75Hz',
      categoria: 'electronicos',
      subcategoria: 'monitores',
      precio: 65000,
      condicion: 'buen-estado',
      estado: 'activa',
      ubicacion: 'Biblioteca TEC',
      imagen: 'monitor.jpg',
      fechaPublicacion: '2026-09-18T14:30:00Z'
    },
    {
      id: 'PUB-2024-0615',
      titulo: 'Tutoría de Programación en Java',
      categoria: 'tutoria',
      subcategoria: 'programacion',
      precio: 7000,
      condicion: null,
      estado: 'pausada',
      ubicacion: 'Biblioteca TEC',
      imagen: 'tutoria.jpg',
      fechaPublicacion: '2026-09-15T09:15:00Z'
    },
    {
      id: 'PUB-2024-0520',
      titulo: 'Calculadora Casio FX-991LA X',
      categoria: 'electronicos',
      subcategoria: 'calculadoras',
      precio: 18000,
      condicion: 'buen-estado',
      estado: 'vendida',
      ubicacion: 'Campus TEC San Carlos',
      imagen: 'calculadora.jpg',
      fechaPublicacion: '2026-09-10T11:00:00Z'
    }
  ];

  const apiResponse = {
    totalRecords: 4,
    page: 1,
    pageSize: 10,
    items: publications
  };

  beforeEach(async () => {
    publicationServiceMock
      .getUserPublications
      .mockReset();

    publicationServiceMock
      .getUserPublications
      .mockReturnValue(
        of(apiResponse)
      );

    await TestBed.configureTestingModule({
      imports: [
        MyPublications
      ],

      providers: [
        provideRouter([]),

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
        MyPublications
      );

    component =
      fixture.componentInstance;

    fixture.detectChanges();
  }

  it('should create the component', () => {
    createComponent();

    expect(component).toBeTruthy();
  });

  it('should request publications for the current user', () => {
    createComponent();

    expect(
      publicationServiceMock.getUserPublications
    ).toHaveBeenCalledWith(
      'USR-001'
    );

    expect(
      publicationServiceMock.getUserPublications
    ).toHaveBeenCalledTimes(1);
  });

  it('should load publications and pagination metadata', () => {
    createComponent();

    expect(
      component.totalRecords()
    ).toBe(4);

    expect(
      component.page()
    ).toBe(1);

    expect(
      component.pageSize()
    ).toBe(10);

    expect(
      component.publications().length
    ).toBe(4);

    expect(
      component.loading()
    ).toBe(false);

    expect(
      component.error()
    ).toBe(false);
  });

  it('should calculate publication status metrics', () => {
    createComponent();

    expect(
      component.activeCount()
    ).toBe(2);

    expect(
      component.pausedCount()
    ).toBe(1);

    expect(
      component.soldCount()
    ).toBe(1);

    expect(
      component.soldRevenue()
    ).toBe(18000);
  });

  it('should calculate available categories', () => {
    createComponent();

    expect(
      component.categories()
    ).toEqual([
      'electronicos',
      'tutoria'
    ]);
  });

  it('should filter publications by search term', () => {
    createComponent();

    const input =
      document.createElement('input');

    input.value = 'monitor';

    component.onSearch({
      target: input
    } as unknown as Event);

    expect(
      component.publications().length
    ).toBe(1);

    expect(
      component.publications()[0].id
    ).toBe(
      'PUB-2024-0742'
    );
  });

  it('should filter publications by status', () => {
    createComponent();

    component.selectStatus(
      'pausada'
    );

    expect(
      component.publications().length
    ).toBe(1);

    expect(
      component.publications()[0].estado
    ).toBe(
      'pausada'
    );
  });

  it('should filter publications by category', () => {
    createComponent();

    const select =
      document.createElement('select');

    const option =
      document.createElement('option');

    option.value = 'tutoria';

    select.appendChild(option);
    select.value = 'tutoria';

    component.onCategoryChange({
      target: select
    } as unknown as Event);

    expect(
      component.publications().length
    ).toBe(1);

    expect(
      component.publications()[0].categoria
    ).toBe(
      'tutoria'
    );
  });

  it('should sort publications by descending price', () => {
    createComponent();

    const select =
      document.createElement('select');

    const option =
      document.createElement('option');

    option.value = 'price-desc';

    select.appendChild(option);
    select.value = 'price-desc';

    component.onSortChange({
      target: select
    } as unknown as Event);

    expect(
      component.publications()
        .map(
          (publication) =>
            publication.precio
        )
    ).toEqual([
      180000,
      65000,
      18000,
      7000
    ]);
  });

  it('should reset all filters', () => {
    createComponent();

    component.searchTerm.set(
      'monitor'
    );

    component.selectedStatus.set(
      'vendida'
    );

    component.selectedCategory.set(
      'electronicos'
    );

    component.sortBy.set(
      'price-desc'
    );

    component.resetFilters();

    expect(
      component.searchTerm()
    ).toBe('');

    expect(
      component.selectedStatus()
    ).toBe('all');

    expect(
      component.selectedCategory()
    ).toBeNull();

    expect(
      component.sortBy()
    ).toBe('recent');
  });

  it('should format publication values', () => {
    createComponent();

    expect(
      component.formatStatus(
        'activa'
      )
    ).toBe(
      'Activa'
    );

    expect(
      component.formatStatus(
        'pausada'
      )
    ).toBe(
      'En pausa'
    );

    expect(
      component.formatStatus(
        'vendida'
      )
    ).toBe(
      'Vendida'
    );

    expect(
      component.formatLabel(
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

  it('should create detail links with the my-publications source', () => {
    createComponent();

    const links:
      NodeListOf<HTMLAnchorElement> =
        fixture.nativeElement
          .querySelectorAll(
            '.view-action'
          );

    expect(
      links.length
    ).toBe(4);

    expect(
      links[0].getAttribute('href')
    ).toContain(
      '/publicaciones/PUB-2024-0891'
    );

    expect(
      links[0].getAttribute('href')
    ).toContain(
      'from=mis-publicaciones'
    );
  });

  it('should set the error state when publications cannot be loaded', () => {
    publicationServiceMock
      .getUserPublications
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
      component.loading()
    ).toBe(false);

    expect(
      component.error()
    ).toBe(true);

    expect(
      component.publications()
    ).toEqual([]);
  });
});