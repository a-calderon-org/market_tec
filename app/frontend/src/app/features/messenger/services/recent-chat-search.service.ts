import { Injectable } from '@angular/core';
import { RecentSearchHistory } from '../../home/services/recent-search.service';

/** Búsquedas recientes de conversaciones en «Mensajes»; historial separado del de publicaciones. */
@Injectable({
  providedIn: 'root'
})
export class RecentChatSearchService extends RecentSearchHistory {
  constructor() {
    super('markettec.recent-chat-searches');
  }
}
