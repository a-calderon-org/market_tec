import { UpdateUserResponse, User } from './user.model';

/**
 * DTO de `GET /v1/me/profile` tal como lo emite Java
 * (`UserProfileController.UserProfileV1`, ms-users `main@08ccf05`).
 * `createdAt` (epoch) no existe en el modelo de presentación y se descarta.
 */
export interface UserProfileV1 {
  readonly id: string;
  readonly nombreUsuario: string;
  readonly nombre: string;
  readonly apellidos: string;
  readonly correo: string;
  readonly fotoPerfil: string;
  readonly fechaRegistro: string;
  readonly createdAt: number;
  readonly verificado: boolean;
  readonly estado: string;
}

/** DTO de `PUT /v1/me/profile` (`UpdateUserResponseV1`). */
export interface UpdateUserResponseV1 extends Omit<UserProfileV1, 'createdAt'> {
  readonly fechaActualizacion: string;
  readonly message: string;
}

/** La respuesta no tiene la forma esperada o pertenece a otro usuario. */
export class ProfileResponseError extends Error {
  constructor() {
    super('Respuesta de perfil no válida.');
    this.name = 'ProfileResponseError';
  }
}

type Json = Record<string, unknown>;

const TEXT_FIELDS = [
  'id',
  'nombreUsuario',
  'nombre',
  'apellidos',
  'correo',
  'fotoPerfil',
  'fechaRegistro',
  'estado',
] as const;

function baseUser(body: unknown, expectedUserId: string): User | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;

  const json = body as Json;

  if (!TEXT_FIELDS.every((key) => typeof json[key] === 'string')) return null;
  if (typeof json['verificado'] !== 'boolean') return null;
  // El servidor deriva el usuario del JWT; uno distinto al de la sesión no se muestra.
  if (json['id'] !== expectedUserId) return null;

  return {
    id: json['id'] as string,
    nombreUsuario: json['nombreUsuario'] as string,
    nombre: json['nombre'] as string,
    apellidos: json['apellidos'] as string,
    correo: json['correo'] as string,
    fotoPerfil: json['fotoPerfil'] as string,
    fechaRegistro: json['fechaRegistro'] as string,
    verificado: json['verificado'] as boolean,
    estado: json['estado'] as string,
  };
}

/** `UserProfileV1` → `User`. Lanza `ProfileResponseError` si no corresponde. */
export function toUser(body: unknown, expectedUserId: string): User {
  const user = baseUser(body, expectedUserId);

  if (!user) throw new ProfileResponseError();

  return user;
}

/** `UpdateUserResponseV1` → `UpdateUserResponse`. */
export function toUpdateUserResponse(body: unknown, expectedUserId: string): UpdateUserResponse {
  const user = baseUser(body, expectedUserId);
  const json = body as Json;

  if (
    !user ||
    typeof json['fechaActualizacion'] !== 'string' ||
    typeof json['message'] !== 'string'
  ) {
    throw new ProfileResponseError();
  }

  return {
    ...user,
    fechaActualizacion: json['fechaActualizacion'],
    message: json['message'],
  };
}
