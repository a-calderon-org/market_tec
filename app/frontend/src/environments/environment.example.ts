export const environment = {
  apiBaseUrl: '',
  googleClientId: '',
  // Opcional, solo con authCoreV2: proxy same-origin de publicaciones (p. ej. https://<swa>/api/catalog/v1).
  // catalogApiBaseUrl: '',
  // Opcional, solo builds de staging (preview d04): activa Auth Core V2 contra ms-users.
  // featureFlags: { authCoreV2: true, authCoreV2Adapter: 'http', authCoreV2HttpTopologyVerified: true },
  // Opcional: publicaciones del ms-catalog propio con el JWT interno (Google o Magic Link). Requiere
  // catalogApiBaseUrl: 'https://<swa>/api/catalog-v2/v1' y añadir catalogInternalJwt: true a featureFlags.
};
