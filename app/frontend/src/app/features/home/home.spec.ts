import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Publication } from '../publications/models/publication.model';
import { PublicationService } from '../publications/services/publication.service';
import { Home } from './home';

describe('Home', () => {
  let fixture: ComponentFixture<Home>;
  let component: Home;
  const publicationServiceMock = { getPublicationCatalog: vi.fn() };

  const makePublication = (
    id: string,
    overrides: Partial<Publication> = {}
  ): Publication => ({
    id,
    categoria: 'electronicos',
    subcategoria: 'laptops',
    titulo: `Publicación ${id}`,
    descripcion: 'Artículo disponible',
    precio: 50000,
    condicion: 'usado',
    ubicacion: 'Campus San Carlos',
    imagen: 'item.jpg',
    fechaPublicacion: '2026-09-25T10:00:00',
    estado: 'activa',
    vendedor: {
      id: 101,
      nombre: 'Ana Pérez',
      carrera: 'Computación',
      verificado: true
    },
    ...overrides
  });

  const publications = [
    makePublication('PUB-001', {
      titulo: 'Lenovo ThinkPad T480s',
      precio: 145000,
      fechaPublicacion: '2026-09-25T10:00:00'
    }),
    makePublication('PUB-002', {
      titulo: 'Monitor Dell 24 pulgadas',
      subcategoria: 'monitores',
      precio: 85000,
      fechaPublicacion: '2026-09-26T10:00:00'
    }),
    makePublication('PUB-003', {
      categoria: 'tutoria',
      titulo: 'Tutoría de Cálculo',
      precio: 20000,
      fechaPublicacion: '2026-09-24T10:00:00'
    })
  ];

  beforeEach(async () => {
    localStorage.clear();
    publicationServiceMock.getPublicationCatalog.mockReset();

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideRouter([]),
        {
          provide: PublicationService,
          useValue: publicationServiceMock
        }
      ]
    }).compileComponents();
  });

  function createComponent(catalog = publications): void {
    publicationServiceMock.getPublicationCatalog.mockReturnValue(
      of(catalog)
    );
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function seedRecentSearches(searches: string[]): void {
    localStorage.setItem(
      'markettec.recent-searches',
      JSON.stringify(searches)
    );
  }

  function openRecentSearches(): HTMLInputElement {
    const input = fixture.nativeElement.querySelector(
      'input[type="search"]'
    ) as HTMLInputElement;

    input.focus();
    input.dispatchEvent(new FocusEvent('focusin', {
      bubbles: true
    }));
    fixture.detectChanges();

    return input;
  }

  function recentQueryButton(query: string): HTMLButtonElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.recent-searches__query'
      )
    ) as HTMLButtonElement[];

    const button = buttons.find(
      (candidate) => candidate.textContent?.trim() === query
    );

    if (!button) {
      throw new Error(`Missing recent search button: ${query}`);
    }

    return button;
  }

  it('loads the complete catalog when initialized', () => {
    createComponent();

    expect(publicationServiceMock.getPublicationCatalog)
      .toHaveBeenCalledTimes(1);
    expect(component.totalRecords()).toBe(3);
    expect(component.loading()).toBe(false);
    expect(component.error()).toBe(false);
  });

  it('filters the complete catalog before paginating it', () => {
    const catalog = [
      ...Array.from({ length: 12 }, (_, index) =>
        makePublication(`OTHER-${index}`)
      ),
      ...Array.from({ length: 17 }, (_, index) =>
        makePublication(`MATCH-${index}`, {
          categoria: 'tutoria',
          titulo: `Tutoría ${index}`
        })
      )
    ];
    createComponent(catalog);

    component.selectCategory('tutoria');

    expect(component.totalRecords()).toBe(17);
    expect(component.totalPages()).toBe(2);
    expect(component.publications()).toHaveLength(12);
    expect(component.publications().every(
      (publication) => publication.categoria === 'tutoria'
    )).toBe(true);

    component.nextPage();

    expect(component.page()).toBe(2);
    expect(component.publications()).toHaveLength(5);
    expect(publicationServiceMock.getPublicationCatalog)
      .toHaveBeenCalledTimes(1);
  });

  it('derives category controls from exact catalog values and switches them', () => {
    const catalog = [
      makePublication('TECH-1', {
        categoria: 'Tecnología y Electrónica'
      }),
      makePublication('SERVICE-1', {
        categoria: 'Servicios Académicos'
      }),
      makePublication('RENT-1', {
        categoria: 'alquiler'
      })
    ];
    createComponent(catalog);

    expect(component.categories()).toEqual([
      'alquiler',
      'Servicios Académicos',
      'Tecnología y Electrónica'
    ]);

    const categoryButton = (label: string): HTMLButtonElement => {
      const buttons = Array.from(
        fixture.nativeElement.querySelectorAll('.filter-option')
      ) as HTMLButtonElement[];

      const button = buttons.find(
        (candidate) => candidate.textContent?.trim() === label
      );

      if (!button) {
        throw new Error(`Missing category button: ${label}`);
      }

      return button;
    };

    categoryButton('Servicios Académicos').click();
    expect(component.publications().map(({ id }) => id))
      .toEqual(['SERVICE-1']);

    categoryButton('Tecnología y Electrónica').click();
    expect(component.publications().map(({ id }) => id))
      .toEqual(['TECH-1']);

    categoryButton('Todas las categorías').click();
    expect(component.publications()).toHaveLength(3);
  });

  it('combines an exact catalog category with text and price criteria', () => {
    const catalog = [
      makePublication('MATCH', {
        categoria: 'Servicios Académicos',
        titulo: 'Tutoría de cálculo',
        precio: 25000
      }),
      makePublication('WRONG-PRICE', {
        categoria: 'Servicios Académicos',
        titulo: 'Tutoría de cálculo avanzada',
        precio: 75000
      }),
      makePublication('WRONG-CATEGORY', {
        categoria: 'Tecnología y Electrónica',
        titulo: 'Tutoría de cálculo',
        precio: 25000
      })
    ];
    createComponent(catalog);

    component.selectCategory('Servicios Académicos');
    component.searchDraft.set('cálculo');
    component.executeSearch();
    component.minPrice.set(20000);
    component.maxPrice.set(30000);

    expect(component.publications().map(({ id }) => id))
      .toEqual(['MATCH']);

    component.searchDraft.set('química');
    component.executeSearch();
    fixture.detectChanges();

    expect(component.publications()).toEqual([]);
    expect(fixture.nativeElement.textContent)
      .toContain('No se encontraron publicaciones');
  });

  it('combines executed text, category and price filters', () => {
    createComponent();
    component.searchDraft.set('  monitor   dell ');
    component.executeSearch();
    component.selectCategory('electronicos');
    component.minPrice.set(80000);
    component.maxPrice.set(90000);

    expect(component.searchTerm()).toBe('monitor dell');
    expect(component.publications().map(({ id }) => id))
      .toEqual(['PUB-002']);
    expect(component.totalRecords()).toBe(1);
  });

  it('resets to page one when criteria change and keeps them while paging', () => {
    createComponent(
      Array.from({ length: 25 }, (_, index) =>
        makePublication(`PUB-${index}`)
      )
    );
    component.nextPage();
    expect(component.page()).toBe(2);

    component.selectCategory('electronicos');
    expect(component.page()).toBe(1);
    component.nextPage();

    expect(component.page()).toBe(2);
    expect(component.selectedCategory()).toBe('electronicos');

    const input = document.createElement('input');
    input.value = 'Publicación';
    component.onSearch({ target: input } as unknown as Event);

    expect(component.page()).toBe(1);
    expect(component.searchTerm()).toBe('Publicación');
  });

  it('does not navigate outside the filtered result pages', () => {
    createComponent(publications);
    component.previousPage();
    component.nextPage();
    expect(component.page()).toBe(1);
  });

  it('shows an empty result and reset restores the catalog', () => {
    createComponent();
    component.searchDraft.set('sin coincidencias');
    component.executeSearch();
    fixture.detectChanges();

    expect(component.totalRecords()).toBe(0);
    expect(component.publications()).toEqual([]);
    expect(fixture.nativeElement.textContent)
      .toContain('No se encontraron publicaciones');

    component.resetFilters();
    expect(component.totalRecords()).toBe(3);
  });

  it('records and selects an executed recent search', () => {
    createComponent();
    component.searchDraft.set('  Monitor   Dell ');
    component.executeSearch();

    expect(component.recentSearches()).toEqual(['Monitor Dell']);

    component.searchDraft.set('otro texto');
    component.selectRecentSearch('Monitor Dell');

    expect(component.searchTerm()).toBe('Monitor Dell');
    expect(component.publications().map(({ id }) => id))
      .toEqual(['PUB-002']);
  });

  it('executes a recent search after a pointer focusout with no related target', () => {
    seedRecentSearches(['Lenovo', 'Monitor Dell']);
    createComponent([
      ...Array.from({ length: 13 }, (_, index) =>
        makePublication(`OTHER-${index}`)
      ),
      publications[1]
    ]);
    component.page.set(2);
    fixture.detectChanges();

    const input = openRecentSearches();
    const recentButton = recentQueryButton('Monitor Dell');

    recentButton.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true
    }));
    input.dispatchEvent(new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: null
    }));
    fixture.detectChanges();

    expect(component.showRecentSearches()).toBe(true);
    expect(recentButton.isConnected).toBe(true);

    recentButton.click();
    fixture.detectChanges();

    expect(input.value).toBe('Monitor Dell');
    expect(component.searchTerm()).toBe('Monitor Dell');
    expect(component.page()).toBe(1);
    expect(component.publications().map(({ id }) => id))
      .toEqual(['PUB-002']);
    expect(component.recentSearches())
      .toEqual(['Monitor Dell', 'Lenovo']);
    expect(component.showRecentSearches()).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('removes only one recent search without executing it or closing early', () => {
    seedRecentSearches([
      'Lenovo',
      'Monitor Dell',
      'Tutoría'
    ]);
    createComponent();
    component.searchDraft.set('Lenovo');
    component.searchTerm.set('Lenovo');
    fixture.detectChanges();

    const input = openRecentSearches();
    const removeButton = fixture.nativeElement.querySelector(
      '[aria-label="Eliminar búsqueda Monitor Dell"]'
    ) as HTMLButtonElement;

    expect(removeButton.tagName).toBe('BUTTON');
    expect(removeButton.tabIndex).toBeGreaterThanOrEqual(0);

    removeButton.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true
    }));
    input.dispatchEvent(new FocusEvent('focusout', {
      bubbles: true,
      relatedTarget: null
    }));
    fixture.detectChanges();

    expect(removeButton.isConnected).toBe(true);
    removeButton.click();
    fixture.detectChanges();

    expect(component.recentSearches())
      .toEqual(['Lenovo', 'Tutoría']);
    expect(component.searchTerm()).toBe('Lenovo');
    expect(component.showRecentSearches()).toBe(true);
    expect(localStorage.getItem('markettec.recent-searches'))
      .toBe(JSON.stringify(['Lenovo', 'Tutoría']));
    expect(document.activeElement).toBe(input);

    const secondRemoveButton = fixture.nativeElement.querySelector(
      '[aria-label="Eliminar búsqueda Tutoría"]'
    ) as HTMLButtonElement;
    secondRemoveButton.focus();
    secondRemoveButton.click();
    fixture.detectChanges();

    expect(component.recentSearches()).toEqual(['Lenovo']);
    expect(component.searchTerm()).toBe('Lenovo');
    expect(component.showRecentSearches()).toBe(true);

    const clearButton = fixture.nativeElement.querySelector(
      '.recent-searches__header button'
    ) as HTMLButtonElement;
    clearButton.focus();
    clearButton.click();
    fixture.detectChanges();

    expect(component.recentSearches()).toEqual([]);
    expect(component.searchTerm()).toBe('Lenovo');
    expect(component.showRecentSearches()).toBe(false);
    expect(localStorage.getItem('markettec.recent-searches'))
      .toBe('[]');
  });

  it('supports keyboard focus, Escape and closing on outside interaction', () => {
    seedRecentSearches(['Monitor Dell']);
    createComponent();

    const input = openRecentSearches();
    const recentButton = recentQueryButton('Monitor Dell');
    recentButton.focus();

    expect(recentButton.tagName).toBe('BUTTON');
    expect(recentButton.tabIndex).toBeGreaterThanOrEqual(0);

    recentButton.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true
    }));
    fixture.detectChanges();

    expect(component.showRecentSearches()).toBe(false);
    expect(document.activeElement).toBe(input);

    openRecentSearches();
    document.body.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true
    }));
    fixture.detectChanges();

    expect(component.showRecentSearches()).toBe(false);
  });

  it('ignores an obsolete catalog response after retrying', () => {
    const firstRequest = new Subject<Publication[]>();
    const secondRequest = new Subject<Publication[]>();
    publicationServiceMock.getPublicationCatalog
      .mockReturnValueOnce(firstRequest)
      .mockReturnValueOnce(secondRequest);
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.loadPublications();
    secondRequest.next([publications[1]]);
    secondRequest.complete();
    firstRequest.next([publications[0]]);
    firstRequest.complete();

    expect(component.publications().map(({ id }) => id))
      .toEqual(['PUB-002']);
  });

  it('exposes an error and allows a successful retry', () => {
    publicationServiceMock.getPublicationCatalog
      .mockReturnValueOnce(throwError(() => new Error('API error')))
      .mockReturnValueOnce(of(publications));
    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.error()).toBe(true);
    expect(component.loading()).toBe(false);

    component.loadPublications();

    expect(component.error()).toBe(false);
    expect(component.totalRecords()).toBe(3);
  });
});
