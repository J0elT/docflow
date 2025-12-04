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

function canonicalizeCategorySegment(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (!key) return null;

  const synonyms: Record<string, string> = {
    finanzen: "Finanzen",
    expenses: "Expenses",
    documents: "Documents",
    "bank statements": "Bank Statements",
    rechnung: "Rechnungen",
    rechnungen: "Rechnungen",
    "miete & rechnungen": "Rechnungen",
    "miete & rechnung": "Rechnungen",
    mobilfunk: "Mobilfunk",
    phone: "Phone",
    telefon: "Phone",
    rent: "Rent",
    miete: "Rent",
    utilities: "Utilities",
    strom: "Utilities",
    gas: "Utilities",
    wasser: "Utilities",
    insurance: "Insurance",
    versicherung: "Insurance",
    taxes: "Taxes",
    steuer: "Taxes",
    finanzamt: "Taxes",
    kontoauszug: "Kontoauszug",
    "bank statement": "Bank Statements",
    sonstiges: "Sonstiges",
  };
  if (synonyms[key]) return synonyms[key];

  return key.slice(0, 1).toUpperCase() + key.slice(1);
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
  document_kind?: string | null;
  key_fields?: {
    topic?: string | null;
    letter_date?: string | null;
    due_date?: string | null;
  };
};

function buildFriendlyTitle(parsed: ParsedExtraction | null | undefined): string | null {
  const topic =
    typeof parsed?.key_fields?.topic === "string" && parsed.key_fields.topic.trim()
      ? parsed.key_fields.topic.trim()
      : null;
  const kind =
    typeof parsed?.document_kind === "string" && parsed.document_kind.trim()
      ? parsed.document_kind.trim()
      : null;
  const letterDate =
    typeof parsed?.key_fields?.letter_date === "string" &&
    parsed.key_fields.letter_date.trim()
      ? parsed.key_fields.letter_date.trim()
      : null;
  const dueDate =
    typeof parsed?.key_fields?.due_date === "string" && parsed.key_fields.due_date.trim()
      ? parsed.key_fields.due_date.trim()
      : null;

  const pickDate = letterDate || dueDate || null;
  const formatMonthYear = (value: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const month = d.toLocaleString("de-DE", { month: "long" });
    const year = d.getFullYear();
    return `${month} ${year}`;
  };
  const monthYear = formatMonthYear(pickDate);

  const hasYear = (text: string | null) => {
    if (!text) return false;
    return /\b20\d{2}\b/.test(text);
  };

  const categoryPath = mapToCategoryPath(parsed);
  const primary = categoryPath[1] || categoryPath[0] || "";

  const labelForCategory = (cat: string) => {
    const key = cat.toLowerCase();
    if (key === "phone") return "Phone bill";
    if (key === "rent") return "Rent invoice";
    if (key === "utilities") return "Utilities bill";
    if (key === "insurance") return "Insurance letter";
    if (key === "taxes") return "Tax letter";
    if (key === "bank statements") return "Bank statement";
    if (key === "invoices") return "Invoice";
    return null;
  };

  const categoryLabel = labelForCategory(primary);

  if (topic) {
    const title = hasYear(topic) || !monthYear ? topic : `${topic} ${monthYear}`;
    return title.slice(0, 160);
  }

  const base = categoryLabel || (kind ? kind : null);

  if (base && monthYear) {
    const title = `${base} ${monthYear}`;
    return title.slice(0, 160);
  }

  if (base) return base.slice(0, 160);

  const summary =
    typeof parsed?.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : null;
  if (summary) return summary.slice(0, 160);
  return null;
}

const slugifyTitle = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "document";

function mapToCategoryPath(parsed: ParsedExtraction | null | undefined): string[] {
  const topic =
    typeof parsed?.key_fields?.topic === "string" ? parsed.key_fields.topic.toLowerCase() : "";
  const kind =
    typeof parsed?.document_kind === "string" ? parsed.document_kind.toLowerCase() : "";

  const has = (text: string, needles: string[]) =>
    needles.some((n) => text.includes(n.toLowerCase()));

  if (has(topic + " " + kind, ["mobilfunk", "telefon", "phone", "cell", "mobile"])) {
    return ["Expenses", "Phone"];
  }
  if (has(topic + " " + kind, ["kontoauszug", "account statement", "bank statement"])) {
    return ["Expenses", "Bank Statements"];
  }
  if (has(topic + " " + kind, ["miete", "rent"])) {
    return ["Expenses", "Rent"];
  }
  if (has(topic + " " + kind, ["strom", "gas", "wasser", "utility", "utilities"])) {
    return ["Expenses", "Utilities"];
  }
  if (has(topic + " " + kind, ["versicherung", "insurance"])) {
    return ["Expenses", "Insurance"];
  }
  if (has(topic + " " + kind, ["steuer", "tax", "finanzamt"])) {
    return ["Expenses", "Taxes"];
  }
  if (has(kind, ["invoice", "bill"])) {
    return ["Expenses", "Invoices"];
  }
  return ["Documents"];
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

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  let documentId: string | null = null;

  try {
    const body = await request.json().catch(() => null);
    const incomingId = body?.documentId;
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

    const callTextModel = async (content: string) => {
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
                    "You are an assistant that extracts structured info from letters and explains it in simple words.",
                    "Return ONLY JSON with this exact shape:",
                    "{",
                    '  "summary": "1 short plain-language sentence (what this letter is about)",',
                    '  "document_kind": "letter | invoice | contract | notice | info | other",',
                    '  "key_fields": {',
                    '    "language": "de",',
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
                    '  "category_suggestion": { "path": ONE of these: ["Expenses","Phone"], ["Expenses","Rent"], ["Expenses","Utilities"], ["Expenses","Insurance"], ["Expenses","Taxes"], ["Expenses","Bank Statements"], ["Expenses","Invoices"], ["Documents"], "confidence": 0.8 },',
                    '  "task_suggestion": { "should_create_task": true/false, "title": "...", "description": "...", "due_date": "YYYY-MM-DD or null", "urgency": "low | normal | high" }',
                    "}",
                    "Use null for unknown fields. If the letter just informs and asks to wait for another letter, set action_required=false and fill follow_up with that note.",
                    "Keep wording simple and short (no legal jargon).",
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
      if (
        !parsedJson ||
        typeof parsedJson.summary !== "string" ||
        parsedJson.summary.trim().length === 0
      ) {
        throw new Error("OpenAI returned empty summary for this document.");
      }
      return parsedJson;
    };

    const renderPdfImages = async (pdfBuffer: Buffer) => {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const path = await import("node:path");
      const { pathToFileURL } = await import("node:url");
      const { createCanvas } = await import("canvas");

      const workerPath = path.join(
        process.cwd(),
        "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
      );
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        pathToFileURL(workerPath).toString();

      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
      const pdf = await loadingTask.promise;
      const pageCount = pdf.numPages ?? 1;
      const images: string[] = [];

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
        await page
          .render({
            canvasContext: context as unknown as never,
            viewport,
            canvas: canvas as unknown as never,
          })
          .promise;
        // JPEG keeps payload smaller for vision
        const jpgBuffer = canvas.toBuffer("image/jpeg", { quality: 0.8 });
        images.push(`data:image/jpeg;base64,${jpgBuffer.toString("base64")}`);
      }
      return images;
    };

    const callVisionModel = async (images: string[]) => {
      if (!images.length) throw new Error("No images available for vision OCR.");
      const completion = await openai.chat.completions.create({
        model: "gpt-5",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  [
                    "You are an assistant that extracts structured info from scanned documents (German or English). Perform OCR on the images.",
                    "Return ONLY JSON with this shape:",
                    "{",
                    '  "summary": "1 short plain-language sentence (what this letter is about)",',
                    '  "document_kind": "letter | invoice | contract | notice | info | other",',
                    '  "key_fields": {',
                    '    "language": "de",',
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
                    '  "category_suggestion": { "path": ONE of these: ["Expenses","Phone"], ["Expenses","Rent"], ["Expenses","Utilities"], ["Expenses","Insurance"], ["Expenses","Taxes"], ["Expenses","Bank Statements"], ["Expenses","Invoices"], ["Documents"], "confidence": 0.8 },',
                    '  "task_suggestion": { "should_create_task": true/false, "title": "...", "description": "...", "due_date": "YYYY-MM-DD or null", "urgency": "low | normal | high" }',
                    "}",
                    "Use null for unknown fields. If the letter just informs and asks to wait for another letter, set action_required=false and fill follow_up with that note.",
                    "Keep wording simple and short (no legal jargon).",
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
      if (!parsed || typeof parsed.summary !== "string" || parsed.summary.trim().length === 0) {
        throw new Error("OpenAI vision returned empty summary.");
      }
      return parsed;
    };

    let parsedJson;

    if (textContent && textContent.trim().length > 0) {
      parsedJson = await callTextModel(textContent);
    } else if (isPdf) {
      const images = await renderPdfImages(buffer);
      parsedJson = await callVisionModel(images);
    } else if (isImage) {
      const mime = lowerPath.endsWith(".png") ? "image/png" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      parsedJson = await callVisionModel([dataUrl]);
    } else {
      throw new Error(
        "No text extracted and file type unsupported for OCR fallback."
      );
    }

    const { error: insertError } = await supabase.from("extractions").insert({
      document_id: doc.id,
      user_id: doc.user_id,
      content: parsedJson,
    });
    if (insertError) throw insertError;

    // Upsert category and attach
    const mappedPath = mapToCategoryPath(parsedJson);
    const catPath = parsedJson?.category_suggestion?.path;
    const chosenPath =
      Array.isArray(mappedPath) && mappedPath.length > 0
        ? mappedPath
        : Array.isArray(catPath) && catPath.length > 0
          ? catPath
          : [];
    if (chosenPath.length > 0) {
      try {
        const normalizedPath = chosenPath
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
      await maybeCreateTaskFromSuggestion(
        supabase,
        doc.user_id,
        doc.id,
        parsedJson?.task_suggestion
      );
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
