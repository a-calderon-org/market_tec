import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { PublicationCard } from '../../shared/publication-card';
import { Publication } from '../publications/models/publication.model';
import { PublicationService } from '../publications/services/publication.service';
import { HomeFilterService, HomeSortOption } from './services/home-filter.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    PublicationCard
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit {
  private readonly publicationService = inject(PublicationService);
  private readonly homeFilterService = inject(HomeFilterService);

  private readonly allPublications = signal<Publication[]>([]);

  readonly totalRecords = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(12);
  readonly totalPages = computed(() =>
    Math.ceil(this.totalRecords() / this.pageSize())
  );

  readonly loading = signal(true);
  readonly error = signal(false);

  readonly searchTerm = signal('');
  readonly sortBy = signal<HomeSortOption>('recent');

  readonly selectedCategory = signal<string | null>(null);
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);

  readonly publications = computed(() =>
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

  ngOnInit(): void {
    this.loadPublications();
  }

  loadPublications(): void {
    this.loading.set(true);
    this.error.set(false);

    this.publicationService.getPublications(this.page(), this.pageSize()).subscribe({
      next: (response) => {
        this.allPublications.set(response.items);

        this.totalRecords.set(response.totalRecords);
        this.page.set(response.page);
        this.pageSize.set(response.pageSize);

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
      this.loadPublications();
    }
  }

  previousPage(): void {
    if (this.page() > 1) {
      this.page.update((page) => page - 1);
      this.loadPublications();
    }
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.searchTerm.set(input.value);
  }

  selectCategory(category: string | null): void {
    this.selectedCategory.set(category);
  }

  onMinPriceChange(event: Event): void {
    this.minPrice.set(
      this.getNonNegativeNumericValue(event)
    );
  }

  onMaxPriceChange(event: Event): void {
    this.maxPrice.set(
      this.getNonNegativeNumericValue(event)
    );
  }

  onSortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;

    this.sortBy.set(
      select.value as HomeSortOption
    );
  }

  resetFilters(): void {
    this.searchTerm.set('');
    this.selectedCategory.set(null);
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.sortBy.set('recent');
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
}
