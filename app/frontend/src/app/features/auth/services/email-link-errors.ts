import { AuthApiError, AuthRequiredError } from '../../../core/auth/v2/auth-contract';
import { EMAIL_LINK_OTHER_BROWSER } from '../../../core/auth/v2/auth-session.service';

/** Mensaje para la UI del Magic Link a partir del status y el `error.code` de ms-users. */
export function describeEmailLinkFailure(error: unknown, purpose: 'access' | 'recovery' = 'access'): string {
  if (error instanceof AuthRequiredError) {
    return 'El inicio de sesión se canceló. Solicita un nuevo enlace.';
  }

  if (!(error instanceof AuthApiError)) {
    return 'No fue posible completar el acceso con tu correo institucional.';
  }

  if (error.code === EMAIL_LINK_OTHER_BROWSER || error.code === 'CSRF_INVALID') {
    return 'Este enlace debe abrirse en el mismo navegador donde lo solicitaste. Solicita un enlace nuevo desde este navegador.';
  }

  switch (error.code) {
    case 'INSTITUTIONAL_EMAIL_REQUIRED':
      return 'Debes utilizar un correo institucional del TEC (@estudiantec.cr, @itcr.ac.cr o @tec.ac.cr).';
    case 'ATTEMPT_CONSUMED':
      return 'Este enlace ya se utilizó. Solicita uno nuevo para ingresar.';
    case 'ATTEMPT_EXPIRED':
      return 'Este enlace expiró. Solicita uno nuevo para ingresar.';
    case 'CONTINUITY_REQUIRED':
      if (purpose === 'recovery') {
        return 'Por seguridad, un enlace al correo no puede reemplazar la contraseña de una cuenta que ya tiene una ni '
          + 'entregar su historial. Ingresa con tu contraseña actual o verifica tu correo desde «Crear cuenta» para entrar sin ella.';
      }
      return 'Este correo ya pertenece a una cuenta creada con Google. Ingresa con el botón de Google.';
    case 'AUTH_PROOF_INVALID':
      return 'El enlace no es válido. Solicita uno nuevo para ingresar.';
  }

  switch (error.status) {
    case 0:
      return 'No se pudo conectar con el servidor de acceso. Revisa tu conexión e inténtalo nuevamente.';
    case 404:
    case 503:
      return 'No se pudo enviar el enlace en este momento. Inténtalo nuevamente en unos minutos.';
    case 403:
      return 'El servidor de acceso rechazó la solicitud desde este sitio.';
    case 429:
      return 'Demasiados intentos. Espera un momento e inténtalo nuevamente.';
    default:
      return 'No fue posible completar el acceso con tu correo institucional.';
  }
}
