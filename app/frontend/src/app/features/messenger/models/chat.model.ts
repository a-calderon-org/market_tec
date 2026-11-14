export interface ChatLastMessage {
  texto: string;
  fecha: string;
  enviadoPorMi: boolean;
}

export interface ChatParticipant {
  id: string;
  nombre: string;
  fotoPerfil: string;
  verificado: boolean;
}

export interface ChatPublication {
  id: string;
  titulo: string;
  imagen: string;
  precio: number | null;
}

export interface Chat {
  id: string;
  participante: ChatParticipant;
  publicacion: ChatPublication;
  ultimoMensaje: ChatLastMessage | null;
  mensajesNoLeidos: number | null;
}

export interface SendMessage {
  texto: string;
}

export interface SessionMessage {
  id: string;
  texto: string;
  fecha: string;
  enviadoPorMi: boolean;
}
