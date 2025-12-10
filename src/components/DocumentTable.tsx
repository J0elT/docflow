"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/exhaustive-deps */

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { getLocaleForLanguage, useLanguage } from "@/lib/language";
import { createPortal } from "react-dom";
import viewIcon from "../../images/view.png";
import saveIcon from "../../images/save.png";
import binIcon from "../../images/bin.png";
import deepDiveIcon from "../../images/ai-technology.png";

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
  deadlines?: { id?: string | null; date_exact?: string | null; description?: string | null; kind?: string | null }[];
  actions_required?: { id?: string | null; label?: string | null; due_date?: string | null; severity?: string | null }[];
  risk_level?: string | null;
  uncertainty_flags?: string[] | null;
  amounts?: { value?: number | null; currency?: string | null; direction?: string | null; description?: string | null }[];
  domain_profile_label?: string | null;
  tags?: string[];
  reference_ids?: string[];
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
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
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());
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

  // Auto-collapse expanded paths after a short delay to avoid clutter.
  useEffect(() => {
    if (!expandedPaths.size) return;
    const timer = setTimeout(() => {
      setExpandedPaths(new Set());
    }, 3000);
    return () => clearTimeout(timer);
  }, [expandedPaths]);

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
      const hasProcessing = rows.some((r) => r.status !== "done");
      onProcessingChange(hasProcessing);
    }
  }, [rows, onProcessingChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
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

const buildGist = (summary?: string | null) => {
  if (!summary) return null;
  const trimmed = summary.trim();
  if (!trimmed) return null;
  const sentences = trimmed
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const gist = sentences.slice(0, 2).join(" ");
  const limited = gist.slice(0, 220);
  return limited || trimmed;
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

const formatDate = (iso: string | null | undefined, lang: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(getLocaleForLanguage(lang as any), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

        const [docsRes, catsRes, catTransRes, tasksRes, casesRes] = await Promise.all([
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
            .select("id, document_id, title, status, due_date")
            .eq("user_id", user.id),
          supabase.from("cases").select("id, title, status").eq("user_id", user.id),
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
            const mainSummary =
              typeof (latest as any)?.main_summary === "string" && (latest as any)?.main_summary?.trim()
                ? ((latest as any)?.main_summary as string).trim()
                : typeof latest?.summary === "string" && latest.summary.trim()
                  ? latest.summary.trim()
                  : undefined;
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
            const deadlinesArr = Array.isArray((latest as any)?.deadlines)
              ? ((latest as any)?.deadlines as any[])
                  .filter((d) => d && typeof d === "object")
                  .map((d) => ({
                    id: (d as any)?.id ?? null,
                    date_exact:
                      typeof (d as any)?.date_exact === "string" && (d as any)?.date_exact.trim()
                        ? ((d as any)?.date_exact as string).trim()
                        : null,
                    description:
                      typeof (d as any)?.description === "string" && (d as any)?.description.trim()
                        ? ((d as any)?.description as string).trim()
                        : null,
                    kind:
                      typeof (d as any)?.kind === "string" && (d as any)?.kind.trim()
                        ? ((d as any)?.kind as string).trim()
                        : null,
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
              summary: mainSummary,
              main_summary: mainSummary,
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
              reference_ids:
                (latest as any)?.key_fields?.reference_ids && typeof (latest as any)?.key_fields?.reference_ids === "object"
                  ? (Object.values((latest as any)?.key_fields?.reference_ids as Record<string, unknown>).filter(
                      (v): v is string => typeof v === "string" && !!v.trim()
                    ) ?? [])
                  : ([] as string[]),
              workflow_status:
                typeof (latest as any)?.key_fields?.workflow_status === "string" &&
                ((latest as any)?.key_fields?.workflow_status as string).trim()
                  ? ((latest as any)?.key_fields?.workflow_status as string).trim()
                  : null,
            };
          }) ?? [];

        setRows(mapped.filter((r) => r.status !== "error"));
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
            const pendingTasks = row.tasks?.filter((t) => t.status !== "done") ?? [];
            const doneTasks = row.tasks?.filter((t) => t.status === "done") ?? [];
            const isNoTaskRow = (row.tasks?.length ?? 0) === 0 && opts?.noTasksSection;
            const gist = buildGist(row.main_summary || row.summary);
            const isSummaryExpanded = expandedSummaries.has(row.id);
            const dueBadge = computeDueBadge(row, pendingTasks, t);
            const primaryAction = pendingTasks.length
              ? pendingTasks.length === 1
                ? t("openTasks", { count: pendingTasks.length })
                : t("openTasksPlural", { count: pendingTasks.length })
              : t("noActionRequired");
            const badges: { label: string; tone: "warn" | "muted" | "info" }[] = [];
            const badgeText =
              typeof row.badge_text === "string" ? row.badge_text.trim() : "";
            const isNullishBadge =
              badgeText === "" ||
              badgeText.toLowerCase() === "null" ||
              badgeText.toLowerCase() === "undefined";
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
              badges.push({ label: row.followup_note, tone: "muted" });
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
                    <div className="font-medium">{row.title}</div>
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
                        {(row.tags?.length || row.reference_ids?.length) ? (
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
                            {row.reference_ids?.slice(0, 3).map((rid, idx) => (
                              <span
                                key={`${row.id}-ref-${idx}`}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  border: "1px dashed rgba(0,0,0,0.15)",
                                  background: "rgba(0,0,0,0.01)",
                                }}
                              >
                                {rid}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {buildDetailBullets(row.main_summary || row.summary, row.extra_details, pendingTasks.map((t) => t.title)).length >
                          0 && (
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
                              <div className="pit-subtitle text-xs" style={{ lineHeight: 1.5, color: "rgba(0,0,0,0.75)" }}>
                                <ul style={{ paddingLeft: "18px", margin: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {buildDetailBullets(row.main_summary || row.summary, row.extra_details, pendingTasks.map((t) => t.title)).map((bullet, idx) => (
                                    <li key={`${row.id}-bullet-${idx}`} style={{ listStyleType: "disc" }}>
                                      {bullet}
                                    </li>
                                  ))}
                                  {row.deadlines && row.deadlines.length
                                    ? row.deadlines.slice(0, 3).map((d, idx) => (
                                        <li key={`${row.id}-deadline-${idx}`} style={{ listStyleType: "disc" }}>
                                          {formatDate(d.date_exact ?? null, lang) || d.date_exact || ""} {d.description || ""}
                                        </li>
                                      ))
                                    : null}
                                  {row.actions_required && row.actions_required.length
                                    ? row.actions_required.slice(0, 3).map((a, idx) => (
                                        <li key={`${row.id}-action-${idx}`} style={{ listStyleType: "disc" }}>
                                          {a.label ||
                                            t("actionNeededBy", {
                                              date: formatDate(a.due_date ?? null, lang) ?? "",
                                            }).trim()}
                                        </li>
                                      ))
                                    : null}
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      "—"
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
                        {opts?.noTasksSection && (row.tasks?.length ?? 0) === 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveToFiles(row.id)}
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
                            aria-label={t("moveToFiles")}
                            title={t("moveToFiles")}
                          >
                            <span aria-hidden style={{ fontSize: "16px", lineHeight: 1, fontWeight: 600 }}>→</span>
                          </button>
                        )}
                      </div>
                    </div>
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
                        className="text-xs self-start"
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
                    <div className="flex flex-col gap-2">
                      {isNoTaskRow
                        ? null
                        : pendingTasks.map((task) => (
                            <div
                              key={task.id}
                              style={{
                                display: "flex",
                                alignItems: "flex-start",
                                justifyContent: "space-between",
                                gap: "8px",
                                padding: "12px 14px",
                                border: "1px solid rgba(0,0,0,0.08)",
                                borderRadius: "12px",
                                background: flashingComplete.has(task.id)
                                  ? "rgba(0,200,120,0.05)"
                                  : "rgba(0,0,0,0.01)",
                                width: "100%",
                                minWidth: "260px",
                                flex: "1 1 auto",
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
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    background: flashingComplete.has(task.id)
                                      ? "rgba(0,200,120,0.08)"
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
                                      width: 16,
                                      height: 16,
                                      borderRadius: 4,
                                      border: flashingComplete.has(task.id)
                                        ? "2px solid #00a86b"
                                        : "2px solid #888",
                                      color: "#00a86b",
                                      textAlign: "center",
                                      lineHeight: "12px",
                                    }}
                                  >
                                    {flashingComplete.has(task.id) ? "✓" : ""}
                                  </span>
                                </button>
                              </div>
                            </div>
                          ))}
                    </div>
                    {doneTasks.length > 0 && expandedCompleted.has(row.id) && (
                      <div className="flex flex-col gap-2">
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
                              width: "100%",
                              minWidth: "260px",
                              flex: "1 1 auto",
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
        de: "Deep Dive",
        en: "Deep Dive",
        ro: "Analiză detaliată",
        tr: "Derin inceleme",
        fr: "Analyse détaillée",
        es: "Análisis detallado",
        ar: "تحليل متعمق",
        pt: "Análise detalhada",
        ru: "Глубокий разбор",
        pl: "Dogłębna analiza",
        uk: "Детальний розбір",
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
        de: "Stelle eine Frage zu diesem Dokument.",
        en: "Ask a question about this document.",
        ro: "Pune o întrebare despre acest document.",
        tr: "Bu belge hakkında soru sor.",
        fr: "Posez une question sur ce document.",
        es: "Haz una pregunta sobre este documento.",
        ar: "اطرح سؤالاً حول هذا المستند.",
        pt: "Faça uma pergunta sobre este documento.",
        ru: "Задайте вопрос об этом документе.",
        pl: "Zadaj pytanie o ten dokument.",
        uk: "Поставте запитання про цей документ.",
      },
      placeholder: {
        de: "Frage nach Fristen, Beträgen, Aufgaben…",
        en: "Ask about deadlines, amounts, tasks…",
        ro: "Întreabă despre termene, sume, sarcini…",
        tr: "Son tarihler, tutarlar, görevler hakkında sor…",
        fr: "Demandez sur les délais, montants, tâches…",
        es: "Pregunta sobre plazos, importes, tareas…",
        ar: "اسأل عن المواعيد النهائية والمبالغ والمهام…",
        pt: "Pergunte sobre prazos, valores, tarefas…",
        ru: "Спросите о сроках, суммах, задачах…",
        pl: "Zapytaj o terminy, kwoty, zadania…",
        uk: "Запитайте про дедлайни, суми, завдання…",
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
      const res = await fetch(`/api/doc-chat?documentId=${row.id}&lang=${lang}`);
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

  const sendChat = async () => {
    if (!chatForDoc || !chatInput.trim()) return;
    setChatLoading(true);
    const userMsg = { role: "user" as const, content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatError(null);
    try {
      const res = await fetch("/api/doc-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      setPreviewName(row.title);
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

  return (
    <div className="w-full">
      {isHome ? (
        <div className="flex flex-col gap-4">
              <div className="pit-subcard flex flex-col gap-3 w-full">
                <div className="flex items-center justify-between">
                  <h3 className="pit-title" style={{ fontSize: "18px" }}>
                {t("needsAttentionTitle")}
                  </h3>
                </div>
                <p className="pit-subtitle text-xs" style={{ color: "rgba(0,0,0,0.65)" }}>
              {t("needsAttentionSubtitle")}
                </p>
                <div className="w-full overflow-x-auto">
              {renderTable(openRows, { emptyMessage: t("noDocsOpen") })}
                </div>
              </div>
              <div className="pit-subcard flex flex-col gap-3 w-full">
                <div className="flex items-center justify-between">
                  <h3 className="pit-title" style={{ fontSize: "18px" }}>
                {t("readyTitle")}
                  </h3>
                </div>
                <div className="w-full overflow-x-auto">
                  {renderTable(readyRows, {
                    noTasksSection: true,
                    emptyMessage: t("noDocsReady"),
                  })}
                </div>
              </div>
        </div>
      ) : (
        <div className="w-full overflow-x-auto">{renderTable(visibleRows)}</div>
      )}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="pit-card max-w-4xl w-[90vw] h-[80vh] relative">
            <div className="flex items-center justify-between mb-3">
              <p className="pit-title" style={{ fontSize: "18px" }}>
                Preview: {previewName}
              </p>
              <button
                onClick={() => {
                  setPreviewUrl(undefined);
                  setPreviewName(null);
                }}
                className="pit-cta pit-cta--secondary text-xs"
              >
                Close
              </button>
            </div>
            <div className="h-[calc(100%-48px)]">
              <iframe
                src={previewUrl}
                title="preview"
                className="w-full h-full rounded-lg border border-[rgba(255,255,255,0.05)]"
              />
            </div>
          </div>
        </div>
      )}
      {isMounted && taskModal
        ? createPortal(
            <div
              className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4"
              onClick={() => setTaskModal(null)}
            >
              <div
                className="pit-card w-full max-w-md"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="pit-title" style={{ fontSize: "18px" }}>
                    New task
                  </p>
                  <button
                    onClick={() => setTaskModal(null)}
                    className="pit-cta pit-cta--secondary text-xs"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="pit-subtitle text-xs uppercase tracking-wide">Title</span>
                    <input
                      className="pit-input"
                      value={taskModal?.title ?? ""}
                      onChange={(e) => setTaskModal((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                      placeholder="What needs to be done?"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="pit-subtitle text-xs uppercase tracking-wide">Due date</span>
                    <input
                      className="pit-input"
                      type="date"
                      value={taskModal?.due ?? ""}
                      onChange={(e) => setTaskModal((prev) => (prev ? { ...prev, due: e.target.value } : prev))}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="pit-subtitle text-xs uppercase tracking-wide">{t("urgency")}</span>
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
                      onClick={() => setTaskModal(null)}
                      className="pit-cta pit-cta--secondary text-xs"
                    >
                      {t("cancel")}
                    </button>
                    <button onClick={submitTask} className="pit-cta pit-cta--primary text-xs">
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
              className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4"
              onClick={() => {
                if (!chatLoading) {
                  setChatForDoc(null);
                  setChatThreadId(null);
                  setChatMessages([]);
                }
              }}
            >
              <div
                className="pit-card w-full max-w-2xl max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="pit-title" style={{ fontSize: "18px" }}>
                    {uiText.title[lang] || uiText.title.en}
                  </p>
                  <button
                    onClick={() => {
                      if (!chatLoading) {
                        setChatForDoc(null);
                        setChatThreadId(null);
                        setChatMessages([]);
                      }
                    }}
                    className="pit-cta pit-cta--secondary text-xs"
                  >
                    {uiText.close[lang] || uiText.close.en}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto border border-[rgba(0,0,0,0.06)] rounded-md p-3 flex flex-col gap-2">
                  {chatLoading && chatMessages.length === 0 ? (
                    <p className="pit-muted text-sm">{uiText.loading[lang] || uiText.loading.en}</p>
                  ) : chatMessages.length === 0 ? (
                    <p className="pit-muted text-sm">{uiText.ask[lang] || uiText.ask.en}</p>
                  ) : (
                    chatMessages.map((m, idx) => (
                      <div
                        key={`${chatForDoc}-msg-${idx}`}
                        className="text-sm"
                        style={{ color: m.role === "assistant" ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.7)" }}
                      >
                        <strong style={{ marginRight: 6 }}>{m.role === "assistant" ? "Assistant" : "You"}:</strong>
                        <span>{m.content}</span>
                      </div>
                    ))
                  )}
                  {chatError && <p className="pit-error text-xs">{chatError}</p>}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <textarea
                    className="pit-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={uiText.placeholder[lang] || uiText.placeholder.en}
                    rows={2}
                    style={{ resize: "vertical", minHeight: 60 }}
                  />
                  <button
                    onClick={sendChat}
                    disabled={chatLoading || !chatInput.trim()}
                    className="pit-cta pit-cta--primary text-xs"
                    style={{ height: "fit-content" }}
                  >
                    {uiText.send[lang] || uiText.send.en}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
