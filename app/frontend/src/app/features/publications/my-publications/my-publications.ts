import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, map, of, Subscription, switchMap, timer } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/v2/auth-session.service';
import { FEATURE_FLAGS } from '../../../core/feature-flags';
import { UserPublication } from '../models/my-publications.model';
import { Publication } from '../models/publication.model';
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
  private filteredRequest?: Subscription;
  private readonly ownedResults = signal<UserPublication[] | null>(null);
  readonly filtering = signal(false);

  /** Solo flujo legado (authCoreV2=false). Con authCoreV2 nunca se usa. */
  private readonly currentUserId = 'USR-001';

  readonly unavailable = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly deleteError = signal(false);

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
    if (this.useInternalCatalog) return this.ownedResults() ?? this.allPublications();
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
    this.filteredRequest?.unsubscribe();
    this.ownedResults.set(null);
    this.filtering.set(false);
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
      ? this.publicationService.getOwnedPublications().pipe(
          map(catalog => {
            const items = this.toOwnedRows(catalog, identity.userId);
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
          if (identity) this.loadOwnedResults();
        },

        error: () => {
          this.allPublications.set([]);
          this.totalRecords.set(0);
          this.error.set(true);
          this.loading.set(false);
        }
      });
  }

  private toOwnedRows(items: Publication[], userId: string): UserPublication[] {
    return items
      .filter(item => item.vendedor?.userId === userId)
      .map(item => ({ ...item, estado: item.estado === 'activo' ? 'activa' : item.estado }));
  }

  private loadOwnedResults(delay = 0): void {
    if (!this.useInternalCatalog || this.loading()) return;
    this.filteredRequest?.unsubscribe();
    const session = this.session;
    const identity = session?.currentIdentity();
    const q = this.searchTerm().trim();
    const categoria = this.selectedCategory();
    const status = this.selectedStatus();
    const sort = this.sortBy();
    if (identity && !q && !categoria && status === 'all' && sort === 'recent') {
      this.ownedResults.set(null);
      this.filtering.set(false);
      return;
    }
    if (!identity) {
      this.loadPublications();
      return;
    }

    this.filtering.set(true);
    this.filteredRequest = (delay ? timer(delay) : of(0)).pipe(
      switchMap(() => this.publicationService.getOwnedPublications({
        q,
        categoria: categoria ?? undefined,
        estado: status === 'all' ? undefined : status === 'activa' ? 'activo' : status,
        sortBy: sort.startsWith('price') ? 'precio' : 'fecha',
        sortDirection: sort === 'oldest' || sort === 'price-asc' ? 'asc' : 'desc'
      })),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.filtering.set(false))
    ).subscribe({
      next: items => {
        if (!session?.isCurrentIdentity(identity)) {
          this.ownedResults.set([]);
          this.allPublications.set([]);
          this.totalRecords.set(0);
          this.error.set(true);
          return;
        }
        this.ownedResults.set(this.toOwnedRows(items, identity.userId));
      },
      error: () => {
        this.ownedResults.set([]);
        this.error.set(true);
      }
    });
  }

  deletePublication(publication: UserPublication): void {
    const session = this.session;
    const identity = session?.currentIdentity();
    if (!session || !identity || this.deletingId() || !this.publications().includes(publication)) return;
    if (!window.confirm(`¿Eliminar «${publication.titulo}»?`) || !session.isCurrentIdentity(identity)) return;

    this.deleteError.set(false);
    this.deletingId.set(publication.id);
    this.publicationService.deletePublication(publication.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.deletingId.set(null)),
    ).subscribe({
      next: () => {
        if (!session.isCurrentIdentity(identity)) return;
        this.allPublications.update(items => items.filter(item => item.id !== publication.id));
        this.totalRecords.set(this.allPublications().length);
        this.ownedResults.update(items => items?.filter(item => item.id !== publication.id) ?? null);
        if (this.filtering()) this.loadOwnedResults();
      },
      error: () => {
        if (session.isCurrentIdentity(identity)) this.deleteError.set(true);
      },
    });
  }

  selectStatus(
    status: PublicationStatusFilter
  ): void {
    this.selectedStatus.set(status);
    this.loadOwnedResults();
  }

  onSearch(event: Event): void {
    const input =
      event.target as HTMLInputElement;

    this.searchTerm.set(
      input.value
    );
    this.loadOwnedResults(250);
  }

  onCategoryChange(
    event: Event
  ): void {
    const select =
      event.target as HTMLSelectElement;

    this.selectedCategory.set(
      select.value || null
    );
    this.loadOwnedResults();
  }

  onSortChange(
    event: Event
  ): void {
    const select =
      event.target as HTMLSelectElement;

    this.sortBy.set(
      select.value as PublicationSortOption
    );
    this.loadOwnedResults();
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.selectedStatus.set('all');
    this.selectedCategory.set(null);
    this.sortBy.set('recent');
    this.loadOwnedResults();
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
