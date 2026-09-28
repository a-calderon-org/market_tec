export interface User {
  id: string;
  nombreUsuario: string;
  nombre: string;
  apellidos: string;
  correo: string;
  fotoPerfil: string;
  fechaRegistro: string;
  verificado: boolean;
  estado: string;
}

export interface UpdateUser {
  nombreUsuario: string;
  nombre: string;
  apellidos: string;
}

export interface UpdateUserResponse extends User {
  fechaActualizacion: string;
  message: string;
}