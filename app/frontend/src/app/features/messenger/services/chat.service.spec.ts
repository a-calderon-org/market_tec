import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClientService } from '../../../core/api/api-client.service';
import { Chat, SendMessage } from '../models/chat.model';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service:
    ChatService;

  const apiClientMock = {
    get:
      vi.fn(),

    post:
      vi.fn()
  };

  beforeEach(() => {
    apiClientMock
      .get
      .mockReset();

    apiClientMock
      .post
      .mockReset();

    TestBed.configureTestingModule({
      providers: [
        ChatService,
        {
          provide:
            ApiClientService,

          useValue:
            apiClientMock
        }
      ]
    });

    service =
      TestBed.inject(
        ChatService
      );
  });

  it('should create the service', () => {
    expect(
      service
    ).toBeTruthy();
  });

  it('should get chats', async () => {
    const chat:
      Chat = {
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
      };

    apiClientMock
      .get
      .mockReturnValue(
        of({
          totalRecords: 1,
          page: 1,
          pageSize: 10,
          items: [chat]
        })
      );

    const result =
      await firstValueFrom(
        service.getChats()
      );

    expect(
      apiClientMock.get
    ).toHaveBeenCalledWith(
      '/chats'
    );

    expect(
      result.items
    ).toEqual(
      [chat]
    );
  });

  it('should send a message', async () => {
    const message:
      SendMessage = {
        texto:
          'Hola, ¿sigue disponible?'
      };

    apiClientMock
      .post
      .mockReturnValue(
        of(undefined)
      );

    await firstValueFrom(
      service.sendMessage(
        'CHAT-001',
        message
      )
    );

    expect(
      apiClientMock.post
    ).toHaveBeenCalledWith(
      '/chats/CHAT-001/mensajes',
      message
    );
  });
});