import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter
} from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Chat } from './models/chat.model';
import { Messenger } from './messenger';
import { ChatService } from './services/chat.service';

describe('Messenger', () => {
  let fixture:
    ComponentFixture<Messenger>;

  let component:
    Messenger;

  const chats:
    Chat[] = [
      {
        id:
          'CHAT-001',

        participante: {
          id:
            'USR-002',

          nombre:
            'David Gutiérrez',

          fotoPerfil:
            'david.jpg',

          verificado:
            true
        },

        publicacion: {
          id:
            'PUB-2024-0655',

          titulo:
            'Calculadora TI-Nspire CX II CAS',

          imagen:
            'calculator.jpg',

          precio:
            85000
        },

        ultimoMensaje: {
          texto:
            'Perfecto, nos vemos en la biblioteca.',

          fecha:
            '2026-09-25T21:45:00',

          enviadoPorMi:
            false
        },

        mensajesNoLeidos:
          2
      },

      {
        id:
          'CHAT-002',

        participante: {
          id:
            'USR-003',

          nombre:
            'Valeria Rodríguez',

          fotoPerfil:
            'valeria.jpg',

          verificado:
            true
        },

        publicacion: {
          id:
            'PUB-2024-0742',

          titulo:
            'Monitor Dell 24 IPS 75Hz con HDMI',

          imagen:
            'monitor.jpg',

          precio:
            65000
        },

        ultimoMensaje: {
          texto:
            '¿Todavía tienes disponible el monitor?',

          fecha:
            '2026-09-25T18:20:00',

          enviadoPorMi:
            false
        },

        mensajesNoLeidos:
          1
      }
    ];

  const chatServiceMock = {
    getChats:
      vi.fn(),

    sendMessage:
      vi.fn()
  };

  const activatedRouteMock = {
    snapshot: {
      queryParamMap:
        convertToParamMap({})
    }
  };

  beforeEach(async () => {
    chatServiceMock
      .getChats
      .mockReset();

    chatServiceMock
      .sendMessage
      .mockReset();

    chatServiceMock
      .getChats
      .mockReturnValue(
        of({
          totalRecords: 2,
          page: 1,
          pageSize: 10,
          items: chats
        })
      );

    activatedRouteMock.snapshot
      .queryParamMap =
        convertToParamMap({});

    await TestBed
      .configureTestingModule({
        imports: [
          Messenger
        ],

        providers: [
          provideRouter([]),

          {
            provide:
              ActivatedRoute,

            useValue:
              activatedRouteMock
          },

          {
            provide:
              ChatService,

            useValue:
              chatServiceMock
          }
        ]
      })
      .compileComponents();

    fixture =
      TestBed.createComponent(
        Messenger
      );

    component =
      fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(
      component
    ).toBeTruthy();
  });

  it('should load chats on initialization', () => {
    expect(
      chatServiceMock
        .getChats
    ).toHaveBeenCalled();

    expect(
      component.chats()
    ).toEqual(chats);
  });

  it('should select the first chat automatically', () => {
    expect(
      component.selectedChatId()
    ).toBe(
      'CHAT-001'
    );
  });

  it('should select the conversation requested by publication', () => {
    activatedRouteMock.snapshot
      .queryParamMap =
        convertToParamMap({
          publicacion:
            'PUB-2024-0742',
          vendedor:
            'USR-003'
        });

    component.loadChats();

    expect(
      component.selectedChatId()
    ).toBe(
      'CHAT-002'
    );

    expect(
      component.mobileConversationOpen()
    ).toBe(true);
  });

  it('should preserve unread counts when selecting a chat', () => {
    expect(
        component.chats()[0]
        .mensajesNoLeidos
    ).toBe(2);

    component.selectChat(
        'CHAT-002'
    );

    expect(
        component.chats()[1]
        .mensajesNoLeidos
    ).toBe(1);
  });

  it('should select another chat', () => {
    component.selectChat(
        'CHAT-002'
    );

    expect(
        component.selectedChatId()
    ).toBe(
        'CHAT-002'
    );
  });

  it('should filter chats by participant name', () => {
    component.searchTerm.set(
      'Valeria'
    );

    expect(
      component.filteredChats()
        .length
    ).toBe(1);

    expect(
      component.filteredChats()[0]
        .id
    ).toBe(
      'CHAT-002'
    );
  });

  it('should filter chats by publication title', () => {
    component.searchTerm.set(
      'Calculadora'
    );

    expect(
      component.filteredChats()
        .length
    ).toBe(1);

    expect(
      component.filteredChats()[0]
        .id
    ).toBe(
      'CHAT-001'
    );
  });

  it('should enable unread filter', () => {
    component.showUnreadChats();

    expect(
      component.unreadOnly()
    ).toBe(true);
  });

  it('should disable unread filter', () => {
    component.showUnreadChats();
    component.showAllChats();

    expect(
      component.unreadOnly()
    ).toBe(false);
  });

  it('should not send an empty message', () => {
    component.messageForm
      .controls
      .texto
      .setValue('   ');

    component.sendMessage();

    expect(
      chatServiceMock
        .sendMessage
    ).not.toHaveBeenCalled();
  });

  it('should send a valid message', () => {
    chatServiceMock
      .sendMessage
      .mockReturnValue(
        of(undefined)
      );

    component.messageForm
      .controls
      .texto
      .setValue(
        'Hola David'
      );

    component.sendMessage();

    expect(
      chatServiceMock
        .sendMessage
    ).toHaveBeenCalledWith(
      'CHAT-001',
      {
        texto:
          'Hola David'
      }
    );

    expect(
      component
        .selectedSessionMessages()
        .length
    ).toBe(1);

    expect(
      component
        .selectedSessionMessages()[0]
        .texto
    ).toBe(
      'Hola David'
    );
  });

  it('should clear the form after sending', () => {
    chatServiceMock
      .sendMessage
      .mockReturnValue(
        of(undefined)
      );

    component.messageForm
      .controls
      .texto
      .setValue(
        'Hola David'
      );

    component.sendMessage();

    expect(
      component.messageForm
        .controls
        .texto.value
    ).toBe('');
  });

  it('should show an error when sending fails', () => {
    chatServiceMock
      .sendMessage
      .mockReturnValue(
        throwError(
          () =>
            new Error(
              'API error'
            )
        )
      );

    component.messageForm
      .controls
      .texto
      .setValue(
        'Hola David'
      );

    component.sendMessage();

    expect(
      component.sendError()
    ).toBe(true);

    expect(
      component.sending()
    ).toBe(false);
  });

  it('should show an error when chats cannot be loaded', () => {
    chatServiceMock
      .getChats
      .mockReturnValue(
        throwError(
          () =>
            new Error(
              'API error'
            )
        )
      );

    component.loadChats();

    expect(
      component.error()
    ).toBe(true);

    expect(
      component.loading()
    ).toBe(false);

    expect(
      component.chats()
    ).toEqual([]);
  });
});
