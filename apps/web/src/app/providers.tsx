"use client";

import { ToastProvider } from "@/components/ui/toast";

// Client providers mounted once at the root. Kept tiny — the app is
// server-first; only genuinely global client context lives here.
export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
