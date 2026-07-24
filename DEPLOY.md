# Deploying Reflow

Two services + a managed database, all on free tiers:

- **Web** (Next.js) → **Vercel**
- **Scheduler** (FastAPI) → **Railway** or **Fly.io** (Dockerfile included)
- **Database/Auth** → **Supabase** (already live: project `qakfernzpemibujwxrts`)

Order matters: deploy the scheduler first (you need its URL for the web env),
then the web app, then wire the production OAuth redirects.

---

## 1. Scheduler → Railway (or Fly.io)

The service has a `Dockerfile` at `services/scheduler/`.

**Railway:** New Project → Deploy from GitHub → pick this repo → set **Root
Directory** to `services/scheduler`. Railway detects the Dockerfile and injects
`PORT`. Add env vars:

| Var | Value |
|---|---|
| `GEMINI_API_KEY` | your AI Studio key (rotate the one that transited chat) |
| `GEMINI_MODEL` | `gemini-2.5-flash` (optional) |

Deploy, then copy the public URL (e.g. `https://reflow-scheduler.up.railway.app`).
Verify: `GET /health` → `{"status":"ok"}`.

**Fly.io:** `cd services/scheduler && fly launch --no-deploy` (generates
`fly.toml`), set secrets with `fly secrets set GEMINI_API_KEY=…`, then `fly deploy`.

---

## 2. Web → Vercel

New Project → import this repo → set **Root Directory** to `apps/web`. Env vars:

| Var | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qakfernzpemibujwxrts.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `NEXT_PUBLIC_SITE_URL` | your Vercel domain, e.g. `https://reflow.vercel.app` |
| `SCHEDULER_URL` | the scheduler URL from step 1 |
That's the whole list. The web app needs **no secret key and no Google
credentials** — it reaches Supabase only through RLS-scoped user sessions.

Deploy. The app is usable the moment this is up — the scheduler and LLM edges
both degrade gracefully if a var is missing.

---

## 3. Production auth + OAuth redirects

- **Supabase Auth** (dashboard → Authentication → URL Configuration): add your
  Vercel domain to **Site URL** and **Redirect URLs** (`https://…/auth/callback`).
- **Google sign-in**: in Google Cloud Console, the OAuth client's authorized
  redirect URI must include `https://<project-ref>.supabase.co/auth/v1/callback`
  (Supabase handles the round-trip; the app itself needs no Google env).

---

## 4. Secret rotation (do this before going live)

Three secrets passed through a chat session and should be rotated:

1. **Google client secret** — Google Cloud Console → Credentials → reset secret.
2. **Supabase secret key** — Supabase dashboard → Project Settings → API Keys → roll `sb_secret_…`.
3. **Gemini key** — AI Studio → revoke + create new.

Update each in the Vercel/Railway env (never commit them). Then run Supabase
**advisors** (security + performance) against the live project and clear any findings.

---

## 5. Post-deploy check

- `GET https://<web>/` → landing renders (warm paper, "Start the day").
- `GET https://<scheduler>/health` → ok.
- Sign in, run the [WALKTHROUGH.md](apps/web/WALKTHROUGH.md) once on the live URL.
- Install the PWA on a phone (Add to Home Screen); confirm the icon + standalone launch.
