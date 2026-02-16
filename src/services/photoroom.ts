import { info, warn, error as logError } from '../utils/logger.js';

/**
 * PhotoRoom API integration for automatic product image processing.
 *
 * Two endpoints are used:
 *   - Remove Background (Basic plan):  POST https://sdk.photoroom.com/v1/segment
 *   - Image Editing    (Plus plan):    POST https://image-api.photoroom.com/v2/edit
 *
 * Auth: x-api-key header with the API key.
 */

export interface ProcessImageOptions {
  /** Background color hex (without #), e.g. "FFFFFF". Default: "FFFFFF" (white). */
  background?: string;
  /** Add a realistic AI drop-shadow. Default: true. */
  shadow?: boolean;
  /** Padding ratio around the subject (0–1). Default: 0.1 (10%). */
  padding?: number;
}

export class PhotoRoomService {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('PhotoRoomService requires an API key');
    this.apiKey = apiKey;
  }

  // ── Remove background only (Basic plan) ──────────────────────────────

  async removeBackground(imageUrl: string): Promise<Buffer> {
    info(`[PhotoRoom] Removing background: ${imageUrl}`);

    const imageBuffer = await this.downloadImage(imageUrl);
    const formData = this.buildFormData(imageBuffer, 'image.jpg');
    formData.append('format', 'png');
    formData.append('channels', 'rgba');

    const response = await fetch('https://sdk.photoroom.com/v1/segment', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      logError(`[PhotoRoom] Remove background failed (${response.status}): ${text}`);
      throw new Error(`PhotoRoom remove background failed: ${response.status} — ${text}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    info(`[PhotoRoom] Background removed successfully (${arrayBuffer.byteLength} bytes)`);
    return Buffer.from(arrayBuffer);
  }

  // ── Full image processing (Plus plan) ────────────────────────────────

  async processProductImage(
    imageUrl: string,
    options?: ProcessImageOptions,
  ): Promise<Buffer> {
    const bg = options?.background ?? 'FFFFFF';
    const shadow = options?.shadow ?? true;
    const padding = options?.padding ?? 0.1;

    info(`[PhotoRoom] Processing image: ${imageUrl} (bg=${bg}, shadow=${shadow}, padding=${padding})`);

    const imageBuffer = await this.downloadImage(imageUrl);
    const formData = this.buildFormData(imageBuffer, 'image.jpg');

    // Image Editing API parameters
    formData.append('removeBackground', 'true');
    formData.append('background.color', bg);
    formData.append('padding', String(padding));

    if (shadow) {
      formData.append('shadow.mode', 'ai.soft');
    }

    // Output as PNG at a reasonable size
    formData.append('outputSize', '1200x1200');

    const response = await fetch('https://image-api.photoroom.com/v2/edit', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      logError(`[PhotoRoom] Image processing failed (${response.status}): ${text}`);
      throw new Error(`PhotoRoom image processing failed: ${response.status} — ${text}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    info(`[PhotoRoom] Image processed successfully (${arrayBuffer.byteLength} bytes)`);
    return Buffer.from(arrayBuffer);
  }

  // ── Process with custom parameters ────────────────────────────────────

  /**
   * Process an image with caller-specified PhotoRoom parameters.
   *
   * Returns a base64 data URL of the processed image.
   */
  async processWithParams(
    imageUrl: string,
    params: { background?: string; padding?: number; shadow?: boolean },
  ): Promise<{ buffer: Buffer; dataUrl: string }> {
    const options: ProcessImageOptions = {
      background: (params.background ?? '#FFFFFF').replace(/^#/, ''),
      padding: params.padding ?? 0.1,
      shadow: params.shadow ?? true,
    };

    const buffer = await this.processProductImage(imageUrl, options);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    return { buffer, dataUrl };
  }

  // ── Batch processing ─────────────────────────────────────────────────

  async processAllImages(
    imageUrls: string[],
    options?: ProcessImageOptions,
  ): Promise<Buffer[]> {
    info(`[PhotoRoom] Batch processing ${imageUrls.length} images`);
    const results: Buffer[] = [];

    for (const url of imageUrls) {
      try {
        const processed = await this.processProductImage(url, options);
        results.push(processed);
      } catch (err) {
        warn(`[PhotoRoom] Failed to process image ${url}: ${err}`);
        // Still attempt remaining images; push a fallback (download original)
        try {
          const fallback = await this.downloadImage(url);
          results.push(fallback);
        } catch {
          logError(`[PhotoRoom] Could not even download fallback for ${url}`);
        }
      }
    }

    info(`[PhotoRoom] Batch complete: ${results.length}/${imageUrls.length} images`);
    return results;
  }

  // ── Render with template ──────────────────────────────────────────────

  /**
   * Render an image using a PhotoRoom template.
   *
   * Endpoint: POST https://image-api.photoroom.com/v1/render
   * Accepts `templateId` + `imageUrl` (or imageFile) via multipart/form-data.
   * Returns the rendered image as a Buffer.
   */
  async renderWithTemplate(
    imageUrl: string,
    templateId?: string,
  ): Promise<Buffer> {
    const tplId =
      templateId ||
      process.env.PHOTOROOM_TEMPLATE_ID ||
      '014ca360-cb57-416e-8c17-365a647ca4ac';

    info(`[PhotoRoom] Rendering with template ${tplId}: ${imageUrl}`);

    const formData = new FormData();
    formData.append('templateId', tplId);
    formData.append('imageUrl', imageUrl);

    const response = await fetch('https://image-api.photoroom.com/v1/render', {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey },
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      logError(`[PhotoRoom] Template render failed (${response.status}): ${text}`);
      throw new Error(`PhotoRoom template render failed: ${response.status} — ${text}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    info(`[PhotoRoom] Template render successful (${arrayBuffer.byteLength} bytes)`);
    return Buffer.from(arrayBuffer);
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private async downloadImage(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to download image (${res.status}): ${url}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private buildFormData(imageBuffer: Buffer, filename: string): FormData {
    const blob = new Blob([imageBuffer as unknown as BlobPart]);
    const formData = new FormData();
    formData.append('imageFile', blob, filename);
    return formData;
  }
}
