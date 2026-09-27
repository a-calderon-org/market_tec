import {Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserPublication } from '../models/my-publications.model';
import { PublicationService } from '../services/publication.service';

type PublicationStatusFilter =
  | 'all'
  | 'activa'
  | 'pausada'
  | 'vendida';

type PublicationSortOption =
  | 'recent'
  | 'oldest'
  | 'price-asc'
  | 'price-desc';

@Component({
  selector: 'app-my-publications',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './my-publications.html',
  styleUrl: './my-publications.scss'
})
export class MyPublications implements OnInit {
  private readonly publicationService =
    inject(PublicationService);

  /*
   * Temporal para Fase I.
   * Cuando implementemos autenticación, este ID debe
   * obtenerse de la sesión del usuario.
   */
  private readonly currentUserId = 'USR-001';

  private readonly allPublications =
    signal<UserPublication[]>([]);

  readonly totalRecords = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(10);

  readonly loading = signal(true);
  readonly error = signal(false);

  readonly searchTerm = signal('');
  readonly selectedStatus =
    signal<PublicationStatusFilter>('all');
  readonly selectedCategory =
    signal<string | null>(null);
  readonly sortBy =
    signal<PublicationSortOption>('recent');

  readonly activeCount = computed(
    () =>
      this.allPublications()
        .filter(
          (publication) =>
            publication.estado === 'activa'
        )
        .length
  );

  readonly pausedCount = computed(
    () =>
      this.allPublications()
        .filter(
          (publication) =>
            publication.estado === 'pausada'
        )
        .length
  );

  readonly soldCount = computed(
    () =>
      this.allPublications()
        .filter(
          (publication) =>
            publication.estado === 'vendida'
        )
        .length
  );

  readonly soldRevenue = computed(
    () =>
      this.allPublications()
        .filter(
          (publication) =>
            publication.estado === 'vendida'
        )
        .reduce(
          (total, publication) =>
            total + publication.precio,
          0
        )
  );

  readonly categories = computed(
    () =>
      Array.from(
        new Set(
          this.allPublications()
            .map(
              (publication) =>
                publication.categoria
            )
        )
      ).sort()
  );

  readonly publications = computed(() => {
    const search =
      this.searchTerm()
        .trim()
        .toLocaleLowerCase('es');

    const status =
      this.selectedStatus();

    const category =
      this.selectedCategory();

    const sortBy =
      this.sortBy();

    return this.allPublications()
      .filter((publication) => {
        if (!search) {
          return true;
        }

        const searchableText = [
          publication.id,
          publication.titulo,
          publication.categoria,
          publication.subcategoria,
          publication.ubicacion
        ]
          .join(' ')
          .toLocaleLowerCase('es');

        return searchableText.includes(search);
      })
      .filter((publication) => {
        if (status === 'all') {
          return true;
        }

        return publication.estado === status;
      })
      .filter((publication) => {
        if (!category) {
          return true;
        }

        return publication.categoria === category;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'oldest':
            return (
              new Date(a.fechaPublicacion).getTime() -
              new Date(b.fechaPublicacion).getTime()
            );

          case 'price-asc':
            return a.precio - b.precio;

          case 'price-desc':
            return b.precio - a.precio;

          case 'recent':
          default:
            return (
              new Date(b.fechaPublicacion).getTime() -
              new Date(a.fechaPublicacion).getTime()
            );
        }
      });
  });

  ngOnInit(): void {
    this.loadPublications();
  }

  loadPublications(): void {
    this.loading.set(true);
    this.error.set(false);

    this.publicationService
      .getUserPublications(
        this.currentUserId
      )
      .subscribe({
        next: (response) => {
          this.allPublications.set(
            response.items
          );

          this.totalRecords.set(
            response.totalRecords
          );

          this.page.set(
            response.page
          );

          this.pageSize.set(
            response.pageSize
          );

          this.loading.set(false);
        },

        error: () => {
          this.allPublications.set([]);
          this.error.set(true);
          this.loading.set(false);
        }
      });
  }

  selectStatus(
    status: PublicationStatusFilter
  ): void {
    this.selectedStatus.set(status);
  }

  onSearch(event: Event): void {
    const input =
      event.target as HTMLInputElement;

    this.searchTerm.set(
      input.value
    );
  }

  onCategoryChange(
    event: Event
  ): void {
    const select =
      event.target as HTMLSelectElement;

    this.selectedCategory.set(
      select.value || null
    );
  }

  onSortChange(
    event: Event
  ): void {
    const select =
      event.target as HTMLSelectElement;

    this.sortBy.set(
      select.value as PublicationSortOption
    );
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.selectedStatus.set('all');
    this.selectedCategory.set(null);
    this.sortBy.set('recent');
  }

  formatPrice(
    price: number
  ): string {
    return new Intl.NumberFormat(
      'es-CR'
    ).format(price);
  }

  formatLabel(
    value: string
  ): string {
    return value
      .split('-')
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1)
      )
      .join(' ');
  }

  formatStatus(
    status: string
  ): string {
    switch (status) {
      case 'activa':
        return 'Activa';

      case 'pausada':
        return 'En pausa';

      case 'vendida':
        return 'Vendida';

      default:
        return this.formatLabel(status);
    }
  }

  formatDate(
    date: string
  ): string {
    return new Intl.DateTimeFormat(
      'es-CR',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }
    ).format(
      new Date(date)
    );
  }

  onImageError(
    event: Event
  ): void {
    const image =
      event.target as HTMLImageElement;

    image.src =
      '/images/publication-placeholder.svg';
  }
}