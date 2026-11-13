import { createHash, randomUUID } from 'node:crypto';
import { BlobSASPermissions, SASProtocol,
  type BlobGetPropertiesResponse, type BlobSASSignatureValues, type ContainerClient } from '@azure/storage-blob';
import sharp from 'sharp';
import type { ImageUploadStorage } from '../../application/ports/out/image-storage-port.js';
import { imageFormats, isImageContentType, maxImageBytes, maxImagePixels, maxPublicationImages,
  type ImageContentType } from '../../domain/publication-image.js';
import { invalid } from '../../domain/publication.js';

const uploadLifetimeSeconds = 5 * 60;
const storageTimeoutMs = 20_000;
const maxConcurrentDecodes = 4;
const imageName = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

type SignUpload = (options: BlobSASSignatureValues) => string | Promise<string>;

function storageErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const details = 'details' in error ? error.details : undefined;
  if (details && typeof details === 'object' && 'errorCode' in details && typeof details.errorCode === 'string') {
    return details.errorCode;
  }
  return 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

function ownerPath(ownerId: string): string {
  return createHash('sha256').update(ownerId, 'utf16le').digest('hex') + '/';
}

function imageProperties(properties: BlobGetPropertiesResponse, name: string): ImageContentType {
  const { blobType, contentType, contentLength, contentEncoding } = properties;
  if (blobType !== 'BlockBlob' || contentEncoding || !isImageContentType(contentType) ||
      !name.endsWith('.' + imageFormats[contentType].extension) || !contentLength || contentLength < 0 ||
      contentLength > maxImageBytes) invalid('Invalid image blob');
  return contentType;
}

function hasImageSignature(data: Buffer, contentType: ImageContentType): boolean {
  switch (contentType) {
    case 'image/jpeg': return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    case 'image/png': return data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    case 'image/webp': return data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  }
}

export class AzureBlobImageStorage implements ImageUploadStorage {
  private activeDecodes = 0;

  constructor(private readonly staging: ContainerClient, private readonly published: ContainerClient,
    private readonly sign: SignUpload, private readonly protocol = SASProtocol.Https) {}

  async issueUpload(ownerId: string, contentType: ImageContentType) {
    const name = ownerPath(ownerId) + randomUUID() + '.' + imageFormats[contentType].extension;
    const expiresAt = Math.floor(Date.now() / 1000) + uploadLifetimeSeconds;
    const sas = await this.sign({
      containerName: this.staging.containerName,
      blobName: name,
      permissions: BlobSASPermissions.parse('c'),
      protocol: this.protocol,
      expiresOn: new Date(expiresAt * 1000),
    });
    return {
      uploadUrl: this.staging.getBlockBlobClient(name).url + '?' + sas,
      publicUrl: this.published.getBlockBlobClient(name).url,
      expiresAt,
    };
  }

  async assertUsableBy(ownerId: string, urls: readonly string[]): Promise<void> {
    if (urls.length > maxPublicationImages || new Set(urls).size !== urls.length) invalid('Invalid image list');
    const prefix = ownerPath(ownerId);
    const base = this.published.url + '/' + prefix;
    // Validate every reference locally before contacting storage. Client URLs are never fetched.
    const names = urls.map(url => {
      if (!url.startsWith(base) || !imageName.test(url.slice(base.length))) invalid('Invalid image reference');
      return prefix + url.slice(base.length);
    });
    for (const name of names) await this.publish(name);
  }

  private async publish(name: string): Promise<void> {
    const target = this.published.getBlockBlobClient(name);
    const abortSignal = AbortSignal.timeout(storageTimeoutMs);
    try {
      imageProperties(await target.getProperties({ abortSignal }), name);
      return;
    } catch (error) {
      if (storageErrorCode(error) !== 'BlobNotFound') throw error;
    }
    if (this.activeDecodes >= maxConcurrentDecodes) throw new Error('Image processing capacity reached');
    this.activeDecodes++;
    try {
      const source = this.staging.getBlockBlobClient(name);
      const properties = await source.getProperties({ abortSignal });
      const contentType = imageProperties(properties, name);
      if (!properties.etag) throw new Error('Missing image version');
      const bytes = await source.downloadToBuffer(0, properties.contentLength!, {
        conditions: { ifMatch: properties.etag }, abortSignal, maxRetryRequestsPerBlock: 1,
      });
      const image = await this.normalize(bytes, contentType);
      try {
        await target.upload(image, image.length, {
          conditions: { ifNoneMatch: '*' }, abortSignal,
          blobHTTPHeaders: { blobContentType: contentType, blobCacheControl: 'public, max-age=31536000, immutable' },
        });
      } catch (error) {
        // Another request may have promoted the same image before this conditional write.
        const code = storageErrorCode(error);
        if (code !== 'BlobAlreadyExists' && code !== 'ConditionNotMet') throw error;
        imageProperties(await target.getProperties({ abortSignal }), name);
      }
    } catch (error) {
      const code = storageErrorCode(error);
      if (code === 'BlobNotFound' || code === 'ConditionNotMet') invalid('Image upload is unavailable');
      throw error;
    } finally {
      this.activeDecodes--;
    }
  }

  private async normalize(bytes: Buffer, contentType: ImageContentType): Promise<Buffer> {
    if (!hasImageSignature(bytes, contentType)) invalid('Image bytes do not match the declared type');
    const format = imageFormats[contentType].format;
    let normalized: Buffer;
    try {
      const image = sharp(bytes, { limitInputPixels: maxImagePixels, failOn: 'warning' });
      // Decode and re-encode pixels to discard metadata and any data appended to the upload.
      normalized = await image.autoOrient().toFormat(format).timeout({ seconds: 5 }).toBuffer();
    } catch {
      invalid('Invalid or unsupported image bytes');
    }
    if (normalized.length > maxImageBytes) invalid('Normalized image exceeds the size limit');
    return normalized;
  }
}
