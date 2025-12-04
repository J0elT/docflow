"use client";

import Image from "next/image";
import { FormEvent, useCallback, useRef, useState } from "react";
import uploadIcon from "../../images/upload-unselected.png";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Props = {
  onUploaded: () => void;
};

export default function UploadForm({ onUploaded }: Props) {
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startUpload = useCallback(
    async (file: File | null) => {
      if (!file || loading) return;
      setLoading(true);
      try {
        const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("You must be logged in to upload.");

        const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError) throw uploadError;

        const { data: inserted, error: insertError } = await supabase
          .from("documents")
          .insert({
            user_id: user.id,
            title: file.name,
            storage_path: path,
            status: "uploaded",
          })
          .select("id")
          .single();
        if (insertError) throw insertError;

        fetch("/api/process-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: inserted.id }),
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
    [loading, onUploaded]
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    startUpload(file);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    startUpload(file);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <label className="pit-label">Upload a document</label>
      <div
        onClick={handleClick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className="flex cursor-pointer items-center justify-center rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.01)] px-4 py-10 transition"
        style={{
          borderColor: dragging ? "rgba(226,76,75,0.5)" : "rgba(255,255,255,0.08)",
          boxShadow: dragging
            ? "0 0 0 2px rgba(226,76,75,0.25)"
            : "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
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
            {loading ? "Uploading..." : "Drop file here or click to choose"}
          </span>
          <span className="pit-subtitle">
            PDF, TXT, DOC, or DOCX. Upload starts immediately.
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.doc,.docx"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    </form>
  );
}
