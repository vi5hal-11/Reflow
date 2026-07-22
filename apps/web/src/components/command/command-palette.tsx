"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// The ⌘K spine (v2). Global command menu + natural-language quick-add: type a
// command to run it, or type a task and "Add …" captures it (reusing the
// /parse edge). Open with ⌘K / Ctrl-K anywhere, or a dispatched "reflow:cmdk"
// event (the visible command bar + mobile trigger fire this).
type Action = {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void | Promise<void>;
};

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSel(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onEvt = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("reflow:cmdk", onEvt);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("reflow:cmdk", onEvt);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const quickAdd = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      close();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: user.id,
          title: trimmed,
          raw_text: trimmed,
          status: "inbox",
          source: "text",
        })
        .select("id")
        .single();
      if (error) {
        toast("Couldn't capture — try again.");
        return;
      }
      toast("Captured.", "accent");
      if (data?.id) {
        void fetch("/api/parse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ taskId: data.id }),
        }).catch(() => {});
      }
      if (pathname !== "/inbox") router.push("/inbox");
      else router.refresh();
    },
    [supabase, toast, router, pathname, close],
  );

  const actions: Action[] = useMemo(
    () => [
      { id: "today", label: "Go to Today", keywords: "day plan timeline", run: () => { close(); router.push("/today"); } },
      { id: "inbox", label: "Go to Inbox", keywords: "capture triage", run: () => { close(); router.push("/inbox"); } },
      { id: "settings", label: "Go to Settings", keywords: "profile energy hours", run: () => { close(); router.push("/settings"); } },
      { id: "plan", label: "Plan my day", keywords: "schedule reflow auto", run: () => { close(); router.push("/today?plan=1"); } },
      { id: "export", label: "Export data (JSON)", keywords: "backup download portability", run: () => { close(); window.location.href = "/api/export?format=json"; } },
    ],
    [router, close],
  );

  const q = query.trim().toLowerCase();
  const filtered = q
    ? actions.filter((a) => `${a.label} ${a.keywords ?? ""}`.toLowerCase().includes(q))
    : actions;
  const items: Action[] = query.trim()
    ? [
        { id: "__add", label: `Add “${query.trim()}”`, hint: "capture", run: () => quickAdd(query) },
        ...filtered,
      ]
    : filtered;

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void items[Math.min(sel, items.length - 1)]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-start justify-center px-4 pt-[14vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command menu"
    >
      <div
        className="absolute inset-0 bg-ink/40 motion-safe:animate-[toast-in_120ms_var(--ease-out)]"
        onClick={close}
      />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-line bg-surface shadow-sm motion-safe:animate-[sheet-up_180ms_var(--ease-out)]"
        onKeyDown={onListKey}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
          placeholder="Type a command, or add a task…"
          className="w-full border-b border-line bg-transparent px-4 py-3.5 text-sm text-ink outline-none placeholder:text-faint"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {items.map((a, i) => (
            <li key={a.id}>
              <button
                onMouseMove={() => setSel(i)}
                onClick={() => void a.run()}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm",
                  i === sel ? "bg-accent-tint text-ink" : "text-muted",
                )}
              >
                <span className="truncate">{a.label}</span>
                {a.hint && <span className="shrink-0 text-xs text-faint">{a.hint}</span>}
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-faint">No matches</li>
          )}
        </ul>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-faint">
          <span>↑↓ move</span>
          <span>↵ run</span>
          <span>esc close</span>
          <span className="ml-auto tabular">⌘K</span>
        </div>
      </div>
    </div>
  );
}
