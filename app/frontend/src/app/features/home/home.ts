import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';
import { Subscription } from 'rxjs';
import { PublicationCard } from '../../shared/publication-card';
import { Publication } from '../publications/models/publication.model';
import { PublicationService } from '../publications/services/publication.service';
import { HomeFilterService, HomeSortOption } from './services/home-filter.service';
import { RecentSearchService } from './services/recent-search.service';

const HOME_CATEGORY_LABELS = new Map<string, string>([
  ['electronicos', 'Electrónicos'],
  ['alquiler', 'Alquileres'],
  ['tutoria', 'Tutorías']
]);

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    PublicationCard
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit, OnDestroy {
  @ViewChild('searchContainer', { static: true })
  private searchContainer?: ElementRef<HTMLElement>;

  @ViewChild('searchInput', { static: true })
  private searchInput?: ElementRef<HTMLInputElement>;

  private readonly publicationService = inject(PublicationService);
  private readonly homeFilterService = inject(HomeFilterService);
  private readonly recentSearchService = inject(RecentSearchService);
  private catalogSubscription?: Subscription;

  private readonly allPublications = signal<Publication[]>([]);

  readonly page = signal(1);
  readonly pageSize = signal(12);

  readonly loading = signal(true);
  readonly error = signal(false);

  readonly searchTerm = signal('');
  readonly searchDraft = signal('');
  readonly showRecentSearches = signal(false);
  readonly recentSearches = this.recentSearchService.searches;
  readonly sortBy = signal<HomeSortOption>('recent');

  readonly selectedCategory = signal<string | null>(null);
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);

  readonly categories = computed(() =>
    Array.from(
      new Set(
        this.allPublications()
          .map((publication) => publication.categoria)
          .filter(
            (category): category is string =>
              typeof category === 'string' &&
              category.trim().length > 0
          )
      )
    ).sort((first, second) =>
      first.localeCompare(second, 'es', {
        sensitivity: 'base'
      })
    )
  );

  readonly filteredPublications = computed(() =>
    this.homeFilterService.applyFilters(
      this.allPublications(),
      {
        searchTerm: this.searchTerm(),
        category: this.selectedCategory(),
        minPrice: this.minPrice(),
        maxPrice: this.maxPrice(),
        sortBy: this.sortBy()
      }
    )
  );
  readonly totalRecords = computed(
    () => this.filteredPublications().length
  );
  readonly totalPages = computed(() =>
    Math.ceil(this.totalRecords() / this.pageSize())
  );
  readonly publications = computed(() => {
    const start = (this.page() - 1) * this.pageSize();

    return this.filteredPublications().slice(
      start,
      start + this.pageSize()
    );
  });

  ngOnInit(): void {
    this.loadPublications();
  }

  ngOnDestroy(): void {
    this.catalogSubscription?.unsubscribe();
  }

  loadPublications(): void {
    this.loading.set(true);
    this.error.set(false);

    this.catalogSubscription?.unsubscribe();
    this.catalogSubscription = this.publicationService
      .getPublicationCatalog()
      .subscribe({
        next: (response) => {
          this.allPublications.set(response);
          this.ensureValidPage();

          this.loading.set(false);
        },

        error: () => {
          this.error.set(true);
          this.loading.set(false);
        }
      });
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.update((page) => page + 1);
    }
  }

  previousPage(): void {
    if (this.page() > 1) {
      this.page.update((page) => page - 1);
    }
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.searchDraft.set(input.value);
    this.searchTerm.set(input.value);
    this.page.set(1);
  }

  executeSearch(): void {
    const query = this.searchDraft().trim().replace(/\s+/g, ' ');

    this.searchDraft.set(query);
    this.searchTerm.set(query);
    this.page.set(1);
    this.showRecentSearches.set(false);
    this.recentSearchService.record(query);
  }

  selectRecentSearch(query: string): void {
    this.searchDraft.set(query);
    this.searchInput?.nativeElement.focus();
    this.executeSearch();
  }

  removeRecentSearch(query: string, event: Event): void {
    event.stopPropagation();
    this.searchInput?.nativeElement.focus();
    this.recentSearchService.remove(query);
    this.showRecentSearches.set(
      this.recentSearches().length > 0
    );
  }

  clearRecentSearches(): void {
    this.searchInput?.nativeElement.focus();
    this.recentSearchService.clear();
    this.showRecentSearches.set(false);
  }

  openRecentSearches(): void {
    this.showRecentSearches.set(true);
  }

  onSearchFocusOut(event: FocusEvent): void {
    const container = this.searchContainer?.nativeElement;
    const nextTarget = event.relatedTarget as Node | null;

    if (
      container &&
      nextTarget &&
      !container.contains(nextTarget)
    ) {
      this.showRecentSearches.set(false);
    }
  }

  closeRecentSearches(restoreInputFocus = false): void {
    if (restoreInputFocus) {
      this.searchInput?.nativeElement.focus();
    }

    this.showRecentSearches.set(false);
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    const container = this.searchContainer?.nativeElement;
    const target = event.target;

    if (
      container &&
      target instanceof Node &&
      !container.contains(target)
    ) {
      this.showRecentSearches.set(false);
    }
  }

  selectCategory(category: string | null): void {
    this.selectedCategory.set(category);
    this.page.set(1);
  }

  categoryLabel(category: string): string {
    const knownLabel = HOME_CATEGORY_LABELS.get(category);

    if (knownLabel) {
      return knownLabel;
    }

    const readableCategory = category
      .replace(/[-_]+/g, ' ')
      .trim();

    return readableCategory
      ? readableCategory.charAt(0).toLocaleUpperCase('es') +
          readableCategory.slice(1)
      : category;
  }

  onMinPriceChange(event: Event): void {
    this.minPrice.set(
      this.getNonNegativeNumericValue(event)
    );
    this.page.set(1);
  }

  onMaxPriceChange(event: Event): void {
    this.maxPrice.set(
      this.getNonNegativeNumericValue(event)
    );
    this.page.set(1);
  }

  onSortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;

    this.sortBy.set(
      select.value as HomeSortOption
    );
    this.page.set(1);
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.searchDraft.set('');
    this.selectedCategory.set(null);
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.sortBy.set('recent');
    this.page.set(1);
  }

  private getNonNegativeNumericValue(event: Event): number | null {
    const input = event.target as HTMLInputElement;

    if (input.value === '') {
      return null;
    }

    const value = Number(input.value);

    if (Number.isNaN(value)) {
      input.value = '';
      return null;
    }

    if (value < 0) {
      input.value = '0';
      return 0;
    }

    return value;
  }

  private ensureValidPage(): void {
    const lastPage = Math.max(1, this.totalPages());

    if (this.page() > lastPage) {
      this.page.set(lastPage);
    }
  }
}
