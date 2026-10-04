import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config/env.js';
import fs from 'fs';
import path from 'path';

class R2StorageService {
  constructor() {
    this.s3Client = null;
    this.initClient();
  }

  initClient() {
    const { accountId, accessKeyId, secretAccessKey, endpoint } = config.r2;

    const r2Endpoint = endpoint || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    if (accessKeyId && secretAccessKey && r2Endpoint) {
      try {
        this.s3Client = new S3Client({
          region: 'auto',
          endpoint: r2Endpoint,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
        console.log('☁️ [Cloudflare R2] S3 Client initialized successfully');
      } catch (err) {
        console.warn('⚠️ [Cloudflare R2] Failed to initialize S3 client:', err.message);
        this.s3Client = null;
      }
    } else {
      console.log('ℹ️ [Cloudflare R2] Credentials not fully set. Local fallback will be used until .env is updated.');
    }
  }

  isR2Ready() {
    return !!this.s3Client && !!config.r2.bucketName;
  }

  /**
   * Upload an image file buffer to Cloudflare R2 (or local fallback)
   */
  async uploadPhoto({ buffer, originalname, mimetype, size, orderId }) {
    const timestamp = Date.now();
    const cleanName = (originalname || 'photo.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `orders/${orderId}/${timestamp}_${cleanName}`;
    const photoId = `photo_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;

    if (this.isR2Ready()) {
      try {
        const command = new PutObjectCommand({
          Bucket: config.r2.bucketName,
          Key: key,
          Body: buffer,
          ContentType: mimetype || 'image/jpeg',
        });

        await this.s3Client.send(command);

        // Determine public or streaming URL
        let url;
        if (config.r2.publicUrl) {
          const baseUrl = config.r2.publicUrl.replace(/\/+$/, '');
          url = `${baseUrl}/${key}`;
        } else {
          // Reliable streaming fallback through backend API so it works even if bucket is private
          url = `/api/v1/orders/photos/stream?key=${encodeURIComponent(key)}`;
        }

        return {
          id: photoId,
          key,
          url,
          storage: 'r2',
          originalName: originalname,
          mimeType: mimetype,
          size,
          createdAt: new Date().toISOString(),
        };
      } catch (r2Error) {
        console.warn('⚠️ [Cloudflare R2] Upload failed, falling back to local storage:', r2Error.message);
      }
    }

    // Local Disk Fallback
    const uploadDir = path.join(process.cwd(), 'uploads', 'orders', String(orderId));
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const localFileName = `${timestamp}_${cleanName}`;
    const filePath = path.join(uploadDir, localFileName);
    fs.writeFileSync(filePath, buffer);

    return {
      id: photoId,
      key: `local:orders/${orderId}/${localFileName}`,
      url: `/uploads/orders/${orderId}/${localFileName}`,
      storage: 'local',
      originalName: originalname,
      mimeType: mimetype,
      size,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Delete a photo from R2 or local storage
   */
  async deletePhoto(key) {
    if (!key) return;

    if (key.startsWith('local:')) {
      const relativePath = key.replace('local:', '');
      const fullPath = path.join(process.cwd(), 'uploads', relativePath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (e) {
          console.warn('Local file delete warning:', e.message);
        }
      }
      return;
    }

    if (this.isR2Ready()) {
      try {
        const command = new DeleteObjectCommand({
          Bucket: config.r2.bucketName,
          Key: key,
        });
        await this.s3Client.send(command);
        console.log(`🗑️ [Cloudflare R2] Deleted object key: ${key}`);
      } catch (err) {
        console.warn('⚠️ [Cloudflare R2] Delete failed:', err.message);
      }
    }
  }

  /**
   * Stream a private object from R2 directly to response
   */
  async getObjectStream(key) {
    if (!this.isR2Ready()) {
      throw new Error('Cloudflare R2 is not configured');
    }

    const command = new GetObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
    });

    const response = await this.s3Client.send(command);
    return {
      stream: response.Body,
      contentType: response.ContentType || 'image/jpeg',
      contentLength: response.ContentLength,
    };
  }
}

export const r2Service = new R2StorageService();
export default r2Service;
