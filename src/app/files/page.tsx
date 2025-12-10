"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import DocumentTable from "@/components/DocumentTable";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import uploadOn from "../../../images/upload-selected.png";
import uploadOff from "../../../images/upload-unselected.png";
import folderOn from "../../../images/open-folder-selected.png";
import folderOff from "../../../images/open-folder-unselected.png";
import { LanguageProvider, useLanguage } from "@/lib/language";

type Category = {
  id: string;
  name: string;
  parent_id: string | null;
};

const formatSegmentDisplay = (segment: string) => {
  const cleaned = segment.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return segment;
  return cleaned
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
};

function FilesContent() {
  const pathname = usePathname();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTranslations, setCategoryTranslations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level1, setLevel1] = useState<string | undefined>();
  const [level2, setLevel2] = useState<string | undefined>();
  const [level3, setLevel3] = useState<string | undefined>();
  const [docCounts, setDocCounts] = useState<Record<string, number>>({});
  const [uncatCount, setUncatCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filterIds, setFilterIds] = useState<string[] | null | undefined>(undefined);
  const { lang, setLang, t } = useLanguage();

  useEffect(() => {
    const load = async () => {
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
          .select("id, category_id, status, case_id")
          .eq("user_id", user.id)
          .neq("status", "error");
        if (docError) throw docError;

        const counts: Record<string, number> = {};
        let uncat = 0;
        (docs ?? []).forEach((d) => {
          const cid = (d as { category_id: string | null; status: string }).category_id;
          if (!cid) {
            uncat += 1;
          } else {
            counts[cid] = (counts[cid] ?? 0) + 1;
          }
        });
        setDocCounts(counts);
        setUncatCount(uncat);
        setTotalCount((docs ?? []).length);

      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load categories");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [lang]);

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
    (parentId?: string) =>
      categories
        .filter((c) => c.parent_id === parentId)
        .sort((a, b) => labelFor(a).localeCompare(labelFor(b))),
    [categories, labelFor]
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
    // derive effective selection and filter set
    const effective = level3 ?? level2 ?? level1 ?? undefined;
    if (effective === undefined) {
      setFilterIds(undefined);
      return;
    }
    if (effective === null) {
      setFilterIds(null);
      return;
    }
    // collect descendants of selected category
    const queue = [effective];
    const collected: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      collected.push(current);
      const kids = childrenOf(current).map((c) => c.id);
      queue.push(...kids);
    }
    setFilterIds(collected);
  }, [level1, level2, level3, childrenOf]);

  const level2Options = useMemo(() => childrenOf(level1), [childrenOf, level1]);
  const level3Options = useMemo(() => childrenOf(level2), [childrenOf, level2]);

  return (
    <div className="pit-page">
      <main className="pit-shell">
        <header className="pit-header">
          <div>
            <p className="pit-title">{t("files")}</p>
            <p className="pit-subtitle">{t("readySubtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Language"
              value={lang}
              onChange={(e) => setLang(e.target.value as any)}
              className="rounded-md border border-[rgba(0,0,0,0.1)] bg-white/60 px-2 py-1 text-xs"
              style={{ color: "rgba(0,0,0,0.65)" }}
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
        </header>

        <section className="pit-card grid gap-3 md:grid-cols-[260px,1fr]">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-2">
              <select
                className="pit-input"
                value={level1 ?? ""}
                onChange={(e) => {
                  const val = e.target.value || undefined;
                  if (val === "__UNCAT__") {
                    setLevel1(undefined);
                    setLevel2(undefined);
                    setLevel3(undefined);
                    setFilterIds(null);
                    return;
                  }
                  setLevel1(val);
                  setLevel2(undefined);
                  setLevel3(undefined);
                }}
                style={{ padding: "10px 12px", minWidth: "160px" }}
              >
                <option value="">
                  All {totalCount ? `(${totalCount})` : ""}
                </option>
                {uncatCount > 0 && (
                  <option value="__UNCAT__">
                    Uncategorized {`(${uncatCount})`}
                  </option>
                )}
                {roots
                  .filter((cat) => hasDocs(cat.id))
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {labelFor(cat)}
                      {countWithDesc(cat.id) ? ` (${countWithDesc(cat.id)})` : ""}
                    </option>
                  ))}
              </select>
              {level1 && (
                <select
                  className="pit-input"
                  value={level2 ?? ""}
                  onChange={(e) => {
                    const val = e.target.value || undefined;
                    setLevel2(val);
                    setLevel3(undefined);
                  }}
                  style={{ padding: "10px 12px", minWidth: "160px" }}
                >
                  <option value="">— Child —</option>
                  {level2Options
                    .filter((cat) => hasDocs(cat.id))
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {labelFor(cat)}
                        {countWithDesc(cat.id) ? ` (${countWithDesc(cat.id)})` : ""}
                      </option>
                    ))}
                </select>
              )}
              {level2 && (
                <select
                  className="pit-input"
                  value={level3 ?? ""}
                  onChange={(e) => {
                    const val = e.target.value || undefined;
                    setLevel3(val);
                  }}
                  style={{ padding: "10px 12px", minWidth: "160px" }}
                >
                  <option value="">— Subchild —</option>
                  {level3Options
                    .filter((cat) => hasDocs(cat.id))
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {labelFor(cat)}
                        {countWithDesc(cat.id) ? ` (${countWithDesc(cat.id)})` : ""}
                      </option>
                    ))}
                </select>
              )}
            </div>
            {loading && <p className="pit-muted text-xs">Loading folders…</p>}
            {error && <p className="pit-error text-xs">{error}</p>}
          </div>
          <div className="min-w-0">
            <DocumentTable
              refreshKey={0}
              categoryFilter={filterIds ?? undefined}
            />
          </div>
        </section>
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(0,0,0,0.08)]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 20%, rgba(255,255,255,0) 100%)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div
          className="mx-auto flex max-w-4xl items-center justify-around px-6 py-3 text-sm"
            style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)" }}
          >
            {[
              { href: "/", on: uploadOn, off: uploadOff, label: t("home") },
              { href: "/files", on: folderOn, off: folderOff, label: t("files") },
            ].map((item) => {
              const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px",
                }}
              >
                <Image
                  src={active ? item.on : item.off}
                  alt={item.label}
                  width={28}
                  height={28}
                />
              </Link>
            );
          })}
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
