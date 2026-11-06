export interface ImageStoragePort {
  // Reject references not owned by this user or not ready for publication.
  // This operation must not perform destructive changes before repository commit.
  assertUsableBy(ownerId: string, imageUrls: readonly string[]): Promise<void>;
}
