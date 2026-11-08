export function isAuthorizedApiUrl(requestUrl: string, configuredBaseUrl: unknown): boolean {
  if (typeof configuredBaseUrl !== 'string' || !configuredBaseUrl.trim()) {
    return false;
  }

  try {
    const documentBase = document.baseURI;
    const apiUrl = new URL(configuredBaseUrl, documentBase);
    const destination = new URL(requestUrl, documentBase);

    if (
      !['http:', 'https:'].includes(apiUrl.protocol) ||
      !['http:', 'https:'].includes(destination.protocol) ||
      apiUrl.username ||
      apiUrl.password ||
      apiUrl.search ||
      apiUrl.hash ||
      destination.username ||
      destination.password ||
      destination.origin !== apiUrl.origin
    ) {
      return false;
    }

    const allowedPath = normalizePath(apiUrl.pathname);
    const destinationPath = normalizePath(destination.pathname);

    return (
      allowedPath === '/' ||
      destinationPath === allowedPath ||
      destinationPath.startsWith(`${allowedPath}/`)
    );
  } catch {
    return false;
  }
}

/** Ruta relativa a la base de la API, o null si la URL no pertenece a ella. */
export function apiRelativePath(requestUrl: string, configuredBaseUrl: unknown): string | null {
  if (!isAuthorizedApiUrl(requestUrl, configuredBaseUrl)) {
    return null;
  }

  const documentBase = document.baseURI;
  const basePath = normalizePath(new URL(configuredBaseUrl as string, documentBase).pathname);
  const destinationPath = normalizePath(new URL(requestUrl, documentBase).pathname);
  const relative = basePath === '/' ? destinationPath : destinationPath.slice(basePath.length);

  return relative || '/';
}

/**
 * Ruta de la petición dentro de la API SIN el prefijo de versión `/v1`, o null si
 * la URL no pertenece a ella. Es indiferente a que la base configurada sea la raíz
 * (`https://host`), incluya el prefijo (`https://host/v1`) o cuelgue de otro
 * (`https://host/api`): `GET /v1/auth/session` produce siempre `/auth/session`.
 */
export function apiVersionlessPath(requestUrl: string, configuredBaseUrl: unknown): string | null {
  const relative = apiRelativePath(requestUrl, configuredBaseUrl);

  if (relative === null) {
    return null;
  }

  const basePath = normalizePath(new URL(configuredBaseUrl as string, document.baseURI).pathname);

  // Si la base ya termina en /v1, ese segmento es de la base y no de la petición.
  if (/\/v1$/.test(basePath)) {
    return relative;
  }

  return relative.replace(/^\/v1(?=\/|$)/, '') || '/';
}

function normalizePath(pathname: string): string {
  const withoutTrailingSlashes = pathname.replace(/\/+$/, '');

  return withoutTrailingSlashes || '/';
}
