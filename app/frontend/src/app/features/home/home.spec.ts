import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { Home } from './home';
import { Publication } from '../publications/models/publication.model';
import { PublicationService } from '../publications/services/publication.service';

describe('Home', () => {
  let fixture: ComponentFixture<Home>;
  let component: Home;

  const publicationServiceMock = {
    getPublications: vi.fn()
  };

  const publications: Publication[] = [
    {
      id: 'PUB-001',
      categoria: 'electronicos',
      subcategoria: 'laptops',
      titulo: 'Lenovo ThinkPad T480s',
      descripcion: 'Laptop en excelente estado',
      precio: 145000,
      condicion: 'como-nuevo',
      ubicacion: 'Campus San Carlos',
      imagen: 'lenovo.jpg',
      fechaPublicacion: '2026-09-25T10:00:00',
      estado: 'activa',
      vendedor: {
        id: 101,
        nombre: 'Ana Pérez',
        carrera: 'Computación',
        verificado: true
      }
    },
    {
      id: 'PUB-002',
      categoria: 'electronicos',
      subcategoria: 'monitores',
      titulo: 'Monitor Dell 24 pulgadas',
      descripcion: 'Monitor Full HD',
      precio: 85000,
      condicion: 'usado',
      ubicacion: 'Campus San Carlos',
      imagen: 'monitor.jpg',
      fechaPublicacion: '2026-09-26T10:00:00',
      estado: 'activa',
      vendedor: {
        id: 102,
        nombre: 'Carlos Rodríguez',
        carrera: 'Electrónica',
        verificado: true
      }
    }
  ];

  const apiResponse = {
    totalRecords: 48,
    page: 1,
    pageSize: 12,
    items: publications
  };

  beforeEach(async () => {
    publicationServiceMock.getPublications.mockReset();

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        {
          provide: PublicationService,
          useValue: publicationServiceMock
        }
      ]
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;

    fixture.detectChanges();
  }

  it('should create the component', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    expect(component).toBeTruthy();
  });

  it('should request publications when the component initializes', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    expect(
      publicationServiceMock.getPublications
    ).toHaveBeenCalledTimes(1);
  });

  it('should load publications from the service', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    expect(component.publications().length).toBe(2);

    expect(component.publications()[0].id)
      .toBe('PUB-002');

    expect(component.publications()[1].id)
      .toBe('PUB-001');
  });

  it('should load pagination metadata from the API response', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    expect(component.totalRecords()).toBe(48);
    expect(component.page()).toBe(1);
    expect(component.pageSize()).toBe(12);
  });

  it('should stop loading after publications are loaded successfully', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe(false);
  });

  it('should set the error state when publications cannot be loaded', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      throwError(() => new Error('API error'))
    );

    createComponent();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBe(true);
  });

  it('should update the search term', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    const input = document.createElement('input');
    input.value = 'Lenovo';

    input.addEventListener('input', (event) => {
      component.onSearch(event);
    });

    input.dispatchEvent(
      new Event('input', {
        bubbles: true
      })
    );

    expect(component.searchTerm()).toBe('Lenovo');
  });

  it('should update the selected category', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    component.selectCategory('electronicos');

    expect(component.selectedCategory())
      .toBe('electronicos');
  });

  it('should allow clearing the selected category', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    component.selectCategory('electronicos');
    component.selectCategory(null);

    expect(component.selectedCategory())
      .toBeNull();
  });

  it('should update the minimum price with a valid value', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    const input = document.createElement('input');
    input.value = '50000';

    input.addEventListener('input', (event) => {
      component.onMinPriceChange(event);
    });

    input.dispatchEvent(
      new Event('input', {
        bubbles: true
      })
    );

    expect(component.minPrice()).toBe(50000);
  });

  it('should convert a negative minimum price to zero', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    const input = document.createElement('input');
    input.value = '-5000';

    input.addEventListener('input', (event) => {
      component.onMinPriceChange(event);
    });

    input.dispatchEvent(
      new Event('input', {
        bubbles: true
      })
    );

    expect(component.minPrice()).toBe(0);
    expect(input.value).toBe('0');
  });

  it('should convert a negative maximum price to zero', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    const input = document.createElement('input');
    input.value = '-1000';

    input.addEventListener('input', (event) => {
      component.onMaxPriceChange(event);
    });

    input.dispatchEvent(
      new Event('input', {
        bubbles: true
      })
    );

    expect(component.maxPrice()).toBe(0);
    expect(input.value).toBe('0');
  });

  it('should clear the price when the input is empty', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    const input = document.createElement('input');
    input.value = '';

    input.addEventListener('input', (event) => {
      component.onMinPriceChange(event);
    });

    input.dispatchEvent(
      new Event('input', {
        bubbles: true
      })
    );

    expect(component.minPrice()).toBeNull();
  });

  it('should update the sorting option', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    const select = document.createElement('select');

    const option = document.createElement('option');
    option.value = 'price-desc';
    option.textContent = 'Precio descendente';

    select.appendChild(option);
    select.value = 'price-desc';

    select.addEventListener('change', (event) => {
      component.onSortChange(event);
    });

    select.dispatchEvent(
      new Event('change', {
        bubbles: true
      })
    );

    expect(component.sortBy())
      .toBe('price-desc');
  });

  it('should reset all filters', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    component.searchTerm.set('Lenovo');
    component.selectedCategory.set('electronicos');
    component.minPrice.set(50000);
    component.maxPrice.set(200000);
    component.sortBy.set('price-desc');

    component.resetFilters();

    expect(component.searchTerm()).toBe('');
    expect(component.selectedCategory()).toBeNull();
    expect(component.minPrice()).toBeNull();
    expect(component.maxPrice()).toBeNull();
    expect(component.sortBy()).toBe('recent');
  });

  it('should filter displayed publications using the search term', () => {
    publicationServiceMock.getPublications.mockReturnValue(
      of(apiResponse)
    );

    createComponent();

    component.searchTerm.set('Lenovo');

    expect(component.publications().length).toBe(1);

    expect(component.publications()[0].id)
      .toBe('PUB-001');
  });
});