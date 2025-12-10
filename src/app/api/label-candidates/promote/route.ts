import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type CandidateRow = {
  id: string;
  user_id: string;
  type: "sender_type" | "topic" | "domain_profile" | "case";
  label_text: string;
  raw_variants: unknown;
};

const tableForType = (type: CandidateRow["type"]) => {
  switch (type) {
    case "sender_type":
      return "taxonomy_sender_types";
    case "topic":
      return "taxonomy_topics";
    case "domain_profile":
      return "taxonomy_domain_profiles";
    default:
      return null;
  }
};

async function findOrInsertTaxonomy(
  supabase: ReturnType<typeof supabaseAdmin>,
  table: string,
  label: string,
  synonyms: string[]
): Promise<string | null> {
  const normalized = label.trim();
  const lower = normalized.toLowerCase();
  const { data: existing, error } = await supabase
    .from(table)
    .select("id, canonical_label, synonyms")
    .or(`lower(canonical_label).eq.${lower},synonyms.cs.{${normalized}}`)
    .limit(5);
  if (error) throw error;
  const rows: { id: string; canonical_label?: string | null; synonyms?: string[] | null }[] = Array.isArray(existing)
    ? existing
    : [];
  const hit =
    rows.find((r) => (r.canonical_label ?? "").trim().toLowerCase() === lower) ??
    rows.find((r) => (r.synonyms ?? []).some((s) => (s ?? "").trim().toLowerCase() === lower));
  if (hit?.id) return hit.id;

  const insert = await supabase
    .from(table)
    .insert({
      canonical_label: normalized,
      synonyms,
      source: "human",
    })
    .select("id")
    .single();
  if (insert.error) throw insert.error;
  return (insert.data as { id?: string } | null)?.id ?? null;
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const body = await request.json().catch(() => null);
    const candidateId: string | undefined = body?.candidateId;
    if (!candidateId || typeof candidateId !== "string") {
      return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const { data: cand, error: candErr } = await supabase
      .from("label_candidates")
      .select("id, user_id, type, label_text, raw_variants")
      .eq("id", candidateId)
      .single<CandidateRow>();
    if (candErr) throw candErr;
    if (!cand || cand.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (cand.type === "case") {
      return NextResponse.json({ error: "Case promotion not supported yet" }, { status: 400 });
    }
    const table = tableForType(cand.type);
    if (!table) {
      return NextResponse.json({ error: "Unsupported candidate type" }, { status: 400 });
    }

    const rawVars = Array.isArray(cand.raw_variants) ? cand.raw_variants : [];
    const synonyms = rawVars
      .filter((v) => typeof v === "string" && v.trim())
      .map((v: string) => v.trim())
      .slice(0, 6);

    const taxonomyId = await findOrInsertTaxonomy(supabase, table, cand.label_text, synonyms);

    // Remove candidate after promotion
    try {
      await supabase.from("label_candidates").delete().eq("id", cand.id);
    } catch (err) {
      console.warn("label_candidate delete skipped", err);
    }

    return NextResponse.json({ ok: true, taxonomyId });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to promote candidate" },
      { status: 500 }
    );
  }
}
