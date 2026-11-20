# KlinikFlow

Hybrid clinic queue: walk-in and remote patients share one live queue, with an
AI estimate of each consultation's length. Built for STACK 2026.

All patient data in this project is **synthetic**.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, TypeScript, Tailwind CSS 4)
- [Supabase](https://supabase.com): Postgres, Auth, Row-Level Security, Realtime
- Gemini (AI estimator, server-side only)

## Setup

Requirements: Node.js 20+ and npm. Docker Desktop only if you run Supabase locally.

```bash
npm install
cp .env.example .env.local   # then fill in the values (see below)
npm run dev                  # http://localhost:3000
```

The home page shows whether the app reaches Supabase; `GET /api/health`
returns the same check as JSON (HTTP 200 when connected, 503 when not).

### Supabase: hosted project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard)
   (region: Southeast Asia (Singapore) is closest).
2. From **Project Settings → API Keys**, copy the Project URL, the publishable
   key and the secret key into `.env.local`.
3. Link the CLI so migrations can be pushed:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push
   ```

### Supabase: local stack (fallback, needs Docker)

```bash
npm run db:start    # starts Postgres, Auth, Realtime and Studio in Docker
npm run db:status   # prints the local URL and keys for .env.local
npm run db:reset    # re-applies migrations and seed on a fresh database
```

## Environment variables

Every variable is listed in [`.env.example`](.env.example). Real values live
only in `.env.local`, which is git-ignored. No keys or tokens are committed.

| Variable | Where it is used | Secret |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and server, limited by RLS | no |
| `SUPABASE_SECRET_KEY` | server only (seed, webhooks); bypasses RLS | **yes** |
| `NEXT_PUBLIC_APP_URL` | links in messages, auth redirects | no |
| `GEMINI_API_KEY` | server only, AI estimator | **yes** |
| `GEMINI_MODEL` | server only, AI estimator | no |
| `QUEUE_FALLBACK_CONSULT_MINUTES` | wait shown when the AI estimate fails | no |
| `WHATSAPP_SEND_ENABLED` | `false` logs messages instead of sending | no |
| `WHATSAPP_ACCESS_TOKEN` | server only, WhatsApp sending | **yes** |
| `WHATSAPP_PHONE_NUMBER_ID` | server only, WhatsApp sending | no |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | server only, webhook verification | **yes** |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | start the dev server |
| `npm run build` / `npm start` | production build and server |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm run db:new <name>` | create a new migration in `supabase/migrations` |
| `npm run db:push` | apply migrations to the linked hosted project |

## Project layout

```
src/app/            routes (App Router)
src/lib/env.ts      reads environment variables
src/lib/supabase/   Supabase clients: browser, server, proxy (session refresh)
src/proxy.ts        runs before each request; refreshes the auth session
supabase/           CLI config, migrations and seed
docs/CONTRACT.md    schema fields and estimateConsultation contract (Denin ↔ Farhan)
```
