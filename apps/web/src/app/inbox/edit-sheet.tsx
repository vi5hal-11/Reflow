"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { energyTags, type EnergyTag, type InboxTask } from "@/lib/types";

// datetime-local <-> ISO, in the browser's local zone.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

const inputClass =
  "w-full rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent";

// Edit a captured task — the accept/override half of §6. Scoped to the fields
// the parser fills (title, estimate, energy, deadline); an inbox item has no
// notes/priority/fixed yet, those belong to the day view.
export function TaskEditSheet({
  task,
  onClose,
  onSaved,
}: {
  task: InboxTask;
  onClose: () => void;
  onSaved: (patch: Partial<InboxTask>) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [estimate, setEstimate] = useState(task.estimated_minutes?.toString() ?? "");
  const [energy, setEnergy] = useState<EnergyTag | "">(task.energy_tag ?? "");
  const [deadline, setDeadline] = useState(toLocalInput(task.deadline));
  const [saving, setSaving] = useState(false);

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

  return (
    <Sheet open onClose={onClose} title="Edit task">
      <div className="flex flex-col gap-4">
        <label className="space-y-1.5">
          <span className="text-sm text-muted">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>

        <div className="flex gap-4">
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

        <label className="space-y-1.5">
          <span className="text-sm text-muted">Deadline</span>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={cn(inputClass, "tabular")}
          />
        </label>

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
