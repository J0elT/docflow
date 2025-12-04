"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import binIcon from "../../../images/bin.png";
import uploadOn from "../../../images/upload-selected.png";
import uploadOff from "../../../images/upload-unselected.png";
import folderOn from "../../../images/open-folder-selected.png";
import folderOff from "../../../images/open-folder-unselected.png";
import checklistOn from "../../../images/checklist-selected.png";
import checklistOff from "../../../images/checklist-unselected.png";

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

export default function TasksPage() {
  const pathname = usePathname();
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
      <main className="pit-shell">
        <header className="pit-header">
          <div>
            <p className="pit-title">Tasks</p>
            <p className="pit-subtitle">Open items derived from your documents.</p>
          </div>
        </header>

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
                    <span className="pit-subtitle text-sm opacity-70">{group.docTitle}</span>
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
                        setModalDoc({ id: group.docId, title: group.docTitle });
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
                      className="rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4"
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
                            {task.due_date && <span>Due: {task.due_date}</span>}
                            {task.urgency && <span>Urgency: {task.urgency}</span>}
                          </div>
                        </div>
                        {task.status !== "done" && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => markDone(task.id)}
                              className="pit-cta pit-cta--primary text-[12px]"
                              style={{
                                width: 36,
                                height: 36,
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
                      <span className="pit-subtitle text-sm opacity-60">{group.docTitle}</span>
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
                          setModalDoc({ id: group.docId, title: group.docTitle });
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
                        className="rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4"
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
                            {task.due_date && <span>Due: {task.due_date}</span>}
                            {task.urgency && <span>Urgency: {task.urgency}</span>}
                            {task.completed_at && (
                              <span>Completed: {new Date(task.completed_at).toLocaleString()}</span>
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
            { href: "/", on: uploadOn, off: uploadOff, label: "Home" },
            { href: "/files", on: folderOn, off: folderOff, label: "Files" },
            { href: "/tasks", on: checklistOn, off: checklistOff, label: "Tasks" },
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

      {modalDoc.id !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="pit-card w-[90vw] max-w-md">
            <div className="flex items-center justify-between mb-3">
              <p className="pit-title" style={{ fontSize: "18px" }}>
                New task {modalDoc.title ? `for ${modalDoc.title}` : ""}
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
                placeholder="Task title"
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
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <button onClick={createTask} className="pit-cta pit-cta--primary">
                Create task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
