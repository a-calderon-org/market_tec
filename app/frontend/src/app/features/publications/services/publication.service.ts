import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import {
  defer,
  EMPTY,
  expand,
  map,
  Observable,
  reduce,
  throwError
} from 'rxjs';
import { PublicationDetail } from '../models/publication-detail.model';
import { ApiClientService } from '../../../core/api/api-client.service';
import { PaginatedResponse } from '../../../shared/paginated-response.model';
import { Publication } from '../models/publication.model';
import { UserPublication } from '../models/my-publications.model';
import { CreatePublication } from '../models/publication-create.model';

@Injectable({
  providedIn: 'root'
})
export class PublicationService {
  private readonly apiClient = inject(ApiClientService);

  getPublications(page: number, pageSize: number): Observable<PaginatedResponse<Publication>> {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);

    return this.apiClient.get<PaginatedResponse<Publication>>(
      '/publicaciones',
      params
    );
  }

  getPublicationCatalog(
    pageSize = 100
  ): Observable<Publication[]> {
    return defer(() => {
      const visitedPages = new Set<number>();

      return this.getPublications(1, pageSize).pipe(
        expand((response) => {
          if (
            response.pageSize <= 0 ||
            response.page <= 0 ||
            visitedPages.has(response.page)
          ) {
            return throwError(
              () => new Error('Invalid publication pagination')
            );
          }

          visitedPages.add(response.page);

          const totalPages = Math.ceil(
            response.totalRecords / response.pageSize
          );

          return response.page < totalPages
            ? this.getPublications(
                response.page + 1,
                response.pageSize
              )
            : EMPTY;
        }),
        reduce(
          (catalog, response) => ({
            expectedTotal: Math.max(
              catalog.expectedTotal,
              response.totalRecords
            ),
            items: [...catalog.items, ...response.items]
          }),
          {
            expectedTotal: 0,
            items: [] as Publication[]
          }
        ),
        map(({ expectedTotal, items }) => {
          const uniqueItems = Array.from(
            new Map(
              items.map((publication) => [
                publication.id,
                publication
              ])
            ).values()
          );

          if (uniqueItems.length < expectedTotal) {
            throw new Error('Incomplete publication catalog');
          }

          return uniqueItems;
        })
      );
    });
  }

  getPublicationById(id: string): Observable<PublicationDetail> {
    return this.apiClient.get<PublicationDetail>(
      `/publicaciones/${id}`
    );
  }

  getUserPublications(
    userId: string
  ): Observable<PaginatedResponse<UserPublication>> {
    return this.apiClient.get<PaginatedResponse<UserPublication>>(
      `/usuarios/${userId}/publicaciones`
    );
  }

  createPublication(
    publication: CreatePublication
  ): Observable<void> {
    return this.apiClient.post<void>(
      '/publicaciones',
      publication
    );
  }
}
