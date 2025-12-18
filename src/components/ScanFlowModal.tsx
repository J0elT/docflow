"use client";

import Image from "next/image";
import { PDFDocument } from "pdf-lib";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getLocaleForLanguage, useLanguage, type LanguageCode } from "@/lib/language";
import {
  analyzeRgbaFrame,
  applyScanPresetToRgba,
  assessQualityGate,
  computeCropConfidence,
  meanAbsDiff,
  SCAN_THRESHOLDS,
  type ScanContourPoint,
  type ScanFrameAnalysis,
  type ScanPreset,
  type ScanQualityAssessment,
  type ScanQualityReason,
} from "@/lib/scanQuality";

type Props = {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, opts?: { title?: string; categoryId?: string | null }) => Promise<void>;
};

type CropRect = { x: number; y: number; w: number; h: number };

type ScanPage = {
  id: string;
  baseBlob: Blob;
  baseUrl: string;
  baseWidth: number;
  baseHeight: number;
  previewBlob: Blob;
  previewUrl: string;
  detected: boolean;
  cropConfidence: number;
  quality: ScanQualityAssessment & { analysis: ScanFrameAnalysis };
  edits: {
    crop: CropRect;
    rotation: 0 | 90 | 180 | 270;
    presetOverride: ScanPreset | null;
  };
};

type GateFailureState = {
  previewUrl: string;
  assessment: ScanQualityAssessment;
};

type CategoryRow = { id: string; name: string; parent_id: string | null };
type CategoryTranslationRow = { category_id: string; label: string };

type JscanifyScanner = {
  scanImage?: (canvas: HTMLCanvasElement) => unknown;
};

type JscanifyConstructor = new () => JscanifyScanner;

type ScanImageResult = {
  contour?: unknown;
  image?: unknown;
};

function isContour(value: unknown): value is ScanContourPoint[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (p) =>
      !!p &&
      typeof (p as { x?: unknown }).x === "number" &&
      typeof (p as { y?: unknown }).y === "number"
  );
}

function isCanvas(value: unknown): value is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== "undefined" && value instanceof HTMLCanvasElement;
}

function extractScanImageResult(value: unknown): { contour: ScanContourPoint[] | null; image: HTMLCanvasElement | null } {
  if (!value || typeof value !== "object") return { contour: null, image: null };
  const v = value as ScanImageResult;
  const contour = isContour(v.contour) ? (v.contour as ScanContourPoint[]) : null;
  const image = isCanvas(v.image) ? (v.image as HTMLCanvasElement) : null;
  return { contour, image };
}

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1800;
const IMAGE_QUALITY = 0.82;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const defaultTitleFor = (lang: LanguageCode) => {
  const now = new Date();
  const locale = getLocaleForLanguage(lang) || "en-US";
  const d = now.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  return lang === "de" ? `Scan vom ${d}` : `Scan ${d}`;
};

function rotate90(rotation: 0 | 90 | 180 | 270, dir: "cw" | "ccw"): 0 | 90 | 180 | 270 {
  const next = dir === "cw" ? (rotation + 90) % 360 : (rotation + 270) % 360;
  return next as 0 | 90 | 180 | 270;
}

function rotateCropRect(crop: CropRect, dir: "cw" | "ccw"): CropRect {
  const left = clamp01(crop.x);
  const top = clamp01(crop.y);
  const right = clamp01(crop.x + crop.w);
  const bottom = clamp01(crop.y + crop.h);

  const corners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];

  const rotated = corners.map((p) => {
    if (dir === "cw") return { x: 1 - p.y, y: p.x };
    return { x: p.y, y: 1 - p.x };
  });

  const xs = rotated.map((p) => p.x);
  const ys = rotated.map((p) => p.y);
  const nx = clamp01(Math.min(...xs));
  const ny = clamp01(Math.min(...ys));
  const nr = clamp01(Math.max(...xs));
  const nb = clamp01(Math.max(...ys));
  return { x: nx, y: ny, w: Math.max(0.01, nr - nx), h: Math.max(0.01, nb - ny) };
}

async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(blob);
}

function ensureCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
  if (!blob) throw new Error("Failed to encode JPEG");
  return blob;
}

async function normalizeJpegBlob(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await blobToImageBitmap(blob);
    const needsResize = bitmap.width > MAX_IMAGE_DIMENSION || bitmap.height > MAX_IMAGE_DIMENSION;
    if (!needsResize && blob.size <= MAX_OUTPUT_BYTES) return blob;
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const c = ensureCanvas(w, h);
    const ctx = c.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const compressed: Blob | null = await new Promise((resolve) =>
      c.toBlob((b) => resolve(b), "image/jpeg", IMAGE_QUALITY)
    );
    return compressed || blob;
  } catch {
    return blob;
  }
}

async function renderPreviewFromBase(params: {
  baseBlob: Blob;
  preset: ScanPreset;
  crop: CropRect;
  rotation: 0 | 90 | 180 | 270;
}): Promise<Blob> {
  const bitmap = await blobToImageBitmap(params.baseBlob);
  const rot = params.rotation;
  const rotW = rot === 90 || rot === 270 ? bitmap.height : bitmap.width;
  const rotH = rot === 90 || rot === 270 ? bitmap.width : bitmap.height;

  // Rotate full page into a canonical orientation first so crop coordinates match the user's view.
  const rotated = ensureCanvas(rotW, rotH);
  const rctx = rotated.getContext("2d");
  if (!rctx) throw new Error("no canvas context");
  rctx.save();
  if (rot !== 0) {
    rctx.translate(rotW / 2, rotH / 2);
    rctx.rotate((rot * Math.PI) / 180);
    rctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  } else {
    rctx.drawImage(bitmap, 0, 0);
  }
  rctx.restore();

  const crop = {
    x: clamp01(params.crop.x),
    y: clamp01(params.crop.y),
    w: clamp01(params.crop.w),
    h: clamp01(params.crop.h),
  };

  let sx = Math.round(crop.x * rotW);
  let sy = Math.round(crop.y * rotH);
  let sw = Math.max(1, Math.round(crop.w * rotW));
  let sh = Math.max(1, Math.round(crop.h * rotH));
  sw = Math.min(sw, rotW);
  sh = Math.min(sh, rotH);
  sx = Math.max(0, Math.min(sx, rotW - sw));
  sy = Math.max(0, Math.min(sy, rotH - sh));

  const canvas = ensureCanvas(sw, sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.drawImage(rotated, sx, sy, sw, sh, 0, 0, sw, sh);

  if (params.preset !== "color") {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const processed = applyScanPresetToRgba(img.data, canvas.width, canvas.height, params.preset);
    img.data.set(processed);
    ctx.putImageData(img, 0, 0);
  }

  const raw = await canvasToJpegBlob(canvas, 0.9);
  return await normalizeJpegBlob(raw);
}

function reasonToCopy(reason: ScanQualityReason | null, t: (k: string) => string) {
  switch (reason) {
    case "blur":
      return t("scanGateBlur");
    case "dark":
      return t("scanTooDark");
    case "glare":
      return t("scanGlare");
    case "low_contrast":
      return t("scanLowContrast");
    case "bad_crop":
      return t("scanBadCrop");
    case "no_edges":
      return t("scanNoEdges");
    default:
      return t("scanGateFail");
  }
}

export default function ScanFlowModal({ open, onClose, onUpload }: Props) {
  const { lang, t } = useLanguage();

  const [screen, setScreen] = useState<"scan" | "review" | "save">("scan");
  const [globalPreset, setGlobalPreset] = useState<ScanPreset>("ocr");

  const [scanError, setScanError] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scannerRef = useRef<JscanifyScanner | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastLoopTsRef = useRef<number>(0);
  const captureScanRef = useRef<(() => void | Promise<void>) | null>(null);

  const [scannerReady, setScannerReady] = useState(false);
  const [hasDetection, setHasDetection] = useState(false);
  const contourRef = useRef<ScanContourPoint[] | null>(null);
  const [analysis, setAnalysis] = useState<ScanFrameAnalysis | null>(null);
  const lastLumaRef = useRef<Uint8Array | null>(null);
  const [stable, setStable] = useState(true);
  const [autoCapture, setAutoCapture] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const [gateFailure, setGateFailure] = useState<GateFailureState | null>(null);
  const clearGateFailure = useCallback(() => {
    setGateFailure((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  const [pages, setPages] = useState<ScanPage[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pendingReplaceId, setPendingReplaceId] = useState<string | null>(null);

  const goodSinceRef = useRef<number | null>(null);
  const lastAutoCaptureRef = useRef<number>(0);

  const [title, setTitle] = useState(() => defaultTitleFor(lang));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoryTranslations, setCategoryTranslations] = useState<Map<string, string>>(new Map());

  const selectedPage = useMemo(
    () => (selectedPageId ? pages.find((p) => p.id === selectedPageId) ?? null : null),
    [pages, selectedPageId]
  );

  const [editPageId, setEditPageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ScanPage["edits"] | null>(null);
  const editBaseRef = useRef<{ baseBlob: Blob; baseWidth: number; baseHeight: number } | null>(null);
  const [editDisplayUrl, setEditDisplayUrl] = useState<string | null>(null);
  const editContainerRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<
    | null
    | {
        pointerId: number;
        mode: "move" | "nw" | "ne" | "sw" | "se";
        startCrop: CropRect;
        startX: number;
        startY: number;
      }
  >(null);

  const replaceEditDisplayUrl = useCallback((next: string | null) => {
    setEditDisplayUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return next;
    });
  }, []);

  const closeEditor = useCallback(() => {
    replaceEditDisplayUrl(null);
    setEditDraft(null);
    setEditPageId(null);
    editBaseRef.current = null;
    cropDragRef.current = null;
  }, [replaceEditDisplayUrl]);

  const openEditor = useCallback(
    (pageId: string) => {
      const page = pages.find((p) => p.id === pageId);
      if (!page) return;
      setSelectedPageId(pageId);
      setEditPageId(pageId);
      setEditDraft({ ...page.edits, crop: { ...page.edits.crop } });
      editBaseRef.current = { baseBlob: page.baseBlob, baseWidth: page.baseWidth, baseHeight: page.baseHeight };
      replaceEditDisplayUrl(null);
      cropDragRef.current = null;
    },
    [pages, replaceEditDisplayUrl]
  );

  const editRotation = editDraft?.rotation;

  useEffect(() => {
    if (!editPageId || editRotation == null || !editBaseRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await renderPreviewFromBase({
          baseBlob: editBaseRef.current!.baseBlob,
          preset: "color",
          crop: { x: 0, y: 0, w: 1, h: 1 },
          rotation: editRotation,
        });
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        replaceEditDisplayUrl(url);
      } catch (err) {
        console.warn("edit preview failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editRotation, editPageId, replaceEditDisplayUrl]);

  const cleanupPages = useCallback(() => {
    pages.forEach((p) => {
      URL.revokeObjectURL(p.previewUrl);
      URL.revokeObjectURL(p.baseUrl);
    });
    setPages([]);
    setSelectedPageId(null);
    setPendingReplaceId(null);
  }, [pages]);

  const stopCamera = useCallback(() => {
    try {
      stream?.getTracks()?.forEach((tr) => tr.stop());
    } catch {}
    setStream(null);
    setTorchSupported(false);
    setTorchOn(false);
    setHasDetection(false);
    contourRef.current = null;
    setAnalysis(null);
    lastLumaRef.current = null;
    setStable(true);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, [stream]);

  const closeAll = useCallback(() => {
    closeEditor();
    clearGateFailure();
    stopCamera();
    cleanupPages();
    setScreen("scan");
    setTitle(defaultTitleFor(lang));
    setCategoryId(null);
    setCategoryPickerOpen(false);
    setScanError(null);
    onClose();
  }, [cleanupPages, clearGateFailure, closeEditor, lang, onClose, stopCamera]);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitleFor(lang));
  }, [open, lang]);

  useEffect(() => {
    // Lock body scroll and dim background so the underlying navigation never peeks through.
    if (open) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
    return;
  }, [open]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    if (editPageId) {
      stopCamera();
      return;
    }
    if (screen !== "scan") {
      stopCamera();
      return;
    }
    return;
  }, [editPageId, open, screen, stopCamera]);

  const ensureScanner = useCallback(async () => {
    if (scannerRef.current) return;
    try {
      const mod = await import("jscanify/src/jscanify.js");
      const maybeCtor: unknown = (mod as { default?: unknown }).default ?? mod;
      if (typeof maybeCtor === "function") {
        scannerRef.current = new (maybeCtor as unknown as JscanifyConstructor)();
        setScannerReady(true);
      } else {
        setScannerReady(false);
      }
    } catch (err) {
      console.warn("scanner load failed", err);
      setScannerReady(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    setScanError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("scanNotSupported"));
      await ensureScanner();
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setStream(media);
      const track = media.getVideoTracks?.()?.[0] ?? null;
      try {
        const caps = track && typeof track.getCapabilities === "function" ? track.getCapabilities() : null;
        const hasTorch =
          !!caps && typeof caps === "object" && "torch" in caps && (caps as { torch?: unknown }).torch === true;
        setTorchSupported(hasTorch);
      } catch {
        setTorchSupported(false);
      }
      requestAnimationFrame(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = media;
        videoRef.current.play().catch(() => setScanError(t("scanError")));
      });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error && err.message ? err.message : t("scanError");
      setScanError(message);
    }
  }, [ensureScanner, t]);

  useEffect(() => {
    if (!open || screen !== "scan" || editPageId) return;
    if (stream) return;
    void startCamera();
  }, [editPageId, open, screen, startCamera, stream]);

  const toggleTorch = useCallback(async () => {
    if (!stream) return;
    const track = stream.getVideoTracks?.()?.[0];
    if (!track) return;
    try {
      type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };
      const constraints: MediaTrackConstraints = { advanced: [{ torch: !torchOn } as TorchConstraintSet] };
      await track.applyConstraints(constraints);
      setTorchOn((v) => !v);
    } catch (err) {
      console.warn("torch not available", err);
    }
  }, [stream, torchOn]);

  const drawContour = useCallback((points: ScanContourPoint[] | null) => {
    const overlay = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;
    overlay.width = video.videoWidth || 1280;
    overlay.height = video.videoHeight || 720;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (points && points.length) {
      ctx.strokeStyle = "rgba(226,76,75,0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      const padX = overlay.width * 0.12;
      const padY = overlay.height * 0.14;
      ctx.strokeRect(padX, padY, overlay.width - padX * 2, overlay.height - padY * 2);
    }
  }, []);

  const updateLoop = useCallback(
    (ts: number) => {
      const video = videoRef.current;
      if (!open || screen !== "scan" || !stream || !video) return;

      const minInterval = 80;
      if (ts - lastLoopTsRef.current < minInterval) {
        rafRef.current = requestAnimationFrame(updateLoop);
        return;
      }
      lastLoopTsRef.current = ts;

      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;

      const scanCanvas =
        previewCanvasRef.current ??
        (previewCanvasRef.current = typeof document !== "undefined" ? document.createElement("canvas") : null);
      if (!scanCanvas) {
        rafRef.current = requestAnimationFrame(updateLoop);
        return;
      }
      if (scanCanvas.width !== w || scanCanvas.height !== h) {
        scanCanvas.width = w;
        scanCanvas.height = h;
      }
      const scanCtx = scanCanvas.getContext("2d");
      if (!scanCtx) {
        rafRef.current = requestAnimationFrame(updateLoop);
        return;
      }
      scanCtx.drawImage(video, 0, 0, w, h);

      // Edge detection / contour.
      let nextHasDetection = false;
      let nextContour: ScanContourPoint[] | null = null;
      const scanner = scannerRef.current;
      if (scanner && typeof scanner.scanImage === "function") {
        try {
          const res = scanner.scanImage(scanCanvas);
          const parsed = extractScanImageResult(res);
          if (parsed.contour && parsed.contour.length) {
            nextHasDetection = true;
            nextContour = parsed.contour;
          }
        } catch (err) {
          console.warn("scan loop error", err);
        }
      }
      contourRef.current = nextContour;
      setHasDetection(nextHasDetection);
      drawContour(nextContour);

      // Fast analysis at low resolution.
      const aCanvas =
        analysisCanvasRef.current ??
        (analysisCanvasRef.current = typeof document !== "undefined" ? document.createElement("canvas") : null);
      if (aCanvas) {
        const aw = 180;
        const ah = 240;
        if (aCanvas.width !== aw || aCanvas.height !== ah) {
          aCanvas.width = aw;
          aCanvas.height = ah;
        }
        const aCtx = aCanvas.getContext("2d", { willReadFrequently: true });
        if (aCtx) {
          aCtx.drawImage(scanCanvas, 0, 0, aw, ah);
          const img = aCtx.getImageData(0, 0, aw, ah);
          const a = analyzeRgbaFrame(img.data, aw, ah);
          setAnalysis(a);

          // stability: mean abs diff on luma.
          const luma = new Uint8Array(aw * ah);
          for (let i = 0, p = 0; p < luma.length; p++, i += 4) {
            const r = img.data[i] ?? 0;
            const g = img.data[i + 1] ?? 0;
            const b = img.data[i + 2] ?? 0;
            luma[p] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          }
          const prev = lastLumaRef.current;
          let nextStable = true;
          if (prev && prev.length === luma.length) {
            const diff = meanAbsDiff(prev, luma);
            nextStable = diff <= SCAN_THRESHOLDS.stabilityDiffMax;
          }
          setStable(nextStable);
          lastLumaRef.current = luma;

          // Auto-capture.
          const cropConfidence = nextContour ? computeCropConfidence(nextContour, w, h) : 0;
          const gating = assessQualityGate({
            analysis: a,
            hasDetection: scannerReady ? nextHasDetection : true,
            cropConfidence: scannerReady ? cropConfidence : 1,
          });
          const good = gating.ok && nextStable;
          if (!autoCapture || scanBusy || gateFailure || pages.length >= 50) {
            goodSinceRef.current = null;
          } else if (!good) {
            goodSinceRef.current = null;
          } else {
            if (goodSinceRef.current == null) goodSinceRef.current = ts;
            const since = goodSinceRef.current ?? ts;
            const dwellOk = ts - since > 420;
            const cooldownOk = ts - lastAutoCaptureRef.current > 1400;
            if (dwellOk && cooldownOk) {
              lastAutoCaptureRef.current = ts;
              void captureScanRef.current?.();
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(updateLoop);
    },
    [autoCapture, drawContour, gateFailure, open, pages.length, scanBusy, scannerReady, screen, stream]
  );

  useEffect(() => {
    if (!open || screen !== "scan" || !stream) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(updateLoop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [open, screen, stream, updateLoop]);

  const createCapturedAnalysis = useCallback(async (canvas: HTMLCanvasElement) => {
    const aCanvas = ensureCanvas(220, 300);
    const aCtx = aCanvas.getContext("2d", { willReadFrequently: true });
    if (!aCtx) return analyzeRgbaFrame(new Uint8ClampedArray(), 0, 0);
    aCtx.drawImage(canvas, 0, 0, aCanvas.width, aCanvas.height);
    const img = aCtx.getImageData(0, 0, aCanvas.width, aCanvas.height);
    return analyzeRgbaFrame(img.data, aCanvas.width, aCanvas.height);
  }, []);

  const captureScan = useCallback(async () => {
    if (!videoRef.current || scanBusy) return;
    setScanBusy(true);
    clearGateFailure();
    try {
      const video = videoRef.current;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const canvas = ensureCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas context");
      ctx.drawImage(video, 0, 0, w, h);

      let outputCanvas: HTMLCanvasElement = canvas;
      let detected = false;
      let contour: ScanContourPoint[] | null = null;

      const scanner = scannerRef.current;
      if (scanner && typeof scanner.scanImage === "function") {
        try {
          const result = scanner.scanImage(canvas);
          const parsed = extractScanImageResult(result);
          if (parsed.image) outputCanvas = parsed.image;
          if (parsed.contour && parsed.contour.length) {
            detected = true;
            contour = parsed.contour;
          }
        } catch (err) {
          console.warn("scan extraction failed, using raw frame", err);
        }
      }

      const cropConfidence = contour ? computeCropConfidence(contour, w, h) : 0;
      const a = await createCapturedAnalysis(outputCanvas);
      const assessment = assessQualityGate({
        analysis: a,
        hasDetection: scannerReady ? detected : true,
        cropConfidence: scannerReady ? cropConfidence : 1,
      });

      if (!assessment.ok) {
        const rawPreview = await canvasToJpegBlob(outputCanvas, 0.92);
        const preview = await normalizeJpegBlob(rawPreview);
        const previewUrl = URL.createObjectURL(preview);
        setGateFailure({ previewUrl, assessment });
        return;
      }

      const rawBase = await canvasToJpegBlob(outputCanvas, 0.92);
      const baseBlob = await normalizeJpegBlob(rawBase);
      const baseUrl = URL.createObjectURL(baseBlob);

      const id = pendingReplaceId || crypto.randomUUID();
      const effectivePreset: ScanPreset = globalPreset;
      const edits: ScanPage["edits"] = { crop: { x: 0, y: 0, w: 1, h: 1 }, rotation: 0, presetOverride: null };
      const previewBlob = await renderPreviewFromBase({
        baseBlob,
        preset: effectivePreset,
        crop: edits.crop,
        rotation: edits.rotation,
      });
      const previewUrl = URL.createObjectURL(previewBlob);

      const quality: ScanPage["quality"] = { ...assessment, analysis: a };
      const newPage: ScanPage = {
        id,
        baseBlob,
        baseUrl,
        baseWidth: outputCanvas.width,
        baseHeight: outputCanvas.height,
        previewBlob,
        previewUrl,
        detected,
        cropConfidence,
        quality,
        edits,
      };

      setPages((prev) => {
        if (pendingReplaceId) {
          const next = prev.map((p) => {
            if (p.id !== pendingReplaceId) return p;
            URL.revokeObjectURL(p.previewUrl);
            URL.revokeObjectURL(p.baseUrl);
            return newPage;
          });
          return next;
        }
        return [...prev, newPage];
      });
      setSelectedPageId(id);
      setPendingReplaceId(null);

      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
          nav.vibrate?.(18);
        }
      } catch {}
    } catch (err) {
      console.error(err);
      const message = err instanceof Error && err.message ? err.message : t("scanError");
      setScanError(message);
    } finally {
      setScanBusy(false);
    }
  }, [
    clearGateFailure,
    createCapturedAnalysis,
    globalPreset,
    pendingReplaceId,
    scanBusy,
    scannerReady,
    t,
    videoRef,
  ]);

  useEffect(() => {
    captureScanRef.current = captureScan;
  }, [captureScan]);

  const deletePage = useCallback((id: string) => {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        URL.revokeObjectURL(target.baseUrl);
      }
      const next = prev.filter((p) => p.id !== id);
      setSelectedPageId(next[0]?.id ?? null);
      if (pendingReplaceId === id) setPendingReplaceId(null);
      return next;
    });
  }, [pendingReplaceId]);

  const movePage = useCallback((id: string, toIndex: number) => {
    setPages((prev) => {
      const from = prev.findIndex((p) => p.id === id);
      if (from === -1) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item!);
      return next;
    });
  }, []);

  const applyGlobalPreset = useCallback(
    async (preset: ScanPreset) => {
      setGlobalPreset(preset);
      const updates = await Promise.all(
        pages.map(async (p) => {
          const effective = p.edits.presetOverride ?? preset;
          const previewBlob = await renderPreviewFromBase({
            baseBlob: p.baseBlob,
            preset: effective,
            crop: p.edits.crop,
            rotation: p.edits.rotation,
          });
          const previewUrl = URL.createObjectURL(previewBlob);
          return { id: p.id, previewBlob, previewUrl };
        })
      );
      setPages((prev) =>
        prev.map((p) => {
          const u = updates.find((x) => x.id === p.id);
          if (!u) return p;
          URL.revokeObjectURL(p.previewUrl);
          return { ...p, previewBlob: u.previewBlob, previewUrl: u.previewUrl };
        })
      );
    },
    [pages]
  );

  const buildPdfFromPages = useCallback(async () => {
    const pdf = await PDFDocument.create();
    for (const p of pages) {
      const buffer = await p.previewBlob.arrayBuffer();
      const img = await pdf.embedJpg(buffer);
      const { width, height } = img.scale(1);
      const pdfPage = pdf.addPage([width, height]);
      pdfPage.drawImage(img, { x: 0, y: 0, width, height });
    }
    const bytes = await pdf.save();
    const arr = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes as ArrayBuffer);
    return new File([arr], `scan-${Date.now()}.pdf`, { type: "application/pdf" });
  }, [pages]);

  const fetchCategories = useCallback(async () => {
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) return;
      const [catsRes, transRes] = await Promise.all([
        supabase.from("categories").select("id, name, parent_id").eq("user_id", user.id),
        supabase
          .from("category_translations")
          .select("category_id, label")
          .eq("user_id", user.id)
          .eq("lang", lang),
      ]);
      if (!catsRes.error) setCategories((catsRes.data as CategoryRow[]) || []);
      if (!transRes.error) {
        const map = new Map<string, string>();
        (transRes.data as CategoryTranslationRow[] | null)?.forEach((r) => {
          if (r?.category_id && r?.label) map.set(r.category_id, r.label);
        });
        setCategoryTranslations(map);
      }
    } catch (err) {
      console.warn("fetch categories failed", err);
    }
  }, [lang]);

  useEffect(() => {
    if (!open || screen !== "save") return;
    void fetchCategories();
  }, [open, screen, fetchCategories]);

  const categoryLabel = useMemo(() => {
    if (!categoryId) return t("allFolders");
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return t("selectFolder");
    return categoryTranslations.get(cat.id) || cat.name;
  }, [categoryId, categories, categoryTranslations, t]);

  const beginReview = useCallback(() => {
    setScreen("review");
    clearGateFailure();
  }, [clearGateFailure]);

  const beginSave = useCallback(() => {
    setScreen("save");
    clearGateFailure();
  }, [clearGateFailure]);

  const backToScan = useCallback(() => {
    setScreen("scan");
    clearGateFailure();
  }, [clearGateFailure]);

  const finalizeUpload = useCallback(async () => {
    if (!pages.length) return;
    setFinalizing(true);
    try {
      const pdf = await buildPdfFromPages();
      await onUpload(pdf, { title: title?.trim() || pdf.name, categoryId });
      closeAll();
    } catch (err) {
      console.error(err);
      setScanError(t("scanError"));
    } finally {
      setFinalizing(false);
    }
  }, [buildPdfFromPages, categoryId, closeAll, onUpload, pages.length, t, title]);

  const scanWarnings = useMemo(() => {
    const w: { key: string; text: string }[] = [];
    if (!analysis) return w;
    if (analysis.meanLuma < SCAN_THRESHOLDS.meanLumaMin) w.push({ key: "dark", text: t("scanTooDark") });
    if (analysis.glareFraction > SCAN_THRESHOLDS.glareWarn) w.push({ key: "glare", text: t("scanGlare") });
    if (analysis.focusScore < SCAN_THRESHOLDS.focusWarn) w.push({ key: "blur", text: t("scanBlurry") });
    return w;
  }, [analysis, t]);

  const editorAspect = useMemo(() => {
    if (!editDraft || !editBaseRef.current) return "4 / 5";
    const { baseWidth, baseHeight } = editBaseRef.current;
    const rot = editDraft.rotation;
    const w = rot === 90 || rot === 270 ? baseHeight : baseWidth;
    const h = rot === 90 || rot === 270 ? baseWidth : baseHeight;
    return `${Math.max(1, w)} / ${Math.max(1, h)}`;
  }, [editDraft]);

  const pointerToNorm = useCallback((e: React.PointerEvent) => {
    const el = editContainerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    return { x, y };
  }, []);

  const startCropDrag = useCallback(
    (mode: "move" | "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => {
      if (!editDraft) return;
      const pos = pointerToNorm(e);
      if (!pos) return;
      e.preventDefault();
      e.stopPropagation();
      editContainerRef.current?.setPointerCapture?.(e.pointerId);
      cropDragRef.current = {
        pointerId: e.pointerId,
        mode,
        startCrop: { ...editDraft.crop },
        startX: pos.x,
        startY: pos.y,
      };
    },
    [editDraft, pointerToNorm]
  );

  const onCropMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = cropDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const pos = pointerToNorm(e);
      if (!pos) return;

      const minW = 0.12;
      const minH = 0.12;

      const start = drag.startCrop;
      let left = start.x;
      let top = start.y;
      let right = start.x + start.w;
      let bottom = start.y + start.h;

      if (drag.mode === "move") {
        const dx = pos.x - drag.startX;
        const dy = pos.y - drag.startY;
        const w = start.w;
        const h = start.h;
        left = Math.max(0, Math.min(1 - w, start.x + dx));
        top = Math.max(0, Math.min(1 - h, start.y + dy));
        right = left + w;
        bottom = top + h;
      } else {
        if (drag.mode === "nw" || drag.mode === "sw") left = pos.x;
        if (drag.mode === "ne" || drag.mode === "se") right = pos.x;
        if (drag.mode === "nw" || drag.mode === "ne") top = pos.y;
        if (drag.mode === "sw" || drag.mode === "se") bottom = pos.y;

        left = clamp01(left);
        top = clamp01(top);
        right = clamp01(right);
        bottom = clamp01(bottom);

        if (right - left < minW) {
          if (drag.mode === "nw" || drag.mode === "sw") left = right - minW;
          else right = left + minW;
        }
        if (bottom - top < minH) {
          if (drag.mode === "nw" || drag.mode === "ne") top = bottom - minH;
          else bottom = top + minH;
        }

        left = Math.max(0, Math.min(left, 1 - minW));
        top = Math.max(0, Math.min(top, 1 - minH));
        right = Math.max(left + minW, Math.min(1, right));
        bottom = Math.max(top + minH, Math.min(1, bottom));
      }

      const next: CropRect = { x: left, y: top, w: right - left, h: bottom - top };
      setEditDraft((prev) => (prev ? { ...prev, crop: next } : prev));
    },
    [pointerToNorm]
  );

  const endCropDrag = useCallback((e: React.PointerEvent) => {
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    cropDragRef.current = null;
  }, []);

  const saveEdits = useCallback(async () => {
    if (!editPageId || !editDraft || !editBaseRef.current) return;
    try {
      const effective = editDraft.presetOverride ?? globalPreset;
      const previewBlob = await renderPreviewFromBase({
        baseBlob: editBaseRef.current.baseBlob,
        preset: effective,
        crop: editDraft.crop,
        rotation: editDraft.rotation,
      });
      const previewUrl = URL.createObjectURL(previewBlob);
      setPages((prev) =>
        prev.map((p) => {
          if (p.id !== editPageId) return p;
          URL.revokeObjectURL(p.previewUrl);
          return { ...p, previewBlob, previewUrl, edits: editDraft };
        })
      );
      closeEditor();
    } catch (err) {
      console.warn("save edits failed", err);
    }
  }, [closeEditor, editDraft, editPageId, globalPreset]);

  const splitEdits = useCallback(async () => {
    if (!editPageId || !editDraft || !editBaseRef.current) return;
    const leftCrop: CropRect = { ...editDraft.crop, w: editDraft.crop.w / 2 };
    const rightCrop: CropRect = {
      x: editDraft.crop.x + editDraft.crop.w / 2,
      y: editDraft.crop.y,
      w: editDraft.crop.w / 2,
      h: editDraft.crop.h,
    };
    try {
      const effective = editDraft.presetOverride ?? globalPreset;
      const [leftPreview, rightPreview] = await Promise.all([
        renderPreviewFromBase({
          baseBlob: editBaseRef.current.baseBlob,
          preset: effective,
          crop: leftCrop,
          rotation: editDraft.rotation,
        }),
        renderPreviewFromBase({
          baseBlob: editBaseRef.current.baseBlob,
          preset: effective,
          crop: rightCrop,
          rotation: editDraft.rotation,
        }),
      ]);

      const leftUrl = URL.createObjectURL(leftPreview);
      const rightUrl = URL.createObjectURL(rightPreview);

      setPages((prev) => {
        const idx = prev.findIndex((p) => p.id === editPageId);
        if (idx === -1) return prev;
        const original = prev[idx]!;
        const rightId = crypto.randomUUID();
        const rightBaseUrl = URL.createObjectURL(original.baseBlob);

        const leftPage: ScanPage = {
          ...original,
          previewBlob: leftPreview,
          previewUrl: leftUrl,
          edits: { ...editDraft, crop: leftCrop },
        };
        const rightPage: ScanPage = {
          ...original,
          id: rightId,
          baseUrl: rightBaseUrl,
          previewBlob: rightPreview,
          previewUrl: rightUrl,
          edits: { ...editDraft, crop: rightCrop },
        };
        URL.revokeObjectURL(original.previewUrl);
        const next = [...prev];
        next.splice(idx, 1, leftPage, rightPage);
        return next;
      });
      closeEditor();
    } catch (err) {
      console.warn("split failed", err);
    }
  }, [closeEditor, editDraft, editPageId, globalPreset]);

  // Review reordering via pointer drag (mobile-friendly).
  const reviewListRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const onDragStart = useCallback((id: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    reviewListRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = { id, pointerId: e.pointerId };
    setDraggingId(id);
  }, []);

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      const list = reviewListRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !list) return;
      const rect = list.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const rowH = 92;
      const idx = Math.max(0, Math.min(pages.length - 1, Math.floor(y / rowH)));
      movePage(drag.id, idx);
    },
    [movePage, pages.length]
  );

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDraggingId(null);
  }, []);

  // Category picker (simple hierarchy browse)
  const [browsePath, setBrowsePath] = useState<string[]>([]);
  const browseCurrentId = browsePath.length ? browsePath[browsePath.length - 1]! : null;
  const childrenOf = useCallback(
    (parentId: string | null) => categories.filter((c) => (c.parent_id || null) === parentId),
    [categories]
  );

  const labelForCategory = useCallback(
    (cat: CategoryRow) => categoryTranslations.get(cat.id) || cat.name,
    [categoryTranslations]
  );

  const openCategoryPicker = useCallback(() => {
    setBrowsePath(categoryId ? [categoryId] : []);
    setCategoryPickerOpen(true);
  }, [categoryId]);

  useEffect(() => {
    if (!categoryPickerOpen) return;
    // Ensure path is valid: if selected category has parents, we still allow choose-at-current-id UX.
    return;
  }, [categoryPickerOpen]);

  if (!open) return null;

  const pageCountChip = `${pages.length} ${pages.length === 1 ? t("scanPageSingular") : t("scanPagePlural")}`;

  return (
    <div
      className="fixed inset-0 z-[2000]"
      style={{
        background: "rgba(0,0,0,0.96)",
        backdropFilter: "blur(6px)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      onClick={closeAll}
    >
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()}>
        {screen === "scan" && (
          <div className="absolute inset-0">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 h-full w-full"
              aria-hidden
            />

            {/* Top bar */}
            <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-4 pt-4">
              <button
                type="button"
                onClick={closeAll}
                className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-sm text-white"
              >
                {t("cancel")}
              </button>
              <div className="flex items-center gap-2">
                {pages.length > 0 && (
                  <span className="rounded-full bg-black/45 px-3 py-1 text-xs text-white/90">
                    {pageCountChip}
                  </span>
                )}
                <button
                  type="button"
                  disabled={pages.length === 0}
                  onClick={beginReview}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  {t("scanDone", { count: pages.length })}
                </button>
              </div>
            </div>

            {/* Guidance chips */}
            <div className="absolute left-0 right-0 top-16 flex flex-col items-center gap-2 px-4">
              {scannerReady && !hasDetection && (
                <span className="rounded-full bg-black/55 px-3 py-1 text-xs text-white/90">
                  {t("scanAlignPage")}
                </span>
              )}
              {!stable && (
                <span className="rounded-full bg-black/55 px-3 py-1 text-xs text-white/90">
                  {t("scanHoldStill")}
                </span>
              )}
              {scanWarnings.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {scanWarnings.map((w) => (
                    <span
                      key={w.key}
                      className="rounded-full bg-black/55 px-3 py-1 text-xs text-white/90"
                    >
                      {w.text}
                    </span>
                  ))}
                </div>
              )}
              {analysis && analysis.meanLuma < SCAN_THRESHOLDS.meanLumaMin && torchSupported && !torchOn && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-black"
                >
                  {t("scanTorchSuggest")}
                </button>
              )}
            </div>

            {/* Bottom tray */}
            {pages.length > 0 && (
              <div
                className="absolute left-0 right-0"
                style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)" }}
              >
                <div className="mx-auto flex max-w-xl gap-2 overflow-x-auto px-4 pb-2">
                  {pages.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPageId(p.id)}
                      className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md border border-white/20"
                      style={{
                        outline: selectedPageId === p.id ? "2px solid rgba(255,255,255,0.85)" : "none",
                      }}
                    >
                      <Image
                        src={p.previewUrl}
                        alt={`scan-${idx + 1}`}
                        fill
                        sizes="56px"
                        style={{ objectFit: "cover" }}
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-[10px] text-white">
                        {idx + 1}
                      </div>
                      {p.quality.warning && (
                        <div className="absolute right-1 top-1 rounded-full bg-[rgba(226,76,75,0.95)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                          !
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {selectedPage && (
                  <div className="mx-auto flex max-w-xl items-center justify-between px-4">
                    <div className="text-xs text-white/70">
                      {pendingReplaceId === selectedPage.id ? t("scanRetakePending") : ""}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPendingReplaceId(selectedPage.id)}
                        className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-black"
                      >
                        {t("scanRetake")}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor(selectedPage.id)}
                        className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                      >
                        {t("scanCrop")}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePage(selectedPage.id)}
                        className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white"
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom controls */}
            <div
              className="absolute left-0 right-0 flex items-end justify-center px-6"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
            >
              <div className="flex w-full max-w-xl items-center justify-between">
                <button
                  type="button"
                  onClick={toggleTorch}
                  disabled={!torchSupported}
                  className="h-12 w-12 rounded-full border border-white/25 bg-black/35 text-sm text-white disabled:opacity-40"
                >
                  {t("scanTorch")}
                </button>

                <button
                  type="button"
                  onClick={() => void captureScan()}
                  disabled={scanBusy}
                  className="h-16 w-16 rounded-full border-2 border-white bg-white/90 text-black shadow-sm disabled:opacity-60"
                  aria-label={t("scanCapture")}
                />

                <button
                  type="button"
                  onClick={() => setAutoCapture((v) => !v)}
                  className="h-12 rounded-full border border-white/25 bg-black/35 px-4 text-sm text-white"
                >
                  {t("scanAuto")}{" "}
                  <span className="font-semibold">{autoCapture ? t("scanOn") : t("scanOff")}</span>
                </button>
              </div>
            </div>

            {scanError && (
              <div className="absolute inset-x-0 bottom-24 mx-auto max-w-xl px-4">
                <div className="rounded-xl bg-black/70 px-4 py-3 text-sm text-white">{scanError}</div>
              </div>
            )}

            {gateFailure && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-4">
                <div className="w-full max-w-sm rounded-2xl bg-white p-4 text-black">
                  <div className="mb-3 text-sm font-semibold">{reasonToCopy(gateFailure.assessment.primaryReason, t)}</div>
                  <div className="relative mb-4 h-64 w-full overflow-hidden rounded-xl border border-black/10 bg-black/5">
                    <Image
                      src={gateFailure.previewUrl}
                      alt="gate-failure"
                      fill
                      sizes="320px"
                      style={{ objectFit: "contain" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearGateFailure();
                    }}
                    className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                  >
                    {t("scanRetake")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {screen === "review" && (
          <div
            className="absolute inset-0 overflow-y-auto"
            style={{
              background: "linear-gradient(145deg, #f7f1e4 0%, #f3ebdd 100%)",
              padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 24px)",
            }}
          >
            <div className="mx-auto w-full max-w-xl">
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={backToScan}
                  className="rounded-full border border-black/15 bg-white px-3 py-2 text-sm text-black/75"
                >
                  {t("scanAddMore")}
                </button>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-black/5 px-3 py-1 text-xs text-black/70">{pageCountChip}</span>
                  <button
                    type="button"
                    disabled={!pages.length}
                    onClick={beginSave}
                    className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {t("scanSaveAsOne")}
                  </button>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between rounded-xl border border-black/10 bg-white/70 px-3 py-3">
                <div className="text-xs text-black/60">{t("scanEnhance")}</div>
                <div className="flex items-center gap-2">
                  {(["ocr", "grayscale", "color"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => void applyGlobalPreset(p)}
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        background: globalPreset === p ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.06)",
                        color: globalPreset === p ? "white" : "rgba(0,0,0,0.7)",
                      }}
                    >
                      {p === "ocr" ? t("scanPresetOcr") : p === "grayscale" ? t("scanPresetGray") : t("scanPresetColor")}
                    </button>
                  ))}
                </div>
              </div>

              <div
                ref={reviewListRef}
                className="flex flex-col gap-2"
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
              >
                {pages.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/80 p-2"
                    style={{ height: 92, opacity: draggingId === p.id ? 0.75 : 1 }}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => onDragStart(p.id, e)}
                      className="h-10 w-10 rounded-lg border border-black/10 bg-black/5 text-sm text-black/60"
                      aria-label={t("scanReorder")}
                      style={{ touchAction: "none" }}
                    >
                      ☰
                    </button>
                    <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md border border-black/10 bg-black/5">
                      <Image src={p.previewUrl} alt={`review-${idx + 1}`} fill sizes="48px" style={{ objectFit: "cover" }} />
                      <div className="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-[10px] text-white">
                        {idx + 1}
                      </div>
                      {p.quality.warning && (
                        <div className="absolute right-1 top-1 rounded-full bg-[rgba(226,76,75,0.95)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                          !
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-black/80">{t("scanPageLabel", { n: idx + 1 })}</div>
                      <div className="text-xs text-black/55">
                        {p.quality.warning ? t("scanQualityWarn") : t("scanQualityOk")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPageId(p.id);
                          setPendingReplaceId(p.id);
                          setScreen("scan");
                        }}
                        className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-black/70"
                      >
                        {t("scanRetake")}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditor(p.id)}
                        className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-black/70"
                      >
                        {t("scanCrop")}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePage(p.id)}
                        className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-black/70"
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {scanError && <div className="mt-4 rounded-xl bg-white/80 p-3 text-sm text-black/70">{scanError}</div>}
            </div>
          </div>
        )}

        {screen === "save" && (
          <div
            className="absolute inset-0 overflow-y-auto"
            style={{
              background: "linear-gradient(145deg, #f7f1e4 0%, #f3ebdd 100%)",
              padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 24px)",
            }}
          >
            <div className="mx-auto w-full max-w-xl">
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setScreen("review")}
                  className="rounded-full border border-black/15 bg-white px-3 py-2 text-sm text-black/75"
                >
                  {t("back")}
                </button>
                <span className="rounded-full bg-black/5 px-3 py-1 text-xs text-black/70">{pageCountChip}</span>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white/80 p-4">
                <div className="mb-3 text-sm font-semibold text-black/80">{t("scanSaveTitle")}</div>
                <input
                  className="pit-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaultTitleFor(lang)}
                />

                <div className="mt-4 mb-2 text-sm font-semibold text-black/80">{t("selectFolder")}</div>
                <button
                  type="button"
                  onClick={openCategoryPicker}
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-left text-sm text-black/80"
                >
                  {categoryLabel}
                </button>

                <button
                  type="button"
                  disabled={finalizing}
                  onClick={() => void finalizeUpload()}
                  className="mt-5 w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {finalizing ? t("uploadProcessing") : t("scanSaveAndProcess")}
                </button>
              </div>
            </div>
          </div>
        )}

        {editPageId && editDraft && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(0,0,0,0.65)" }}
            onClick={closeEditor}
          >
            <div
              className="w-full max-w-lg rounded-2xl border border-black/10 bg-white p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-sm text-black/70"
                >
                  {t("cancel")}
                </button>
                <div className="text-sm font-semibold text-black/80">{t("scanEditPage")}</div>
                <button
                  type="button"
                  onClick={() => void saveEdits()}
                  className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white"
                >
                  {t("scanApply")}
                </button>
              </div>

              <div
                ref={editContainerRef}
                className="relative w-full overflow-hidden rounded-2xl border border-black/10 bg-black/5"
                style={{ aspectRatio: editorAspect, touchAction: "none" }}
                onPointerMove={onCropMove}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
              >
                {editDisplayUrl ? (
                  <Image
                    src={editDisplayUrl}
                    alt="edit-page"
                    fill
                    sizes="520px"
                    style={{ objectFit: "fill" }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-black/60">
                    {t("loading")}
                  </div>
                )}

                <div
                  className="absolute border-2 border-[rgba(226,76,75,0.95)]"
                  style={{
                    left: `${(editDraft.crop.x ?? 0) * 100}%`,
                    top: `${(editDraft.crop.y ?? 0) * 100}%`,
                    width: `${(editDraft.crop.w ?? 1) * 100}%`,
                    height: `${(editDraft.crop.h ?? 1) * 100}%`,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                    borderRadius: "10px",
                    cursor: "move",
                  }}
                  onPointerDown={(e) => startCropDrag("move", e)}
                  role="presentation"
                >
                  {([
                    { key: "nw", style: { left: -10, top: -10 } },
                    { key: "ne", style: { right: -10, top: -10 } },
                    { key: "sw", style: { left: -10, bottom: -10 } },
                    { key: "se", style: { right: -10, bottom: -10 } },
                  ] as const).map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      onPointerDown={(e) => startCropDrag(h.key, e)}
                      className="absolute h-6 w-6 rounded-full border border-white/70 bg-white/90 shadow-sm"
                      style={h.style as React.CSSProperties}
                      aria-label={t("scanCropHandle")}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEditDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              rotation: rotate90(prev.rotation, "ccw"),
                              crop: rotateCropRect(prev.crop, "ccw"),
                            }
                          : prev
                      )
                    }
                    className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-sm text-black/70"
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              rotation: rotate90(prev.rotation, "cw"),
                              crop: rotateCropRect(prev.crop, "cw"),
                            }
                          : prev
                      )
                    }
                    className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-sm text-black/70"
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditDraft((prev) => (prev ? { ...prev, crop: { x: 0, y: 0, w: 1, h: 1 } } : prev))
                    }
                    className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-sm text-black/70"
                  >
                    {t("scanReset")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void splitEdits()}
                  className="rounded-full border border-black/10 bg-black/5 px-3 py-2 text-sm text-black/70"
                >
                  {t("scanSplit")}
                </button>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold text-black/60">{t("scanEnhanceThisPage")}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditDraft((prev) => (prev ? { ...prev, presetOverride: null } : prev))}
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      background: editDraft.presetOverride === null ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.06)",
                      color: editDraft.presetOverride === null ? "white" : "rgba(0,0,0,0.7)",
                    }}
                  >
                    {t("scanPresetAll")}
                  </button>
                  {(["ocr", "grayscale", "color"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditDraft((prev) => (prev ? { ...prev, presetOverride: p } : prev))}
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        background: editDraft.presetOverride === p ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.06)",
                        color: editDraft.presetOverride === p ? "white" : "rgba(0,0,0,0.7)",
                      }}
                    >
                      {p === "ocr" ? t("scanPresetOcr") : p === "grayscale" ? t("scanPresetGray") : t("scanPresetColor")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {categoryPickerOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(245,240,232,0.55)" }}
            onClick={() => setCategoryPickerOpen(false)}
          >
            <div
              className="w-full max-w-lg pit-radius-xl pit-shadow-2 border border-[rgba(0,0,0,0.12)]"
              style={{
                minHeight: "420px",
                maxHeight: "70vh",
                background: "linear-gradient(145deg, #f7f1e4 0%, #f3ebdd 100%)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-center pb-2">
                <span
                  style={{
                    width: "56px",
                    height: "5px",
                    borderRadius: "999px",
                    background: "rgba(0,0,0,0.2)",
                    display: "inline-block",
                  }}
                />
              </div>
              <div className="mb-3 px-1 flex items-center justify-between gap-3" style={{ minHeight: "44px" }}>
                <div className="flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    aria-label={t("back")}
                    onClick={() => setBrowsePath((p) => p.slice(0, -1))}
                    disabled={browsePath.length === 0}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "999px",
                      border: "1px solid rgba(0,0,0,0.18)",
                      background: "rgba(247,243,236,0.9)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: browsePath.length === 0 ? "default" : "pointer",
                      fontSize: "16px",
                      opacity: browsePath.length === 0 ? 0.4 : 1,
                    }}
                  >
                    ←
                  </button>
                </div>
                <div className="flex items-center">
                  <button
                    type="button"
                    aria-label={t("chooseHere")}
                    onClick={() => {
                      setCategoryId(browseCurrentId);
                      setCategoryPickerOpen(false);
                    }}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "999px",
                      border: "1px solid rgba(0,0,0,0.18)",
                      background: "rgba(247,243,236,0.9)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      fontSize: "16px",
                      color: "rgba(20,20,20,0.9)",
                      boxShadow: "0 3px 8px rgba(0,0,0,0.12)",
                    }}
                  >
                    ✓
                  </button>
                </div>
              </div>

              <div className="mb-3 px-1 text-[15px] text-[rgba(0,0,0,0.7)] leading-tight">
                {browsePath.length === 0
                  ? t("allFolders")
                  : (() => {
                      if (!browseCurrentId) return t("allFolders");
                      const match = categories.find((c) => c.id === browseCurrentId);
                      if (!match) return t("selectFolder");
                      return labelForCategory(match);
                    })()}
              </div>

              <div className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1 flex-1">
                {childrenOf(browseCurrentId).map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    className="flex items-center justify-between rounded-lg border border-[rgba(0,0,0,0.12)] bg-[rgba(247,243,236,0.9)] px-6 py-3 text-left transition hover:border-[rgba(0,0,0,0.25)]"
                    onClick={() => {
                      setBrowsePath((p) => [...p, child.id]);
                    }}
                  >
                    <span className="text-sm text-[rgba(0,0,0,0.8)]">{labelForCategory(child)}</span>
                    <span className="text-xs text-[rgba(0,0,0,0.5)]">→</span>
                  </button>
                ))}
                {childrenOf(browseCurrentId).length === 0 && (
                  <div className="pit-muted text-sm px-2 py-6 text-center">{t("noSubfolders")}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
