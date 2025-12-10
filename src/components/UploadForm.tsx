"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import uploadIcon from "../../images/upload-unselected.png";
import copyIcon from "../../images/copy.png";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useLanguage } from "@/lib/language";

type Props = {
  onUploaded: () => void;
  processing?: boolean;
};

const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25MB hard cap on incoming file to protect client
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // target cap for upload after normalization
const MAX_IMAGE_DIMENSION = 1600; // px; resize larger images to keep payload reasonable
const IMAGE_QUALITY = 0.75;
const MAX_FILES_AT_ONCE = 10;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100MB total per batch to avoid overload

export default function UploadForm({ onUploaded, processing = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pasteActive, setPasteActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pasteTargetRef = useRef<HTMLTextAreaElement | null>(null);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const [pendingProcessing, setPendingProcessing] = useState(false);
  const { lang, t } = useLanguage();

  const showSpinner = loading || processing || pendingProcessing;

  useEffect(() => {
    if (processing) {
      setPendingProcessing(false);
      return;
    }
    if (!loading && pendingProcessing) {
      const id = setTimeout(() => setPendingProcessing(false), 1200);
      return () => clearTimeout(id);
    }
    return;
  }, [processing, loading, pendingProcessing]);

  const buildError = (message: string) => {
    alert(message);
    return null;
  };

  const normalizeImage = async (file: File): Promise<File | null> => {
    if (!file.type.startsWith("image/")) return file;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: file.type });
      const imageBitmap = await createImageBitmap(blob);

      const needsResize =
        imageBitmap.width > MAX_IMAGE_DIMENSION || imageBitmap.height > MAX_IMAGE_DIMENSION;

      // Only recompress if size is big or dimensions are large
      if (!needsResize && file.size <= MAX_OUTPUT_BYTES) {
        return file;
      }

      const scale = Math.min(
        1,
        MAX_IMAGE_DIMENSION / Math.max(imageBitmap.width, imageBitmap.height)
      );
      const targetWidth = Math.max(1, Math.round(imageBitmap.width * scale));
      const targetHeight = Math.max(1, Math.round(imageBitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return buildError("Failed to prepare image context.");

      ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
      const normalizedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (b) => resolve(b),
          "image/jpeg",
          IMAGE_QUALITY
        );
      });
      if (!normalizedBlob) return buildError("Failed to normalize image.");

      return new File([normalizedBlob], file.name.replace(/\.(png|jpe?g)$/i, ".jpg"), {
        type: normalizedBlob.type,
      });
    } catch (err) {
      console.error("normalizeImage failed", err);
      return buildError("Could not process image. Please try a smaller file.");
    }
  };

  const textToPdf = async (text: string, filename: string) => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]); // Letter-ish
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;
    const margin = 50;
    const maxWidth = page.getWidth() - margin * 2;

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";
    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);

    let y = page.getHeight() - margin;
    lines.forEach((line) => {
      if (y < margin + fontSize) {
        const newPage = doc.addPage([612, 792]);
        y = newPage.getHeight() - margin;
      }
      const currentPage = doc.getPage(doc.getPageCount() - 1);
      currentPage.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
      y -= fontSize + 4;
    });

    const rawBytes = await doc.save();
    // Ensure we end up with a Uint8Array backed by an ArrayBuffer (not SharedArrayBuffer)
    const bytes =
      rawBytes instanceof Uint8Array ? new Uint8Array(rawBytes) : new Uint8Array(rawBytes as ArrayBuffer);
    return new File([bytes], filename, { type: "application/pdf" });
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLElement>) => {
    if (loading) return;
    const items = event.clipboardData?.items;
    if (!items || !items.length) return;

    const fileItem = Array.from(items).find(
      (i) => i.kind === "file" && i.type.startsWith("image/")
    );
    if (fileItem) {
      event.preventDefault();
      const file = fileItem.getAsFile();
      if (file) {
        await startUpload(file);
      }
      return;
    }

    const text = event.clipboardData.getData("text");
    if (text && text.trim().length) {
      event.preventDefault();
      const pdf = await textToPdf(text, `pasted-text-${Date.now()}.pdf`);
      await startUpload(pdf);
    }
  };

  const startUpload = useCallback(
    async (file: File | null) => {
      if (!file || loading) return;
      const allowedTypes = [
        "application/pdf",
        "text/plain",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
      ];
      const isAllowedType =
        allowedTypes.includes(file.type) ||
        /\.(pdf|txt|doc|docx|png|jpe?g)$/i.test(file.name || "");
      if (!isAllowedType) {
        alert(t("unsupportedType"));
        return;
      }

      if (file.size > MAX_INPUT_BYTES) {
        alert(t("fileTooLarge"));
        return;
      }

      setPendingProcessing(true);
      setLoading(true);
      try {
        let fileToUpload = file;
        if (file.type.startsWith("image/")) {
          const normalized = await normalizeImage(file);
          if (!normalized) {
            setLoading(false);
            setDragging(false);
            return;
          }
          if (normalized.size > MAX_OUTPUT_BYTES) {
            alert(t("imageTooLarge"));
            setLoading(false);
            setDragging(false);
            return;
          }
          fileToUpload = normalized;
        }

        const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error(t("loginRequired"));

        const path = `${user.id}/${crypto.randomUUID()}-${fileToUpload.name}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, fileToUpload, {
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) throw uploadError;

        const { data: inserted, error: insertError } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            title: fileToUpload.name,
            storage_path: path,
            status: "uploaded",
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        fetch("/api/process-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: inserted.id, preferredLanguage: lang }),
        }).catch((err) => console.error("process-document trigger failed", err));

        onUploaded();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setLoading(false);
        setDragging(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [loading, onUploaded, lang, t]
  );

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    if (list.length > MAX_FILES_AT_ONCE) {
      alert(t("maxFiles", { count: MAX_FILES_AT_ONCE }));
      return;
    }
    const totalBytes = list.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      alert(t("batchTooLarge"));
      return;
    }
    for (const file of list) {
      await startUpload(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = event.dataTransfer.files;
    handleFiles(files);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    handleFiles(files);
    // reset input to allow re-selecting same files
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
  };

  const focusPasteTarget = () => {
    setPasteActive(true);
    setPasteHint("Press Cmd/Ctrl+V now.");
    requestAnimationFrame(() => {
      pasteTargetRef.current?.focus();
    });
  };

  const handlePasteButtonClick = async () => {
    try {
      if ("clipboard" in navigator && (navigator as any).clipboard.read) {
        const items = await (navigator as any).clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t: string) => t.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            const file = new File([blob], `pasted-screenshot-${Date.now()}.png`, {
              type: blob.type,
            });
            await startUpload(file);
            return;
          }
        }
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length) {
          const pdf = await textToPdf(text, `pasted-text-${Date.now()}.pdf`);
          await startUpload(pdf);
          return;
        }
      }
    } catch (err) {
      console.warn("Direct clipboard read failed, falling back to manual paste", err);
    }
    // Fallback to manual paste flow
    focusPasteTarget();
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <div
          onClick={handleClick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
        className="relative flex cursor-pointer items-center justify-center rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.01)] px-4 py-10 transition"
        style={{
          borderColor: dragging ? "rgba(226,76,75,0.5)" : "rgba(255,255,255,0.08)",
          boxShadow: dragging
            ? "0 0 0 2px rgba(226,76,75,0.25)"
            : "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePasteButtonClick();
          }}
          className="pit-cta pit-cta--secondary absolute right-3 top-3 flex flex-col items-center gap-1"
          style={{
            padding: "12px",
            borderRadius: "16px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 72,
            height: 72,
            boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
          }}
          aria-label="Paste copied text or screenshot"
        >
          <Image
            src={copyIcon}
            alt="Paste"
            width={28}
            height={28}
            style={{ opacity: 0.35 }}
          />
          <span
            style={{
              fontSize: "9px",
              textTransform: "none",
              letterSpacing: "0.02em",
              color: "rgba(0,0,0,0.5)",
            }}
          >
            {t("paste")}
          </span>
        </button>
        <div className="flex flex-col items-center gap-2 text-center">
          <Image
            src={uploadIcon}
            alt="Upload"
            width={40}
            height={40}
            style={{ opacity: 0.35 }}
            priority
          />
          <span className="pit-title" style={{ fontSize: "16px" }}>
            {loading
              ? t("uploadUploading")
              : processing || pendingProcessing
              ? t("uploadProcessing")
              : t("uploadDrop")}
          </span>
          {showSpinner && (
            <span
              aria-hidden
              className="upload-spinner"
              style={{
                display: "inline-flex",
                width: 24,
                height: 24,
                borderRadius: "999px",
                border: "2px solid rgba(0,0,0,0.08)",
                borderTopColor: "rgba(0,0,0,0.35)",
                animation: "spin 0.9s linear infinite",
              }}
            />
          )}
          <span className="pit-subtitle">{t("uploadHint")}</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.doc,.docx,.png,.jpg,.jpeg"
          multiple
          className="hidden"
          onChange={handleInputChange}
        />
        <textarea
          ref={pasteTargetRef}
          tabIndex={-1}
          onPaste={handlePaste}
          onBlur={() => setPasteActive(false)}
          style={{
            position: "absolute",
            opacity: 0,
            width: "1px",
            height: "1px",
            left: "-9999px",
          }}
          aria-hidden="true"
        />
      </div>
      <style jsx>{`
        @keyframes upload-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .upload-spinner {
          animation: upload-spin 0.9s linear infinite;
        }
      `}</style>
    </form>
  );
}
