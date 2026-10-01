import {
  ComponentFixture,
  TestBed
} from '@angular/core/testing';

import {
  Router,
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
  PublicationCreate
} from './publication-create';

import {
  PublicationService
} from '../services/publication.service';

describe('PublicationCreate', () => {
  let fixture:
    ComponentFixture<PublicationCreate>;

  let component:
    PublicationCreate;

  let router:
    Router;

  const publicationServiceMock = {
    createPublication:
      vi.fn()
  };

  beforeEach(async () => {
    publicationServiceMock
      .createPublication
      .mockReset();

    publicationServiceMock
      .createPublication
      .mockReturnValue(
        of(void 0)
      );

    await TestBed.configureTestingModule({
      imports: [
        PublicationCreate
      ],

      providers: [
        provideRouter([]),

        {
          provide:
            PublicationService,

          useValue:
            publicationServiceMock
        }
      ]
    }).compileComponents();

    fixture =
      TestBed.createComponent(
        PublicationCreate
      );

    component =
      fixture.componentInstance;

    router =
      TestBed.inject(
        Router
      );

    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(
      component
    ).toBeTruthy();
  });

  it('should initialize the form with default values', () => {
    expect(
      component.form.getRawValue()
    ).toEqual({
      categoria:
        'electronicos',

      subcategoria:
        '',

      titulo:
        '',

      precio:
        0,

      ubicacion:
        '',

      condicion:
        'como-nuevo',

      descripcion:
        ''
    });
  });

  it('should start with an invalid form', () => {
    expect(
      component.form.invalid
    ).toBe(true);
  });

  it('should select a category and clear the subcategory', () => {
    component.form.controls
      .subcategoria
      .setValue(
        'laptops'
      );

    component.selectCategory(
      'tutoria'
    );

    expect(
      component.form.controls
        .categoria.value
    ).toBe(
      'tutoria'
    );

    expect(
      component.form.controls
        .subcategoria.value
    ).toBe('');
  });

  it('should select a condition', () => {
    component.selectCondition(
      'buen-estado'
    );

    expect(
      component.form.controls
        .condicion.value
    ).toBe(
      'buen-estado'
    );
  });

  it('should clamp a negative price to zero', () => {
    const input =
      document.createElement(
        'input'
      );

    input.value = '-100';

    component.onPriceInput({
      target: input
    } as unknown as Event);

    expect(
      component.form.controls
        .precio.value
    ).toBe(0);

    expect(
      input.value
    ).toBe('0');
  });

  it('should update a valid price', () => {
    const input =
      document.createElement(
        'input'
      );

    input.value = '195000';

    component.onPriceInput({
      target: input
    } as unknown as Event);

    expect(
      component.form.controls
        .precio.value
    ).toBe(
      195000
    );
  });

  it('should calculate remaining image slots', () => {
    expect(
      component.remainingImages()
    ).toBe(5);

    component.images.set([
      {
        id: '1',
        name: 'one.jpg',
        previewUrl: 'one.jpg'
      },
      {
        id: '2',
        name: 'two.jpg',
        previewUrl: 'two.jpg'
      }
    ]);

    expect(
      component.remainingImages()
    ).toBe(3);
  });

  it('should use the first image as cover by default', () => {
    component.images.set([
      {
        id: '1',
        name: 'one.jpg',
        previewUrl: 'one.jpg'
      },
      {
        id: '2',
        name: 'two.jpg',
        previewUrl: 'two.jpg'
      }
    ]);

    expect(
      component.coverImage()?.id
    ).toBe('1');
  });

  it('should allow selecting another cover image', () => {
    component.images.set([
      {
        id: '1',
        name: 'one.jpg',
        previewUrl: 'one.jpg'
      },
      {
        id: '2',
        name: 'two.jpg',
        previewUrl: 'two.jpg'
      }
    ]);

    component.setCoverImage(
      '2'
    );

    expect(
      component.coverImageId()
    ).toBe('2');

    expect(
      component.isCoverImage('2')
    ).toBe(true);
  });

  it('should ignore an unknown cover image id', () => {
    component.images.set([
      {
        id: '1',
        name: 'one.jpg',
        previewUrl: 'one.jpg'
      }
    ]);

    component.setCoverImage(
      'missing'
    );

    expect(
      component.coverImageId()
    ).toBeNull();
  });

  it('should remove an image and select another cover', () => {
    component.images.set([
      {
        id: '1',
        name: 'one.jpg',
        previewUrl: 'one.jpg'
      },
      {
        id: '2',
        name: 'two.jpg',
        previewUrl: 'two.jpg'
      }
    ]);

    component.coverImageId.set(
      '1'
    );

    component.removeImage(
      '1'
    );

    expect(
      component.images()
        .length
    ).toBe(1);

    expect(
      component.images()[0].id
    ).toBe('2');

    expect(
      component.coverImageId()
    ).toBe('2');
  });

  it('should mark controls as touched when submitting an invalid form', () => {
    component.submit();

    expect(
      publicationServiceMock
        .createPublication
    ).not.toHaveBeenCalled();

    expect(
      component.form.controls
        .titulo.touched
    ).toBe(true);

    expect(
      component.form.controls
        .descripcion.touched
    ).toBe(true);
  });

  it('should create a publication with trimmed values', () => {
    vi.spyOn(
        router,
        'navigate'
    ).mockResolvedValue(
        true
    );

    component.form.setValue({
        categoria:
        'electronicos',

        subcategoria:
        '  monitores  ',

        titulo:
        '  Monitor Dell UltraSharp  ',

        precio:
        195000,

        ubicacion:
        '  Biblioteca TEC  ',

        condicion:
        'como-nuevo',

        descripcion:
        '  Monitor en excelente estado.  '
    });

    component.submit();

    expect(
        publicationServiceMock
        .createPublication
    ).toHaveBeenCalledWith({
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
    });
    });

  it('should navigate to my publications after successful creation', () => {
    const navigateSpy =
      vi.spyOn(
        router,
        'navigate'
      ).mockResolvedValue(
        true
      );

    component.form.setValue({
      categoria:
        'electronicos',

      subcategoria:
        'monitores',

      titulo:
        'Monitor Dell UltraSharp',

      precio:
        195000,

      ubicacion:
        'Biblioteca TEC',

      condicion:
        'como-nuevo',

      descripcion:
        'Monitor en excelente estado.'
    });

    component.submit();

    expect(
      component.submitting()
    ).toBe(false);

    expect(
      component.success()
    ).toBe(true);

    expect(
      navigateSpy
    ).toHaveBeenCalledWith(
      [
        '/mis-publicaciones'
      ],
      {
        state: {
          publicationCreated:
            true
        }
      }
    );
  });

  it('should show an error when publication creation fails', () => {
    publicationServiceMock
      .createPublication
      .mockReturnValue(
        throwError(
          () =>
            new Error(
              'API error'
            )
        )
      );

    component.form.setValue({
      categoria:
        'electronicos',

      subcategoria:
        'monitores',

      titulo:
        'Monitor Dell UltraSharp',

      precio:
        195000,

      ubicacion:
        'Biblioteca TEC',

      condicion:
        'como-nuevo',

      descripcion:
        'Monitor en excelente estado.'
    });

    component.submit();

    expect(
      component.submitting()
    ).toBe(false);

    expect(
      component.success()
    ).toBe(false);

    expect(
      component.error()
    ).toBe(true);

    expect(
      component.errorMessage()
    ).toBe(
      'No fue posible crear la publicación. Inténtalo nuevamente.'
    );
  });

  it('should format publication labels', () => {
    expect(
      component.formatLabel(
        'electronicos'
      )
    ).toBe(
      'Electrónicos'
    );

    expect(
      component.formatLabel(
        'como-nuevo'
      )
    ).toBe(
      'Como nuevo'
    );

    expect(
      component.formatLabel(
        'otra-categoria'
      )
    ).toBe(
      'Otra Categoria'
    );
  });

  it('should format prices using Costa Rica locale', () => {
    expect(
      component.formatPrice(
        195000
      )
    ).toBe(
      new Intl.NumberFormat(
        'es-CR'
      ).format(
        195000
      )
    );
  });

  it('should render the publication creation breadcrumb', () => {
    const breadcrumb:
      HTMLElement =
        fixture.nativeElement
          .querySelector(
            '.breadcrumb'
          );

    expect(
      breadcrumb.textContent
    ).toContain(
      'Inicio'
    );

    expect(
      breadcrumb.textContent
    ).toContain(
      'Mis Publicaciones'
    );

    expect(
      breadcrumb.textContent
    ).toContain(
      'Nueva Publicación'
    );
  });

  it('should link the breadcrumb back to my publications', () => {
    const links:
      NodeListOf<HTMLAnchorElement> =
        fixture.nativeElement
          .querySelectorAll(
            '.breadcrumb a'
          );

    expect(
      links.length
    ).toBeGreaterThanOrEqual(
      2
    );

    expect(
      links[1].getAttribute(
        'href'
      )
    ).toBe(
      '/mis-publicaciones'
    );
  });
});
