import { User } from './models/user.model';

/**
 * Nombres provisionales que ms-users asigna al crear la cuenta cuando no los conoce: `Google` (Google sin
 * `given_name`) y `Usuario` (Magic Link). Nunca se precargan como si fueran el nombre real.
 */
const PLACEHOLDER_NAMES = new Set(['Google', 'Usuario']);

/**
 * El registro pide solo los datos que faltan: una cuenta sin apellidos (Magic Link, o Google sin `family_name`)
 * o con el nombre provisional debe completarlos. El nombre de usuario nunca se pide: lo genera ms-users.
 */
export function needsNames(user: Pick<User, 'nombre' | 'apellidos'>): boolean {
  return user.apellidos.trim() === '' || PLACEHOLDER_NAMES.has(user.nombre.trim());
}

/** Valor inicial del campo nombre: el real si existe (p. ej. de Google), vacío si es provisional. */
export function prefillNombre(user: Pick<User, 'nombre'>): string {
  const nombre = user.nombre.trim();

  return PLACEHOLDER_NAMES.has(nombre) ? '' : nombre;
}

export const NOMBRE_MAX = 100;
export const APELLIDOS_MAX = 160;
