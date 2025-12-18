/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validateExtraction, type ExtractionPayload } from "@/lib/extractionSchema";
import { formatDateYmdMon, formatYearMonthYmdMon } from "@/lib/dateFormat";
import { extractDeterministicCandidates, formatDeterministicCandidatesForPrompt } from "@/lib/deterministicCandidates";
import { applyDeterministicConstraints } from "@/lib/deterministicConstraints";
import { extractDeterministicSignals } from "@/lib/deterministicSignals";
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
  s = s.replace(/\b\d{4}-[a-z]{3}-\d{2}\b/g, " "); // YYYY-MMM-DD
  s = s.replace(/\b\d{4}-[a-z]{3}\b/g, " "); // YYYY-MMM
  s = s.replace(/\d{2,4}[./-]\d{1,2}[./-]\d{1,2}/g, " "); // dates
  s = s.replace(/\d+/g, " "); // numbers
  s = s.replace(/\b(bescheid|schreiben|brief|notice|letter|rechnung|invoice|änd(erung|erungsbescheid)|änderung|anhörung|mitteilung|entscheid|decision|update|info)\b/gi, " ");
  s = s.replace(/[_/()-]+/g, " ");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s || null;
};

const normalizeForSearch = (raw: string) =>
  raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isAppealLikeText = (raw: string | null | undefined) => {
  if (!raw || typeof raw !== "string") return false;
  const s = normalizeForSearch(raw);
  return /\b(widerspruch|einspruch|beschwerde|appeal|objection|contest|challenge)\b/.test(s);
};

function shouldCreateAppealTask(parsed: ParsedExtraction | null | undefined): boolean {
  if (!parsed) return false;
  const risk = normalizeForSearch(typeof (parsed as any)?.risk_level === "string" ? (parsed as any).risk_level : "");
  if (/\b(high|medium)\b/.test(risk)) return true;

  const parts: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    parts.push(trimmed);
  };

  push((parsed as any)?.summary);
  push((parsed as any)?.main_summary);

  const extras = (parsed as any)?.extra_details;
  if (Array.isArray(extras)) extras.forEach(push);

  const kf = (parsed as any)?.key_fields ?? {};
  push(kf?.document_kind_fine);
  push(kf?.topic);
  push(kf?.follow_up);
  push(kf?.workflow_status);

  const consequences = (parsed as any)?.consequences_if_ignored;
  if (Array.isArray(consequences)) {
    consequences.forEach((c: any) => {
      push(c?.description);
      push(c?.severity);
    });
  }

  const actions = (parsed as any)?.actions_required;
  if (Array.isArray(actions)) {
    actions.forEach((a: any) => {
      push(a?.label);
      push(a?.description);
    });
  }

  const deadlines = (parsed as any)?.deadlines;
  if (Array.isArray(deadlines)) {
    deadlines.forEach((d: any) => {
      push(d?.kind);
      push(d?.description);
      push(d?.relative_text);
    });
  }

  const rights = (parsed as any)?.rights_options;
  if (Array.isArray(rights)) {
    rights.forEach((r: any) => {
      push(r?.description);
    });
  }

  const deterministicSignals = (parsed as any)?.deterministic_signals;
  if (deterministicSignals && typeof deterministicSignals === "object") {
    const blocking = (deterministicSignals as any)?.blocking_periods;
    if (Array.isArray(blocking)) {
      blocking.forEach((p: any) => {
        push(p?.kind);
        push(p?.start_date);
        push(p?.end_date);
        push(p?.source_snippet);
      });
    }
  }

  const text = normalizeForSearch(parts.join("\n"));
  const negativeSignal = /\b(sperrzeit|sperrfrist|ruhenszeit|ruhezeit|sanktion|sanction|kuerzung|kurzung|reduktion|reduced|reduction|minderung|ablehn|denied|rejected|refused|overpayment|ueberzahlung|uberzahlung|rueckforder|ruckforder|repay|repayment|refund|collection|inkasso|mahnung|vollstreck|pfand|suspend|suspension|entzug|widerruf|revok)\b/;
  return negativeSignal.test(text);
}

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

type ReferenceIds = Record<string, string | null>;

type KeyFields = {
  language?: string | null;
  issuer_short?: string | null;
  issuer_legal?: string | null;
  document_date?: string | null;
  billing_period?: string | null;
  document_kind_fine?: string | null;
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
  const lang = normalize(parsed?.key_fields?.language) as SupportedLang | null;
  const issuerShort = normalize(parsed?.key_fields?.issuer_short);
  const docKindFine = normalize(parsed?.key_fields?.document_kind_fine);
  const billingPeriod = normalize(parsed?.key_fields?.billing_period);
  const documentDate = normalize(parsed?.key_fields?.document_date) || normalize(parsed?.key_fields?.letter_date);

  const periodLabel = billingPeriod ? (formatYearMonthYmdMon(billingPeriod, lang) ?? "") : "";
  if (issuerShort && docKindFine && periodLabel) {
    return `${issuerShort} ${docKindFine} (${periodLabel})`.trim().slice(0, 160);
  }

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

  const pickDate = documentDate || letterDate || dueDate || null;
  const isoDate = pickDate ? (formatDateYmdMon(pickDate, lang) ?? "") : "";

  if (issuerShort && docKindFine) {
    if (isoDate) return `${issuerShort} ${docKindFine} (${isoDate})`.trim().slice(0, 160);
    return `${issuerShort} ${docKindFine}`.trim().slice(0, 160);
  }

  const categoryPath = mapToCategoryPath(parsed).path;
  const primaryCategory = categoryPath[0] || "";

  const parts: string[] = [];
  const cleanTopic = stripAddress(topic);
  const cleanSender = stripAddress(sender);
  const titleBase = cleanTopic || docKindFine || kind || primaryCategory || "";
  if (titleBase) parts.push(titleBase);
  if (cleanSender && cleanSender.toLowerCase() !== "unknown") parts.push(cleanSender);
  if (isoDate) parts.push(isoDate);

  const composed = parts.join(" ").trim();
  if (composed) return composed.slice(0, 160);

  return topic || kind || null;
}

const slugifyTitle = (value: string) => {
  const normalized = value
    .normalize("NFKC")
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}\-_.]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "document";
};

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
  const summary =
    typeof result.summary === "string" && result.summary.trim() ? result.summary.trim() : "";
  const mainSummary =
    typeof result.main_summary === "string" && result.main_summary.trim()
      ? result.main_summary.trim()
      : "";
  // Preserve semantics:
  // - `summary` is the short gist shown on cards
  // - `main_summary` is an optional longer meaning-only explanation
  // Backfill whichever is missing for older extractions.
  result.summary = summary || mainSummary || null;
  result.main_summary = mainSummary || summary || null;
  result.extra_details = Array.isArray(result.extra_details)
    ? result.extra_details.filter((s: any) => typeof s === "string" && s.trim().length > 0)
    : [];
  result.key_fields = result.key_fields || {};
  if (!result.key_fields.language) {
    result.key_fields.language = preferredLanguage;
  }
  if (!result.key_fields.document_date && typeof result.key_fields.letter_date === "string" && result.key_fields.letter_date.trim()) {
    result.key_fields.document_date = result.key_fields.letter_date.trim();
  }
  if (!result.key_fields.letter_date && typeof result.key_fields.document_date === "string" && result.key_fields.document_date.trim()) {
    result.key_fields.letter_date = result.key_fields.document_date.trim();
  }
  if (typeof result.key_fields.billing_period === "string") {
    const trimmed = result.key_fields.billing_period.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      result.key_fields.billing_period = trimmed.slice(0, 7);
    } else {
      result.key_fields.billing_period = trimmed || null;
    }
  }
  if (!result.key_fields.issuer_short) {
    const sender = typeof result.key_fields.sender === "string" ? result.key_fields.sender : null;
    const match = sender?.match(/\(([^)]+)\)/);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.includes(".")) {
      result.key_fields.issuer_short = candidate;
    }
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

  // Guardrail: appeal/objection is usually informational, not a task.
  // Only keep appeal-like tasks/actions when there is a meaningful negative impact.
  const allowAppealTask = shouldCreateAppealTask(result);
  if (!allowAppealTask) {
    const suggestionTitle =
      typeof result.task_suggestion?.title === "string" ? result.task_suggestion.title.trim() : "";
    if (suggestionTitle && isAppealLikeText(suggestionTitle)) {
      result.task_suggestion = {
        ...(result.task_suggestion || {}),
        should_create_task: false,
        title: null,
        description: null,
        due_date: null,
        urgency: null,
      };
    }

    const actions = Array.isArray((result as any)?.actions_required) ? (((result as any).actions_required as any[]) ?? []) : [];
    if (actions.length) {
      (result as any).actions_required = actions.filter(
        (a: any) => !isAppealLikeText(a?.label) && !isAppealLikeText(a?.description)
      );
    }

    const actionDesc =
      typeof (result as any)?.key_fields?.action_description === "string"
        ? String((result as any).key_fields.action_description).trim()
        : "";
    if (actionDesc && isAppealLikeText(actionDesc)) {
      (result as any).key_fields = (result as any).key_fields || {};
      (result as any).key_fields.action_description = null;
    }

    if ((result as any)?.key_fields?.action_required === true) {
      const hasActionDesc =
        typeof (result as any)?.key_fields?.action_description === "string" &&
        String((result as any).key_fields.action_description).trim().length > 0;
      const hasActions =
        Array.isArray((result as any)?.actions_required) && ((result as any).actions_required as any[]).length > 0;
      const shouldCreate = (result as any)?.task_suggestion?.should_create_task === true;
      if (!hasActionDesc && !hasActions && !shouldCreate) {
        (result as any).key_fields = (result as any).key_fields || {};
        (result as any).key_fields.action_required = false;
      }
    }

    // If due_date is actually an appeal-by date, don't treat it as the main "action needed by" date.
    const due =
      typeof (result as any)?.key_fields?.due_date === "string"
        ? String((result as any).key_fields.due_date).trim()
        : "";
    if (due && (result as any)?.key_fields?.action_required !== true) {
      const deadlines = Array.isArray((result as any)?.deadlines) ? (((result as any).deadlines as any[]) ?? []) : [];
      const appealDates = deadlines
        .filter((d: any) => String(d?.kind || "").toLowerCase().includes("appeal"))
        .map((d: any) => (typeof d?.date_exact === "string" ? d.date_exact.trim() : ""))
        .filter(Boolean);
      if (appealDates.includes(due)) {
        (result as any).key_fields = (result as any).key_fields || {};
        (result as any).key_fields.due_date = null;
      }
    }
  }

  // Deduplicate near-identical extra_details (same fact repeated under different labels).
  if (Array.isArray(result.extra_details) && result.extra_details.length > 1) {
    const normalizeText = (txt: string) =>
      txt
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^\p{L}\p{N}\s:.-]/gu, "")
        .trim();
    const buildKeys = (entry: string) => {
      const full = normalizeText(entry);
      const afterColonRaw = entry.includes(":") ? entry.split(":").slice(1).join(":") : entry;
      const afterColon = normalizeText(afterColonRaw);
      const valuePartRaw = afterColonRaw.split(/[-–—]/)[0] || afterColonRaw;
      const valuePart = normalizeText(valuePartRaw);
      return [full, afterColon, valuePart].filter(Boolean);
    };
    const seen = new Set<string>();
    result.extra_details = result.extra_details.filter((entry: string) => {
      if (typeof entry !== "string") return false;
      const keys = buildKeys(entry);
      const hasDuplicate = keys.some((k) => seen.has(k));
      if (hasDuplicate) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    });
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
    '  "summary": "Meaning-only gist for the card (1–2 short sentences, <=220 chars, no ellipses/trailing fragments). Do not mention tasks/deadlines or repeat the no-action status here.",',
	    '  "main_summary": "Optional longer meaning-only explanation (<=420 chars, complete sentences, no ellipses) or null",',
	    '  "badge_text": "Short chip about deadline/type or null",',
	    '  "extra_details": ["Total: 23.94 EUR - This is the total amount on this invoice.", "Direct debit: 2025-11-11 - The amount will be taken from your bank account on this date."],',
    '  "document_kind": "letter | invoice | contract | notice | info | other",',
    '  "jurisdiction": { "country_code": "DE|FR|RO|TR|ES|PT|RU|PL|UA|GB|... or null", "region": "state/Land/province or null", "evidence": "short reason (sender, statute, address)" },',
    '  "key_fields": {',
    `    "language": "${preferredLanguage}",`,
    '    "issuer_short": "Short sender label for UI (brand/domain), e.g. SIM.de, AOK, Deutsche Bank, or null",',
    '    "issuer_legal": "Full legal sender name (e.g. Drillisch Online GmbH) or null",',
    '    "document_date": "YYYY-MM-DD or null (date printed on the document; for letters this is the letter/issue date). Prefer this over guessing.",',
    '    "billing_period": "YYYY-MM or null (ONLY if the document explicitly states a single month/year it covers, e.g. monthly phone/internet/utility bill or statement; if the period is a date range, spans multiple months, or is unclear, return null)",',
    '    "document_kind_fine": "Specific type label in the output language (e.g. Mobilfunkrechnung, Kontoauszug) or null",',
    '    "contact_person": "Sender contact person/caseworker/department or null (NEVER the recipient name)",',
    '    "contact_phone": "Sender phone number (service line) or null",',
    '    "contact_email": "Sender email (service address) or null",',
    '    "sender": "...",',
    '    "topic": "...",',
    '    "letter_date": "YYYY-MM-DD or null",',
    '    "due_date": "YYYY-MM-DD or null",',
    '    "amount_total": number or null,',
    '    "currency": "EUR" | null,',
    '    "action_required": true/false,',
    '    "action_description": "Plain action <=120 chars or null",',
    '    "follow_up": "Short note if another letter will come, else null",',
    '    "reference_ids": { "invoice_number": null, "customer_number": null, "contract_number": null, "case_number": null, "tax_number": null, "aktenzeichen": null, "kundennummer": null, "vorgangsnummer": null, "iban": null, "bic": null, "mandate_reference": null },',
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
    '  "required_documents": [ { "id": "rd1", "description": "What to provide", "where_how": "Where/how to submit (address/portal/email) or null", "related_deadline_ids": ["d1"], "source_snippet": "...", "confidence": 0.0-1.0 } ],',
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
    "- Summary: explain meaning only (what this is + what happens/changed). Do NOT include to-do instructions, deadlines, 'action needed by' phrasing, or 'no action required' language (that belongs to action_required/tasks).",
    "- Language: Write ALL generated text fields in the output language (summary/main_summary/badge_text/extra_details labels+explanations/action_description/follow_up). Translate from the source letter. Only keep short official terms (program names, legal labels, <=4 words) in the source language when needed; do not copy full sentences in the source language.",
    "- Writing style: use short, complete sentences; avoid semicolons and trailing ellipses ('...'/'…'); explain what each amount/date refers to (not just the number).",
    "- Date format: whenever you mention a date in ANY generated text field (summary/main_summary/badge_text/extra_details explanations/action_description/follow_up), write it as ISO YYYY-MM-DD (and date ranges as 'YYYY-MM-DD to YYYY-MM-DD'). Do not use locale formats like 01.11.2025 or '6 Nov 2025'.",
    "- Contacts (contact_person/contact_phone/contact_email): Only extract the sender's contact person/caseworker/department and service phone/email when explicitly labeled (e.g. Ansprechpartner, Kontakt). NEVER use the recipient/user name from the address block. If unclear, return null.",
    "- Placeholders: NEVER use filler strings like 'neutral', 'unknown', 'n/a', 'k.A.', or 'null'. If a field is unknown, return null and omit it from extra_details.",
    "- Emails/screenshots: Use sender name/role/company/location from the body or signature; avoid treating signature data as neutral. If a subject is present, reflect it in the title/summary (e.g., subject + sender).",
    "- Emails: Always state what the email is about (subject/topic) in the summary and title (e.g., 'Statusupdate zur Aufhebungsvereinbarung', 'Freigabe-Status Kündigung'). Avoid generic 'E-Mail' titles.",
    "- No duplicates: Do NOT repeat the same fact under multiple labels (e.g., the same 90-day window twice). Keep one canonical phrasing per fact and drop near-duplicates in extra_details and summary.",
    "- extra_details: Provide 4–6 user-relevant Key facts max in short 'Label: value - what it means' form. The `value` must be type-correct and atomic: a money amount with currency (e.g. '1,580.10 EUR'), an ISO date ('YYYY-MM-DD'), or a period ('YYYY-MM' or 'YYYY-MM-DD to YYYY-MM-DD'). Do NOT put a date as the value for an amount label; keep the amount as the value and put the date in the explanation. Avoid duplicates: do not repeat the same fact/amount/date with different labels. Avoid low-value details like shipping cost 0, VAT rates, product/model codes, or generic appeal boilerplate (keep only an actual appeal-by date). Do NOT include IDs, account numbers, IBAN/BIC, mandate refs, tax numbers, birthdates, or other personal/admin identifiers.",
	    "- extra_details: The explanation after `-` must be ONE simple full sentence in the output language (no fragments, no slashes like ' / ', no trailing '...').",
	    "- extra_details: Do NOT add 'Document date' / 'Dokumentdatum' as a key fact (it's already in the title); only include it if it is directly relevant (e.g. needed to understand a deadline).",
	    "- extra_details: If the label implies a time period (Zeitraum/period/coverage/Sperrzeit/Ruhezeit), the `value` must be a period (YYYY-MM or YYYY-MM-DD to YYYY-MM-DD), not just a single start date.",
	    "- reference_ids: put Aktenzeichen/Kundennummer/Vorgangsnummer, invoice/customer/contract/case numbers, IBAN/BIC, and mandate references here when present; do not invent.",
	    "- required_documents: if the letter asks you to provide documents/forms, list each required document and where/how to submit it; tie to deadlines via related_deadline_ids when possible.",
	    "- Include source_snippet and confidence where applicable; do not invent dates/amounts.",
	    "- Tasks: Only suggest tasks when a user action is required. If the document is informational, a confirmation (already paid/received), or a recurring automatic payment/collection with no user choice/deadline, set action_required=false, actions_required=[], and task_suggestion.should_create_task=false.",
	    "- Tasks: Do NOT create tasks just because an appeal/objection is possible. Treat appeal rights (Widerspruch/Einspruch/appeal/objection) as information: include the appeal window in deadlines[] (kind='appeal'), but keep action_required=false.",
	    "- Tasks: You MAY suggest an appeal task only when the decision has a negative impact (e.g. Sperrzeit/sanction/reduction/denial/repayment) AND the user could reasonably want to challenge it. Phrase it as an optional check (e.g. 'Prüfen, ob Widerspruch sinnvoll ist').",
	    "- Tasks: When action_required=true, populate actions_required with 1–5 verb-first actions. Each action.label should start with a verb and be short; action.description should include a 1-line reason/consequence and (if relevant) amount + counterparty.",
	    "- If no action is required, set action_required=false and task_suggestion.should_create_task=false.",
	    "- If the letter says to wait for another letter / a separate decision will follow, set follow_up, keep action_required=false, and include that as a key fact in extra_details.",
	    "- deadlines: If a deadline is only given relatively (e.g. 'within one month after Bekanntgabe'), set date_exact=null and put that phrase into relative_text. Do not drop it just because it has no exact date.",
	    "- amount_total: Use ONLY for a one-off total due/owed/paid (e.g. an invoice total). For recurring rates (monthly benefit/payout, subscription price, daily rate), leave amount_total=null and represent the rate via `amounts[]` (with frequency) + `extra_details`.",
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
  const allowAppealTask = shouldCreateAppealTask(parsed);
  const shouldSkipTaskTitle = (title: string | null | undefined) =>
    !allowAppealTask && typeof title === "string" && title.trim().length > 0 && isAppealLikeText(title);

  const normalize = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const normalizeUrgency = (value: string | null | undefined): "low" | "normal" | "high" => {
    if (value === "low" || value === "normal" || value === "high") return value;
    return "normal";
  };
  const normalizeTitleKey = (title: string) => title.toLowerCase().replace(/\s+/g, " ").trim();
  const parseIsoDate = (value: unknown) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    return trimmed;
  };
  const formatMoney = (amount: number, currency: string | null) => {
    const rounded = Number.isFinite(amount) ? amount : NaN;
    if (!Number.isFinite(rounded)) return null;
    const fixed = Math.abs(rounded) >= 1000 ? rounded.toFixed(0) : rounded.toFixed(2);
    if (currency === "EUR") return `€${fixed}`;
    if (currency === "USD") return `$${fixed}`;
    if (currency === "GBP") return `£${fixed}`;
    return currency ? `${fixed} ${currency}` : fixed;
  };

  const consequence = (() => {
    const items = Array.isArray((parsed as any)?.consequences_if_ignored)
      ? (((parsed as any)?.consequences_if_ignored as any[]) ?? [])
      : [];
    const scored = items
      .map((c) => ({
        severity: normalize(c?.severity),
        description: normalize(c?.description),
        confidence: typeof c?.confidence === "number" ? c.confidence : null,
      }))
      .filter((c) => c.description);
    if (!scored.length) return null;
    const severityRank = (s: string | null) => (s === "high" ? 0 : s === "medium" ? 1 : s === "low" ? 2 : 3);
    scored.sort((a, b) => {
      const sev = severityRank(a.severity) - severityRank(b.severity);
      if (sev !== 0) return sev;
      const ca = a.confidence ?? 0;
      const cb = b.confidence ?? 0;
      return cb - ca;
    });
    return scored[0]?.description ?? null;
  })();

  const issuer =
    normalize(parsed?.key_fields?.issuer_short) ||
    normalize(parsed?.key_fields?.sender) ||
    null;
  const currency = normalize(parsed?.key_fields?.currency);
  const amount = extractPrimaryAmount(parsed);
  const money = amount !== null ? formatMoney(amount, currency) : null;

  const contextBits = [money, issuer].filter((v): v is string => !!v);
  const contextLine = contextBits.length ? `Context: ${contextBits.join(" · ")}` : null;
  const reasonLine = consequence ? `Reason: ${consequence}` : null;

  const candidates: { title: string; description: string | null; due_date: string | null; urgency: "low" | "normal" | "high" }[] = [];
  const seenKeys = new Set<string>();
  const pushCandidate = (candidate: {
    title: string;
    description: string | null;
    due_date: string | null;
    urgency: "low" | "normal" | "high";
  }) => {
    const key = normalizeTitleKey(candidate.title);
    if (!key) return;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    candidates.push(candidate);
  };

  const actions = Array.isArray((parsed as any)?.actions_required)
    ? (((parsed as any)?.actions_required as any[]) ?? [])
    : [];
  for (const action of actions) {
    const title = normalize(action?.label) || normalize(action?.description);
    if (!title) continue;
    if (shouldSkipTaskTitle(title)) continue;
    const due = parseIsoDate(action?.due_date);
    const severity = normalize(action?.severity)?.toLowerCase() ?? null;
    const urgency: "low" | "normal" | "high" =
      severity === "high" ? "high" : severity === "medium" ? "normal" : severity === "low" ? "low" : "normal";
    const baseDescription = normalize(action?.description);
    const descParts: string[] = [];
    if (baseDescription && baseDescription !== title) descParts.push(baseDescription);
    if (contextLine) descParts.push(contextLine);
    if (reasonLine) descParts.push(reasonLine);
    pushCandidate({
      title,
      description: descParts.length ? descParts.join("\n") : null,
      due_date: due,
      urgency,
    });
  }

  const suggestion = parsed?.task_suggestion as any;
  const suggestionTitle = normalize(suggestion?.title);
  const suggestionDue = parseIsoDate(suggestion?.due_date);
  const suggestionDescription = normalize(suggestion?.description);
  const shouldCreate = suggestion?.should_create_task === true;
  if (candidates.length === 0 && shouldCreate && suggestionTitle && !shouldSkipTaskTitle(suggestionTitle)) {
    const descParts: string[] = [];
    if (suggestionDescription) descParts.push(suggestionDescription);
    if (contextLine) descParts.push(contextLine);
    if (reasonLine) descParts.push(reasonLine);
    pushCandidate({
      title: suggestionTitle,
      description: descParts.length ? descParts.join("\n") : null,
      due_date: suggestionDue,
      urgency: normalizeUrgency(normalize(suggestion?.urgency)),
    });
  }

  const actionRequired = parsed?.key_fields?.action_required === true;
  const actionDesc = normalize(parsed?.key_fields?.action_description);
  const actionDue = parseIsoDate(parsed?.key_fields?.due_date) || suggestionDue;
  if (candidates.length === 0 && actionRequired && actionDesc && !shouldSkipTaskTitle(actionDesc)) {
    const descParts: string[] = [];
    if (contextLine) descParts.push(contextLine);
    if (reasonLine) descParts.push(reasonLine);
    pushCandidate({
      title: actionDesc,
      description: descParts.length ? descParts.join("\n") : null,
      due_date: actionDue,
      urgency: actionDue ? "normal" : "low",
    });
  }

  if (!candidates.length) return;

  const { data: existing, error } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("document_id", documentId)
    .eq("user_id", userId);
  if (error) throw error;
  const existingKeys = new Set(
    (existing ?? [])
      .map((t: any) => (typeof t?.title === "string" ? normalizeTitleKey(t.title) : ""))
      .filter(Boolean)
  );

  const inserts = candidates
    .filter((c) => !existingKeys.has(normalizeTitleKey(c.title)))
    .slice(0, 6)
    .map((c) => ({
      user_id: userId,
      document_id: documentId,
      title: c.title,
      description: c.description,
      due_date: c.due_date,
      urgency: c.urgency,
      status: "open",
    }));

  if (!inserts.length) return;
  await supabase.from("tasks").insert(inserts);
}

export async function POST(request: Request) {
  const supabase = supabaseAdmin();
  let documentId: string | null = null;
  let extractionSource: "text-model" | "vision-model" | "ocr-text" = "text-model";
  let usedPdfOcrFallback = false;
  const timings: Record<string, number> = {};
  const totalStart = Date.now();
  let renderStats: {
    pageCount?: number;
    renderedPages?: number;
    skippedTextPages?: number;
    capped?: boolean;
  } = {};
  let fileHash: string | null = null;
  let skipReason: string | null = null;
  let pageCapMessage: string | null = null;
  const timed = async <T,>(label: string, fn: () => Promise<T>) => {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      timings[label] = (timings[label] ?? 0) + (Date.now() - start);
    }
  };

  try {
    const body = await request.json().catch(() => null);
    const incomingId = body?.documentId;
    const force = Boolean(body?.force);
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

    const fileData = await timed("download_ms", async () => {
      const { data, error: downloadError } = await supabase.storage
        .from("documents")
        .download(doc.storage_path);
      if (downloadError) throw downloadError;
      if (!data) throw new Error("File missing in storage");
      return data;
    });

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { createHash } = await import("node:crypto");
    fileHash = createHash("sha256").update(buffer).digest("hex");

    if (!force) {
      const { data: existingRows, error: existingError } = await supabase
        .from("extractions")
        .select("content, created_at")
        .eq("document_id", doc.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (existingError) throw existingError;
      const existing = Array.isArray(existingRows) ? existingRows[0] : null;
      const existingHash =
        (existing as any)?.content?.source_hash || (existing as any)?.content?.meta?.source_hash;
      if (existingHash && existingHash === fileHash) {
        await supabase
          .from("documents")
          .update({ status: "done", error_message: null })
          .eq("id", doc.id);
        timings.total_ms = Date.now() - totalStart;
        await logTelemetryEvent({
          timestamp: new Date().toISOString(),
          kind: "process-document",
          status: "skipped",
          documentId: doc.id,
          userId: doc.user_id,
          model: extractionSource,
          usedOcrFallback: usedPdfOcrFallback,
          skipReason: "hash_match",
          timings_ms: timings,
        });
        return NextResponse.json({ ok: true, skipped: true, skipReason: "hash_match" });
      }
    }
    const lowerPath = doc.storage_path.toLowerCase();
    const isPdf = lowerPath.endsWith(".pdf");
    const isImage = /\.(png|jpe?g)$/i.test(lowerPath);

    let textContent = "";
    let renderedImages: string[] | null = null;
    if (isPdf) {
      textContent = await timed("text_extract_ms", async () => {
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
        const parsedMeta = parsed as { numpages?: number; numPages?: number };
        const numpages =
          typeof parsedMeta.numpages === "number"
            ? parsedMeta.numpages
            : typeof parsedMeta.numPages === "number"
              ? parsedMeta.numPages
              : null;
        if (numpages) renderStats.pageCount = numpages;
        return parsed.text;
      });
    } else if (!isImage) {
      textContent = await timed("text_extract_ms", async () => buffer.toString("utf8"));
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    const openai = new OpenAI({ apiKey: openaiKey });
    const PROCESS_MODEL = process.env.DOCFLOW_PROCESS_MODEL || "gpt-5.2";
    const PROCESS_TEXT_MODEL = process.env.DOCFLOW_PROCESS_TEXT_MODEL || PROCESS_MODEL;
    const PROCESS_TEXT_FALLBACK_MODEL = process.env.DOCFLOW_PROCESS_TEXT_FALLBACK_MODEL || "gpt-4o-mini";
    // Default vision/OCR to a vision-capable model to avoid text-only failures on image_url payloads.
    const PROCESS_VISION_MODEL = process.env.DOCFLOW_PROCESS_VISION_MODEL || "gpt-4o";
    const PROCESS_VISION_FALLBACK_MODEL = process.env.DOCFLOW_PROCESS_VISION_FALLBACK_MODEL || "gpt-4o-mini";
    const PROCESS_TEXT_MODEL_LARGE =
      process.env.DOCFLOW_PROCESS_TEXT_MODEL_LARGE || PROCESS_TEXT_FALLBACK_MODEL;
    const PDF_PAGE_SOFT_CAP = Number(process.env.DOCFLOW_PDF_PAGE_SOFT_CAP ?? 30);
    const PDF_PAGE_HARD_CAP = Number(process.env.DOCFLOW_PDF_PAGE_HARD_CAP ?? 60);
    const PDF_PAGE_TEXT_MIN = Number(process.env.DOCFLOW_PDF_PAGE_TEXT_MIN ?? 40);
    const PDF_RENDER_CONCURRENCY = Math.max(
      1,
      Number(process.env.DOCFLOW_PDF_RENDER_CONCURRENCY ?? 2)
    );
    const OCR_TEXT_PAGE_CAP = Math.max(1, Number(process.env.DOCFLOW_OCR_TEXT_PAGE_CAP ?? 4));
    const VISION_PAGE_CAP = Math.max(1, Number(process.env.DOCFLOW_VISION_PAGE_CAP ?? PDF_PAGE_HARD_CAP));
    const TEXT_LONG_CHAR_LIMIT = Math.max(4000, Number(process.env.DOCFLOW_TEXT_LONG_CHAR_LIMIT ?? 20000));
    const PDF_HARD_CAP_BLOCK =
      (process.env.DOCFLOW_PDF_HARD_CAP_BLOCK ?? "true").toLowerCase() === "true";

    const getPdfPageCount = async (pdfBuffer: Buffer) => {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const path = await import("node:path");
      const { pathToFileURL } = await import("node:url");
      const workerPath = path.join(
        process.cwd(),
        "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
      );
      pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
      const pdf = await loadingTask.promise;
      const count = pdf.numPages ?? 0;
      await pdf.destroy?.();
      return count || null;
    };

    if (isPdf && PDF_HARD_CAP_BLOCK && !renderStats.pageCount) {
      const pageCount = await timed("page_count_ms", () => getPdfPageCount(buffer));
      if (typeof pageCount === "number") {
        renderStats.pageCount = pageCount;
      }
    }

    const applyPageCapBlock = (pageCount: number | null | undefined) => {
      if (!pageCount || !PDF_HARD_CAP_BLOCK || pageCount <= PDF_PAGE_HARD_CAP) return false;
      pageCapMessage =
        preferredLanguage === "de"
          ? `Dokument zu lang (${pageCount} Seiten). Bitte in <= ${PDF_PAGE_HARD_CAP} Seiten aufteilen.`
          : `Document too long (${pageCount} pages). Please split into <= ${PDF_PAGE_HARD_CAP} pages.`;
      renderStats.capped = true;
      skipReason = "page_cap";
      return true;
    };

    let blockedByPageCap = applyPageCapBlock(renderStats.pageCount);

    const pickTextModels = (content: string, pageCount?: number) => {
      const isLarge = (pageCount ?? 0) > PDF_PAGE_SOFT_CAP || content.length > TEXT_LONG_CHAR_LIMIT;
      if (isLarge) {
        return { primary: PROCESS_TEXT_MODEL_LARGE, fallback: PROCESS_TEXT_MODEL };
      }
      return { primary: PROCESS_TEXT_MODEL, fallback: PROCESS_TEXT_FALLBACK_MODEL };
    };

    const callTextModel = async (
      content: string,
      preferredLanguage: SupportedLang,
      opts?: { primaryModel?: string; fallbackModel?: string }
    ) => {
      if (!content || content.trim().length === 0) {
        throw new Error(
          "No text extracted from document (possibly scanned or image-only PDF)."
        );
      }
      const candidates = extractDeterministicCandidates(content, { maxPerType: 18 });
      const candidatesJson = formatDeterministicCandidatesForPrompt(candidates);
      const truncated = content.slice(0, 8000);
      const prompt = [
        buildExtractionPrompt(preferredLanguage),
        "",
        "Deterministic candidates (regex/rules) extracted from the document text.",
        "For these fields, you MUST copy an exact candidate value or return null (never invent):",
        "- key_fields.document_date, key_fields.letter_date, key_fields.due_date",
        "- key_fields.amount_total/currency, amounts[].value/currency",
        "- key_fields.reference_ids.* (including Aktenzeichen/Kundennummer/Vorgangsnummer, IBAN/BIC)",
        "- key_fields.contact_email, key_fields.contact_phone",
        "Candidates (JSON):",
        candidatesJson,
        "",
        "Document text:",
        truncated,
      ].join("\n");
      const run = async (model: string) => {
        const completion = await openai.chat.completions.create({
          model,
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
        const constrained = applyDeterministicConstraints(validated, candidates);
        const signals = extractDeterministicSignals(content, { maxPerType: 4 });
        (constrained as any).deterministic_candidates = candidates;
        (constrained as any).deterministic_signals = signals;
        const blocking = signals.blocking_periods.find((s) => s.start_date && s.end_date) ?? signals.blocking_periods[0];
        if (blocking?.start_date && blocking?.end_date) {
          constrained.extra_details = Array.isArray(constrained.extra_details) ? constrained.extra_details : [];
          const label =
            blocking.kind === "sperrfrist"
              ? "Sperrfrist"
              : blocking.kind === "ruhenszeit"
                ? "Ruhenszeit"
                : blocking.kind === "ruhezeit"
                  ? "Ruhezeit"
                  : "Sperrzeit";
          const detail = `${label}: ${blocking.start_date} to ${blocking.end_date}`;
          if (!constrained.extra_details.some((s) => typeof s === "string" && s.includes(detail))) {
            constrained.extra_details.unshift(detail);
          }
        }

        // Deterministic safety net: blocking periods should trigger an appeal-check task,
        // even if the model misses them (still subject to downstream dedupe).
        if (blocking?.start_date) {
          const actions = Array.isArray((constrained as any).actions_required)
            ? (((constrained as any).actions_required as any[]) ?? [])
            : [];
          const hasAppealTaskAlready = actions.some(
            (a) => isAppealLikeText(a?.label) || isAppealLikeText(a?.description)
          );
          if (!hasAppealTaskAlready) {
            const appealKeywords = /\b(widerspruch|einspruch|appeal|objection)\b/i;
            const deadlines = Array.isArray((constrained as any).deadlines) ? (((constrained as any).deadlines as any[]) ?? []) : [];
            let appealDueExact: string | null = null;
            let appealDueRelative: string | null = null;
            for (const d of deadlines) {
              const kind = typeof d?.kind === "string" ? d.kind : "";
              const desc = typeof d?.description === "string" ? d.description : "";
              const rel = typeof d?.relative_text === "string" ? d.relative_text : "";
              const joined = `${kind} ${desc} ${rel}`.trim();
              if (!appealKeywords.test(joined)) continue;
              if (!appealDueExact && typeof d?.date_exact === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date_exact)) {
                appealDueExact = d.date_exact;
              }
              if (!appealDueRelative && rel.trim()) {
                appealDueRelative = rel.trim();
              }
            }

            const labelText = preferredLanguage === "de" ? "Widerspruch prüfen" : "Check appeal";
            const blockingLabel =
              blocking.kind === "sperrfrist"
                ? "Sperrfrist"
                : blocking.kind === "ruhenszeit"
                  ? "Ruhenszeit"
                  : blocking.kind === "ruhezeit"
                    ? "Ruhezeit"
                    : "Sperrzeit";
            const rangeText = blocking.end_date ? `${blocking.start_date} to ${blocking.end_date}` : blocking.start_date;
            const descriptionParts: string[] = [];
            if (preferredLanguage === "de") {
              descriptionParts.push(`Im Schreiben wird eine ${blockingLabel} genannt (${rangeText}).`);
              if (appealDueRelative) descriptionParts.push(`Frist: ${appealDueRelative}`);
            } else {
              descriptionParts.push(`The document mentions a ${blockingLabel} (${rangeText}).`);
              if (appealDueRelative) descriptionParts.push(`Deadline: ${appealDueRelative}`);
            }

            actions.unshift({
              label: labelText,
              description: descriptionParts.length ? descriptionParts.join("\n") : null,
              due_date: appealDueExact,
              severity: "high",
              is_blocking: true,
              source_snippet: blocking.source_snippet,
              confidence: blocking.confidence,
            });
            (constrained as any).actions_required = actions;
          }
        }
        if (!validated.summary) {
          constrained.summary = "Info only";
          constrained.main_summary = constrained.summary;
        }
        return constrained;
      };

      const primaryModel = opts?.primaryModel || PROCESS_TEXT_MODEL;
      const fallbackModel = opts?.fallbackModel || PROCESS_TEXT_FALLBACK_MODEL;
      try {
        return await run(primaryModel);
      } catch (err) {
        if (primaryModel === fallbackModel) throw err;
        console.warn(
          `text model ${primaryModel} failed; falling back to ${fallbackModel}`,
          err
        );
        return run(fallbackModel);
      }
    };

    const renderPdfImages = async (
      pdfBuffer: Buffer,
      options?: { maxPages?: number; skipTextPages?: boolean; minTextChars?: number; concurrency?: number }
    ) => {
      const path = await import("node:path");
      const { pathToFileURL } = await import("node:url");
      const { createRequire } = await import("node:module");
      const maxPages = Math.max(1, Math.floor(options?.maxPages ?? Number.POSITIVE_INFINITY));
      const skipTextPages = options?.skipTextPages ?? false;
      const minTextChars = Math.max(0, Math.floor(options?.minTextChars ?? 0));
      const concurrency = Math.max(1, Math.floor(options?.concurrency ?? 1));

      const mapWithConcurrency = async <T, R>(
        items: T[],
        limit: number,
        worker: (item: T, index: number) => Promise<R>
      ) => {
        const results = new Array<R>(items.length);
        let next = 0;
        const runner = async () => {
          while (next < items.length) {
            const current = next++;
            results[current] = await worker(items[current], current);
          }
        };
        const workerCount = Math.min(limit, items.length);
        await Promise.all(Array.from({ length: workerCount }, () => runner()));
        return results;
      };

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
        const targetPages = Math.min(pageCount, maxPages);
        const indices = Array.from({ length: targetPages }, (_, idx) => idx + 1);

        const results = await mapWithConcurrency(indices, concurrency, async (pageIndex) => {
          const page = await pdf.getPage(pageIndex);
          if (skipTextPages) {
            const textContent = await page.getTextContent();
            const pageText = (textContent.items as any[])
              ?.map((item) => (typeof item?.str === "string" ? item.str : ""))
              .join(" ");
            if (pageText && pageText.trim().length > minTextChars) {
              page.cleanup?.();
              return { index: pageIndex, skipped: true, image: null as string | null };
            }
          }
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
          const image = `data:image/jpeg;base64,${jpgBuffer.toString("base64")}`;
          canvasFactory.destroy({ canvas, context });
          page.cleanup?.();
          return { index: pageIndex, skipped: false, image };
        });

        const images = results
          .filter((r) => r && !r.skipped && r.image)
          .sort((a, b) => a.index - b.index)
          .map((r) => r.image as string);
        const skippedTextPages = results.filter((r) => r && r.skipped).length;
        return {
          images,
          pageCount,
          renderedPages: images.length,
          skippedTextPages,
          capped: pageCount > maxPages,
        };
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
          const capped = files.length > maxPages;
          const limitedFiles = files.slice(0, maxPages);
          const images: string[] = [];
          for (const file of limitedFiles) {
            const buf = await fs.readFile(path.join(tmpDir, file));
            images.push(`data:image/png;base64,${buf.toString("base64")}`);
          }
          await cleanup();
          return {
            images,
            pageCount: files.length,
            renderedPages: images.length,
            skippedTextPages: 0,
            capped,
          };
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
      const limited = images.slice(0, VISION_PAGE_CAP);
      if (images.length > limited.length) {
        console.warn(`vision input capped at ${limited.length} pages (was ${images.length})`);
      }
      const prompt = [
        `Perform OCR on the provided images, then extract using the schema. Respond in ${preferredLanguage}.`,
        buildExtractionPrompt(preferredLanguage),
      ].join("\n\n");
      const run = (model: string) =>
        openai.chat.completions.create({
          // Use a vision-capable model for OCR + reasoning on scanned docs/images.
          model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt,
                },
                ...limited.map((img) => ({
                  type: "image_url" as const,
                  image_url: { url: img },
                })),
              ],
            },
          ],
        });

      const completion = await run(PROCESS_VISION_MODEL).catch(async (err) => {
        if (PROCESS_VISION_MODEL === PROCESS_VISION_FALLBACK_MODEL) throw err;
        console.warn(`vision model ${PROCESS_VISION_MODEL} failed; falling back to ${PROCESS_VISION_FALLBACK_MODEL}`, err);
        return run(PROCESS_VISION_FALLBACK_MODEL);
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
      const limited = images.slice(0, OCR_TEXT_PAGE_CAP);
      const run = (model: string) =>
        openai.chat.completions.create({
          model,
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
      const completion = await run(PROCESS_VISION_MODEL).catch(async (err) => {
        if (PROCESS_VISION_MODEL === PROCESS_VISION_FALLBACK_MODEL) throw err;
        console.warn(`OCR model ${PROCESS_VISION_MODEL} failed; falling back to ${PROCESS_VISION_FALLBACK_MODEL}`, err);
        return run(PROCESS_VISION_FALLBACK_MODEL);
      });
      const contentResult = completion.choices[0]?.message?.content;
      if (!contentResult) return "";
      return contentResult.trim();
    };

    let parsedJson: ParsedExtraction | null = null;

    const MIN_TEXT_CHARS = 200;

    if (blockedByPageCap && pageCapMessage) {
      const badgeText = preferredLanguage === "de" ? "Dokument zu lang" : "Document too long";
      parsedJson = normalizeExtraction(
        {
          summary: pageCapMessage,
          main_summary: pageCapMessage,
          badge_text: badgeText,
          extra_details: [],
          key_fields: { language: preferredLanguage },
          uncertainty_flags: ["page_limit"],
        },
        preferredLanguage,
        usedPdfOcrFallback
      );
    }

    if (!parsedJson) {
      if (isPdf) {
        try {
          if (textContent && textContent.trim().length >= MIN_TEXT_CHARS) {
            const models = pickTextModels(textContent, renderStats.pageCount);
            parsedJson = await timed("text_model_ms", () =>
              callTextModel(textContent, preferredLanguage, {
                primaryModel: models.primary,
                fallbackModel: models.fallback,
              })
            );
          }
        } catch (err) {
          console.warn("text model failed for pdf, falling back to OCR", err);
        }
        if (!parsedJson) {
          const renderResult = await timed("render_ms", () =>
            renderPdfImages(buffer, {
              maxPages: PDF_PAGE_HARD_CAP,
              skipTextPages: textContent.trim().length > 0,
              minTextChars: PDF_PAGE_TEXT_MIN,
              concurrency: PDF_RENDER_CONCURRENCY,
            })
          );
          const pdfImages = renderResult.images;
          renderedImages = pdfImages;
          renderStats = renderResult;
          if (!blockedByPageCap) {
            blockedByPageCap = applyPageCapBlock(renderStats.pageCount);
          }
          if (blockedByPageCap && pageCapMessage) {
            const badgeText = preferredLanguage === "de" ? "Dokument zu lang" : "Document too long";
            parsedJson = normalizeExtraction(
              {
                summary: pageCapMessage,
                main_summary: pageCapMessage,
                badge_text: badgeText,
                extra_details: [],
                key_fields: { language: preferredLanguage },
                uncertainty_flags: ["page_limit"],
              },
              preferredLanguage,
              usedPdfOcrFallback
            );
          } else {
            usedPdfOcrFallback = true;
            try {
              if (pdfImages.length === 0 && textContent.trim().length > 0) {
                const models = pickTextModels(textContent, renderStats.pageCount);
                parsedJson = await timed("text_model_ms", () =>
                  callTextModel(textContent, preferredLanguage, {
                    primaryModel: models.primary,
                    fallbackModel: models.fallback,
                  })
                );
              } else {
                const ocrText = await timed("ocr_ms", () => ocrImagesToText(pdfImages));
                const combinedText = [textContent, ocrText].filter(Boolean).join("\n");
                if (!combinedText || combinedText.trim().length <= 80) {
                  console.warn("OCR text extraction returned empty/short text for pdf, falling back to vision model");
                } else {
                  const models = pickTextModels(combinedText, renderStats.pageCount);
                  parsedJson = await timed("text_model_ms", () =>
                    callTextModel(combinedText, preferredLanguage, {
                      primaryModel: models.primary,
                      fallbackModel: models.fallback,
                    })
                  );
                  extractionSource = "ocr-text";
                }
              }
            } catch (err) {
              console.warn("OCR text extraction failed for pdf, falling back to vision model", err);
            }
            if (!parsedJson) {
              try {
                parsedJson = await timed("vision_ms", () => callVisionModel(pdfImages, preferredLanguage));
                extractionSource = "vision-model";
              } catch (err) {
                console.warn("vision model failed for pdf, falling back to OCR text", err);
              }
            }
          }
        }
      } else if (textContent && textContent.trim().length > 0) {
        const models = pickTextModels(textContent, renderStats.pageCount);
        parsedJson = await timed("text_model_ms", () =>
          callTextModel(textContent, preferredLanguage, {
            primaryModel: models.primary,
            fallbackModel: models.fallback,
          })
        );
    } else if (isImage) {
      const mime = lowerPath.endsWith(".png") ? "image/png" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      const imageList = [dataUrl];
      renderedImages = imageList;
      renderStats = { pageCount: 1, renderedPages: 1, skippedTextPages: 0, capped: false };
      try {
        const ocrText = await timed("ocr_ms", () => ocrImagesToText(imageList));
        if (!ocrText || ocrText.trim().length <= 80) {
          console.warn("OCR text extraction returned empty/short text for image, falling back to vision model");
        } else {
            const models = pickTextModels(ocrText, renderStats.pageCount);
            parsedJson = await timed("text_model_ms", () =>
              callTextModel(ocrText, preferredLanguage, {
                primaryModel: models.primary,
                fallbackModel: models.fallback,
              })
            );
            extractionSource = "ocr-text";
          }
        } catch (err) {
          console.warn("OCR text extraction failed for image, falling back to vision model", err);
      }
      if (!parsedJson) {
        try {
          parsedJson = await timed("vision_ms", () => callVisionModel(imageList, preferredLanguage));
          extractionSource = "vision-model";
        } catch (innerErr) {
          console.warn("vision model failed for image, falling back to OCR text", innerErr);
        }
      }
      } else {
        throw new Error(
          "No text extracted and file type unsupported for OCR fallback."
        );
      }
    }

    if (!parsedJson || !parsedJson.summary) {
      // If vision summary failed, try OCR -> text -> text model as a fallback
      if (renderedImages && renderedImages.length) {
        const ocrText = await timed("ocr_ms", () => ocrImagesToText(renderedImages));
        if (ocrText && ocrText.trim().length > 80) {
          const models = pickTextModels(ocrText, renderStats.pageCount);
          parsedJson = await timed("text_model_ms", () =>
            callTextModel(ocrText, preferredLanguage, {
              primaryModel: models.primary,
              fallbackModel: models.fallback,
            })
          );
          extractionSource = "ocr-text";
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

    if (parsedJson && fileHash) {
      const meta = {
        source_hash: fileHash,
        page_count: renderStats.pageCount ?? null,
        rendered_pages: renderStats.renderedPages ?? null,
        skipped_text_pages: renderStats.skippedTextPages ?? null,
        capped: renderStats.capped ?? false,
        skip_reason: skipReason ?? null,
      };
      (parsedJson as any).meta = { ...(parsedJson as any).meta, ...meta };
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

    const friendlyTitle = skipReason === "page_cap" ? doc.title : buildFriendlyTitle(parsedJson) || doc.title;

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
    if (insertError) {
      const code = (insertError as { code?: string }).code;
      const constraint = (insertError as { constraint?: string }).constraint;
      // If the document was deleted while processing (FK fails), skip gracefully instead of 500.
      if (code === "23503" && constraint === "extractions_document_id_fkey") {
        console.warn("extraction skipped; document missing during processing", { documentId: doc.id });
        await logTelemetryEvent({
          timestamp: new Date().toISOString(),
          kind: "process-document",
          status: "skipped",
          documentId: doc.id,
          userId: doc.user_id,
          model: extractionSource,
          usedOcrFallback: usedPdfOcrFallback,
          message: "document missing during extraction insert",
        });
        return NextResponse.json({ ok: false, reason: "document_missing" }, { status: 410 });
      }
      throw insertError;
    }

    // Attempt to rename stored file (any type) to match friendly title
    if (doc.storage_path && friendlyTitle && skipReason !== "page_cap") {
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

    timings.total_ms = Date.now() - totalStart;
    const finalStatus = skipReason ? "skipped" : "success";
    await logTelemetryEvent({
      timestamp: new Date().toISOString(),
      kind: "process-document",
      status: finalStatus,
      documentId: doc.id,
      userId: doc.user_id,
      model: extractionSource,
      usedOcrFallback: usedPdfOcrFallback,
      skipReason: skipReason ?? undefined,
      timings_ms: timings,
      page_count: renderStats.pageCount,
      rendered_pages: renderStats.renderedPages,
      skipped_text_pages: renderStats.skippedTextPages,
    });

    return NextResponse.json({
      ok: true,
      skipped: !!skipReason,
      skipReason: skipReason ?? undefined,
      pageCount: renderStats.pageCount ?? undefined,
      hardCap: skipReason === "page_cap" ? PDF_PAGE_HARD_CAP : undefined,
    });
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
    timings.total_ms = Date.now() - totalStart;
    await logTelemetryEvent({
      timestamp: new Date().toISOString(),
      kind: "process-document",
      status: "error",
      documentId,
      userId: null,
      model: extractionSource,
      usedOcrFallback: usedPdfOcrFallback,
      message: err instanceof Error ? err.message : "unknown error",
      timings_ms: timings,
      page_count: renderStats.pageCount,
      rendered_pages: renderStats.renderedPages,
      skipped_text_pages: renderStats.skippedTextPages,
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
  normalizeExtraction,
  shouldCreateAppealTask,
};
