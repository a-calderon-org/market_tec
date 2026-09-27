import { Injectable } from '@angular/core';
import { Publication } from '../../publications/models/publication.model';

export type HomeSortOption =
  | 'recent'
  | 'price-asc'
  | 'price-desc';

export interface HomeFilters {
  searchTerm: string;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  sortBy: HomeSortOption;
}

@Injectable({
  providedIn: 'root'
})
export class HomeFilterService {
  applyFilters(
    publications: Publication[],
    filters: HomeFilters
  ): Publication[] {
    const searchTerm = filters.searchTerm
      .trim()
      .toLocaleLowerCase('es');

    return publications
      .filter((publication) => {
        if (!searchTerm) {
          return true;
        }

        const searchableText = [
          publication.titulo,
          publication.descripcion,
          publication.categoria,
          publication.subcategoria,
          publication.ubicacion,
          publication.vendedor.nombre
        ]
          .join(' ')
          .toLocaleLowerCase('es');

        return searchableText.includes(searchTerm);
      })
      .filter((publication) => {
        if (!filters.category) {
          return true;
        }

        return publication.categoria === filters.category;
      })
      .filter((publication) => {
        if (filters.minPrice === null) {
          return true;
        }

        return publication.precio >= filters.minPrice;
      })
      .filter((publication) => {
        if (filters.maxPrice === null) {
          return true;
        }

        return publication.precio <= filters.maxPrice;
      })
      .sort((a, b) => {
        switch (filters.sortBy) {
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
  }
}