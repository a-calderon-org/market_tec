import { Publication } from '../../publications/models/publication.model';

import {
  HomeFilters,
  HomeFilterService
} from './home-filter.service';

describe('HomeFilterService', () => {
  let service: HomeFilterService;

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
    },
    {
      id: 'PUB-003',
      categoria: 'tutorias',
      subcategoria: 'matematica',
      titulo: 'Tutoría de Cálculo',
      descripcion: 'Clases de cálculo diferencial',
      precio: 20000,
      condicion: null,
      ubicacion: 'Campus San Carlos',
      imagen: 'tutoria.jpg',
      fechaPublicacion: '2026-09-24T10:00:00',
      estado: 'activa',
      vendedor: {
        id: 103,
        nombre: 'María Gómez',
        carrera: 'Ingeniería',
        verificado: false
      }
    }
  ];

  const defaultFilters: HomeFilters = {
    searchTerm: '',
    category: null,
    minPrice: null,
    maxPrice: null,
    sortBy: 'recent'
  };

  beforeEach(() => {
    service = new HomeFilterService();
  });

  it('should create the service', () => {
    expect(service).toBeTruthy();
  });

  it('should return all publications when no filters are applied', () => {
    const result = service.applyFilters(
      publications,
      defaultFilters
    );

    expect(result.length).toBe(3);
  });

  it('should search publications by title ignoring case', () => {
    const filters: HomeFilters = {
      ...defaultFilters,
      searchTerm: 'LENOVO'
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('PUB-001');
  });

  it('should search publications by seller name', () => {
    const filters: HomeFilters = {
      ...defaultFilters,
      searchTerm: 'maría'
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('PUB-003');
  });

  it('should filter publications by category', () => {
    const filters: HomeFilters = {
      ...defaultFilters,
      category: 'electronicos'
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.length).toBe(2);

    expect(
      result.every(
        (publication) =>
          publication.categoria === 'electronicos'
      )
    ).toBe(true);
  });

  it('should filter publications by minimum price', () => {
    const filters: HomeFilters = {
      ...defaultFilters,
      minPrice: 100000
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('PUB-001');
  });

  it('should filter publications by maximum price', () => {
    const filters: HomeFilters = {
      ...defaultFilters,
      maxPrice: 90000
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.length).toBe(2);

    expect(
      result.every(
        (publication) =>
          publication.precio <= 90000
      )
    ).toBe(true);
  });

  it('should filter publications by price range', () => {
    const filters: HomeFilters = {
      ...defaultFilters,
      minPrice: 50000,
      maxPrice: 100000
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('PUB-002');
  });

  it('should sort publications from lowest to highest price', () => {
    const filters: HomeFilters = {
      ...defaultFilters,
      sortBy: 'price-asc'
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.map((publication) => publication.precio))
      .toEqual([
        20000,
        85000,
        145000
      ]);
  });

  it('should sort publications from highest to lowest price', () => {
    const filters: HomeFilters = {
      ...defaultFilters,
      sortBy: 'price-desc'
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.map((publication) => publication.precio))
      .toEqual([
        145000,
        85000,
        20000
      ]);
  });

  it('should sort publications by most recent date', () => {
    const result = service.applyFilters(
      publications,
      defaultFilters
    );

    expect(result.map((publication) => publication.id))
      .toEqual([
        'PUB-002',
        'PUB-001',
        'PUB-003'
      ]);
  });

  it('should combine multiple filters', () => {
    const filters: HomeFilters = {
      searchTerm: 'dell',
      category: 'electronicos',
      minPrice: 50000,
      maxPrice: 100000,
      sortBy: 'price-asc'
    };

    const result = service.applyFilters(
      publications,
      filters
    );

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('PUB-002');
  });

  it('should not modify the original publications array', () => {
    const originalOrder = publications.map(
      (publication) => publication.id
    );

    service.applyFilters(
      publications,
      {
        ...defaultFilters,
        sortBy: 'price-asc'
      }
    );

    expect(
      publications.map(
        (publication) => publication.id
      )
    ).toEqual(originalOrder);
  });
});