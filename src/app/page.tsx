"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import DocumentTable from "@/components/DocumentTable";
import UploadForm from "@/components/UploadForm";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import uploadOn from "../../images/upload-selected.png";
import uploadOff from "../../images/upload-unselected.png";
import folderOn from "../../images/open-folder-selected.png";
import folderOff from "../../images/open-folder-unselected.png";
import { LanguageProvider, useLanguage } from "@/lib/language";

function HomeContent() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const { lang, setLang, t } = useLanguage();

  const loadUser = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const supabase = supabaseBrowser();

    try {
      const url = new URL(window.location.href);
      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
      const searchParams = url.searchParams;

      const code = searchParams.get("code") ?? hashParams.get("code") ?? undefined;
      const errorDescription =
        searchParams.get("error_description") ?? hashParams.get("error_description");

      if (errorDescription) {
        setAuthError(errorDescription);
        setLoadError(errorDescription);
      }

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        const cleanedUrl = `${url.origin}${url.pathname}`;
        window.history.replaceState({}, "", cleanedUrl);
      }

      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!data.user) {
        setLoadError((prev) => prev ?? "Auth session missing!");
        setUserEmail(null);
        setLoading(false);
        return;
      }
      setUserEmail(data.user.email ?? null);
    } catch (err) {
      console.error("auth handling failed", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const handleLogout = async () => {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    setUserEmail(null);
  };

  if (loading) {
    return (
      <div className="pit-page flex items-center justify-center">
        <p className="text-sm pit-muted">{t("loading")}</p>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="pit-page flex items-center justify-center">
        <div className="pit-card text-center max-w-lg w-full">
          <div className="mb-4">
            <p className="pit-title">DocFlow</p>
            <p className="pit-subtitle">
              Upload documents, extract key info, and view results.
            </p>
            {loadError && <p className="pit-error mt-2">{loadError}</p>}
          </div>
          <Link href="/login" className="pit-cta pit-cta--primary">
            Log in
          </Link>
          {loadError && (
            <button onClick={loadUser} className="pit-cta pit-cta--secondary text-xs mt-3">
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pit-page">
      <main className="pit-shell">
        <header
          className="pit-header relative flex w-full items-center justify-center px-8"
          style={{ paddingTop: "36px", paddingBottom: "18px" }}
        >
          <div
            className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center text-center"
            style={{ fontFamily: "Georgia, serif", gap: "6px" }}
          >
            <p className="pit-title" style={{ fontFamily: "inherit", margin: 0 }}>
              <span style={{ fontSize: "36px", lineHeight: 1.1 }}>DocFlow</span>
            </p>
          </div>
          <div
            className="absolute flex items-center"
            style={{ top: "calc(50% + 30px)", right: "25px", transform: "translateY(-50%)" }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={handleLogout}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleLogout();
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: "2px",
                cursor: "pointer",
                padding: "6px 0",
                color: "rgba(0,0,0,0.5)",
              }}
            >
              <span style={{ fontSize: "15px", letterSpacing: "0" }}>Log out</span>
              <span
                className="pit-subtitle"
                style={{ fontFamily: "Georgia, serif", fontSize: "12px", letterSpacing: "0" }}
              >
                {userEmail}
              </span>
            </div>
            <select
              aria-label="Language"
              value={lang}
              onChange={(e) => setLang(e.target.value as any)}
              className="ml-3 rounded-md border border-[rgba(0,0,0,0.1)] bg-white/60 px-2 py-1 text-xs"
              style={{ color: "rgba(0,0,0,0.65)" }}
            >
              <option value="de">DE</option>
              <option value="en">EN</option>
              <option value="ro">RO</option>
              <option value="tr">TR</option>
              <option value="fr">FR</option>
              <option value="es">ES</option>
              <option value="ar">AR</option>
            </select>
          </div>
        </header>

        <section className="pit-card">
          <UploadForm
            processing={processing}
            onUploaded={() => setRefreshKey((k) => k + 1)}
          />
        </section>

        <section>
          <DocumentTable
            refreshKey={refreshKey}
            mode="home"
            onProcessingChange={setProcessing}
          />
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

export default function Home() {
  return (
    <LanguageProvider>
      <HomeContent />
    </LanguageProvider>
  );
}
