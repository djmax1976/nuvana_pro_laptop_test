/**
 * Upload Validation Utilities
 *
 * Provides file type validation using both MIME type checking and
 * file signature (magic bytes) validation to prevent MIME spoofing attacks.
 *
 * SECURITY: Always validate both Content-Type header AND actual file content
 * to prevent attackers from uploading malicious files with spoofed MIME types.
 */

import { Readable } from "stream";

export interface FileTypeConfig {
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  magicBytes: Array<{
    offset: number;
    bytes: number[];
  }>;
  maxFileSize: number;
}

/**
 * File type configurations for allowed upload types
 */
export const ALLOWED_FILE_TYPES: Record<string, FileTypeConfig> = {
  csv: {
    allowedMimeTypes: [
      "text/csv",
      "application/csv",
      "text/plain", // Some systems send CSV as text/plain
    ],
    allowedExtensions: [".csv"],
    // CSV validation is lenient - no magic bytes check since CSV is text-based
    // and can start with any printable character (header row, BOM, etc.)
    magicBytes: [],
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },
  json: {
    allowedMimeTypes: [
      "application/json",
      "text/json",
      "application/json; charset=utf-8",
    ],
    allowedExtensions: [".json"],
    magicBytes: [
      { offset: 0, bytes: [0x7b] }, // '{' - JSON object start
      { offset: 0, bytes: [0x5b] }, // '[' - JSON array start
      { offset: 0, bytes: [0xef, 0xbb, 0xbf, 0x7b] }, // UTF-8 BOM + '{'
      { offset: 0, bytes: [0xef, 0xbb, 0xbf, 0x5b] }, // UTF-8 BOM + '['
    ],
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },
};

/**
 * Read magic bytes from a stream or buffer
 * @param source - Stream or buffer to read from
 * @param offset - Byte offset to start reading
 * @param length - Number of bytes to read
 * @returns Promise resolving to buffer with magic bytes
 */
async function readMagicBytes(
  source: Readable | Buffer,
  offset: number,
  length: number,
): Promise<Buffer> {
  if (Buffer.isBuffer(source)) {
    return source.slice(offset, offset + length);
  }

  // For streams, we need to read the first bytes
  // IMPORTANT: Ensure stream is paused initially to prevent premature consumption
  // We'll resume it only after setting up listeners to read exactly what we need
  if (source.readable && !source.destroyed) {
    source.pause();
  }

  const chunks: Buffer[] = [];
  let totalRead = 0;
  const targetLength = offset + length;
  let resolved = false;

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      source.removeListener("data", onData);
      source.removeListener("end", onEnd);
      source.removeListener("error", onError);
      // Pause the stream to stop it from continuing to flow after we've read what we need
      if (source.readable && !source.destroyed) {
        source.pause();
      }
    };

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      totalRead += chunk.length;
      if (totalRead >= targetLength) {
        cleanup();
        const combined = Buffer.concat(chunks);
        resolve(combined.slice(offset, offset + length));
      }
    };

    const onEnd = () => {
      cleanup();
      const combined = Buffer.concat(chunks);
      if (combined.length >= offset + length) {
        resolve(combined.slice(offset, offset + length));
      } else {
        reject(new Error("Stream ended before reading required bytes"));
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    // Set up listeners before resuming to ensure we capture all data
    source.on("data", onData);
    source.on("end", onEnd);
    source.on("error", onError);

    // Resume the stream to start reading (safe even if already flowing)
    if (source.readable && !source.destroyed) {
      source.resume();
    }
  });
}

/**
 * Validate file signature (magic bytes) against expected patterns
 *
 * IMPORTANT: This function reads from the source ONCE (for the maximum length needed)
 * and then checks all patterns against that single buffer. This prevents stream exhaustion
 * when validating multiple patterns.
 *
 * @param source - Stream or buffer containing file data
 * @param expectedMagicBytes - Array of magic byte patterns to check
 * @returns Promise resolving to true if any pattern matches
 */
async function validateMagicBytes(
  source: Readable | Buffer,
  expectedMagicBytes: Array<{ offset: number; bytes: number[] }>,
): Promise<boolean> {
  if (expectedMagicBytes.length === 0) {
    // No magic bytes defined - skip validation (e.g., for CSV)
    return true;
  }

  try {
    // Compute maxLength once before the loop to determine how many bytes we need
    const maxLength = Math.max(
      ...expectedMagicBytes.map((p) => p.offset + p.bytes.length),
    );
    const readLength = maxLength;

    // Perform a SINGLE read of readLength bytes from the source into a buffer
    // This prevents stream exhaustion - we read once, then check all patterns
    const bytes = await readMagicBytes(source, 0, readLength);

    // Iterate over expectedMagicBytes comparing slices of that single buffer
    // to each pattern's bytes (no further stream reads - stream is only consumed once)
    for (const pattern of expectedMagicBytes) {
      const patternBytes = bytes.slice(
        pattern.offset,
        pattern.offset + pattern.bytes.length,
      );

      // Check if pattern matches
      let matches = true;
      for (let i = 0; i < pattern.bytes.length; i++) {
        // eslint-disable-next-line security/detect-object-injection -- Safe: i is bounded by pattern.bytes.length
        if (patternBytes[i] !== pattern.bytes[i]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return true;
      }
    }
    return false;
  } catch (error) {
    // If we can't read magic bytes, fail validation
    return false;
  }
}

/**
 * Get file extension from filename
 * @param filename - File name
 * @returns Lowercase file extension without dot, or null
 */
export function getFileExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return null;
  }
  return filename.substring(lastDot + 1).toLowerCase();
}

/**
 * Read a stream fully into a Buffer
 * @param stream - Stream to read
 * @returns Promise resolving to Buffer with all stream data
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on("error", (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Validate file type using MIME type, extension, and magic bytes
 * @param filename - Original filename
 * @param mimeType - Content-Type/MIME type from request
 * @param fileStream - File stream or buffer for magic byte validation
 * @param allowedTypes - Array of allowed file type keys (e.g., ['csv', 'json'])
 * @returns Validation result with success flag, error message if failed, and buffered file data
 */
export async function validateFileType(
  filename: string,
  mimeType: string | undefined,
  fileStream: Readable | Buffer,
  allowedTypes: string[] = ["csv", "json"],
): Promise<{
  valid: boolean;
  error?: string;
  detectedType?: string;
  fileBuffer?: Buffer;
}> {
  // Get file extension
  const extension = getFileExtension(filename);
  if (!extension) {
    return {
      valid: false,
      error: "File must have a valid extension",
    };
  }

  // Find matching file type config
  let matchedConfig: FileTypeConfig | null = null;
  let detectedType: string | null = null;

  for (const typeKey of allowedTypes) {
    // eslint-disable-next-line security/detect-object-injection -- Safe: typeKey is from allowedTypes array parameter
    const config = ALLOWED_FILE_TYPES[typeKey];
    if (!config) continue;

    // Check extension
    const extMatch = config.allowedExtensions.some(
      (ext) => ext.substring(1).toLowerCase() === extension,
    );
    if (!extMatch) continue;

    // Check MIME type if provided
    if (mimeType) {
      const mimeMatch = config.allowedMimeTypes.some(
        (allowedMime) =>
          mimeType.toLowerCase() === allowedMime.toLowerCase() ||
          mimeType.toLowerCase().startsWith(allowedMime.toLowerCase() + ";"),
      );
      if (!mimeMatch) {
        // Extension matches but MIME doesn't - suspicious
        return {
          valid: false,
          error: `MIME type '${mimeType}' does not match file extension '${extension}'`,
        };
      }
    }

    matchedConfig = config;
    detectedType = typeKey;
    break;
  }

  if (!matchedConfig || !detectedType) {
    return {
      valid: false,
      error: `File type '${extension}' is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
    };
  }

  // Buffer the file content if it's a stream, so it can be reused after validation
  // If fileStream is already a Buffer, use it directly
  let fileBuffer: Buffer;
  if (Buffer.isBuffer(fileStream)) {
    fileBuffer = fileStream;
  } else {
    // Read the entire stream into a Buffer to avoid consuming it
    // This allows callers to continue processing the file data after validation
    fileBuffer = await streamToBuffer(fileStream);
  }

  // Validate magic bytes (file signature) using the buffered data
  const magicBytesValid = await validateMagicBytes(
    fileBuffer,
    matchedConfig.magicBytes,
  );

  if (!magicBytesValid && matchedConfig.magicBytes.length > 0) {
    return {
      valid: false,
      error: `File signature does not match expected format for ${detectedType} files`,
    };
  }

  return {
    valid: true,
    detectedType,
    fileBuffer,
  };
}

/**
 * Validate file size against configured limit
 * @param fileSize - Size of the file in bytes
 * @param maxSize - Maximum allowed size in bytes
 * @returns Validation result
 */
export function validateFileSize(
  fileSize: number,
  maxSize: number,
): { valid: boolean; error?: string } {
  if (fileSize === 0) {
    return {
      valid: false,
      error: "File cannot be empty",
    };
  }

  if (fileSize > maxSize) {
    return {
      valid: false,
      error: `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxSize / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  return { valid: true };
}
