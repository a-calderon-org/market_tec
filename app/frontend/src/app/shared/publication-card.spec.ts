import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Publication } from '../features/publications/models/publication.model';
import { PublicationCard } from './publication-card';

describe('PublicationCard', () => {
  let component: PublicationCard;
  let fixture: ComponentFixture<PublicationCard>;

  const publication: Publication = {
    id: 'PUB-001',
    categoria: 'electronicos',
    subcategoria: 'laptops',
    titulo: 'Lenovo ThinkPad T480s',
    descripcion: 'Laptop en excelente estado',
    precio: 145000,
    condicion: 'como-nuevo',
    ubicacion: 'Campus San Carlos',
    imagen: 'https://example.com/images/lenovo.jpg',
    fechaPublicacion: '2026-09-25T10:00:00',
    estado: 'activa',
    vendedor: {
      id: 101,
      nombre: 'Ana Pérez',
      carrera: 'Computación',
      verificado: true
    }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicationCard],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(PublicationCard);
    component = fixture.componentInstance;

    fixture.componentRef.setInput(
      'publication',
      publication
    );

    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should display publication information', () => {
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent)
      .toContain(publication.titulo);

    expect(element.textContent)
      .toContain(publication.descripcion);

    expect(element.textContent)
      .toContain(publication.vendedor.nombre);
  });

  it('should display the formatted price', () => {
    const element: HTMLElement = fixture.nativeElement;

    const formattedPrice =
      new Intl.NumberFormat('es-CR')
        .format(publication.precio);

    expect(element.textContent)
      .toContain(formattedPrice);
  });

  it('should format the publication condition', () => {
    expect(
      component.formatCondition('como-nuevo')
    ).toBe('Como Nuevo');
  });

  it('should return an empty condition when condition is null', () => {
    expect(
      component.formatCondition(null)
    ).toBe('');
  });

  it('should not display a condition badge when condition is null', () => {
    fixture.componentRef.setInput(
      'publication',
      {
        ...publication,
        condicion: null
      }
    );

    fixture.detectChanges();

    const badges: NodeListOf<HTMLElement> =
      fixture.nativeElement.querySelectorAll(
        '.publication-card__badges .badge'
      );

    // Solo debe permanecer el badge de categoría.
    expect(badges.length).toBe(1);
  });

  it('should display the verified seller label', () => {
    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent)
      .toContain('TEC Verificado');
  });

  it('should not display the verified label for an unverified seller', () => {
    fixture.componentRef.setInput(
      'publication',
      {
        ...publication,
        vendedor: {
          ...publication.vendedor,
          verificado: false
        }
      }
    );

    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;

    expect(element.textContent)
      .not.toContain('TEC Verificado');
  });

  it('should use the publication title as the image alt text', () => {
    const image: HTMLImageElement =
      fixture.nativeElement.querySelector(
        '.publication-card__image'
      );

    expect(image.alt)
      .toBe(publication.titulo);
  });

  it('should replace a broken image with the local placeholder', () => {
    const image: HTMLImageElement =
      fixture.nativeElement.querySelector(
        '.publication-card__image'
      );

    image.dispatchEvent(
      new Event('error')
    );

    fixture.detectChanges();

    expect(image.src)
      .toContain(
        '/images/publication-placeholder.svg'
      );
  });
});
