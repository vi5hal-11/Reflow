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
      <div className="space-y-2">
        <Link href="/" className="text-sm text-neutral-500">
          ← Reflow
        </Link>
        <h1 className="text-2xl font-medium tracking-tight">Sign in</h1>
        <p className="text-sm text-neutral-500">
          A magic link, no password. Google sign-in arrives once OAuth
          credentials are configured.
        </p>
      </div>

      {sent ? (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          Check your inbox — your sign-in link is on its way.
        </p>
      ) : (
        <form action={signInWithMagicLink} className="flex flex-col gap-3">
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
          />
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Email me a sign-in link
          </button>
          {error ? (
            <p className="text-sm text-neutral-500">
              That didn&apos;t work — check the address and try again.
            </p>
          ) : null}
        </form>
      )}
    </main>
  );
}
