import { createId } from "./ids.js";

export interface StoredImage {
  image_id: string;
  media_type: string;
  bytes: Uint8Array;
  created_at: string;
}

/**
 * Ephemeral image store. Images must be deleted on success, failure, or abort
 * and must never be serialized into logs or analysis payloads.
 */
export class EphemeralImageStore {
  private readonly images = new Map<string, StoredImage>();

  put(mediaType: string, bytes: Uint8Array): StoredImage {
    const image: StoredImage = {
      image_id: createId("img"),
      media_type: mediaType,
      bytes,
      created_at: new Date().toISOString(),
    };
    this.images.set(image.image_id, image);
    return image;
  }

  get(imageId: string): StoredImage | null {
    return this.images.get(imageId) ?? null;
  }

  delete(imageId: string): boolean {
    return this.images.delete(imageId);
  }

  has(imageId: string): boolean {
    return this.images.has(imageId);
  }

  size(): number {
    return this.images.size;
  }
}
