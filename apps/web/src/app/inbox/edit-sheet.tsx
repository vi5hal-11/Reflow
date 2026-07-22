"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  energyTags,
  recurrenceFreqs,
  subtaskColumns,
  type EnergyTag,
  type InboxTask,
  type RecurrenceFreq,
  type Subtask,
} from "@/lib/types";
import { RECURRENCE_LABEL } from "@/lib/recurrence";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

const inputClass =
  "w-full rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

export function TaskEditSheet({
  task,
  userId,
  onClose,
  onSaved,
}: {
  task: InboxTask;
  userId: string;
  onClose: () => void;
  onSaved: (patch: Partial<InboxTask>) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [estimate, setEstimate] = useState(task.estimated_minutes?.toString() ?? "");
  const [energy, setEnergy] = useState<EnergyTag | "">(task.energy_tag ?? "");
  const [deadline, setDeadline] = useState(toLocalInput(task.deadline));
  const [recurrence, setRecurrence] = useState<RecurrenceFreq | "">(task.recurrence ?? "");
  const [remindAt, setRemindAt] = useState(toLocalInput(task.remind_at));
  const [saving, setSaving] = useState(false);

  // Subtasks — loaded on open, edited live (each change persists immediately).
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSub, setNewSub] = useState("");

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("subtasks")
        .select(subtaskColumns)
        .eq("task_id", task.id)
        .order("position", { ascending: true });
      if (alive) setSubtasks((data ?? []) as Subtask[]);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [supabase, task.id]);

  const addSub = async () => {
    const t = newSub.trim();
    if (!t) return;
    setNewSub("");
    const position = subtasks.length;
    const optimistic: Subtask = {
      id: `temp-${crypto.randomUUID()}`,
      task_id: task.id,
      title: t,
      done: false,
      position,
    };
    setSubtasks((prev) => [...prev, optimistic]);
    const { data } = await supabase
      .from("subtasks")
      .insert({ task_id: task.id, user_id: userId, title: t, position })
      .select(subtaskColumns)
      .single();
    if (data) setSubtasks((prev) => prev.map((s) => (s.id === optimistic.id ? (data as Subtask) : s)));
  };

  const toggleSub = async (s: Subtask) => {
    setSubtasks((prev) => prev.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)));
    if (!s.id.startsWith("temp-"))
      await supabase.from("subtasks").update({ done: !s.done }).eq("id", s.id);
  };

  const deleteSub = async (s: Subtask) => {
    setSubtasks((prev) => prev.filter((x) => x.id !== s.id));
    if (!s.id.startsWith("temp-")) await supabase.from("subtasks").delete().eq("id", s.id);
  };

  const save = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    const patch: Partial<InboxTask> = {
      title: t,
      estimated_minutes: estimate
        ? Math.max(1, Math.min(480, Math.round(Number(estimate))))
        : null,
      energy_tag: energy || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      recurrence: recurrence || null,
      remind_at: remindAt ? new Date(remindAt).toISOString() : null,
    };
    const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
    setSaving(false);
    if (error) {
      toast("Couldn't save — nothing lost, try again.");
      return;
    }
    onSaved(patch);
    toast("Saved.", "accent");
    onClose();
  };

  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <Sheet open onClose={onClose} title="Edit task">
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        <label className="space-y-1.5">
          <span className="text-sm text-muted">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="space-y-1.5">
            <span className="block text-sm text-muted">Estimate</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={480}
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="—"
                className={cn(inputClass, "tabular w-24")}
              />
              <span className="text-sm text-faint">min</span>
            </div>
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm text-muted">Energy</span>
          <div className="flex flex-wrap gap-2">
            {energyTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setEnergy(energy === tag ? "" : tag)}
                aria-pressed={energy === tag}
                className={cn(
                  "rounded-sm border px-3 py-1.5 text-sm capitalize transition-colors",
                  energy === tag
                    ? "border-accent bg-accent-tint text-accent-text"
                    : "border-line-strong text-muted hover:border-accent",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Subtasks */}
        <div className="space-y-2">
          <span className="text-sm text-muted">
            Checklist{subtasks.length > 0 ? ` · ${doneCount}/${subtasks.length}` : ""}
          </span>
          {subtasks.length > 0 && (
            <ul className="flex flex-col gap-1">
              {subtasks.map((s) => (
                <li key={s.id} className="group flex items-center gap-2 text-sm">
                  <button
                    onClick={() => void toggleSub(s)}
                    aria-label={s.done ? "Mark not done" : "Mark done"}
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[9px]",
                      s.done
                        ? "border-accent bg-accent text-paper"
                        : "border-line-strong text-transparent hover:border-accent",
                    )}
                  >
                    ✓
                  </button>
                  <span className={cn("flex-1 truncate", s.done && "text-faint line-through")}>
                    {s.title}
                  </span>
                  <button
                    onClick={() => void deleteSub(s)}
                    aria-label="Remove step"
                    className="text-faint opacity-0 hover:text-ink group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addSub();
              }
            }}
            placeholder="add a step, press Enter"
            className={cn(inputClass, "text-sm")}
          />
        </div>

        {/* Repeat */}
        <div className="space-y-1.5">
          <span className="text-sm text-muted">Repeat</span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setRecurrence("")}
              aria-pressed={recurrence === ""}
              className={cn(
                "rounded-sm border px-3 py-1.5 text-sm transition-colors",
                recurrence === ""
                  ? "border-accent text-ink"
                  : "border-line-strong text-muted hover:border-accent",
              )}
            >
              Never
            </button>
            {recurrenceFreqs.map((f) => (
              <button
                key={f}
                onClick={() => setRecurrence(f)}
                aria-pressed={recurrence === f}
                className={cn(
                  "rounded-sm border px-3 py-1.5 text-sm transition-colors",
                  recurrence === f
                    ? "border-accent bg-accent-tint text-accent-text"
                    : "border-line-strong text-muted hover:border-accent",
                )}
              >
                {RECURRENCE_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="space-y-1.5">
            <span className="block text-sm text-muted">Deadline</span>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={cn(inputClass, "tabular")}
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm text-muted">Remind me</span>
            <input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className={cn(inputClass, "tabular")}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
