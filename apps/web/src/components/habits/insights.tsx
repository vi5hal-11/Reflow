"use client";

import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";

// Gentle pattern analysis, revealed on request (deliberate — one LLM call when
// the user asks, not on every page load). Falls quiet if the edge is down.
export type PatternsPayload = {
  mood_series: (number | null)[];
  habits: { title: string; kind: string; days_active: number; window_days: number }[];
  journal_days: number;
  meditation_minutes: number;
  workout_minutes: number;
  window_days: number;
};

type Result = { observations: string[]; reflect_prompt: string };

export function Insights({ payload }: { payload: PatternsPayload }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "quiet">("idle");
  const [result, setResult] = useState<Result | null>(null);

  const reveal = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/patterns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setState("quiet");
        return;
      }
      const data = (await res.json()) as Result;
      setResult(data);
      setState("done");
    } catch {
      setState("quiet");
    }
  }, [payload]);

  if (state === "done" && result) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden />
          <span className="text-sm font-medium text-ink">What the last two weeks whisper</span>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {result.observations.map((o, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted">
              <span className="text-accent">·</span>
              {o}
            </li>
          ))}
        </ul>
        {result.reflect_prompt && (
          <p className="mt-3 border-t border-line pt-3 text-sm italic text-ink">
            {result.reflect_prompt}
          </p>
        )}
      </div>
    );
  }

  if (state === "quiet") {
    return (
      <div className="rounded-lg border border-line bg-surface p-4 text-sm text-faint">
        Insights are resting just now — check back once there&rsquo;s a little more to notice.
      </div>
    );
  }

  return (
    <button
      onClick={() => void reveal()}
      disabled={state === "loading"}
      className="press flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong py-3 text-sm text-muted hover:border-accent hover:text-ink disabled:opacity-60"
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      {state === "loading" ? "Looking gently…" : "Reveal gentle patterns"}
    </button>
  );
}
