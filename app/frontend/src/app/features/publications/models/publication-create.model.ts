export interface CreatePublication {
  categoria: string;
  subcategoria: string;
  titulo: string;
  descripcion: string;
  precio: number;
  condicion: string | null;
  ubicacion: string;
}
