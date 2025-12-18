"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import DocumentTable from "@/components/DocumentTable";
import UploadForm from "@/components/UploadForm";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import uploadOn from "../../../images/paper-plane-2.png";
import uploadOff from "../../../images/paper-plane.png";
import folderOn from "../../../images/open-folder-selected.png";
import folderOff from "../../../images/open-folder-unselected.png";
import plusIcon from "../../../images/plus.png";
import aiIcon from "../../../images/ai.png";
import userIcon from "../../../images/user.png";
import { LanguageProvider, useLanguage } from "@/lib/language";
import FilesAssistantPanel from "@/components/FilesAssistantPanel";

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
};

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

const formatSegmentDisplay = (segment: string) => {
  const cleaned = segment.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return segment;
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
};

const formatBreadcrumb = (labels: string[]) => {
  const sep = " › ";
  if (labels.length <= 3) return labels.join(sep);
  const tail = labels.slice(-3);
  return ["…", ...tail].join(sep);
};

function FilesContent() {
  const pathname = usePathname();
  const [composerOpen, setComposerOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTranslations, setCategoryTranslations] = useState<Record<string, string>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined | null>();
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseCurrentId, setBrowseCurrentId] = useState<string | undefined | null>(undefined);
  const [browsePath, setBrowsePath] = useState<string[]>([]);
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [docsByCategory, setDocsByCategory] = useState<Record<string, { id: string; title: string }[]>>({});
  const [uncatCount, setUncatCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filterIds, setFilterIds] = useState<string[] | null | undefined>(undefined);
  const { lang, setLang, t } = useLanguage();
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ open: boolean }>).detail;
      setComposerOpen(Boolean(detail?.open));
    };
    window.addEventListener("upload-composer-state", handler);
    return () => window.removeEventListener("upload-composer-state", handler);
  }, []);

  useEffect(() => {
    const handler = () => setAssistantOpen(true);
    window.addEventListener("open-galaxy-assistant", handler);
    return () => window.removeEventListener("open-galaxy-assistant", handler);
  }, []);

  const reloadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in.");
      setUserEmail(user.email ?? null);

      const { data, error: catError } = await supabase
        .from("categories")
        .select("id, name, parent_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (catError) throw catError;
      setCategories(data ?? []);

      const { data: trans, error: transErr } = await supabase
        .from("category_translations")
        .select("category_id, label, lang")
        .eq("user_id", user.id)
        .eq("lang", lang);
      if (transErr && (transErr as { code?: string }).code !== "42P01") throw transErr;
      const map: Record<string, string> = {};
      (trans ?? []).forEach((t) => {
        if (t?.category_id && typeof t.label === "string" && t.label.trim()) {
          map[t.category_id] = t.label.trim();
        }
      });
      setCategoryTranslations(map);

      const { data: docs, error: docError } = await supabase
        .from("documents")
        .select("id, title, category_id, status, case_id")
        .eq("user_id", user.id)
        .neq("status", "error");
      if (docError) throw docError;

      const counts: Record<string, number> = {};
      const docMap: Record<string, { id: string; title: string }[]> = {};
      let uncat = 0;
      (docs ?? []).forEach((d) => {
        const cid = (d as { category_id: string | null; status: string }).category_id;
        if (!cid) {
          uncat += 1;
        } else {
          counts[cid] = (counts[cid] ?? 0) + 1;
          const title = (d as { title?: string }).title?.trim() || "Ohne Titel";
          if (!docMap[cid]) docMap[cid] = [];
          docMap[cid].push({ id: (d as { id: string }).id, title });
        }
      });
      setDocCounts(counts);
      setDocsByCategory(docMap);
      setUncatCount(uncat);
      setTotalCount((docs ?? []).length);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void reloadTree();
  }, [reloadTree]);

  useEffect(() => {
    const onDocsChanged = () => void reloadTree();
    window.addEventListener("docflow:documents-changed", onDocsChanged);
    return () => window.removeEventListener("docflow:documents-changed", onDocsChanged);
  }, [reloadTree]);

  const labelFor = useCallback(
    (cat: Category) => categoryTranslations[cat.id] || formatSegmentDisplay(cat.name),
    [categoryTranslations]
  );

  const roots = useMemo(
    () =>
      categories
        .filter((c) => c.parent_id === null)
        .sort((a, b) => labelFor(a).localeCompare(labelFor(b))),
    [categories, labelFor]
  );
  const childrenOf = useCallback(
    (parentId?: string | null) =>
      categories
        .filter((c) => c.parent_id === (parentId ?? null))
        .sort((a, b) => labelFor(a).localeCompare(labelFor(b))),
    [categories, labelFor]
  );
  const parentOf = useMemo(() => {
    const map: Record<string, string | null> = {};
    categories.forEach((c) => {
      map[c.id] = c.parent_id;
    });
    return map;
  }, [categories]);
  const pathFor = useCallback(
    (catId?: string | null) => {
      if (!catId) return [];
      const path: string[] = [];
      let current: string | null | undefined = catId;
      const safety = new Set<string>();
      while (current) {
        if (safety.has(current)) break;
        safety.add(current);
        path.unshift(current);
        current = parentOf[current];
      }
      return path;
    },
    [parentOf]
  );

  const countWithDesc = useCallback(
    (catId: string) => {
      let total = 0;
      const stack = [catId];
      const seen = new Set<string>();
      while (stack.length) {
        const current = stack.pop();
        if (!current || seen.has(current)) continue;
        seen.add(current);
        total += docCounts[current] ?? 0;
        childrenOf(current).forEach((c) => stack.push(c.id));
      }
      return total;
    },
    [childrenOf, docCounts]
  );

  const hasDocs = useCallback(
    (catId: string) => countWithDesc(catId) > 0,
    [countWithDesc]
  );

  useEffect(() => {
    const effective = selectedCategoryId ?? undefined;
    if (effective === undefined) {
      setFilterIds(undefined);
      return;
    }
    if (effective === null) {
      setFilterIds(null);
      return;
    }
    const queue = [effective];
    const collected: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      collected.push(current);
      const kids = childrenOf(current).map((c) => c.id);
      queue.push(...kids);
    }
    setFilterIds(collected);
  }, [selectedCategoryId, childrenOf]);

  return (
    <div className="pit-page">
      <main
        className="pit-shell"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        <header
          className="pit-header relative flex w-full items-center justify-center px-8"
          style={{ paddingTop: "32px", paddingBottom: "26px" }}
        >
          <div
            className="absolute flex items-center"
            style={{ top: "calc(50% + 4px)", left: "12px", transform: "translateY(-50%)" }}
          >
            <button
              type="button"
              aria-label="AI assistant"
              onClick={() => setAssistantOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                opacity: 0.78,
              }}
            >
              <Image
                src={aiIcon}
                alt="Assistant"
                width={26}
                height={26}
                style={{ opacity: 0.92 }}
              />
            </button>
          </div>
          <div
            className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center text-center"
            style={{ fontFamily: "Georgia, serif", gap: "6px" }}
          >
            <p className="pit-title" style={{ fontFamily: "inherit", margin: 0 }}>
              <span style={{ fontSize: "36px", lineHeight: 1.1 }}>Orderly</span>
            </p>
          </div>
          <div
            className="absolute flex items-center"
            style={{ top: "calc(50% + 9px)", right: "12px", transform: "translateY(-50%)" }}
          >
            <button
              type="button"
              aria-label="Profile and language"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex flex-col items-center gap-1"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                width: 44,
                height: 44,
                opacity: 0.78,
              }}
            >
              <Image src={userIcon} alt="Profile" width={26} height={26} style={{ opacity: 0.92 }} />
            </button>
          </div>
        </header>

        {profileOpen && (
          <div
            className="fixed inset-0 z-40"
            style={{ backdropFilter: "blur(8px)", backgroundColor: "rgba(0,0,0,0.08)" }}
            onClick={() => setProfileOpen(false)}
          >
            <div
              className="absolute pit-radius-xl pit-shadow-2 border border-[rgba(0,0,0,0.12)]"
              style={{
                top: "78px",
                right: "18px",
                minWidth: "240px",
                background: "linear-gradient(145deg, #f7f1e4 0%, #f3ebdd 100%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-center pt-3">
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
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm" style={{ color: "rgba(0,0,0,0.7)" }}>
                  {userEmail || "Profile"}
                </span>
                <select
                  aria-label="Language"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as any)}
                  className="pit-radius-md border border-[rgba(0,0,0,0.15)] bg-[rgba(247,243,236,0.85)] px-2 py-1 text-xs"
                  style={{ color: "rgba(0,0,0,0.75)" }}
                >
                  <option value="de">DE</option>
                  <option value="en">EN</option>
                  <option value="ro">RO</option>
                  <option value="tr">TR</option>
                  <option value="fr">FR</option>
                  <option value="es">ES</option>
                  <option value="ar">AR</option>
                  <option value="pt">PT</option>
                  <option value="ru">RU</option>
                  <option value="pl">PL</option>
                  <option value="uk">UA</option>
                </select>
              </div>
              <div className="border-t border-[rgba(0,0,0,0.1)] px-4 py-3">
                <button
                  type="button"
                  onClick={async () => {
                    const supabase = supabaseBrowser();
                    await supabase.auth.signOut();
                    setUserEmail(null);
                    setProfileOpen(false);
                  }}
                  className="w-full pit-cta pit-cta--secondary"
                  style={{ letterSpacing: "0.08em", fontSize: "13px", textTransform: "uppercase" }}
                >
                  {t("logout") || "Log out"}
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-[260px,1fr]">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const baseId = selectedCategoryId === null ? undefined : selectedCategoryId ?? undefined;
                  setRefreshKey((k) => k + 1);
                  setBrowsePath(pathFor(baseId));
                  setBrowseCurrentId(baseId);
                  setBrowseOpen(true);
                }}
                style={{
                  padding: "10px 18px",
                  borderRadius: "14px",
                  background: "rgb(243,238,226)",
                  border: "1px solid rgba(0,0,0,0.35)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                  letterSpacing: "0.02em",
                  fontSize: "14px",
                  textTransform: "none",
                  color: "rgba(20,20,20,0.9)",
                }}
              >
                {t("selectFolder") || "Select folder"}
              </button>
            </div>
            {loading && <p className="pit-muted text-xs">{t("loading") || "Loading..."}</p>}
            {error && <p className="pit-error text-xs">{error}</p>}
          </div>
          <div className="min-w-0">
          <DocumentTable
            refreshKey={refreshKey}
            categoryFilter={filterIds ?? undefined}
          />
          </div>
        </section>
        <div
          aria-hidden
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        >
          <UploadForm
            processing={false}
            hideDropZone
            onUploaded={() => setRefreshKey((k) => k + 1)}
          />
        </div>
        {browseOpen && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center px-4"
            style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(245,240,232,0.55)" }}
            onClick={() => setBrowseOpen(false)}
            >
            <div
              className="w-full max-w-lg pit-radius-xl pit-shadow-2 border border-[rgba(0,0,0,0.12)]"
              style={{
                minHeight: "420px",
                maxHeight: "70vh",
                background: "linear-gradient(145deg, #f7f1e4 0%, #f3ebdd 100%)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
              }}
              onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-center pb-2">
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
                <div className="mb-3 px-1 flex items-center justify-between gap-3" style={{ minHeight: "44px" }}>
                  <div className="flex items-center gap-3 text-sm">
                    <button
                      type="button"
                      aria-label={t("back") || "Back"}
                      onClick={() => {
                        const nextPath = [...browsePath];
                        nextPath.pop();
                        const nextId = nextPath.length ? nextPath[nextPath.length - 1] : undefined;
                        setBrowsePath(nextPath);
                        setBrowseCurrentId(nextId);
                      }}
                      disabled={browsePath.length === 0}
                      style={{
                        opacity: browsePath.length === 0 ? 0.35 : 1,
                        width: "36px",
                        height: "36px",
                        borderRadius: "999px",
                        border: "1px solid rgba(0,0,0,0.18)",
                        background: "rgba(247,243,236,0.9)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: browsePath.length === 0 ? "default" : "pointer",
                        fontSize: "16px",
                      }}
                    >
                      ←
                    </button>
                  </div>
                  <div className="flex items-center">
                    <button
                      type="button"
                      aria-label={t("selectFolder") || "Select folder"}
                      onClick={() => {
                        setSelectedCategoryId(browseCurrentId ?? undefined);
                        setBrowseOpen(false);
                      }}
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "999px",
                        border: "1px solid rgba(0,0,0,0.18)",
                        background: "rgba(247,243,236,0.9)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        fontSize: "16px",
                        color: "rgba(20,20,20,0.9)",
                        boxShadow: "0 3px 8px rgba(0,0,0,0.12)",
                      }}
                    >
                      ✓
                    </button>
                  </div>
                </div>
                <div className="mb-3 px-1 text-[15px] text-[rgba(0,0,0,0.7)] leading-tight">
                  {browsePath.length
                    ? formatBreadcrumb(
                        browsePath.map((id) => {
                          const match = categories.find((c) => c.id === id);
                          return match ? labelFor(match) : id;
                        })
                      )
                    : t("allFolders") || "All folders"}
                </div>
              <div className="flex max-h-[52vh] flex-col gap-2 overflow-y-auto pr-1 flex-1">
                {childrenOf(browseCurrentId ?? undefined)
                  .filter((child) => countWithDesc(child.id) > 0)
                  .map((child) => (
                  <button
                    key={child.id}
                    type="button"
                  className="flex items-center justify-between rounded-lg border border-[rgba(0,0,0,0.12)] bg-[rgba(247,243,236,0.9)] px-6 py-3 text-left transition hover:border-[rgba(0,0,0,0.25)]"
                    onClick={() => {
                      const nextPath = [...browsePath, child.id];
                      setBrowsePath(nextPath);
                      setBrowseCurrentId(child.id);
                    }}
                  >
                    <span className="text-sm text-[rgba(0,0,0,0.8)]">{labelFor(child)}</span>
                    <span className="text-xs text-[rgba(0,0,0,0.5)]">
                      {countWithDesc(child.id) || ""}
                    </span>
                  </button>
                ))}
                {childrenOf(browseCurrentId ?? undefined).filter((child) => countWithDesc(child.id) > 0).length ===
                  0 && (
                  <>
                    {(browseCurrentId && (docsByCategory[browseCurrentId] ?? []).length > 0) ? (
                      (docsByCategory[browseCurrentId] ?? []).map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          className="flex items-center justify-between rounded-lg border border-[rgba(0,0,0,0.12)] bg-[rgba(247,243,236,0.9)] px-6 py-3 text-left transition hover:border-[rgba(0,0,0,0.25)]"
                          onClick={() => {
                            setSelectedCategoryId(browseCurrentId ?? undefined);
                            setBrowseOpen(false);
                            window.location.hash = doc.id;
                          }}
                        >
                          <span className="text-sm text-[rgba(0,0,0,0.8)]">{doc.title}</span>
                        </button>
                      ))
                    ) : (
                      <p className="text-xs text-[rgba(0,0,0,0.6)]">{t("noSubfolders") || "No subfolders."}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {assistantOpen && (
          <div
            className="fixed inset-0 z-[1001] flex items-center justify-center p-4"
            style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(245,240,232,0.5)" }}
            onClick={() => setAssistantOpen(false)}
          >
            <FilesAssistantPanel
              onDismiss={() => setAssistantOpen(false)}
              onDataChanged={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        )}
      </main>
    <nav
        className="fixed left-0 right-0 bottom-0 z-50 border-t"
        style={{
          background: "rgb(234,229,215)",
          borderColor: "rgba(0,0,0,0.2)",
          backdropFilter: browseOpen || profileOpen ? "blur(6px)" : "none",
          filter: browseOpen || profileOpen ? "blur(2px)" : "none",
          opacity: browseOpen || profileOpen ? 0.65 : 1,
          pointerEvents: browseOpen || profileOpen ? "none" : "auto",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <div
          className="relative mx-auto flex max-w-4xl items-center justify-around px-8 text-sm"
          style={{ boxShadow: "none", paddingTop: 0, paddingBottom: "32px", minHeight: "96px" }}
        >
          <div className="flex flex-1 justify-start">
            <Link
              href="/"
              aria-label={t("home")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px",
                filter: composerOpen ? "blur(4px)" : "none",
                opacity: composerOpen ? 0.5 : 1,
                pointerEvents: composerOpen ? "none" : "auto",
                transform: "scale(1.15)",
              }}
            >
              <Image src={pathname === "/" ? uploadOn : uploadOff} alt={t("home")} width={56} height={56} />
            </Link>
          </div>
          <div className="relative flex-1 flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (composerOpen) {
                  window.dispatchEvent(new Event("toggle-upload-composer"));
                } else {
                  setComposerOpen(true);
                  window.dispatchEvent(new Event("open-upload-composer"));
                }
              }}
              aria-label={t("uploadDrop")}
              className="absolute z-10 flex h-[80px] w-[80px] items-center justify-center rounded-full"
              style={{
                left: "50%",
                top: "-39px",
                backgroundColor: "rgb(234,229,215)",
                color: "rgba(22,22,22,1)",
                boxShadow: "none",
                border: "2px solid rgba(0,0,0,0.64)",
                transform: "translate(-50%, -50%)",
              }}
            >
              <Image
                src={plusIcon}
                alt={t("uploadDrop")}
                width={38}
                height={38}
                style={{
                  transform: composerOpen ? "rotate(45deg)" : "rotate(0deg)",
                  transition: "transform 200ms ease",
                  filter:
                    "brightness(0) saturate(100%) invert(17%) sepia(5%) saturate(323%) hue-rotate(7deg) brightness(92%) contrast(88%)",
                }}
              />
            </button>
          </div>
          <div className="flex flex-1 justify-end">
            <Link
              href="/files"
              aria-label={t("files")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "10px",
                filter: composerOpen ? "blur(4px)" : "none",
                opacity: composerOpen ? 0.5 : 1,
                pointerEvents: composerOpen ? "none" : "auto",
              }}
            >
              <Image src={pathname === "/files" ? folderOn : folderOff} alt={t("files")} width={56} height={56} />
            </Link>
          </div>
        </div>
      </nav>
    </div>
  );
}

export default function FilesPage() {
  return (
    <LanguageProvider>
      <FilesContent />
    </LanguageProvider>
  );
}
