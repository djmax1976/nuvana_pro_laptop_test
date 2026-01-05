/**
 * OCR Module - Public API
 *
 * Export all OCR-related functionality for use by other modules.
 *
 * @module ocr
 */

// Main document scanning service
export {
  DocumentScanningService,
  DocumentScanningError,
  getDocumentScanningService,
  type ScanContext,
} from "./document-scanning.service";

// OCR service
export {
  OCRService,
  OCRServiceError,
  getOCRService,
  type OCRExtractionResult,
  type OCRExtractionOptions,
} from "./ocr.service";

// Image preprocessing service
export {
  ImagePreprocessingService,
  ImagePreprocessingError,
  getImagePreprocessingService,
  type PreprocessingOptions,
  type PreprocessingResult,
} from "./image-preprocessing.service";
