import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const normalizeCategorySegment = (raw: string | null | undefined): string | null => {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned || null;
};

const normalizeCategoryPath = (path: string[] | null | undefined): string[] => {
  if (!path || !Array.isArray(path)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const segment of path) {
    const normalized = normalizeCategorySegment(segment);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(normalized);
  }
  return cleaned.slice(0, 6);
};

async function ensureCategoryPath(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  path: string[]
): Promise<string | null> {
  const { data: existing, error } = await supabase
    .from("categories")
    .select("id, name, parent_id")
    .eq("user_id", userId);
  if (error) throw error;
  const rows: { id: string; name: string; parent_id: string | null }[] = Array.isArray(existing) ? existing : [];

  let parentId: string | null = null;
  let lastId: string | null = null;
  for (const segment of path) {
    const match = rows.find(
      (c) => c.parent_id === parentId && c.name.trim().toLowerCase() === segment.toLowerCase()
    );
    if (match) {
      parentId = match.id;
      lastId = match.id;
      continue;
    }
    const insert = await supabase
      .from("categories")
      .insert({ user_id: userId, name: segment, parent_id: parentId })
      .select("id")
      .single();
    if (insert.error) throw insert.error;
    if (insert.data?.id) {
      const createdId = insert.data.id as string;
      rows.push({ id: createdId, name: segment, parent_id: parentId });
      parentId = createdId;
      lastId = createdId;
    }
  }
  return lastId;
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const body = await request.json().catch(() => null);
    const docId: string | undefined = body?.docId;
    const caseId: string | undefined = body?.caseId;
    const categoryPathRaw: string[] | null | undefined = body?.categoryPath;

    if (!docId || typeof docId !== "string") {
      return NextResponse.json({ error: "docId is required" }, { status: 400 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, user_id, category_id, case_id")
      .eq("id", docId)
      .single();
    if (docError) throw docError;
    if (!doc || doc.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, string | null> = {};

    if (Array.isArray(categoryPathRaw)) {
      const normalizedPath = normalizeCategoryPath(categoryPathRaw);
      if (normalizedPath.length) {
        const categoryId = await ensureCategoryPath(supabase, user.id, normalizedPath);
        if (categoryId) {
          updates.category_id = categoryId;
        }
      } else {
        updates.category_id = null;
      }
    }

    if (caseId !== undefined) {
      if (caseId === null || caseId === "__NONE__") {
        updates.case_id = null;
      } else {
        updates.case_id = caseId;
      }
    }

    if (Object.keys(updates).length) {
      const { error: updateError } = await supabase.from("documents").update(updates).eq("id", docId);
      if (updateError) throw updateError;
    }

    if (caseId !== undefined) {
      if (caseId && caseId !== "__NONE__") {
        try {
          await supabase
            .from("case_documents")
            .upsert({ case_id: caseId, document_id: docId }, { onConflict: "case_id,document_id" });
        } catch (err) {
          console.warn("case_documents upsert skipped", err);
        }
        try {
          await supabase.from("case_events").insert({
            case_id: caseId,
            user_id: user.id,
            kind: "doc_moved",
            payload: { document_id: docId },
          });
        } catch (err) {
          console.warn("case_event insert skipped", err);
        }
      } else {
        try {
          await supabase.from("case_documents").delete().eq("document_id", docId);
        } catch (err) {
          console.warn("case_documents delete skipped", err);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to restructure document" },
      { status: 500 }
    );
  }
}
