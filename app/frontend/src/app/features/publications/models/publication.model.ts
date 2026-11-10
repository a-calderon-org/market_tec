export interface Seller {
  /** null para vendedores del ms-catalog propio: ms-users no asigna IDs numéricos. */
  id: number | null;
  userId?: string;
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
