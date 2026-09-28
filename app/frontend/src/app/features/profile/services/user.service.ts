import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/api/api-client.service';
import { UpdateUser, UpdateUserResponse, User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly apiClient =
    inject(ApiClientService);

  getUser(
    id: string
  ): Observable<User> {
    return this.apiClient.get<User>(
      `/usuarios/${id}`
    );
  }

  updateUser(
    id: string,
    user: UpdateUser
  ): Observable<UpdateUserResponse> {
    return this.apiClient.put<
      UpdateUserResponse
    >(
      `/usuarios/${id}`,
      user
    );
  }
}