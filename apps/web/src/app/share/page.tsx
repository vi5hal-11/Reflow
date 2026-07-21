import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// PWA share target (manifest.ts). The OS share sheet lands here with the
// shared title/text/url as query params; we drop it into the inbox and bounce
// to /inbox. Capture stays zero-friction — no confirmation step.
export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; text?: string; url?: string }>;
}) {
  const { title, text, url } = await searchParams;
  const raw = [title, text, url].filter(Boolean).join(" ").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (raw) {
    await supabase.from("tasks").insert({
      user_id: user.id,
      title: raw.slice(0, 500),
      raw_text: raw,
      status: "inbox",
      source: "share",
    });
  }

  redirect("/inbox");
}
