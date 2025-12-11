import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const body = await request.json().catch(() => null);
    const docId: string | undefined = body?.documentId;
    const title: string | undefined = body?.title;
    const description: string | undefined = body?.description;
    const dueDate: string | undefined = body?.dueDate;
    const urgency: "low" | "normal" | "high" | undefined = body?.urgency;

    if (!docId) return NextResponse.json({ error: "documentId required" }, { status: 400 });
    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const normalizedTitle = title.trim().toLowerCase();

    const { data: existing, error: existingErr } = await supabase
      .from("tasks")
      .select("id, title, status")
      .eq("user_id", user.id)
      .eq("document_id", docId)
      .neq("status", "done");
    if (existingErr) throw existingErr;
    const duplicate = (existing || []).find((t) => (t.title || "").trim().toLowerCase() === normalizedTitle);
    if (duplicate) {
      return NextResponse.json({ ok: true, taskId: duplicate.id, duplicate: true });
    }

    const insert = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        document_id: docId,
        title: title.trim(),
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        due_date: typeof dueDate === "string" && dueDate.trim() ? dueDate.trim() : null,
        urgency: urgency || "normal",
        status: "open",
      })
      .select("id")
      .single();

    if (insert.error) throw insert.error;
    return NextResponse.json({ ok: true, taskId: insert.data?.id || null, duplicate: false });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create task" }, { status: 500 });
  }
}
