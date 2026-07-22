"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

// Delivers reminders while a tab is open — a system Notification if the user
// granted permission, otherwise a calm in-app toast. Background web-push (fires
// when the app is closed) is a later infra add; this is the honest first cut.
// Only reminders that come due *after* mount fire, so opening the app never
// spams old ones.
export function RemindersWatcher() {
  const supabase = createClient();
  const toast = useToast();
  const notified = useRef<Set<string>>(new Set());
  const since = useRef(0);

  useEffect(() => {
    since.current = new Date().getTime();
    let cancelled = false;
    let uid: string | null = null;

    const check = async () => {
      if (!uid || cancelled) return;
      const now = new Date().getTime();
      const { data } = await supabase
        .from("tasks")
        .select("id, title, remind_at, status")
        .not("remind_at", "is", null)
        .lte("remind_at", new Date(now).toISOString())
        .neq("status", "done");
      for (const t of (data ?? []) as { id: string; title: string; remind_at: string }[]) {
        if (notified.current.has(t.id)) continue;
        notified.current.add(t.id);
        if (new Date(t.remind_at).getTime() < since.current) continue; // pre-existing
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification("Reflow", { body: t.title });
          } catch {
            /* fall through to toast */
          }
        }
        toast(`⏰ ${t.title}`, "accent");
      }
    };

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      uid = user?.id ?? null;
      if (uid) void check();
    })();

    const iv = setInterval(() => void check(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [supabase, toast]);

  return null;
}
