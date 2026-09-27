export interface UserPublication {
  id: string;
  titulo: string;
  categoria: string;
  subcategoria: string;
  precio: number;
  condicion: string | null;
  estado: string;
  ubicacion: string;
  imagen: string;
  fechaPublicacion: string;
}