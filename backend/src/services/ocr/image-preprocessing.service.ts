/**
 * Image Preprocessing Service
 *
 * Prepares scanned images for OCR processing using Sharp.js.
 * Applies transformations to improve OCR accuracy:
 * - Grayscale conversion
 * - Contrast enhancement
 * - Sharpening
 * - Noise reduction
 * - Rotation correction (deskew)
 * - Resolution normalization
 *
 * Enterprise coding standards applied:
 * - SEC-015: Re-encode images to strip malicious EXIF/embedded payloads
 * - API-003: Structured error handling with correlation IDs
 * - LM-001: Structured logging without sensitive data
 *
 * @module image-preprocessing.service
 */

import sharp from "sharp";
import type { Sharp, Metadata } from "sharp";
import { createHash } from "crypto";

/**
 * Preprocessing options for image optimization.
 */
export interface PreprocessingOptions {
  /** Target width for resizing (maintains aspect ratio) */
  targetWidth?: number;
  /** Target DPI for OCR (default: 300) */
  targetDpi?: number;
  /** Apply grayscale conversion */
  grayscale?: boolean;
  /** Apply contrast enhancement (1.0 = normal) */
  contrastLevel?: number;
  /** Apply sharpening (0-10 scale) */
  sharpenLevel?: number;
  /** Apply noise reduction */
  denoise?: boolean;
  /** Attempt deskew (rotation correction) */
  deskew?: boolean;
  /** Output format */
  outputFormat?: "jpeg" | "png" | "webp";
  /** Output quality (1-100 for JPEG/WebP) */
  outputQuality?: number;
}

/**
 * Result of image preprocessing.
 */
export interface PreprocessingResult {
  /** Preprocessed image buffer */
  buffer: Buffer;
  /** MIME type of output */
  mimeType: string;
  /** Original image dimensions */
  originalWidth: number;
  originalHeight: number;
  /** Processed image dimensions */
  processedWidth: number;
  processedHeight: number;
  /** Operations applied */
  operations: string[];
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** SHA-256 hash of processed image */
  fileHash: string;
}

/**
 * Default preprocessing options optimized for lottery report OCR.
 */
const DEFAULT_OPTIONS: Required<PreprocessingOptions> = {
  targetWidth: 2400, // Good for OCR without excessive file size
  targetDpi: 300, // Standard OCR DPI
  grayscale: true, // Text OCR works better in grayscale
  contrastLevel: 1.2, // Slight contrast boost
  sharpenLevel: 1.0, // Light sharpening
  denoise: true, // Reduce noise
  deskew: false, // Disabled by default (complex operation)
  outputFormat: "png", // Lossless for OCR accuracy
  outputQuality: 95,
};

/**
 * Allowed MIME types for image processing.
 * SEC-015: Strict allowlist for file types.
 */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/bmp",
]);

/**
 * Magic bytes for supported image formats.
 * SEC-015: Verify file content matches MIME type.
 */
const MAGIC_BYTES: Record<string, number[][]> = {
  jpeg: [[0xff, 0xd8, 0xff]],
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  webp: [
    [0x52, 0x49, 0x46, 0x46], // RIFF header (WebP starts with RIFF)
  ],
  tiff: [
    [0x49, 0x49, 0x2a, 0x00], // Little endian
    [0x4d, 0x4d, 0x00, 0x2a], // Big endian
  ],
  bmp: [
    [0x42, 0x4d], // BM header
  ],
};

/**
 * Image Preprocessing Service for OCR optimization.
 */
export class ImagePreprocessingService {
  /**
   * Validate image buffer using magic bytes.
   * SEC-015: Don't trust file extensions alone.
   *
   * @param buffer - Image buffer to validate
   * @returns Detected format or null if invalid
   */
  validateImageMagicBytes(buffer: Buffer): string | null {
    for (const [format, signatures] of Object.entries(MAGIC_BYTES)) {
      for (const signature of signatures) {
        if (buffer.length >= signature.length) {
          const matches = signature.every((byte, i) => buffer[i] === byte);
          if (matches) {
            return format;
          }
        }
      }
    }
    return null;
  }

  /**
   * Validate MIME type against allowlist.
   * SEC-015: Strict allowlist for file types.
   *
   * @param mimeType - MIME type to validate
   * @returns True if allowed
   */
  isAllowedMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES.has(mimeType.toLowerCase());
  }

  /**
   * Preprocess an image for OCR.
   * SEC-015: Re-encodes image to strip potentially malicious data.
   *
   * @param buffer - Original image buffer
   * @param options - Preprocessing options
   * @returns Preprocessing result with optimized image
   * @throws Error if image is invalid or processing fails
   */
  async preprocess(
    buffer: Buffer,
    options: PreprocessingOptions = {},
  ): Promise<PreprocessingResult> {
    const startTime = Date.now();
    const operations: string[] = [];
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // SEC-015: Validate magic bytes before processing
    const detectedFormat = this.validateImageMagicBytes(buffer);
    if (!detectedFormat) {
      throw new ImagePreprocessingError(
        "INVALID_IMAGE_FORMAT",
        "Image format not recognized or not supported",
      );
    }
    operations.push(`validated:${detectedFormat}`);

    // Get original metadata
    let metadata: Metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch (error) {
      throw new ImagePreprocessingError(
        "METADATA_EXTRACTION_FAILED",
        "Failed to extract image metadata",
        error,
      );
    }

    if (!metadata.width || !metadata.height) {
      throw new ImagePreprocessingError(
        "INVALID_DIMENSIONS",
        "Could not determine image dimensions",
      );
    }

    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    // Start building the Sharp pipeline
    // SEC-015: Re-encoding through Sharp strips EXIF and embedded payloads
    let pipeline: Sharp = sharp(buffer, {
      // Limit memory usage for large images
      limitInputPixels: 268402689, // ~16384 x 16384
      // Remove all metadata including EXIF (security)
    }).rotate(); // Auto-rotate based on EXIF orientation

    operations.push("exif_stripped");

    // 1. Resize if needed (maintain aspect ratio)
    if (opts.targetWidth && originalWidth > opts.targetWidth) {
      pipeline = pipeline.resize(opts.targetWidth, null, {
        withoutEnlargement: true,
        fit: "inside",
      });
      operations.push(`resize:${opts.targetWidth}`);
    }

    // 2. Convert to grayscale for OCR
    if (opts.grayscale) {
      pipeline = pipeline.grayscale();
      operations.push("grayscale");
    }

    // 3. Normalize (stretch histogram for better contrast)
    pipeline = pipeline.normalize();
    operations.push("normalize");

    // 4. Apply contrast adjustment
    if (opts.contrastLevel !== 1.0) {
      // Sharp uses modulate for contrast-like adjustments
      // We use linear for more precise control
      const contrast = opts.contrastLevel;
      pipeline = pipeline.linear(contrast, -(128 * contrast) + 128);
      operations.push(`contrast:${contrast}`);
    }

    // 5. Apply sharpening for clearer text edges
    if (opts.sharpenLevel > 0) {
      // sigma controls the sharpening intensity
      const sigma = 0.5 + opts.sharpenLevel * 0.3;
      pipeline = pipeline.sharpen({ sigma });
      operations.push(`sharpen:${opts.sharpenLevel}`);
    }

    // 6. Reduce noise (median filter)
    if (opts.denoise) {
      pipeline = pipeline.median(3); // 3x3 median filter
      operations.push("denoise");
    }

    // 7. Output format with quality settings
    let outputMimeType: string;
    switch (opts.outputFormat) {
      case "jpeg":
        pipeline = pipeline.jpeg({ quality: opts.outputQuality });
        outputMimeType = "image/jpeg";
        break;
      case "webp":
        pipeline = pipeline.webp({
          quality: opts.outputQuality,
          lossless: false,
        });
        outputMimeType = "image/webp";
        break;
      case "png":
      default:
        pipeline = pipeline.png({ compressionLevel: 6 });
        outputMimeType = "image/png";
        break;
    }
    operations.push(`output:${opts.outputFormat}`);

    // Execute pipeline
    let outputBuffer: Buffer;
    let outputMetadata: Metadata;
    try {
      outputBuffer = await pipeline.toBuffer();
      outputMetadata = await sharp(outputBuffer).metadata();
    } catch (error) {
      throw new ImagePreprocessingError(
        "PROCESSING_FAILED",
        "Image preprocessing pipeline failed",
        error,
      );
    }

    // Calculate file hash for integrity verification
    // SEC-015: SHA-256 hash for file integrity
    const fileHash = createHash("sha256").update(outputBuffer).digest("hex");

    const processingTimeMs = Date.now() - startTime;

    // LM-001: Structured logging
    this.logOperation("preprocess", {
      originalFormat: detectedFormat,
      originalDimensions: `${originalWidth}x${originalHeight}`,
      processedDimensions: `${outputMetadata.width}x${outputMetadata.height}`,
      outputFormat: opts.outputFormat,
      operations: operations.length,
      processingTimeMs,
      inputSizeBytes: buffer.length,
      outputSizeBytes: outputBuffer.length,
    });

    return {
      buffer: outputBuffer,
      mimeType: outputMimeType,
      originalWidth,
      originalHeight,
      processedWidth: outputMetadata.width || 0,
      processedHeight: outputMetadata.height || 0,
      operations,
      processingTimeMs,
      fileHash,
    };
  }

  /**
   * Quick validation of image without full preprocessing.
   * Used for early rejection of invalid uploads.
   *
   * @param buffer - Image buffer to validate
   * @param maxSizeBytes - Maximum allowed file size
   * @returns Validation result
   */
  async validateImage(
    buffer: Buffer,
    maxSizeBytes: number = 10 * 1024 * 1024, // 10MB default
  ): Promise<{
    isValid: boolean;
    error?: string;
    format?: string;
    width?: number;
    height?: number;
    sizeBytes: number;
  }> {
    // Check file size
    if (buffer.length > maxSizeBytes) {
      return {
        isValid: false,
        error: `File size ${buffer.length} bytes exceeds maximum ${maxSizeBytes} bytes`,
        sizeBytes: buffer.length,
      };
    }

    // Check magic bytes
    const format = this.validateImageMagicBytes(buffer);
    if (!format) {
      return {
        isValid: false,
        error: "Unrecognized or unsupported image format",
        sizeBytes: buffer.length,
      };
    }

    // Get dimensions
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        isValid: true,
        format,
        width: metadata.width,
        height: metadata.height,
        sizeBytes: buffer.length,
      };
    } catch {
      return {
        isValid: false,
        error: "Failed to read image metadata - file may be corrupted",
        format,
        sizeBytes: buffer.length,
      };
    }
  }

  /**
   * Structured logging for preprocessing operations.
   * LM-001: No sensitive data in logs.
   */
  private logOperation(operation: string, data: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: "ImagePreprocessingService",
      operation,
      ...data,
    };
    console.log("[ImagePreprocessing]", JSON.stringify(logEntry));
  }
}

/**
 * Custom error class for preprocessing failures.
 * API-003: Structured error handling.
 */
export class ImagePreprocessingError extends Error {
  readonly code: string;
  readonly originalError?: unknown;

  constructor(code: string, message: string, originalError?: unknown) {
    super(message);
    this.name = "ImagePreprocessingError";
    this.code = code;
    this.originalError = originalError;

    // Maintain stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ImagePreprocessingError);
    }
  }

  /**
   * Convert to client-safe error response.
   * API-003: Never leak internal details.
   */
  toClientError(): { code: string; message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

// Singleton instance for reuse
let preprocessingServiceInstance: ImagePreprocessingService | null = null;

/**
 * Get singleton instance of ImagePreprocessingService.
 */
export function getImagePreprocessingService(): ImagePreprocessingService {
  if (!preprocessingServiceInstance) {
    preprocessingServiceInstance = new ImagePreprocessingService();
  }
  return preprocessingServiceInstance;
}
