import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService } from '../../../core/api/api-client.service';
import { Publication } from '../models/publication.model';
import { PublicationDetail } from '../models/publication-detail.model';
import { UserPublication } from '../models/my-publications.model';
import { PublicationService } from './publication.service';

describe('PublicationService', () => {
  let service:
    PublicationService;

  const apiClientMock = {
    get: vi.fn(),
    post: vi.fn()
  };

  const publicationList = {
    totalRecords: 1,
    page: 1,
    pageSize: 12,

    items: [
      {
        id: 'PUB-2024-0891',
        categoria: 'electronicos',
        subcategoria: 'laptops',
        titulo: 'Lenovo ThinkPad',
        descripcion:
          'Laptop en excelente estado',
        precio: 145000,
        condicion: 'como-nuevo',
        ubicacion:
          'Campus TEC San Carlos',
        imagen: 'lenovo.jpg',
        fechaPublicacion:
          '2026-09-25T10:00:00',
        estado: 'activa',

        vendedor: {
          id: 101,
          nombre:
            'Sebastián Murillo',
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
      titulo: 'Lenovo ThinkPad',
      descripcion:
        'Laptop en excelente estado',
      precio: 180000,
      condicion: 'como-nuevo',
      estado: 'activa',
      ubicacion:
        'Campus TEC San Carlos',
      fechaPublicacion:
        '2026-09-25T10:00:00Z',

      vendedor: {
        id: 101,
        nombre:
          'Sebastián Murillo',
        carrera: 'Computación',
        verificado: true
      }
    };

  const userPublication:
    UserPublication = {
      id: 'PUB-2024-0891',
      titulo: 'Lenovo ThinkPad',
      categoria: 'electronicos',
      subcategoria: 'laptops',
      precio: 180000,
      condicion: 'como-nuevo',
      estado: 'activa',
      ubicacion:
        'Campus TEC San Carlos',
      imagen: 'lenovo.jpg',
      fechaPublicacion:
        '2026-09-20T10:00:00Z'
    };

  beforeEach(() => {
    apiClientMock.get.mockReset();
    apiClientMock.post.mockReset();

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
        of(publicationList)
      );

    const response =
      await firstValueFrom(
        service.getPublications(1, 12)
      );

    expect(
      apiClientMock.get
    ).toHaveBeenCalledWith(
      '/publicaciones',
      expect.anything()
    );

    expect(apiClientMock.get.mock.calls[0][1].toString())
      .toBe('page=1&pageSize=12');

    expect(
      response
    ).toEqual(
      publicationList
    );
  });

  it('should request the second page with query parameters', async () => {
    apiClientMock.get.mockReturnValue(of(publicationList));

    await firstValueFrom(service.getPublications(2, 12));

    expect(apiClientMock.get.mock.calls[0][0]).toBe('/publicaciones');
    expect(apiClientMock.get.mock.calls[0][1].toString())
      .toBe('page=2&pageSize=12');
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

  it('should request publications for a user', async () => {
    const responseMock = {
      totalRecords: 1,
      page: 1,
      pageSize: 10,
      items: [
        userPublication
      ]
    };

    apiClientMock.get
      .mockReturnValue(
        of(responseMock)
      );

    const response =
      await firstValueFrom(
        service.getUserPublications(
          'USR-001'
        )
      );

    expect(
      apiClientMock.get
    ).toHaveBeenCalledWith(
      '/usuarios/USR-001/publicaciones'
    );

    expect(
      response
    ).toEqual(
      responseMock
    );
  });

  it('should create a publication', async () => {
    const publication = {
      categoria:
        'electronicos',

      subcategoria:
        'monitores',

      titulo:
        'Monitor Dell UltraSharp',

      descripcion:
        'Monitor en excelente estado.',

      precio:
        195000,

      condicion:
        'como-nuevo',

      ubicacion:
        'Biblioteca TEC'
    };

    apiClientMock.post =
      vi.fn().mockReturnValue(
        of(void 0)
      );

    await firstValueFrom(
      service.createPublication(
        publication
      )
    );

    expect(
      apiClientMock.post
    ).toHaveBeenCalledWith(
      '/publicaciones',
      publication
    );
  });
});
