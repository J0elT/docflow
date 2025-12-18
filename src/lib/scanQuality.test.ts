import { describe, expect, test } from "vitest";
import {
  analyzeRgbaFrame,
  applyScanPresetToRgba,
  assessQualityGate,
  computeCropConfidence,
  SCAN_THRESHOLDS,
} from "@/lib/scanQuality";

function solidRgba(w: number, h: number, r: number, g: number, b: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

function stripesRgba(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.floor(x / 4) % 2 === 0 ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("scanQuality", () => {
  test("analyzeRgbaFrame reports mean/std correctly for solid image", () => {
    const rgba = solidRgba(40, 30, 100, 100, 100);
    const a = analyzeRgbaFrame(rgba, 40, 30);
    expect(Math.round(a.meanLuma)).toBe(100);
    expect(a.lumaStd).toBe(0);
    expect(a.glareFraction).toBe(0);
  });

  test("focusScore separates flat vs sharp edges", () => {
    const flat = analyzeRgbaFrame(solidRgba(60, 60, 128, 128, 128), 60, 60);
    const sharp = analyzeRgbaFrame(stripesRgba(60, 60), 60, 60);
    expect(flat.focusScore).toBeLessThan(2);
    expect(sharp.focusScore).toBeGreaterThan(SCAN_THRESHOLDS.focusMin);
  });

  test("applyScanPresetToRgba binarizes for OCR", () => {
    const w = 40;
    const h = 10;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // left half dark, right half bright
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = x < w / 2 ? 40 : 220;
        rgba[i] = v;
        rgba[i + 1] = v;
        rgba[i + 2] = v;
        rgba[i + 3] = 255;
      }
    }
    const out = applyScanPresetToRgba(rgba, w, h, "ocr");
    const values = new Set<number>();
    for (let i = 0; i < out.length; i += 4) values.add(out[i] ?? 0);
    expect(Array.from(values).sort()).toEqual([0, 255]);
  });

  test("computeCropConfidence rewards in-frame, large contours", () => {
    const w = 1000;
    const h = 1400;
    const good = computeCropConfidence(
      [
        { x: 140, y: 160 },
        { x: 860, y: 160 },
        { x: 860, y: 1240 },
        { x: 140, y: 1240 },
      ],
      w,
      h
    );
    const bad = computeCropConfidence(
      [
        { x: 2, y: 2 },
        { x: 998, y: 2 },
        { x: 998, y: 1398 },
        { x: 2, y: 1398 },
      ],
      w,
      h
    );
    expect(good).toBeGreaterThan(bad);
    expect(good).toBeGreaterThan(0.5);
  });

  test("assessQualityGate flags glare/dark/blur", () => {
    const dark = analyzeRgbaFrame(solidRgba(60, 60, 10, 10, 10), 60, 60);
    const glare = analyzeRgbaFrame(solidRgba(60, 60, 255, 255, 255), 60, 60);
    const blur = analyzeRgbaFrame(solidRgba(60, 60, 140, 140, 140), 60, 60);

    expect(
      assessQualityGate({ analysis: dark, hasDetection: true, cropConfidence: 1 }).ok
    ).toBe(false);
    expect(
      assessQualityGate({ analysis: glare, hasDetection: true, cropConfidence: 1 }).ok
    ).toBe(false);
    expect(
      assessQualityGate({ analysis: blur, hasDetection: true, cropConfidence: 1 }).ok
    ).toBe(false);
  });
});
