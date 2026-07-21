import Link from "next/link";
import { signInWithMagicLink } from "./actions";

export const metadata = { title: "Sign in — Reflow" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6">
      <div className="space-y-3">
        <Link href="/" className="text-sm text-faint transition-colors hover:text-muted">
          ← Reflow
        </Link>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Welcome back
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          A magic link, no password. Google sign-in arrives once OAuth
          credentials are configured.
        </p>
      </div>

      {sent ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">
          Check your inbox — your sign-in link is on its way.
        </p>
      ) : (
        <form action={signInWithMagicLink} className="flex flex-col gap-3">
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="rounded-sm border border-line-strong bg-transparent px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-sm bg-accent px-3 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent-strong"
          >
            Email me a sign-in link
          </button>
          {error ? (
            <p className="text-sm text-muted">
              That didn&apos;t work — check the address and try again.
            </p>
          ) : null}
        </form>
      )}
    </main>
  );
}
