import { AuthApiError, AuthRequiredError } from '../../../core/auth/v2/auth-contract';

/** Mensaje de inicio de sesión con contraseña. Uniforme: no distingue cuenta inexistente de contraseña errónea. */
export function describePasswordLoginFailure(error: unknown): string {
  if (error instanceof AuthRequiredError) return 'El inicio de sesión se canceló. Inténtalo nuevamente.';
  if (!(error instanceof AuthApiError)) return 'No fue posible iniciar sesión. Inténtalo nuevamente.';

  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'Correo o contraseña incorrectos.';
    case 'RATE_LIMITED':
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    case 'ORIGIN_DENIED':
      return 'El servidor de acceso rechazó la solicitud desde este sitio.';
  }

  switch (error.status) {
    case 0:
      return 'No se pudo conectar con el servidor de acceso. Revisa tu conexión e inténtalo nuevamente.';
    case 404:
    case 503:
      return 'El acceso con contraseña no está disponible en este momento. Inténtalo más tarde o usa Google.';
    case 429:
      return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
    default:
      return 'No fue posible iniciar sesión. Inténtalo nuevamente.';
  }
}

/** Mensaje al pedir el enlace de recuperación. */
export function describeRecoveryRequestFailure(error: unknown): string {
  if (error instanceof AuthApiError) {
    if (error.code === 'INSTITUTIONAL_EMAIL_REQUIRED') {
      return 'Debes utilizar un correo institucional del TEC (@estudiantec.cr, @itcr.ac.cr o @tec.ac.cr).';
    }
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor de acceso. Revisa tu conexión e inténtalo nuevamente.';
    }
    if (error.status === 429) return 'Demasiados intentos. Espera un momento e inténtalo nuevamente.';
    if (error.status === 404 || error.status === 503) {
      return 'No se pudo enviar el enlace en este momento. Inténtalo nuevamente en unos minutos.';
    }
  }

  return 'No fue posible solicitar el enlace de recuperación.';
}

/** Mensaje al configurar la primera contraseña. */
export function describePasswordSetupFailure(error: unknown): string {
  if (error instanceof AuthApiError) {
    switch (error.code) {
      case 'WEAK_PASSWORD':
        return 'La contraseña es demasiado débil: usa entre 10 y 128 caracteres y no incluyas tu correo ni valores comunes.';
      case 'PASSWORD_ALREADY_SET':
        return 'Esta cuenta ya tiene una contraseña.';
      case 'PASSWORD_SETUP_NOT_AUTHORIZED':
        return 'El permiso para crear la contraseña venció. Verifica tu correo de nuevo para continuar.';
    }
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor de acceso. Revisa tu conexión e inténtalo nuevamente.';
    }
    if (error.status === 404 || error.status === 503) {
      return 'No se pudo guardar la contraseña en este momento. Inténtalo nuevamente en unos minutos.';
    }
  }

  return 'No fue posible guardar la contraseña.';
}
