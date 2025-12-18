"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getLocaleForLanguage, useLanguage } from "@/lib/language";
import { extractDateRangeToIso, formatDateYmdMon, formatYearMonthYmdMon, replaceIsoDatesInText } from "@/lib/dateFormat";
import { replaceMoneyInText } from "@/lib/moneyFormat";
import { isStandaloneNoActionSentence } from "@/lib/summary";
import { createPortal } from "react-dom";
import viewIcon from "../../images/view.png";
import saveIcon from "../../images/save.png";
import binIcon from "../../images/bin.png";
import galaxyIcon from "../../images/ai.png";
import clarityIcon from "../../images/starai.png";
import deepDiveIcon from "../../images/deepdive.png";
import resetIcon from "../../images/reset.png";
import trashIcon from "../../images/bin.png";
import taskIcon from "../../images/task.png";
import stackIcon from "../../images/stack.png";
import { MediaViewer } from "./MediaViewer";

const formatBreadcrumbPath = (path?: string | null) => {
  if (!path) return "";
  const parts = path
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  const sep = " › ";
  if (parts.length <= 3) return parts.join(sep);
  const tail = parts.slice(-3);
  return ["…", ...tail].join(sep);
};

type ExtractionRow = {
  content: {
    summary?: string;
    key_fields?: Record<string, unknown>;
  };
  created_at?: string;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

type TaskRow = {
  id: string;
  document_id: string | null;
  title: string;
  status: string;
  due_date: string | null;
  urgency?: string;
};

type DocumentRow = {
  id: string;
  title: string;
  status: string;
  error_message: string | null;
  storage_path?: string | null;
  category_id?: string | null;
  case_id?: string | null;
  created_at: string;
  extra?: ExtractionRow[];
};

type TableRow = {
  id: string;
  title: string;
  status: string;
  error_message: string | null;
  storage_path?: string;
  category_path?: string;
  tasks?: TaskRow[];
  category_id?: string | null;
  case_id?: string | null;
  case_title?: string | null;
  category_suggestion_slug?: string | null;
  category_suggestion_path?: string[] | null;
  category_suggestion_confidence?: number | null;
  sender?: string;
  topic?: string;
  document_date?: string | null;
  billing_period?: string | null;
  amount?: string;
  due_date?: string | null;
  action_required?: boolean;
  action_text?: string | null;
  followup_note?: string | null;
  created_at: string;
  summary?: string;
  main_summary?: string | null;
  badge_text?: string | null;
  extra_details?: string[];
  deadlines?: {
    id?: string | null;
    date_exact?: string | null;
    relative_text?: string | null;
    kind?: string | null;
    description?: string | null;
    is_hard_deadline?: boolean | null;
    confidence?: number | null;
  }[];
  actions_required?: { id?: string | null; label?: string | null; due_date?: string | null; severity?: string | null }[];
  risk_level?: string | null;
  uncertainty_flags?: string[] | null;
  amounts?: { value?: number | null; currency?: string | null; direction?: string | null; description?: string | null }[];
  domain_profile_label?: string | null;
  tags?: string[];
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  reference_ids?: string[];
  reference_id_entries?: { key: string; value: string }[];
  workflow_status?: string | null;
};

type Props = {
  refreshKey: number;
  categoryFilter?: string[] | null;
  caseFilter?: string | null;
  mode?: "home" | "files";
  onProcessingChange?: (hasProcessing: boolean) => void;
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

const CATEGORY_CONFIDENCE_THRESHOLD = 0.7;

const slugToLabel = (slug?: string | null) =>
  CATEGORY_OPTIONS.find((c) => c.slug === slug)?.label || "Sonstiges";

const CATEGORY_TRANSLATIONS: Record<string, { de: string; en: string }> = {
  // Level 1
  "Identity & Civil Status": { de: "Identität & Status", en: "Identity & Civil Status" },
  "Work & Income": { de: "Arbeit & Einkommen", en: "Work & Income" },
  "Housing & Property": { de: "Wohnen & Eigentum", en: "Housing & Property" },
  "Health & Medical": { de: "Gesundheit & Medizin", en: "Health & Medical" },
  "Insurance (non-health)": { de: "Versicherung (ohne Gesundheit)", en: "Insurance (non-health)" },
  "Finance & Assets": { de: "Finanzen & Vermögen", en: "Finance & Assets" },
  "Government, Tax & Public Admin": { de: "Behörden, Steuern & Verwaltung", en: "Government, Tax & Public Admin" },
  "Government, Public Benefits (general)": {
    de: "Behörden, Sozialleistungen (allgemein)",
    en: "Government, Public Benefits (general)",
  },
  "Education & Training": { de: "Bildung & Weiterbildung", en: "Education & Training" },
  "Family & Social": { de: "Familie & Soziales", en: "Family & Social" },
  "Utilities & Telecom": { de: "Versorger & Telekom", en: "Utilities & Telecom" },
  "Purchases & Subscriptions": { de: "Einkäufe & Abos", en: "Purchases & Subscriptions" },
  "Legal & Disputes": { de: "Recht & Streitfälle", en: "Legal & Disputes" },
  "Other & Miscellaneous": { de: "Sonstiges", en: "Other & Miscellaneous" },
  // Level 2 (common seeds)
  "Employment Contracts": { de: "Arbeitsverträge", en: "Employment Contracts" },
  "Unemployment Benefits": { de: "Arbeitslosengeld", en: "Unemployment Benefits" },
  "Public Benefits (general)": { de: "Sozialleistungen (allgemein)", en: "Public Benefits (general)" },
  "Income Tax": { de: "Einkommensteuer", en: "Income Tax" },
  "Other Taxes & Fees": { de: "Sonstige Steuern & Gebühren", en: "Other Taxes & Fees" },
  "Rent & Service Charges": { de: "Miete & Nebenkosten", en: "Rent & Service Charges" },
  "Rental Contracts": { de: "Mietverträge", en: "Rental Contracts" },
  "Landlord Communication": { de: "Vermieter-Kommunikation", en: "Landlord Communication" },
  "Health Insurance": { de: "Krankenversicherung", en: "Health Insurance" },
  "Medical Bills & Statements": { de: "Arzt-/Krankenhausrechnungen", en: "Medical Bills & Statements" },
  "Bank Accounts": { de: "Bankkonten", en: "Bank Accounts" },
  "Loans & Credit": { de: "Kredite & Darlehen", en: "Loans & Credit" },
  "Cards & Payment": { de: "Karten & Zahlungen", en: "Cards & Payment" },
  "Financial Summaries": { de: "Finanzübersichten", en: "Financial Summaries" },
  "Court & Police Docs": { de: "Gericht & Polizei", en: "Court & Police Docs" },
  // Level 3 examples (extend as needed)
  unemployment_benefit_decision: { de: "Arbeitslosengeld-Bescheid", en: "Unemployment Benefit Decision" },
  "Unemployment Benefit Decision": {
    de: "Arbeitslosengeld-Bescheid",
    en: "Unemployment Benefit Decision",
  },
  "Unemployment Benefit Change Notice": {
    de: "Änderungsbescheid Arbeitslosengeld",
    en: "Unemployment Benefit Change Notice",
  },
  "Unemployment Benefit Notice": { de: "Bescheid Arbeitslosengeld", en: "Unemployment Benefit Notice" },
  "Unemployment Benefit": { de: "Arbeitslosengeld", en: "Unemployment Benefit" },
};

const translateCategorySegment = (segment: string, lang: string) => {
  const key = segment.trim();
  const entry =
    CATEGORY_TRANSLATIONS[key] ||
    // case-insensitive lookup to cover slight formatting differences
    Object.entries(CATEGORY_TRANSLATIONS).find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1];
  if (entry) {
    return lang === "de" ? entry.de : entry.en;
  }
  return segment;
};

const formatSegmentDisplay = (segment: string, lang: string) => {
  const translated = translateCategorySegment(segment, lang);
  if (translated !== segment) return translated;
  const cleaned = segment.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return segment;
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
};

export default function DocumentTable({
  refreshKey,
  categoryFilter,
    mode = "files",
  onProcessingChange,
  caseFilter,
}: Props) {
  const { lang, t } = useLanguage();
  const [rows, setRows] = useState<TableRow[]>([]);
  const [optimisticRows, setOptimisticRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [previewIsImage, setPreviewIsImage] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userNameHints, setUserNameHints] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<
    { id: string; path: string; displayPath: string; displayLabel: string }[]
  >([]);
  const [caseOptions, setCaseOptions] = useState<{ id: string; title: string; status: string }[]>([]);
  const [expandedCompleted, setExpandedCompleted] = useState<Set<string>>(new Set());
  const [hiddenDocIds, setHiddenDocIds] = useState<Set<string>>(new Set());
  const [taskModal, setTaskModal] = useState<{
    docId: string;
    title: string;
    due: string;
    urgency: string;
  } | null>(null);
  const [actionMenuRow, setActionMenuRow] = useState<TableRow | null>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [isMounted, setIsMounted] = useState(false);
  const [flashingComplete, setFlashingComplete] = useState<Set<string>>(new Set());
  const [recentlyDone, setRecentlyDone] = useState<Set<string>>(new Set());
  const [applyBusy, setApplyBusy] = useState<Set<string>>(new Set());
  const [reprocessBusy, setReprocessBusy] = useState<Set<string>>(new Set());
  const [chatForDoc, setChatForDoc] = useState<string | null>(null);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant" | "system"; content: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const kindleButtonStyle: React.CSSProperties = {
    padding: "10px 18px",
    borderRadius: "14px",
    background: "rgb(243,238,226)",
    border: "1px solid rgba(0,0,0,0.35)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
    letterSpacing: "0.08em",
    fontSize: "13px",
    textTransform: "uppercase",
    color: "rgba(20,20,20,0.9)",
  };

  const handleCopy = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1200);
    } catch (err) {
      console.warn("copy failed", err);
    }
  }, []);

  // Auto-collapse expanded paths after a short delay to avoid clutter.
  useEffect(() => {
    if (!expandedPaths.size) return;
    const timer = setTimeout(() => {
      setExpandedPaths(new Set());
    }, 3000);
    return () => clearTimeout(timer);
  }, [expandedPaths]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [chatMessages]);

  const cleanupEmptyCase = useCallback(
    async (caseId?: string | null, supabase?: ReturnType<typeof supabaseBrowser>, userIdParam?: string | null) => {
      if (!caseId || !supabase || !userIdParam) return;
      try {
        const [{ count: docCount, error: docErr }, { count: linkCount, error: linkErr }] = await Promise.all([
          supabase
            .from("documents")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userIdParam)
            .eq("case_id", caseId),
          supabase
            .from("case_documents")
            .select("id", { count: "exact", head: true })
            .eq("case_id", caseId),
        ]);
        if (docErr && (docErr as { code?: string }).code !== "42P01") throw docErr;
        if (linkErr && (linkErr as { code?: string }).code !== "42P01") throw linkErr;
        const total = (docCount ?? 0) + (linkCount ?? 0);
        if (total === 0) {
          try {
            await supabase.from("case_events").delete().eq("case_id", caseId);
          } catch (evErr) {
            console.warn("case_event cleanup skipped", evErr);
          }
          try {
            await supabase.from("cases").delete().eq("id", caseId);
          } catch (caseErr) {
            console.warn("case cleanup skipped", caseErr);
          }
        }
      } catch (err) {
        console.warn("cleanupEmptyCase skipped", err);
      }
    },
    []
  );

  useEffect(() => {
    if (onProcessingChange) {
      const hasProcessing =
        rows.some((r) => r.status !== "done") ||
        optimisticRows.some((r) => r.status !== "done");
      onProcessingChange(hasProcessing);
    }
  }, [rows, optimisticRows, onProcessingChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOptimisticStart = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail?.tempId) return;
      setOptimisticRows((prev) => [
        {
          id: detail.tempId,
          title: detail.title || "Dokument",
          status: "processing",
          error_message: null,
          storage_path: detail.storage_path || undefined,
          category_id: null,
          case_id: null,
          created_at: detail.created_at || new Date().toISOString(),
          summary: detail.summary ?? undefined,
          main_summary: detail.main_summary ?? undefined,
          badge_text: t("loading"),
          extra_details: [],
          category_path: undefined,
          tasks: [],
        } as TableRow,
        ...prev.filter((p) => p.id !== detail.tempId),
      ]);
    };
    const handleOptimisticComplete = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      setOptimisticRows((prev) =>
        prev.filter(
          (p) =>
            (detail?.storage_path && p.storage_path !== detail.storage_path) &&
            (detail?.tempId && p.id !== detail.tempId)
        )
      );
    };
    const handleOptimisticFailed = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      setOptimisticRows((prev) => prev.filter((p) => p.id !== detail?.tempId));
    };

    window.addEventListener("docflow:optimistic-upload-start", handleOptimisticStart as EventListener);
    window.addEventListener("docflow:optimistic-upload-complete", handleOptimisticComplete as EventListener);
    window.addEventListener("docflow:optimistic-upload-failed", handleOptimisticFailed as EventListener);

    try {
      const stored = localStorage.getItem("docflowHiddenDocs");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHiddenDocIds(new Set(parsed));
        }
      }
    } catch (err) {
      console.error("failed to load hidden docs", err);
    }
    setIsMounted(true);

    return () => {
      window.removeEventListener("docflow:optimistic-upload-start", handleOptimisticStart as EventListener);
      window.removeEventListener("docflow:optimistic-upload-complete", handleOptimisticComplete as EventListener);
      window.removeEventListener("docflow:optimistic-upload-failed", handleOptimisticFailed as EventListener);
    };
  }, []);

  const persistHidden = (next: Set<string>) => {
    setHiddenDocIds(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("docflowHiddenDocs", JSON.stringify(Array.from(next)));
    }
  };

  const ensureCategoryPath = async (userId: string, path: string[]) => {
    const supabase = supabaseBrowser();
    const { data: existing, error } = await supabase
      .from("categories")
      .select("id, name, parent_id")
      .eq("user_id", userId);
    if (error) throw error;
    const rows: CategoryRow[] = Array.isArray(existing) ? existing : [];

    let parentId: string | null = null;
    let lastId: string | null = null;
    for (const segment of path) {
      const match = rows.find(
        (c) => c.parent_id === parentId && c.name.trim().toLowerCase() === segment.toLowerCase()
      );
      if (match) {
        parentId = match.id;
        lastId = match.id;
        continue;
      }
      const insert = await supabase
        .from("categories")
        .insert({ user_id: userId, name: segment, parent_id: parentId })
        .select("id")
        .single();
      if (insert.error) throw insert.error;
      if (insert.data?.id) {
        const createdId = insert.data.id as string;
        rows.push({ id: createdId, name: segment, parent_id: parentId });
        parentId = createdId;
        lastId = createdId;
      }
    }
    return lastId;
  };

  const applySuggestion = async (row: TableRow) => {
    const suggestionPath =
      row.category_suggestion_path && row.category_suggestion_path.length
        ? row.category_suggestion_path
        : row.category_suggestion_slug
          ? [slugToLabel(row.category_suggestion_slug)]
          : null;
    if (!suggestionPath || !suggestionPath.length) return;
    setApplyBusy((prev) => new Set(prev).add(row.id));
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in.");
      const categoryId = await ensureCategoryPath(user.id, suggestionPath);
      if (categoryId) {
        // Persist the chosen label in the active UI language so we don't fall back to English.
        try {
          const label =
            suggestionPath[suggestionPath.length - 1] && suggestionPath[suggestionPath.length - 1].trim()
              ? formatSegmentDisplay(suggestionPath[suggestionPath.length - 1], lang)
              : formatSegmentDisplay(suggestionPath.join(" / "), lang);
          await supabase
            .from("category_translations")
            .upsert(
              {
                user_id: user.id,
                category_id: categoryId,
                lang,
                label,
              },
              { onConflict: "user_id,category_id,lang" }
            );
        } catch (transErr) {
          console.warn("category translation upsert skipped", transErr);
        }
        const { error: updateError } = await supabase
          .from("documents")
          .update({ category_id: categoryId })
          .eq("id", row.id);
        if (updateError) throw updateError;
        fetchDocs(true);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to apply suggestion");
    } finally {
      setApplyBusy((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const reprocessDoc = async (row: TableRow) => {
    setReprocessBusy((prev) => new Set(prev).add(row.id));
    try {
      const res = await fetch("/api/process-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: row.id, preferredLanguage: lang }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to reprocess (status ${res.status})`);
      }
      // Trigger refresh to pick up new extraction/category
      fetchDocs(true);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to reprocess document");
    } finally {
      setReprocessBusy((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

const truncateAtWord = (value: string, limit: number) => {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  const slice = trimmed.slice(0, Math.max(0, limit - 1));
  const cut = slice.replace(/\s+\S*$/, "").trim();
  return `${(cut || slice).trim()}…`;
};

const cleanSummaryText = (value: string) => {
  let s = value.trim();
  if (!s) return s;

  // Remove IDs and overly specific tokens from summary (those belong in Reference/Details).
  s = s.replace(/\b(iban|bic)\s*[:#]?\s*[A-Z]{2}\d{2}[A-Z0-9\s]{10,}\b/gi, "$1");
  s = s.replace(/\b(invoice|rechnung)\s*[:#]?\s*[A-Z0-9][A-Z0-9-]{4,}\b/gi, "$1");
  s = s.replace(
    /\b(customer(?:\s*(?:no\.?|number))?|kundennummer|kundennr\.?|customer-nr)\s*[:#]?\s*[A-Z0-9-]{4,}\b/gi,
    (m) => m.replace(/\s*[:#]?\s*[A-Z0-9-]{4,}\b/i, "")
  );
  s = s.replace(/\b(order(?:\s*(?:no\.?|number))?|bestell(?:nr\.?|nummer))\s*[:#]?\s*[A-Z0-9-]{4,}\b/gi, (m) =>
    m.replace(/\s*[:#]?\s*[A-Z0-9-]{4,}\b/i, "")
  );
  s = s.replace(/\b(creditor\s*id|gläubiger-?id)\s*[:#]?\s*[A-Z0-9-]{6,}\b/gi, "$1");
  s = s.replace(/\b(mandate\s*(?:ref\.?|reference)?|mandatsreferenz)\s*[:#]?\s*[A-Z0-9-]{8,}\b/gi, "$1");
  s = s.replace(/\(\s*(?:no\.?|nr\.?)\s*[A-Z0-9-]{4,}\s*\)/gi, "");
  s = s.replace(/\(\s*mandate\s*\)/gi, "");
  s = s.replace(/\bfor\s+[A-Z0-9-]{6,}\b\s*:?\s*/gi, "");
  s = s.replace(/\bfor\s+\d{6,}\b\s*:?\s*/gi, "");

  // Strip legal citations in summaries (too noisy for the first read).
  s = s.replace(/§\s*\d+[a-zA-Z]*/g, "").replace(/\bSGB\s*[IVX]+\b/gi, "");

  // Normalize whitespace/punctuation leftovers.
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  s = s.replace(/^[,.;:!?]\s*/, "").trim();
  // Strip orphaned trailing prepositions (often left after removing legal citations, e.g. "... nach.").
  s = s.replace(/\b(?:nach|zu|für|gemäß|gemaess|laut)\b[ .,:;!?]*$/i, "").trim();
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  s = s.replace(/^[,.;:!?]\s*/, "").trim();
  return s;
};

const buildGist = (summary?: string | null, lang?: string) => {
  if (!summary) return null;
  const trimmed = summary.trim();
  if (!trimmed) return null;
  const rawSentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => cleanSummaryText(s))
    .map((s) => s.trim())
    .filter(Boolean);

  const hasMultipleSentences = rawSentences.length > 1;

  const isLowValueTail = (s: string) => {
    const norm = s
      .toLowerCase()
      .replace(/[…]/g, "...")
      .replace(/\s+/g, " ")
      .trim();
    if (!norm) return true;
    if (hasMultipleSentences && isStandaloneNoActionSentence(s)) return true;
    if (/^(period|zeitraum|periode)\.\.\.?$/.test(norm)) return true;
    // Optional/legalese sentences overwhelm; keep deadlines in Key facts instead.
    if (/(dispute|disputes|appeal|objection|widerspruch|einspruch|acht\s+wochen|within\s+\d+\s+weeks)/.test(norm)) return true;
    return false;
  };

  const sentences = rawSentences.filter((s) => !isLowValueTail(s));
  const pick = (arr: string[]) => {
    let gist = "";
    for (const sentence of arr.slice(0, 2)) {
      const candidate = (gist ? `${gist} ${sentence}` : sentence).trim();
      if (candidate.length > 220) break;
      gist = candidate;
    }
    if (gist) return gist;
    const first = arr[0] || "";
    return first ? truncateAtWord(first, 220) : null;
  };

  const out = pick(sentences) ?? pick(rawSentences) ?? truncateAtWord(cleanSummaryText(trimmed) || trimmed, 220);
  if (!out) return null;
  const normalized = out.replace(/[—]/g, "-");
  const withDates = replaceIsoDatesInText(normalized, lang) ?? normalized;
  return replaceMoneyInText(withDates, lang) ?? withDates;
};

const buildDetailBullets = (
  mainSummary?: string | null,
  extras?: string[] | null,
  taskTitles?: string[]
) => {
  if (!extras || extras.length === 0) return [];
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[.,;:!?()[\]"']/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const isNoisyExtra = (value: string) => {
    const n = normalize(value);
    const token = n.replace(/\s+/g, "");
    if (!token) return true;
    // Hide admin/PII facts from the calm UI: IDs, bank details, birthdates, tax/VAT refs.
    if (
      token.includes("iban") ||
      token.includes("bic") ||
      token.includes("invoiceno") ||
      token.includes("invoicenumber") ||
      token.includes("rechnungsnr") ||
      token.includes("rechnungsnummer") ||
      token.includes("customerno") ||
      token.includes("customernumber") ||
      token.includes("kundennr") ||
      token.includes("kundennummer") ||
      token.includes("mandat") ||
      token.includes("mandatsreferenz") ||
      token.includes("mandatref") ||
      token.includes("creditorid") ||
      token.includes("glaubigerid") ||
      token.includes("gläubigerid") ||
      token.includes("taxno") ||
      token.includes("taxnumber") ||
      token.includes("steuernr") ||
      token.includes("steuernummer") ||
      token.includes("birthdate") ||
      token.includes("geburtsdatum") ||
      token.includes("geburtstag") ||
      token.includes("vat") ||
      token.includes("mwst") ||
      token.includes("ust") ||
      token.includes("insuranceno") ||
      token.includes("versicherungsnummer") ||
      token.includes("policyno")
    ) {
      return true;
    }
    const compact = value.replace(/\s+/g, "");
    if (/\bde\d{2}[a-z0-9]{10,}\b/i.test(compact)) return true;
    return false;
  };

  const extractNumberTokens = (value: string) =>
    Array.from(value.matchAll(/\d[\d.,\/-]*/g)).map((m) => m[0].replace(/[^\d]/g, ""));

  const summaryNorms = (mainSummary || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => normalize(s))
    .filter(Boolean);
  const keySentences = summaryNorms.slice(0, 2);
  const summaryNumbers = new Set(
    keySentences.flatMap((s) => extractNumberTokens(s))
  );
  const taskNorms = (taskTitles || []).map((t) => normalize(t)).filter(Boolean);

  const score = (text: string) => {
    const t = text.toLowerCase();
    const has = (...keys: string[]) => keys.some((k) => t.includes(k));
    if (has("monat", "monthly", "tagessatz", "daily rate", "leistungszeitraum", "benefit period")) return 0;
    if (has("zahlungseingang", "paid", "payment received", "lastschrift", "abbuchung")) return 0;
    if (has("frist", "deadline", "due ", "bis ")) return 1;
    if (has("betrag", "summe", "total", "gesamt", "eur", "usd", "invoice", "rechnung")) return 2;
    if (has("artikel", "item", "produkt", "service", "leistung")) return 3;
    if (has("pflicht", "obligation", "return", "zurück", "non-compete", "confidential")) return 4;
    if (has("versand", "shipping", "liefer", "tracking")) return 5;
    if (has("kunde", "mandat", "referenz", "id", "nummer", "nr")) return 6;
    return 10;
  };
  const sortedExtras = [...extras].sort((a, b) => score(a) - score(b));

  const isDuplicateOfSummary = (bullet: string) => {
    if (!bullet) return false;
    const bulletNumbers = extractNumberTokens(bullet);
    if (bulletNumbers.length && bulletNumbers.every((n) => summaryNumbers.has(n))) {
      return true;
    }
    if (taskNorms.some((t) => t && (t.includes(bullet) || bullet.includes(t)))) {
      return true;
    }
    return keySentences.some((sent) => {
      if (!sent) return false;
      if (sent.includes(bullet) || bullet.includes(sent)) return true;
      const a = new Set(sent.split(" "));
      const b = new Set(bullet.split(" "));
      if (!a.size || !b.size) return false;
      let overlap = 0;
      for (const token of a) {
        if (b.has(token)) overlap += 1;
      }
      const maxSize = Math.max(a.size, b.size);
      return overlap / maxSize >= 0.6;
    });
  };

  const seen = new Set<string>();
  const bullets: string[] = [];
  for (const raw of sortedExtras) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (!s || s.length < 4) continue;
    if (isNoisyExtra(s)) continue;
    const norm = normalize(s);
    if (!norm) continue;
    if (isDuplicateOfSummary(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    bullets.push(s);
    if (bullets.length >= 8) break;
  }
  return bullets;
};

const ONE_DAY = 24 * 60 * 60 * 1000;
const getTodayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const formatDate = (iso: string | null | undefined, _lang: string) => formatDateYmdMon(iso, _lang);

type DetailItem = {
  label?: string | null;
  value: string;
  display?: string;
  note?: string | null;
  copy?: string | null;
  kind?: "text" | "date" | "phone" | "email";
};

type DetailsGroup = {
  id: "key_facts" | "contact";
  title: string;
  items: DetailItem[];
};

const normalizeDetailToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s.,;:!?()[\]"'\\/\\-]/g, "")
    .trim();

function extractIsoDate(value: string) {
  const m = value.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return m?.[1] ?? null;
}

function extractDateKey(text: string) {
  const iso = extractFlexibleDateIso(text) ?? extractIsoDate(text);
  if (iso) return iso;
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

const normalizeDetailItem = (item: DetailItem) => {
  const label = item.label ? normalizeDetailToken(item.label) : "";
  const raw = item.copy ?? item.value;
  if (item.kind === "phone" || item.kind === "email") {
    return `${item.kind}:${normalizeDetailToken(raw)}`;
  }
  if (item.kind === "date") {
    const iso = extractIsoDate(raw) ?? raw;
    return `${label}:${normalizeDetailToken(iso)}`;
  }
  return `${label}:${normalizeDetailToken(raw)}`;
};

const pushUniqueItem = (items: DetailItem[], seen: Set<string>, item: DetailItem | null | undefined) => {
  if (!item) return;
  const value = (item.value || "").trim();
  const display = typeof item.display === "string" ? item.display.trim() : "";
  const note = typeof item.note === "string" ? item.note.trim() : "";
  if (!value && !display) return;
  const normalizedItem = { ...item, value, display: display || undefined };
  const norm = normalizeDetailItem(normalizedItem);
  if (!norm) return;

  // Merge duplicate contact facts (same phone/email) by enriching the first note instead of rendering twice.
  if (seen.has(norm)) {
    const existing = items.find((i) => normalizeDetailItem(i) === norm);
    if (existing) {
      const existingNote = typeof existing.note === "string" ? existing.note.trim() : "";
      if (!existingNote && note) {
        existing.note = note;
      } else if (note && existingNote && !existingNote.includes(note)) {
        existing.note = `${existingNote} ${note}`.trim();
      }
    }
    return;
  }

  seen.add(norm);
  items.push({ ...item, value, display: display || undefined, note: note || undefined });
};

const dedupeDetailItems = (items: DetailItem[]) => {
  const deduped: DetailItem[] = [];
  const seen = new Map<string, DetailItem>();

  for (const item of items) {
    const norm = normalizeDetailItem(item);
    if (!norm) continue;
    const existing = seen.get(norm);
    if (!existing) {
      const cleanNote = typeof item.note === "string" ? item.note.trim() : "";
      const cleanDisplay = typeof item.display === "string" ? item.display.trim() : item.display;
      const cleanValue = typeof item.value === "string" ? item.value.trim() : item.value;
      const next: DetailItem = {
        ...item,
        value: cleanValue,
        display: cleanDisplay || undefined,
        note: cleanNote || undefined,
      };
      seen.set(norm, next);
      deduped.push(next);
      continue;
    }
    const existingNote = typeof existing.note === "string" ? existing.note.trim() : "";
    const newNote = typeof item.note === "string" ? item.note.trim() : "";
    if (newNote && !existingNote) {
      existing.note = newNote;
    } else if (newNote && existingNote && !existingNote.includes(newNote)) {
      existing.note = `${existingNote} ${newNote}`.trim();
    }
  }

  return deduped;
};

const dedupeDateFacts = (items: DetailItem[]) => {
  const result: DetailItem[] = [];
  const seen = new Map<string, DetailItem>();

  for (const item of items) {
    if (item.kind === "date") {
      const iso = extractDateKey(item.value) ?? extractDateKey(item.display || "");
      if (iso) {
        const existing = seen.get(iso);
        if (!existing) {
          seen.set(iso, item);
          result.push(item);
          continue;
        }
        continue;
      }
    }
    result.push(item);
  }

  return result;
};

const extractFlexibleDateIso = (value: string) => {
  const iso = extractIsoDate(value);
  if (iso) return iso;
  const m = value.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

const parseLabeledFact = (bullet: string) => {
  const parts = bullet.split(/:\s+/, 2);
  if (parts.length !== 2) return null;
  const label = parts[0]?.trim();
  const value = parts[1]?.trim();
  if (!label || !value) return null;
  const key = normalizeDetailToken(label);
  return { label, value, key };
};

const formatBillingPeriod = (iso: string, _lang: string) => {
  return formatYearMonthYmdMon(iso, _lang) ?? iso;
};

const buildDetailsGroups = (
  row: TableRow,
  pendingTasks: TaskRow[],
  lang: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
  opts?: { userNameHints?: string[] | null }
): DetailsGroup[] => {
  const keyFacts: DetailItem[] = [];
  const contacts: DetailItem[] = [];
  const seenFacts = new Set<string>();
  const seenContacts = new Set<string>();

  const normalizeName = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const stripHonorifics = (value: string) =>
    value
      .replace(
        /^(herr|frau|hr|fr|mr|mrs|ms|mme|m\.?|dr\.?|prof\.?|professor|doktor)\s+/i,
        ""
      )
      .trim();

  const userNameHints = Array.isArray(opts?.userNameHints)
    ? opts!.userNameHints!.filter((s) => typeof s === "string" && s.trim())
    : [];

  const isLikelyUserName = (candidate: string) => {
    const c = stripHonorifics(normalizeName(candidate));
    if (!c) return false;
    const cTokens = c.split(" ").filter(Boolean);
    const cKey = cTokens.join("");
    for (const hint of userNameHints) {
      const h = stripHonorifics(normalizeName(hint));
      if (!h) continue;
      if (c === h) return true;
      const hTokens = h.split(" ").filter(Boolean);
      const hKey = hTokens.join("");
      if (cKey && hKey && cKey.length >= 6 && hKey.length >= 6) {
        if (cKey.includes(hKey) || hKey.includes(cKey)) return true;
      }
      const minSize = Math.min(cTokens.length, hTokens.length);
      if (minSize < 2) continue;
      const cSet = new Set(cTokens);
      let overlap = 0;
      for (const token of hTokens) {
        if (cSet.has(token)) overlap += 1;
      }
      if (overlap >= minSize) return true;
    }
    return false;
  };

  const parseLocaleNumber = (raw: string) => {
    const s = raw.replace(/\s+/g, "").trim();
    if (!s) return null;
    const unsigned = s.replace(/^[+-]/, "");
    if (!unsigned) return null;
    const hasComma = unsigned.includes(",");
    const hasDot = unsigned.includes(".");

    let normalized = unsigned;
    if (hasComma && hasDot) {
      const lastComma = unsigned.lastIndexOf(",");
      const lastDot = unsigned.lastIndexOf(".");
      if (lastComma > lastDot) {
        normalized = unsigned.replace(/\./g, "").replace(",", ".");
      } else {
        normalized = unsigned.replace(/,/g, "");
      }
    } else if (hasComma) {
      const parts = unsigned.split(",");
      const looksGrouped =
        parts.length > 2
          ? parts.slice(1).every((p) => p.length === 3)
          : parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3;
      if (looksGrouped) {
        normalized = unsigned.replace(/,/g, "");
      } else if (parts.length === 2) {
        normalized = `${parts[0]}.${parts[1]}`;
      }
    } else if (hasDot) {
      const parts = unsigned.split(".");
      const looksGrouped =
        parts.length > 2
          ? parts.slice(1).every((p) => p.length === 3)
          : parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3;
      if (looksGrouped) {
        normalized = unsigned.replace(/\./g, "");
      } else {
        normalized = unsigned;
      }
    }

    if (s.startsWith("-") && normalized && !normalized.startsWith("-")) {
      normalized = `-${normalized}`;
    }
    const out = Number.parseFloat(normalized.replace(/^\+/, ""));
    return Number.isFinite(out) ? out : null;
  };

  const extractMoney = (text: string) => {
    const raw = text || "";
    if (!raw.trim()) return null;
    const currencyCodes = ["EUR", "USD", "GBP", "CHF", "PLN", "RON", "TRY", "UAH", "RUB"];
    const codeRe = currencyCodes.join("|");
    const symbolRe = /[€$£]/;
    const numberRe = "(\\d[\\d.,\\s]{0,20}\\d|\\d)";

    const matchSymbolFirst = raw.match(new RegExp(`(${symbolRe.source})\\s*${numberRe}`));
    if (matchSymbolFirst) {
      const symbol = matchSymbolFirst[1];
      const num = matchSymbolFirst[2];
      const amount = parseLocaleNumber(num);
      const currency = symbol === "€" ? "EUR" : symbol === "£" ? "GBP" : symbol === "$" ? "USD" : null;
      if (amount !== null) return { raw: matchSymbolFirst[0].trim(), amount, currency };
    }

    const matchCodeAfter = raw.match(new RegExp(`${numberRe}\\s*(${codeRe})\\b`, "i"));
    if (matchCodeAfter) {
      const num = matchCodeAfter[1];
      const currency = matchCodeAfter[2].toUpperCase();
      const amount = parseLocaleNumber(num);
      if (amount !== null) return { raw: matchCodeAfter[0].trim(), amount, currency };
    }

    const matchSymbolAfter = raw.match(new RegExp(`${numberRe}\\s*(${symbolRe.source})`));
    if (matchSymbolAfter) {
      const num = matchSymbolAfter[1];
      const symbol = matchSymbolAfter[2];
      const amount = parseLocaleNumber(num);
      const currency = symbol === "€" ? "EUR" : symbol === "£" ? "GBP" : symbol === "$" ? "USD" : null;
      if (amount !== null) return { raw: matchSymbolAfter[0].trim(), amount, currency };
    }

    return null;
  };

  const stripFirstOccurrence = (haystack: string, needle: string) => {
    if (!haystack || !needle) return haystack;
    const idx = haystack.indexOf(needle);
    if (idx < 0) return haystack;
    const combined = `${haystack.slice(0, idx)}${haystack.slice(idx + needle.length)}`.replace(/\s+/g, " ").trim();
    return combined.replace(/^[,;:()\-–—\s]+/, "").replace(/[\s,;:()\-–—]+$/, "").trim();
  };

  const isMoneyLikeLabel = (label: string) => {
    const n = normalizeDetailToken(label);
    return (
      /(monthly|monat|daily|tagessatz|amount|total|gesamt|betrag|summe|payout|auszahlung|zahlung|nachzahlung|rückzahlung|rueckzahlung|fee|gebuehr|gebühr|charge|refund|backpay|backpayment)/.test(
        n
      ) || /(eur|usd|gbp|chf)/.test(n)
    );
  };

  const isPeriodLikeLabel = (label: string) => {
    const n = normalizeDetailToken(label);
    return /(zeitraum|period|timeframe|coverage|validity|sperrzeit|sperrfrist|ruhezeit|ruhenszeit|blockperiod|waitingperiod)/.test(
      n
    );
  };

  const isFollowUpLikeText = (text: string) => {
    const n = normalizeDetailToken(text);
    return /(followup|follow|pending|separat|separate|separater|weitere|further|entscheidung|decision|letterwillfollow|willfollow)/.test(
      n
    );
  };

  const isAppealLikeLabel = (label: string) => {
    const n = normalizeDetailToken(label);
    return /(appeal|objection|widerspruch|einspruch)/.test(n);
  };

  const isTotalLikeLabel = (label: string) => {
    const n = normalizeDetailToken(label);
    return /(amounttotal|total|gesamtbetrag|gesamtsumme|betrag|summe)/.test(n);
  };

  const hasExactDateInText = (text: string) => !!extractDateKey(text);

  const normalizePhoneForCopy = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    const digits = trimmed.replace(/[^\d+]/g, "");
    return digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  };

  const formatInlineText = (value: string) => {
    const normalized = value.replace(/[—]/g, "-");
    const withDates = replaceIsoDatesInText(normalized, lang) ?? normalized;
    return replaceMoneyInText(withDates, lang) ?? withDates;
  };
  const formatInlineNote = (note: string | null | undefined) => {
    const cleaned = typeof note === "string" ? note.trim() : "";
    return cleaned ? formatInlineText(cleaned) : null;
  };

  const isBirthdateKey = (key: string, label: string) => {
    const joined = `${key} ${label}`.toLowerCase();
    return joined.includes("birth") || joined.includes("geburt") || joined.includes("dob");
  };

  const isReferenceLike = (key: string, label: string, value: string) => {
    const joined = `${key} ${label} ${value}`.toLowerCase();
    return (
      joined.includes("iban") ||
      joined.includes("bic") ||
      joined.includes("customer") ||
      joined.includes("kunde") ||
      joined.includes("invoice") ||
      joined.includes("rechnung") ||
      joined.includes("mandate") ||
      joined.includes("mandat") ||
      joined.includes("creditor") ||
      joined.includes("gläubiger") ||
      joined.includes("tax") ||
      joined.includes("steuer") ||
      joined.includes("versicher") ||
      joined.includes("insurance") ||
      joined.includes("policy") ||
      joined.includes("member") ||
      joined.includes("mitglied") ||
      joined.includes("order") ||
      joined.includes("bestell") ||
      /\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b/.test(value.replace(/\s+/g, "").toUpperCase())
    );
  };

  const scoreKeyFact = (item: DetailItem) => {
    const label = normalizeDetailToken(item.label || "");
    if (!label) return 5;
    if (/(sperrzeit|sperrfrist|ruhenszeit|ruhezeit|sanktion|sanction|kuerzung|kurzung|ablehn|denied|rejected|rueckforder|ruckforder|mahnung|inkasso)/.test(label))
      return 0;
    if (/(amount|total|gesamt|betrag|nachzahlung|erstattung|refund|backpay|backpayment|fee|gebuehr|gebühr|charge)/.test(label))
      return 1;
    if (/(directdebit|lastschrift|abbuch|due|deadline|termin|appointment)/.test(label)) return 2;
    if (/(monthly|monat)/.test(label)) return 2;
    if (/(daily|tagessatz|taeglich|täglich)/.test(label)) return 2;
    if (/(billingperiod|zeitraum|periode|abrechnungszeitraum|leistungszeitraum|period)/.test(label)) return 3;
    if (/(followup|follow|separat|separate|weitere)/.test(label)) return 4;
    if (/(documentdate|dokumentdatum)/.test(label)) return 9;
    if (/(appeal|objection|widerspruch|einspruch)/.test(label)) return 10;
    return 5;
  };

  // Key facts: keep short and predictable.
  if (row.amount) {
    pushUniqueItem(keyFacts, seenFacts, {
      label: t("detailsLabelAmountTotal"),
	      value: row.amount,
	      display: row.amount,
	    });
	  }
  if (row.billing_period) {
    pushUniqueItem(keyFacts, seenFacts, {
      label: t("detailsLabelBillingPeriod"),
      value: row.billing_period,
      display: formatBillingPeriod(row.billing_period, lang),
      note: formatInlineNote(t("detailsNoteBillingPeriod")),
    });
  }
  if (row.document_date) {
    const dateStr = formatDate(row.document_date, lang) ?? row.document_date;
    const titleWithDates = replaceIsoDatesInText(row.title, lang) ?? row.title;
    const titleHasDate =
      typeof titleWithDates === "string" && (titleWithDates.includes(dateStr) || titleWithDates.includes(row.document_date));
    if (!titleHasDate) {
      pushUniqueItem(keyFacts, seenFacts, {
        label: t("detailsLabelDocumentDate"),
        value: row.document_date,
        display: dateStr,
        kind: "date",
      });
    }
  }

  const parsedDeadlines = Array.isArray(row.deadlines)
    ? row.deadlines
        .filter((d) => typeof d?.date_exact === "string" && d.date_exact && !Number.isNaN(new Date(d.date_exact).getTime()))
        .map((d) => ({
          date: d.date_exact as string,
          description: typeof d?.description === "string" && d.description.trim() ? d.description.trim() : "",
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  const parsedRelativeDeadlines = Array.isArray(row.deadlines)
    ? row.deadlines
        .filter((d) => {
          const hasExact = typeof d?.date_exact === "string" && !!d.date_exact.trim();
          const rel = typeof d?.relative_text === "string" ? d.relative_text.trim() : "";
          return !hasExact && !!rel;
        })
        .map((d) => ({
          relative: (d.relative_text as string).trim(),
          description: typeof d?.description === "string" && d.description.trim() ? d.description.trim() : "",
          kind: typeof d?.kind === "string" && d.kind.trim() ? d.kind.trim() : "",
          isHard: d?.is_hard_deadline === true,
          confidence: typeof d?.confidence === "number" ? d.confidence : null,
        }))
        .sort((a, b) => Number(b.isHard) - Number(a.isHard) || (b.confidence ?? 0) - (a.confidence ?? 0))
    : [];

  const deadlineDates = new Set(parsedDeadlines.map((d) => d.date));
  if (row.due_date && !deadlineDates.has(row.due_date)) {
    pushUniqueItem(keyFacts, seenFacts, {
      label: t("detailsLabelDueDate"),
      value: row.due_date,
      display: formatDate(row.due_date, lang) ?? row.due_date,
      kind: "date",
    });
  }

  const directDebitKeywords = /(direct\s*debit|sepa|lastschrift|abbuch)/i;
  const appealKeywords = /(appeal|objection|widerspruch|einspruch)/i;

  for (const d of parsedRelativeDeadlines.slice(0, 3)) {
    const rel = d.relative;
    const isAppeal = d.kind.toLowerCase().includes("appeal") || appealKeywords.test(d.description) || appealKeywords.test(rel);
    if (isAppeal) {
      const label = lang === "de" ? t("detailsLabelObjectionBy") : t("detailsLabelAppealBy");
      pushUniqueItem(keyFacts, seenFacts, {
        label,
        value: rel,
        display: formatInlineText(rel),
        note: formatInlineNote(t("detailsNoteAppealOptional")),
        kind: "text",
      });
      continue;
    }
    if (!d.isHard) continue;
    pushUniqueItem(keyFacts, seenFacts, {
      label: t("detailsLabelDeadline"),
      value: rel,
      display: formatInlineText(rel),
      note: d.description ? formatInlineNote(d.description) : null,
      kind: "text",
    });
  }

  for (const d of parsedDeadlines.slice(0, 3)) {
    const dateStr = formatDate(d.date, lang) ?? d.date;
    if (d.description && directDebitKeywords.test(d.description)) {
      pushUniqueItem(keyFacts, seenFacts, {
        label: t("detailsLabelDirectDebit"),
        value: d.date,
        display: dateStr,
        note: formatInlineNote(t("detailsNoteDirectDebit")),
        kind: "date",
      });
      continue;
    }
    if (d.description && appealKeywords.test(d.description)) {
      const label = lang === "de" ? t("detailsLabelObjectionBy") : t("detailsLabelAppealBy");
      pushUniqueItem(keyFacts, seenFacts, {
        label,
        value: d.date,
        display: dateStr,
        note: formatInlineNote(t("detailsNoteAppealOptional")),
        kind: "date",
      });
      continue;
    }
    // Fall back to a generic deadline label to avoid long prose in Details.
    pushUniqueItem(keyFacts, seenFacts, {
      label: t("detailsLabelDeadline"),
      value: d.date,
      display: dateStr,
      kind: "date",
    });
  }

  // Contacts from structured fields.
  if (row.contact_person) {
    const trimmed = row.contact_person.trim();
    const looksPhone = /\d[\d\s()./-]{5,}\d/.test(trimmed);
    if (looksPhone) {
      pushUniqueItem(contacts, seenContacts, {
        label: t("detailsLabelContactPhone"),
        value: trimmed,
        display: trimmed,
        copy: normalizePhoneForCopy(trimmed),
        kind: "phone",
      });
    } else {
      if (!isLikelyUserName(trimmed)) {
        pushUniqueItem(contacts, seenContacts, {
          label: t("detailsLabelContactPerson"),
          value: trimmed,
          display: trimmed,
        });
      }
    }
  }
  if (row.contact_phone) {
    const trimmed = row.contact_phone.trim();
    pushUniqueItem(contacts, seenContacts, {
      label: t("detailsLabelContactPhone"),
      value: trimmed,
      display: trimmed,
      copy: normalizePhoneForCopy(trimmed),
      kind: "phone",
    });
  }
  if (row.contact_email) {
    const trimmed = row.contact_email.trim();
    pushUniqueItem(contacts, seenContacts, {
      label: t("detailsLabelContactEmail"),
      value: trimmed,
      display: trimmed,
      copy: trimmed,
      kind: "email",
    });
  }

  if (row.followup_note) {
    const note = row.followup_note.trim();
    if (note) {
      const formatted = formatInlineText(note);
      pushUniqueItem(keyFacts, seenFacts, {
        label: t("detailsLabelFollowUp"),
        value: formatted,
        display: truncateAtWord(formatted, 180),
      });
    }
  }

  // Extra bullets: route into Key facts / Reference / Contact, and normalize common noisy ones.
  const extraBullets = buildDetailBullets(row.summary || row.main_summary, row.extra_details, pendingTasks.map((t) => t.title));
  for (const bullet of extraBullets) {
    const parsed = parseLabeledFact(bullet);
    if (!parsed) continue;
    const { label, value, key } = parsed;

    // Skip duplicates of already-shown core fields.
    if (key === "documentdate" || key === "letterdate") continue;
    if (key === "billingperiod" && row.billing_period) continue;
    if (isBirthdateKey(key, label)) continue;
    if (isReferenceLike(key, label, value)) continue;

    // Payment signals: prefer a calm, date-only representation.
    if (/^(paymentreceived|paid|zahlungseingang|bezahlt)$/.test(key) || /payment\s+received|zahlungseingang|paid/i.test(label)) {
      const iso = extractFlexibleDateIso(value) ?? extractIsoDate(value);
      if (iso) {
        pushUniqueItem(keyFacts, seenFacts, {
          label: t("detailsLabelPaidDate"),
          value: iso,
          display: formatDate(iso, lang) ?? iso,
          note: formatInlineNote(t("detailsNotePaid")),
          kind: "date",
        });
      }
      continue;
    }

    // Contact-like fields.
    const isEmail = /@/.test(value) || key.includes("email") || key.includes("mail");
    const isPhone =
      key.includes("phone") ||
      key.includes("telefon") ||
      key.startsWith("tel") ||
      key.includes("mobile") ||
      key.includes("handy") ||
      key.includes("fax");
    const isContact =
      isEmail || isPhone || key.includes("kontakt") || key.includes("contact") || key.includes("ansprechpartner");
    if (isContact) {
      const looksLikeSignature = /(signatur|unterschrift|signature)/i.test(`${label} ${value}`);
      if (looksLikeSignature) continue;
      if (isEmail) {
        pushUniqueItem(contacts, seenContacts, {
          label: t("detailsLabelContactEmail"),
          value,
          display: value,
          copy: value.trim(),
          kind: "email",
        });
      } else if (isPhone || /\d[\d\s()./-]{5,}\d/.test(value)) {
        pushUniqueItem(contacts, seenContacts, {
          label: t("detailsLabelContactPhone"),
          value,
          display: value,
          copy: normalizePhoneForCopy(value),
          kind: "phone",
        });
      } else {
        if (!isLikelyUserName(value)) {
          pushUniqueItem(contacts, seenContacts, {
            label: t("detailsLabelContactPerson"),
            value,
            display: value,
          });
        }
      }
      continue;
    }

    // Otherwise treat as a key fact (short, copyable).
    if (/^(vat|mwst|ust)$/.test(key) || /vat|mwst|umsatzsteuer/i.test(label)) continue;
    const splitNote = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return { value: trimmed, note: "" };
      const m = trimmed.match(/^(.+?)\s*[—–]\s+(.+)$/);
      if (m) return { value: m[1].trim(), note: m[2].trim() };
      const m2 = trimmed.match(/^(.+?)\s+-\s+(.+)$/);
      if (m2) return { value: m2[1].trim(), note: m2[2].trim() };
      return { value: trimmed, note: "" };
    };
    const { value: valueMain, note: valueNoteRaw } = splitNote(value);
    const monthlyLabel =
      /monthly|monat/i.test(label) ? t("detailsLabelMonthlyAmount")
        : /daily|tagessatz|täglich|taeglich/i.test(label) ? t("detailsLabelDailyRate")
          : null;
    const labelNote =
      /monthly|monat/i.test(label) ? t("detailsNoteMonthlyAmount")
        : /daily|tagessatz|täglich|taeglich/i.test(label) ? t("detailsNoteDailyRate")
          : null;

    if (isPeriodLikeLabel(label)) {
      const range = extractDateRangeToIso(valueMain);
      if (range) {
        const rangeValue = `${range.start} to ${range.end}`;
        const combinedNote = valueNoteRaw || labelNote;
        pushUniqueItem(keyFacts, seenFacts, {
          label,
          value: rangeValue,
          display: replaceIsoDatesInText(rangeValue, lang) ?? rangeValue,
          note: formatInlineNote(combinedNote),
          kind: "text",
        });
        continue;
      }
    }

    const iso = extractDateKey(valueMain);
    let valueNote = valueNoteRaw;
    const labelLooksMoney = isMoneyLikeLabel(label) || /monthly|monat|daily|tagessatz/i.test(label);

    // Salvage common model drift: amount labels that accidentally put the date in `value`
    // and the money amount in the explanatory tail.
    if (labelLooksMoney && iso && valueNote) {
      const money = extractMoney(valueNote);
      if (money) {
        const dateStr = formatDate(iso, lang) ?? iso;
        valueNote = stripFirstOccurrence(valueNote, money.raw);
        valueNote = valueNote ? `${valueNote} (${dateStr})` : `(${dateStr})`;
        pushUniqueItem(keyFacts, seenFacts, {
          label: monthlyLabel ? `${monthlyLabel}${label.includes("(") ? ` ${label.slice(label.indexOf("("))}` : ""}` : label,
          value: money.raw,
          display: money.raw,
          note: formatInlineNote(valueNote),
          kind: "text",
        });
        continue;
      }
    }

    // Shipping details: hide "shipping cost 0" noise unless it carries a tracking number.
    if (/shipping|versand|liefer/i.test(label) && /0[.,]00\s*(eur|€|usd|\$|gbp|£)/i.test(value)) {
      const hasTracking = /(tracking|sendungsnummer|shipment)/i.test(value) || /\b[A-Z0-9]{10,}\b/.test(value.replace(/\s+/g, ""));
      if (!hasTracking) continue;
    }

    const combinedNote = valueNote || labelNote;
    pushUniqueItem(keyFacts, seenFacts, {
      label: monthlyLabel ? `${monthlyLabel}${label.includes("(") ? ` ${label.slice(label.indexOf("("))}` : ""}` : label,
      value: iso ?? valueMain,
      display: iso ? (formatDate(iso, lang) ?? iso) : formatInlineText(valueMain),
      note: formatInlineNote(combinedNote),
      kind: iso ? "date" : "text",
    });
  }

  // De-dupe across common "double" facts (same money amount, multiple follow-ups, appeal boilerplate).
  let dedupedFacts = [...keyFacts];

  // Drop appeal entries that carry no concrete value (e.g., model emitted "null" as value).
  dedupedFacts = dedupedFacts.filter((i) => {
    if (!isAppealLikeLabel(i.label || "")) return true;
    const v = (i.value || "").trim().toLowerCase();
    return v && v !== "null";
  });

  const hasAppealDate = dedupedFacts.some((i) => isAppealLikeLabel(i.label || "") && i.kind === "date");
  if (hasAppealDate) {
    dedupedFacts = dedupedFacts.filter((i) => !(isAppealLikeLabel(i.label || "") && i.kind !== "date"));
  }

  const appealDateGroups = new Map<string, DetailItem[]>();
  for (const item of dedupedFacts) {
    if (!isAppealLikeLabel(item.label || "")) continue;
    const key = extractDateKey(item.value) ?? extractDateKey(item.display || "");
    if (!key) continue;
    const list = appealDateGroups.get(key) || [];
    list.push(item);
    appealDateGroups.set(key, list);
  }
  const dropAppeal = new Set<DetailItem>();
  for (const [, group] of appealDateGroups) {
    if (group.length <= 1) continue;
    const ranked = group
      .map((item) => {
        const label = normalizeDetailToken(item.label || "");
        const isAppealBy =
          label.includes("appealby") ||
          label.includes("objectionby") ||
          label.includes("widerspruchbis") ||
          label.includes("einspruchbis");
        const isDeadline = label.includes("deadline");
        const weight = isAppealBy ? 0 : isDeadline ? 1 : 2;
        return { item, weight, len: (item.display || item.value).length };
      })
      .sort((a, b) => a.weight - b.weight || a.len - b.len);
    const keep = ranked[0]?.item;
    for (const { item } of ranked.slice(1)) {
      if (keep && item !== keep) dropAppeal.add(item);
    }
  }
  if (dropAppeal.size) {
    dedupedFacts = dedupedFacts.filter((i) => !dropAppeal.has(i));
  }

  const followUps = dedupedFacts.filter((i) => isFollowUpLikeText(i.label || "") || isFollowUpLikeText(i.display || i.value));
  if (followUps.length > 1) {
    const best = [...followUps].sort((a, b) => (b.display || b.value).length - (a.display || a.value).length)[0];
    dedupedFacts = dedupedFacts.filter((i) => !followUps.includes(i) || i === best);
  }

  const moneyGroups = new Map<string, DetailItem[]>();
  for (const item of dedupedFacts) {
    const money = extractMoney(item.value) ?? extractMoney(item.display || "");
    if (!money) continue;
    const key = `${money.currency || ""}:${money.amount.toFixed(2)}`;
    const list = moneyGroups.get(key) || [];
    list.push(item);
    moneyGroups.set(key, list);
  }
  const dropMoney = new Set<DetailItem>();
  for (const [, group] of moneyGroups) {
    if (group.length <= 1) continue;

    const pickBest = (items: DetailItem[]) =>
      items
        .map((item) => ({ item, len: (item.display || item.value).length }))
        .sort((a, b) => b.len - a.len)[0]?.item;

    const rateLike = (item: DetailItem) =>
      /(monthly|monat|daily|tagessatz|taeglich|täglich|rate|pro\s+tag|pro\s+monat)/.test(
        normalizeDetailToken(item.label || "")
      );
    const oneOffLike = (item: DetailItem) =>
      /\b(nachzahlung|erstattung|rueckzahlung|ruckzahlung|backpay|backpayment|arrears|refund|reimbursement|einmal|einmalig|one\s*off|one[-\s]?time)\b/.test(
        normalizeDetailToken(`${item.label || ""} ${(item.display || item.value) || ""}`)
      );
    const upcomingLike = (item: DetailItem) => {
      const n = normalizeDetailToken(item.label || "");
      return /(upcoming|next|nächste|naechste)/.test(n) && /(payment|zahlung|auszahlung)/.test(n);
    };

    const rateItems = group.filter(rateLike);
    const oneOffItems = group.filter(oneOffLike);
    const totalItems = group.filter((i) => isTotalLikeLabel(i.label || ""));

    const keep = new Set<DetailItem>();
    const bestRate = pickBest(rateItems);
    const bestOneOff = pickBest(oneOffItems);
    const bestTotal = pickBest(totalItems);

    if (bestRate && bestOneOff) {
      keep.add(bestRate);
      keep.add(bestOneOff);
    } else if (bestOneOff) {
      keep.add(bestOneOff);
    } else if (bestRate && bestTotal) {
      const rateLabel = normalizeDetailToken(bestRate.label || "");
      const preferRate =
        /(auszahlung|payout|benefit|leistung|arbeitslosen|unemployment)/.test(rateLabel);
      keep.add(preferRate ? bestRate : bestTotal);
    } else if (bestTotal) {
      keep.add(bestTotal);
    } else if (bestRate) {
      keep.add(bestRate);
    } else {
      const bestAny = pickBest(group);
      if (bestAny) keep.add(bestAny);
    }

    for (const item of group) {
      if (keep.has(item)) continue;
      // Upcoming/next payment is almost always redundant when the same amount appears elsewhere.
      if (upcomingLike(item)) {
        dropMoney.add(item);
        continue;
      }
      dropMoney.add(item);
    }
  }
  if (dropMoney.size) {
    dedupedFacts = dedupedFacts.filter((i) => !dropMoney.has(i));
  }

  // If a label indicates a time period ("Zeitraum"/"period") but only a single start date is present,
  // try to expand it to a start+end range using other extracted date ranges on the card.
  const rangesByStart = new Map<string, string>();
  for (const item of keyFacts) {
    const combined = [item.display, item.value, item.note]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(" | ");
    if (!combined) continue;
    const range = extractDateRangeToIso(combined);
    if (!range) continue;
    const existing = rangesByStart.get(range.start);
    if (!existing || existing < range.end) rangesByStart.set(range.start, range.end);
  }

  dedupedFacts = dedupedFacts.map((item) => {
    if (!item.label || item.kind !== "date") return item;
    if (!isPeriodLikeLabel(item.label)) return item;
    const alreadyRange =
      extractDateRangeToIso(item.value) ||
      extractDateRangeToIso(item.display || "") ||
      extractDateRangeToIso(item.note || "");
    if (alreadyRange) return item;

    const startIso = extractDateKey(item.value) ?? extractDateKey(item.display || "");
    if (!startIso) return item;
    const endIso = rangesByStart.get(startIso);
    if (!endIso) {
      const fromValue = `${t("detailsPrefixFrom")} ${startIso}`;
      return {
        ...item,
        display: replaceIsoDatesInText(fromValue, lang) ?? fromValue,
      };
    }

    const rangeValue = `${startIso} to ${endIso}`;

    return {
      ...item,
      value: rangeValue,
      display: replaceIsoDatesInText(rangeValue, lang) ?? rangeValue,
      kind: "text",
    };
  });

  // Keep Key facts short; Reference/Contact can be a bit longer (since it's behind Details).
  const dedupedDateFacts = dedupeDateFacts(dedupedFacts);
  const sortedFacts = [...dedupedDateFacts].sort((a, b) => scoreKeyFact(a) - scoreKeyFact(b));
  const dedupedContacts = dedupeDetailItems(contacts);
  const groups: DetailsGroup[] = [
    { id: "key_facts", title: t("detailsKeyFacts"), items: sortedFacts.slice(0, 6) },
    { id: "contact", title: t("detailsContact"), items: dedupedContacts.slice(0, 4) },
  ];

  return groups.filter((g) => g.items.length > 0);
};

const computeDueBadge = (
  row: TableRow,
  pendingTasks: TaskRow[],
  t: (key: string, vars?: Record<string, string | number>) => string
) => {
  const hasAction = row.action_required || (pendingTasks ?? []).length > 0;
  if (!hasAction) return null;

  const taskDue = pendingTasks
    .map((t) => (t.due_date ? new Date(t.due_date).getTime() : null))
    .filter((t): t is number => t !== null && !Number.isNaN(t))
    .sort((a, b) => a - b)[0];
  const fallbackDue =
    row.due_date && !Number.isNaN(new Date(row.due_date).getTime())
      ? new Date(row.due_date).getTime()
      : null;
  const due = taskDue ?? fallbackDue;
  if (!due) return null;

  const today = getTodayStart();
  const daysDiff = Math.floor((due - today) / ONE_DAY);
  if (daysDiff < 0)
    return {
      label: t("dueOverdue", { days: Math.abs(daysDiff) }),
      tone: "warn" as const,
    };
  if (daysDiff === 0) return { label: t("dueToday"), tone: "warn" as const };
  if (daysDiff === 1) return { label: t("dueInOne"), tone: "info" as const };
  if (daysDiff <= 7) return { label: t("dueInDays", { days: daysDiff }), tone: "info" as const };
	  return { label: t("dueInDays", { days: daysDiff }), tone: "muted" as const };
	};

type StatusLine = { label: string; tone: "warn" | "muted" | "info" };

const computeStatusLine = (
  row: TableRow,
  pendingTasks: TaskRow[],
  lang: string,
  t: (key: string, vars?: Record<string, string | number>) => string
): StatusLine | null => {
  const hasAction = row.action_required || (pendingTasks ?? []).length > 0;
  if (!hasAction) return { label: t("noActionRequired"), tone: "muted" };

  const taskDue = pendingTasks
    .map((t) => (t.due_date ? new Date(t.due_date).getTime() : null))
    .filter((t): t is number => t !== null && !Number.isNaN(t))
    .sort((a, b) => a - b)[0];
  const fallbackDue =
    row.due_date && !Number.isNaN(new Date(row.due_date).getTime())
      ? new Date(row.due_date).getTime()
      : null;
  const due = taskDue ?? fallbackDue;
  if (due) {
    const iso = new Date(due).toISOString().slice(0, 10);
    const dueBadge = computeDueBadge(row, pendingTasks, t);
    return {
      label: t("actionNeededBy", { date: formatDate(iso, lang) ?? iso }),
      tone: dueBadge?.tone ?? "info",
    };
  }

  if (pendingTasks.length) {
    const label =
      pendingTasks.length === 1
        ? t("openTasks", { count: pendingTasks.length })
        : t("openTasksPlural", { count: pendingTasks.length });
    return { label, tone: "info" };
  }

  const actionDescription = typeof row.action_text === "string" ? row.action_text.trim() : "";
  if (actionDescription) {
    const formatted = (replaceIsoDatesInText(actionDescription, lang) ?? actionDescription).replace(/[—]/g, "-");
    return { label: truncateAtWord(formatted, 120), tone: "info" };
  }
  return { label: t("actionRequired"), tone: "info" };
};

const sortPendingTasks = (a: TaskRow, b: TaskRow) => {
  const dueTime = (value: string | null | undefined) => {
    if (!value) return Number.POSITIVE_INFINITY;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  const urgencyRank = (value: string | null | undefined) => {
    const v = (value || "").toLowerCase();
    if (v === "high") return 0;
    if (v === "normal") return 1;
    if (v === "low") return 2;
    return 3;
  };

  const dueA = dueTime(a.due_date);
  const dueB = dueTime(b.due_date);
  const hasDueA = Number.isFinite(dueA) ? 0 : 1;
  const hasDueB = Number.isFinite(dueB) ? 0 : 1;
  if (hasDueA !== hasDueB) return hasDueA - hasDueB;
  if (dueA !== dueB) return dueA - dueB;

  const urgA = urgencyRank(a.urgency);
  const urgB = urgencyRank(b.urgency);
  if (urgA !== urgB) return urgA - urgB;

  return (a.title || "").localeCompare(b.title || "");
};

const fetchDocs = useCallback(
    async (showLoading: boolean) => {
      let timeout: NodeJS.Timeout | null = null;
      if (showLoading) {
        setLoading(true);
        setError(null);
        timeout = setTimeout(() => {
          setError((prev) => prev ?? t("takingTooLong"));
          setLoading(false);
        }, 6000);
      }
      try {
        const supabase = supabaseBrowser();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          setUserId(null);
          setError(t("notLoggedIn"));
          if (timeout) clearTimeout(timeout);
          setLoading(false);
          return;
        }
        setUserId(user.id);

        const metaFullName =
          typeof (user.user_metadata as any)?.full_name === "string" && (user.user_metadata as any).full_name.trim()
            ? String((user.user_metadata as any).full_name).trim()
            : null;
        const email =
          typeof (user as any)?.email === "string" && String((user as any).email).trim()
            ? String((user as any).email).trim()
            : null;

        const docsQuery = supabase
          .from("documents")
          .select(
            "id, title, status, error_message, storage_path, category_id, case_id, created_at, extra:extractions(content, created_at)"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (categoryFilter === null) {
          docsQuery.is("category_id", null);
        } else if (Array.isArray(categoryFilter) && categoryFilter.length > 0) {
          docsQuery.in("category_id", categoryFilter);
        }
        if (caseFilter) {
          docsQuery.eq("case_id", caseFilter);
        }

        const [docsRes, catsRes, catTransRes, tasksRes, casesRes, profileRes] = await Promise.all([
          docsQuery,
          supabase
            .from("categories")
            .select("id, name, parent_id")
            .eq("user_id", user.id),
          supabase
            .from("category_translations")
            .select("category_id, label, lang")
            .eq("user_id", user.id)
            .eq("lang", lang),
          supabase
            .from("tasks")
            .select("id, document_id, title, status, due_date, urgency")
            .eq("user_id", user.id),
          supabase.from("cases").select("id, title, status").eq("user_id", user.id),
          supabase.from("profiles").select("full_name, username").eq("id", user.id).maybeSingle(),
        ]);

        if (docsRes.error) throw docsRes.error;
        if (catsRes.error && (catsRes.error as { code?: string }).code !== "42P01")
          throw catsRes.error;
        if (tasksRes.error && (tasksRes.error as { code?: string }).code !== "42P01")
          throw tasksRes.error;
        if (catTransRes.error && (catTransRes.error as { code?: string }).code !== "42P01")
          throw catTransRes.error;
        if (casesRes.error && (casesRes.error as { code?: string }).code !== "42P01")
          throw casesRes.error;

        const nameHints = new Set<string>();
        if (metaFullName) nameHints.add(metaFullName);
        if (email) {
          nameHints.add(email);
          const local = email.split("@")[0]?.trim();
          if (local) {
            nameHints.add(local);
            const spaced = local.replace(/[._-]+/g, " ").trim();
            if (spaced && spaced !== local) nameHints.add(spaced);
          }
        }
        if (!profileRes.error) {
          const fullName =
            typeof (profileRes.data as any)?.full_name === "string" && (profileRes.data as any).full_name.trim()
              ? String((profileRes.data as any).full_name).trim()
              : null;
          const username =
            typeof (profileRes.data as any)?.username === "string" && (profileRes.data as any).username.trim()
              ? String((profileRes.data as any).username).trim()
              : null;
          if (fullName) nameHints.add(fullName);
          if (username) nameHints.add(username);
        } else {
          const code = (profileRes.error as { code?: string } | null)?.code;
          if (code !== "42P01") {
            console.warn("profiles lookup failed (ignored)", profileRes.error);
          }
        }
        setUserNameHints(Array.from(nameHints));

        const catMap = new Map<string, CategoryRow>();
        const cats = (catsRes.data as CategoryRow[] | null) ?? [];
        cats.forEach((c) => {
          catMap.set(c.id, c);
        });
        const translationMap = new Map<string, string>();
        (catTransRes.data as { category_id: string; label: string; lang: string }[] | null)?.forEach(
          (t) => {
            if (t?.category_id && typeof t.label === "string") {
              translationMap.set(t.category_id, t.label);
            }
          }
        );

        const buildSegments = (id: string) => {
          const parts: { name: string; display: string }[] = [];
          let current: string | null | undefined = id;
          const visited = new Set<string>();
          while (current) {
            if (visited.has(current)) break;
            visited.add(current);
            const cat = catMap.get(current);
            if (!cat) break;
            const display = translationMap.get(current) ?? formatSegmentDisplay(cat.name, lang);
            parts.unshift({ name: cat.name, display });
            current = cat.parent_id;
          }
          return parts;
        };

        const catOptions: {
          id: string;
          path: string;
          displayPath: string;
          displayLabel: string;
        }[] = [];

        catMap.forEach((_, id) => {
          const parts = buildSegments(id);
          const path = parts.map((p) => p.name).join(" / ");
          const displayPath = parts.map((p) => p.display).join(" / ");
          const displayLabel =
            parts.length > 0
              ? parts[parts.length - 1].display
              : formatSegmentDisplay(path || "", lang);
          catOptions.push({
            id,
            path,
            displayPath,
            displayLabel,
          });
        });
        setCategoryOptions(catOptions.sort((a, b) => a.displayPath.localeCompare(b.displayPath)));
        const caseOpts = ((casesRes.data as { id: string; title: string; status: string }[] | null) ?? []).sort((a, b) =>
          a.title.localeCompare(b.title)
        );
        setCaseOptions(caseOpts);

        // Best-effort: persist missing translations so future renders are localized without code maps
        if (lang !== "en") {
          const missingTranslations: { user_id: string; category_id: string; lang: string; label: string }[] = [];
          catMap.forEach((cat, id) => {
            if (translationMap.has(id)) return;
            const translated =
              translateCategorySegment(cat.name, lang) !== cat.name
                ? translateCategorySegment(cat.name, lang)
                : formatSegmentDisplay(cat.name, lang);
            if (translated && translated.trim()) {
              missingTranslations.push({
                user_id: user.id,
                category_id: id,
                lang,
                label: translated.trim(),
              });
              translationMap.set(id, translated.trim());
            }
          });
          if (missingTranslations.length) {
            try {
              await supabase
                .from("category_translations")
                .upsert(missingTranslations, { onConflict: "user_id,category_id,lang" });
            } catch (transErr) {
              console.warn("category translation upsert skipped", transErr);
            }
          }
        }

        const buildPath = (catId?: string | null) => {
          if (!catId) return undefined;
          const parts = buildSegments(catId);
          return parts.length ? `/${parts.map((p) => p.display).join("/")}` : undefined;
        };

        const tasksByDoc = new Map<string, TaskRow[]>();
        (tasksRes.data as TaskRow[] | null)?.forEach((t) => {
          if (!t.document_id) return;
          const arr = tasksByDoc.get(t.document_id) ?? [];
          arr.push(t);
          tasksByDoc.set(t.document_id, arr);
        });

        const mapped =
          (docsRes.data as DocumentRow[] | null)?.map((doc) => {
            const latest = pickLatestExtraction(doc.extra as ExtractionRow[] | undefined);
            const keyFields = (latest?.key_fields ?? {}) as Record<string, unknown>;
            const summary =
              typeof latest?.summary === "string" && latest.summary.trim()
                ? latest.summary.trim()
                : undefined;
            const mainSummary =
              typeof (latest as any)?.main_summary === "string" && (latest as any)?.main_summary?.trim()
                ? ((latest as any)?.main_summary as string).trim()
                : undefined;
            const resolvedSummary = summary || mainSummary;
            const resolvedMainSummary = mainSummary || summary || null;
            const badgeText =
              typeof (latest as any)?.badge_text === "string" && (latest as any)?.badge_text?.trim()
                ? ((latest as any)?.badge_text as string).trim()
                : null;
	            const extraDetails =
	              Array.isArray((latest as any)?.extra_details) && (latest as any)?.extra_details.length
	                ? ((latest as any)?.extra_details as string[]).filter(
	                    (s) => typeof s === "string" && s.trim().length > 0
	                  )
	                : [];
	            const documentDate =
	              typeof (latest as any)?.key_fields?.document_date === "string" && (latest as any)?.key_fields?.document_date?.trim()
	                ? ((latest as any)?.key_fields?.document_date as string).trim()
	                : typeof (latest as any)?.key_fields?.letter_date === "string" && (latest as any)?.key_fields?.letter_date?.trim()
	                  ? ((latest as any)?.key_fields?.letter_date as string).trim()
	                  : null;
	            const billingPeriod =
	              typeof (latest as any)?.key_fields?.billing_period === "string" && (latest as any)?.key_fields?.billing_period?.trim()
	                ? ((latest as any)?.key_fields?.billing_period as string).trim()
	                : null;
	            const contactPerson =
	              typeof (latest as any)?.key_fields?.contact_person === "string" && (latest as any)?.key_fields?.contact_person?.trim()
	                ? ((latest as any)?.key_fields?.contact_person as string).trim()
	                : null;
	            const contactPhone =
	              typeof (latest as any)?.key_fields?.contact_phone === "string" && (latest as any)?.key_fields?.contact_phone?.trim()
	                ? ((latest as any)?.key_fields?.contact_phone as string).trim()
	                : null;
	            const contactEmail =
	              typeof (latest as any)?.key_fields?.contact_email === "string" && (latest as any)?.key_fields?.contact_email?.trim()
	                ? ((latest as any)?.key_fields?.contact_email as string).trim()
	                : null;
	            const refEntries =
	              (latest as any)?.key_fields?.reference_ids &&
	              typeof (latest as any)?.key_fields?.reference_ids === "object" &&
	              !Array.isArray((latest as any)?.key_fields?.reference_ids)
	                ? (Object.entries((latest as any)?.key_fields?.reference_ids as Record<string, unknown>)
	                    .filter(([, v]) => typeof v === "string" && !!v.trim())
	                    .map(([k, v]) => ({ key: k, value: (v as string).trim() })) ?? [])
	                : [];
            const deadlinesArr = Array.isArray((latest as any)?.deadlines)
              ? ((latest as any)?.deadlines as any[])
                  .filter((d) => d && typeof d === "object")
                  .map((d) => ({
                    id: (d as any)?.id ?? null,
                    date_exact:
                      typeof (d as any)?.date_exact === "string" && (d as any)?.date_exact.trim()
                        ? ((d as any)?.date_exact as string).trim()
                        : null,
                    relative_text:
                      typeof (d as any)?.relative_text === "string" && (d as any)?.relative_text.trim()
                        ? ((d as any)?.relative_text as string).trim()
                        : null,
                    description:
                      typeof (d as any)?.description === "string" && (d as any)?.description.trim()
                        ? ((d as any)?.description as string).trim()
                        : null,
                    kind:
                      typeof (d as any)?.kind === "string" && (d as any)?.kind.trim()
                        ? ((d as any)?.kind as string).trim()
                        : null,
                    is_hard_deadline:
                      typeof (d as any)?.is_hard_deadline === "boolean" ? ((d as any)?.is_hard_deadline as boolean) : null,
                    confidence: typeof (d as any)?.confidence === "number" ? ((d as any)?.confidence as number) : null,
                  }))
              : [];
            const earliestDeadline = deadlinesArr
              .map((d) => d.date_exact)
              .filter((d): d is string => !!d && !Number.isNaN(new Date(d).getTime()))
              .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] ?? null;
            const amountsArr = Array.isArray((latest as any)?.amounts)
              ? ((latest as any)?.amounts as any[])
                  .filter((a) => a && typeof a === "object")
                  .map((a) => ({
                    value: typeof (a as any)?.value === "number" ? (a as any)?.value : null,
                    currency:
                      typeof (a as any)?.currency === "string" && (a as any)?.currency.trim()
                        ? ((a as any)?.currency as string).trim()
                        : null,
                    direction:
                      typeof (a as any)?.direction === "string" && (a as any)?.direction.trim()
                        ? ((a as any)?.direction as string).trim()
                        : null,
                    description:
                      typeof (a as any)?.description === "string" && (a as any)?.description.trim()
                        ? ((a as any)?.description as string).trim()
                        : null,
                  }))
              : [];
            const sender =
              typeof keyFields.sender === "string" && keyFields.sender.trim()
                ? (keyFields.sender as string).trim()
                : undefined;
            const topic =
              typeof keyFields.topic === "string" && keyFields.topic.trim()
                ? (keyFields.topic as string).trim()
                : undefined;
            const domainProfile =
              typeof (latest as any)?.key_fields?.domain_profile_label === "string" &&
              ((latest as any)?.key_fields?.domain_profile_label as string).trim()
                ? ((latest as any)?.key_fields?.domain_profile_label as string).trim()
                : null;
            const amount =
              typeof keyFields.amount_total === "number"
                ? `${keyFields.amount_total} ${(keyFields.currency as string | undefined) || ""}`.trim()
                : undefined;
            const due =
              typeof keyFields.due_date === "string" && keyFields.due_date.trim()
                ? (keyFields.due_date as string).trim()
                : earliestDeadline;
            const actionRequired =
              keyFields.action_required === true ||
              (tasksByDoc.get(doc.id) ?? []).some((t) => t.status !== "done");
            const actionText =
              typeof keyFields.action_description === "string" && keyFields.action_description.trim()
                ? (keyFields.action_description as string).trim()
                : null;
            const categorySuggestionSlug =
              typeof (latest as any)?.category_suggestion?.slug === "string"
                ? ((latest as any)?.category_suggestion?.slug as string)
                : null;
            const categorySuggestionPath =
              Array.isArray((latest as any)?.category_suggestion?.path) &&
              ((latest as any)?.category_suggestion?.path as string[]).length
                ? ((latest as any)?.category_suggestion?.path as string[]).filter(
                    (s) => typeof s === "string" && s.trim().length > 0
                  )
                : null;
            const categorySuggestionConfidence =
              typeof (latest as any)?.category_suggestion?.confidence === "number"
                ? ((latest as any)?.category_suggestion?.confidence as number)
                : null;
            const followup =
              typeof (latest as any)?.key_fields?.follow_up === "string" &&
              ((latest as any)?.key_fields?.follow_up as string).trim()
                ? ((latest as any)?.key_fields?.follow_up as string).trim()
                : null;

            return {
              id: doc.id,
              title: doc.title,
              status: doc.status,
              error_message: doc.error_message,
              storage_path: doc.storage_path ?? undefined,
              category_id: doc.category_id ?? null,
              case_id: doc.case_id ?? null,
              case_title: doc.case_id
                ? caseOpts.find((c) => c.id === doc.case_id)?.title ?? null
                : null,
              category_path: buildPath(doc.category_id ?? undefined),
              tasks: tasksByDoc.get(doc.id) ?? [],
              created_at: doc.created_at,
              sender,
              topic,
              amount,
              due_date: due,
              action_required: actionRequired,
              action_text: actionText,
              category_suggestion_slug: categorySuggestionSlug,
              category_suggestion_path: categorySuggestionPath,
              category_suggestion_confidence: categorySuggestionConfidence,
	              followup_note: followup,
	              summary: resolvedSummary,
	              main_summary: resolvedMainSummary,
	              badge_text: badgeText,
	              extra_details: extraDetails,
              deadlines: deadlinesArr,
              actions_required: Array.isArray((latest as any)?.actions_required)
                ? ((latest as any)?.actions_required as any[])
                    .filter((a) => a && typeof a === "object")
                    .map((a) => ({
                      id: (a as any)?.id ?? null,
                      label:
                        typeof (a as any)?.label === "string" && (a as any)?.label.trim()
                          ? ((a as any)?.label as string).trim()
                          : null,
                      due_date:
                        typeof (a as any)?.due_date === "string" && (a as any)?.due_date.trim()
                          ? ((a as any)?.due_date as string).trim()
                          : null,
                      severity:
                        typeof (a as any)?.severity === "string" && (a as any)?.severity.trim()
                          ? ((a as any)?.severity as string).trim()
                          : null,
                    }))
                : [],
              risk_level:
                typeof (latest as any)?.risk_level === "string"
                  ? ((latest as any)?.risk_level as string)
                  : null,
              uncertainty_flags: Array.isArray((latest as any)?.uncertainty_flags)
                ? ((latest as any)?.uncertainty_flags as string[]).filter(
                    (s) => typeof s === "string" && s.trim().length > 0
                  )
                : null,
              amounts: amountsArr,
              domain_profile_label: domainProfile,
	              tags:
	                Array.isArray((latest as any)?.tags) && (latest as any)?.tags.length
	                  ? ((latest as any)?.tags as string[]).filter((s) => typeof s === "string" && s.trim().length > 0)
	                  : [],
	              document_date: documentDate,
	              billing_period: billingPeriod,
	              contact_person: contactPerson,
	              contact_phone: contactPhone,
	              contact_email: contactEmail,
	              reference_ids:
	                refEntries.length
	                  ? refEntries.map((e) => e.value)
	                  : (latest as any)?.key_fields?.reference_ids && typeof (latest as any)?.key_fields?.reference_ids === "object"
	                    ? (Object.values((latest as any)?.key_fields?.reference_ids as Record<string, unknown>).filter(
	                        (v): v is string => typeof v === "string" && !!v.trim()
	                      ) ?? [])
	                  : ([] as string[]),
	              reference_id_entries: refEntries,
	              workflow_status:
	                typeof (latest as any)?.key_fields?.workflow_status === "string" &&
	                ((latest as any)?.key_fields?.workflow_status as string).trim()
	                  ? ((latest as any)?.key_fields?.workflow_status as string).trim()
                  : null,
            };
          }) ?? [];

        const fetched = mapped.filter((r) => r.status !== "error");
        const fetchedPaths = new Set(
          fetched.map((r) => (r.storage_path ? r.storage_path.toLowerCase() : ""))
        );
        const optimisticKeep = optimisticRows.filter((o) => {
          if (!o.storage_path) return true;
          return !fetchedPaths.has(o.storage_path.toLowerCase());
        });
        const combined = [...optimisticKeep, ...fetched].sort((a, b) => {
          const ta = new Date(a.created_at).getTime();
          const tb = new Date(b.created_at).getTime();
          if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
          return tb - ta;
        });
        setRows(combined);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (timeout) clearTimeout(timeout);
        if (showLoading) setLoading(false);
      }
    },
    [categoryFilter, lang, t]
  );

  const pickLatestExtraction = (extras?: ExtractionRow[] | null) => {
    if (!extras || extras.length === 0) return null;
    const sorted = [...extras].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return sorted[0]?.content ?? null;
  };

  useEffect(() => {
    const handleDataChanged = () => fetchDocs(true);
    if (typeof window !== "undefined") {
      window.addEventListener("docflow:data-changed", handleDataChanged);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("docflow:data-changed", handleDataChanged);
      }
    };
  }, [fetchDocs]);

  useEffect(() => {
    fetchDocs(true);
  }, [categoryFilter, fetchDocs]);

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      if (loading) {
        setError((prev) => prev ?? "Still loading… please refresh or check your connection.");
        setLoading(false);
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    fetchDocs(false);
  }, [refreshKey, categoryFilter, fetchDocs]);

  useEffect(() => {
    const hasProcessing = rows.some((r) => r.status !== "done");
    if (!hasProcessing || previewUrl) return;
    const interval = setInterval(() => {
      fetchDocs(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [rows, previewUrl, fetchDocs]);

  const isHome = mode === "home";
  const visibleRows = isHome ? rows.filter((r) => !hiddenDocIds.has(r.id)) : rows;
  const processingRows = isHome ? visibleRows.filter((r) => r.status !== "done") : [];
  const openRows = isHome
    ? visibleRows.filter(
        (r) => r.status === "done" && (r.tasks ?? []).some((t) => t.status !== "done")
      )
    : visibleRows;
  const readyRows = isHome
    ? visibleRows.filter(
        (r) => r.status === "done" && !(r.tasks ?? []).some((t) => t.status !== "done")
      )
    : [];

  const renderDetailsGroups = (rowId: string, detailsGroups: DetailsGroup[]) => {
    const splitValueAndNote = (raw: string, kind: DetailItem["kind"], isContact: boolean) => {
      const trimmed = raw.trim();
      const m = trimmed.match(/^(.+?)\s*[–—-]\s+(.+)$/);
      if (m) {
        const trailing = m[2].trim();
        const hasLetters = /[A-Za-zÀ-ÿ]/.test(trailing);
        if (isContact && hasLetters) {
          return { value: m[1].trim(), extraNote: trailing };
        }
      }
      return { value: trimmed, extraNote: "" };
    };

    return (
      <div className="pit-subtitle text-xs" style={{ lineHeight: 1.5, color: "rgba(0,0,0,0.75)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {detailsGroups.map((group) => (
            <div key={`${rowId}-details-${group.id}`}>
              <div className="text-[11px] font-medium" style={{ color: "rgba(0,0,0,0.55)", marginBottom: "4px" }}>
                {group.title}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {group.items
                  .filter((item) => {
                    const rawVal = (item.display ?? item.value ?? "").toString().trim();
                    const lower = rawVal.toLowerCase();
                    const isPlaceholder =
                      ["neutral", "unknown", "n/a", "na", "null", "keine angabe", "not provided"].includes(lower) ||
                      lower.startsWith("null");
                    const hasVal = rawVal && lower !== "null" && !isPlaceholder;
                    const hasNote = typeof item.note === "string" && item.note.trim().length > 0;
                    return hasVal || hasNote;
                  })
                  .map((item, idx) => {
                    const showLabel = typeof item.label === "string" && item.label.trim().length > 0;
                    const rawVal = (item.display ?? item.value ?? "").toString().trim();
                    const lower = rawVal.toLowerCase();
                    const isPlaceholder =
                      ["neutral", "unknown", "n/a", "na", "null", "keine angabe", "not provided"].includes(lower) ||
                      lower.startsWith("null");
                    const hasValue = rawVal && lower !== "null" && !isPlaceholder;
                    const { value: splitValue, extraNote } = hasValue
                      ? splitValueAndNote(rawVal, item.kind, group.id === "contact")
                      : { value: "", extraNote: "" };
                    const value = hasValue ? splitValue : "";
                    const noteRaw = typeof item.note === "string" && item.note.trim().length > 0 ? item.note.trim() : "";
                    const note = noteRaw || (group.id === "contact" ? extraNote : "");
                    return (
                      <div
                        key={`${rowId}-${group.id}-item-${idx}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: showLabel ? "minmax(0, 140px) 1fr" : "1fr",
                          gap: "2px 12px",
                          alignItems: "baseline",
                        }}
                      >
                        {showLabel ? (
                          <div style={{ color: "rgba(0,0,0,0.6)", fontSize: "12px", fontWeight: 500 }}>
                            {item.label}
                          </div>
                        ) : null}
                        {value ? (
                          <div
                            style={{
                              color: "rgba(0,0,0,0.78)",
                              fontSize: "12px",
                              fontWeight: 600,
                              lineHeight: 1.35,
                              display: "inline-flex",
                              gap: "6px",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span>{value}</span>
                            {item.copy && (item.kind === "phone" || item.kind === "email") ? (
                              <button
                                type="button"
                                onClick={() => handleCopy(`${rowId}:${group.id}:${idx}`, item.copy as string)}
                                style={{
                                  border: "1px solid rgba(0,0,0,0.12)",
                                  background: "rgba(255,255,255,0.7)",
                                  borderRadius: "999px",
                                  padding: "2px 8px",
                                  fontSize: "11px",
                                  color: "rgba(0,0,0,0.65)",
                                  cursor: "pointer",
                                }}
                              >
                                {copiedKey === `${rowId}:${group.id}:${idx}` ? t("copied") : t("copy")}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {note ? (
                          <div
                            style={{
                              gridColumn: showLabel ? "2 / -1" : "1 / -1",
                              color: "rgba(0,0,0,0.6)",
                              fontSize: "11px",
                              lineHeight: 1.35,
                            }}
                          >
                            {note}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCards = (data: TableRow[], opts?: { noTasksSection?: boolean; emptyMessage?: string }) => {
    const showMoveToFiles = (row: TableRow, pending: TaskRow[]) =>
      opts?.noTasksSection || pending.length === 0;
    return (
      <div className="flex flex-col gap-4">
        {error ? (
          <div className="pit-error">{error}</div>
        ) : loading ? (
          <div className="pit-muted">{t("loading")}</div>
        ) : data.length === 0 ? (
          <div className="pit-muted">{opts?.emptyMessage || t("noDocs")}</div>
        ) : (
		          data.map((row) => {
		            const pendingTasks = (row.tasks?.filter((t) => t.status !== "done") ?? []).slice().sort(sortPendingTasks);
		            const doneTasks = row.tasks?.filter((t) => t.status === "done") ?? [];
			            const hasAnyTasks = pendingTasks.length > 0 || doneTasks.length > 0;
			            const allDone = pendingTasks.length === 0 && doneTasks.length > 0;
			            const gist = buildGist(row.summary || row.main_summary, lang);
                  const displayTitle = replaceIsoDatesInText(row.title, lang) ?? row.title;
		            const isSummaryExpanded = expandedSummaries.has(row.id);
		            const isExpanded = mode !== "files" || expandedCards.has(row.id);
		            const statusLine = isHome ? computeStatusLine(row, pendingTasks, lang, t) : null;
	            const primaryAction = pendingTasks.length
	              ? pendingTasks.length === 1
	                ? t("openTasks", { count: pendingTasks.length })
	                : t("openTasksPlural", { count: pendingTasks.length })
	              : t("noActionRequired");
            const detailsGroups = buildDetailsGroups(row, pendingTasks, lang, t, { userNameHints });
            const hasDetails = detailsGroups.length > 0;
            const topFacts: DetailItem[] = [];
	            if (!isExpanded) {
	              return (
                <div
                  key={row.id}
                  className="pit-radius-lg border border-[rgba(0,0,0,0.1)] bg-[rgba(247,243,236,0.4)] p-4 pit-shadow-1"
                  style={{
                    position: "relative",
                    paddingTop: "24px",
                    paddingBottom: "24px",
                    cursor: mode === "files" ? "pointer" : "default",
                  }}
                  onClick={() => {
                    if (mode === "files") {
                      setExpandedCards((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      });
                    }
                  }}
                >
                  <div
                    className="absolute flex items-center gap-2"
                    style={{ right: "4px", top: "12px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label="Actions"
                      onClick={() => setActionMenuRow(row)}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: "8px",
                        cursor: "pointer",
                        minWidth: "44px",
                        minHeight: "44px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.75,
                      }}
                    >
                      <Image src={stackIcon} alt="Actions" width={16} height={16} style={{ opacity: 0.9 }} />
                    </button>
                  </div>
                  <div className="flex items-start justify-between gap-3 pr-4">
                    <div className="flex flex-col gap-1" style={{ flex: 1 }}>
                      <div
                        className="font-medium"
                        style={{
                          wordBreak: "break-word",
                          paddingRight: "32px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          display: "block",
                        }}
                      >
                        {displayTitle}
                      </div>
                      <div className="flex items-center gap-2" style={{ marginTop: "10px" }}>
                        {mode === "files" ? (
                          row.category_path ? (
                            <span className="text-xs text-[rgba(0,0,0,0.65)]">{row.category_path}</span>
                          ) : (
                            <span className="text-xs text-[rgba(0,0,0,0.45)]">{t("noCategory") ?? ""}</span>
                          )
                        ) : (
                          <span className="text-sm text-[rgba(0,0,0,0.78)]">{gist || primaryAction}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={row.id}
                className="pit-radius-lg border border-[rgba(0,0,0,0.1)] bg-[rgba(247,243,236,0.4)] p-4 pit-shadow-1"
                style={{
                  position: "relative",
                  paddingTop: "24px",
                  paddingBottom: "24px",
                  cursor: mode === "files" ? "pointer" : "default",
                }}
                onClick={() => {
                  if (mode === "files") {
                    setExpandedCards((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    });
                  }
                }}
                >
                  <div
                    className="absolute flex items-center gap-2"
                    style={{ right: "4px", top: "12px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label="Actions"
                      onClick={() => setActionMenuRow(row)}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: "8px",
                        cursor: "pointer",
                        minWidth: "44px",
                        minHeight: "44px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: 0.75,
                      }}
                    >
                      <Image src={stackIcon} alt="Actions" width={16} height={16} style={{ opacity: 0.9 }} />
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 pr-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 pr-1">
                      <div
                        className="flex flex-col gap-1"
                        style={{ flex: 1, paddingBottom: mode === "files" ? "8px" : "4px" }}
	                      >
	                        <div className="font-medium">{displayTitle}</div>
	                        {statusLine ? (
	                          <div
	                            className="text-xs"
	                            style={{
	                              color:
	                                statusLine.tone === "warn"
	                                  ? "rgba(140,40,40,0.85)"
	                                  : statusLine.tone === "info"
	                                    ? "rgba(0,0,0,0.68)"
	                                    : "rgba(0,0,0,0.55)",
	                            }}
	                          >
	                            {statusLine.label}
	                          </div>
	                        ) : null}
	                        {mode === "files" && (
	                          <div className="flex items-center gap-2" style={{ marginTop: "3px" }}>
	                            {row.category_path ? (
	                              <span className="text-xs text-[rgba(0,0,0,0.65)]">
                                  {formatBreadcrumbPath(row.category_path)}
                                </span>
	                            ) : (
                              <span className="text-xs text-[rgba(0,0,0,0.45)]">{t("noCategory") ?? ""}</span>
                            )}
                          </div>
                        )}
                        {row.tags?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {row.tags.slice(0, 4).map((tag, idx) => (
                              <span
                                key={`${row.id}-tag-top-${idx}`}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(0,0,0,0.2)",
                                  background: "rgba(0,0,0,0.03)",
                                  fontSize: "12px",
                                  lineHeight: 1.1,
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                  {hasAnyTasks && (
                  <div className="flex flex-col gap-2" style={{ marginTop: "2px" }}>
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm font-semibold"
                        style={{ color: allDone ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.75)" }}
                      >
                        {t("actionsHeader")}
                      </span>
                      {doneTasks.length > 0 && (
                        <button
                          onClick={() =>
                            setExpandedCompleted((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            })
                          }
                          className="text-xs"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "2px 4px",
                            color: "rgba(0,0,0,0.6)",
                          }}
                          aria-expanded={expandedCompleted.has(row.id)}
                        >
                          <span>{t("completed", { count: doneTasks.length })}</span>
                          <span aria-hidden style={{ fontSize: "14px", lineHeight: 1 }}>
                            {expandedCompleted.has(row.id) ? "▾" : "▸"}
                          </span>
                        </button>
                      )}
                    </div>
                    {pendingTasks.length === 0 ? null : (
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          overflowX: "auto",
                          paddingBottom: "6px",
                          scrollbarWidth: "thin",
                        }}
                      >
                        {pendingTasks.map((task) => (
                          <div
                            key={task.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "12px",
                              padding: "14px 16px",
                              border: "1px solid rgba(0,0,0,0.14)",
                              borderRadius: "16px",
                              background: "rgba(255,255,255,0.6)",
                              minWidth: "240px",
                              maxWidth: "280px",
                              flex: "0 0 auto",
                              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.6)",
                            }}
                          >
                            <span className="pit-subtitle text-xs" style={{ lineHeight: 1.4 }}>
                              {task.title}
                              {task.due_date ? (
                                <>
                                  {" · "}
                                  <strong style={{ fontWeight: 700 }}>
                                    {t("actionNeededBy", {
                                      date: formatDate(task.due_date, lang) ?? "",
                                    })}
                                  </strong>
                                </>
                              ) : (
                                ""
                              )}
                            </span>
                            <button
                              onClick={() => handleMarkClick(task)}
                              disabled={busyRow === row.id}
                              aria-label="Mark done"
                              style={{
                                width: 22,
                                height: 22,
                                minWidth: 22,
                                minHeight: 22,
                                borderRadius: 6,
                                border: "2px solid rgba(0,0,0,0.35)",
                                background: "transparent",
                                padding: 0,
                                lineHeight: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                opacity: busyRow === row.id ? 0.6 : 1,
                              }}
                            >
                              <span
                                aria-hidden
                                style={{
                                  color: "#00a86b",
                                  fontWeight: 700,
                                  fontSize: "16px",
                                  lineHeight: 1,
                                }}
                              >
                                {flashingComplete.has(task.id) ? "✓" : ""}
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {doneTasks.length > 0 && expandedCompleted.has(row.id) && (
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          overflowX: "auto",
                          paddingBottom: "6px",
                          scrollbarWidth: "thin",
                        }}
                      >
                        {doneTasks.map((task) => (
                          <div
                            key={task.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              padding: "12px 14px",
                              border: "1px solid rgba(0,0,0,0.08)",
                              borderRadius: "12px",
                              background: recentlyDone.has(task.id)
                                ? "rgba(0,200,120,0.08)"
                                : "rgba(0,0,0,0.02)",
                              minWidth: "220px",
                              flex: "0 0 auto",
                            }}
                          >
                            <span
                              className="pit-subtitle text-xs"
                              style={{ lineHeight: 1.4, color: "rgba(0,0,0,0.7)" }}
                            >
                              {task.title}
                              {task.due_date
                                ? ` · ${t("actionNeededBy", { date: formatDate(task.due_date, lang) ?? "" })}`
                                : ""}
                              {" · done"}
                            </span>
                            <button
                              onClick={() => handleMarkClick(task)}
                              aria-label={t("completed", { count: 1 })}
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 8,
                                border: "1px solid rgba(0,0,0,0.2)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "rgba(0,0,0,0.03)",
                                cursor: "pointer",
                              }}
                            >
                              <span style={{ color: "#00a86b", fontWeight: 700, fontSize: "16px", lineHeight: 1 }}>
                                ✓
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {row.status !== "done" ? (
                      <div className="flex items-center gap-3">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border border-transparent border-t-current" />
                        <button
                          type="button"
                          aria-label={t("delete")}
                          onClick={() => handleCancelProcessing(row)}
                          style={{
                            border: "none",
                            background: "rgba(255,255,255,0.6)",
                            padding: "6px",
                            borderRadius: "10px",
                            cursor: "pointer",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                          }}
                        >
                          <Image src={trashIcon} alt={t("delete")} width={18} height={18} />
                        </button>
                      </div>
                    ) : (
                      <>
                        {gist ? <span>{gist}</span> : null}
                        {hasDetails && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSummaries((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.id)) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                })
                              }
                              className="text-xs self-start"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 4px",
                                color: "rgba(0,0,0,0.65)",
                              }}
                              aria-expanded={isSummaryExpanded}
                            >
                              {isSummaryExpanded ? t("hideDetails") : t("showDetails")}
                              <span aria-hidden style={{ fontSize: "12px", lineHeight: 1 }}>
                                {isSummaryExpanded ? "▴" : "▾"}
                              </span>
                            </button>
                            {isSummaryExpanded && renderDetailsGroups(row.id, detailsGroups)}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

	  const renderTable = (
	    data: TableRow[],
	    opts?: { noTasksSection?: boolean; emptyMessage?: string }
	  ) => (
    <table className="pit-table">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>{t("titleHeader")}</th>
          <th style={{ textAlign: "left" }}>{t("summaryHeader")}</th>
          <th style={{ minWidth: 300, textAlign: "left" }}>{t("actionsHeader")}</th>
        </tr>
      </thead>
      <tbody>
        {error ? (
          <tr>
            <td className="pit-error" colSpan={3}>
              {error}
            </td>
          </tr>
        ) : loading ? (
          <tr>
            <td className="pit-muted" colSpan={3}>
              {t("loading")}
            </td>
          </tr>
        ) : data.length === 0 ? (
          <tr>
            <td className="pit-muted" colSpan={3}>
              {opts?.emptyMessage || t("noDocs")}
            </td>
          </tr>
	        ) : (
		          data.map((row) => {
		            const pendingTasks = (row.tasks?.filter((t) => t.status !== "done") ?? []).slice().sort(sortPendingTasks);
		            const doneTasks = row.tasks?.filter((t) => t.status === "done") ?? [];
		            const isNoTaskRow = (row.tasks?.length ?? 0) === 0 && opts?.noTasksSection;
		            const gist = buildGist(row.summary || row.main_summary, lang);
                const displayTitle = replaceIsoDatesInText(row.title, lang) ?? row.title;
		            const detailsGroups = buildDetailsGroups(row, pendingTasks, lang, t, { userNameHints });
		            const hasDetails = detailsGroups.length > 0;
	            const isSummaryExpanded = expandedSummaries.has(row.id);
	            const dueBadge = computeDueBadge(row, pendingTasks, t);
            const primaryAction = pendingTasks.length
              ? pendingTasks.length === 1
                ? t("openTasks", { count: pendingTasks.length })
                : t("openTasksPlural", { count: pendingTasks.length })
              : t("noActionRequired");
            const badges: { label: string; tone: "warn" | "muted" | "info" }[] = [];
            const badgeTextRaw = typeof row.badge_text === "string" ? row.badge_text.trim() : "";
            const badgeText = (replaceIsoDatesInText(badgeTextRaw, lang) ?? badgeTextRaw).replace(/[—]/g, "-");
            const isNullishBadge =
              badgeTextRaw === "" ||
              badgeTextRaw.toLowerCase() === "null" ||
              badgeTextRaw.toLowerCase() === "undefined";
            if (!isNullishBadge && badgeText) {
              badges.push({ label: badgeText, tone: "info" });
            } else if (dueBadge) {
              badges.push(dueBadge);
            }
            if (row.amounts && row.amounts.length) {
              const amt = row.amounts.find((a) => typeof a.value === "number") || row.amounts[0];
              if (amt?.value !== undefined && amt.value !== null) {
                const label = `${amt.value.toFixed(2)} ${amt.currency || ""}`.trim();
                badges.push({ label, tone: "info" });
              }
            }
            if (row.risk_level && row.risk_level.toLowerCase() !== "none") {
              const tone =
                row.risk_level.toLowerCase() === "high" || row.risk_level.toLowerCase() === "medium"
                  ? "warn"
                  : "muted";
              badges.push({ label: `Risk: ${row.risk_level}`, tone });
            }
            if (row.uncertainty_flags && row.uncertainty_flags.length) {
              badges.push({
                label: `Uncertainty: ${row.uncertainty_flags.slice(0, 2).join(", ")}`,
                tone: "muted",
              });
            }
            if (row.followup_note) {
              const followUp = (replaceIsoDatesInText(row.followup_note, lang) ?? row.followup_note).replace(/[—]/g, "-");
              badges.push({ label: followUp, tone: "muted" });
            } else if (!dueBadge && !row.badge_text) {
              badges.push({ label: t("infoOnly"), tone: "muted" });
            }
            if (row.workflow_status) {
              badges.push({ label: row.workflow_status, tone: "muted" });
            }
            // Deduplicate badges by label to avoid duplicates
            const seen = new Set<string>();
            const uniqBadges = badges.filter((b) => {
              if (seen.has(b.label)) return false;
              seen.add(b.label);
              return true;
            });
            const currentCategory = row.category_path ? row.category_path : null;
            const catOption = categoryOptions.find((o) => o.id === row.category_id);
            const fullPath = catOption?.displayPath
              ? `/${catOption.displayPath}`
              : row.domain_profile_label
                ? `/${formatSegmentDisplay(row.domain_profile_label, lang)}`
                : `/${t("uncategorized")}`;
            const leafPath =
              catOption?.displayLabel ||
              (row.domain_profile_label ? formatSegmentDisplay(row.domain_profile_label, lang) : t("uncategorized"));
            const isPathExpanded = expandedPaths.has(row.id);
            const shownPath = isPathExpanded ? fullPath : `/${leafPath}`;

            const suggestedSegment =
              row.category_suggestion_path && row.category_suggestion_path.length
                ? row.category_suggestion_path
                    .map((seg) => formatSegmentDisplay(seg, lang))
                    .join(" / ")
                : row.category_suggestion_slug
                  ? slugToLabel(row.category_suggestion_slug)
                  : null;

            return (
              <tr key={row.id}>
                <td className="align-top text-left">
                    <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <div
                          className="font-medium"
                          style={{
                            wordBreak: "break-word",
                            paddingRight: "32px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                          }}
                        >
                          {displayTitle}
                        </div>
                        <button
                          onClick={() => handlePreview(row)}
                          className="text-[12px]"
                          disabled={busyRow === row.id}
                          aria-label="Preview"
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(0,0,0,0.15)",
                            borderRadius: "999px",
                            padding: "6px 8px",
                            lineHeight: 1,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            opacity: busyRow === row.id ? 0.6 : 1,
                            backgroundColor: "rgba(0,0,0,0.02)",
                          }}
                        >
                          <Image src={viewIcon} alt="Preview" width={22} height={22} />
                        </button>
                        {row.tags?.length ? (
                          <div className="flex flex-wrap gap-2">
                            {row.tags.slice(0, 4).map((tag, idx) => (
                              <span
                                key={`${row.id}-tag-top-${idx}`}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(0,0,0,0.2)",
                                  background: "rgba(0,0,0,0.03)",
                                  fontSize: "12px",
                                  lineHeight: 1.1,
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {row.status === "done" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className="text-sm pit-subtitle"
                          style={{
                            minWidth: "200px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            color: "rgba(0,0,0,0.55)",
                          }}
                          title={
                            categoryOptions.find((o) => o.id === row.category_id)?.displayPath ||
                            t("uncategorized")
                          }
                        >
                          <Image
                            src={saveIcon}
                            alt="Category"
                            width={14}
                            height={14}
                            style={{ opacity: 0.55, filter: "grayscale(1)" }}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPaths((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.id)) next.delete(row.id);
                                else next.add(row.id);
                                return next;
                              })
                            }
                            title={fullPath}
                            aria-label={isPathExpanded ? t("hideDetails") : t("showDetails")}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: "0 4px",
                              color: "rgba(0,0,0,0.75)",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <span style={{ whiteSpace: "pre-wrap", textAlign: "left" }}>{shownPath}</span>
                            <span style={{ fontSize: "12px", display: "inline-block", transform: isPathExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                              ▸
                            </span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Case UI hidden for now */}
                        </div>
                      </div>
                    )}
                      <div className="flex items-center justify-start gap-4">
                        <button
                    onClick={() => handleDelete(row)}
                    className="text-[12px]"
                    disabled={busyRow === row.id}
                aria-label="Delete"
                style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          lineHeight: 1,
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          opacity: busyRow === row.id ? 0.6 : 1,
                        }}
                      >
                        <Image src={binIcon} alt="Delete" width={20} height={20} />
                      </button>
                      <button
                        onClick={() => handlePreview(row)}
                        className="text-[12px]"
                        disabled={busyRow === row.id}
                        aria-label="Preview"
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          lineHeight: 1,
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          opacity: busyRow === row.id ? 0.6 : 1,
                        }}
                      >
                        <Image src={viewIcon} alt="Preview" width={29} height={29} />
                        </button>
                        <button
                          onClick={() => openChat(row)}
                          className="text-[12px]"
                          disabled={busyRow === row.id}
                          aria-label="Deep dive chat"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            lineHeight: 1,
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            opacity: busyRow === row.id ? 0.6 : 1,
                          }}
                        >
                          <Image src={deepDiveIcon} alt="Deep Dive" width={20} height={20} />
                        </button>
                      </div>
                    </div>
                </td>
                <td className="align-top text-left">
                  <div className="flex flex-col gap-2">
                    {uniqBadges.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {uniqBadges.map((b, idx) => (
                          <span
                            key={`${row.id}-badge-${idx}`}
                            className="text-[11px]"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "999px",
                              border: "1px solid rgba(0,0,0,0.08)",
                              background:
                                b.tone === "warn"
                                  ? "rgba(226,76,75,0.12)"
                                  : b.tone === "info"
                                  ? "rgba(0,0,0,0.04)"
                                  : "rgba(0,0,0,0.02)",
                              color:
                                b.tone === "warn"
                                  ? "#b32625"
                                  : "rgba(0,0,0,0.7)",
                            }}
                          >
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {row.status !== "done" ? (
                      <div className="flex items-center">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border border-transparent border-t-current" />
                      </div>
                    ) : gist ? (
                      <>
                        <span>{gist}</span>
	                        {row.tags?.length ? (
	                          <div className="flex flex-wrap gap-2 text-[11px] text-[rgba(0,0,0,0.6)]">
	                            {row.tags?.slice(0, 4).map((tag, idx) => (
	                              <span
	                                key={`${row.id}-tag-${idx}`}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "999px",
                                  border: "1px solid rgba(0,0,0,0.08)",
                                  background: "rgba(0,0,0,0.02)",
                                }}
	                              >
	                                {tag}
	                              </span>
	                            ))}
	                          </div>
	                        ) : null}
	                        {hasDetails && (
	                          <>
	                            <button
	                              type="button"
                              onClick={() =>
                                setExpandedSummaries((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.id)) {
                                    next.delete(row.id);
                                  } else {
                                    next.add(row.id);
                                  }
                                  return next;
                                })
                              }
                            className="text-xs self-start"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "2px 4px",
                              color: "rgba(0,0,0,0.65)",
                            }}
                            aria-expanded={isSummaryExpanded}
                          >
	                            {isSummaryExpanded ? t("hideDetails") : t("showDetails")}
	                            <span aria-hidden style={{ fontSize: "12px", lineHeight: 1 }}>
	                              {isSummaryExpanded ? "▴" : "▾"}
	                            </span>
	                            </button>
	                            {isSummaryExpanded && (
	                              renderDetailsGroups(row.id, detailsGroups)
	                            )}
	                          </>
	                        )}
                      </>
                    ) : (
                      "-"
                    )}
                  </div>
                </td>
                <td className="align-top text-left">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs font-medium" style={{ color: "rgba(0,0,0,0.65)" }}>
                        {primaryAction}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openAddTask(row)}
                          className="text-xs"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 30,
                            height: 30,
                            borderRadius: 6,
                            border: "1.3px solid rgba(0,0,0,0.2)",
                            background: "rgba(0,0,0,0.03)",
                            lineHeight: 1,
                            cursor: "pointer",
                          }}
                          aria-label={t("addTask")}
                          title={t("addTask")}
                        >
                          <span aria-hidden style={{ fontSize: "16px", lineHeight: 1, fontWeight: 600 }}>+</span>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: "rgba(0,0,0,0.75)" }}>
                        {t("actionsHeader")}
                      </span>
                      {doneTasks.length > 0 && (
                        <button
                          onClick={() =>
                            setExpandedCompleted((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.id)) {
                                next.delete(row.id);
                              } else {
                                next.add(row.id);
                              }
                              return next;
                            })
                          }
                          className="text-xs"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "2px 4px",
                            color: "rgba(0,0,0,0.6)",
                          }}
                          aria-expanded={expandedCompleted.has(row.id)}
                        >
                          <span>{t("completed", { count: doneTasks.length })}</span>
                          <span aria-hidden style={{ fontSize: "14px", lineHeight: 1 }}>
                            {expandedCompleted.has(row.id) ? "▾" : "▸"}
                          </span>
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {isNoTaskRow ? (
                        <span className="text-sm" style={{ color: "rgba(0,0,0,0.55)" }}>
                          {t("noTasks")}
                        </span>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            overflowX: "auto",
                            paddingBottom: "6px",
                            scrollbarWidth: "thin",
                          }}
                        >
                          {pendingTasks.map((task) => (
                            <div
                              key={task.id}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "space-between",
                                gap: "8px",
                                padding: "14px 16px",
                                border: "1px solid rgba(0,0,0,0.1)",
                                borderRadius: "16px",
                                background: flashingComplete.has(task.id)
                                  ? "rgba(0,200,120,0.08)"
                                  : "rgba(0,0,0,0.02)",
                                minWidth: "240px",
                                flex: "0 0 auto",
                                boxShadow: "0 4px 10px rgba(0,0,0,0.06)",
                              }}
                            >
                              <span className="pit-subtitle text-xs" style={{ lineHeight: 1.4 }}>
                                {task.title}
                                {task.due_date ? (
                                  <>
                                    {" · "}
                                    <strong style={{ fontWeight: 700 }}>
                                      {t("actionNeededBy", {
                                        date: formatDate(task.due_date, lang) ?? "",
                                      })}
                                    </strong>
                                  </>
                                ) : (
                                  ""
                                )}
                              </span>
                              <div className="flex flex-col items-end gap-2" style={{ flexShrink: 0 }}>
                                <button
                                  onClick={() => handleMarkClick(task)}
                                  disabled={busyRow === row.id}
                                  aria-label="Mark done"
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 10,
                                    background: flashingComplete.has(task.id)
                                      ? "rgba(0,200,120,0.12)"
                                      : "transparent",
                                    border: "1px solid rgba(0,0,0,0.15)",
                                    padding: 4,
                                    lineHeight: 1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    opacity: busyRow === row.id ? 0.6 : 1,
                                  }}
                                >
                                  <span
                                    aria-hidden
                                    style={{
                                      display: "block",
                                      width: 18,
                                      height: 18,
                                      borderRadius: 5,
                                      border: flashingComplete.has(task.id)
                                        ? "2px solid #00a86b"
                                        : "2px solid #888",
                                      color: "#00a86b",
                                      textAlign: "center",
                                      lineHeight: "14px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {flashingComplete.has(task.id) ? "✓" : ""}
                                  </span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {doneTasks.length > 0 && expandedCompleted.has(row.id) && (
                      <div
                        style={{
                          display: "flex",
                          gap: "12px",
                          overflowX: "auto",
                          paddingBottom: "6px",
                          scrollbarWidth: "thin",
                        }}
                      >
                        {doneTasks.map((task) => (
                          <div
                            key={task.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "8px",
                              padding: "12px 14px",
                              border: "1px solid rgba(0,0,0,0.08)",
                              borderRadius: "12px",
                              background: recentlyDone.has(task.id)
                                ? "rgba(0,200,120,0.08)"
                                : "rgba(0,0,0,0.02)",
                              minWidth: "240px",
                              flex: "0 0 auto",
                            }}
                          >
                            <span
                              className="pit-subtitle text-xs"
                              style={{ lineHeight: 1.4, color: "rgba(0,0,0,0.7)" }}
                              >
                                {task.title}
                              {task.due_date
                                ? ` · ${t("actionNeededBy", { date: formatDate(task.due_date, lang) ?? "" })}`
                                : ""}
                                {" · done"}
                              </span>
                              <div
                                aria-label="Task complete"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: "1px solid rgba(0,0,0,0.15)",
                                padding: 4,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                background: "transparent",
                                cursor: "pointer",
                              }}
                                onClick={() => handleMarkClick(task)}
                              >
                              <span style={{ color: "#00a86b", fontWeight: 700, fontSize: "18px" }}>
                                ✓
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2" />
                      <div className="flex items-center gap-4">
                        {(opts?.noTasksSection || pendingTasks.length === 0) && (
                          <button
                            type="button"
                            onClick={() => handleMoveToFiles(row.id)}
                            className="text-[12px]"
                            aria-label={t("moveToFiles")}
                            title={t("moveToFiles")}
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(0,0,0,0.2)",
                              borderRadius: 10,
                              padding: "8px 10px",
                              lineHeight: 1,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              opacity: busyRow === row.id ? 0.6 : 1,
                              backgroundColor: "rgba(0,0,0,0.02)",
                            }}
                          >
                            <span aria-hidden style={{ fontSize: "16px", lineHeight: 1, fontWeight: 700 }}>→</span>
                          </button>
                        )}
                        <button
                          onClick={() => openChat(row)}
                          className="text-[12px]"
                          disabled={busyRow === row.id}
                          aria-label="Deep dive chat"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            lineHeight: 1,
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            opacity: busyRow === row.id ? 0.6 : 1,
                          }}
                        >
                          <Image src={deepDiveIcon} alt="Deep Dive" width={24} height={24} />
                        </button>
                        <button
                          onClick={() => handlePreview(row)}
                          className="text-[12px]"
                          disabled={busyRow === row.id}
                          aria-label="Preview"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            lineHeight: 1,
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            opacity: busyRow === row.id ? 0.6 : 1,
                          }}
                        >
                          <Image src={viewIcon} alt="Preview" width={28} height={28} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="text-[12px]"
                          disabled={busyRow === row.id}
                          aria-label="Delete"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            lineHeight: 1,
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                            opacity: busyRow === row.id ? 0.6 : 1,
                          }}
                        >
                          <Image src={binIcon} alt="Delete" width={22} height={22} />
                        </button>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
  useEffect(() => {
    if (!userId) return;
    const supabase = supabaseBrowser();
    const docsChannel = supabase
      .channel("documents-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `user_id=eq.${userId}` },
        () => fetchDocs(false)
      )
      .subscribe();
    const extraChannel = supabase
      .channel("extractions-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "extractions", filter: `user_id=eq.${userId}` },
        () => fetchDocs(false)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(docsChannel);
      supabase.removeChannel(extraChannel);
    };
  }, [userId, fetchDocs]);

  const broadcastDocsChanged = useCallback((detail: Record<string, unknown>) => {
    try {
      if (typeof window === "undefined") return;
      window.dispatchEvent(new CustomEvent("docflow:documents-changed", { detail }));
    } catch (err) {
      console.warn("docs-changed broadcast failed", err);
    }
  }, []);

  const handleDelete = async (row: TableRow) => {
    if (!row.storage_path) return;
    const previousCaseId = row.case_id;
    setBusyRow(row.id);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in.");

      // Delete file
      const { error: removeError } = await supabase.storage
        .from("documents")
        .remove([row.storage_path]);
      if (removeError) throw removeError;

      // Delete row (cascades extractions)
      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", row.id);
      if (deleteError) throw deleteError;

      await cleanupEmptyCase(previousCaseId, supabase, user.id);
      fetchDocs(false);
      broadcastDocsChanged({ reason: "deleted", documentId: row.id });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setBusyRow(null);
    }
  };

  const uiText = useMemo(
    () => ({
      title: {
        de: "Clarity",
        en: "Clarity",
        ro: "Clarity",
        tr: "Clarity",
        fr: "Clarity",
        es: "Clarity",
        ar: "Clarity",
        pt: "Clarity",
        ru: "Clarity",
        pl: "Clarity",
        uk: "Clarity",
      },
      close: {
        de: "Schließen",
        en: "Close",
        ro: "Închide",
        tr: "Kapat",
        fr: "Fermer",
        es: "Cerrar",
        ar: "إغلاق",
        pt: "Fechar",
        ru: "Закрыть",
        pl: "Zamknij",
        uk: "Закрити",
      },
      loading: {
        de: "Chat wird geladen…",
        en: "Loading chat…",
        ro: "Se încarcă chat-ul…",
        tr: "Sohbet yükleniyor…",
        fr: "Chargement du chat…",
        es: "Cargando chat…",
        ar: "يتم تحميل المحادثة…",
        pt: "Carregando chat…",
        ru: "Загрузка чата…",
        pl: "Ładowanie czatu…",
        uk: "Завантаження чату…",
      },
      ask: {
        de: "Fragen zum Dokument",
        en: "Questions about this document",
        ro: "Întrebări despre acest document",
        tr: "Bu belgeyle ilgili sorular",
        fr: "Questions sur ce document",
        es: "Preguntas sobre este documento",
        ar: "أسئلة حول هذا المستند",
        pt: "Perguntas sobre este documento",
        ru: "Вопросы по этому документу",
        pl: "Pytania o ten dokument",
        uk: "Питання щодо цього документа",
      },
      placeholder: {
        de: "Frage zu diesem Dokument…",
        en: "Question about this document…",
        ro: "Întrebare despre acest document…",
        tr: "Bu belge hakkında soru…",
        fr: "Question sur ce document…",
        es: "Pregunta sobre este documento…",
        ar: "سؤال حول هذا المستند…",
        pt: "Pergunta sobre este documento…",
        ru: "Вопрос об этом документе…",
        pl: "Pytanie o ten dokument…",
        uk: "Питання про цей документ…",
      },
      send: {
        de: "Senden",
        en: "Send",
        ro: "Trimite",
        tr: "Gönder",
        fr: "Envoyer",
        es: "Enviar",
        ar: "إرسال",
        pt: "Enviar",
        ru: "Отправить",
        pl: "Wyślij",
        uk: "Надіслати",
      },
    }),
    []
  );

  const openChat = async (row: TableRow) => {
    setChatForDoc(row.id);
    setChatLoading(true);
    setChatThreadId(null);
    setChatMessages([]);
    setChatError(null);
    try {
      const supabase = supabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;
      if (!accessToken) throw new Error("Not logged in.");
      const res = await fetch(`/api/doc-chat?documentId=${row.id}&lang=${lang}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to load chat (${res.status})`);
      const data = await res.json();
      setChatThreadId(data.threadId || null);
      setChatMessages(
        Array.isArray(data.messages)
          ? data.messages.filter((m: any) => m?.role && m?.content).map((m: any) => ({ role: m.role, content: m.content }))
          : []
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to load chat");
      setChatForDoc(null);
    } finally {
      setChatLoading(false);
    }
  };

  const clearDocChat = async () => {
    if (!chatForDoc) return;
    setChatLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;
      if (!accessToken) throw new Error("Not logged in.");
      const res = await fetch("/api/doc-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ documentId: chatForDoc, action: "clear" }),
      });
      if (!res.ok) throw new Error(`Failed to clear chat (${res.status})`);
      setChatMessages([]);
      setChatThreadId(null);
    } catch (err) {
      console.error(err);
      setChatError(err instanceof Error ? err.message : "Failed to clear chat");
    } finally {
      setChatLoading(false);
    }
  };

  const sendChat = async () => {
    if (!chatForDoc || !chatInput.trim()) return;
    setChatLoading(true);
    const userMsg = { role: "user" as const, content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatError(null);
    try {
      const supabase = supabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;
      if (!accessToken) throw new Error("Not logged in.");
      const res = await fetch("/api/doc-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          documentId: chatForDoc,
          threadId: chatThreadId,
          messages: [userMsg],
          uiLang: lang,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to chat (${res.status})`);
      }
      const data = await res.json();
      setChatThreadId(data.threadId || chatThreadId);
      setChatMessages(
        Array.isArray(data.messages)
          ? data.messages.filter((m: any) => m?.role && m?.content).map((m: any) => ({ role: m.role, content: m.content }))
          : []
      );
      if (data.createdTask && chatForDoc) {
        fetchDocs(false);
      }
    } catch (err) {
      console.error(err);
      setChatError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setChatLoading(false);
    }
  };

  const handlePreview = async (row: TableRow) => {
    if (!row.storage_path) return;
    setBusyRow(row.id);
    try {
      const supabase = supabaseBrowser();
      const { data: signed, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(row.storage_path, 60 * 10);
      if (error || !signed?.signedUrl) throw error;
      setPreviewUrl(signed.signedUrl);
      setPreviewName(replaceIsoDatesInText(row.title, lang) ?? row.title);
      const lower = row.storage_path.toLowerCase();
      setPreviewIsImage(/\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/i.test(lower));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setBusyRow(null);
    }
  };

  const markTaskDone = async (taskId: string) => {
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
      fetchDocs(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  const reopenTask = async (taskId: string) => {
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from("tasks")
        .update({ status: "open", completed_at: null })
        .eq("id", taskId);
      if (error) throw error;
      fetchDocs(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to reopen task");
    }
  };

  const handleMarkClick = (task: TaskRow) => {
    if (task.status === "done") {
      reopenTask(task.id);
      return;
    }
    if (flashingComplete.has(task.id)) return;
    const next = new Set(flashingComplete);
    next.add(task.id);
    setFlashingComplete(next);
    setTimeout(() => {
      setFlashingComplete((prev) => {
        const copy = new Set(prev);
        copy.delete(task.id);
        return copy;
      });
      markTaskDone(task.id).then(() => {
        setRecentlyDone((prev) => {
          const copy = new Set(prev);
          copy.add(task.id);
          return copy;
        });
        setTimeout(() => {
          setRecentlyDone((prev) => {
            const copy = new Set(prev);
            copy.delete(task.id);
            return copy;
          });
        }, 600);
      });
    }, 500);
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
      fetchDocs(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete task");
    }
  };

  const handleCategoryChange = async (row: TableRow, newCategoryId: string | null) => {
    setBusyRow(row.id);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in.");

      const { error: updateError } = await supabase
        .from("documents")
        .update({ category_id: newCategoryId })
        .eq("id", row.id);
      if (updateError) throw updateError;
      fetchDocs(false);
      broadcastDocsChanged({ reason: "category_changed", documentId: row.id, categoryId: newCategoryId });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setBusyRow(null);
    }
  };

  const handleCaseChange = async (row: TableRow, newCaseId: string | null) => {
    setBusyRow(row.id);
    const previousCaseId = row.case_id;
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in.");

      const { error: updateError } = await supabase
        .from("documents")
        .update({ case_id: newCaseId })
        .eq("id", row.id);
      if (updateError) throw updateError;

      if (previousCaseId && previousCaseId !== newCaseId) {
        try {
          await supabase.from("case_documents").delete().eq("case_id", previousCaseId).eq("document_id", row.id);
        } catch (err) {
          console.warn("case_documents remove skipped", err);
        }
      }

      if (newCaseId) {
        try {
          await supabase
            .from("case_documents")
            .upsert({ case_id: newCaseId, document_id: row.id }, { onConflict: "case_id,document_id" });
        } catch (err) {
          console.warn("case_documents upsert skipped", err);
        }
        try {
          await supabase.from("case_events").insert({
            case_id: newCaseId,
            user_id: user.id,
            kind: "doc_added",
            payload: { document_id: row.id },
          });
        } catch (err) {
          console.warn("case_event insert skipped", err);
        }
      }

      if (previousCaseId && previousCaseId !== newCaseId) {
        await cleanupEmptyCase(previousCaseId, supabase, user.id);
      }

      fetchDocs(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update case");
    } finally {
      setBusyRow(null);
    }
  };

  const openAddTask = (row: TableRow) => {
    console.log("openAddTask click", row.id);
    setTaskModal({ docId: row.id, title: "", due: "", urgency: "normal" });
  };

  const submitTask = async () => {
    if (!taskModal || !taskModal.title.trim()) {
      alert("Task title required");
      return;
    }
    setBusyRow(taskModal.docId);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in.");

      const { error } = await supabase.from("tasks").insert({
        user_id: user.id,
        document_id: taskModal.docId,
        title: taskModal.title.trim(),
        due_date: taskModal.due || null,
        urgency: taskModal.urgency || "normal",
        status: "open",
      });
      if (error) throw error;
      setTaskModal(null);
      fetchDocs(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setBusyRow(null);
    }
  };

  const handleMoveToFiles = (rowId: string) => {
    const next = new Set(hiddenDocIds);
    next.add(rowId);
    persistHidden(next);
  };

  const handleCancelProcessing = async (row: TableRow) => {
    setBusyRow(row.id);
    try {
      // Optimistic-only row: just drop it.
      if (!row.id || row.id.startsWith("temp-") || row.id.length < 8 || row.status !== "done" && !row.storage_path) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setOptimisticRows((prev) => prev.filter((r) => r.id !== row.id));
        return;
      }
      const supabase = supabaseBrowser();
      // Attempt to delete storage file first (best-effort).
      if (row.storage_path) {
        await supabase.storage.from("documents").remove([row.storage_path]).catch(() => null);
      }
      await supabase.from("documents").delete().eq("id", row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setOptimisticRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      console.error("cancel processing failed", err);
      alert(err instanceof Error ? err.message : "Abbruch fehlgeschlagen");
    } finally {
      setBusyRow(null);
    }
  };

  return (
    <div className="w-full">
      {isHome ? (
        <div className="flex flex-col gap-4">
          {processingRows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3
                className="pit-title"
                style={{ fontSize: "18px", fontFamily: "Georgia, serif" }}
              >
                {t("processingTitle") || "In Bearbeitung"}
              </h3>
              {renderCards(processingRows, { emptyMessage: t("noDocsProcessing") ?? "" })}
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <h3
              className="pit-title"
              style={{ fontSize: "18px", fontFamily: "Georgia, serif" }}
            >
              {t("needsAttentionTitle")}
            </h3>
            {renderCards(openRows, { emptyMessage: t("noDocsOpen") })}
          </div>
          <div className="flex flex-col gap-2">
            <h3
              className="pit-title"
              style={{ fontSize: "18px", fontFamily: "Georgia, serif" }}
            >
              {t("readyTitle")}
            </h3>
            {renderCards(readyRows, {
              noTasksSection: true,
              emptyMessage: t("noDocsReady"),
            })}
          </div>
        </div>
      ) : (
        <div className="w-full">{renderCards(visibleRows)}</div>
      )}
      {actionMenuRow && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(245,240,232,0.6)" }}
          onClick={() => setActionMenuRow(null)}
        >
          <div
            className="w-full max-w-lg pit-radius-xl pit-shadow-2 border border-[rgba(0,0,0,0.18)] bg-[rgba(247,243,236,0.97)]"
            style={{ maxHeight: "88vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center py-5">
              <span
                style={{
                  width: "56px",
                  height: "5px",
                  borderRadius: "999px",
                  background: "rgba(0,0,0,0.2)",
                  display: "inline-block",
                }}
              />
            </div>
            <div className="flex flex-col divide-y divide-[rgba(0,0,0,0.12)]">
              {(() => {
                const explainLabel: Record<string, string> = {
                  de: "Dieses Dokument verstehen",
                  en: "Understand this document",
                  ro: "Înțelege acest document",
                  tr: "Bu belgeyi anla",
                  fr: "Comprendre ce document",
                  es: "Entender este documento",
                  ar: "فهم هذا المستند",
                  pt: "Entender este documento",
                  ru: "Понять этот документ",
                  pl: "Zrozum ten dokument",
                  uk: "Зрозуміти цей документ",
                };
                const openLabel: Record<string, string> = {
                  de: "Original öffnen",
                  en: "Open original",
                  ro: "Deschide originalul",
                  tr: "Orijinali aç",
                  fr: "Ouvrir l’original",
                  es: "Abrir original",
                  ar: "افتح النسخة الأصلية",
                  pt: "Abrir original",
                  ru: "Открыть оригинал",
                  pl: "Otwórz oryginał",
                  uk: "Відкрити оригінал",
                };
                const addTaskLabel: Record<string, string> = {
                  de: "Aufgabe hinzufügen",
                  en: "Add task",
                  ro: "Adaugă sarcină",
                  tr: "Görev ekle",
                  fr: "Ajouter une tâche",
                  es: "Añadir tarea",
                  ar: "إضافة مهمة",
                  pt: "Adicionar tarefa",
                  ru: "Добавить задачу",
                  pl: "Dodaj zadanie",
                  uk: "Додати завдання",
                };
                const explainText = explainLabel[lang] || t("explainDocument") || "Explain this document";
                const openText = openLabel[lang] || t("openOriginalDocument") || "Open original document";
                const addTaskText = addTaskLabel[lang] || t("addTask") || "Add task";

                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        openChat(actionMenuRow);
                        setActionMenuRow(null);
                      }}
                      className="flex items-center gap-4 px-6 py-3 text-left"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <Image src={clarityIcon} alt="Chat" width={24} height={24} style={{ minWidth: "32px" }} />
                      <span style={{ fontSize: "17px", color: "rgba(0,0,0,0.9)", lineHeight: 1.4 }}>
                        {explainText}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handlePreview(actionMenuRow);
                        setActionMenuRow(null);
                      }}
                      className="flex items-center gap-4 px-6 py-3 text-left"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <Image src={viewIcon} alt="Open original" width={24} height={24} style={{ minWidth: "32px" }} />
                      <span style={{ fontSize: "17px", color: "rgba(0,0,0,0.9)", lineHeight: 1.4 }}>
                        {openText}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openAddTask(actionMenuRow);
                        setActionMenuRow(null);
                      }}
                      className="flex items-center gap-4 px-6 py-3 text-left"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <Image
                        src={taskIcon}
                        alt={t("addTask")}
                        width={15}
                        height={15}
                        style={{ minWidth: "32px", width: "20px", height: "20px", objectFit: "contain" }}
                      />
                      <span style={{ fontSize: "17px", color: "rgba(0,0,0,0.9)", lineHeight: 1.4 }}>
                        {addTaskText}
                      </span>
                    </button>
                  </>
                );
              })()}
              <button
                type="button"
                onClick={() => {
                  handleDelete(actionMenuRow);
                  setActionMenuRow(null);
                }}
                className="flex items-center justify-end gap-3 px-7 py-8 text-left"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#d6453d" }}
              >
                <span style={{ fontSize: "17px", color: "#d6453d", lineHeight: 1.4 }}>{t("delete")}</span>
                <Image
                  src={binIcon}
                  alt="Delete"
                  width={20}
                  height={20}
                  style={{
                    minWidth: "24px",
                    display: "inline-flex",
                    filter:
                      "invert(38%) sepia(71%) saturate(2532%) hue-rotate(341deg) brightness(92%) contrast(92%)",
                    opacity: 0.5,
                  }}
                />
              </button>
            </div>
          </div>
        </div>
      )}
      <MediaViewer
        isOpen={Boolean(previewUrl)}
        src={previewUrl ?? ""}
        type={previewIsImage ? "image" : "pdf"}
        filename={previewName ?? undefined}
        downloadUrl={previewUrl ?? undefined}
        onClose={() => {
          setPreviewUrl(undefined);
          setPreviewName(null);
        }}
      />
      {isMounted && taskModal
        ? createPortal(
            <div
              className="fixed inset-0 z-[999] flex items-center justify-center p-4"
              style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(245,240,232,0.6)" }}
              onClick={() => setTaskModal(null)}
            >
              <div
                className="pit-card w-full max-w-md border border-[rgba(0,0,0,0.12)] bg-[rgba(247,243,236,0.96)]"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <div className="flex items-center justify-center py-2">
                  <span
                    style={{
                      width: "56px",
                      height: "5px",
                      borderRadius: "999px",
                      background: "rgba(0,0,0,0.2)",
                      display: "inline-block",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mb-4">
                  <p className="pit-title" style={{ fontSize: "18px" }}>
                    {t("newTaskTitle")}
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="pit-subtitle text-xs">{t("taskTitleLabel")}</span>
                    <input
                      className="pit-input"
                      value={taskModal?.title ?? ""}
                      onChange={(e) => setTaskModal((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                      placeholder={t("taskPlaceholder")}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="pit-subtitle text-xs">{t("taskDueDateLabel")}</span>
                    <input
                      className="pit-input"
                      type="date"
                      value={taskModal?.due ?? ""}
                      onChange={(e) => setTaskModal((prev) => (prev ? { ...prev, due: e.target.value } : prev))}
                  />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="pit-subtitle text-xs">{t("urgency")}</span>
                    <select
                      className="pit-input"
                      value={taskModal?.urgency ?? "normal"}
                      onChange={(e) => setTaskModal((prev) => (prev ? { ...prev, urgency: e.target.value } : prev))}
                    >
                      <option value="low">{t("low")}</option>
                      <option value="normal">{t("normal")}</option>
                      <option value="high">{t("high")}</option>
                    </select>
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={submitTask}
                      style={kindleButtonStyle}
                    >
                      {t("addTask")}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {isMounted && chatForDoc
        ? createPortal(
            <div
              className="fixed inset-0 z-[999]"
              style={{ backdropFilter: "blur(8px)", backgroundColor: "rgba(12,12,12,0.35)" }}
              onClick={() => {
                if (!chatLoading) {
                  setChatForDoc(null);
                  setChatThreadId(null);
                  setChatMessages([]);
                }
              }}
            >
              <div
                className="absolute inset-x-0 bottom-0 flex justify-center px-3 pb-3 sm:px-5 sm:pb-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                className="w-full max-w-[720px] pit-radius-xl pit-shadow-2 flex flex-col overflow-hidden"
                style={{
                  background: "linear-gradient(145deg, #f7f1e4 0%, #f3ebdd 100%)",
                  border: "1px solid rgba(0,0,0,0.06)",
                  maxHeight: "88vh",
                }}
              >
                  <div className="flex flex-col gap-3 sticky top-0 z-10 px-4 pt-4 pb-2" style={{ background: "linear-gradient(145deg, #f7f1e4 0%, #f3ebdd 100%)" }}>
                    <div className="flex items-center justify-center py-1">
                      <span
                        style={{
                          width: "56px",
                          height: "5px",
                          borderRadius: "999px",
                          background: "rgba(0,0,0,0.14)",
                          display: "inline-block",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[14px]" style={{ color: "rgba(0,0,0,0.8)" }}>
              <div className="flex items-center gap-2">
                <Image src={clarityIcon} alt="Clarity" width={22} height={22} />
                <span style={{ fontFamily: "Georgia, serif", fontSize: "16px", lineHeight: 1.1, display: "inline-flex", alignItems: "center" }}>
                  {uiText.title[lang] || uiText.title.en}
                </span>
              </div>
              <button
                type="button"
                onClick={clearDocChat}
                disabled={chatLoading}
                aria-label="Reset chat"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: chatLoading ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "2px",
                  opacity: 0.75,
                }}
              >
                <Image src={resetIcon} alt="Reset chat" width={18} height={18} style={{ opacity: 0.85 }} />
              </button>
            </div>
          </div>
                  <div
                    className="flex-1 overflow-y-auto px-4 pb-3"
                    style={{
                      paddingTop: 6,
                      gap: "12px",
                      display: "flex",
                      flexDirection: "column",
                    }}
                    ref={chatScrollRef}
                  >
                    {chatLoading && chatMessages.length === 0 ? (
                      <p className="pit-muted text-sm" style={{ fontFamily: "Inter, sans-serif" }}>
                        {uiText.loading[lang] || uiText.loading.en}
                      </p>
                    ) : chatMessages.length === 0 ? (
                      <p
                        style={{
                          fontFamily: "Georgia, serif",
                          fontSize: "16px",
                          color: "rgba(0,0,0,0.8)",
                        }}
                      >
                        {uiText.ask[lang] || uiText.ask.en}
                      </p>
                    ) : (
                      chatMessages.map((m, idx) => (
                        <div
                          key={`${chatForDoc}-msg-${idx}`}
                          style={{
                            background: m.role === "assistant" ? "rgba(0,0,0,0.035)" : "rgba(0,0,0,0.05)",
                            borderRadius: "14px",
                            padding: "10px 12px",
                            maxWidth: "72ch",
                            fontFamily: "Georgia, serif",
                            fontSize: "16px",
                            lineHeight: 1.6,
                            color: "rgba(0,0,0,0.85)",
                          }}
                        >
                          <div
                            style={{
                              fontFamily: "Inter, sans-serif",
                              fontSize: "12px",
                              letterSpacing: "0.01em",
                            color: "rgba(0,0,0,0.5)",
                            marginBottom: 4,
                          }}
                        >
                            {m.role === "assistant" ? "Clarity" : "Du"}
                          </div>
                          <div>{m.content}</div>
                        </div>
                      ))
                    )}
                    {chatError && (
                      <p className="pit-error text-xs" style={{ fontFamily: "Inter, sans-serif" }}>
                        {chatError}
                      </p>
                    )}
                  </div>
                  <div
                    className="px-4 pb-4 pt-2"
                    style={{
                      borderTop: "1px solid rgba(0,0,0,0.05)",
                      background: "linear-gradient(145deg, #f2eadb 0%, #f8f3e8 100%)",
                    }}
                  >
                    <div
                      className="relative w-full rounded-2xl"
                      style={{
                        background: "rgba(0,0,0,0.03)",
                        border: "1px solid rgba(0,0,0,0.08)",
                        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <textarea
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={uiText.placeholder[lang] || uiText.placeholder.en}
                        rows={3}
                        className="w-full resize-none rounded-2xl bg-transparent px-4 py-3"
                        style={{
                          fontFamily: "Georgia, serif",
                          fontSize: "15px",
                          color: "rgba(0,0,0,0.82)",
                          minHeight: 120,
                          maxHeight: 140,
                          overflowY: "auto",
                        }}
                      />
                      <button
                        onClick={sendChat}
                        disabled={chatLoading || !chatInput.trim()}
                        style={{
                          height: 40,
                          width: 40,
                          borderRadius: "999px",
                          position: "absolute",
                          right: 12,
                          bottom: 12,
                          border: "1px solid rgba(0,0,0,0.1)",
                          background: chatInput.trim() && !chatLoading ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.04)",
                          color: "rgba(0,0,0,0.7)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer",
                        }}
                        aria-label={t("send") || "Send"}
                      >
                        {chatLoading ? (
                          <span className="animate-spin" style={{ fontSize: 16 }}>
                            ⟳
                          </span>
                        ) : (
                          <span style={{ fontSize: 16, lineHeight: 1 }}>↑</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
