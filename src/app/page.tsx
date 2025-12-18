"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import DocumentTable from "@/components/DocumentTable";
import UploadForm from "@/components/UploadForm";
import FilesAssistantPanel from "@/components/FilesAssistantPanel";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import uploadOn from "../../images/paper-plane-2.png";
import uploadOff from "../../images/paper-plane.png";
import folderOn from "../../images/open-folder-selected.png";
import folderOff from "../../images/open-folder-unselected.png";
import plusIcon from "../../images/plus.png";
import aiIcon from "../../images/ai.png";
import userIcon from "../../images/user.png";
import { LanguageProvider, useLanguage } from "@/lib/language";

function HomeContent() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [, setAuthError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
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
        <p className="text-sm pit-muted">Loading…</p>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="pit-page flex items-center justify-center">
        <div className="pit-card text-center max-w-lg w-full">
          <div className="mb-4">
            <p className="pit-title">Orderly</p>
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
      <main
        className="pit-shell"
        // Extra bottom padding so content clears the bottom nav / FAB cluster
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 180px)" }}
      >
        <header
          className="pit-header relative flex w-full items-center justify-center px-6"
          style={{ paddingTop: "24px", paddingBottom: "24px" }}
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
                style={{
                  display: "block",
                  opacity: 0.92,
                }}
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
              <Image
                src={userIcon}
                alt="Profile"
                width={26}
                height={26}
                style={{ opacity: 0.92 }}
              />
            </button>
          </div>
        </header>

        {profileOpen && (
          <div
            className="fixed inset-0 z-[1001]"
            style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(245,240,232,0.6)" }}
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
              <div className="px-4 py-3">
                <div className="flex items-center justify-between pb-3">
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
                <div className="border-t border-[rgba(0,0,0,0.1)] pt-3 pb-4">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="pit-cta pit-cta--secondary w-full"
                    style={{
                      letterSpacing: "0.08em",
                      fontSize: "13px",
                      textTransform: "uppercase",
                    }}
                  >
                    {t("logout") || "Log out"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <section>
          <DocumentTable
            refreshKey={refreshKey}
            mode="home"
            onProcessingChange={setProcessing}
          />
        </section>
        <div
          aria-hidden
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
        >
          <UploadForm
            hideDropZone
            processing={processing}
            onUploaded={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </main>
      <nav
        className="fixed left-0 right-0 bottom-0 z-50 border-t"
        style={{
          background: "rgb(234,229,215)",
          borderColor: "rgba(0,0,0,0.2)",
          backdropFilter: profileOpen ? "blur(6px)" : "none",
          filter: profileOpen ? "blur(2px)" : "none",
          opacity: profileOpen ? 0.65 : 1,
          pointerEvents: profileOpen ? "none" : "auto",
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
      {assistantOpen && (
        <div
          className="fixed inset-0 z-[999]"
          style={{ backdropFilter: "blur(6px)", backgroundColor: "rgba(245,240,232,0.5)" }}
          onClick={() => setAssistantOpen(false)}
        >
          <FilesAssistantPanel
            onDismiss={() => setAssistantOpen(false)}
            onDataChanged={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      )}
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
