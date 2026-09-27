import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClientService } from '../../../core/api/api-client.service';
import { PaginatedResponse } from '../../../shared/paginated-response.model';
import { Publication } from '../models/publication.model';

@Injectable({
  providedIn: 'root'
})
export class PublicationService {
  private readonly apiClient = inject(ApiClientService);

  getPublications(): Observable<PaginatedResponse<Publication>> {
    return this.apiClient.get<PaginatedResponse<Publication>>(
      '/publicaciones'
    );
  }

  getPublicationById(id: string): Observable<Publication> {
    return this.apiClient.get<Publication>(
      `/publicaciones/${id}`
    );
  }
}