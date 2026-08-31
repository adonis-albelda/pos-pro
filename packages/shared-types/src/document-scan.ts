/** Live document / text-list scan quality — shared by admin web camera and mobile Expo camera. */
export type ScanQuality =
  | "align"
  | "too_dark"
  | "too_bright"
  | "blurry"
  | "hold_steady"
  | "ready";

export interface DocumentScanMetrics {
  brightness: number;
  sharpness: number;
  motion: number;
}

export function rgbaBrightness(rgba: Uint8ClampedArray): number {
  let sum = 0;
  const pixels = rgba.length / 4;
  if (pixels === 0) return 0;
  for (let i = 0; i < rgba.length; i += 4) {
    sum += 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
  }
  return sum / pixels;
}

/** Laplacian variance — low value means motion blur or out of focus. */
export function rgbaSharpness(rgba: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;

  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      gray[y * width + x] = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    }
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = gray[y * width + x]!;
      const lap =
        -4 * center +
        gray[y * width + (x - 1)]! +
        gray[y * width + (x + 1)]! +
        gray[(y - 1) * width + x]! +
        gray[(y + 1) * width + x]!;
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

export function rgbaMotion(
  current: Uint8ClampedArray,
  previous: Uint8ClampedArray | null,
): number {
  if (!previous || previous.length !== current.length) return 999;
  let diff = 0;
  const step = 16;
  for (let i = 0; i < current.length; i += step) {
    diff += Math.abs(current[i]! - previous[i]!);
  }
  return diff / (current.length / step);
}

export function assessDocumentScan(
  metrics: DocumentScanMetrics,
  steadyFrames: number,
): ScanQuality {
  if (metrics.brightness < 52) return "too_dark";
  if (metrics.brightness > 208) return "too_bright";
  if (metrics.sharpness < 75) return "blurry";
  if (metrics.motion > 11) return "hold_steady";
  if (steadyFrames >= 3) return "ready";
  return "align";
}

export function scanQualityMessage(quality: ScanQuality): string {
  switch (quality) {
    case "align":
      return "Fit the list inside the frame";
    case "too_dark":
      return "Too dark — move to brighter light";
    case "too_bright":
      return "Too much glare — tilt the page";
    case "blurry":
      return "Move closer or hold the phone steady";
    case "hold_steady":
      return "Hold steady…";
    case "ready":
      return "Looks good — tap capture";
  }
}
