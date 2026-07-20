import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inboxTaskColumns, type InboxTask } from "@/lib/types";
import { InboxClient } from "./inbox-client";

export const metadata = { title: "Inbox — Reflow" };

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: tasks }, { count: todayCount }, { count: laterCount }] =
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
    ]);

  return (
    <InboxClient
      userId={user.id}
      initialTasks={(tasks ?? []) as InboxTask[]}
      initialTodayCount={todayCount ?? 0}
      initialLaterCount={laterCount ?? 0}
    />
  );
}
