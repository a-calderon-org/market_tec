import { inject, Injectable, Injector } from '@angular/core';
import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';
import { ApiClientService } from '../../../core/api/api-client.service';
import { AuthSessionService } from '../../../core/auth/v2/auth-session.service';
import { FEATURE_FLAGS } from '../../../core/feature-flags';
import { PaginatedResponse } from '../../../shared/paginated-response.model';
import { PublicationService } from '../../publications/services/publication.service';
import { Chat, SendMessage, SessionMessage } from '../models/chat.model';

interface CatalogChat {
  id: string;
  publicationId: string;
  buyerId: string;
  sellerId: string;
}

interface CatalogMessage {
  id: string;
  texto: string;
  sentAt: number;
  senderUserId: string;
}

interface SentMessage {
  data: { id: string; createdAt: number };
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly injector = inject(Injector);
  private readonly flags = inject(FEATURE_FLAGS);
  readonly catalogMessaging = this.flags.authCoreV2 && this.flags.catalogInternalJwt === true;
  private readonly apiClient =
    inject(ApiClientService);

  getChats():
    Observable<
      PaginatedResponse<Chat>
    > {
    if (this.catalogMessaging) {
      return this.apiClient.get<PaginatedResponse<CatalogChat>>('/chats', new HttpParams().set('pageSize', 100)).pipe(
        switchMap(page => (page.items.length ? forkJoin(page.items.map(chat => this.present(chat))) : of([])).pipe(
          map(items => ({ ...page, items })),
        )),
      );
    }
    return this.apiClient.get<
      PaginatedResponse<Chat>
    >(
      '/chats'
    );
  }

  sendMessage(
    chatId: string,
    message: SendMessage
  ): Observable<void | SentMessage> {
    return this.apiClient.post<void | SentMessage>(
      `/chats/${chatId}/mensajes`,
      message
    );
  }

  startChat(publicationId: string): Observable<Chat> {
    return this.apiClient.post<CatalogChat>('/chats', { publicationId }).pipe(
      switchMap(chat => this.present(chat)),
    );
  }

  getMessages(chatId: string): Observable<SessionMessage[]> {
    const url = `/chats/${chatId}/mensajes`;
    const pageSize = 100;
    const params = new HttpParams().set('pageSize', pageSize);
    return this.apiClient.get<PaginatedResponse<CatalogMessage>>(url, params).pipe(
      switchMap(first => first.totalRecords <= pageSize
        ? of(first)
        : this.apiClient.get<PaginatedResponse<CatalogMessage>>(url, params.set('page', Math.ceil(first.totalRecords / pageSize)))),
      map(page => {
        const userId = this.injector.get(AuthSessionService).user()?.userId;
        return page.items.map(message => ({
          id: message.id, texto: message.texto, fecha: new Date(message.sentAt * 1000).toISOString(),
          enviadoPorMi: message.senderUserId === userId,
        }));
      }),
    );
  }

  private present(chat: CatalogChat): Observable<Chat> {
    const userId = this.injector.get(AuthSessionService).user()?.userId;
    const otherIsSeller = userId === chat.buyerId;
    const participantId = otherIsSeller ? chat.sellerId : chat.buyerId;
    const placeholder = '/images/publication-placeholder.svg';
    return this.injector.get(PublicationService).getPublicationById(chat.publicationId).pipe(
      catchError((error: unknown) => error instanceof HttpErrorResponse && error.status === 404
        ? of(null)
        : throwError(() => error)),
      map(publication => {
        const seller = otherIsSeller && publication?.vendedor.userId === participantId ? publication.vendedor : null;
        return {
          id: chat.id,
          participante: { id: participantId, nombre: seller?.nombre ?? (otherIsSeller ? 'Vendedor' : 'Comprador'),
            fotoPerfil: '', verificado: seller?.verificado ?? false },
          publicacion: { id: chat.publicationId, titulo: publication?.titulo ?? 'Publicación no disponible',
            imagen: publication?.imagenes?.[0] ?? publication?.imagen ?? placeholder, precio: publication?.precio ?? null },
          ultimoMensaje: null,
          mensajesNoLeidos: null,
        };
      }),
    );
  }
}
