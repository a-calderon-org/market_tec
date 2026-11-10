export interface PublicationSpecifications {
  procesador: string;
  memoriaRam: string;
  almacenamiento: string;
  bateria: string;
  garantia: string;
}

export interface PublicationDetailSeller {
  /** null para vendedores del ms-catalog propio: ms-users no asigna IDs numéricos. */
  id: number | null;
  userId?: string;
  nombre: string;
  carrera: string;
  verificado: boolean;
  calificacion?: number;
  ventasRealizadas?: number;
  tiempoRespuesta?: string;
}

export interface PublicationDetail {
  id: string;
  categoria: string;
  subcategoria: string;
  titulo: string;
  descripcion: string;
  precio: number;
  precioAnterior?: number;
  condicion: string | null;
  estado: string;
  ubicacion: string;
  puntoEntrega?: string;
  fechaPublicacion: string;
  imagenes?: string[];
  imagen?: string;
  especificaciones?: PublicationSpecifications;
  incluye?: string[];
  vendedor: PublicationDetailSeller;
}
