export { EphemeralImageStore } from "./image-store.js";
export { MockMultimodalExtractor } from "./mock-extractor.js";
export { TesseractOcrExtractor, candidatesFromOcrText } from "./tesseract-extractor.js";
export { createExtractionRoutes } from "./routes.js";
export {
  ScreenshotExtractionService,
  type ScreenshotImportInput,
} from "./service.js";
export type {
  DeletionAuditEvent,
  ExtractedHoldingCandidate,
  MultimodalExtractionResult,
  MultimodalExtractor,
  ScreenshotImportResult,
} from "./types.js";
