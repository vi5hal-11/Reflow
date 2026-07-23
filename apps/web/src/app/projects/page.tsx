import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { projectColumns, type Project } from "@/lib/types";
import { ProjectsClient } from "./projects-client";

export const metadata = { title: "Projects — Reflow" };

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Projects, plus a lightweight open-task tally per project (everything not
  // done) so the list shows where the work actually is. Tallied in memory —
  // one small query, no group-by round-trip.
  const [{ data: projects }, { data: openTasks }] = await Promise.all([
    supabase
      .from("projects")
      .select(projectColumns)
      .order("created_at", { ascending: true }),
    supabase.from("tasks").select("project_id").neq("status", "done"),
  ]);

  const counts: Record<string, number> = {};
  for (const t of (openTasks ?? []) as { project_id: string | null }[]) {
    if (t.project_id) counts[t.project_id] = (counts[t.project_id] ?? 0) + 1;
  }

  return (
    <ProjectsClient
      userId={user.id}
      initialProjects={(projects ?? []) as Project[]}
      openCounts={counts}
    />
  );
}
