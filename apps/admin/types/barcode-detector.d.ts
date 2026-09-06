/**
 * TypeScript's bundled DOM lib has no BarcodeDetector types yet (Chrome/Edge/
 * Android Chrome only — see MDN). Minimal ambient shape for what
 * apps/admin/components/barcode-scan-camera.tsx actually calls.
 */
interface DetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
}

interface BarcodeDetectorOptions {
  formats?: string[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  static getSupportedFormats(): Promise<string[]>;
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

interface Window {
  BarcodeDetector?: typeof BarcodeDetector;
}
