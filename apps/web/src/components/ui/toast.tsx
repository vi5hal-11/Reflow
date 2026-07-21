"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// A calm, dependency-free toast. Reflow's many optimistic actions (save, sync,
// export) succeed or fail silently today; this gives them a brief, dismissible,
// never-alarmist acknowledgement. Tone is product policy (§7): no red, no shout.

type ToastTone = "default" | "accent";
type Toast = { id: string; message: string; tone: ToastTone };

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(
  () => {},
);

export function useToast() {
  return useContext(ToastContext);
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 3600);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <button
      onClick={() => onDismiss(toast.id)}
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-lg border bg-surface px-4 py-2.5 text-sm shadow-sm",
        "motion-safe:animate-[toast-in_200ms_var(--ease-out)]",
        toast.tone === "accent" ? "border-accent-tint text-accent-text" : "border-line text-ink",
      )}
    >
      {toast.message}
    </button>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, tone: ToastTone = "default") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, tone }]);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
