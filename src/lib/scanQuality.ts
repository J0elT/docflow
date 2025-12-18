export type ScanPreset = "ocr" | "grayscale" | "color";

export type ScanFrameAnalysis = {
  meanLuma: number; // 0..255
  lumaStd: number; // 0..~128
  focusScore: number; // higher = sharper
  glareFraction: number; // 0..1
};

export type ScanQualityReason =
  | "no_edges"
  | "bad_crop"
  | "blur"
  | "dark"
  | "glare"
  | "low_contrast";

export type ScanQualityAssessment = {
  ok: boolean;
  warning: boolean;
  primaryReason: ScanQualityReason | null;
  reasons: ScanQualityReason[];
};

export const SCAN_THRESHOLDS = {
  meanLumaMin: 60,
  meanLumaWarn: 75,
  lumaStdMin: 18,
  lumaStdWarn: 24,
  focusMin: 12,
  focusWarn: 16,
  glareMax: 0.012,
  glareWarn: 0.006,
  cropConfidenceMin: 0.55,
  cropConfidenceWarn: 0.68,
  stabilityDiffMax: 6.0, // 0..255 mean abs diff on downsampled luma
} as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const lumaOf = (r: number, g: number, b: number) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);

export function analyzeRgbaFrame(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): ScanFrameAnalysis {
  const pixelCount = width * height;
  if (pixelCount <= 0) return { meanLuma: 0, lumaStd: 0, focusScore: 0, glareFraction: 0 };

  const luma = new Uint8Array(pixelCount);
  let sum = 0;
  let glare = 0;
  for (let i = 0, p = 0; p < pixelCount; p++, i += 4) {
    const y = lumaOf(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
    luma[p] = y;
    sum += y;
    if (y >= 252) glare++;
  }
  const mean = sum / pixelCount;

  let varSum = 0;
  for (let p = 0; p < pixelCount; p++) {
    const d = luma[p] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / pixelCount);

  const focus = computeFocusScore(luma, width, height);

  return {
    meanLuma: mean,
    lumaStd: std,
    focusScore: focus,
    glareFraction: glare / pixelCount,
  };
}

export function meanAbsDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  if (n <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
  return sum / n;
}

export function computeFocusScore(luma: Uint8Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let count = 0;

  // Sobel operator energy, normalized to ~0..255-ish.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const tl = luma[idx - width - 1] ?? 0;
      const tc = luma[idx - width] ?? 0;
      const tr = luma[idx - width + 1] ?? 0;
      const ml = luma[idx - 1] ?? 0;
      const mr = luma[idx + 1] ?? 0;
      const bl = luma[idx + width - 1] ?? 0;
      const bc = luma[idx + width] ?? 0;
      const br = luma[idx + width + 1] ?? 0;

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      sum += (Math.abs(gx) + Math.abs(gy)) / 8;
      count++;
    }
  }
  return count ? sum / count : 0;
}

export type ScanContourPoint = { x: number; y: number };

export function computeCropConfidence(
  contour: ScanContourPoint[] | null | undefined,
  width: number,
  height: number
): number {
  if (!contour || contour.length < 4 || width <= 0 || height <= 0) return 0;

  // Bounding box + polygon area.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let area2 = 0;
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i]!;
    const q = contour[(i + 1) % contour.length]!;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    area2 += p.x * q.y - q.x * p.y;
  }
  const area = Math.abs(area2) / 2;
  const frameArea = width * height;
  const areaRatio = frameArea > 0 ? area / frameArea : 0;

  const marginLeft = minX / width;
  const marginTop = minY / height;
  const marginRight = (width - maxX) / width;
  const marginBottom = (height - maxY) / height;
  const minMargin = Math.max(0, Math.min(marginLeft, marginTop, marginRight, marginBottom));

  // Coverage: prefer the page to occupy a meaningful part of the frame (not tiny), but avoid edge-clipping.
  const coverageScore = clamp01((areaRatio - 0.12) / 0.55);
  const marginScore = clamp01((minMargin - 0.015) / 0.06);

  return 0.55 * coverageScore + 0.45 * marginScore;
}

export function assessQualityGate(params: {
  analysis: ScanFrameAnalysis;
  hasDetection: boolean;
  cropConfidence: number;
}): ScanQualityAssessment {
  const { analysis, hasDetection, cropConfidence } = params;

  const reasons: ScanQualityReason[] = [];
  if (!hasDetection) reasons.push("no_edges");
  if (hasDetection && cropConfidence < SCAN_THRESHOLDS.cropConfidenceMin) reasons.push("bad_crop");
  if (analysis.focusScore < SCAN_THRESHOLDS.focusMin) reasons.push("blur");
  if (analysis.meanLuma < SCAN_THRESHOLDS.meanLumaMin) reasons.push("dark");
  if (analysis.glareFraction > SCAN_THRESHOLDS.glareMax) reasons.push("glare");
  if (analysis.lumaStd < SCAN_THRESHOLDS.lumaStdMin) reasons.push("low_contrast");

  const ok = reasons.length === 0;

  const warning =
    ok &&
    (analysis.focusScore < SCAN_THRESHOLDS.focusWarn ||
      analysis.meanLuma < SCAN_THRESHOLDS.meanLumaWarn ||
      analysis.glareFraction > SCAN_THRESHOLDS.glareWarn ||
      analysis.lumaStd < SCAN_THRESHOLDS.lumaStdWarn ||
      cropConfidence < SCAN_THRESHOLDS.cropConfidenceWarn);

  const primaryReason = pickPrimaryReason(reasons);

  return { ok, warning, primaryReason, reasons };
}

function pickPrimaryReason(reasons: ScanQualityReason[]): ScanQualityReason | null {
  if (!reasons.length) return null;
  const priority: ScanQualityReason[] = ["blur", "dark", "glare", "bad_crop", "no_edges", "low_contrast"];
  for (const p of priority) if (reasons.includes(p)) return p;
  return reasons[0] ?? null;
}

type Histogram = number[];

function buildLumaHistogram(luma: Uint8Array): Histogram {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < luma.length; i++) hist[luma[i] ?? 0]!++;
  return hist;
}

function percentileFromHistogram(hist: Histogram, total: number, p: number): number {
  const target = total * p;
  let c = 0;
  for (let i = 0; i < hist.length; i++) {
    c += hist[i] ?? 0;
    if (c >= target) return i;
  }
  return hist.length - 1;
}

export function applyScanPresetToRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  preset: ScanPreset
): Uint8ClampedArray {
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(pixelCount * 4);
  if (pixelCount <= 0) return out;

  if (preset === "color") {
    out.set(rgba);
    return out;
  }

  const luma = new Uint8Array(pixelCount);
  for (let i = 0, p = 0; p < pixelCount; p++, i += 4) {
    luma[p] = lumaOf(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
  }

  // Contrast stretch on luma to counter shadows.
  const hist = buildLumaHistogram(luma);
  const lo = percentileFromHistogram(hist, pixelCount, 0.01);
  const hi = percentileFromHistogram(hist, pixelCount, 0.99);
  const scale = hi > lo ? 255 / (hi - lo) : 1;

  const stretched = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    const v = luma[p] ?? 0;
    const s = hi > lo ? Math.round((v - lo) * scale) : v;
    stretched[p] = Math.max(0, Math.min(255, s));
  }

  if (preset === "grayscale") {
    for (let i = 0, p = 0; p < pixelCount; p++, i += 4) {
      const v = stretched[p] ?? 0;
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
    return out;
  }

  // preset === "ocr": binarize using Otsu threshold.
  const threshold = otsuThresholdFromHistogram(buildLumaHistogram(stretched), pixelCount);
  for (let i = 0, p = 0; p < pixelCount; p++, i += 4) {
    const v = (stretched[p] ?? 0) > threshold ? 255 : 0;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

export function otsuThresholdFromHistogram(hist: Histogram, total: number): number {
  if (total <= 0) return 128;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * (hist[t] ?? 0);

  let sumB = 0;
  let wB = 0;
  let wF = 0;

  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  return threshold;
}
