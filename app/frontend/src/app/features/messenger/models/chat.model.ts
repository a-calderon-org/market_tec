export interface Seller {
  id: number;
  nombre: string;
  carrera: string;
  verificado: boolean;
}

export interface Publication {
  id: string;
  categoria: string;
  subcategoria: string;
  titulo: string;
  descripcion: string;
  precio: number;
  condicion: string | null;
  ubicacion: string;
  imagen: string;
  fechaPublicacion: string;
  estado: string;
  vendedor: Seller;
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
  precio: number;
}

export interface LastMessage {
  texto: string;
  fecha: string;
  enviadoPorMi: boolean;
}

export interface Chat {
  id: string;
  participante: ChatParticipant;
  publicacion: ChatPublication;
  ultimoMensaje: LastMessage;
  mensajesNoLeidos: number;
}