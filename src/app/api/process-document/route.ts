import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  storage_path: string;
  category_id?: string | null;
};

const CATEGORY_OPTIONS = [
  { slug: "arbeitsagentur", label: "Arbeitsagentur / Sozialleistungen" },
  { slug: "jobcenter", label: "Jobcenter (Bürgergeld, SGB II)" },
  { slug: "arbeitgeber", label: "Arbeit & Verträge" },
  { slug: "finanzamt", label: "Finanzamt / Steuern" },
  { slug: "krankenkasse", label: "Gesundheit & Pflege" },
  { slug: "miete", label: "Miete & Wohnen" },
  { slug: "telefon_internet", label: "Energie / Telefon / Internet" },
  { slug: "bank_kredit", label: "Banken, Kredite & Inkasso" },
  { slug: "versicherung", label: "Versicherungen (nicht Gesundheit)" },
  { slug: "recht_gericht", label: "Gerichte & Rechtsstreit" },
  { slug: "auto_verkehr", label: "Auto & Verkehr" },
  { slug: "einkauf_garantie", label: "Einkäufe, Rechnungen & Garantien" },
  { slug: "bildung_kinder", label: "Bildung & Kinderbetreuung" },
  { slug: "aufenthalt_behoerde", label: "Aufenthalt & Behörden" },
  { slug: "sonstiges", label: "Sonstiges" },
];

const SUPPORTED_LANGUAGES = ["de", "en", "ro", "tr", "fr", "es", "ar"] as const;
type SupportedLang = (typeof SUPPORTED_LANGUAGES)[number];

const slugToLabel = (slug: string | null | undefined): string => {
  if (!slug) return "Sonstiges";
  return CATEGORY_OPTIONS.find((c) => c.slug === slug)?.label || "Sonstiges";
};

const inferSuggestedCategorySlug = (text: string): string => {
  const lower = text.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => lower.includes(n.toLowerCase()));
  if (has("kuendig", "termination", "aufhebungsvertrag", "severance", "arbeitsvertrag", "employment")) {
    return "arbeitgeber";
  }
  if (has("agentur für arbeit", "arbeitslosengeld", "alg i", "§ 136 sgb iii", "sozialhilfe")) return "arbeitsagentur";
  if (has("jobcenter", "bürgergeld", "sgb ii")) return "jobcenter";
  if (has("kuendig", "termination", "aufhebungsvertrag", "severance", "arbeitsvertrag", "employment", "abmahnung", "arbeitsvertrag")) {
    return "arbeitgeber";
  }
  if (has("finanzamt", "einkommensteuer", "steuerbescheid", "vorauszahlung", "umsatzsteuer", "gewerbesteuer", "grundsteuer")) return "finanzamt";
  if (has("krankenkasse", "kostenerstattung", "beitrag", "pflege", "krankengeld", "pflegegrad")) return "krankenkasse";
  if (has("mietvertrag", "nebenkosten", "vermieter", "hausverwaltung", "kaltmiete", "mieterhöhung", "wohnung")) return "miete";
  if (has("telekom", "vodafone", "internet", "mobilfunk", "strom", "gas", "energie", "wasser")) return "telefon_internet";
  if (has("kredit", "darlehen", "inkasso", "mahnung", "pfändung", "zahlungserinnerung", "bank", "konto", "rate")) return "bank_kredit";
  if (has("versicherung", "haftpflicht", "hausrat", "kfz", "reiseversicherung", "prämie", "schaden")) return "versicherung";
  if (has("gericht", "klage", "mahnbescheid", "vollstreckung", "anwalt", "ladung", "beschluss")) return "recht_gericht";
  if (has("bußgeld", "verkehr", "parken", "geschwindigkeit", "zulassung", "führerschein", "auto", "fahrzeug")) return "auto_verkehr";
  if (has("rechnung", "garantie", "widerruf", "retoure", "abo", "mitgliedschaft", "bestellung", "lieferung")) return "einkauf_garantie";
  if (has("schule", "studium", "bafög", "kita", "kindergarten", "semester", "imma", "prüfung")) return "bildung_kinder";
  if (has("aufenthalt", "visa", "fiktionsbescheinigung", "ausländerbehörde", "bürgeramt", "pass", "id", "aufenthaltstitel")) return "aufenthalt_behoerde";
  return "sonstiges";
};

function canonicalizeCategorySegment(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  const match = CATEGORY_OPTIONS.find(
    (c) => c.slug === key || c.label.toLowerCase() === key
  );
  if (match) return match.label;
  return slugToLabel(inferSuggestedCategorySlug(key));
}

function slugifyCategorySegment(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type ParsedExtraction = {
  summary?: string | null;
  badge_text?: string | null;
  main_summary?: string | null;
  extra_details?: string[] | null;
  document_kind?: string | null;
  category_suggestion?: { slug?: string | null } | null;
  key_fields?: {
    topic?: string | null;
    letter_date?: string | null;
    due_date?: string | null;
    sender?: string | null;
    language?: string | null;
    action_required?: boolean;
    action_description?: string | null;
    follow_up?: string | null;
  };
};

function buildFriendlyTitle(parsed: ParsedExtraction | null | undefined): string | null {
  const normalize = (v: string | null | undefined) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const topic =
    normalize(parsed?.key_fields?.topic) ||
    normalize(parsed?.summary) ||
    normalize(parsed?.main_summary);
  const kind = normalize(parsed?.document_kind);
  const sender = normalize(parsed?.key_fields?.sender);
  const letterDate = normalize(parsed?.key_fields?.letter_date);
  const dueDate = normalize(parsed?.key_fields?.due_date);

  const stripAddress = (value: string | null | undefined) => {
    if (!value) return null;
    const cleaned = value.replace(/\d{2,} [\wäöüß\-. ]+ \d{4,}/gi, "").trim();
    // Remove commas that trail after removing addresses
    return cleaned.replace(/,+\s*$/, "").trim() || null;
  };

  const pickDate = letterDate || dueDate || null;
  const formatIsoDate = (value: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  };
  const isoDate = formatIsoDate(pickDate);

  const categoryPath = mapToCategoryPath(parsed);
  const primaryCategory = categoryPath[0] || "";

  const parts: string[] = [];
  const cleanTopic = stripAddress(topic);
  const cleanSender = stripAddress(sender);
  const titleBase = cleanTopic || kind || primaryCategory || "";
  if (titleBase) parts.push(titleBase);
  if (cleanSender && cleanSender.toLowerCase() !== "unknown") parts.push(cleanSender);
  if (isoDate) parts.push(isoDate);

  const composed = parts.join(" ").trim();
  if (composed) return composed.slice(0, 160);

  return topic || kind || null;
}

const slugifyTitle = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "document";

function mapToCategoryPath(
  parsed: ParsedExtraction | null | undefined,
  rawText: string = ""
): string[] {
  const topic =
    typeof parsed?.key_fields?.topic === "string" ? parsed.key_fields.topic : "";
  const summary =
    typeof parsed?.summary === "string" ? parsed.summary : "";
  const combined = `${topic} ${summary} ${rawText || ""}`;
  const slug = parsed?.category_suggestion?.slug || inferSuggestedCategorySlug(combined);
  return [slugToLabel(slug)];
}

async function ensureCategoryPath(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  path: string[]
): Promise<string | null> {
  if (!path.length) return null;

  type CatRow = { id: string; name: string; parent_id: string | null; slug: string };
  const existing: CatRow[] = [];
  const existingRes: { data: { id: string; name: string; parent_id: string | null }[] | null } =
    await supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("user_id", userId);
  if (existingRes?.data) {
    existing.push(
      ...existingRes.data.map((c) => ({
        ...c,
        slug: slugifyCategorySegment(c.name),
      }))
    );
  }

  let parentId: string | null = null;
  let lastId: string | null = null;
  for (const raw of path) {
    const name = canonicalizeCategorySegment(raw);
    if (!name) continue;

    const slug = slugifyCategorySegment(name);
    const found = existing.find(
      (c) => c.parent_id === parentId && c.slug === slug
    );
    if (found) {
      parentId = found.id;
      lastId = found.id;
      continue;
    }

    const parentBeforeInsert = parentId;
    const insertRes: { data: { id: string } | null; error: unknown } = await supabase
      .from("categories")
      .insert({ user_id: userId, name, parent_id: parentId })
      .select("id")
      .single();
    if (insertRes.error) throw insertRes.error;
    if (insertRes.data?.id) {
      const createdId = insertRes.data.id;
      parentId = createdId;
      lastId = createdId;
      existing.push({ id: createdId, name, parent_id: parentBeforeInsert, slug });
    }
  }
  return lastId;
}

async function maybeCreateTaskFromSuggestion(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  documentId: string,
  suggestion: {
    should_create_task?: boolean;
    title?: string | null;
    description?: string | null;
    due_date?: string | null;
    urgency?: string | null;
  } | null
) {
  if (!suggestion || !suggestion.should_create_task) return;
  const title = suggestion.title || "Document task";
  const description = suggestion.description || null;
  const due_date = suggestion.due_date || null;
  const urgency = suggestion.urgency || "normal";
  await supabase.from("tasks").insert({
    user_id: userId,
    document_id: documentId,
    title,
    description,
    due_date,
    urgency,
    status: "open",
  });
}

async function ensureDerivedTasksFromExtraction(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  documentId: string,
  parsed: any
) {
  const desired: { title: string; due_date: string | null; urgency: string }[] = [];

  const actionRequired = parsed?.key_fields?.action_required === true;
  const actionDesc =
    typeof parsed?.key_fields?.action_description === "string" &&
    parsed.key_fields.action_description.trim()
      ? parsed.key_fields.action_description.trim()
      : null;
  const actionDue =
    typeof parsed?.key_fields?.due_date === "string" && parsed.key_fields.due_date.trim()
      ? parsed.key_fields.due_date.trim()
      : null;

  const extraDetails: string[] = Array.isArray(parsed?.extra_details)
    ? parsed.extra_details.filter((s: any) => typeof s === "string")
    : [];

  if (actionRequired && actionDesc) {
    desired.push({
      title: actionDesc,
      due_date: actionDue,
      urgency: actionDue ? "normal" : "low",
    });
  }

  // Add derived tasks from common contract obligations (e.g., return equipment).
  const addIfMentions = (phrases: string[], title: string) => {
    const match = extraDetails.some((d) =>
      phrases.some((p) => d.toLowerCase().includes(p))
    );
    if (match) {
      desired.push({
        title,
        due_date: actionDue,
        urgency: actionDue ? "normal" : "low",
      });
    }
  };

  addIfMentions(
    ["return company property", "return equipment", "equipment must be returned", "company property"],
    "Return company property"
  );

  addIfMentions(
    ["travel expenses", "reise", "outstanding expenses"],
    "Settle outstanding expenses"
  );

  // Only add a payment task if the language indicates the user owes money (not when money is paid to the user).
  const payPhrases = ["pay ", "payment due", "überweisen", "zahlung", "nachzahlung", "fine", "bußgeld", "invoice", "rechnung"];
  const inboundPhrases = ["severance", "abfindung", "will be paid", "to be paid", "payout", "erstattung", "refund"];
  const paidIndicators = [
    "zahlungseingang",
    "bezahlt",
    "payment received",
    "already paid",
    "paid on",
    "beglichen",
    "settled",
    "zahlung erfolgt",
    "paid via",
    "zahlung erfolgt an",
  ];
  const autoDebitIndicators = ["lastschrift", "direct debit", "abbuchung", "mandatsreferenz", "gläubiger-id"];
  const textBundle = `${parsed?.main_summary || ""} ${parsed?.summary || ""} ${extraDetails.join(" ")}`.toLowerCase();
  const hasPayToUser = extraDetails.some((d) =>
    inboundPhrases.some((p) => d.toLowerCase().includes(p))
  );
  const paymentAlreadyDone = paidIndicators.some((p) => textBundle.includes(p));
  const autoDebit = autoDebitIndicators.some((p) => textBundle.includes(p));
  if (!hasPayToUser && !paymentAlreadyDone && !autoDebit) {
    addIfMentions(payPhrases, "Make the required payment");
  }

  addIfMentions(
    ["appeal", "einspruch", "widerspruch", "contest"],
    "Consider filing an appeal"
  );

  addIfMentions(
    ["submit", "einreichen", "unterlagen", "nachreichen", "provide documents"],
    "Submit required documents"
  );

  if (!desired.length) return;

  const normalize = (t: string) => t.trim().toLowerCase();
  const { data: existing, error } = await supabase
    .from("tasks")
    .select("id, title, status, due_date")
    .eq("document_id", documentId);
  if (error) throw error;
  const existingMap = new Map<string, { id: string; status?: string; due_date?: string | null }>();
  (existing ?? []).forEach((t: any) => {
    if (!t?.title) return;
    existingMap.set(normalize(t.title), {
      id: t.id,
      status: t.status,
      due_date: t.due_date,
    });
  });

  for (const task of desired) {
    const key = normalize(task.title);
    const found = existingMap.get(key);
    if (found) {
      if (found.status !== "done" && task.due_date && task.due_date !== found.due_date) {
        await supabase
          .from("tasks")
          .update({ due_date: task.due_date, urgency: task.urgency })
          .eq("id", found.id);
      }
      continue;
    }
    await supabase.from("tasks").insert({
      user_id: userId,
      document_id: documentId,
      title: task.title,
      due_date: task.due_date,
      urgency: task.urgency,
      status: "open",
    });
  }
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  let documentId: string | null = null;

  try {
    const body = await request.json().catch(() => null);
    const incomingId = body?.documentId;
    const preferredLanguage: SupportedLang = SUPPORTED_LANGUAGES.includes(
      body?.preferredLanguage as SupportedLang
    )
      ? (body.preferredLanguage as SupportedLang)
      : "de";
    if (!incomingId || typeof incomingId !== "string") {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 }
      );
    }
    documentId = incomingId;

    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("id, user_id, title, storage_path, category_id")
      .eq("id", documentId)
      .single<DocumentRow>();
    if (docError) throw docError;
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error: updating } = await supabase
      .from("documents")
      .update({ status: "processing", error_message: null })
      .eq("id", doc.id);
    if (updating) throw updating;

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);
    if (downloadError) throw downloadError;
    if (!fileData) throw new Error("File missing in storage");

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const lowerPath = doc.storage_path.toLowerCase();
    const isPdf = lowerPath.endsWith(".pdf");
    const isImage = /\.(png|jpe?g)$/i.test(lowerPath);

    let textContent = "";
    let usedPdfOcrFallback = false;
    let renderedImages: string[] | null = null;
    if (isPdf) {
      const { PDFParse } = await import("pdf-parse");
      // Point pdf.js worker to the on-disk module using a file:// URL to avoid bundler path issues.
      const path = await import("node:path");
      const { pathToFileURL } = await import("node:url");
      const workerPath = path.join(
        process.cwd(),
        "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
      );
      PDFParse.setWorker(pathToFileURL(workerPath).toString());

      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      textContent = parsed.text;
    } else if (!isImage) {
      textContent = buffer.toString("utf8");
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    const openai = new OpenAI({ apiKey: openaiKey });

    const callTextModel = async (content: string, preferredLanguage: SupportedLang) => {
      if (!content || content.trim().length === 0) {
        throw new Error(
          "No text extracted from document (possibly scanned or image-only PDF)."
        );
      }
      const truncated = content.slice(0, 8000);
      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  [
                    `You are an assistant that extracts structured info from letters and explains it in simple words. Use the user's preferred language: ${preferredLanguage}.`,
                    "Return ONLY JSON with this exact shape:",
                    "{",
                    '  "badge_text": "Short chip about the deadline/type, e.g. Widerspruchsfrist bis 06.12.2025 or Zahlungsfrist in 5 Tagen; null if none.",',
                    `  "main_summary": "1-2 short sentences (<=220 chars) in ${preferredLanguage} in plain language: what this letter decides, key dates/amounts, and whether more info will come.",`,
                    '  "extra_details": ["additional bullet 1","additional bullet 2"... up to 5, only if they add new info"],',
                    '  "document_kind": "letter | invoice | contract | notice | info | other",',
                    '  "key_fields": {',
                    `    "language": "${preferredLanguage}",`,
                    '    "sender": "...",',
                    '    "topic": "...",',
                    '    "letter_date": "YYYY-MM-DD or null",',
                    '    "due_date": "YYYY-MM-DD or null (only if a concrete deadline exists)",',
                    '    "amount_total": number or null,',
                    '    "currency": "EUR",',
                    '    "action_required": true/false (false if purely informational or awaiting other mail)",',
                    '    "action_description": "Plain action in <=120 chars, or empty/null if none",',
                    '    "follow_up": "Short note if the letter says another decision/letter will come, else null",',
                    '    "reference_ids": { "steuernummer": null, "kundennummer": null, "vertragsnummer": null }',
                    "  },",
                    '  "category_suggestion": { "slug": "arbeitsagentur|jobcenter|arbeitgeber|finanzamt|krankenkasse|miete|telefon_internet|bank_kredit|versicherung|recht_gericht|auto_verkehr|einkauf_garantie|bildung_kinder|aufenthalt_behoerde|sonstiges", "confidence": 0.0-1.0 },',
                    '  "task_suggestion": { "should_create_task": true/false, "title": "...", "description": "...", "due_date": "YYYY-MM-DD or null", "urgency": "low | normal | high" }',
                    "}",
                    "If this is a contract or a form that requires signatures/initials and the document is unsigned/incomplete, set action_required=true, add an action_description like 'Sign and return the agreement' (or initials), and set task_suggestion.should_create_task=true.",
                    "If the contract already looks signed/countersigned, do NOT ask to sign; instead, if a return is needed, set a task like 'Return the agreement', otherwise no signature task.",
                    "If this is a contract/offer/termination/consent form that the user signs, include extra_details bullets for signature status (who must sign/initials/countersign), key dates (effective date, notice periods, return-by dates), money (severance/comp/bonus), obligations (return property, non-compete/non-solicit, benefits end date), and any follow-up the user must perform.",
                    "Extra details should add new facts/obligations (not repeat the summary): key dates, amounts, signature status, return/submit/appeal deadlines, conditions like clawbacks/confidentiality, benefits start/end, fines/discount windows. Order by importance: payments/status/deadlines first, then amounts/totals, then items/services, then obligations/conditions, then IDs/logistics. Aim for ~5 items; include more only if they add distinct, important facts.",
                    "Do not invent formulas, percentages, or reductions. State amounts/dates only if explicitly present. If a reduction/clawback condition is mentioned, quote it plainly (e.g., 'Repay severance if rehired within 2 years'), without making up math.",
                    "Use null for unknown fields. If the letter just informs and asks to wait for another letter, set action_required=false and fill follow_up with that note. Include key dates/amounts only if present.",
                    "Keep wording simple, concrete, and short (no legal jargon). Do NOT repeat main_summary inside extra_details.",
                    "",
                    "Document text:",
                    truncated,
                  ].join("\n"),
              },
            ],
          },
        ],
      });
      const contentResult = completion.choices[0]?.message?.content;
      if (!contentResult) throw new Error("Missing content from OpenAI response");
      const parsedJson = JSON.parse(contentResult);
      // Normalize fields for downstream use
      if (parsedJson) {
        parsedJson.main_summary =
          (typeof parsedJson.main_summary === "string" && parsedJson.main_summary.trim()) ||
          (typeof parsedJson.summary === "string" && parsedJson.summary.trim()) ||
          null;
        parsedJson.summary = parsedJson.main_summary || parsedJson.summary || null;
        parsedJson.extra_details = Array.isArray(parsedJson.extra_details)
          ? parsedJson.extra_details.filter(
              (s: any) => typeof s === "string" && s.trim().length > 0
            )
          : [];
      }
      if (!parsedJson || !parsedJson.summary) {
        parsedJson.summary = "Info only";
        parsedJson.main_summary = parsedJson.summary;
      }
      return parsedJson;
    };

    const renderPdfImages = async (pdfBuffer: Buffer) => {
      const path = await import("node:path");
      const { pathToFileURL } = await import("node:url");
      const { createRequire } = await import("node:module");

      // Use pdf.js first; if rendering fails, fall back to pdftoppm (Poppler) to rasterize.
      const renderWithPdfjs = async () => {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

        // Load canvas from a stable, absolute path so pdf.js and our factory share the exact same binding.
        const pdfjsEntry = path.join(
          process.cwd(),
          "node_modules/pdfjs-dist/legacy/build/pdf.mjs"
        );
        const resolveFromPdfjs = createRequire(pdfjsEntry);
        const loadCanvasModule = () => {
          try {
            return resolveFromPdfjs("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
          } catch (err) {
            try {
              return resolveFromPdfjs("canvas") as typeof import("canvas");
            } catch {
              throw new Error(
                "Failed to load a canvas implementation. Install @napi-rs/canvas or canvas."
              );
            }
          }
        };

        const { createCanvas, Image, DOMMatrix, ImageData, Path2D } = loadCanvasModule() as any;

        // Overwrite globals so pdf.js and our canvas factory both use the same module.
        (global as any).Image = Image;
        if (DOMMatrix) (global as any).DOMMatrix = DOMMatrix;
        if (ImageData) (global as any).ImageData = ImageData;
        if (Path2D) (global as any).Path2D = Path2D;

        class NodeCanvasFactory {
          create(width: number, height: number) {
            if (width <= 0 || height <= 0) {
              throw new Error("Invalid canvas size");
            }
            const w = Math.max(1, Math.round(width));
            const h = Math.max(1, Math.round(height));
            const canvas = createCanvas(w, h);
            const context = canvas.getContext("2d", { willReadFrequently: true }) as unknown as CanvasRenderingContext2D;
            return { canvas, context };
          }
          reset(canvasAndContext: { canvas: any; context: any }, width: number, height: number) {
            const w = Math.max(1, Math.round(width));
            const h = Math.max(1, Math.round(height));
            canvasAndContext.canvas.width = w;
            canvasAndContext.canvas.height = h;
          }
          destroy(canvasAndContext: { canvas: any; context: any }) {
            if (!canvasAndContext?.canvas) return;
            canvasAndContext.canvas.width = 0;
            canvasAndContext.canvas.height = 0;
            canvasAndContext.canvas = null;
            canvasAndContext.context = null;
          }
        }

        const workerPath = path.join(
          process.cwd(),
          "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
        );
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          pathToFileURL(workerPath).toString();

        // pdf.js expects a Uint8Array, not a Node Buffer
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
        const pdf = await loadingTask.promise;
        const pageCount = pdf.numPages ?? 1;
        const images: string[] = [];

        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.4 }); // keep size reasonable for OCR
          const canvasFactory = new NodeCanvasFactory();
          const { canvas, context } = canvasFactory.create(
            Math.floor(viewport.width),
            Math.floor(viewport.height)
          );
            await page
              .render({
                canvasContext: context as unknown as never,
                viewport,
                canvasFactory: canvasFactory as unknown as never,
              } as any)
              .promise;
          // JPEG keeps payload smaller for vision
          const jpgBuffer = canvas.toBuffer("image/jpeg", { quality: 0.7 });
          images.push(`data:image/jpeg;base64,${jpgBuffer.toString("base64")}`);
          canvasFactory.destroy({ canvas, context });
        }
        return images;
      };

      const renderWithPoppler = async () => {
        const fs = await import("node:fs/promises");
        const os = await import("node:os");
        const childProcess = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFile = promisify(childProcess.execFile);

        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docflow-pdf-"));
        const inputPath = path.join(tmpDir, "input.pdf");
        await fs.writeFile(inputPath, pdfBuffer);

        const cleanup = async () => {
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        };

        try {
          // Convert all pages to PNG at 200 DPI
          await execFile("pdftoppm", ["-png", "-r", "200", inputPath, path.join(tmpDir, "page")]);
          const files = (await fs.readdir(tmpDir))
            .filter((f) => f.endsWith(".png"))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          if (!files.length) {
            throw new Error("pdftoppm produced no images");
          }
          const images: string[] = [];
          for (const file of files) {
            const buf = await fs.readFile(path.join(tmpDir, file));
            images.push(`data:image/png;base64,${buf.toString("base64")}`);
          }
          await cleanup();
          return images;
        } catch (err: any) {
          await cleanup();
          if (err?.code === "ENOENT") {
            throw new Error("pdftoppm is not installed. Install Poppler (e.g., brew install poppler).");
          }
          throw err;
        }
      };

      try {
        return await renderWithPdfjs();
      } catch (err) {
        console.warn("pdf.js render failed, falling back to pdftoppm", err);
        return await renderWithPoppler();
      }
    };

    const callVisionModel = async (images: string[], preferredLanguage: SupportedLang) => {
      if (!images.length) throw new Error("No images available for vision OCR.");
      const completion = await openai.chat.completions.create({
        // Use a vision-capable model for OCR + reasoning on scanned docs/images.
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  [
                    `You are an assistant that extracts structured info from scanned documents (any language). Perform OCR on the images and respond in ${preferredLanguage}.`,
                    "Return ONLY JSON with this shape:",
                    "{",
                    '  "badge_text": "Short chip about the deadline/type, e.g. Widerspruchsfrist bis 06.12.2025 or Zahlungsfrist in 5 Tagen; null if none.",',
                    `  "main_summary": "1-2 short sentences (<=220 chars) in ${preferredLanguage} in plain language: what this letter decides, key dates/amounts, and whether more info will come.",`,
                    '  "extra_details": ["additional bullet 1","additional bullet 2"... up to 5, only if they add new info"],',
                    '  "document_kind": "letter | invoice | contract | notice | info | other",',
                    '  "key_fields": {',
                    `    "language": "${preferredLanguage}",`,
                    '    "sender": "...",',
                    '    "topic": "...",',
                    '    "letter_date": "YYYY-MM-DD or null",',
                    '    "due_date": "YYYY-MM-DD or null (only if a concrete deadline exists)",',
                    '    "amount_total": number or null,',
                    '    "currency": "EUR",',
                    '    "action_required": true/false (false if purely informational or awaiting other mail)",',
                    '    "action_description": "Plain action in <=120 chars, or empty/null if none",',
                    '    "follow_up": "Short note if the letter says another decision/letter will come, else null",',
                    '    "reference_ids": { "steuernummer": null, "kundennummer": null, "vertragsnummer": null }',
                    "  },",
                    '  "category_suggestion": { "slug": "arbeitsagentur|jobcenter|arbeitgeber|finanzamt|krankenkasse|miete|telefon_internet|bank_kredit|versicherung|recht_gericht|auto_verkehr|einkauf_garantie|bildung_kinder|aufenthalt_behoerde|sonstiges", "confidence": 0.0-1.0 },',
                    '  "task_suggestion": { "should_create_task": true/false, "title": "...", "description": "...", "due_date": "YYYY-MM-DD or null", "urgency": "low | normal | high" }',
                    "}",
                    "If this is a contract or a form that requires signatures/initials and the document is unsigned/incomplete, set action_required=true, add an action_description like 'Sign and return the agreement' (or initials), and set task_suggestion.should_create_task=true.",
                    "If the contract already looks signed/countersigned, do NOT ask to sign; instead, if a return is needed, set a task like 'Return the agreement', otherwise no signature task.",
                    "If this is a contract/offer/termination/consent form that the user signs, include extra_details bullets for signature status (who must sign/initials/countersign), key dates (effective date, notice periods, return-by dates), money (severance/comp/bonus), obligations (return property, non-compete/non-solicit, benefits end date), and any follow-up the user must perform.",
                    "Extra details should add new facts/obligations (not repeat the summary): key dates, amounts, signature status, return/submit/appeal deadlines, conditions like clawbacks/confidentiality, benefits start/end, fines/discount windows. Keep it to the 3–5 most important items (hard cap 5 bullets).",
                    "Do not invent formulas, percentages, or reductions. State amounts/dates only if explicitly present. If a reduction/clawback condition is mentioned, quote it plainly (e.g., 'Repay severance if rehired within 2 years'), without making up math.",
                    "Use null for unknown fields. If the letter just informs and asks to wait for another letter, set action_required=false and fill follow_up with that note. Include key dates/amounts only if present.",
                    "Keep wording simple, concrete, and short (no legal jargon). Do NOT repeat main_summary inside extra_details.",
                  ].join("\n"),
              },
              ...images.map((img) => ({
                type: "image_url" as const,
                image_url: { url: img },
              })),
            ],
          },
        ],
      });
      const contentResult = completion.choices[0]?.message?.content;
      if (!contentResult) throw new Error("Missing content from OpenAI response");
      const parsed = JSON.parse(contentResult);
      if (parsed) {
        parsed.main_summary =
          (typeof parsed.main_summary === "string" && parsed.main_summary.trim()) ||
          (typeof parsed.summary === "string" && parsed.summary.trim()) ||
          null;
        parsed.summary = parsed.main_summary || parsed.summary || null;
        parsed.extra_details = Array.isArray(parsed.extra_details)
          ? parsed.extra_details.filter(
              (s: any) => typeof s === "string" && s.trim().length > 0
            )
          : [];
      }
      if (!parsed || !parsed.summary) {
        parsed.summary = "Info only";
        parsed.main_summary = parsed.summary;
      }
      return parsed;
    };

    const ocrImagesToText = async (images: string[]) => {
      if (!images.length) return "";
      // Limit pages to avoid huge payloads
      const limited = images.slice(0, 4);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Read all text from these scanned pages and return ONLY the plain text (no translation, no summary).",
              },
              ...images.map((img) => ({
                type: "image_url" as const,
                image_url: { url: img },
              })),
            ],
          },
        ],
      });
      const contentResult = completion.choices[0]?.message?.content;
      if (!contentResult) return "";
      return contentResult.trim();
    };

    let parsedJson: ParsedExtraction | null = null;

    const MIN_TEXT_CHARS = 200;

    if (isPdf) {
      try {
        if (textContent && textContent.trim().length >= MIN_TEXT_CHARS) {
          parsedJson = await callTextModel(textContent, preferredLanguage);
        }
      } catch (err) {
        console.warn("text model failed for pdf, falling back to OCR", err);
      }
      if (!parsedJson) {
        renderedImages = await renderPdfImages(buffer);
        try {
          parsedJson = await callVisionModel(renderedImages, preferredLanguage);
          usedPdfOcrFallback = true;
        } catch (err) {
          console.warn("vision model failed for pdf, falling back to OCR text", err);
        }
      }
    } else if (textContent && textContent.trim().length > 0) {
      parsedJson = await callTextModel(textContent, preferredLanguage);
    } else if (isImage) {
      const mime = lowerPath.endsWith(".png") ? "image/png" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      renderedImages = [dataUrl];
      try {
        parsedJson = await callVisionModel(renderedImages, preferredLanguage);
      } catch (err) {
        console.warn("vision model failed for image, falling back to OCR text", err);
      }
    } else {
      throw new Error(
        "No text extracted and file type unsupported for OCR fallback."
      );
    }

    // Normalize parsedJson fields for UI compatibility
    if (parsedJson) {
      parsedJson.summary = parsedJson.main_summary || parsedJson.summary;
      parsedJson.extra_details = Array.isArray(parsedJson.extra_details)
        ? parsedJson.extra_details.filter(
            (s: any) => typeof s === "string" && s.trim().length > 0
          )
        : [];
      parsedJson.key_fields = parsedJson.key_fields || {};
      if (!parsedJson.key_fields.language) {
        parsedJson.key_fields.language = preferredLanguage;
      }
      if (usedPdfOcrFallback && !parsedJson.badge_text) {
        parsedJson.badge_text = "Scanned letter (please double-check numbers)";
      }
    }

    if (!parsedJson || !parsedJson.summary) {
      // If vision summary failed, try OCR -> text -> text model as a fallback
      if (renderedImages && renderedImages.length) {
        const ocrText = await ocrImagesToText(renderedImages);
        if (ocrText && ocrText.trim().length > 80) {
          parsedJson = await callTextModel(ocrText, preferredLanguage);
          if (parsedJson) {
            parsedJson.summary = parsedJson.main_summary || parsedJson.summary;
            parsedJson.extra_details = Array.isArray(parsedJson.extra_details)
              ? parsedJson.extra_details.filter(
                  (s: any) => typeof s === "string" && s.trim().length > 0
                )
              : [];
            if (usedPdfOcrFallback && !parsedJson.badge_text) {
              parsedJson.badge_text = "Scanned letter (please double-check numbers)";
            }
          }
        }
      }
    }

    if (!parsedJson || !parsedJson.summary) {
      parsedJson = {
        summary: "Scan not readable. Please upload a clearer photo or higher-resolution scan.",
        main_summary: "Scan not readable. Please upload a clearer photo or higher-resolution scan.",
        extra_details: [],
        key_fields: { language: preferredLanguage },
      };
      if (usedPdfOcrFallback && !parsedJson.badge_text) {
        parsedJson.badge_text = "Scanned letter (please double-check numbers)";
      }
    }

    const { error: insertError } = await supabase.from("extractions").insert({
      document_id: doc.id,
      user_id: doc.user_id,
      content: parsedJson,
    });
    if (insertError) throw insertError;

    // Upsert category and attach
    const mappedPath = mapToCategoryPath(parsedJson, textContent || "");
    if (mappedPath.length > 0) {
      try {
        const normalizedPath = mappedPath
          .map((p: string) => canonicalizeCategorySegment(p))
          .filter((p: string | null): p is string => !!p);
        const categoryId = await ensureCategoryPath(supabase, doc.user_id, normalizedPath);
        if (categoryId) {
          await supabase
            .from("documents")
            .update({ category_id: categoryId })
            .eq("id", doc.id);
        }
      } catch (err) {
        console.error("category upsert failed", err);
      }
    }

    // Create task if suggested
    try {
      await ensureDerivedTasksFromExtraction(supabase, doc.user_id, doc.id, parsedJson);
    } catch (err) {
      console.error("task creation failed", err);
    }

    const friendlyTitle = buildFriendlyTitle(parsedJson) || doc.title;

    // Attempt to rename stored file (any type) to match friendly title
    if (doc.storage_path && friendlyTitle) {
      const extMatch = doc.storage_path.includes(".")
        ? doc.storage_path.slice(doc.storage_path.lastIndexOf("."))
        : "";
      const prefix =
        doc.storage_path.lastIndexOf("/") !== -1
          ? doc.storage_path.slice(0, doc.storage_path.lastIndexOf("/") + 1)
          : "";
      const base = slugifyTitle(friendlyTitle);
      let targetPath = `${prefix}${base}${extMatch}`;
      if (targetPath !== doc.storage_path) {
        const storage = supabase.storage.from("documents");
        const { error: moveError } = await storage.move(doc.storage_path, targetPath);
        if (moveError && (moveError as { statusCode?: number }).statusCode === 409) {
          targetPath = `${prefix}${base}-${doc.id}${extMatch}`;
          await storage.move(doc.storage_path, targetPath);
        } else if (moveError) {
          console.warn("rename failed, keeping original path", moveError);
          targetPath = doc.storage_path;
        }
        // Keep the updated path if move succeeded
        if (targetPath !== doc.storage_path) {
          doc.storage_path = targetPath;
        }
      }
    }

    const { error: finalUpdateError } = await supabase
      .from("documents")
      .update({ status: "done", error_message: null, title: friendlyTitle, storage_path: doc.storage_path })
      .eq("id", doc.id);
    if (finalUpdateError) throw finalUpdateError;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("process-document error", err);
    if (documentId) {
      const message =
        err instanceof Error ? err.message : "Failed to process document";
      await supabase
        .from("documents")
        .update({ status: "error", error_message: message })
        .eq("id", documentId);
    }
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}

// Export helpers for unit testing
export {
  slugToLabel,
  inferSuggestedCategorySlug,
  canonicalizeCategorySegment,
  mapToCategoryPath,
  buildFriendlyTitle,
};
