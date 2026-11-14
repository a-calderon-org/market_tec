import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Chat, SessionMessage } from './models/chat.model';
import { ChatService } from './services/chat.service';
import { RecentChatSearchService } from './services/recent-chat-search.service';

@Component({
  selector: 'app-messenger',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink
  ],
  templateUrl: './messenger.html',
  styleUrls: ['./messenger.scss', './recent-chat-searches.scss']
})
export class Messenger implements OnInit {
  private readonly chatService =
    inject(ChatService);
  readonly catalogMessaging = this.chatService.catalogMessaging === true;
  readonly historyError = signal(false);

  private readonly route =
    inject(ActivatedRoute);

  private readonly destroyRef =
    inject(DestroyRef);

  private readonly formBuilder =
    inject(NonNullableFormBuilder);

  readonly chats =
    signal<Chat[]>([]);

  readonly selectedChatId =
    signal<string | null>(null);

  readonly mobileConversationOpen =
    signal(false);

  readonly searchTerm =
    signal('');

  readonly unreadOnly =
    signal(false);

  readonly loading =
    signal(true);

  readonly error =
    signal(false);

  readonly sending =
    signal(false);

  readonly sendError =
    signal(false);

  readonly sendErrorMessage =
    signal('');

  readonly failedAvatarIds =
    signal<Set<string>>(
      new Set()
    );

  readonly sessionMessages =
    signal<
      Record<
        string,
        SessionMessage[]
      >
    >({});

  readonly messageForm =
    this.formBuilder.group({
      texto:
        this.formBuilder.control(
          '',
          {
            validators: [
              Validators.required,
              Validators.maxLength(500)
            ]
          }
        )
    });

  readonly selectedChat =
    computed(() => {
      const selectedId =
        this.selectedChatId();

      if (!selectedId) {
        return null;
      }

      return (
        this.chats()
          .find(
            (chat) =>
              chat.id ===
              selectedId
          ) ??
        null
      );
    });

  readonly filteredChats =
    computed(() => {
      const term =
        this.searchTerm()
          .trim()
          .toLowerCase();

      const unread =
        this.unreadOnly();

      return this.chats()
        .filter(
          (chat) => {
            if (
              unread &&
              !chat.mensajesNoLeidos
            ) {
              return false;
            }

            if (!term) {
              return true;
            }

            return (
              chat.participante.nombre
                .toLowerCase()
                .includes(term) ||
              chat.publicacion.titulo
                .toLowerCase()
                .includes(term) ||
              !!chat.ultimoMensaje?.texto
                .toLowerCase()
                .includes(term)
            );
          }
        );
    });

  readonly totalUnread =
    computed(() =>
      this.chats()
        .reduce(
          (
            total,
            chat
          ) =>
            total +
            (chat.mensajesNoLeidos ?? 0),
          0
        )
    );

  readonly selectedSessionMessages =
    computed(() => {
      const chatId =
        this.selectedChatId();

      if (!chatId) {
        return [];
      }

      return (
        this.sessionMessages()[
          chatId
        ] ?? []
      );
    });

  readonly selectedInitials =
    computed(() => {
      const chat =
        this.selectedChat();

      if (!chat) {
        return '';
      }

      return this.getInitials(
        chat.participante.nombre
      );
    });

  ngOnInit(): void {
    this.loadChats();
  }

  loadChats(): void {
    this.loading.set(true);
    this.error.set(false);

    this.chatService
      .getChats()
      .subscribe({
        next: (response) => {
          this.chats.set(
            response.items
          );

          const requestedPublicationId =
            this.route.snapshot
              .queryParamMap
              .get('publicacion');

          const requestedSellerId =
            this.route.snapshot
              .queryParamMap
              .get('vendedor');

          if (this.catalogMessaging && requestedPublicationId) {
            this.chatService.startChat(requestedPublicationId).subscribe({
              next: chat => {
                this.chats.update(chats => [chat, ...chats.filter(current => current.id !== chat.id)]);
                this.selectChat(chat.id);
                this.loading.set(false);
              },
              error: () => {
                this.error.set(this.chats().length === 0);
                this.sendError.set(true);
                this.sendErrorMessage.set('No fue posible iniciar la conversación para esta publicación.');
                this.loading.set(false);
              },
            });
            return;
          }

          const requestedChat =
            response.items.find(
              (chat) =>
                chat.publicacion.id ===
                  requestedPublicationId &&
                (
                  !requestedSellerId ||
                  String(
                    chat.participante.id
                  ) ===
                    requestedSellerId
                )
            );

          if (requestedChat) {
            this.selectedChatId.set(
              requestedChat.id
            );

            this.mobileConversationOpen.set(
              true
            );
          }

          if (
            response.items.length >
              0 &&
            !this.selectedChatId()
          ) {
            this.selectedChatId.set(
              response.items[0].id
            );
            if (this.catalogMessaging) this.loadMessages(response.items[0].id);
          }

          this.loading.set(false);
        },

        error: () => {
          this.chats.set([]);
          this.error.set(true);
          this.loading.set(false);
        }
      });
  }

  selectChat(
    chatId: string
  ): void {
    this.selectedChatId.set(
        chatId
    );

    this.mobileConversationOpen.set(
      true
    );

    this.sendError.set(
        false
    );
    if (this.catalogMessaging) this.loadMessages(chatId);
  }

  private loadMessages(chatId: string): void {
    this.historyError.set(false);
    this.chatService.getMessages(chatId).subscribe({
      next: history => {
        this.sessionMessages.update(messages => {
          const ids = new Set(history.map(message => message.id));
          return { ...messages, [chatId]: [...history, ...(messages[chatId] ?? []).filter(message => !ids.has(message.id))] };
        });
        const latest = this.sessionMessages()[chatId]?.at(-1);
        if (latest) this.chats.update(chats => chats.map(chat => chat.id === chatId
          ? { ...chat, ultimoMensaje: latest } : chat));
      },
      error: () => {
        if (this.selectedChatId() === chatId) this.historyError.set(true);
      },
    });
  }

  closeConversation(): void {
    this.mobileConversationOpen.set(
      false
    );
  }

  onSearch(
    event: Event
  ): void {
    const target =
      event.target as
        HTMLInputElement;

    this.searchTerm.set(
      target.value
    );
    this.scheduleRecentSearchRecord();
  }

  // ---- Búsquedas recientes --------------------------------------------------------------------------------------

  private readonly recentChatSearches = inject(RecentChatSearchService);
  readonly recentSearches = this.recentChatSearches.searches;
  readonly showRecentSearches = signal(false);
  private recentSearchTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly releaseRecentSearchTimer = this.destroyRef.onDestroy(() => clearTimeout(this.recentSearchTimer));

  /** La lista se filtra al escribir: la búsqueda se guarda como reciente tras una pausa. */
  private scheduleRecentSearchRecord(): void {
    clearTimeout(this.recentSearchTimer);
    this.recentSearchTimer = setTimeout(() => {
      const query = this.searchTerm().trim().replace(/\s+/g, ' ');
      if (query.length >= 2) this.recentChatSearches.record(query);
    }, 1200);
  }

  openRecentSearches(): void {
    this.showRecentSearches.set(true);
  }

  closeRecentSearches(): void {
    this.showRecentSearches.set(false);
  }

  /** Cierra la lista solo si el foco sale del buscador (no al pulsar una de sus opciones). */
  onSearchFocusOut(event: FocusEvent): void {
    const container = event.currentTarget as HTMLElement;
    const next = event.relatedTarget as Node | null;
    if (!next || !container.contains(next)) this.showRecentSearches.set(false);
  }

  selectRecentSearch(query: string, input: HTMLInputElement): void {
    clearTimeout(this.recentSearchTimer);
    this.searchTerm.set(query);
    this.recentChatSearches.record(query);
    input.focus(); // Dispara focusin (abre la lista): se cierra después.
    this.showRecentSearches.set(false);
  }

  removeRecentSearch(query: string, input: HTMLInputElement): void {
    this.recentChatSearches.remove(query);
    input.focus();
  }

  clearRecentSearches(input: HTMLInputElement): void {
    this.recentChatSearches.clear();
    input.focus();
    this.showRecentSearches.set(false);
  }

  showAllChats(): void {
    this.unreadOnly.set(
      false
    );
  }

  showUnreadChats(): void {
    this.unreadOnly.set(
      true
    );
  }

  sendMessage(): void {
    this.sendError.set(false);
    this.sendErrorMessage.set('');

    const chat =
      this.selectedChat();

    const texto =
      this.messageForm.controls
        .texto.value.trim();

    if (
      !chat ||
      !texto ||
      texto.length > 500 ||
      this.sending()
    ) {
      this.messageForm
        .markAllAsTouched();

      return;
    }

    this.sending.set(true);

    this.chatService
      .sendMessage(
        chat.id,
        {
          texto
        }
      )
      .subscribe({
        next: (result) => {
          const saved = this.catalogMessaging && result ? result.data : undefined;
          const now = saved ? new Date(saved.createdAt * 1000) : new Date();

          const message:
            SessionMessage = {
              id:
                saved?.id ?? `session-${now.getTime()}`,

              texto,

              fecha:
                now.toISOString(),

              enviadoPorMi:
                true
            };

          this.sessionMessages
            .update(
              (messages) => ({
                ...messages,

                [chat.id]: [
                  ...(
                    messages[
                      chat.id
                    ] ?? []
                  ).filter(existing => existing.id !== message.id),
                  message
                ]
              })
            );

          this.chats.update(
            (chats) =>
              chats.map(
                (currentChat) =>
                  currentChat.id ===
                  chat.id
                    ? {
                        ...currentChat,

                        ultimoMensaje: {
                          texto,
                          fecha:
                            now.toISOString(),
                          enviadoPorMi:
                            true
                        }
                      }
                    : currentChat
              )
          );

          this.messageForm.reset({
            texto: ''
          });

          this.sending.set(false);
        },

        error: () => {
          this.sendError.set(true);

          this.sendErrorMessage.set(
            'No fue posible enviar el mensaje. Inténtalo nuevamente.'
          );

          this.sending.set(false);
        }
      });
  }

  onAvatarError(
    chatId: string
  ): void {
    this.failedAvatarIds.update(
      (current) => {
        const updated =
          new Set(current);

        updated.add(chatId);

        return updated;
      }
    );
  }

  avatarFailed(
    chatId: string
  ): boolean {
    return this.failedAvatarIds()
      .has(chatId);
  }

  onPublicationImageError(
    event: Event
  ): void {
    const image =
      event.target as
        HTMLImageElement;

    image.src =
      '/images/publication-placeholder.svg';
  }

  getInitials(
    name: string
  ): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(
        (part) =>
          part.charAt(0)
      )
      .join('')
      .toUpperCase();
  }

  formatPrice(
    price: number
  ): string {
    return new Intl
      .NumberFormat(
        'es-CR',
        {
          style:
            'currency',

          currency:
            'CRC',

          maximumFractionDigits:
            0
        }
      )
      .format(price);
  }

  formatTime(
    date: string
  ): string {
    const value =
      new Date(date);

    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      return '';
    }

    return new Intl
      .DateTimeFormat(
        'es-CR',
        {
          hour:
            '2-digit',

          minute:
            '2-digit'
        }
      )
      .format(value);
  }
}
