"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().email();
const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// Email + password sign-in — no magic link, session persists.
export async function signInWithPassword(formData: FormData) {
  const parsed = credsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=creds");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/login?error=signin");
  redirect("/inbox");
}

export async function signUpWithPassword(formData: FormData) {
  const parsed = credsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=weak");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/inbox` },
  });
  if (error) redirect("/login?error=signup");
  // Session present = email confirmation is off → straight in. Otherwise a
  // one-time confirmation email is on its way.
  if (data.session) redirect("/inbox");
  redirect("/login?confirm=1");
}

// One-click Google — reuses the OAuth callback. Needs the Google provider
// enabled in the Supabase dashboard (README).
export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback?next=/inbox` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signInWithMagicLink(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    redirect("/login?error=invalid-email");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });

  if (error) {
    redirect("/login?error=send-failed");
  }
  redirect("/login?sent=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
