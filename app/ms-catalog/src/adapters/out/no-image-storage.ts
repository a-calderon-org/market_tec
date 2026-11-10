import { invalid } from '../../domain/publication.js';
import type { ImageStoragePort } from '../../application/ports/out/image-storage-port.js';

// No Blob adapter exists yet (MTEC-14): only publications without images are accepted.
export class NoImageStorage implements ImageStoragePort {
  async assertUsableBy(_ownerId: string, imageUrls: readonly string[]): Promise<void> {
    if (imageUrls.length) invalid('Image upload is not available');
  }
}
