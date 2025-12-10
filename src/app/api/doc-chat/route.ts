import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

const buildSystemPrompt = (uiLang: string | null, profileHint: string | null) => {
  const lang = uiLang || "de";
  const profileText = profileHint ? `Du bist Assistent für Profil ${profileHint}. ` : "";
  return [
    `${profileText}Antworte in ${lang}.`,
    "Erkläre nur, was im Dokument steht; erfinde nichts.",
    "Wenn etwas unklar ist, sag es explizit.",
  ].join(" ");
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

    const systemPrompt = buildSystemPrompt(uiLang, profileHint);
    const contextParts = [
      extraction?.main_summary || extraction?.summary ? `Summary: ${extraction.main_summary || extraction.summary}` : "",
      extraction?.badge_text ? `Badges: ${extraction.badge_text}` : "",
      Array.isArray(extraction?.extra_details) && extraction.extra_details.length
        ? `Details:\n${extraction.extra_details.join("\n")}`
        : "",
      keyFields?.raw_text ? `RAW TEXT:\n${keyFields.raw_text}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

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
