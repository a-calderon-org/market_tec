import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService } from '../../../core/api/api-client.service';
import { Publication } from '../models/publication.model';
import { PublicationDetail } from '../models/publication-detail.model';
import { PublicationService } from './publication.service';

describe('PublicationService', () => {
  let service: PublicationService;

  const apiClientMock = {
    get: vi.fn()
  };

  const publicationsResponse = {
    totalRecords: 1,
    page: 1,
    pageSize: 12,

    items: [
      {
        id: 'PUB-2024-0891',
        categoria: 'electronicos',
        subcategoria: 'laptops',
        titulo: 'Lenovo ThinkPad T480s',
        descripcion: 'Laptop en excelente estado',
        precio: 145000,
        condicion: 'como-nuevo',
        ubicacion: 'Campus TEC San Carlos',
        imagen: 'lenovo.jpg',
        fechaPublicacion: '2026-09-25T10:00:00',
        estado: 'activa',

        vendedor: {
          id: 101,
          nombre: 'Sebastián Murillo',
          carrera: 'Computación',
          verificado: true
        }
      } satisfies Publication
    ]
  };

  const publicationDetail:
    PublicationDetail = {
      id: 'PUB-2024-0891',
      categoria: 'electronicos',
      subcategoria: 'laptops',
      titulo: 'Lenovo ThinkPad T480s',
      descripcion: 'Laptop en excelente estado',
      precio: 180000,
      precioAnterior: 215000,
      condicion: 'como-nuevo',
      estado: 'activa',
      ubicacion: 'Campus TEC San Carlos',
      puntoEntrega: 'Biblioteca TEC',
      fechaPublicacion: '2026-09-25T10:00:00Z',

      imagenes: [
        'thinkpad-1.jpg'
      ],

      vendedor: {
        id: 101,
        nombre: 'Sebastián Murillo',
        carrera: 'Computación',
        verificado: true
      }
    };

  beforeEach(() => {
    apiClientMock.get.mockReset();

    TestBed.configureTestingModule({
      providers: [
        PublicationService,

        {
          provide: ApiClientService,
          useValue: apiClientMock
        }
      ]
    });

    service =
      TestBed.inject(
        PublicationService
      );
  });

  it('should create the service', () => {
    expect(service).toBeTruthy();
  });

  it('should request the publications list', async () => {
    apiClientMock.get
      .mockReturnValue(
        of(publicationsResponse)
      );

    const response =
      await firstValueFrom(
        service.getPublications()
      );

    expect(
      apiClientMock.get
    ).toHaveBeenCalledWith(
      '/publicaciones'
    );

    expect(
      response
    ).toEqual(
      publicationsResponse
    );
  });

  it('should request a publication by id', async () => {
    apiClientMock.get
      .mockReturnValue(
        of(publicationDetail)
      );

    const response =
      await firstValueFrom(
        service.getPublicationById(
          'PUB-2024-0891'
        )
      );

    expect(
      apiClientMock.get
    ).toHaveBeenCalledWith(
      '/publicaciones/PUB-2024-0891'
    );

    expect(
      response
    ).toEqual(
      publicationDetail
    );
  });
});