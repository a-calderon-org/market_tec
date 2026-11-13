import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import {
  defer,
  EMPTY,
  expand,
  map,
  Observable,
  reduce,
  switchMap,
  throwError
} from 'rxjs';
import { PublicationDetail } from '../models/publication-detail.model';
import { ApiClientService } from '../../../core/api/api-client.service';
import { PaginatedResponse } from '../../../shared/paginated-response.model';
import { Publication } from '../models/publication.model';
import { UserPublication } from '../models/my-publications.model';
import { CreatePublication, UpdatePublication } from '../models/publication-create.model';

@Injectable({
  providedIn: 'root'
})
export class PublicationService {
  private readonly apiClient = inject(ApiClientService);

  uploadImage(file: File): Observable<string> {
    return this.apiClient.post<{ data: { uploadUrl: string; publicUrl: string } }>(
      '/images/upload-url', { filename: file.name, contentType: file.type },
    ).pipe(switchMap(async ({ data }) => {
      const upload = new URL(data.uploadUrl);
      const published = new URL(data.publicUrl);
      if (upload.protocol !== 'https:' || upload.origin !== published.origin ||
          !/^[a-z0-9]{3,24}\.blob\.core\.windows\.net$/.test(upload.hostname) ||
          upload.username || upload.password || published.username || published.password ||
          published.search || published.hash) {
        throw new Error('Invalid Blob upload destination');
      }
      const result = await fetch(upload, { method: 'PUT', body: file, credentials: 'omit', redirect: 'error',
        signal: AbortSignal.timeout(60_000), headers: { 'Content-Type': file.type, 'x-ms-blob-type': 'BlockBlob' } });
      if (result.status !== 201) throw new Error('Image upload failed');
      return published.href;
    }));
  }

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

  /** Solo con el ms-catalog propio (JWT interno): reemplaza el contenido de una publicación propia. */
  updatePublication(
    id: string,
    publication: UpdatePublication
  ): Observable<PublicationDetail> {
    return this.apiClient.put<PublicationDetail>(
      `/publicaciones/${encodeURIComponent(id)}`,
      publication
    );
  }
}
