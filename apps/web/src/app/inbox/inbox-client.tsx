"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { inboxTaskColumns, type InboxTask } from "@/lib/types";
import { signOut } from "../login/actions";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function chip(text: string) {
  return (
    <span className="rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-800">
      {text}
    </span>
  );
}

export function InboxClient({
  userId,
  initialTasks,
  initialTodayCount,
  initialLaterCount,
}: {
  userId: string;
  initialTasks: InboxTask[];
  initialTodayCount: number;
  initialLaterCount: number;
}) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<InboxTask[]>(initialTasks);
  const [todayCount, setTodayCount] = useState(initialTodayCount);
  const [laterCount, setLaterCount] = useState(initialLaterCount);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState(0);
  const [parsing, setParsing] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const patchTask = useCallback((id: string, patch: Partial<InboxTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const enrich = useCallback(
    async (taskId: string) => {
      setParsing((prev) => new Set(prev).add(taskId));
      try {
        const res = await fetch("/api/parse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ taskId }),
        });
        const data = await res.json().catch(() => null);
        if (data?.applied && data.task) {
          patchTask(taskId, data.task as Partial<InboxTask>);
        }
      } catch {
        // Enrichment is best-effort; the raw capture stands.
      } finally {
        setParsing((prev) => {
          const next = new Set(prev);
          next.delete(taskId);
          return next;
        });
      }
    },
    [patchTask],
  );

  const capture = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setText("");
      // Optimistic: the item exists before any network round-trip.
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: InboxTask = {
        id: tempId,
        title: trimmed,
        status: "inbox",
        raw_text: trimmed,
        estimated_minutes: null,
        energy_tag: null,
        deadline: null,
        planned_date: null,
        parse_suggestions: null,
        parsed_at: null,
        created_at: new Date().toISOString(),
      };
      setTasks((prev) => [optimistic, ...prev]);
      setSelected(0);

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          title: trimmed,
          raw_text: trimmed,
          status: "inbox",
          source: "text",
        })
        .select(inboxTaskColumns)
        .single();

      if (error || !data) {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        setText(trimmed);
        return;
      }
      const saved = data as InboxTask;
      setTasks((prev) => prev.map((t) => (t.id === tempId ? saved : t)));
      void enrich(saved.id);
    },
    [supabase, userId, enrich],
  );

  const triage = useCallback(
    async (task: InboxTask, fate: "today" | "later" | "drop") => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setSelected((s) => Math.max(0, Math.min(s, tasks.length - 2)));
      if (task.id.startsWith("temp-")) return;

      if (fate === "drop") {
        const { error } = await supabase.from("tasks").delete().eq("id", task.id);
        if (error) setTasks((prev) => [task, ...prev]);
        return;
      }
      const planned = fate === "today" ? localToday() : null;
      const { error } = await supabase
        .from("tasks")
        .update({ status: "todo", planned_date: planned })
        .eq("id", task.id);
      if (error) {
        setTasks((prev) => [task, ...prev]);
        return;
      }
      if (fate === "today") setTodayCount((n) => n + 1);
      else setLaterCount((n) => n + 1);
    },
    [supabase, tasks.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inOmnibox = document.activeElement === inputRef.current;
      if (e.key === "/" && !inOmnibox) {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (inOmnibox || tasks.length === 0) return;
      const current = tasks[Math.min(selected, tasks.length - 1)];
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          setSelected((s) => Math.min(s + 1, tasks.length - 1));
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          setSelected((s) => Math.max(s - 1, 0));
          break;
        case "t":
          void triage(current, "today");
          break;
        case "l":
          void triage(current, "later");
          break;
        case "x":
          void triage(current, "drop");
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tasks, selected, triage]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <Link href="/" className="text-sm text-neutral-400">
            Reflow
          </Link>
          <h1 className="text-2xl font-medium tracking-tight">Inbox</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span>
            {todayCount} for today · {laterCount} for later
          </span>
          <Link href="/today" className="underline underline-offset-4">
            today
          </Link>
          <form action={signOut}>
            <button className="underline underline-offset-4">sign out</button>
          </form>
        </div>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void capture(text);
        }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder="Dump anything — press / to focus, Enter to capture"
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-4 py-3 text-base outline-none placeholder:text-neutral-400 focus:border-neutral-500 dark:border-neutral-700"
        />
      </form>

      {tasks.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-400">
          Inbox zero. Nothing waiting on you here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task, i) => (
            <li
              key={task.id}
              onClick={() => setSelected(i)}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
                i === selected
                  ? "border-neutral-400 dark:border-neutral-500"
                  : "border-neutral-200 dark:border-neutral-800",
              )}
            >
              <div className="min-w-0">
                <p className="truncate">{task.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {parsing.has(task.id) && (
                    <span className="text-xs text-neutral-400">thinking…</span>
                  )}
                  {task.estimated_minutes !== null && chip(`${task.estimated_minutes}m`)}
                  {task.energy_tag && chip(task.energy_tag)}
                  {task.deadline &&
                    chip(`due ${new Date(task.deadline).toLocaleDateString()}`)}
                  {task.parse_suggestions?.suggested_project &&
                    chip(`# ${task.parse_suggestions.suggested_project}`)}
                </div>
              </div>
              <div className="flex shrink-0 gap-1 text-xs">
                <button
                  onClick={() => void triage(task, "today")}
                  className="rounded-md bg-neutral-900 px-2.5 py-1.5 font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
                >
                  Today
                </button>
                <button
                  onClick={() => void triage(task, "later")}
                  className="rounded-md border border-neutral-300 px-2.5 py-1.5 hover:border-neutral-500 dark:border-neutral-700"
                >
                  Later
                </button>
                <button
                  onClick={() => void triage(task, "drop")}
                  aria-label="Drop"
                  className="rounded-md px-2 py-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-auto text-center text-xs text-neutral-300 dark:text-neutral-600">
        / capture · j/k move · t today · l later · x drop
      </p>
    </main>
  );
}
