import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { map, Subscription } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/v2/auth-session.service';
import { FEATURE_FLAGS } from '../../../core/feature-flags';
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

  private readonly flags = inject(FEATURE_FLAGS);
  readonly useInternalCatalog = this.flags.authCoreV2 &&
    this.flags.authCoreV2Adapter === 'http' && this.flags.catalogInternalJwt;
  private readonly session = this.useInternalCatalog ? inject(AuthSessionService) : null;
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;

  /** Solo flujo legado (authCoreV2=false). Con authCoreV2 nunca se usa. */
  private readonly currentUserId = 'USR-001';

  readonly unavailable = signal(false);

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
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    this.unavailable.set(false);

    const session = this.session;
    const identity = session?.currentIdentity();
    if (this.flags.authCoreV2 && !identity) {
      this.allPublications.set([]);
      this.totalRecords.set(0);
      this.unavailable.set(!this.useInternalCatalog);
      this.error.set(true);
      this.loading.set(false);
      return;
    }

    const result = identity
      ? this.publicationService.getPublicationCatalog().pipe(
          map(catalog => {
            const items = catalog
              .filter(publication => publication.vendedor?.userId === identity.userId)
              .map(publication => ({
                ...publication,
                estado: publication.estado === 'activo' ? 'activa' : publication.estado,
              }));
            return { items, totalRecords: items.length, page: 1, pageSize: Math.max(10, items.length) };
          }),
        )
      : this.publicationService.getUserPublications(this.currentUserId);

    this.request = result.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (identity && !session?.isCurrentIdentity(identity)) {
            this.allPublications.set([]);
            this.totalRecords.set(0);
            this.loading.set(false);
            return;
          }
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
          this.totalRecords.set(0);
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
