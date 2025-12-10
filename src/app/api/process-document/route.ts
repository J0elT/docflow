/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateExtraction, type ExtractionPayload } from "@/lib/extractionSchema";
import { logTelemetryEvent } from "@/lib/telemetry";

export const runtime = "nodejs";

type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  storage_path: string;
  category_id?: string | null;
  created_at?: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
  global_taxonomy_id?: string | null;
};

type TypedTaxonomyKind = "sender_type" | "topic" | "domain_profile";
type TypedTaxonomyTable = "taxonomy_sender_types" | "taxonomy_topics" | "taxonomy_domain_profiles";

const CATEGORY_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_CATEGORY_SEED = [
  "Identity & Civil Status",
  "Work & Income",
  "Housing & Property",
  "Health & Medical",
  "Insurance (non-health)",
  "Finance & Assets",
  "Government, Tax & Public Admin",
  "Education & Training",
  "Family & Social",
  "Utilities & Telecom",
  "Purchases & Subscriptions",
  "Legal & Disputes",
  "Other & Miscellaneous",
];
const SUPPORTED_LANGUAGES = ["de", "en", "ro", "tr", "fr", "es", "ar", "pt", "ru", "pl", "uk"] as const;
type SupportedLang = (typeof SUPPORTED_LANGUAGES)[number];

const normalizeCategorySegment = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  return cleaned || null;
};


const formatSegmentDisplay = (segment: string) => {
  const cleaned = segment.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return segment;
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
};

const normalizeForMatch = (raw: string | null | undefined): string | null => {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.trim().toLowerCase();
  s = s.replace(/\s*\(\d+\)\s*$/, "");
  s = s.replace(/[\s_-]+/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || null;
};

const sanitizeDomainProfileLabel = (raw: string | null | undefined): string | null => {
  if (!raw || typeof raw !== "string") return null;
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/\s*\(\d+\)\s*$/, "");
  cleaned = cleaned.replace(/\s+\/\s+$/, "");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned || null;
};

const normalizeTitle = (raw: string | null | undefined): string | null => {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.toLowerCase();
  s = s.replace(/\d{2,4}[./-]\d{1,2}[./-]\d{1,2}/g, " "); // dates
  s = s.replace(/\d+/g, " "); // numbers
  s = s.replace(/\b(bescheid|schreiben|brief|notice|letter|rechnung|invoice|änd(erung|erungsbescheid)|änderung|anhörung|mitteilung|entscheid|decision|update|info)\b/gi, " ");
  s = s.replace(/[_/()-]+/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || null;
};

const tokenize = (raw: string | null | undefined): Set<string> => {
  const s = normalizeTitle(raw);
  if (!s) return new Set();
  return new Set(
    s
      .split(" ")
      .map((w) => w.trim())
      .filter(Boolean)
  );
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  a.forEach((v) => {
    if (b.has(v)) inter += 1;
  });
  const union = a.size + b.size - inter;
  if (union === 0) return 0;
  return inter / union;
};

const normalizeCategoryPath = (path: string[] | null | undefined): string[] => {
  if (!path || !Array.isArray(path)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const segment of path) {
    const normalized = normalizeCategorySegment(segment);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(normalized);
  }
  return cleaned.slice(0, 6); // avoid runaway deep paths
};

const slugifySegment = (segment: string) =>
  segment
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .trim()
    .replace(/\s+/g, "_");

const buildGlobalSlug = (parts: string[]) => parts.map((p) => slugifySegment(p)).join("/");

const extractPrimaryAmount = (parsed: ParsedExtraction | null | undefined): number | null => {
  const amtTotal =
    typeof parsed?.key_fields?.amount_total === "number" ? parsed?.key_fields?.amount_total : null;
  if (amtTotal && Number.isFinite(amtTotal)) return amtTotal;
  const firstAmount =
    Array.isArray(parsed?.amounts) && parsed?.amounts?.length
      ? parsed?.amounts?.find((a) => typeof a?.value === "number" && Number.isFinite(a.value))
      : null;
  return firstAmount?.value ?? null;
};

type LabelCandidate = {
  type: "sender_type" | "topic" | "domain_profile" | "case";
  label: string;
};

type MatchingContext = {
  sender: string | null;
  categoryId: string | null;
  title: string | null;
  refIds: string[];
  amount: number | null;
  domainProfileId: string | null;
};

type ReferenceIds = {
  steuernummer?: string | null;
  kundennummer?: string | null;
  vertragsnummer?: string | null;
};

type KeyFields = {
  language?: string | null;
  sender?: string | null;
  topic?: string | null;
  letter_date?: string | null;
  due_date?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  action_required?: boolean;
  action_description?: string | null;
  follow_up?: string | null;
  reference_ids?: ReferenceIds | null;
  category_path?: string[] | null;
};

type CategorySuggestion = {
  path?: string[] | null;
  confidence?: number | null;
  slug?: string | null; // back-compat
};

type TaskSuggestion = {
  should_create_task?: boolean;
  title?: string | null;
  description?: string | null;
  due_date?: string | null;
  urgency?: "low" | "normal" | "high" | null;
};

type ParsedExtraction = ExtractionPayload & {
  summary?: string | null;
  badge_text?: string | null;
  main_summary?: string | null;
  extra_details?: string[] | null;
  document_kind?: string | null;
  category_suggestion?: CategorySuggestion | null;
  task_suggestion?: TaskSuggestion | null;
  key_fields?: KeyFields | null;
};

function collectLabelCandidates(parsed: ParsedExtraction | null | undefined): LabelCandidate[] {
  const labels: LabelCandidate[] = [];
  const push = (type: LabelCandidate["type"], value: string | null | undefined) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    labels.push({ type, label: trimmed });
  };
  push("sender_type", (parsed as any)?.key_fields?.sender_type_label);
  push("topic", (parsed as any)?.key_fields?.primary_topic_label ?? (parsed as any)?.key_fields?.topic);
  push("domain_profile", (parsed as any)?.key_fields?.domain_profile_label);
  const caseLabels = (parsed as any)?.key_fields?.case_labels;
  if (Array.isArray(caseLabels)) {
    caseLabels.forEach((c: any) => push("case", typeof c === "string" ? c : null));
  }
  return labels;
}

const logLabelCandidates = async (
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  labels: LabelCandidate[],
  title: string | null
) => {
  if (!labels.length) return;
  for (const entry of labels) {
    try {
      const { data: existing, error } = await supabase
        .from("label_candidates")
        .select("id, raw_variants, doc_count, example_titles")
        .eq("user_id", userId)
        .eq("type", entry.type)
        .eq("label_text", entry.label)
        .maybeSingle();
      if (error && (error as { code?: string }).code !== "PGRST116" && (error as { code?: string }).code !== "PGRST103") {
        throw error;
      }
      if (existing?.id) {
        const variants: string[] = Array.isArray(existing.raw_variants) ? existing.raw_variants : [];
        const nextVariants = variants.includes(entry.label) ? variants : [...variants, entry.label];
        const examples: string[] = Array.isArray(existing.example_titles) ? existing.example_titles : [];
        const nextExamples = title && !examples.includes(title) ? [...examples, title].slice(-5) : examples;
        await supabase
          .from("label_candidates")
          .update({
            raw_variants: nextVariants,
            doc_count: (existing.doc_count ?? 0) + 1,
            last_seen_at: new Date().toISOString(),
            example_titles: nextExamples,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("label_candidates").insert({
          user_id: userId,
          type: entry.type,
          label_text: entry.label,
          raw_variants: [entry.label],
          doc_count: 1,
          example_titles: title ? [title] : [],
        });
      }
    } catch (err: any) {
      // If table doesn't exist or RLS blocks, skip without failing processing
      const code = (err as { code?: string })?.code;
      if (code === "42P01" || code === "PGRST205") {
        return;
      }
      console.warn("label candidate logging failed", err);
    }
  }
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

  const categoryPath = mapToCategoryPath(parsed).path;
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

function coarseMapSlugToPath(slug?: string | null): string[] {
  if (!slug) return [];
  const lower = slug.toLowerCase();
  if (lower.includes("finanz") || lower.includes("steuer")) return ["Finance & Assets"];
  if (lower.includes("krank") || lower.includes("gesund") || lower.includes("health")) return ["Health & Medical"];
  if (lower.includes("miete") || lower.includes("wohn") || lower.includes("housing") || lower.includes("rent")) return ["Housing & Property"];
  if (lower.includes("arbeit") || lower.includes("job") || lower.includes("employment")) return ["Work & Income"];
  if (lower.includes("behoerd") || lower.includes("behörd") || lower.includes("amt") || lower.includes("aufenthalt") || lower.includes("gov"))
    return ["Government, Tax & Public Admin"];
  if (lower.includes("versicher")) return ["Insurance (non-health)"];
  return ["Other & Miscellaneous"];
}

const UNEMPLOYMENT_CANONICAL_PATH = [
  "Government, Tax & Public Admin",
  "Public Benefits (general)",
  "Unemployment Benefits",
];

const isUnemploymentSegment = (value: string | undefined) => {
  if (!value) return false;
  const lower = value.toLowerCase();
  return (
    lower.includes("arbeitslos") ||
    lower.includes("unemployment") ||
    lower.includes("jobcenter") ||
    lower.includes("arbeitsagentur") ||
    lower.includes("sbg iii") ||
    lower.includes("sgb iii")
  );
};

const normalizeCategoryAliases = (path: string[]): string[] => {
  if (!path.length) return path;
  const root = path[0] ?? "";
  const isGovBenefits =
    /government/i.test(root) && /public\s+benefits/i.test(root);
  const isPublicBenefitsOnly = /^public\s+benefits/i.test(root);
  const hasUnemployment = path.some((p) => isUnemploymentSegment(p));

  if (hasUnemployment) {
    return normalizeCategoryPath(UNEMPLOYMENT_CANONICAL_PATH);
  }

  if (isGovBenefits || isPublicBenefitsOnly) {
    const rest = path.slice(1);
    const hasBenefitsChild = rest.length && /public\s+benefits/i.test(rest[0] ?? "");
    const next = ["Government, Tax & Public Admin"];
    if (!hasBenefitsChild) next.push("Public Benefits (general)");
    return normalizeCategoryPath([...next, ...rest]).slice(0, 3);
  }
  return path;
};

function mapToCategoryPath(
  parsed: ParsedExtraction | null | undefined
): { path: string[]; confidence: number | null } {
  const keyPath = normalizeCategoryPath(parsed?.key_fields?.category_path);
  const suggestionPath = normalizeCategoryPath(parsed?.category_suggestion?.path);
  const slugPath = normalizeCategoryPath(coarseMapSlugToPath(parsed?.category_suggestion?.slug));
  const confidence = parsed?.category_suggestion?.confidence ?? null;
  let path: string[] = [];
  if (keyPath.length) {
    path = keyPath;
  } else if (suggestionPath.length) {
    path = suggestionPath;
  } else if (slugPath.length) {
    path = slugPath;
  }

  path = normalizeCategoryAliases(path);

  if (path.length < 3) {
    const domainProfile = sanitizeDomainProfileLabel((parsed as any)?.key_fields?.domain_profile_label);
    if (domainProfile) {
      path = [...path, domainProfile].slice(0, 3);
    }
  }

  path = normalizeCategoryAliases(path);

  return { path, confidence };
}

function normalizeExtraction(
  parsed: ParsedExtraction | null | undefined,
  preferredLanguage: SupportedLang,
  usedPdfOcrFallback: boolean
): ParsedExtraction {
  if (!parsed) return { summary: null, main_summary: null, extra_details: [], key_fields: { language: preferredLanguage } };
  const result = { ...parsed };
  result.main_summary =
    (typeof result.main_summary === "string" && result.main_summary.trim()) ||
    (typeof result.summary === "string" && result.summary.trim()) ||
    null;
  result.summary = result.main_summary || result.summary || null;
  result.extra_details = Array.isArray(result.extra_details)
    ? result.extra_details.filter((s: any) => typeof s === "string" && s.trim().length > 0)
    : [];
  result.key_fields = result.key_fields || {};
  if (!result.key_fields.language) {
    result.key_fields.language = preferredLanguage;
  }
  if (Array.isArray(result.key_fields.category_path)) {
    result.key_fields.category_path = normalizeCategoryPath(result.key_fields.category_path);
  }
  result.category_suggestion = result.category_suggestion || {};
  if (Array.isArray(result.category_suggestion.path)) {
    result.category_suggestion.path = normalizeCategoryPath(result.category_suggestion.path);
  }
  if (usedPdfOcrFallback && !result.badge_text) {
    result.badge_text = "Scanned letter (please double-check numbers)";
  }
  return result;
}

async function ensureTypedTaxonomyEntry(
  supabase: ReturnType<typeof supabaseAdmin>,
  kind: TypedTaxonomyKind,
  label: string | null | undefined
): Promise<string | null> {
  if (!label || typeof label !== "string" || !label.trim()) return null;
  const table: TypedTaxonomyTable =
    kind === "sender_type"
      ? "taxonomy_sender_types"
      : kind === "topic"
      ? "taxonomy_topics"
      : "taxonomy_domain_profiles";
  const normalized = label.trim();
  const { data: existingCanonical, error: canonicalErr } = await supabase
    .from(table)
    .select("id, canonical_label, synonyms")
    .ilike("canonical_label", normalized)
    .limit(1);
  if (canonicalErr) throw canonicalErr;
  if (Array.isArray(existingCanonical) && existingCanonical[0]?.id) {
    return existingCanonical[0].id;
  }

  const { data: existingSyn, error: synErr } = await supabase
    .from(table)
    .select("id, canonical_label, synonyms")
    .contains("synonyms", [normalized])
    .limit(1);
  if (synErr) throw synErr;
  if (Array.isArray(existingSyn) && existingSyn[0]?.id) {
    return existingSyn[0].id;
  }
  const insert = await supabase
    .from(table)
    .insert({
      canonical_label: normalized,
      synonyms: [],
      source: "human",
    })
    .select("id")
    .single();
  if (insert.error) throw insert.error;
  return (insert.data as { id?: string } | null)?.id ?? null;
}

async function selectExistingCase(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  matching: MatchingContext
): Promise<{ caseId: string | null; reason: string | null }> {
  const { data: openCases, error: openErr } = await supabase
    .from("cases")
    .select("id, domain_profile_id, status")
    .eq("user_id", userId)
    .neq("status", "closed");
  if (openErr) throw openErr;
  const openList = Array.isArray(openCases) ? openCases : [];
  if (!openList.length) return { caseId: null, reason: null };

  // Quick win: domain profile exact match
  if (matching.domainProfileId) {
    const exact = openList.find((c) => c.domain_profile_id === matching.domainProfileId);
    if (exact?.id) return { caseId: exact.id, reason: "domain_profile" };
  }

  const openIds = openList.map((c) => c.id);
  const { data: docs, error: docErr } = await supabase
    .from("documents")
    .select("id, title, category_id, case_id, created_at")
    .eq("user_id", userId)
    .not("case_id", "is", null)
    .in("case_id", openIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (docErr) throw docErr;
  const docRows = Array.isArray(docs) ? docs : [];
  const docIds = docRows.map((d) => d.id).filter(Boolean);

  // Load latest extractions for those docs to grab reference ids/sender/amounts
  const latestExtractionByDoc = new Map<string, any>();
  if (docIds.length) {
    const { data: extRows, error: extErr } = await supabase
      .from("extractions")
      .select("document_id, content, created_at")
      .in("document_id", docIds)
      .order("created_at", { ascending: false });
    if (extErr) throw extErr;
    (extRows as any[])?.forEach((row) => {
      if (!row?.document_id) return;
      if (!latestExtractionByDoc.has(row.document_id)) {
        latestExtractionByDoc.set(row.document_id, row.content);
      }
    });
  }

  const normalizeSender = (raw: string | null | undefined) => normalizeTitle(raw);

  const currentTitleTokens = tokenize(matching.title);
  const currentSender = normalizeSender(matching.sender);
  const currentRefIds = new Set(matching.refIds.map((r) => r.toLowerCase()));
  const currentAmount = matching.amount;
  const currentCategory = matching.categoryId;

  let bestCase: { caseId: string | null; score: number; reason: string | null } = {
    caseId: null,
    score: 0,
    reason: null,
  };

  const caseDocsMap = new Map<string, typeof docRows>();
  docRows.forEach((d) => {
    if (!d.case_id) return;
    const arr = caseDocsMap.get(d.case_id) || [];
    arr.push(d);
    caseDocsMap.set(d.case_id as string, arr);
  });

  for (const caseId of openIds) {
    const docsForCase = caseDocsMap.get(caseId) || [];
    if (!docsForCase.length) continue;
    let caseScore = 0;
    let caseReason: string | null = null;

    for (const d of docsForCase) {
      const extraction = latestExtractionByDoc.get(d.id) as ParsedExtraction | undefined;
      const refIds: string[] = [];
      const refObj = extraction?.key_fields?.reference_ids;
      if (refObj && typeof refObj === "object") {
        Object.values(refObj).forEach((val) => {
          if (typeof val === "string" && val.trim()) refIds.push(val.trim());
        });
      }
      const sender = normalizeSender(
        extraction?.key_fields?.sender ||
          (extraction as any)?.key_fields?.sender_type_label ||
          extraction?.key_fields?.domain_profile_label
      );
      const dTitleTokens = tokenize(d.title);
      const amountVal = extractPrimaryAmount(extraction);

      // Hard match on reference id
      const matchRef = refIds.find((r) => currentRefIds.has(r.toLowerCase()));
      if (matchRef) {
        return { caseId, reason: `ref_id:${matchRef}` };
      }

      let score = 0;
      if (matching.domainProfileId && openList.find((c) => c.id === caseId)?.domain_profile_id === matching.domainProfileId) {
        score += 0.4;
      }
      if (currentCategory && d.category_id === currentCategory) {
        score += 0.3;
      }
      if (currentSender && sender && currentSender === sender) {
        score += 0.4;
      } else if (currentSender && sender && currentSender.includes(sender)) {
        score += 0.2;
      }
      const titleSim = jaccard(currentTitleTokens, dTitleTokens);
      score += 0.3 * titleSim;
      if (currentAmount !== null && amountVal !== null && currentAmount > 0 && amountVal > 0) {
        const diff = Math.abs(currentAmount - amountVal) / currentAmount;
        if (diff <= 0.05) score += 0.2;
        else if (diff <= 0.1) score += 0.1;
      }

      if (score > caseScore) {
        caseScore = score;
        caseReason = `score:${score.toFixed(2)} titleSim:${titleSim.toFixed(2)}${currentCategory && d.category_id === currentCategory ? " category" : ""}${currentSender && sender && currentSender === sender ? " sender" : ""}`;
      }
    }

    if (caseScore > bestCase.score) {
      bestCase = { caseId, score: caseScore, reason: caseReason };
    }
  }

  if (bestCase.caseId && bestCase.score >= 0.8) {
    return { caseId: bestCase.caseId, reason: bestCase.reason };
  }

  return { caseId: null, reason: null };
}

async function ensureCaseForDomainProfile(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  domainProfileId: string | null,
  domainProfileLabel: string | null,
  categoryId: string | null,
  matching: MatchingContext
): Promise<{ caseId: string | null; reason: string | null }> {
  const title = domainProfileLabel?.trim() || "Case";
  if (!userId) return { caseId: null, reason: null };

  const { caseId: reusedCaseId, reason } = await selectExistingCase(supabase, userId, matching);
  if (reusedCaseId) return { caseId: reusedCaseId, reason };

  const query = supabase.from("cases").select("id, status").eq("user_id", userId).neq("status", "closed");
  if (domainProfileId) {
    query.eq("domain_profile_id", domainProfileId);
  } else if (categoryId) {
    query.eq("title", title);
  } else {
    return { caseId: null, reason: null };
  }
  const { data: existing, error } = await query.limit(1);
  if (error) throw error;
  const match = Array.isArray(existing) ? existing[0] : null;
  if (match?.id) return { caseId: match.id, reason: "existing_case" };
  const insert = await supabase
    .from("cases")
    .insert({
      user_id: userId,
      title,
      status: "open",
      domain_profile_id: domainProfileId,
    })
    .select("id")
    .single();
  if (insert.error) throw insert.error;
  const newId = (insert.data as { id?: string } | null)?.id ?? null;
  return { caseId: newId, reason: newId ? "created" : null };
}

function validateAndNormalize(raw: any, source: string, preferredLanguage: SupportedLang, usedPdfOcrFallback: boolean) {
  const validated = validateExtraction(raw, source) as ParsedExtraction;
  return normalizeExtraction(validated, preferredLanguage, usedPdfOcrFallback);
}

const buildExtractionPrompt = (preferredLanguage: SupportedLang) =>
  [
    `You extract structured info from documents and respond in ${preferredLanguage}.`,
    "Return ONLY JSON with this shape:",
    "{",
    '  "summary": "Short human-readable summary (<=220 chars)",',
    '  "main_summary": "Repeat summary or null",',
    '  "badge_text": "Short chip about deadline/type or null",',
    '  "extra_details": ["bullet 1","bullet 2"... up to 5, only if new info],',
    '  "document_kind": "letter | invoice | contract | notice | info | other",',
    '  "jurisdiction": { "country_code": "DE|FR|RO|TR|ES|PT|RU|PL|UA|GB|... or null", "region": "state/Land/province or null", "evidence": "short reason (sender, statute, address)" },',
    '  "key_fields": {',
    `    "language": "${preferredLanguage}",`,
    '    "sender": "...",',
    '    "topic": "...",',
    '    "letter_date": "YYYY-MM-DD or null",',
    '    "due_date": "YYYY-MM-DD or null",',
    '    "amount_total": number or null,',
    '    "currency": "EUR" | null,',
    '    "action_required": true/false,',
    '    "action_description": "Plain action <=120 chars or null",',
    '    "follow_up": "Short note if another letter will come, else null",',
    '    "reference_ids": { "steuernummer": null, "kundennummer": null, "vertragsnummer": null },',
    '    "category_path": ["Finanzen"] or null,',
    '    "parties": [ { "role": "sender|recipient|other", "name": "...", "type": "person|organisation|government_body|other", "label": "me|..." } ],',
    '    "sender_type_label": "...",',
    '    "primary_topic_label": "...",',
    '    "domain_profile_label": "...",',
    '    "case_labels": ["..."]',
    "  },",
    '  "category_suggestion": { "path": ["Finanzen","Steuern"], "confidence": 0.0-1.0 },',
    '  "task_suggestion": { "should_create_task": true/false, "title": "...", "description": "...", "due_date": "YYYY-MM-DD or null", "urgency": "low | normal | high" },',
    '  "deadlines": [ { "id": "d1", "date_exact": "YYYY-MM-DD or null", "relative_text": null, "kind": "payment|appeal|provide_documents|appointment|sign_and_return|other", "description": "...", "is_hard_deadline": true/false, "source_snippet": "...", "confidence": 0.0-1.0 } ],',
    '  "amounts": [ { "value": 123.45, "currency": "EUR", "direction": "you_pay|you_receive|neutral_or_unknown", "frequency": "one_off|monthly|yearly|other|unknown", "description": "...", "source_snippet": "...", "confidence": 0.0-1.0 } ],',
    '  "actions_required": [ { "id": "a1", "label": "short", "description": "longer", "due_date": "YYYY-MM-DD or null", "severity": "high|medium|low", "is_blocking": true/false, "source_snippet": "...", "confidence": 0.0-1.0 } ],',
    '  "rights_options": [ { "id": "r1", "description": "...", "related_deadline_ids": ["d1"], "source_snippet": "...", "confidence": 0.0-1.0 } ],',
    '  "consequences_if_ignored": [ { "description": "...", "severity": "high|medium|low", "source_snippet": "...", "confidence": 0.0-1.0 } ],',
    '  "risk_level": "none|low|medium|high",',
    '  "uncertainty_flags": ["deadline_ambiguous","ocr_poor",...],',
    '  "comments_for_user": "Short honest note about uncertainty",',
    '  "field_confidence": { "amounts": 0.8, "deadlines": 0.7 }',
    "}",
    "Rules:",
    "- Always return valid JSON; use null for unknown fields.",
    "- Always provide category_suggestion.path with at least one segment. Use these generic roots only: Identity & Civil Status, Work & Income, Housing & Property, Health & Medical, Insurance (non-health), Finance & Assets, Government, Tax & Public Admin, Education & Training, Family & Social, Utilities & Telecom, Purchases & Subscriptions, Legal & Disputes, Other & Miscellaneous.",
    "- Optionally add up to one child and one subchild (<=3 segments total). Suggested children include:",
    "  Identity & Civil Status: ID Documents; Residency & Permits; Civil Status; Social Security Numbers; Voter & Citizenship",
    "  Work & Income: Employment Contracts; Payslips & Summaries; Unemployment Benefits; Self-Employment & Business; Business Entity Docs; Pensions & Retirement; Sick Leave Certificates",
    "  Housing & Property: Rental Contracts; Rent & Service Charges; Landlord Communication; Utilities in Rent; Home Ownership & Mortgage; Move-in/out & Deposits",
    "  Health & Medical: Health Insurance; Medical Bills & Statements; Treatment & Hospital; Prescriptions & Pharmacy; Disability & Rehab; Vaccinations & Checkups",
    "  Insurance (non-health): Vehicle Insurance; Liability Insurance; Household/Property; Life/Disability Insurance; Travel Insurance; Other Special Insurance",
    "  Finance & Assets: Bank Accounts; Cards & Payment; Loans & Credit; Investments & Savings; Debt Collection & Enforcement; Financial Summaries",
    "  Government, Tax & Public Admin: Income Tax; Other Taxes & Fees; Social Security Contributions; Public Benefits (general); Fines & Penalties; General Gov Correspondence",
    "  Education & Training: School & University; Student Finance; Courses & Training; Childcare/Education",
    "  Family & Social: Child Benefits & Support; Alimony & Child Support; Eldercare & Support; Family Court Docs; Social Housing Support",
    "  Utilities & Telecom: Electricity/Gas/Heating; Water & Waste; Internet/Broadband; Mobile Phone; TV/Radio License; Public Transport Passes",
    "  Purchases & Subscriptions: Online/Offline Purchases; Warranties & Returns; Software Subscriptions; Media Subscriptions; Gym/Club Memberships",
    "  Legal & Disputes: Court & Police Docs; Lawyer Correspondence; Formal Complaints; Debt Legal Action; Employment Disputes; Housing Disputes",
    "  Other & Miscellaneous: Memberships & Associations; Events/Travel Docs; Misc Personal Admin",
    "- For subchild, use a specific variant if obvious (e.g., Employment Contracts > Termination/Severance; Public Benefits (general) > Unemployment; Loans & Credit > Collections/Enforcement).",
    "- Always include domain_profile_label for the most specific Level 3 (e.g., heating_backpayment_bill, monthly_rent_invoice, service_charge_annual_statement, termination_severance); keep it short and generic.",
    "- Avoid user-specific names; prefer <=3 segments.",
    "- extra_details must not repeat summary; keep 3-5 most important bullets (dates, amounts, obligations, signatures, follow-ups).",
    "- Include source_snippet and confidence where applicable; do not invent dates/amounts.",
    "- If no action is required, set action_required=false and task_suggestion.should_create_task=false.",
    "- If the letter says to wait for another letter, set follow_up and keep action_required=false.",
  ].join("\n");

async function seedDefaultCategoriesIfMissing(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string
) {
  const existing = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .limit(1);
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length > 0) return;

  const inserts = DEFAULT_CATEGORY_SEED.map((name) => ({
    user_id: userId,
    name,
    parent_id: null,
  }));
  const { error } = await supabase.from("categories").insert(inserts);
  if (error) throw error;
}

async function ensureGlobalTaxonomyPath(
  supabase: ReturnType<typeof supabaseAdmin>,
  path: string[]
): Promise<{ globalIds: string[]; finalGlobalId: string | null }> {
  const cleaned = normalizeCategoryPath(path);
  if (!cleaned.length) return { globalIds: [], finalGlobalId: null };

  const globalIds: string[] = [];
  let parentId: string | null = null;
  const cumulative: string[] = [];

  for (const segment of cleaned) {
    cumulative.push(segment);
    const slug = buildGlobalSlug(cumulative);
    const { data: existing, error: fetchErr } = await supabase
      .from("taxonomy_global")
      .select("id, parent_id")
      .eq("slug", slug)
      .maybeSingle();
    if (fetchErr && (fetchErr as any).code !== "PGRST116") throw fetchErr;
    if (existing?.id) {
      parentId = existing.id;
      globalIds.push(existing.id);
      continue;
    }

    // Try to reuse sibling by name or translation (case-insensitive) before inserting a new node
    const siblingQuery = supabase
      .from("taxonomy_global")
      .select("id, name, parent_id")
      .order("name", { ascending: true });
    if (parentId) {
      siblingQuery.eq("parent_id", parentId);
    } else {
      siblingQuery.is("parent_id", null);
    }
    const { data: siblings, error: sibErr } = await siblingQuery;
    if (sibErr && (sibErr as any).code !== "PGRST116") throw sibErr;
    const siblingsArr = Array.isArray(siblings) ? siblings : [];
    const lowerSeg = segment.toLowerCase();
    const normSeg = normalizeForMatch(segment);
    let reusedId: string | null = null;
    for (const s of siblingsArr) {
      if (typeof s?.name === "string") {
        const norm = normalizeForMatch(s.name);
        if ((s.name.trim().toLowerCase() === lowerSeg) || (norm && normSeg && norm === normSeg)) {
          reusedId = s.id;
          break;
        }
      }
    }
    if (!reusedId && siblingsArr.length) {
      const siblingIds = siblingsArr.map((s: any) => s.id).filter(Boolean);
      if (siblingIds.length) {
        const { data: trans, error: transErr } = await supabase
          .from("taxonomy_global_translations")
          .select("taxonomy_id, label")
          .in("taxonomy_id", siblingIds);
        if (transErr && (transErr as any).code !== "PGRST116") throw transErr;
        (trans ?? []).some((t: any) => {
          if (typeof t?.label !== "string") return false;
          const norm = normalizeForMatch(t.label);
          if ((t.label.trim().toLowerCase() === lowerSeg) || (norm && normSeg && norm === normSeg)) {
            reusedId = t.taxonomy_id;
            return true;
          }
          return false;
        });
      }
    }
    if (reusedId) {
      parentId = reusedId;
      globalIds.push(reusedId);
      continue;
    }

    const insertRes = await supabase
      .from("taxonomy_global")
      .insert({
        slug,
        name: segment,
        parent_id: parentId,
        level: cumulative.length,
      })
      .select("id")
      .single();
    if (insertRes.error) throw insertRes.error;
    if (insertRes.data?.id) {
      parentId = insertRes.data.id;
      globalIds.push(insertRes.data.id);
    } else {
      // Fallback: re-read the slug in case of race/dup insert
      const { data: reread, error: rereadErr } = await supabase
        .from("taxonomy_global")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (rereadErr && (rereadErr as any).code !== "PGRST116") throw rereadErr;
      if (reread?.id) {
        parentId = reread.id;
        globalIds.push(reread.id);
      }
    }
  }

  return { globalIds, finalGlobalId: globalIds[globalIds.length - 1] ?? null };
}

async function translateLabelForLocales(
  sourceLabel: string,
  locales: readonly SupportedLang[]
): Promise<Record<string, string>> {
  const fallback: Record<string, string> = {};
  locales.forEach((l) => {
    fallback[l] = formatSegmentDisplay(sourceLabel);
  });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return fallback;

  try {
    const openai = new OpenAI({ apiKey: openaiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Translate the given category label into the requested languages. Return ONLY compact JSON (no markdown, no code fences) with the provided language codes as keys.",
        },
        {
          role: "user",
          content: `Label: "${sourceLabel}"\nLanguages: ${locales.join(
            ", "
          )}\nReturn a pure JSON object, keys exactly the language codes, values short user-facing labels.`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content || "";
    const tryParse = (raw: string) => {
      try {
        return JSON.parse(raw);
      } catch (_) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return JSON.parse(match[0]);
          } catch (_) {
            return null;
          }
        }
        return null;
      }
    };
    const parsed = tryParse(text) || {};
    const result: Record<string, string> = { ...fallback };
    locales.forEach((l) => {
      const candidate = parsed?.[l];
      if (typeof candidate === "string" && candidate.trim()) {
        result[l] = candidate.trim();
      }
    });
    return result;
  } catch (err) {
    console.warn("translateLabelForLocales failed, falling back", err);
    return fallback;
  }
}

async function upsertTranslationsForAllLocales(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  categoryId: string | null,
  globalTaxonomyId: string | null,
  path: string[]
) {
  if ((!categoryId && !globalTaxonomyId) || !path.length) return;
  const label = path[path.length - 1] || path.join(" / ");
  const translations = await translateLabelForLocales(label, SUPPORTED_LANGUAGES);

  if (categoryId) {
    const userRows = SUPPORTED_LANGUAGES.map((lang) => ({
      user_id: userId,
      category_id: categoryId,
      lang,
      label: translations[lang] || formatSegmentDisplay(label),
    }));
    try {
      await supabase
        .from("category_translations")
        .upsert(userRows, { onConflict: "user_id,category_id,lang" });
    } catch (err) {
      console.warn("category translations upsert skipped", err);
    }
  }

  if (globalTaxonomyId) {
    const globalRows = SUPPORTED_LANGUAGES.map((lang) => ({
      taxonomy_id: globalTaxonomyId,
      lang,
      label: translations[lang] || formatSegmentDisplay(label),
    }));
    try {
      await supabase
        .from("taxonomy_global_translations")
        .upsert(globalRows, { onConflict: "taxonomy_id,lang" });
    } catch (err) {
      console.warn("global translations upsert skipped", err);
    }
  }
}

async function resolveCategoryFromSuggestion(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  suggestionPath: string[],
  confidence: number | null
): Promise<{ categoryId: string | null; finalPath: string[] | null; globalTaxonomyId: string | null }> {
  await seedDefaultCategoriesIfMissing(supabase, userId);

  const normalizedPath = normalizeCategoryPath(suggestionPath);
  if (!normalizedPath.length) {
    return { categoryId: null, finalPath: null, globalTaxonomyId: null };
  }

  const { globalIds, finalGlobalId } = await ensureGlobalTaxonomyPath(supabase, normalizedPath);

  const { data: existingRows, error: existingError } = await supabase
    .from("categories")
    .select("id, name, parent_id, global_taxonomy_id")
    .eq("user_id", userId);
  if (existingError) throw existingError;
  const existing: CategoryRow[] = Array.isArray(existingRows) ? existingRows : [];

  let parentId: string | null = null;
  let lastId: string | null = null;
  const finalPath: string[] = [];

  for (const [idx, segment] of normalizedPath.entries()) {
    const match = existing.find(
      (c) => c.parent_id === parentId && c.name.trim().toLowerCase() === segment.toLowerCase()
    );
    if (match) {
      parentId = match.id;
      lastId = match.id;
      finalPath.push(match.name);
      const targetGlobalId = globalIds[idx] || null;
      if (!match.global_taxonomy_id && targetGlobalId) {
        try {
          await supabase
            .from("categories")
            .update({ global_taxonomy_id: targetGlobalId })
            .eq("id", match.id);
        } catch (err) {
          console.warn("category global mapping update skipped", err);
        }
      }
      continue;
    }

    const parentBeforeInsert = parentId;
    const insertRes: { data: { id: string; name: string } | null; error: unknown } =
      await supabase
        .from("categories")
        .insert({
          user_id: userId,
          name: segment,
          parent_id: parentId,
          global_taxonomy_id: globalIds[idx] ?? null,
        })
        .select("id, name")
        .single();
    if (insertRes.error) throw insertRes.error;
    if (insertRes.data?.id) {
      const createdId = insertRes.data.id;
      parentId = createdId;
      lastId = createdId;
      finalPath.push(insertRes.data.name);
      existing.push({ id: createdId, name: insertRes.data.name, parent_id: parentBeforeInsert });
    }
  }

  return { categoryId: lastId, finalPath: finalPath.length ? finalPath : null, globalTaxonomyId: finalGlobalId };
}

async function ensureTasksFromExtraction(
  supabase: ReturnType<typeof supabaseAdmin>,
  userId: string,
  documentId: string,
  parsed: ParsedExtraction | null | undefined
) {
  const suggestion = parsed?.task_suggestion;
  const normalizeUrgency = (value: string | null | undefined): "low" | "normal" | "high" => {
    if (value === "low" || value === "normal" || value === "high") return value;
    return "normal";
  };

  const suggestionTitle =
    typeof suggestion?.title === "string" && suggestion.title.trim()
      ? suggestion.title.trim()
      : null;
  const suggestionDue =
    typeof suggestion?.due_date === "string" && suggestion.due_date.trim()
      ? suggestion.due_date.trim()
      : null;
  const suggestionDescription =
    typeof suggestion?.description === "string" && suggestion.description.trim()
      ? suggestion.description.trim()
      : null;
  const shouldCreate = suggestion?.should_create_task === true;

  const { data: existing, error } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("document_id", documentId)
    .eq("user_id", userId);
  if (error) throw error;
  const hasOpenTask = (existing ?? []).some((t: any) => t?.status !== "done");

  if (shouldCreate && suggestionTitle) {
    if (hasOpenTask) return;
    await supabase.from("tasks").insert({
      user_id: userId,
      document_id: documentId,
      title: suggestionTitle,
      description: suggestionDescription,
      due_date: suggestionDue,
      urgency: normalizeUrgency(suggestion?.urgency || null),
      status: "open",
    });
    return;
  }

  // Fallback: if no suggestion but the extraction clearly indicates an action, derive a single task
  const actionRequired = parsed?.key_fields?.action_required === true;
  const actionDesc =
    typeof parsed?.key_fields?.action_description === "string" &&
    parsed.key_fields.action_description?.trim()
      ? parsed.key_fields.action_description.trim()
      : null;
  const actionDue =
    typeof parsed?.key_fields?.due_date === "string" && parsed.key_fields.due_date?.trim()
      ? parsed.key_fields.due_date.trim()
      : suggestionDue;

  if (!hasOpenTask && actionRequired && actionDesc) {
    await supabase.from("tasks").insert({
      user_id: userId,
      document_id: documentId,
      title: actionDesc,
      due_date: actionDue,
      urgency: actionDue ? "normal" : "low",
      status: "open",
    });
  }
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  let documentId: string | null = null;
  let extractionSource: "text-model" | "vision-model" | "ocr-text" = "text-model";
  let usedPdfOcrFallback = false;

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
      .select("id, user_id, title, storage_path, category_id, created_at")
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
    const prompt = [buildExtractionPrompt(preferredLanguage), "Document text:", truncated].join(
      "\n"
    );
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }],
        },
      ],
    });
      const contentResult = completion.choices[0]?.message?.content;
      if (!contentResult) throw new Error("Missing content from OpenAI response");
      const parsedJson = JSON.parse(contentResult);
      const validated = validateAndNormalize(parsedJson, "text-model", preferredLanguage, usedPdfOcrFallback);
      if (!validated.summary) {
        validated.summary = "Info only";
        validated.main_summary = validated.summary;
      }
      return validated;
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
          } catch {
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
      const prompt = [
        `Perform OCR on the provided images, then extract using the schema. Respond in ${preferredLanguage}.`,
        buildExtractionPrompt(preferredLanguage),
      ].join("\n\n");
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
                text: prompt,
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
      const validated = validateAndNormalize(parsed, "vision-model", preferredLanguage, usedPdfOcrFallback);
      if (!validated.summary) {
        validated.summary = "Info only";
        validated.main_summary = validated.summary;
      }
      return validated;
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
              ...limited.map((img) => ({
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
          extractionSource = "vision-model";
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
        extractionSource = "vision-model";
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
          extractionSource = "ocr-text";
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

    let effectiveCategoryId: string | null = doc.category_id ?? null;

    // Upsert category and attach
    const mapped = mapToCategoryPath(parsedJson);
    if (mapped.path.length > 0) {
      try {
        const { categoryId, finalPath, globalTaxonomyId } = await resolveCategoryFromSuggestion(
          supabase,
          doc.user_id,
          mapped.path,
          mapped.confidence ?? null
        );
        if (categoryId) {
          await supabase
            .from("documents")
            .update({ category_id: categoryId })
            .eq("id", doc.id);
          effectiveCategoryId = categoryId;
          parsedJson.key_fields = parsedJson.key_fields || {};
          parsedJson.key_fields.category_path = finalPath ?? mapped.path;
          try {
            await upsertTranslationsForAllLocales(
              supabase,
              doc.user_id,
              categoryId,
              globalTaxonomyId ?? null,
              finalPath ?? mapped.path
            );
          } catch (err) {
            console.warn("category/global translation upsert skipped", err);
          }
        } else if (mapped.path.length) {
          // Best-effort: if we have a path but no category_id (e.g., race), try to attach to an existing matching node
          try {
            const { globalIds, finalGlobalId } = await ensureGlobalTaxonomyPath(supabase, mapped.path);
            if (finalGlobalId) {
              const leafGlobal = globalIds[globalIds.length - 1];
              // Find a user category already mapped to this global leaf
              const { data: catMatch } = await supabase
                .from("categories")
                .select("id")
                .eq("user_id", doc.user_id)
                .eq("global_taxonomy_id", leafGlobal)
                .maybeSingle();
              if (catMatch?.id) {
                await supabase.from("documents").update({ category_id: catMatch.id }).eq("id", doc.id);
                effectiveCategoryId = catMatch.id;
                parsedJson.key_fields = parsedJson.key_fields || {};
                parsedJson.key_fields.category_path = mapped.path;
              }
            }
          } catch (err) {
            console.warn("best-effort category attach skipped", err);
          }
        }
      } catch (err) {
        console.error("category upsert failed", err);
      }
    }

    // Normalize typed taxonomy and case attachment
    try {
      const senderLabel =
        typeof parsedJson?.key_fields?.sender_type_label === "string" && parsedJson.key_fields.sender_type_label.trim()
          ? parsedJson.key_fields.sender_type_label.trim()
          : typeof parsedJson?.key_fields?.sender === "string" && parsedJson.key_fields.sender.trim()
            ? parsedJson.key_fields.sender.trim()
            : null;
      const topicLabel =
        typeof (parsedJson as any)?.key_fields?.primary_topic_label === "string" &&
        (parsedJson as any)?.key_fields?.primary_topic_label?.trim()
          ? ((parsedJson as any)?.key_fields?.primary_topic_label as string).trim()
          : typeof parsedJson?.key_fields?.topic === "string" && parsedJson.key_fields.topic.trim()
            ? parsedJson.key_fields.topic.trim()
            : null;
      const domainProfileLabel =
        typeof parsedJson?.key_fields?.domain_profile_label === "string" && parsedJson.key_fields.domain_profile_label.trim()
          ? parsedJson.key_fields.domain_profile_label.trim()
          : null;

      const [senderTypeId, topicId, domainProfileId] = await Promise.all([
        ensureTypedTaxonomyEntry(supabase, "sender_type", senderLabel),
        ensureTypedTaxonomyEntry(supabase, "topic", topicLabel),
        ensureTypedTaxonomyEntry(supabase, "domain_profile", domainProfileLabel),
      ]);

      const updates: Record<string, string | null> = {};
      if (senderTypeId) updates.sender_type_id = senderTypeId;
      if (topicId) updates.topic_id = topicId;
      if (domainProfileId) updates.domain_profile_id = domainProfileId;

      let caseId: string | null = null;
      let caseReason: string | null = null;
      if (domainProfileId || effectiveCategoryId) {
        const refIds: string[] = [];
        const refObj = parsedJson?.key_fields?.reference_ids;
        if (refObj && typeof refObj === "object") {
          Object.values(refObj).forEach((val) => {
            if (typeof val === "string" && val.trim()) refIds.push(val.trim());
          });
        }
        const matchContext: MatchingContext = {
          sender: senderLabel,
          categoryId: effectiveCategoryId,
          title: doc.title ?? null,
          refIds,
          amount: extractPrimaryAmount(parsedJson),
          domainProfileId,
        };
        const { caseId: matchedCase, reason } = await ensureCaseForDomainProfile(
          supabase,
          doc.user_id,
          domainProfileId,
          domainProfileLabel,
          effectiveCategoryId,
          matchContext
        );
        caseId = matchedCase;
        caseReason = reason;
        if (caseId) {
          updates.case_id = caseId;
        }
      }

      if (Object.keys(updates).length) {
        await supabase.from("documents").update(updates).eq("id", doc.id);
      }

      if (caseId) {
        try {
          await supabase
            .from("case_documents")
            .upsert({ case_id: caseId, document_id: doc.id }, { onConflict: "case_id,document_id" });
        } catch (err) {
          console.warn("case_documents upsert skipped", err);
        }
        try {
          await supabase.from("case_events").insert({
            case_id: caseId,
            user_id: doc.user_id,
            kind: "doc_added",
            payload: { document_id: doc.id, reason: caseReason || "auto_attach" },
          });
        } catch (err) {
          console.warn("case_event insert skipped", err);
        }
      }
    } catch (err) {
      console.warn("typed taxonomy/case attach skipped", err);
    }

    // Create task if suggested
    try {
      await ensureTasksFromExtraction(supabase, doc.user_id, doc.id, parsedJson);
    } catch (err) {
      console.error("task creation failed", err);
    }

    const friendlyTitle = buildFriendlyTitle(parsedJson) || doc.title;

    // Log label candidates (best-effort; skip if table missing)
    try {
      const labels = collectLabelCandidates(parsedJson);
      if (labels.length) {
        await logLabelCandidates(supabase, doc.user_id, labels, friendlyTitle);
      }
    } catch (err) {
      console.warn("label candidate logging skipped", err);
    }

    const { error: insertError } = await supabase.from("extractions").insert({
      document_id: doc.id,
      user_id: doc.user_id,
      content: parsedJson,
    });
    if (insertError) throw insertError;

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

    await logTelemetryEvent({
      timestamp: new Date().toISOString(),
      kind: "process-document",
      status: "success",
      documentId: doc.id,
      userId: doc.user_id,
      model: extractionSource,
      usedOcrFallback: usedPdfOcrFallback,
    });

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
    await logTelemetryEvent({
      timestamp: new Date().toISOString(),
      kind: "process-document",
      status: "error",
      documentId,
      userId: null,
      model: extractionSource,
      usedOcrFallback: usedPdfOcrFallback,
      message: err instanceof Error ? err.message : "unknown error",
    });
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
    );
  }
}

// Export helpers for unit testing
export {
  mapToCategoryPath,
  buildFriendlyTitle,
};
