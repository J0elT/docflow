"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useLanguage } from "@/lib/language";
import aiIcon from "../../images/ai.png";
import resetIcon from "../../images/reset.png";

const spinnerStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: "50%",
  border: "2px solid rgba(0,0,0,0.15)",
  borderTopColor: "rgba(0,0,0,0.55)",
  animation: "files-assistant-spin 0.9s linear infinite",
  display: "inline-block",
};

const linkLabel = (raw: string) => {
  try {
    const url = new URL(raw, "https://orderly.local");
    const nameParam = url.searchParams.get("name");
    if (nameParam) return nameParam;
    const last = url.pathname.split("/").filter(Boolean).pop();
    if (last) {
      const decoded = decodeURIComponent(last);
      return decoded.length > 72 ? `${decoded.slice(0, 68)}…` : decoded;
    }
    return url.hostname;
  } catch {
    return "Open link";
  }
};

const linkStyle: React.CSSProperties = {
  color: "rgba(0,0,0,0.88)",
  textDecoration: "underline dotted",
  textDecorationThickness: "2px",
  textUnderlineOffset: "5px",
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const linkify = (
  text: string,
  opts?: {
    onInternalLink?: (href: string) => void;
  }
) => {
  const normalizedText = text.replace(/\(\[link removed\](?!\))/g, "([link removed])");
  const nodes: React.ReactNode[] = [];
  const pushPlain = (plain: string, keyPrefix: string) => {
    const parts = plain.split(/(https?:\/\/\S+|\/(?:api|bundles)\/\S+)/g);
    parts.forEach((part, idx) => {
      if (!part) return;
      if (/^(https?:\/\/|\/(?:api|bundles)\/)/.test(part)) {
        let href = part;
        let trailing = "";
        while (href.length && /[).,\]]$/.test(href)) {
          trailing = href.slice(-1) + trailing;
          href = href.slice(0, -1);
        }
        const label = linkLabel(href);
        const isInternal = (() => {
          if (/^\/(?:api|bundles)\//.test(href)) return true;
          try {
            const url = new URL(href);
            if (url.host === window.location.host) return true;
          } catch {
            /* ignore */
          }
          return false;
        })();
        const onClick =
          isInternal && opts?.onInternalLink
            ? (e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault();
                opts.onInternalLink?.(href);
              }
            : undefined;
        nodes.push(
          <span key={`${keyPrefix}-frag-${idx}`}>
            <a
              href={href}
              target={isInternal ? "_self" : "_blank"}
              rel="noreferrer"
              title={href}
              style={linkStyle}
              onClick={onClick}
            >
              <span>{label}</span>
              <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
                ↗
              </span>
            </a>
            {trailing ? <span>{trailing}</span> : null}
          </span>
        );
        return;
      }
      nodes.push(<span key={`${keyPrefix}-text-${idx}`}>{part}</span>);
    });
  };

  const markdown = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let chunk = 0;
  while ((match = markdown.exec(normalizedText)) !== null) {
    const before = normalizedText.slice(lastIndex, match.index);
    if (before) pushPlain(before, `plain-${chunk}`);
    chunk += 1;

    const rawLabel = match[1] || "";
    let href = (match[2] || "").trim();
    const label = rawLabel.trim() || linkLabel(href);
    if (href && href !== "[link removed]") {
      let trailing = "";
      while (href.length && /[).,\]]$/.test(href)) {
        trailing = href.slice(-1) + trailing;
        href = href.slice(0, -1);
      }
      const isInternal = (() => {
        if (/^\/(?:api|bundles)\//.test(href)) return true;
        try {
          const url = new URL(href);
          if (url.host === window.location.host) return true;
        } catch {
          /* ignore */
        }
        return false;
      })();
      const onClick =
        isInternal && opts?.onInternalLink
          ? (e: React.MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              opts.onInternalLink?.(href);
            }
          : undefined;
      nodes.push(
        <span key={`md-${chunk}`}>
          <a
            href={href}
            target={isInternal ? "_self" : "_blank"}
            rel="noreferrer"
            title={href}
            style={linkStyle}
            onClick={onClick}
          >
            <span>{label}</span>
            <span aria-hidden style={{ fontSize: 12, lineHeight: 1 }}>
              ↗
            </span>
          </a>
          {trailing ? <span>{trailing}</span> : null}
        </span>
      );
    } else if (label) {
      nodes.push(<span key={`md-${chunk}`}>{label}</span>);
    }

    lastIndex = match.index + match[0].length;
  }
  const after = normalizedText.slice(lastIndex);
  if (after) pushPlain(after, `plain-${chunk}-tail`);
  return nodes;
};

type ChatMessage = { role: "user" | "assistant"; content: string };
type ApiMessage = { role?: string | null; content?: string | null };

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export default function FilesAssistantPanel({
  onDismiss,
  onDataChanged,
}: {
  onDismiss?: () => void;
  onDataChanged?: () => void;
}) {
  const { t, lang } = useLanguage();
  const introMessage =
    t("filesAssistantIntro") ||
    "Galaxy verschafft dir Überblick über deine Dokumente. Es kann Informationen aus mehreren Dateien zusammenführen, berechnen und ordnen. Fehlt etwas, fragt Galaxy gezielt nach.";
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: introMessage,
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    // Refresh the intro message when the UI language changes and no user input exists yet.
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].role === "assistant" && prev[0].content !== introMessage) {
        return [{ ...prev[0], content: introMessage }];
      }
      return prev;
    });
  }, [introMessage]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;
        const token = data?.session?.access_token ?? null;
        setAuthToken(token);
      } catch (err) {
        console.error(err);
        setError(t("filesAssistantLoadSessionError") || "Could not load session.");
      }
    };
    loadSession();
  }, [t]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!authToken) return;
      setLoadingHistory(true);
      try {
        const res = await fetch(`/api/files-agent?lang=${encodeURIComponent(lang)}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${authToken}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to load chat (${res.status})`);
        const data = await res.json();
        const msgs = Array.isArray(data?.messages)
          ? (data.messages as ApiMessage[]).filter(
              (m) => typeof m?.role === "string" && typeof m?.content === "string"
            )
          : [];
        if (msgs.length) {
          setMessages(msgs as ChatMessage[]);
        } else {
          setMessages([{ role: "assistant", content: introMessage }]);
        }
      } catch (err) {
        console.error(err);
        setMessages([{ role: "assistant", content: introMessage }]);
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [authToken, introMessage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  const handleInternalLink = async (href: string) => {
    let url: URL | null = null;
    try {
      url = new URL(href, window.location.origin);
    } catch {
      url = null;
    }
    if (!url) return;
    const path = url.pathname;
    if (!(path.startsWith("/bundles/download") || path.startsWith("/api/bundles/download"))) return;
    try {
      setDownloading(true);
      setError(null);
      const name = url.searchParams.get("name");
      if (!name) throw new Error("Missing bundle name.");
      const supabase = supabaseBrowser();
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const userId = sessionData?.session?.user?.id ?? null;
      if (!userId) throw new Error("Not logged in.");
      const path = `${userId}/bundles/${name}`;
      const { data: signed, error: signedErr } = await supabase.storage
        .from("documents")
        .createSignedUrl(path, 60 * 60, { download: name });
      if (signedErr || !signed?.signedUrl) throw signedErr || new Error("Download link not available.");
      window.location.assign(signed.signedUrl);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    const nextMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    if (!authToken) {
      setError(t("filesAssistantMissingSession") || "No session found. Please sign in again.");
      setSending(false);
      return;
    }
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      headers.Authorization = `Bearer ${authToken}`;
      const res = await fetch("/api/files-agent", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ messages: [userMessage], uiLang: lang }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      const assistant =
        typeof data?.assistant === "string"
          ? data.assistant
          : t("filesAssistantUnavailable") || "Assistant unavailable";
      const serverMessages = Array.isArray(data?.messages)
        ? (data.messages as ApiMessage[]).filter(
            (m) => typeof m?.role === "string" && typeof m?.content === "string"
          )
        : null;
      setMessages(
        serverMessages && serverMessages.length
          ? (serverMessages as ChatMessage[])
          : [...nextMessages, { role: "assistant", content: assistant }]
      );
      onDataChanged?.();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("docflow:data-changed"));
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : t("filesAssistantUnavailable") || "Assistant unavailable"
      );
    } finally {
      setSending(false);
    }
  };

  const clearChat = async () => {
    if (!authToken) return;
    setSending(true);
    try {
      const res = await fetch("/api/files-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        credentials: "include",
        body: JSON.stringify({ action: "clear", uiLang: lang }),
      });
      if (!res.ok) throw new Error(`Failed to clear chat (${res.status})`);
      setMessages([{ role: "assistant", content: introMessage }]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to clear chat");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[999]"
      style={{ backdropFilter: "blur(8px)", backgroundColor: "rgba(12,12,12,0.35)" }}
      onClick={() => onDismiss?.()}
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
            <div className="flex items-center gap-2 justify-between" style={{ color: "rgba(0,0,0,0.8)" }}>
              <div className="flex items-center gap-2">
                <Image src={aiIcon} alt="Galaxy" width={28} height={28} />
                <span style={{ fontFamily: "Georgia, serif", fontSize: "16px", lineHeight: 1.1, display: "inline-flex", alignItems: "center" }}>
                  Galaxy
                </span>
              </div>
              <button
                type="button"
                onClick={clearChat}
                disabled={sending || loadingHistory}
                aria-label="Reset chat"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: sending || loadingHistory ? "not-allowed" : "pointer",
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
            ref={scrollRef}
          >
            {messages.length === 0 ? (
              <p
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: "16px",
                  color: "rgba(0,0,0,0.8)",
                }}
              >
                {introMessage}
              </p>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={`${m.role}-${idx}`}
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
                    {m.role === "assistant" ? "Galaxy" : lang === "de" ? "Ich" : "Me"}
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {linkify(m.content, { onInternalLink: handleInternalLink })}
                  </div>
                </div>
              ))
            )}
            {error && (
              <p className="pit-error text-xs" style={{ fontFamily: "Inter, sans-serif" }}>
                {error}
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
                aria-label={t("filesAssistantPromptLabel") || "Assistant prompt"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-2xl bg-transparent px-4 py-3"
                placeholder={
                  t("filesAssistantPlaceholder") ||
                  "Ask about amounts, deadlines, or request a folder change…"
                }
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
                type="button"
                disabled={sending || !input.trim()}
                onClick={sendMessage}
                style={{
                  height: 40,
                  width: 40,
                  borderRadius: "999px",
                  position: "absolute",
                  right: 12,
                  bottom: 12,
                  border: "1px solid rgba(0,0,0,0.1)",
                  background: input.trim() && !sending ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.04)",
                  color: "rgba(0,0,0,0.7)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: sending || !input.trim() ? "not-allowed" : "pointer",
                }}
                aria-label={t("send") || "Send"}
              >
                {sending ? <span style={spinnerStyle} aria-hidden /> : <span style={{ fontSize: 16, lineHeight: 1 }}>↑</span>}
              </button>
            </div>
          </div>
        </div>
        <style jsx global>{`
          @keyframes files-assistant-spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
