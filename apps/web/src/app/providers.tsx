"use client";

import { ToastProvider } from "@/components/ui/toast";
import { TabBar } from "@/components/app-shell/tab-bar";

// Client providers mounted once at the root. Kept tiny — the app is
// server-first; only genuinely global client context lives here. The mobile
// tab bar self-hides on desktop and public routes.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <TabBar />
    </ToastProvider>
  );
}
