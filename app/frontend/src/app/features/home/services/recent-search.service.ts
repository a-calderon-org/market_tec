import { Injectable, Signal, signal, WritableSignal } from '@angular/core';

const RECENT_SEARCHES_KEY = 'markettec.recent-searches';
const RECENT_SEARCHES_LIMIT = 10;

/** Historial de búsquedas recientes persistido en `localStorage` bajo su propia clave. */
export class RecentSearchHistory {
  private readonly searchesState: WritableSignal<string[]>;

  readonly searches: Signal<string[]>;

  constructor(private readonly storageKey: string) {
    this.searchesState = signal<string[]>(this.readStoredSearches());
    this.searches = this.searchesState.asReadonly();
  }

  record(query: string): void {
    const normalizedQuery = this.normalize(query);

    if (!normalizedQuery) {
      return;
    }

    const comparisonKey = this.comparisonKey(normalizedQuery);
    const searches = [
      normalizedQuery,
      ...this.searchesState().filter(
        (search) =>
          this.comparisonKey(search) !== comparisonKey
      )
    ].slice(0, RECENT_SEARCHES_LIMIT);

    this.update(searches);
  }

  remove(query: string): void {
    const comparisonKey = this.comparisonKey(query);

    this.update(
      this.searchesState().filter(
        (search) =>
          this.comparisonKey(search) !== comparisonKey
      )
    );
  }

  clear(): void {
    this.update([]);
  }

  private readStoredSearches(): string[] {
    try {
      const storedValue = globalThis.localStorage?.getItem(
        this.storageKey
      );

      if (!storedValue) {
        return [];
      }

      const parsedValue: unknown = JSON.parse(storedValue);

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      const searches: string[] = [];
      const seen = new Set<string>();

      for (const value of parsedValue) {
        if (typeof value !== 'string') {
          continue;
        }

        const normalizedValue = this.normalize(value);
        const comparisonKey = this.comparisonKey(normalizedValue);

        if (!normalizedValue || seen.has(comparisonKey)) {
          continue;
        }

        searches.push(normalizedValue);
        seen.add(comparisonKey);

        if (searches.length === RECENT_SEARCHES_LIMIT) {
          break;
        }
      }

      return searches;
    } catch {
      return [];
    }
  }

  private update(searches: string[]): void {
    this.searchesState.set(searches);

    try {
      globalThis.localStorage?.setItem(
        this.storageKey,
        JSON.stringify(searches)
      );
    } catch {
      // The in-memory history remains usable when storage is unavailable.
    }
  }

  private normalize(query: string): string {
    return query.trim().replace(/\s+/g, ' ');
  }

  private comparisonKey(query: string): string {
    return this.normalize(query).toLocaleLowerCase('es');
  }
}

/** Búsquedas recientes de publicaciones en «Explorar». */
@Injectable({
  providedIn: 'root'
})
export class RecentSearchService extends RecentSearchHistory {
  constructor() {
    super(RECENT_SEARCHES_KEY);
  }
}
