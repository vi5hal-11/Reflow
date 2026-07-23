import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { JournalClient, type JournalEntry } from "./journal-client";

export const metadata = { title: "Journal — Reflow" };

export default async function JournalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("entry_date, body")
    .order("entry_date", { ascending: false })
    .limit(60);

  return (
    <JournalClient
      userId={user.id}
      today={todayStr}
      initialEntries={(entries ?? []) as JournalEntry[]}
    />
  );
}
