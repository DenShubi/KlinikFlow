# KlinikFlow

KlinikFlow is a queue system for small clinics. Patients who walk in and
patients who register remotely wait in **one shared queue**, and everyone sees
an estimated waiting time that updates live.

Built for **STACK 2026**. All patient data in this repository is **synthetic**.

> **Status:** in active development. The features below describe the system
> being built; this README is updated as each one lands.

## The problem

In many clinics, patients take a number and wait in the room without knowing
when they will be seen. Walk-in patients and patients who booked remotely are
often handled in separate lines. If someone is absent when called, the whole
queue stalls.

## How KlinikFlow works

- **One hybrid queue.** Walk-in and remote patients are merged into a single
  ordered queue that the receptionist, the doctor and the patient all see.
- **Live updates.** When the doctor calls the next patient, every open screen
  updates within seconds, so no one has to refresh.
- **Wait estimates.** Each consultation's expected length is estimated from the
  patient's complaint. If the estimate is unavailable, a default duration is
  used and the screen says so.
- **Auto-defer.** A patient who is absent when called moves back two places
  automatically instead of blocking the queue.
- **WhatsApp alerts.** Patients get a message when their visit time changes and
  when they are three turns away, so they can wait elsewhere.
- **Role-based access.** Receptionists and doctors sign in to separate screens
  and only see the data their role needs, enforced in the database.

## Tech stack

| Part | Technology |
| --- | --- |
| Web app | [Next.js 16](https://nextjs.org) (App Router), TypeScript, Tailwind CSS 4 |
| Database, auth, live updates | [Supabase](https://supabase.com): Postgres, Auth, Row-Level Security, Realtime |
| Consultation estimates | Google Gemini, called from the server only |
| Notifications | WhatsApp |

## Running it locally

### What you need

- [Node.js](https://nodejs.org) 20 or newer (includes npm)
- A Supabase project, either hosted (free tier is enough) or local
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), only if
  you run Supabase locally

### 1. Install

```bash
git clone https://github.com/DenShubi/KlinikFlow.git
cd KlinikFlow
npm install
```

### 2. Connect a Supabase project

Pick **one** of the two options.

**Option A: hosted Supabase**

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Copy the environment template:

   ```bash
   cp .env.example .env.local
   ```

3. In the dashboard, open **Project Settings → API Keys**. Copy the Project
   URL, the publishable key and the secret key into `.env.local`.
4. Apply the database migrations and load the synthetic seed data:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --remote --include-seed
   ```

**Option B: local Supabase (Docker)**

1. Start Docker Desktop.
2. Start the local stack and apply migrations and seed data:

   ```bash
   npm run db:start
   ```

3. Copy the environment template and fill it with the URL and keys printed by
   `npm run db:status`:

   ```bash
   cp .env.example .env.local
   npm run db:status
   ```

### 3. Start the app

```bash
npm run dev
```

Open <http://localhost:3000>. The home page shows whether the app can reach
Supabase. The same check is available as JSON at `/api/health` (HTTP 200 when
connected, 503 when not).

## Database

The schema lives in [`supabase/migrations`](supabase/migrations) and the
synthetic data in [`supabase/seed.sql`](supabase/seed.sql).

| Table | Holds |
| --- | --- |
| `doctors` | Doctors who run a queue, each with a ticket letter (A, B, C) |
| `patients` | Patients and their WhatsApp numbers |
| `queue_tickets` | One row per visit: queue position, walk-in or remote, status, predicted and actual consultation length |
| `queue_events` | History of every queue change (created, checked in, called, deferred, ...) |
| `notifications` | WhatsApp messages sent or queued |
| `profiles` | Staff logins and their role (receptionist or doctor) |

Every table has row-level security enabled.

### Seed data

The seed creates 3 doctors, 80 patients, about two weeks of finished visits
(with predicted and actual consultation lengths) and a live queue for the day
the seed runs. Seed phone numbers use the `+62 800` prefix, which is not a
mobile range, so no real person can receive messages from seed data.

Today's queue is generated relative to the time the seed runs. To refresh it
before a demo, rebuild the database. **This deletes all data** in that database:

```bash
npm run db:reset                  # local stack
npx supabase db reset --remote    # hosted project
```

## Environment variables

All variables are listed with comments in [`.env.example`](.env.example).
Put real values in `.env.local`, which git ignores. Never commit keys or
tokens.

| Variable | Used for | Secret |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser and server access, limited by row-level security | no |
| `SUPABASE_SECRET_KEY` | Trusted server tasks such as seeding and webhooks; bypasses row-level security | **yes** |
| `NEXT_PUBLIC_APP_URL` | Base URL used in links and auth redirects | no |
| `GEMINI_API_KEY` | Consultation estimates | **yes** |
| `GEMINI_MODEL` | Gemini model used for estimates | no |
| `QUEUE_FALLBACK_CONSULT_MINUTES` | Default consultation length when no estimate is available | no |
| `WHATSAPP_SEND_ENABLED` | `false` logs messages instead of sending them | no |
| `WHATSAPP_ACCESS_TOKEN` | Sending WhatsApp messages | **yes** |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender number for WhatsApp messages | no |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Verifying incoming WhatsApp webhooks | **yes** |

Variables starting with `NEXT_PUBLIC_` are included in the browser bundle at
build time, so set them before running `npm run build` or deploying.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm run lint` | Check code style with ESLint |
| `npm run typecheck` | Check types with TypeScript |
| `npm run db:start` / `db:stop` | Start or stop the local Supabase stack |
| `npm run db:status` | Show the local Supabase URL and keys |
| `npm run db:reset` | Rebuild the local database from migrations and seed data |
| `npm run db:new <name>` | Create a new migration file |
| `npm run db:push` | Apply new migrations to the linked hosted project |
| `npm run db:types` | Regenerate TypeScript types from the hosted database schema |

## Project structure

```
src/app/            pages and API routes
src/lib/env.ts      reads environment variables
src/lib/supabase/   Supabase clients and generated database types
src/lib/ai/         consultation length estimator (Gemini)
src/proxy.ts        runs before each request and keeps the sign-in session fresh
supabase/           Supabase configuration, migrations and seed data
docs/CONTRACT.md    interface between the queue and the estimation module
```

## Data and privacy

KlinikFlow is developed and demonstrated with synthetic data only. No real
patient information is stored in this repository or its seed files.
