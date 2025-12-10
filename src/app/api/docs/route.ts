import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Query = {
  caseId?: string | null;
  categoryIds?: string[] | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
  tags?: string[] | null;
  referenceIds?: string[] | null;
  includeRaw?: boolean;
  includeDetails?: boolean;
};

const parseQuery = (request: Request): Query => {
  const url = new URL(request.url);
  const categoryIds = url.searchParams.getAll("categoryIds");
  const tags = url.searchParams.getAll("tag");
  const refIds = url.searchParams.getAll("ref");
  return {
    caseId: url.searchParams.get("caseId"),
    categoryIds: categoryIds.length ? categoryIds : null,
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    status: url.searchParams.get("status"),
    tags: tags.length ? tags.map((t) => t.trim()).filter(Boolean) : null,
    referenceIds: refIds.length ? refIds.map((r) => r.trim()).filter(Boolean) : null,
    includeRaw: url.searchParams.get("includeRaw") === "true",
    includeDetails: url.searchParams.get("includeDetails") === "true",
  };
};

export async function GET(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const query = parseQuery(request);

    const docsQuery = supabase
      .from("documents")
      .select(
        "id, title, status, created_at, storage_path, category_id, case_id, sender_type_id, topic_id, domain_profile_id, extra:extractions(content, created_at)"
      )
      .eq("user_id", user.id)
      .neq("status", "error")
      .order("created_at", { ascending: false });

    if (query.caseId) {
      if (query.caseId === "__NONE__") {
        docsQuery.is("case_id", null);
      } else {
        docsQuery.eq("case_id", query.caseId);
      }
    }
    if (query.categoryIds === null) {
      docsQuery.is("category_id", null);
    } else if (Array.isArray(query.categoryIds) && query.categoryIds.length > 0) {
      docsQuery.in("category_id", query.categoryIds);
    }
    if (query.status) {
      docsQuery.eq("status", query.status);
    }
    if (query.dateFrom) {
      docsQuery.gte("created_at", query.dateFrom);
    }
    if (query.dateTo) {
      docsQuery.lte("created_at", query.dateTo);
    }

    const { data, error } = await docsQuery;
    if (error) throw error;

    const mapped = (data ?? []).map((doc: any) => {
      const latest = Array.isArray(doc.extra)
        ? doc.extra.sort((a: any, b: any) => {
            const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
            return tb - ta;
          })[0]?.content ?? null
        : null;
      const keyFields = (latest?.key_fields ?? {}) as any;
      const refIdsObj = keyFields?.reference_ids && typeof keyFields.reference_ids === "object" ? keyFields.reference_ids : null;
      const refIds: string[] =
        refIdsObj && !Array.isArray(refIdsObj)
          ? Object.values(refIdsObj).filter((v): v is string => typeof v === "string" && !!v.trim())
          : [];
      return {
        id: doc.id,
        title: doc.title,
        status: doc.status,
        created_at: doc.created_at,
        storage_path: doc.storage_path ?? null,
        category_id: doc.category_id ?? null,
        case_id: doc.case_id ?? null,
        sender_type_id: doc.sender_type_id ?? null,
        topic_id: doc.topic_id ?? null,
        domain_profile_id: doc.domain_profile_id ?? null,
        amounts: latest?.amounts ?? null,
        deadlines: latest?.deadlines ?? null,
        actions_required: latest?.actions_required ?? null,
        main_summary: latest?.main_summary ?? latest?.summary ?? null,
        extra_details: query.includeDetails ? latest?.extra_details ?? [] : undefined,
        raw_text: query.includeRaw ? keyFields?.raw_text ?? null : undefined,
        tags: Array.isArray(latest?.tags) ? latest?.tags : undefined,
        case_labels: Array.isArray(keyFields?.case_labels) ? keyFields.case_labels : undefined,
        workflow_status:
          typeof keyFields?.workflow_status === "string" && keyFields.workflow_status.trim()
            ? keyFields.workflow_status.trim()
            : undefined,
        reference_ids: refIds,
      };
    });

    const filtered = mapped.filter((doc) => {
      if (query.tags && query.tags.length) {
        const docTags = Array.isArray(doc.tags) ? doc.tags.map((t) => t.toLowerCase()) : [];
        const needed = query.tags.map((t) => t.toLowerCase());
        if (!needed.every((tag) => docTags.includes(tag))) return false;
      }
      if (query.referenceIds && query.referenceIds.length) {
        const docRefs = Array.isArray(doc.reference_ids)
          ? doc.reference_ids.filter((r): r is string => typeof r === "string").map((r) => r.toLowerCase())
          : [];
        const neededRefs = query.referenceIds.map((r) => r.toLowerCase());
        const hasAny = neededRefs.some((r) => docRefs.includes(r));
        if (!hasAny) return false;
      }
      return true;
    });

    return NextResponse.json({ docs: filtered });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list docs" }, { status: 500 });
  }
}
