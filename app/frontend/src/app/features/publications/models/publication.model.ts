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
