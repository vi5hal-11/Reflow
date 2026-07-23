"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PROJECT_COLORS, DEFAULT_PROJECT_COLOR, projectColor } from "@/lib/projects";
import { type Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectDot } from "@/components/ui/project-dot";
import { SunHorizon } from "@/components/ui/sun-horizon";
import { useToast } from "@/components/ui/toast";

function Swatches({
  value,
  onPick,
  label,
}: {
  value: string;
  onPick: (hex: string) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {PROJECT_COLORS.map((c) => {
        const active = projectColor(value) === c.hex;
        return (
          <button
            key={c.hex}
            role="radio"
            aria-checked={active}
            aria-label={c.name}
            title={c.name}
            onClick={() => onPick(c.hex)}
            className={cn(
              "h-6 w-6 rounded-full border transition-transform",
              active ? "border-ink scale-110" : "border-line hover:scale-105",
            )}
            style={{ backgroundColor: c.hex }}
          />
        );
      })}
    </div>
  );
}

export function ProjectsClient({
  userId,
  initialProjects,
  openCounts,
}: {
  userId: string;
  initialProjects: Project[];
  openCounts: Record<string, number>;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_PROJECT_COLOR);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const patch = useCallback((id: string, p: Partial<Project>) => {
    setProjects((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  const create = useCallback(async () => {
    const n = name.trim();
    if (!n || creating) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: userId, name: n, color })
      .select("id, name, color, archived, created_at")
      .single();
    setCreating(false);
    if (error || !data) {
      toast("Couldn't create that project — try again.");
      return;
    }
    setProjects((prev) => [...prev, data as Project]);
    setName("");
    setColor(DEFAULT_PROJECT_COLOR);
    toast("Project created.", "accent");
  }, [name, color, creating, supabase, toast, userId]);

  const rename = useCallback(
    async (project: Project) => {
      const n = editName.trim();
      setEditingId(null);
      if (!n || n === project.name) return;
      const prev = project.name;
      patch(project.id, { name: n });
      const { error } = await supabase.from("projects").update({ name: n }).eq("id", project.id);
      if (error) {
        patch(project.id, { name: prev });
        toast("Couldn't rename — nothing lost, try again.");
      }
    },
    [editName, patch, supabase, toast],
  );

  const recolor = useCallback(
    async (project: Project, hex: string) => {
      const prev = project.color;
      patch(project.id, { color: hex });
      const { error } = await supabase.from("projects").update({ color: hex }).eq("id", project.id);
      if (error) patch(project.id, { color: prev });
    },
    [patch, supabase],
  );

  const setArchived = useCallback(
    async (project: Project, archived: boolean) => {
      patch(project.id, { archived });
      const { error } = await supabase
        .from("projects")
        .update({ archived })
        .eq("id", project.id);
      if (error) {
        patch(project.id, { archived: !archived });
        toast("Couldn't update — try again.");
      } else {
        toast(archived ? "Archived." : "Restored.", "accent");
      }
    },
    [patch, supabase, toast],
  );

  const remove = useCallback(
    async (project: Project) => {
      setConfirmDeleteId(null);
      setProjects((prev) => prev.filter((x) => x.id !== project.id));
      // project_id is ON DELETE SET NULL — the tasks survive, just unassigned.
      const { error } = await supabase.from("projects").delete().eq("id", project.id);
      if (error) {
        setProjects((prev) => [...prev, project].sort((a, b) => a.created_at.localeCompare(b.created_at)));
        toast("Couldn't delete — try again.");
      } else {
        toast("Deleted — its tasks are now unassigned.");
      }
    },
    [supabase, toast],
  );

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  function row(project: Project) {
    const isEditing = editingId === project.id;
    const count = openCounts[project.id] ?? 0;
    return (
      <li
        key={project.id}
        className={cn(
          "rounded-lg border border-line px-4 py-3",
          project.archived && "opacity-70",
        )}
      >
        <div className="flex items-center gap-3">
          <ProjectDot color={project.color} className="h-3 w-3" />
          {isEditing ? (
            <input
              value={editName}
              autoFocus
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => void rename(project)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void rename(project);
                if (e.key === "Escape") setEditingId(null);
              }}
              aria-label="Project name"
              className="min-w-0 flex-1 rounded-sm border border-line-strong bg-transparent px-2 py-1 text-sm text-ink outline-none focus:border-accent"
            />
          ) : (
            <button
              onClick={() => {
                setEditingId(project.id);
                setEditName(project.name);
              }}
              className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent-text"
              title="Rename"
            >
              {project.name}
            </button>
          )}
          <span className="shrink-0 text-xs text-faint">
            {count > 0 ? `${count} open` : "empty"}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {!project.archived && (
              <button
                onClick={() => {
                  setEditingId(project.id);
                  setEditName(project.name);
                }}
                aria-label="Rename project"
                className="rounded-sm p-1.5 text-faint hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
            <button
              onClick={() => void setArchived(project, !project.archived)}
              aria-label={project.archived ? "Restore project" : "Archive project"}
              title={project.archived ? "Restore" : "Archive"}
              className="rounded-sm p-1.5 text-faint hover:text-ink"
            >
              {project.archived ? (
                <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Archive className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            {project.archived && (
              <button
                onClick={() => setConfirmDeleteId(project.id)}
                aria-label="Delete project"
                title="Delete"
                className="rounded-sm p-1.5 text-faint hover:text-ink"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>

        {!project.archived && (
          <div className="mt-2.5 pl-6">
            <Swatches
              label={`Color for ${project.name}`}
              value={projectColor(project.color)}
              onPick={(hex) => void recolor(project, hex)}
            />
          </div>
        )}

        {confirmDeleteId === project.id && (
          <div className="mt-2.5 flex items-center gap-2 pl-6 text-xs text-muted">
            <span>Delete this project? Its tasks stay, just unassigned.</span>
            <button
              onClick={() => void remove(project)}
              className="rounded-sm border border-line-strong px-2 py-1 font-medium text-ink hover:border-accent"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="rounded-sm px-2 py-1 text-faint hover:text-ink"
            >
              Keep
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-6 py-12 pb-28 sm:pb-12">
      <header className="flex items-baseline justify-between">
        <div>
          <Link href="/" className="text-sm text-faint">
            Reflow
          </Link>
          <h1 className="font-display text-3xl tracking-tight text-ink">Projects</h1>
        </div>
        <nav className="flex items-center gap-3 text-xs text-faint">
          <Link href="/inbox" className="underline underline-offset-4 hover:text-muted">
            inbox
          </Link>
          <Link href="/today" className="underline underline-offset-4 hover:text-muted">
            today
          </Link>
        </nav>
      </header>

      {/* Create */}
      <section className="space-y-3 rounded-lg border border-line px-4 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
            placeholder="New project name"
            aria-label="New project name"
            className="min-w-0 flex-1 rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
          />
          <Button onClick={() => void create()} disabled={!name.trim() || creating}>
            {creating ? "Adding…" : "Add project"}
          </Button>
        </div>
        <Swatches label="New project color" value={color} onPick={setColor} />
      </section>

      {/* Active */}
      {active.length === 0 ? (
        <EmptyState
          art={<SunHorizon />}
          title="No projects yet."
          hint="Group related tasks — a project is just a calm bucket, no pressure."
        />
      ) : (
        <ul className="flex flex-col gap-2">{active.map(row)}</ul>
      )}

      {/* Archived */}
      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Archived</h2>
          <ul className="flex flex-col gap-2">{archived.map(row)}</ul>
        </section>
      )}

      <p className="mt-auto text-center text-xs text-faint">
        Deleting a project never deletes its tasks — they just lose the label.
      </p>
    </main>
  );
}
