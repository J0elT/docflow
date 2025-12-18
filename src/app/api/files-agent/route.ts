/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import JSZip from "jszip";
import { formatDateYmdMon, replaceIsoDatesInText } from "@/lib/dateFormat";

export const runtime = "nodejs";
const TOKEN_WINDOW = 3000;

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

type CategoryRow = { id: string; name: string; parent_id: string | null };

type DocRecord = {
  id: string;
  title: string;
  created_at: string;
  status: string;
  storage_path: string | null;
  category_id: string | null;
  category_path: string[] | null;
  sender: string | null;
  topic: string | null;
  domain_profile: string | null;
  case_labels: string[] | null;
  tags: string[] | null;
  amount_total: number | null;
  currency: string | null;
  due_date: string | null;
  has_open_tasks: boolean;
  raw_text: string | null;
  summary: string | null;
};

type TaskRecord = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  urgency: string | null;
  document_id: string | null;
};

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

const normalizeStr = (value: any): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
};

const normalizePath = (arr: any): string[] | null => {
  if (!Array.isArray(arr)) return null;
  const cleaned = arr
    .filter((s) => typeof s === "string" && s.trim())
    .map((s) => s.trim());
  return cleaned.length ? cleaned : null;
};

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

const ensureGalaxySession = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  uiLang: string | null
) => {
  const { data, error } = await supabase
    .from("assistant_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("assistant", "galaxy")
    .is("document_id", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw error;
  const existingId = Array.isArray(data) && data[0]?.id ? data[0].id : null;
  if (existingId) {
    const update: Record<string, unknown> = { last_used_at: new Date().toISOString() };
    if (uiLang) update.lang = uiLang;
    await supabase.from("assistant_sessions").update(update).eq("id", existingId);
    return existingId;
  }
  const { data: created, error: createErr } = await supabase
    .from("assistant_sessions")
    .insert({ user_id: userId, assistant: "galaxy", document_id: null, lang: uiLang || null })
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

const clearGalaxySession = async (supabase: ReturnType<typeof supabaseAdmin>, userId: string) => {
  const { data, error } = await supabase
    .from("assistant_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("assistant", "galaxy")
    .is("document_id", null);
  if (error) throw error;
  const ids = (data as any[])?.map((r) => r.id).filter(Boolean) ?? [];
  if (ids.length) {
    await supabase.from("assistant_sessions").delete().in("id", ids);
  }
};

const buildCategoryPath = (id: string | null, categories: CategoryRow[]): string[] | null => {
  if (!id) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: string[] = [];
  let current: string | null = id;
  let guard = 0;
  while (current && guard < 20) {
    guard += 1;
    const node = byId.get(current);
    if (!node) break;
    path.unshift(node.name);
    current = node.parent_id;
  }
  return path.length ? path : null;
};

const ensureCategoryPath = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  categories: CategoryRow[],
  path: string[],
  createIfMissing: boolean
): Promise<{ categoryId: string | null; created: string[] }> => {
  let parentId: string | null = null;
  const created: string[] = [];
  for (const segment of path) {
    const match = categories.find(
      (c) => c.parent_id === parentId && c.name.toLowerCase() === segment.toLowerCase()
    );
    if (match) {
      parentId = match.id;
      continue;
    }
    if (!createIfMissing) {
      return { categoryId: null, created };
    }
    const { data, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name: segment, parent_id: parentId })
      .select("id, name, parent_id")
      .single();
    if (error) throw error;
    const row = data as CategoryRow;
    categories.push(row);
    created.push(segment);
    parentId = row.id;
  }
  return { categoryId: parentId, created };
};

const buildGalaxyContextBlock = (docs: DocRecord[], tasks: TaskRecord[], uiLang: string | null) => {
  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    const ymd = iso.slice(0, 10);
    return formatDateYmdMon(ymd, uiLang) ?? ymd;
  };

  const recent = [...docs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)
    .map((d) => {
      const created = formatDate(d.created_at) || d.created_at.slice(0, 10);
      const cat = d.category_path?.length ? d.category_path.join(" > ") : "Uncategorized";
      const taskFlag = d.has_open_tasks ? " (open tasks)" : "";
      return `- ${d.id} | ${replaceIsoDatesInText(d.title, uiLang) ?? d.title} | ${created} | ${cat}${taskFlag}`;
    });

  const rootCounts = new Map<string, number>();
  docs.forEach((d) => {
    const root = d.category_path?.[0] || "Uncategorized";
    rootCounts.set(root, (rootCounts.get(root) ?? 0) + 1);
  });
  const topRoots = Array.from(rootCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => `- ${name}: ${count}`);

  const openTasks = tasks.filter((t) => t.status !== "done");
  const nextTasks = [...openTasks]
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    })
    .slice(0, 6)
    .map((t) => {
      const due = formatDate(t.due_date) || "no due date";
      return `- ${t.id} | ${t.title} | ${due}${t.document_id ? ` | doc ${t.document_id}` : ""}`;
    });

  const lines = [
    `DOCFLOW CONTEXT (for grounding; use tools for exact retrieval):`,
    `Documents: ${docs.length}`,
    `Open tasks: ${openTasks.length}`,
    topRoots.length ? `Top categories:\n${topRoots.join("\n")}` : "",
    recent.length ? `Recent documents:\n${recent.join("\n")}` : "",
    nextTasks.length ? `Next open tasks:\n${nextTasks.join("\n")}` : "",
  ].filter(Boolean);

  return lines.join("\n\n");
};

const systemPrompt = `
You are Galaxy, DocFlow's cross-document assistant (upload, extraction, categories, tasks, bundles). You work over ALL documents for this user.
Rules:
- Stay on-topic: documents, tasks, deadlines, categories, exports, and moves. If the user goes off-topic, redirect back to documents in ONE sentence.
- If the user asks for a deep explanation of ONE specific document, redirect to Clarity in ONE sentence (Clarity = single-document deep dive).
- Use tools for facts; never invent document IDs, numbers, or quotes. If something is missing, say so.
- If scope is unclear (time window, case, personal vs business, country/profile), ask up to 3 concise clarifying questions before doing heavy work.
- Confirmations: require explicit confirmation only before write actions (moving documents, creating categories, exporting/bundling). No confirmation needed for read-only actions (list/search/summarize/aggregate).
- Bundle confirmation: when asking to confirm a bundle_export, list the documents as a simple numbered list with TITLE only (no IDs, keep it short). 
- Bundle download links: after a successful bundle_export, include exactly one short download link using the returned download_url (do not output raw Supabase signed URLs).
Output:
- Always include: short answer, applied filters/assumptions, included docs (title + date/category when relevant), and next-step options when appropriate.
Dates:
- Format calendar dates using the user's UI conventions (German: DD.MM.YYYY; otherwise: D MMM YYYY).
`;

type ToolHandler = (args: any) => Promise<any>;

const buildToolHandlers = (
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  docs: DocRecord[],
  categories: CategoryRow[],
  tasks: TaskRecord[],
  downloadBase?: string
): Record<string, ToolHandler> => {
  const baseUrl = (downloadBase || "").replace(/\/+$/, "");
  const docsById = new Map(docs.map((d) => [d.id, d]));
  const openTasksByDoc = new Map<string, TaskRecord[]>();
  tasks
    .filter((t) => t.status !== "done" && t.document_id)
    .forEach((t) => {
      const list = openTasksByDoc.get(t.document_id!) || [];
      list.push(t);
      openTasksByDoc.set(t.document_id!, list);
    });

  const applyFilters = (input: any): DocRecord[] => {
    const {
      time_from,
      time_to,
      sender,
      topic,
      category_path,
      has_open_tasks,
      case_label,
    }: {
      time_from?: string | null;
      time_to?: string | null;
      sender?: string | null;
      topic?: string | null;
      category_path?: string[] | null;
      has_open_tasks?: boolean | null;
      case_label?: string | null;
    } = input || {};

    return docs.filter((doc) => {
      if (time_from && new Date(doc.created_at) < new Date(time_from)) return false;
      if (time_to && new Date(doc.created_at) > new Date(time_to)) return false;
      if (sender && (!doc.sender || !doc.sender.toLowerCase().includes(sender.toLowerCase()))) return false;
      if (topic && (!doc.topic || !doc.topic.toLowerCase().includes(topic.toLowerCase()))) return false;
      if (case_label) {
        const labels = doc.case_labels?.map((c) => c.toLowerCase()) ?? [];
        if (!labels.includes(case_label.toLowerCase())) return false;
      }
      if (Array.isArray(category_path) && category_path.length) {
        const pathLower = category_path.map((p) => p.toLowerCase());
        const docPath = doc.category_path?.map((p) => p.toLowerCase()) ?? [];
        const matches = pathLower.every((seg) => docPath.includes(seg));
        if (!matches) return false;
      }
      if (has_open_tasks === true && !doc.has_open_tasks) return false;
      if (has_open_tasks === false && doc.has_open_tasks) return false;
      return true;
    });
  };

  return {
    list_documents: async (args: any) => {
      const filtered = applyFilters(args);
      return {
        count: filtered.length,
        docs: filtered.slice(0, args?.limit ?? 30).map((d) => ({
          id: d.id,
          title: d.title,
          sender: d.sender,
          topic: d.topic,
          created_at: d.created_at,
          category_path: d.category_path,
          has_open_tasks: d.has_open_tasks,
          due_date: d.due_date,
          amount_total: d.amount_total,
        })),
      };
    },
    semantic_search: async (args: any) => {
      const query: string = args?.query || "";
      if (!query.trim()) return { docs: [] };
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const filtered = applyFilters(args);
      const scored = filtered
        .map((d) => {
          const haystack = [
            d.title,
            d.sender,
            d.topic,
            d.summary,
            d.raw_text ? d.raw_text.slice(0, 2000) : "",
            ...(d.tags ?? []),
            ...(d.case_labels ?? []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          let score = 0;
          terms.forEach((t) => {
            if (haystack.includes(t)) score += 1;
          });
          return { doc: d, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, args?.limit ?? 30);
      return {
        count: scored.length,
        docs: scored.map((s) => ({
          id: s.doc.id,
          title: s.doc.title,
          sender: s.doc.sender,
          topic: s.doc.topic,
          created_at: s.doc.created_at,
          category_path: s.doc.category_path,
          score: s.score,
        })),
      };
    },
    aggregate: async (args: any) => {
      const filtered = applyFilters(args);
      const by = args?.group_by as "year" | "category" | "sender" | undefined;
      const rows =
        filtered
          .filter((d) => typeof d.amount_total === "number" && Number.isFinite(d.amount_total))
          .map((d) => ({
            id: d.id,
            amount: d.amount_total ?? 0,
            currency: d.currency ?? "EUR",
            year: d.due_date ? new Date(d.due_date).getFullYear() : new Date(d.created_at).getFullYear(),
            category: d.category_path?.join(" > ") ?? "Uncategorized",
            sender: d.sender ?? "Unknown",
          })) ?? [];
      if (!rows.length) return { groups: [], assumptions: "No amounts available" };
      const groups: Record<string, { total: number; doc_ids: string[]; currency: string }> = {};
      rows.forEach((r) => {
        const key =
          by === "year" ? String(r.year) : by === "category" ? r.category : by === "sender" ? r.sender : "all";
        if (!groups[key]) groups[key] = { total: 0, doc_ids: [], currency: r.currency };
        groups[key].total += r.amount;
        groups[key].doc_ids.push(r.id);
      });
      return {
        groups: Object.entries(groups).map(([label, payload]) => ({
          label,
          total: payload.total,
          currency: payload.currency,
          doc_ids: payload.doc_ids,
        })),
        assumptions: by ? `Grouped by ${by}` : "No grouping",
      };
    },
    tasks: async (args: any) => {
      const status = args?.status as string | null;
      const due_before = args?.due_before as string | null;
      const doc_id = args?.doc_id as string | null;
      const filtered = tasks.filter((t) => {
        if (status && t.status !== status) return false;
        if (doc_id && t.document_id !== doc_id) return false;
        if (due_before && t.due_date && new Date(t.due_date) > new Date(due_before)) return false;
        return true;
      });
      const sorted = filtered.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
      return { tasks: sorted.slice(0, args?.limit ?? 30) };
    },
    bundle_export: async (args: any) => {
      if (args?.confirmed !== true) {
        return {
          error: "confirmation_required",
          note: "User confirmation required. Ask the user to confirm the exact doc set before calling bundle_export with confirmed=true.",
        };
      }
      const docIds: string[] = Array.isArray(args?.doc_ids)
        ? args.doc_ids.filter((s: any) => typeof s === "string")
        : [];
      const existing = docIds.filter((id) => docsById.has(id));
      if (!existing.length) {
        return { bundle_id: null, download_url: null, doc_ids: [], note: "No valid documents to bundle." };
      }

      const slugify = (raw: string, fallback: string) => {
        const safe = raw
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 64);
        return safe || fallback;
      };

      const inferBundleName = () => {
        if (typeof args?.bundle_name === "string" && args.bundle_name.trim()) {
          return slugify(args.bundle_name.trim(), "orderly-bundle");
        }
        if (args?.all_docs === true || existing.length === docs.length) {
          return "orderly-all-docs";
        }
        if (Array.isArray(args?.category_path) && args.category_path.length) {
          return slugify(args.category_path.join("-"), "orderly-bundle");
        }
        if (existing.length === 1) {
          const only = docsById.get(existing[0]);
          if (only?.title) return slugify(only.title, "orderly-bundle");
        }
        return `orderly-bundle-${existing.length}-docs`;
      };

      const bundleBase = inferBundleName();

      try {
        const zip = new JSZip();
        const added: string[] = [];
        for (const id of existing) {
          const doc = docsById.get(id);
          if (!doc?.storage_path) continue;
          const { data, error } = await supabase.storage.from("documents").download(doc.storage_path);
          if (error || !data) continue;
          const arrayBuf = await data.arrayBuffer();
          const filename =
            doc.storage_path.split("/").pop() ||
            `${(doc.title || "document").slice(0, 40).replace(/\s+/g, "_") || "file"}.bin`;
          zip.file(filename, arrayBuf);
          added.push(id);
        }

        if (!added.length) {
          return { bundle_id: null, download_url: null, doc_ids: [], note: "No files could be added to the bundle." };
        }

        const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
        const bundleId = bundleBase;
        const bundleFilename = `${bundleBase}.zip`;
        const bundlePath = `${userId}/bundles/${bundleFilename}`;
        const { error: uploadErr } = await supabase.storage
          .from("documents")
          .upload(bundlePath, zipBuffer, { contentType: "application/zip", upsert: true });
        if (uploadErr) throw uploadErr;

        const downloadUrl = `${baseUrl || ""}/bundles/download?name=${encodeURIComponent(bundleFilename)}`;

        return {
          bundle_id: bundleId,
          download_url: downloadUrl,
          doc_ids: added,
          note: downloadUrl ? null : "Download URL missing; please retry.",
        };
      } catch (err) {
        console.error("bundle_export failed", err);
        return { bundle_id: null, download_url: null, doc_ids: existing, note: "Bundle creation failed." };
      }
    },
    reorganize_documents: async (args: any) => {
      if (args?.confirmed !== true) {
        return {
          error: "confirmation_required",
          note: "User confirmation required. Ask the user to confirm the move before calling reorganize_documents with confirmed=true.",
        };
      }
      const docIds: string[] = Array.isArray(args?.doc_ids)
        ? args.doc_ids.filter((s: any) => typeof s === "string")
        : [];
      const path = normalizePath(args?.new_category_path) ?? [];
      // Default: allow creating the target path when confirmed, unless explicitly disabled.
      const create = args?.create_if_missing === false ? false : true;
      if (!docIds.length || !path.length) {
        return { moved: [], skipped: docIds, created_categories: [], reason: "doc_ids and new_category_path required" };
      }
      const { categoryId, created } = await ensureCategoryPath(supabase, userId, categories, path, create);
      if (!categoryId) {
        return { moved: [], skipped: docIds, created_categories: [], reason: "category path missing and create_if_missing=false" };
      }
      const moved: { doc_id: string; from: string | null; to: string }[] = [];
      for (const id of docIds) {
        const doc = docsById.get(id);
        if (!doc) continue;
        const from = doc.category_path?.join(" > ") ?? null;
        await supabase.from("documents").update({ category_id: categoryId }).eq("id", id).eq("user_id", userId);
        doc.category_id = categoryId;
        doc.category_path = path;
        moved.push({ doc_id: id, from, to: path.join(" > ") });
      }
      return { moved, skipped: docIds.filter((id) => !docsById.has(id)), created_categories: created };
    },
  };
};

const toolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "List documents with optional filters (time, sender, topic, case, category path, has open tasks).",
      parameters: {
        type: "object",
        properties: {
          time_from: { type: "string", description: "ISO date lower bound" },
          time_to: { type: "string", description: "ISO date upper bound" },
          sender: { type: "string" },
          topic: { type: "string" },
          category_path: { type: "array", items: { type: "string" } },
          has_open_tasks: { type: "boolean" },
          case_label: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "semantic_search",
      description: "Search documents by text/semantic keywords plus optional filters.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          time_from: { type: "string" },
          time_to: { type: "string" },
          sender: { type: "string" },
          topic: { type: "string" },
          category_path: { type: "array", items: { type: "string" } },
          has_open_tasks: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate",
      description: "Aggregate amounts across documents; supports group_by year/category/sender.",
      parameters: {
        type: "object",
        properties: {
          time_from: { type: "string" },
          time_to: { type: "string" },
          sender: { type: "string" },
          topic: { type: "string" },
          category_path: { type: "array", items: { type: "string" } },
          has_open_tasks: { type: "boolean" },
          group_by: { type: "string", enum: ["year", "category", "sender"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "tasks",
      description: "List tasks filtered by status/due date/doc.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "done"] },
          due_before: { type: "string" },
          doc_id: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bundle_export",
      description:
        "Create a zip bundle of documents (requires confirmed=true) and return a download_url for the user.",
      parameters: {
        type: "object",
        properties: {
          doc_ids: { type: "array", items: { type: "string" } },
          confirmed: { type: "boolean", description: "Set true only after the user confirmed the exact doc set." },
        },
        required: ["doc_ids", "confirmed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reorganize_documents",
      description:
        "Move documents to a category path (requires confirmed=true). Only create missing categories if create_if_missing is true or explicitly confirmed.",
      parameters: {
        type: "object",
        properties: {
          doc_ids: { type: "array", items: { type: "string" } },
          new_category_path: { type: "array", items: { type: "string" } },
          create_if_missing: {
            type: "boolean",
            description: "Defaults to true once confirmed. Set false only to block creating missing categories.",
          },
          confirmed: { type: "boolean", description: "Set true only after the user explicitly confirmed the move." },
        },
        required: ["doc_ids", "new_category_path", "confirmed"],
      },
    },
  },
];

const runToolsLoop = async (
  openai: OpenAI,
  messages: any[],
  handlers: Record<string, ToolHandler>
): Promise<string> => {
  let depth = 0;
  while (depth < 4) {
    depth += 1;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: toolDefinitions,
      temperature: 0.3,
    });
    const choice = completion.choices[0];
    const message = choice.message;
    if (message.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        const fnCall = (call as any)?.function;
        if (!fnCall || typeof fnCall.name !== "string") continue;
        const name = fnCall.name;
        let args = {};
        try {
          args = fnCall.arguments ? JSON.parse(fnCall.arguments) : {};
        } catch (err) {
          args = {};
        }
        const handler = handlers[name];
        let result: any;
        if (handler) {
          try {
            result = await handler(args);
          } catch (err) {
            result = { error: err instanceof Error ? err.message : "tool_error" };
          }
        } else {
          result = { error: "unknown tool" };
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }
    const content = message.content ?? "Keine Antwort verfügbar.";
    messages.push({ role: "assistant", content });
    return content;
  }
  return "Konnte nicht fertigstellen (zu viele Tool-Schritte).";
};

export async function GET(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const url = new URL(request.url);
    const uiLang = url.searchParams.get("lang");
    const token = parseAuthToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const sessionId = await ensureGalaxySession(supabase, user.id, uiLang);
    const messages = await loadSessionMessages(supabase, sessionId);
    return NextResponse.json({ messages });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load chat" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  try {
    const body = await request.json().catch(() => null);
    const uiLang: string | null = typeof body?.uiLang === "string" && body.uiLang.trim() ? body.uiLang.trim() : null;
    const action: string | undefined = body?.action;
    const messages: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages
          .filter((m: any) => m?.role === "user" && typeof m?.content === "string")
          .map((m: any) => ({ role: m.role, content: m.content }))
      : [];
    const clearRequested = action === "clear";
    if (!clearRequested && !messages.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const token = parseAuthToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = user.id;
    if (clearRequested) {
      await clearGalaxySession(supabase, userId);
      return NextResponse.json({ messages: [] });
    }

    const { data: categoriesData, error: catErr } = await supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("user_id", userId);
    if (catErr) throw catErr;
    const categories = (categoriesData as CategoryRow[]) ?? [];

    const { data: docsData, error: docErr } = await supabase
      .from("documents")
      .select(
        "id, user_id, title, status, created_at, storage_path, category_id, case_id, extra:extractions(content, created_at)"
      )
      .eq("user_id", userId)
      .neq("status", "error");
    if (docErr) throw docErr;

    const { data: tasksData, error: taskErr } = await supabase
      .from("tasks")
      .select("id, title, status, due_date, urgency, document_id")
      .eq("user_id", userId);
    if (taskErr && (taskErr as any).code !== "42P01") throw taskErr;

    const tasks: TaskRecord[] = Array.isArray(tasksData)
      ? tasksData.map((t: any) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          due_date: t.due_date,
          urgency: t.urgency ?? null,
          document_id: t.document_id ?? null,
        }))
      : [];
    const openTasks = new Set(tasks.filter((t) => t.status !== "done" && t.document_id).map((t) => t.document_id as string));

    const docs: DocRecord[] = (docsData as any[]).map((doc) => {
      const latest =
        Array.isArray(doc.extra) && doc.extra.length
          ? [...doc.extra].sort(
              (a: any, b: any) =>
                new Date(b?.created_at ?? 0).getTime() - new Date(a?.created_at ?? 0).getTime()
            )[0]?.content ?? null
          : null;
      const key = (latest?.key_fields ?? {}) as any;
      const amount =
        typeof key?.amount_total === "number" && Number.isFinite(key.amount_total) ? key.amount_total : null;
      const dueDate = normalizeStr(key?.due_date);
      return {
        id: doc.id,
        title: doc.title,
        status: doc.status,
        storage_path: doc.storage_path ?? null,
        created_at: doc.created_at,
        category_id: doc.category_id ?? null,
        category_path: normalizePath(key?.category_path) || buildCategoryPath(doc.category_id ?? null, categories),
        sender: normalizeStr(key?.sender),
        topic: normalizeStr(key?.topic) || normalizeStr(key?.primary_topic_label),
        domain_profile: normalizeStr(key?.domain_profile_label),
        case_labels: Array.isArray(key?.case_labels)
          ? key.case_labels.filter((s: any): s is string => typeof s === "string")
          : null,
        tags: Array.isArray(latest?.tags)
          ? latest.tags.filter((s: any): s is string => typeof s === "string")
          : null,
        amount_total: amount,
        currency: normalizeStr(key?.currency),
        due_date: dueDate,
        has_open_tasks: doc.id ? openTasks.has(doc.id) : false,
        raw_text: normalizeStr(key?.raw_text),
        summary: normalizeStr(latest?.summary) || normalizeStr(latest?.main_summary),
      };
    });

    const sessionId = await ensureGalaxySession(supabase, userId, uiLang);
    const storedMessages = await loadSessionMessages(supabase, sessionId);

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error("Missing OPENAI_API_KEY");
    const openai = new OpenAI({ apiKey: openaiKey });

    const origin = new URL(request.url).origin;
    const handlers = buildToolHandlers(supabase, userId, docs, categories, tasks, origin);
    const contextBlock = buildGalaxyContextBlock(docs, tasks, uiLang);

    const chatMessages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: contextBlock,
      },
      ...storedMessages,
      ...messages,
    ];

    const assistant = await runToolsLoop(openai, chatMessages, handlers);

    try {
      await saveSessionMessages(supabase, sessionId, userId, [...messages, { role: "assistant", content: assistant }]);
    } catch (err) {
      console.warn("files chat message insert skipped", err);
    }
    const updatedMessages = await loadSessionMessages(supabase, sessionId);

    return NextResponse.json({
      assistant,
      messages: updatedMessages,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to run files chat" },
      { status: 500 }
    );
  }
}
