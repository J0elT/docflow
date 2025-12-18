"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import UploadForm from "@/components/UploadForm";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import binIcon from "../../../images/bin.png";
import uploadOn from "../../../images/paper-plane-2.png";
import uploadOff from "../../../images/paper-plane.png";
import folderOn from "../../../images/open-folder-selected.png";
import folderOff from "../../../images/open-folder-unselected.png";
import plusIcon from "../../../images/plus.png";
import checklistOn from "../../../images/paper-plane-2.png";
import checklistOff from "../../../images/paper-plane.png";
import { LanguageProvider, useLanguage } from "@/lib/language";
import aiIcon from "../../../images/ai.png";
import userIcon from "../../../images/user.png";
import FilesAssistantPanel from "@/components/FilesAssistantPanel";
import { formatDateYmdMon, replaceIsoDatesInText } from "@/lib/dateFormat";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  urgency: string;
  document_id: string | null;
  created_at: string;
  completed_at: string | null;
};

type TaskWithDoc = TaskRow & { documents?: { id: string; title: string } | null };

function TasksPageInner() {
  const pathname = usePathname();
  const [composerOpen, setComposerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskWithDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [modalDoc, setModalDoc] = useState<{ id: string | null; title: string }>({
    id: null,
    title: "",
  });
  const [newTask, setNewTask] = useState<{ title: string; due_date: string; urgency: string }>({
    title: "",
    due_date: "",
    urgency: "normal",
  });
  const { lang, setLang, t } = useLanguage();
  const [assistantOpen, setAssistantOpen] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    setError(null);
    const timeout = setTimeout(() => {
      setError((prev) => prev ?? "Taking too long to load tasks. Please retry.");
      setLoading(false);
    }, 6000);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in.");
      setUserEmail(user.email ?? null);
      setUserEmail(user.email ?? null);

      const { data, error: fetchError } = await supabase
        .from("tasks")
        .select(
          "id, title, description, due_date, status, urgency, document_id, created_at, completed_at, documents(id, title)"
        )
        .eq("user_id", user.id)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      type TaskWithDocResult = TaskRow & {
        documents?: { id?: string; title?: string }[] | { id?: string; title?: string } | null;
      };
      const mapped: TaskWithDoc[] = (data ?? []).map((t) => {
        const withDoc = t as TaskWithDocResult;
        const docSource = Array.isArray(withDoc.documents)
          ? withDoc.documents[0]
          : withDoc.documents;
        const doc =
          docSource && typeof docSource.id === "string" && typeof docSource.title === "string"
            ? { id: docSource.id, title: docSource.title }
            : null;
        return { ...(withDoc as TaskRow), documents: doc };
      });
      setTasks(mapped);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

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

  const markDone = async (taskId: string) => {
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
      fetchTasks();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
      fetchTasks();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete task");
    }
  };

  const createTask = async () => {
    if (!newTask.title.trim()) {
      alert("Task title required");
      return;
    }
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Not logged in.");

      await supabase.from("tasks").insert({
        user_id: user.id,
        document_id: modalDoc.id,
        title: newTask.title.trim(),
        due_date: newTask.due_date || null,
        urgency: newTask.urgency || "normal",
        status: "open",
      });
      setModalDoc({ id: null, title: "" });
      setNewTask({ title: "", due_date: "", urgency: "normal" });
      fetchTasks();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to create task");
    }
  };

  const groupTasks = (items: TaskWithDoc[]) => {
    const groups = new Map<
      string,
      { docTitle: string; docId: string | null; tasks: TaskWithDoc[] }
    >();
    items.forEach((t) => {
      const key = t.document_id || "no-doc";
      const docTitle =
        t.documents?.title ||
        (t.document_id ? "Document" : "No document");
      if (!groups.has(key)) {
        groups.set(key, { docTitle, docId: t.document_id, tasks: [] });
      }
      groups.get(key)!.tasks.push(t);
    });
    return Array.from(groups.values()).map((g) => ({
      ...g,
      tasks: g.tasks.sort((a, b) =>
        (a.due_date || "").localeCompare(b.due_date || "")
      ),
    }));
  };

  const openGroups = groupTasks(tasks.filter((t) => t.status !== "done"));
  const doneGroups = groupTasks(tasks.filter((t) => t.status === "done"));

  return (
    <div className="pit-page">
      <main
        className="pit-shell"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        <header
          className="pit-header relative flex w-full items-center justify-center px-8"
          style={{ paddingTop: "32px", paddingBottom: "12px" }}
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
            style={{ fontFamily: "Georgia, serif", gap: "4px" }}
          >
            <p className="pit-title" style={{ fontFamily: "inherit", margin: 0 }}>
              <span style={{ fontSize: "30px", lineHeight: 1.1 }}>Orderly</span>
            </p>
            <p className="pit-subtitle text-sm" style={{ color: "rgba(0,0,0,0.6)" }}>
              Tasks
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

        <section className="pit-card">
          {error && <p className="pit-error mb-3">{error}</p>}
          {loading ? (
            <p className="pit-muted">Loading...</p>
          ) : tasks.length === 0 ? (
            <p className="pit-muted">No tasks yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {openGroups.map((group) => (
                <div key={group.docId ?? "no-doc"} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                      <span className="pit-subtitle text-sm opacity-70">
                        {replaceIsoDatesInText(group.docTitle, lang) ?? group.docTitle}
                      </span>
                    <button
                      className="pit-cta pit-cta--secondary text-[12px]"
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 9999,
                        padding: 0,
                        lineHeight: 1,
                        justifyContent: "center",
                      }}
                      onClick={() => {
                        setModalDoc({
                          id: group.docId,
                          title: replaceIsoDatesInText(group.docTitle, lang) ?? group.docTitle,
                        });
                        setNewTask({ title: "", due_date: "", urgency: "normal" });
                      }}
                      aria-label="Add task"
                    >
                      +
                    </button>
                  </div>
                  {group.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="pit-radius-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="pit-title" style={{ fontSize: "16px" }}>
                            {task.title}
                          </span>
                          {task.description ? (
                            <span className="pit-subtitle">{task.description}</span>
                          ) : null}
                          <div className="flex flex-wrap gap-2 text-xs pit-muted">
                            <span>Status: {task.status}</span>
                            {task.due_date && (
                              <span>Due: {formatDateYmdMon(task.due_date, lang) ?? task.due_date}</span>
                            )}
                            {task.urgency && <span>Urgency: {task.urgency}</span>}
                          </div>
                        </div>
                        {task.status !== "done" && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => markDone(task.id)}
                              className="pit-cta pit-cta--primary text-[12px]"
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 9999,
                                padding: 0,
                                lineHeight: 1,
                                justifyContent: "center",
                              }}
                              aria-label="Mark done"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="pit-cta pit-cta--secondary text-[12px]"
                              style={{
                                borderColor: "rgba(226,76,75,0.4)",
                                color: "#e24c4b",
                                width: 36,
                                height: 36,
                                borderRadius: 9999,
                                padding: 0,
                                lineHeight: 1,
                                justifyContent: "center",
                              }}
                              aria-label="Delete task"
                            >
                              <Image src={binIcon} alt="Delete task" width={16} height={16} />
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                ))}
                </div>
              ))}

              <div className="mt-2">
                <button
                  onClick={() => setShowDone((v) => !v)}
                  className="pit-cta pit-cta--secondary text-[11px]"
                >
                  {showDone ? "Hide done" : "Show done"} (
                  {tasks.filter((t) => t.status === "done").length})
                </button>
              </div>

              {showDone &&
                doneGroups.map((group) => (
                  <div key={`done-${group.docId ?? "no-doc"}`} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="pit-subtitle text-sm opacity-60">
                        {replaceIsoDatesInText(group.docTitle, lang) ?? group.docTitle}
                      </span>
                      <button
                        className="pit-cta pit-cta--secondary text-[12px]"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9999,
                          padding: 0,
                          lineHeight: 1,
                          justifyContent: "center",
                        }}
                        onClick={() => {
                          setModalDoc({
                            id: group.docId,
                            title: replaceIsoDatesInText(group.docTitle, lang) ?? group.docTitle,
                          });
                          setNewTask({ title: "", due_date: "", urgency: "normal" });
                        }}
                        aria-label="Add task"
                      >
                        +
                      </button>
                    </div>
                    {group.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="pit-radius-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4"
                        style={{ opacity: 0.5 }}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="pit-title" style={{ fontSize: "16px" }}>
                            {task.title}
                          </span>
                          {task.description ? (
                            <span className="pit-subtitle">{task.description}</span>
                          ) : null}
                          <div className="flex flex-wrap gap-2 text-xs pit-muted">
                            <span>Status: {task.status}</span>
                            {task.due_date && (
                              <span>Due: {formatDateYmdMon(task.due_date, lang) ?? task.due_date}</span>
                            )}
                            {task.urgency && <span>Urgency: {task.urgency}</span>}
                            {task.completed_at && (
                              <span>
                                Completed:{" "}
                                {formatDateYmdMon(task.completed_at, lang) ??
                                  (replaceIsoDatesInText(task.completed_at, lang) ?? task.completed_at)}
                              </span>
                            )}
                          </div>
                          <div className="flex justify-end">
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="pit-cta pit-cta--secondary text-[11px]"
                              style={{ borderColor: "rgba(226,76,75,0.4)", color: "#e24c4b" }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </section>
      </main>
      <div
        aria-hidden
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      >
        <UploadForm
          hideDropZone
          processing={false}
          onUploaded={() => {
            void fetchTasks();
          }}
        />
      </div>
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
              aria-label="Home"
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
              <Image src={pathname === "/" ? uploadOn : uploadOff} alt="Home" width={56} height={56} />
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
              aria-label="Upload"
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
                alt="Upload"
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
              aria-label="Files"
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
              <Image src={pathname === "/files" ? folderOn : folderOff} alt="Files" width={56} height={56} />
            </Link>
          </div>
        </div>
      </nav>

      {assistantOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ backdropFilter: "blur(10px)", backgroundColor: "rgba(0,0,0,0.1)" }}
          onClick={() => setAssistantOpen(false)}
        >
          <div
            className="absolute left-1/2 top-1/2 w-[90vw] max-w-[720px] -translate-x-1/2 -translate-y-1/2 pit-radius-xl pit-shadow-2 border border-[rgba(0,0,0,0.12)] bg-white/95 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <FilesAssistantPanel />
          </div>
        </div>
      )}

      {modalDoc.id !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="pit-card w-[90vw] max-w-md">
              <div className="flex items-center justify-between mb-3">
                <p className="pit-title" style={{ fontSize: "18px" }}>
                {t("newTaskTitle")} {modalDoc.title ? `(${modalDoc.title})` : ""}
                </p>
                <button
                  onClick={() => {
                    setModalDoc({ id: null, title: "" });
                    setNewTask({ title: "", due_date: "", urgency: "normal" });
                }}
                className="pit-cta pit-cta--secondary text-xs"
              >
                Close
              </button>
              </div>
              <div className="flex flex-col gap-3">
                <input
                  className="pit-input"
                  placeholder={t("taskPlaceholder")}
                  value={newTask.title}
                  onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                />
                <input
                  className="pit-input"
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask((prev) => ({ ...prev, due_date: e.target.value }))}
                />
                <select
                  className="pit-input"
                  value={newTask.urgency}
                  onChange={(e) => setNewTask((prev) => ({ ...prev, urgency: e.target.value }))}
                >
                  <option value="low">{t("low")}</option>
                  <option value="normal">{t("normal")}</option>
                  <option value="high">{t("high")}</option>
                </select>
                <button onClick={createTask} className="pit-cta pit-cta--primary">
                  {t("addTask")}
                </button>
              </div>
            </div>
          </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <LanguageProvider>
      <TasksPageInner />
    </LanguageProvider>
  );
}
