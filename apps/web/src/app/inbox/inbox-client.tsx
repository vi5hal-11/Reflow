"use client";

import Link from "next/link";
import { Mic } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { inboxTaskColumns, type InboxTask } from "@/lib/types";
import { signOut } from "../login/actions";
import { TaskEditSheet } from "./edit-sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { CommandBar } from "@/components/command/command-trigger";
import { Button } from "@/components/ui/button";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Minimal surface of the (webkit-prefixed) Web Speech API — free, on-device
// or browser-provided, no server round-trip. Voice capture is progressive
// enhancement: unsupported browsers simply never see the mic.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function chip(text: string) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted dark:border-line">
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
  const [editing, setEditing] = useState<InboxTask | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [undoState, setUndoState] = useState<{
    label: string;
    fate: "today" | "later" | "drop";
    snapshots: InboxTask[];
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const togglePick = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    async (raw: string, source: "text" | "voice" = "text") => {
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
          source,
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

  // Bulk triage the selected items, with a single-level Undo (§8 speed +
  // forgiveness — every destructive action is reversible).
  const bulkTriage = useCallback(
    async (fate: "today" | "later" | "drop") => {
      const snapshots = tasks.filter(
        (t) => picked.has(t.id) && !t.id.startsWith("temp-"),
      );
      if (snapshots.length === 0) {
        setPicked(new Set());
        return;
      }
      const ids = snapshots.map((s) => s.id);
      setTasks((prev) => prev.filter((t) => !picked.has(t.id)));
      setPicked(new Set());

      if (fate === "drop") {
        await supabase.from("tasks").delete().in("id", ids);
      } else {
        const planned = fate === "today" ? localToday() : null;
        await supabase
          .from("tasks")
          .update({ status: "todo", planned_date: planned })
          .in("id", ids);
        if (fate === "today") setTodayCount((n) => n + snapshots.length);
        else setLaterCount((n) => n + snapshots.length);
      }

      const label =
        fate === "drop"
          ? `${snapshots.length} dropped`
          : `${snapshots.length} moved to ${fate}`;
      setUndoState({ label, fate, snapshots });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndoState(null), 6000);
    },
    [tasks, picked, supabase],
  );

  const doUndo = useCallback(async () => {
    const st = undoState;
    if (!st) return;
    setUndoState(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setTasks((prev) => [...st.snapshots, ...prev]);
    if (st.fate === "today") setTodayCount((n) => Math.max(0, n - st.snapshots.length));
    if (st.fate === "later") setLaterCount((n) => Math.max(0, n - st.snapshots.length));
    // Restore to inbox (re-inserts a dropped row with its original id;
    // reverts a today/later row's status/date).
    await supabase.from("tasks").upsert(
      st.snapshots.map((t) => ({
        id: t.id,
        user_id: userId,
        title: t.title,
        raw_text: t.raw_text,
        status: "inbox" as const,
        estimated_minutes: t.estimated_minutes,
        energy_tag: t.energy_tag,
        deadline: t.deadline,
        planned_date: null,
        source: "text" as const,
      })),
      { onConflict: "id" },
    );
  }, [undoState, supabase, userId]);

  // Voice capture (§6): browser speech recognition → straight into the inbox
  // with source='voice'. Never blocks; never required.
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const w = window as unknown as SpeechWindow;
      setVoiceSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const startVoice = useCallback(() => {
    const w = window as unknown as SpeechWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) void capture(transcript, "voice");
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }, [listening, capture]);

  // Anti-graveyard (§6): items that sat for a week resurface in their own
  // gentle section below the fresh ones — keep, schedule, or drop.
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const nowMs = new Date().getTime();
  const firstOldIndex = tasks.findIndex(
    (t) => nowMs - new Date(t.created_at).getTime() >= WEEK_MS,
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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-12 pb-28 sm:pb-12">
      <header className="flex items-baseline justify-between">
        <div>
          <Link href="/" className="text-sm text-faint">
            Reflow
          </Link>
          <h1 className="text-2xl font-medium tracking-tight">Inbox</h1>
        </div>
        <div className="flex items-center gap-3 text-xs text-faint">
          <span>
            {todayCount} for today · {laterCount} for later
          </span>
          <Link href="/today" className="hidden underline underline-offset-4 sm:inline">
            today
          </Link>
          <Link href="/settings" className="hidden underline underline-offset-4 sm:inline">
            settings
          </Link>
          <form action={signOut}>
            <button className="underline underline-offset-4">sign out</button>
          </form>
        </div>
      </header>

      <form
        className="relative"
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
          placeholder={
            listening
              ? "listening…"
              : "Dump anything — press / to focus, Enter to capture"
          }
          className={cn(
            "w-full rounded-lg border border-line-strong bg-transparent px-4 py-3 text-base outline-none placeholder:text-faint focus:border-line-strong dark:border-line-strong",
            voiceSupported && "pr-11",
          )}
        />
        {voiceSupported && (
          <button
            type="button"
            onClick={startVoice}
            aria-label={listening ? "Stop listening" : "Capture by voice"}
            title={listening ? "Stop listening" : "Capture by voice"}
            className={cn(
              "absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-2",
              listening
                ? "animate-pulse text-ink dark:text-ink"
                : "text-faint hover:text-muted dark:hover:text-faint",
            )}
          >
            <Mic className="h-4 w-4" />
          </button>
        )}
      </form>

      <CommandBar />

      {tasks.length === 0 ? (
        <EmptyState
          title="Inbox clear. Nice."
          hint="You're caught up — go do the day."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task, i) => (
            <Fragment key={task.id}>
            {i === firstOldIndex && (
              <li
                aria-hidden
                className="pt-3 text-[11px] text-faint"
              >
                from a while back — keep, schedule, or drop?
              </li>
            )}
            <li
              onClick={() => setSelected(i)}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors",
                picked.has(task.id)
                  ? "border-accent bg-accent-tint/40"
                  : i === selected
                    ? "border-accent"
                    : "border-line",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!task.id.startsWith("temp-")) togglePick(task.id);
                  }}
                  aria-label={picked.has(task.id) ? "Deselect" : "Select"}
                  aria-pressed={picked.has(task.id)}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border text-[10px] transition-colors",
                    picked.has(task.id)
                      ? "border-accent bg-accent text-paper"
                      : "border-line-strong text-transparent hover:border-accent",
                  )}
                >
                  ✓
                </button>
                <div className="min-w-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!task.id.startsWith("temp-")) setEditing(task);
                  }}
                  className="block max-w-full truncate text-left hover:text-accent-text"
                >
                  {task.title}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {parsing.has(task.id) && (
                    <span className="text-xs text-faint">thinking…</span>
                  )}
                  {task.estimated_minutes !== null && chip(`${task.estimated_minutes}m`)}
                  {task.energy_tag && chip(task.energy_tag)}
                  {task.deadline &&
                    chip(`due ${new Date(task.deadline).toLocaleDateString()}`)}
                  {task.parse_suggestions?.suggested_project &&
                    chip(`# ${task.parse_suggestions.suggested_project}`)}
                  {nowMs - new Date(task.created_at).getTime() >= WEEK_MS &&
                    chip(
                      `${Math.floor((nowMs - new Date(task.created_at).getTime()) / 86_400_000)}d here`,
                    )}
                </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-1 text-xs">
                <button
                  onClick={() => void triage(task, "today")}
                  className="rounded-md bg-accent px-2.5 py-1.5 font-medium text-paper hover:bg-accent-strong dark:bg-accent dark:text-paper dark:hover:bg-accent-strong"
                >
                  Today
                </button>
                <button
                  onClick={() => void triage(task, "later")}
                  className="rounded-md border border-line-strong px-2.5 py-1.5 hover:border-line-strong dark:border-line-strong"
                >
                  Later
                </button>
                <button
                  onClick={() => void triage(task, "drop")}
                  aria-label="Drop"
                  className="rounded-md px-2 py-1.5 text-faint hover:text-ink dark:hover:text-faint"
                >
                  ✕
                </button>
              </div>
            </li>
            </Fragment>
          ))}
        </ul>
      )}

      <p className="mt-auto text-center text-xs text-faint dark:text-faint">
        / capture · j/k move · t today · l later · x drop · export:{" "}
        <a href="/api/export?format=json" className="underline underline-offset-2">
          json
        </a>{" "}
        ·{" "}
        <a href="/api/export?format=ical" className="underline underline-offset-2">
          ical
        </a>
      </p>

      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex justify-center px-4 sm:bottom-6">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-sm">
            <span className="text-muted">{picked.size} selected</span>
            <Button size="sm" onClick={() => void bulkTriage("today")}>
              Today
            </Button>
            <Button size="sm" variant="quiet" onClick={() => void bulkTriage("later")}>
              Later
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void bulkTriage("drop")}>
              Drop
            </Button>
            <button
              onClick={() => setPicked(new Set())}
              aria-label="Clear selection"
              className="ml-1 rounded-sm px-1 text-faint hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {undoState && picked.size === 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex justify-center px-4 sm:bottom-6">
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2 text-sm shadow-sm">
            <span className="text-muted">{undoState.label}</span>
            <button
              onClick={() => void doUndo()}
              className="font-medium text-accent-text underline underline-offset-4"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {editing && (
        <TaskEditSheet
          task={editing}
          onClose={() => setEditing(null)}
          onSaved={(patch) => patchTask(editing.id, patch)}
        />
      )}
    </main>
  );
}
