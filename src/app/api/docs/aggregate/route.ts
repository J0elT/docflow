import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Query = {
  caseId?: string | null;
  categoryIds?: string[] | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
};

const parseQuery = (request: Request): Query => {
  const url = new URL(request.url);
  const categoryIds = url.searchParams.getAll("categoryIds");
  return {
    caseId: url.searchParams.get("caseId"),
    categoryIds: categoryIds.length ? categoryIds : null,
    dateFrom: url.searchParams.get("dateFrom"),
    dateTo: url.searchParams.get("dateTo"),
    status: url.searchParams.get("status"),
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
        "id, status, created_at, category_id, case_id, extra:extractions(content, created_at)"
      )
      .eq("user_id", user.id)
      .neq("status", "error");

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

    const totals: Record<string, number> = {};
    let docsCount = 0;
    (data ?? []).forEach((doc: any) => {
      docsCount += 1;
      const latest = Array.isArray(doc.extra)
        ? doc.extra.sort((a: any, b: any) => {
            const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
            return tb - ta;
          })[0]?.content ?? null
        : null;
      const amounts = Array.isArray(latest?.amounts) ? latest.amounts : [];
      amounts.forEach((a: any) => {
        if (typeof a?.value === "number") {
          const currency = typeof a?.currency === "string" && a.currency.trim() ? a.currency.trim() : "UNK";
          totals[currency] = (totals[currency] ?? 0) + a.value;
        }
      });
    });

    return NextResponse.json({ totals, docsCount });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to aggregate docs" },
      { status: 500 }
    );
  }
}
