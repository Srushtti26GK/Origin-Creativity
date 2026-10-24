import { createHash } from 'node:crypto';
import cloudinary from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import { env } from '../config/env.js';

export interface UploadedImage {
  uploadId: string;
  url: string;
}

export interface ImageStorage {
  readonly configured: boolean;
  upload(userId: string, uploadId: string, buffer: Buffer): Promise<UploadedImage>;
  verifyOwned(userId: string, uploadId: string, url: string): Promise<boolean>;
  deleteAsset(publicId: string): Promise<void>;
}

const { cloudName, apiKey, apiSecret } = env.cloudinary;
const configured = Boolean(cloudName && apiKey && apiSecret);

if (configured) {
  cloudinary.v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
}

export function cloudinaryPublicIdFor(userId: string, uploadId: string) {
  const scopedId = createHash('sha256').update(`${userId}:${uploadId}`).digest('hex');
  return `origin-creativity/${userId}/${scopedId}`;
}

function uploadToCloudinary(publicId: string, userId: string, uploadId: string, buffer: Buffer) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.v2.uploader.upload_stream({
      resource_type: 'image',
      public_id: publicId,
      overwrite: false,
      context: { owner_id: userId, upload_id: uploadId },
      tags: ['origin-creativity'],
      unique_filename: false,
      use_filename: false,
    }, (error, result) => {
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error('Cloudinary returned no upload result.'));
    });
    stream.end(buffer);
  });
}

async function getExistingOwnedImage(publicId: string, userId: string, uploadId: string) {
  const resource = await cloudinary.v2.api.resource(publicId, {
    resource_type: 'image',
    context: true,
  });
  const custom = resource.context?.custom;
  if (custom?.owner_id !== userId || custom?.upload_id !== uploadId) return null;
  const url = resource.secure_url;
  return typeof url === 'string' && url.startsWith('https://') ? { uploadId, url } : null;
}

async function deleteCloudinaryImage(publicId: string) {
  const result = await cloudinary.v2.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
  });
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(`Cloudinary image deletion returned ${result.result}.`);
  }
}

export const cloudinaryImageStorage: ImageStorage = {
  configured,
  async upload(userId, uploadId, buffer) {
    if (!configured) throw new Error('Cloudinary is not configured.');
    const publicId = cloudinaryPublicIdFor(userId, uploadId);
    try {
      const result = await uploadToCloudinary(publicId, userId, uploadId, buffer);
      if (!result.secure_url.startsWith('https://')) throw new Error('Cloudinary did not return a secure URL.');
      return { uploadId, url: result.secure_url };
    } catch (error) {
      try {
        const existing = await getExistingOwnedImage(publicId, userId, uploadId);
        if (existing) return existing;
      } catch {
        // The upload may not exist yet; surface a safe route-level error.
      }
      throw error;
    }
  },
  async verifyOwned(userId, uploadId, url) {
    if (!configured || !/^[0-9a-f-]{36}$/i.test(uploadId)) return false;
    try {
      const existing = await getExistingOwnedImage(cloudinaryPublicIdFor(userId, uploadId), userId, uploadId);
      return existing?.url === url;
    } catch {
      return false;
    }
  },
  async deleteAsset(publicId) {
    if (!configured) throw new Error('Cloudinary is not configured.');
    await deleteCloudinaryImage(publicId);
  },
};
