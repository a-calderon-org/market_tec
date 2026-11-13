import { invalid } from '../../domain/publication.js';
import type { ImageStoragePort } from '../../application/ports/out/image-storage-port.js';

// Catalog deployments with image storage disabled can still accept publications without images.
export class NoImageStorage implements ImageStoragePort {
  async assertUsableBy(_ownerId: string, imageUrls: readonly string[]): Promise<void> {
    if (imageUrls.length) invalid('Image upload is not available');
  }
}
