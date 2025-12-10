import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const buildSystemPrompt = (
  uiLang: string | null,
  context: {
    jurisdiction?: { country_code?: string | null; region?: string | null; evidence?: string | null } | null;
    domain?: string | null;
    sender?: string | null;
    topic?: string | null;
    caseLabels?: string[] | null;
    referenceIds?: Record<string, string> | null;
    amount?: { value?: number | null; currency?: string | null } | null;
    risk?: string | null;
    uncertainty?: string[] | null;
  }
) => {
  const lang = uiLang || "de";
  const country = context.jurisdiction?.country_code || null;
  const region = context.jurisdiction?.region || null;
  const jurEvidence = context.jurisdiction?.evidence || null;
  const parts = [
    `You are the assistant for this document's domain and jurisdiction. Answer in ${lang}. Use only provided info; if unknown, say so. Be concise and action-oriented.`,
    `Jurisdiction: ${country || "unknown"}${region ? ` (${region})` : ""}${jurEvidence ? ` | evidence: ${jurEvidence}` : ""}`,
    `Domain: ${context.domain || "unknown"}`,
    `Sender: ${context.sender || "unknown"}`,
    `Topic: ${context.topic || (context.caseLabels?.join(", ") || "unknown")}`,
  ];

  const refIds = context.referenceIds && Object.keys(context.referenceIds).length
    ? Object.entries(context.referenceIds)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : null;
  if (refIds) parts.push(`Reference IDs: ${refIds}`);

  if (context.amount?.value || context.amount?.currency) {
    parts.push(`Amount/Currency: ${context.amount?.value ?? "?"} ${context.amount?.currency ?? ""}`.trim());
  }
  if (context.risk || (context.uncertainty && context.uncertainty.length)) {
    parts.push(
      `Risk/Uncertainty: ${context.risk || "none"}; Flags: ${(context.uncertainty || []).join(", ") || "none"}`
    );
  }

  parts.push("Context follows. Use it; do not invent.");
  return parts.join("\n");
};

async function getLatestExtraction(
  supabase: ReturnType<typeof supabaseAdmin>,
  docId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("extractions")
    .select("content, created_at")
    .eq("document_id", docId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return (data as any)?.content ?? null;
}

const normalizePath = (arr: any): string | null => {
  if (!Array.isArray(arr)) return null;
  const cleaned = arr.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
  return cleaned.length ? cleaned.join(" / ") : null;
};

const mapJurisdiction = (extraction: any) => {
  const jur = extraction?.jurisdiction;
  if (jur && typeof jur === "object") {
    return {
      country_code: typeof jur.country_code === "string" ? jur.country_code : null,
      region: typeof jur.region === "string" ? jur.region : null,
      evidence: typeof jur.evidence === "string" ? jur.evidence : null,
    };
  }
  // Heuristic fallback from reference IDs (IBAN/VAT prefixes) or sender domains could be added here.
  return { country_code: null, region: null, evidence: null };
};

async function getOrCreateThread(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  documentId: string
): Promise<{ threadId: string; messages: ChatMessage[] }> {
  const { data: existing, error } = await supabase
    .from("doc_chat_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("document_id", documentId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const threadId =
    (Array.isArray(existing) && existing[0]?.id) ||
    (await supabase
      .from("doc_chat_threads")
      .insert({ user_id: userId, document_id: documentId, title: "Doc chat" })
      .select("id")
      .single()
      .then((res) => res.data?.id));
  if (!threadId) throw new Error("Failed to create thread");

  const { data: msgs, error: msgErr } = await supabase
    .from("doc_chat_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (msgErr && (msgErr as any).code !== "42P01") throw msgErr;
  const messages = ((msgs as any[]) || []).map((m) => ({ role: m.role, content: m.content }));
  return { threadId, messages };
}

export async function GET(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const url = new URL(request.url);
    const documentId = url.searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, user_id")
      .eq("id", documentId)
      .single();
    if (docErr) throw docErr;
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { threadId, messages } = await getOrCreateThread(supabase, doc.user_id, documentId);
    return NextResponse.json({ threadId, messages });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load chat" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const body = await request.json().catch(() => null);
    const documentId: string | undefined = body?.documentId;
    const threadIdInput: string | undefined = body?.threadId;
    const uiLangInput: string | undefined = body?.uiLang;
    const userMessages: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages.filter((m: any) => m?.role === "user" && typeof m?.content === "string")
      : [];
    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });
    if (!userMessages.length) return NextResponse.json({ error: "messages required" }, { status: 400 });

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, user_id, title, category_id")
      .eq("id", documentId)
      .single();
    if (docErr) throw docErr;
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const extraction = await getLatestExtraction(supabase, documentId, doc.user_id);
    const keyFields = (extraction?.key_fields ?? {}) as any;
    const uiLang = uiLangInput || keyFields?.language || "de";
    const profileHint = keyFields?.domain_profile_label ?? null;

    const { threadId, messages: existingMessages } = threadIdInput
      ? await getOrCreateThread(supabase, doc.user_id, documentId)
      : await getOrCreateThread(supabase, doc.user_id, documentId);

    const contextParts = [
      extraction?.main_summary || extraction?.summary ? `Summary: ${extraction.main_summary || extraction.summary}` : "",
      extraction?.badge_text ? `Badge: ${extraction.badge_text}` : "",
      Array.isArray(extraction?.extra_details) && extraction.extra_details.length
        ? `Details:\n${extraction.extra_details.join("\n")}`
        : "",
      Array.isArray(extraction?.deadlines) && extraction.deadlines.length
        ? `Deadlines:\n${extraction.deadlines
            .map((d: any) => {
              const date = typeof d?.date_exact === "string" ? d.date_exact : "";
              const desc = typeof d?.description === "string" ? d.description : "";
              return `- ${date} ${desc}`.trim();
            })
            .join("\n")}`
        : "",
      keyFields?.raw_text ? `RAW TEXT:\n${keyFields.raw_text}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const jurisdiction = mapJurisdiction(extraction);
    const categoryPath = normalizePath(keyFields?.category_path);
    const domain = profileHint || categoryPath || null;
    const refObj = keyFields?.reference_ids;
    const referenceIds = refObj && typeof refObj === "object" && !Array.isArray(refObj)
      ? Object.entries(refObj as Record<string, unknown>).reduce<Record<string, string>>((acc, [k, v]) => {
          if (typeof v === "string" && v.trim()) acc[k] = v.trim();
          return acc;
        }, {})
      : null;
    const amount =
      typeof keyFields?.amount_total === "number" && Number.isFinite(keyFields.amount_total)
        ? { value: keyFields.amount_total, currency: typeof keyFields?.currency === "string" ? keyFields.currency : null }
        : null;
    const risk = typeof (extraction as any)?.risk_level === "string" ? (extraction as any).risk_level : null;
    const uncertainty = Array.isArray((extraction as any)?.uncertainty_flags)
      ? ((extraction as any)?.uncertainty_flags as any[]).filter((s) => typeof s === "string" && s.trim())
      : null;

    const systemPrompt = buildSystemPrompt(uiLang, {
      jurisdiction,
      domain,
      sender: typeof keyFields?.sender === "string" && keyFields.sender.trim() ? keyFields.sender.trim() : null,
      topic:
        typeof (keyFields as any)?.primary_topic_label === "string" && (keyFields as any)?.primary_topic_label?.trim()
          ? ((keyFields as any)?.primary_topic_label as string).trim()
          : typeof keyFields?.topic === "string" && keyFields.topic.trim()
            ? keyFields.topic.trim()
            : null,
      caseLabels: Array.isArray((keyFields as any)?.case_labels) ? ((keyFields as any)?.case_labels as string[]) : null,
      referenceIds,
      amount,
      risk,
      uncertainty,
    });

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error("Missing OPENAI_API_KEY");
    const openai = new OpenAI({ apiKey: openaiKey });

    const chatHistory: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(existingMessages as ChatMessage[]),
      ...userMessages,
    ];
    if (contextParts) {
      chatHistory.unshift({ role: "system", content: `Kontext:\n${contextParts}` });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatHistory,
      temperature: 0.3,
    });
    const assistantText = completion.choices[0]?.message?.content || "Sorry, keine Antwort verfügbar.";

    // Persist messages
    const inserts: ChatMessage[] = [...userMessages, { role: "assistant", content: assistantText }];
    for (const msg of inserts) {
      try {
        await supabase.from("doc_chat_messages").insert({
          thread_id: threadId,
          role: msg.role,
          content: msg.content,
        });
      } catch (err) {
        console.warn("chat message insert skipped", err);
      }
    }

    const { data: updatedMsgs } = await supabase
      .from("doc_chat_messages")
      .select("role, content, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      threadId,
      messages: (updatedMsgs as any[])?.map((m) => ({ role: m.role, content: m.content })) ?? [],
      assistant: assistantText,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to chat with document" },
      { status: 500 }
    );
  }
}
