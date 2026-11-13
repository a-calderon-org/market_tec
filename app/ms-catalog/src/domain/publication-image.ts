import { invalid } from './publication.js';

export const imageFormats = {
  'image/jpeg': { extension: 'jpg', format: 'jpeg' },
  'image/png': { extension: 'png', format: 'png' },
  'image/webp': { extension: 'webp', format: 'webp' },
} as const;

export type ImageContentType = keyof typeof imageFormats;

export const maxImageBytes = 10 * 1024 * 1024;
export const maxImagePixels = 16_000_000;
export const maxPublicationImages = 5;

export function isImageContentType(value: unknown): value is ImageContentType {
  return typeof value === 'string' && Object.hasOwn(imageFormats, value);
}

export function parseImageUpload(body: unknown): ImageContentType {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, 'filename') || !Object.hasOwn(body, 'contentType')) invalid('Invalid upload request');
  const { filename, contentType } = body as Record<string, unknown>;
  if (typeof filename !== 'string' || !filename.trim() || filename.length > 255 ||
      /[\\/\u0000-\u001f\u007f]/u.test(filename) || !isImageContentType(contentType)) {
    invalid('Invalid upload request');
  }
  return contentType;
}
