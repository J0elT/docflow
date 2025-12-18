import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatDateYmdMon, replaceIsoDatesInText } from "@/lib/dateFormat";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };
const TOKEN_WINDOW = 3000;

const sanitizeContentForStorage = (content: string) =>
  content.replace(/https?:\/\/[^\s]*supabase\.co[^\s]*/gi, (match) => {
    let url = match;
    let trailing = "";
    while (url.length && /[).,\]]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }
    return `[link removed]${trailing}`;
  });

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const parseAuthToken = (request: Request): string | null => {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/sb-access-token=([^;]+)/);
  if (match && match[1]) return decodeURIComponent(match[1]);
  return null;
};

const isAffirmative = (text: string) => {
  const s = text.trim().toLowerCase();
  if (!s) return false;
  // Covers short confirmations across supported UI languages.
  return /^(yes|yeah|yep|ok|okay|sure|please|ja|jep|klar|bitte|oui|si|sí|da|tak|да|так|bine)\b/.test(s);
};

const isExplicitTaskCreateIntent = (text: string) => {
  const s = text.toLowerCase();
  // Intent must mention "task" concept + a create verb (language-agnostic-ish).
  const taskWord = /(task|aufgabe|tarea|tâche|sarcin|görev|задач|zadani|zadan|завдан)/;
  const createWord =
    /(create|add|make|set up|erstelle|erstellen|anlegen|hinzufüg|ajout|ajouter|créer|crear|crea|adaug|adauga|ekle|добав|созда|utwórz|stwórz|dodaj|створ)/;
  return taskWord.test(s) && createWord.test(s);
};

const assistantAskedForTaskConfirmation = (text: string) => {
  const s = text.toLowerCase();
  // If the assistant previously asked for confirmation, a short "yes/ok" is enough.
  return /(create a task|create task|add a task|aufgabe erstellen|aufgabe anlegen|task erstellen|aufgabe hinzufügen|tarea|tâche|sarcin|görev|задач|zadani|завдан)/.test(s);
};

const taskNotCreatedConfirmationNote = (lang: string | null | undefined) => {
  const l = (lang || "de").toLowerCase();
  if (l.startsWith("de")) return "Aufgabe nicht erstellt (bitte kurz bestätigen).";
  if (l.startsWith("ro")) return "Sarcina nu a fost creată (te rog confirmă explicit).";
  if (l.startsWith("tr")) return "Görev oluşturulmadı (lütfen açıkça onayla).";
  if (l.startsWith("fr")) return "Tâche non créée (merci de confirmer explicitement).";
  if (l.startsWith("es")) return "No se creó la tarea (confirma explícitamente).";
  if (l.startsWith("ar")) return "لم يتم إنشاء المهمة (يرجى التأكيد بشكل صريح).";
  if (l.startsWith("pt")) return "Tarefa não criada (confirme explicitamente).";
  if (l.startsWith("ru")) return "Задача не создана (нужно явное подтверждение).";
  if (l.startsWith("pl")) return "Nie utworzono zadania (potrzebne jest wyraźne potwierdzenie).";
  if (l.startsWith("uk")) return "Завдання не створено (потрібне явне підтвердження).";
  return "Task not created (please confirm explicitly).";
};

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
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayDisplay = formatDateYmdMon(todayIso, lang) ?? todayIso;
  const exampleDate = formatDateYmdMon("2025-10-06", lang) ?? "06.10.2025";
  const isGerman = lang.toLowerCase().startsWith("de");
  const dateFormatInstruction = isGerman
    ? `When you mention dates, format them as DD.MM.YYYY (example: ${exampleDate}).`
    : `When you mention dates, format them as D MMM YYYY (example: ${exampleDate}).`;
  const country = context.jurisdiction?.country_code || null;
  const region = context.jurisdiction?.region || null;
  const jurEvidence = context.jurisdiction?.evidence || null;
  const parts = [
    `You are Clarity, DocFlow's single-document assistant. Answer in ${lang}. Use only provided info; if unknown, say so. Be concise and action-oriented. ${dateFormatInstruction}`,
    `Scope: this document only (plus explicitly provided neighboring-doc context for reference). Never invent facts, IDs, pages, or quotes.`,
    `If the user asks cross-document questions (search across files, aggregation, moving docs, bundling/export), reply with ONE sentence that points to Galaxy (DocFlow's cross-document assistant) and what it can do.`,
    `If the user goes off-topic (unrelated chat), reply with ONE sentence that steers back to the document and asks what they want to understand about it.`,
    `You may reference neighboring documents in the same category/case ONLY to clarify context; keep focus on the selected document and label it clearly ("Ähnliches Dokument: ..."). Do not aggregate or move documents—that's Galaxy's role.`,
    `Provide informational guidance only. You are not a lawyer and this is not legal advice. You may share an informal view on possible steps but must tell the user to verify with a qualified professional before acting. If asked for definitive legal advice, say you're not authorized and recommend consulting a professional.`,
    `You may propose draft responses; prefix with "Draft (review with a professional before sending):" and keep them concise. Never invent facts.`,
    `Primary goal: answer the user's questions about this document. Secondary goal: if a clear, concrete follow-up action is needed and it is not already an open task, ask the user if you should create a task. Do not create tasks without explicit confirmation. Avoid duplicates with existing tasks provided in context.`,
    `You CAN create tasks. Today is ${todayIso} (display: ${todayDisplay}). If the user explicitly confirms task creation, append exactly one line at the very end: COMMAND: CREATE_TASK|title|due_date|urgency|description. Use ISO date YYYY-MM-DD or leave empty if none. Urgency: low|normal|high.`,
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

const summarizeTasks = (
  tasks: { id: string; title: string; status: string; due_date: string | null; urgency?: string | null }[],
  uiLang: string | null
) => {
  return tasks.map((t) => {
    const due = t.due_date ? `due ${formatDateYmdMon(t.due_date, uiLang) ?? t.due_date}` : "";
    const urg = t.urgency ? `urgency ${t.urgency}` : "";
    return `${t.title}${due || urg ? ` (${[due, urg].filter(Boolean).join(", ")})` : ""}`;
  });
};

const summarizeRelated = (
  entry: {
  id: string;
  title: string;
  created_at: string | null;
  extraction: any;
},
  uiLang: string | null
) => {
  const parts: string[] = [];
  const date = entry.created_at
    ? (formatDateYmdMon(entry.created_at, uiLang) ?? replaceIsoDatesInText(entry.created_at, uiLang) ?? "")
    : "";
  parts.push(`${entry.title}${date ? ` (${date})` : ""}`);
  const summary =
    typeof entry.extraction?.main_summary === "string" && entry.extraction.main_summary.trim()
      ? entry.extraction.main_summary.trim()
      : typeof entry.extraction?.summary === "string" && entry.extraction.summary.trim()
        ? entry.extraction.summary.trim()
        : null;
  if (summary) parts.push(summary.length > 200 ? `${summary.slice(0, 197)}...` : summary);
  const badge = typeof entry.extraction?.badge_text === "string" && entry.extraction.badge_text.trim()
    ? entry.extraction.badge_text.trim()
    : null;
  if (badge) parts.push(`Badge: ${badge}`);
  const refObj = entry.extraction?.key_fields?.reference_ids;
  if (refObj && typeof refObj === "object") {
    const refs = Object.entries(refObj as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string" && (v as string).trim())
      .map(([k, v]) => `${k}:${(v as string).trim()}`);
    if (refs.length) parts.push(`Refs: ${refs.join(", ")}`);
  }
  const deadlines = Array.isArray(entry.extraction?.deadlines)
    ? (entry.extraction.deadlines as any[]).filter((d) => d && typeof d === "object")
    : [];
  if (deadlines.length) {
    const first = deadlines
      .map((d) => {
        const ddateRaw = typeof d?.date_exact === "string" ? d.date_exact : "";
        const ddate = ddateRaw
          ? (formatDateYmdMon(ddateRaw, uiLang) ?? replaceIsoDatesInText(ddateRaw, uiLang) ?? ddateRaw)
          : "";
        const ddesc = typeof d?.description === "string" ? d.description : "";
        return `${ddate} ${ddesc}`.trim();
      })
      .find(Boolean);
    if (first) parts.push(`Deadline: ${first}`);
  }
  const amount =
    typeof entry.extraction?.key_fields?.amount_total === "number" && Number.isFinite(entry.extraction.key_fields.amount_total)
      ? entry.extraction.key_fields.amount_total
      : null;
  const currency = typeof entry.extraction?.key_fields?.currency === "string" ? entry.extraction.key_fields.currency : "";
  if (amount !== null) parts.push(`Amount: ${amount} ${currency}`.trim());
  return parts.join(" | ");
};

async function getRelatedDocs(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  currentDocId: string,
  caseId: string | null,
  categoryId: string | null,
  uiLang: string | null
) {
  const docsQuery = supabase
    .from("documents")
    .select("id, title, created_at, case_id")
    .eq("user_id", userId)
    .neq("status", "error")
    .neq("id", currentDocId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (caseId) {
    docsQuery.eq("case_id", caseId);
  } else if (categoryId) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    docsQuery.eq("category_id", categoryId).gte("created_at", ninetyDaysAgo);
  } else {
    return [];
  }

  const { data, error } = await docsQuery;
  if (error) return [];
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return [];

  const related: string[] = [];
  for (const d of rows) {
    try {
      const extraction = await getLatestExtraction(supabase, d.id, userId);
      if (!extraction) continue;
      related.push(summarizeRelated({ id: d.id, title: d.title, created_at: d.created_at, extraction }, uiLang));
      if (related.length >= 3) break;
    } catch (err) {
      console.warn("related doc fetch skipped", err);
    }
  }
  return related;
}

const ensureClaritySession = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  documentId: string,
  lang: string | null
) => {
  const { data, error } = await supabase
    .from("assistant_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("assistant", "clarity")
    .eq("document_id", documentId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const existingId = Array.isArray(data) && data[0]?.id ? data[0].id : null;
  if (existingId) {
    await supabase.from("assistant_sessions").update({ last_used_at: new Date().toISOString(), lang: lang || null }).eq("id", existingId);
    return existingId;
  }
  const { data: created, error: createErr } = await supabase
    .from("assistant_sessions")
    .insert({ user_id: userId, assistant: "clarity", document_id: documentId, lang: lang || null })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return (created as any)?.id as string;
};

const loadSessionMessages = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  sessionId: string
): Promise<ChatMessage[]> => {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("role, content, token_estimate, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rows = (data as any[]) || [];
  // Enforce token window from the tail
  let total = 0;
  const kept: { role: "user" | "assistant" | "system"; content: string; token_estimate?: number }[] = [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const tokens = row?.token_estimate ?? estimateTokens(String(row?.content ?? ""));
    if (total + tokens > TOKEN_WINDOW && kept.length) break;
    total += tokens;
    kept.push({ role: row.role, content: row.content, token_estimate: tokens });
  }
  return kept.reverse().map((m) => ({ role: m.role, content: m.content }));
};

const saveSessionMessages = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  sessionId: string,
  userId: string,
  messages: ChatMessage[]
) => {
  const rows = messages.map((m) => {
    const sanitized = sanitizeContentForStorage(m.content);
    return {
      session_id: sessionId,
      user_id: userId,
      role: m.role,
      content: sanitized,
      token_estimate: estimateTokens(sanitized),
    };
  });
  if (!rows.length) return;
  await supabase.from("assistant_messages").insert(rows);
  await supabase.from("assistant_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", sessionId);
};

const clearClaritySession = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  documentId: string
) => {
  const { data, error } = await supabase
    .from("assistant_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("assistant", "clarity")
    .eq("document_id", documentId);
  if (error) throw error;
  const ids = (data as any[])?.map((r) => r.id).filter(Boolean) ?? [];
  if (ids.length) {
    await supabase.from("assistant_sessions").delete().in("id", ids);
  }
};

export async function GET(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const url = new URL(request.url);
    const documentId = url.searchParams.get("documentId");
    const uiLang = url.searchParams.get("lang");
    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

    const token = parseAuthToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, user_id")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();
    if (docErr) throw docErr;
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const sessionId = await ensureClaritySession(supabase, user.id, documentId, uiLang);
    const messages = await loadSessionMessages(supabase, sessionId);
    return NextResponse.json({ threadId: sessionId, messages });
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
    const action: string | undefined = body?.action;
    const uiLangInput: string | undefined = body?.uiLang;
    const userMessages: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages.filter((m: any) => m?.role === "user" && typeof m?.content === "string")
      : [];
    const clearRequested = action === "clear";
    if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });
    if (!clearRequested && !userMessages.length)
      return NextResponse.json({ error: "messages required" }, { status: 400 });

    const token = parseAuthToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, user_id, title, category_id, case_id, created_at")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();
    if (docErr) throw docErr;
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (clearRequested) {
      await clearClaritySession(supabase, user.id, documentId);
      return NextResponse.json({ threadId: null, messages: [], assistant: null, createdTask: null });
    }

    const extraction = await getLatestExtraction(supabase, documentId, user.id);
    const { data: existingTasksData } = await supabase
      .from("tasks")
      .select("id, title, status, due_date, urgency")
      .eq("user_id", user.id)
      .eq("document_id", doc.id)
      .neq("status", "done");
    const existingTasks = Array.isArray(existingTasksData) ? existingTasksData : [];
    const keyFields = (extraction?.key_fields ?? {}) as any;
    const uiLang = uiLangInput || keyFields?.language || "de";
    const profileHint = keyFields?.domain_profile_label ?? null;
    const categoryPath = normalizePath(keyFields?.category_path);

    const sessionId = await ensureClaritySession(supabase, user.id, documentId, uiLang);
    const existingMessages = await loadSessionMessages(supabase, sessionId);

    const relatedDocs = await getRelatedDocs(
      supabase,
      user.id,
      doc.id,
      (doc as any)?.case_id ?? null,
      doc.category_id ?? null,
      uiLang
    );

    const sender =
      typeof keyFields?.sender === "string" && keyFields.sender.trim()
        ? keyFields.sender.trim()
        : typeof keyFields?.issuer_short === "string" && keyFields.issuer_short.trim()
          ? keyFields.issuer_short.trim()
          : null;
    const topic =
      typeof (keyFields as any)?.primary_topic_label === "string" &&
      (keyFields as any)?.primary_topic_label?.trim()
        ? ((keyFields as any)?.primary_topic_label as string).trim()
        : typeof keyFields?.topic === "string" && keyFields.topic.trim()
          ? keyFields.topic.trim()
          : null;
    const docDate =
      typeof keyFields?.document_date === "string" && keyFields.document_date.trim()
        ? keyFields.document_date.trim()
        : typeof keyFields?.letter_date === "string" && keyFields.letter_date.trim()
          ? keyFields.letter_date.trim()
          : null;
    const dueDate =
      typeof keyFields?.due_date === "string" && keyFields.due_date.trim()
        ? keyFields.due_date.trim()
        : null;

    const rawText =
      typeof keyFields?.raw_text === "string" && keyFields.raw_text.trim()
        ? keyFields.raw_text.trim()
        : null;
    const rawTextTruncated =
      rawText && rawText.length > 16000
        ? `${rawText.slice(0, 16000)}\n\n[RAW TEXT TRUNCATED]`
        : rawText;

    const contextParts = [
      `Document title: ${doc.title}`,
      sender ? `Sender: ${sender}` : "",
      topic ? `Topic: ${topic}` : "",
      categoryPath ? `Category path: ${categoryPath}` : "",
      docDate ? `Document date: ${docDate}` : "",
      dueDate ? `Due date: ${dueDate}` : "",
      extraction?.document_kind ? `Document kind: ${extraction.document_kind}` : "",
      extraction?.main_summary || extraction?.summary
        ? `Summary: ${extraction.main_summary || extraction.summary}`
        : "",
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
      relatedDocs.length
        ? `Related documents (reference only; focus on the selected document):\n${relatedDocs
            .map((r) => `- ${r}`)
            .join("\n")}`
        : "",
      existingTasks.length
        ? `Existing tasks (do not duplicate):\n${summarizeTasks(existingTasks, uiLang)
            .map((t) => `- ${t}`)
            .join("\n")}`
        : "",
      rawTextTruncated ? `RAW TEXT:\n${rawTextTruncated}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const jurisdiction = mapJurisdiction(extraction);
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
    let assistantText = completion.choices[0]?.message?.content || "Sorry, keine Antwort verfügbar.";
    let taskCreatedNote: string | null = null;
    let createdTaskPayload: { id: string | null; title: string; due_date: string | null; urgency: string } | null = null;

    // Check for embedded task creation command
    const commandRegex = /COMMAND:\s*CREATE_TASK\|(.*?)\|(.*?)\|(.*?)\|(.*)/i;
    const match = assistantText.match(commandRegex);
    if (match) {
      const lastUserText = userMessages[userMessages.length - 1]?.content ?? "";
      const lastAssistantText =
        [...(existingMessages as ChatMessage[])]
          .reverse()
          .find((m) => m.role === "assistant" && typeof m.content === "string")?.content ?? "";
      const confirmed =
        isExplicitTaskCreateIntent(lastUserText) ||
        (assistantAskedForTaskConfirmation(lastAssistantText) && isAffirmative(lastUserText));

      const [, rawTitle, rawDue, rawUrgency, rawDesc] = match;
      const title = rawTitle?.trim() || "";
      let due = rawDue?.trim() || null;
      const urgency = (rawUrgency?.trim().toLowerCase() as "low" | "normal" | "high") || "normal";
      const description = rawDesc?.trim() || null;
      if (due && /^tomorrow$/i.test(due)) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        due = tomorrow.toISOString().slice(0, 10);
      }
      if (title && confirmed) {
        try {
          const { data: existing } = await supabase
            .from("tasks")
            .select("id, title, status")
            .eq("user_id", user.id)
            .eq("document_id", doc.id)
            .neq("status", "done");
          const duplicate = (existing || []).find(
            (t) => (t.title || "").trim().toLowerCase() === title.toLowerCase()
          );
          if (!duplicate) {
            const { data: created } = await supabase.from("tasks").insert({
              user_id: user.id,
              document_id: doc.id,
              title,
              description: description || null,
              due_date: due || null,
              urgency: urgency || "normal",
              status: "open",
            }).select("id").single();
            taskCreatedNote = `Aufgabe erstellt: ${title}${due ? ` (Fälligkeit ${due})` : ""}`;
            createdTaskPayload = {
              id: (created as any)?.id ?? null,
              title,
              due_date: due,
              urgency: urgency || "normal",
            };
          } else {
            taskCreatedNote = `Aufgabe bereits vorhanden: ${duplicate.title}`;
          }
        } catch (err) {
          console.warn("task creation from chat skipped", err);
        }
      } else if (title && !confirmed) {
        taskCreatedNote = taskNotCreatedConfirmationNote(uiLang);
      }
      assistantText = assistantText.replace(commandRegex, "").trim();
      if (taskCreatedNote) {
        assistantText = assistantText ? `${assistantText}\n\n${taskCreatedNote}` : taskCreatedNote;
      }
    }

    // Persist messages
    const inserts: ChatMessage[] = [...userMessages, { role: "assistant", content: assistantText }];
    try {
      await saveSessionMessages(supabase, sessionId, user.id, inserts);
    } catch (err) {
      console.warn("chat message insert skipped", err);
    }

    const updatedMessages = await loadSessionMessages(supabase, sessionId);

    return NextResponse.json({
      threadId: sessionId,
      messages: updatedMessages,
      assistant: assistantText,
      createdTask: taskCreatedNote ? createdTaskPayload : null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to chat with document" },
      { status: 500 }
    );
  }
}
