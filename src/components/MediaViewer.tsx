"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

type MediaViewerProps = {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  type: "image" | "pdf";
  filename?: string | null;
  downloadUrl?: string | null;
  initialPage?: number;
};

type Point = { x: number; y: number };
type Size = { w: number; h: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

function useIdleToggle(active: boolean, delay = 1500) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const bump = () => {
    if (!active) return;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), delay);
  };

  useEffect(() => {
    if (!active) return;
    bump();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, delay]);

  return { visible, bump, show: () => setVisible(true) };
}

export function MediaViewer({
  isOpen,
  onClose,
  src,
  type,
  filename,
  downloadUrl,
}: MediaViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ point: Point; offset: Point } | null>(null);
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);
  const { visible: chromeVisible, bump } = useIdleToggle(isOpen, 1600);
  const [contentSize, setContentSize] = useState<Size>({ w: 1200, h: 800 });

  useBodyScrollLock(isOpen);

  const filenameDisplay = useMemo(() => {
    if (!filename) return "";
    if (filename.length <= 40) return filename;
    const start = filename.slice(0, 20);
    const end = filename.slice(-12);
    return `${start}…${end}`;
  }, [filename]);

  const actualScale = useMemo(() => baseScale * zoom, [baseScale, zoom]);
  const zoomLabel = useMemo(() => {
    if (Math.abs(zoom - 1) < 0.02) return "Fit";
    return `${Math.round(zoom * 100)}%`;
  }, [zoom]);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!downloadUrl) return;
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const fallback = downloadUrl.split("/").pop()?.split("?")[0] || "file";
      const name = filename && filename.trim().length ? filename : fallback;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("download failed", err);
    }
  };

  const setZoomClamped = (next: number) => {
    const clamped = clamp(next, 0.5, 8);
    setZoom(clamped);
  };

  useEffect(() => {
    if (!isOpen) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [isOpen, src]);

  const computeFitScale = (size: Size) => {
    const container = containerRef.current;
    if (!container) return 1;
    const cw = container.clientWidth * 0.92 || 1;
    const ch = container.clientHeight * 0.92 || 1;
    const iw = size.w || 1;
    const ih = size.h || 1;
    const scale = Math.min(cw / iw, ch / ih);
    return scale || 1;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    setZoomClamped(zoom + delta);
    bump();
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    bump();
    setDragging(true);
    const rect = (contentRef.current || containerRef.current)?.getBoundingClientRect();
    const px = e.clientX - (rect?.left || 0);
    const py = e.clientY - (rect?.top || 0);
    dragStart.current = { point: { x: px, y: py }, offset };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const rect = (contentRef.current || containerRef.current)?.getBoundingClientRect();
    const px = e.clientX - (rect?.left || 0);
    const py = e.clientY - (rect?.top || 0);
    if (!dragStart.current) return;
    const dx = px - dragStart.current.point.x;
    const dy = py - dragStart.current.point.y;
    setOffset({ x: dragStart.current.offset.x + dx, y: dragStart.current.offset.y + dy });
  };

  const handlePointerUp = () => {
    setDragging(false);
    dragStart.current = null;
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const next = zoom > 1.01 ? 1 : 1.5;
    setZoomClamped(next);
    if (next === 1) setOffset({ x: 0, y: 0 });
    bump();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    bump();
    if (e.touches.length === 2) {
      const first = e.touches.item(0);
      const second = e.touches.item(1);
      if (!first || !second) {
        pinchStart.current = null;
        return;
      }
      const dx = first.clientX - second.clientX;
      const dy = first.clientY - second.clientY;
      pinchStart.current = { distance: Math.hypot(dx, dy), zoom };
    } else {
      pinchStart.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pinchStart.current && e.touches.length === 2) {
      e.preventDefault();
      const first = e.touches.item(0);
      const second = e.touches.item(1);
      if (!first || !second) return;
      const dx = first.clientX - second.clientX;
      const dy = first.clientY - second.clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStart.current.distance;
      setZoomClamped(pinchStart.current.zoom * ratio);
    }
  };

  const handleKey = (e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoomClamped(zoom + 0.15);
    }
    if (e.key === "-") {
      e.preventDefault();
      setZoomClamped(zoom - 0.15);
    }
    if (e.key === "0") {
      e.preventDefault();
      setZoomClamped(1);
      setOffset({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => handleKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, zoom, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    const applyFit = (size: Size) => {
      const fit = computeFitScale(size);
      setContentSize({ w: size.w * fit, h: size.h * fit });
      setBaseScale(1);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };

    if (type === "image") {
      const img = imgRef.current;
      if (!img) return;
      if (img.complete) {
        applyFit({ w: img.naturalWidth || 1200, h: img.naturalHeight || 800 });
      } else {
        const onLoad = () => applyFit({ w: img.naturalWidth || 1200, h: img.naturalHeight || 800 });
        img.addEventListener("load", onLoad);
        return () => img.removeEventListener("load", onLoad);
      }
    } else {
      const cw = container?.clientWidth || 1200;
      const ch = container?.clientHeight || 900;
      // Assume portrait PDF (A4-ish) if we don't know dimensions.
      let w = cw * 0.82;
      let h = w * 1.4;
      if (h > ch * 0.9) {
        h = ch * 0.9;
        w = h / 1.4;
      }
      applyFit({ w, h });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, src, type]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] bg-[rgba(10,10,10,0.9)] backdrop-blur-sm text-white"
      onClick={onClose}
      onMouseMove={bump}
      onTouchStart={bump}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        ref={containerRef}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <div
          className="absolute top-3 left-0 right-0 z-[70] flex items-center justify-between px-4 text-sm"
          style={{
            opacity: 1,
            pointerEvents: "auto",
            transition: "opacity 180ms var(--pit-ease-out)",
            paddingTop: 8,
            paddingBottom: 8,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            aria-label="Close"
            className="h-11 w-11 rounded-full bg-[rgba(247,243,236,0.18)] text-[18px] leading-none pit-shadow-2 backdrop-blur"
            style={{ color: "rgba(247,243,236,0.95)" }}
            onClick={onClose}
          >
            ←
          </button>
          <div
            className="flex items-center gap-2 rounded-full bg-[rgba(247,243,236,0.18)] px-3 py-2 pit-shadow-2 backdrop-blur"
            style={{ color: "rgba(247,243,236,0.95)" }}
          >
            <button
              aria-label="Zoom out"
              className="h-11 w-11 rounded-full text-lg leading-none hover:bg-[rgba(255,255,255,0.06)]"
              style={{ color: "inherit" }}
              onClick={() => setZoomClamped(zoom - 0.15)}
            >
              –
            </button>
            <button
              aria-label="Reset / Fit"
              className="min-w-[70px] rounded-full px-3 py-2 text-[13px] font-medium hover:bg-[rgba(255,255,255,0.06)]"
              style={{ color: "inherit" }}
              onClick={() => {
                setZoomClamped(1);
                setOffset({ x: 0, y: 0 });
              }}
            >
              {zoomLabel}
            </button>
            <button
              aria-label="Zoom in"
              className="h-11 w-11 rounded-full text-lg leading-none hover:bg-[rgba(255,255,255,0.06)]"
              style={{ color: "inherit" }}
              onClick={() => setZoomClamped(zoom + 0.15)}
            >
              +
            </button>
          </div>
          {downloadUrl ? (
            <button
              type="button"
              onClick={handleDownload}
              aria-label="Download"
              className="h-11 w-11 rounded-full bg-[rgba(247,243,236,0.18)] flex items-center justify-center pit-shadow-2 backdrop-blur"
            >
              <Image
                src={require("../../images/download.png")}
                alt="Download"
                width={18}
                height={18}
                style={{ filter: "invert(95%) sepia(2%) saturate(150%) hue-rotate(10deg) brightness(105%)" }}
              />
            </button>
          ) : (
            <span className="h-11 w-11" />
          )}
        </div>
        <div
          ref={contentRef}
          className="relative flex h-full w-full items-center justify-center select-none"
          style={{
            cursor: dragging ? "grabbing" : zoom > 1.01 ? "grab" : "default",
          }}
        >
          <div
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${actualScale})`,
              transformOrigin: "center center",
              transition: dragging ? "none" : "transform 120ms ease-out",
              width: contentSize.w,
              height: contentSize.h,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              borderRadius: "14px",
              overflow: "hidden",
              background: type === "image" ? "#0b0b0b" : "#111",
            }}
          >
            {type === "image" ? (
              <img
                ref={imgRef}
                src={src}
                alt={filename ?? "Media"}
                draggable={false}
                className="block h-full w-full object-contain"
              />
            ) : (
              <iframe
                src={src}
                title={filename ?? "Document"}
                className="block h-full w-full bg-white"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
