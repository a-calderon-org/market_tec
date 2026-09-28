import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/api/api-client.service';
import { PaginatedResponse } from '../../../shared/paginated-response.model';
import { Chat, SendMessage } from '../models/chat.model';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly apiClient =
    inject(ApiClientService);

  getChats():
    Observable<
      PaginatedResponse<Chat>
    > {
    return this.apiClient.get<
      PaginatedResponse<Chat>
    >(
      '/chats'
    );
  }

  sendMessage(
    chatId: string,
    message: SendMessage
  ): Observable<void> {
    return this.apiClient.post<void>(
      `/chats/${chatId}/mensajes`,
      message
    );
  }
}