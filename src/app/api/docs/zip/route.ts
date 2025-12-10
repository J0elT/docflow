import JSZip from "jszip";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const sanitizeName = (value: string | null | undefined, fallback: string) => {
  if (!value || typeof value !== "string" || !value.trim()) return fallback;
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .slice(0, 120);
};

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const body = await request.json().catch(() => null);
    const docIds: string[] | null = Array.isArray(body?.docIds) ? body.docIds : null;
    if (!docIds || docIds.length === 0) {
      return NextResponse.json({ error: "docIds are required" }, { status: 400 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: docs, error } = await supabase
      .from("documents")
      .select("id, storage_path, title")
      .eq("user_id", user.id)
      .in("id", docIds);
    if (error) throw error;
    const paths = (docs ?? []).filter((d: any) => d?.storage_path);
    if (!paths.length) {
      return NextResponse.json({ error: "No documents found" }, { status: 404 });
    }

    const zip = new JSZip();

    for (const doc of paths) {
      try {
        const { data: fileData, error: downloadErr } = await supabase.storage
          .from("documents")
          .download(doc.storage_path);
        if (downloadErr || !fileData) {
          console.warn("download skipped", downloadErr);
          continue;
        }
        const arrayBuf = await fileData.arrayBuffer();
        const extMatch = doc.storage_path.includes(".")
          ? doc.storage_path.slice(doc.storage_path.lastIndexOf("."))
          : "";
        const base = sanitizeName(doc.title, `doc-${doc.id}`);
        const filename = `${base}${extMatch || ""}`;
        zip.file(filename, Buffer.from(arrayBuf));
      } catch (err) {
        console.warn("zip add failed", err);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const uint8 = new Uint8Array(zipBuffer);
    const zipBlob = new Blob([uint8]);
    return new NextResponse(zipBlob, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="documents.zip"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to bundle docs" }, { status: 500 });
  }
}
