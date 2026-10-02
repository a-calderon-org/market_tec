import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
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
