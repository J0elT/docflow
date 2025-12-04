"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { createPortal } from "react-dom";
import viewIcon from "../../images/view.png";
import binIcon from "../../images/bin.png";

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
  sender?: string;
  topic?: string;
  amount?: string;
  due_date?: string | null;
  action_required?: boolean;
  action_text?: string | null;
  category_suggestion?: string | null;
  created_at: string;
  summary?: string;
};

type Props = {
  refreshKey: number;
  categoryFilter?: string[] | null;
  mode?: "home" | "files";
};

export default function DocumentTable({ refreshKey, categoryFilter, mode = "files" }: Props) {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<{ id: string; path: string }[]>([]);
  const [expandedCompleted, setExpandedCompleted] = useState<Set<string>>(new Set());
  const [hiddenDocIds, setHiddenDocIds] = useState<Set<string>>(new Set());
  const [taskModal, setTaskModal] = useState<{
    docId: string;
    title: string;
    due: string;
    urgency: string;
  } | null>(null);
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());
  const [isMounted, setIsMounted] = useState(false);
  const [flashingComplete, setFlashingComplete] = useState<Set<string>>(new Set());
  const [recentlyDone, setRecentlyDone] = useState<Set<string>>(new Set());

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

const buildGist = (summary?: string | null) => {
  if (!summary) return null;
  const trimmed = summary.trim();
  if (!trimmed) return null;
  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  const gist = sentences.slice(0, 2).join(" ");
  return gist || trimmed;
};

const ONE_DAY = 24 * 60 * 60 * 1000;
const getTodayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const computeDueBadge = (row: TableRow, pendingTasks: TaskRow[]) => {
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
  if (daysDiff < 0) return { label: `Overdue · ${Math.abs(daysDiff)}d`, tone: "warn" as const };
  if (daysDiff === 0) return { label: "Due today", tone: "warn" as const };
  if (daysDiff <= 7) return { label: `Due in ${daysDiff}d`, tone: "info" as const };
  return { label: `Due in ${daysDiff}d`, tone: "muted" as const };
};

  const getLastSegment = (path?: string) => {
    if (!path) return "Uncategorized";
    const parts = path.split(" / ").filter(Boolean);
    return parts[parts.length - 1] || path;
  };

  const fetchDocs = useCallback(
    async (showLoading: boolean) => {
      let timeout: NodeJS.Timeout | null = null;
      if (showLoading) {
        setLoading(true);
        setError(null);
        timeout = setTimeout(() => {
          setError((prev) => prev ?? "Taking too long to load documents. Please retry.");
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
        setError("Not logged in.");
        if (timeout) clearTimeout(timeout);
        setLoading(false);
        return;
      }
      setUserId(user.id);

        const docsQuery = supabase
          .from("documents")
          .select(
            "id, title, status, error_message, storage_path, category_id, created_at, extra:extractions(content, created_at)"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (categoryFilter === null) {
          docsQuery.is("category_id", null);
        } else if (Array.isArray(categoryFilter) && categoryFilter.length > 0) {
          docsQuery.in("category_id", categoryFilter);
        }

        const [docsRes, catsRes, tasksRes] = await Promise.all([
          docsQuery,
          supabase
            .from("categories")
            .select("id, name, parent_id")
            .eq("user_id", user.id),
          supabase
            .from("tasks")
            .select("id, document_id, title, status, due_date")
            .eq("user_id", user.id),
        ]);

        if (docsRes.error) throw docsRes.error;
        if (catsRes.error && (catsRes.error as { code?: string }).code !== "42P01")
          throw catsRes.error;
        if (tasksRes.error && (tasksRes.error as { code?: string }).code !== "42P01")
          throw tasksRes.error;

        const catMap = new Map<string, CategoryRow>();
        const cats = (catsRes.data as CategoryRow[] | null) ?? [];
        cats.forEach((c) => {
          catMap.set(c.id, c);
        });

        // Build keep set: categories used by docs + their ancestors
        const usedCats = new Set<string>();
        (docsRes.data as DocumentRow[] | null)?.forEach((d) => {
          if (d.category_id) usedCats.add(d.category_id);
        });
        const keep = new Set<string>();
        const addAncestors = (id: string) => {
          let current: string | null | undefined = id;
          const visited = new Set<string>();
          while (current) {
            if (visited.has(current)) break;
            visited.add(current);
            keep.add(current);
            const parent: string | null | undefined = catMap.get(current)?.parent_id;
            current = parent;
          }
        };
        usedCats.forEach((id) => addAncestors(id));

        // Delete truly unused categories (not in keep set)
        try {
          const removeIds = cats.map((c) => c.id).filter((id) => !keep.has(id));
          if (removeIds.length) {
            await supabase.from("categories").delete().in("id", removeIds);
            // remove from local map too
            removeIds.forEach((id) => catMap.delete(id));
          }
        } catch (cleanupErr) {
          console.error("category cleanup failed", cleanupErr);
        }

        const catOptions: { id: string; path: string }[] = [];
        catMap.forEach((_, id) => {
          const p = (() => {
            const parts: string[] = [];
            let current: string | null | undefined = id;
            const visited = new Set<string>();
            while (current) {
              if (visited.has(current)) break;
              visited.add(current);
              const cat = catMap.get(current);
              if (!cat) break;
              parts.unshift(cat.name);
              current = cat.parent_id;
            }
            return parts.join(" / ");
          })();
          catOptions.push({ id, path: p });
        });
        setCategoryOptions(catOptions.sort((a, b) => a.path.localeCompare(b.path)));

        const buildPath = (catId?: string | null) => {
          if (!catId) return undefined;
          const parts: string[] = [];
          let current: string | null | undefined = catId;
          const visited = new Set<string>();
          while (current) {
            if (visited.has(current)) break;
            visited.add(current);
            const cat = catMap.get(current);
            if (!cat) break;
            parts.unshift(cat.name);
            current = cat.parent_id;
          }
          return parts.length ? parts.join(" / ") : undefined;
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
            const sender =
              typeof keyFields.sender === "string" && keyFields.sender.trim()
                ? (keyFields.sender as string).trim()
                : undefined;
            const topic =
              typeof keyFields.topic === "string" && keyFields.topic.trim()
                ? (keyFields.topic as string).trim()
                : undefined;
            const amount =
              typeof keyFields.amount_total === "number"
                ? `${keyFields.amount_total} ${(keyFields.currency as string | undefined) || ""}`.trim()
                : undefined;
            const due =
              typeof keyFields.due_date === "string" && keyFields.due_date.trim()
                ? (keyFields.due_date as string).trim()
                : null;
            const actionRequired =
              keyFields.action_required === true ||
              (tasksByDoc.get(doc.id) ?? []).some((t) => t.status !== "done");
            const actionText =
              typeof keyFields.action_description === "string" && keyFields.action_description.trim()
                ? (keyFields.action_description as string).trim()
                : null;
            const categorySuggestionPath = Array.isArray((latest as any)?.category_suggestion?.path)
              ? ((latest as any)?.category_suggestion?.path as string[]).filter(Boolean).join(" / ")
              : null;

            return {
              id: doc.id,
              title: doc.title,
              status: doc.status,
              error_message: doc.error_message,
              storage_path: doc.storage_path ?? undefined,
              category_id: doc.category_id ?? null,
              category_path: buildPath(doc.category_id ?? undefined),
              tasks: tasksByDoc.get(doc.id) ?? [],
              created_at: doc.created_at,
              summary,
              sender,
              topic,
              amount,
              due_date: due,
              action_required: actionRequired,
              action_text: actionText,
              category_suggestion: categorySuggestionPath,
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
    [categoryFilter]
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
    ? visibleRows.filter((r) => (r.tasks ?? []).some((t) => t.status !== "done"))
    : visibleRows;
  const readyRows = isHome
    ? visibleRows.filter((r) => !(r.tasks ?? []).some((t) => t.status !== "done"))
    : [];

  const renderTable = (
    data: TableRow[],
    opts?: { noTasksSection?: boolean; emptyMessage?: string }
  ) => (
    <table className="pit-table">
      <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Title</th>
            <th style={{ textAlign: "left" }}>Summary</th>
            <th style={{ minWidth: 300, textAlign: "left" }}>Actions</th>
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
              Loading...
            </td>
          </tr>
        ) : data.length === 0 ? (
          <tr>
            <td className="pit-muted" colSpan={3}>
              {opts?.emptyMessage || "No documents yet."}
            </td>
          </tr>
        ) : (
          data.map((row) => {
            const pendingTasks = row.tasks?.filter((t) => t.status !== "done") ?? [];
            const doneTasks = row.tasks?.filter((t) => t.status === "done") ?? [];
            const isNoTaskRow = (row.tasks?.length ?? 0) === 0 && opts?.noTasksSection;
            const gist = buildGist(row.summary);
            const isSummaryExpanded = expandedSummaries.has(row.id);
            const primaryAction = pendingTasks.length
              ? `${pendingTasks.length} open task${pendingTasks.length > 1 ? "s" : ""}`
              : row.action_required
              ? row.due_date
                ? `Action needed by ${row.due_date}`
                : "Action needed"
              : "No action required";
            const badges: { label: string; tone: "warn" | "muted" | "info" }[] = [];
            if (row.action_required) badges.push({ label: "Action needed", tone: "warn" });
            const dueBadge = pendingTasks.length ? computeDueBadge(row, pendingTasks) : null;
            if (dueBadge) badges.push(dueBadge);
            if (row.category_suggestion)
              badges.push({ label: `Suggested: ${row.category_suggestion}`, tone: "muted" });

            return (
              <tr key={row.id}>
                <td className="align-top text-left">
                  <div className="flex flex-col gap-2">
                    <div className="font-medium">{row.title}</div>
                    {row.status === "done" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="pit-input"
                          value={row.category_id ?? ""}
                          onChange={(e) =>
                            handleCategoryChange(row, e.target.value || null)
                          }
                          style={{ padding: "6px 10px", minWidth: "160px" }}
                          disabled={busyRow === row.id}
                        >
                          <option value="">Uncategorized</option>
                          {categoryOptions.map((opt) => (
                            <option key={opt.id} value={opt.id} title={opt.path}>
                              {getLastSegment(opt.path)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
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
                    </div>
                  </div>
                </td>
                <td className="align-top text-left">
                  <div className="flex flex-col gap-2">
                    {badges.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {badges.map((b, idx) => (
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
                        {row.due_date && (
                          <span className="pit-subtitle text-xs">Due {row.due_date}</span>
                        )}
                        {row.summary && (
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
                              {isSummaryExpanded ? "Hide details" : "Show details"}
                              <span aria-hidden style={{ fontSize: "12px", lineHeight: 1 }}>
                                {isSummaryExpanded ? "▾" : "▸"}
                              </span>
                            </button>
                            {isSummaryExpanded && (
                              <p
                                className="pit-subtitle text-xs"
                                style={{ lineHeight: 1.4, color: "rgba(0,0,0,0.7)" }}
                              >
                                {row.summary}
                              </p>
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
                    <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-medium">{primaryAction}</div>
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
                          aria-label="Add task"
                          title="Add task"
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
                            aria-label="Move to files"
                            title="Move to files"
                          >
                            <span aria-hidden style={{ fontSize: "16px", lineHeight: 1, fontWeight: 600 }}>→</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {isNoTaskRow
                        ? null
                        : pendingTasks.map((t) => (
                            <div
                              key={t.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                padding: "12px 14px",
                                border: "1px solid rgba(0,0,0,0.08)",
                                borderRadius: "12px",
                                background: flashingComplete.has(t.id)
                                  ? "rgba(0,200,120,0.05)"
                                  : "rgba(0,0,0,0.01)",
                                width: "100%",
                                minWidth: "260px",
                                flex: "1 1 auto",
                              }}
                            >
                              <span className="pit-subtitle text-xs" style={{ lineHeight: 1.4 }}>
                                {t.title}
                                {t.due_date ? ` · due ${t.due_date}` : ""}
                              </span>
                              <button
                                onClick={() => handleMarkClick(t)}
                                disabled={busyRow === row.id}
                                aria-label="Mark done"
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 8,
                                  background: flashingComplete.has(t.id)
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
                                  flexShrink: 0,
                                }}
                              >
                                <span
                                  aria-hidden
                                  style={{
                                    display: "block",
                                    width: 16,
                                    height: 16,
                                    borderRadius: 4,
                                    border: flashingComplete.has(t.id)
                                      ? "2px solid #00a86b"
                                      : "2px solid #888",
                                    color: "#00a86b",
                                    textAlign: "center",
                                    lineHeight: "12px",
                                  }}
                                >
                                  {flashingComplete.has(t.id) ? "✓" : ""}
                                </span>
                              </button>
                            </div>
                          ))}
                      {doneTasks.length > 0 && expandedCompleted.has(row.id) && (
                        <div className="flex flex-col gap-2">
                          {doneTasks.map((t) => (
                            <div
                              key={t.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "8px",
                                padding: "12px 14px",
                                border: "1px solid rgba(0,0,0,0.08)",
                                borderRadius: "12px",
                                background: recentlyDone.has(t.id)
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
                                {t.title}
                                {t.due_date ? ` · due ${t.due_date}` : ""}
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
                                onClick={() => handleMarkClick(t)}
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
                    <div className="flex items-center justify-between gap-2">
                      <div>
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
                            <span>Completed ({doneTasks.length})</span>
                            <span aria-hidden style={{ fontSize: "14px", lineHeight: 1 }}>
                              {expandedCompleted.has(row.id) ? "▾" : "▸"}
                            </span>
                          </button>
                        )}
                      </div>
                      <div />
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

  const handleDelete = async (row: TableRow) => {
    if (!row.storage_path) return;
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

      fetchDocs(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete document");
    } finally {
      setBusyRow(null);
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
                Needs your attention
              </h3>
            </div>
            <div className="w-full overflow-x-auto">
              {renderTable(openRows, { emptyMessage: "No documents with open tasks." })}
            </div>
          </div>
          <div className="pit-subcard flex flex-col gap-3 w-full">
            <div className="flex items-center justify-between">
              <h3 className="pit-title" style={{ fontSize: "18px" }}>
                Ready to file
              </h3>
            </div>
            <div className="w-full overflow-x-auto">
              {renderTable(readyRows, {
                noTasksSection: true,
                emptyMessage: "No documents ready to file.",
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
                    <span className="pit-subtitle text-xs uppercase tracking-wide">Urgency</span>
                    <select
                      className="pit-input"
                      value={taskModal?.urgency ?? "normal"}
                      onChange={(e) => setTaskModal((prev) => (prev ? { ...prev, urgency: e.target.value } : prev))}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setTaskModal(null)}
                      className="pit-cta pit-cta--secondary text-xs"
                    >
                      Cancel
                    </button>
                    <button onClick={submitTask} className="pit-cta pit-cta--primary text-xs">
                      Add task
                    </button>
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
