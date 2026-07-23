import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inboxTaskColumns, projectColumns, type InboxTask, type Project } from "@/lib/types";
import { InboxClient } from "./inbox-client";

export const metadata = { title: "Inbox — Reflow" };

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: tasks }, { count: todayCount }, { count: laterCount }, { data: projects }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(inboxTaskColumns)
        .eq("status", "inbox")
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("status", ["todo", "rolled"])
        .eq("planned_date", today),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("status", ["todo", "rolled"])
        .is("planned_date", null),
      supabase
        .from("projects")
        .select(projectColumns)
        .eq("archived", false)
        .order("created_at", { ascending: true }),
    ]);

  return (
    <InboxClient
      userId={user.id}
      initialTasks={(tasks ?? []) as InboxTask[]}
      initialTodayCount={todayCount ?? 0}
      initialLaterCount={laterCount ?? 0}
      initialProjects={(projects ?? []) as Project[]}
    />
  );
}
