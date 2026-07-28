"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Star, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { inboxTaskColumns, taskKinds, KIND_LABEL, type InboxTask, type TaskKind } from "@/lib/types";

// The considered capture (mockup 1). The one-line omnibox stays the fast path —
// this is for when you already know what the thing is and want to place it in
// one motion. Zero fields are required here either.

const KIND_DOT: Record<TaskKind, string> = {
  task: "bg-accent",
  idea: "bg-energy-admin",
  note: "bg-energy-shallow",
};

const KIND_HINT: Record<TaskKind, string> = {
  task: "something to do — it can be planned",
  idea: "kept, never scheduled, never overdue",
  note: "kept, never scheduled, never overdue",
};

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

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CaptureSheet({
  userId,
  onClose,
  onCaptured,
}: {
  userId: string;
  onClose: () => void;
  /** Fired with the saved row so the host list can prepend it optimistically. */
  onCaptured?: (task: InboxTask) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<TaskKind>("task");
  const [planToday, setPlanToday] = useState(false);
  const [big3, setBig3] = useState(false);
  const [saving, setSaving] = useState(false);

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
      const said = event.results[0]?.[0]?.transcript?.trim();
      if (said) setText((prev) => (prev ? `${prev} ${said}` : said));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }, [listening]);

  // Big 3 only means anything on a day, so starring implies planning it today.
  const toggleBig3 = useCallback(() => {
    setBig3((on) => {
      if (!on) setPlanToday(true);
      return !on;
    });
  }, []);

  const togglePlanToday = useCallback(() => {
    setPlanToday((on) => {
      if (on) setBig3(false); // can't be a Big 3 for a day it isn't on
      return !on;
    });
  }, []);

  const schedulable = kind === "task";

  const save = useCallback(async () => {
    const raw = text.trim();
    if (!raw || saving) return;
    setSaving(true);

    const onDay = schedulable && planToday;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title: raw.slice(0, 500),
        raw_text: raw,
        kind,
        // Ideas and notes stay in the inbox forever by design — they are kept,
        // not planned, so they never age into something that looks overdue.
        status: onDay ? "todo" : "inbox",
        planned_date: onDay ? localToday() : null,
        is_big3: onDay && big3,
        source: "text",
      })
      .select(inboxTaskColumns)
      .single();

    setSaving(false);
    if (error || !data) {
      toast("Couldn't save that — nothing lost, try again.");
      return;
    }

    const saved = data as InboxTask;

    // The day's Big 3 lives in two places by design (see DECISIONS.md): the
    // per-task flag the scheduler ranks on, and the day's ordered record. Both
    // must be written or the star never shows up on Today.
    if (onDay && big3) {
      const day = localToday();
      const { data: plan } = await supabase
        .from("daily_plans")
        .select("big3_task_ids")
        .eq("plan_date", day)
        .maybeSingle();
      const existing = (plan?.big3_task_ids as string[] | null) ?? [];
      if (existing.length >= 3) {
        // Already three. Keep it on the day, just not starred — never silently
        // bump something the user chose earlier.
        await supabase.from("tasks").update({ is_big3: false }).eq("id", saved.id);
        toast("On today — your Big 3 is already full.");
        onCaptured?.(saved);
        onClose();
        return;
      }
      await supabase.from("daily_plans").upsert(
        { user_id: userId, plan_date: day, big3_task_ids: [...existing, saved.id] },
        { onConflict: "user_id,plan_date" },
      );
    }

    onCaptured?.(saved);

    // Enrichment is best-effort and only meaningful for tasks.
    if (schedulable) {
      void fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taskId: saved.id }),
      }).catch(() => {});
    }

    toast(onDay ? "Landed on today." : "Captured.", "accent");
    onClose();
  }, [text, saving, schedulable, planToday, supabase, userId, kind, big3, toast, onCaptured, onClose]);

  const rowClass =
    "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors";

  return (
    <Sheet open onClose={onClose} title="New capture">
      <div className="flex flex-col gap-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter saves without reaching for the button.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
          autoFocus
          rows={4}
          placeholder={listening ? "listening…" : "What's on your mind? Let it land here…"}
          className="w-full resize-none rounded-lg border border-line bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
        />

        <div className="space-y-1.5">
          <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
            Type
          </span>
          <div className="flex flex-wrap gap-2">
            {taskKinds.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  "press flex items-center gap-2 rounded-pill border px-3.5 py-1.5 text-sm transition-colors",
                  kind === k
                    ? "border-accent bg-accent-tint text-ink"
                    : "border-line text-muted hover:border-accent",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", KIND_DOT[k])} aria-hidden />
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <span className="block text-[11px] text-faint">{KIND_HINT[kind]}</span>
        </div>

        {/* Placement — only tasks can land on a day. */}
        {schedulable && (
          <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            <button
              onClick={togglePlanToday}
              aria-pressed={planToday}
              className={cn(rowClass, planToday ? "bg-accent-tint" : "hover:bg-accent-tint/40")}
            >
              <Sun
                className={cn("h-4 w-4 shrink-0", planToday ? "text-accent" : "text-faint")}
                aria-hidden
              />
              <span className={planToday ? "text-ink" : "text-muted"}>Plan it for today</span>
              {planToday && <span className="ml-auto text-xs text-accent-text">on today</span>}
            </button>
            <button
              onClick={toggleBig3}
              aria-pressed={big3}
              className={cn(rowClass, big3 ? "bg-accent-tint" : "hover:bg-accent-tint/40")}
            >
              <Star
                className={cn("h-4 w-4 shrink-0", big3 ? "text-accent" : "text-faint")}
                aria-hidden
              />
              <span className={big3 ? "text-ink" : "text-muted"}>Add to Big 3 for today</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          {voiceSupported && (
            <button
              onClick={startVoice}
              aria-label={listening ? "Stop listening" : "Capture by voice"}
              className={cn(
                "press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line transition-colors",
                listening ? "animate-pulse border-accent text-accent" : "text-muted hover:border-accent",
              )}
            >
              <Mic className="h-4 w-4" aria-hidden />
            </button>
          )}
          <button
            onClick={() => void save()}
            disabled={!text.trim() || saving}
            className="press flex h-11 flex-1 items-center justify-center gap-2 rounded-pill border border-accent-strong bg-accent text-sm font-medium text-paper shadow-[var(--shadow-soft)] transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden />
            {saving ? "Saving…" : "Save & settle"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
