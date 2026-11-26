# KlinikFlow

KlinikFlow is a queue system for small clinics. Patients who walk in and
patients who register remotely wait in **one shared queue**, and everyone sees
an estimated waiting time that updates live.

Built for **STACK 2026**. All patient data in this repository and in the demo
is **synthetic**.

> **Status: semifinal build.** The hybrid queue, live updates, wait estimates,
> patient intake and ticket page, doctor dashboard, auto-defer and role-based
> access work today. WhatsApp alerts are scheduled for December and are marked
> *(planned)* below.

## Try the demo

**Live demo:** <https://klinik-flow.vercel.app>

| Role | Email | Opens |
| --- | --- | --- |
| Receptionist | `resepsionis@klinikflow.test` | `/reception` |
| Doctor (queue A) | `dokter.a@klinikflow.test` | `/doctor` |
| Doctor (queue B) | `dokter.b@klinikflow.test` | `/doctor` |
| Doctor (queue C) | `dokter.c@klinikflow.test` | `/doctor` |

The password for these demo accounts is given in our submission, not in this
repository. Patients do not need an account.

A five-minute walkthrough:

1. **As a patient** (on a phone, or a narrow window): open the demo, choose
   **Ambil antrean**, pick *dr. Larasati Wibowo* and register with any name and
   a number like `0800 0000 1234`. You get a ticket page with your number,
   people ahead and an estimated call time. Keep it open.
2. **As the receptionist** (a second browser or a private window): sign in.
   Your ticket appears in queue A as *Online · Belum tiba*. Click
   **Tandai tiba** to mark that you have arrived; the ticket page updates by
   itself. Patients registered at the desk are marked as arrived the same way.
3. **As doctor A** (a third window): sign in. Use the main button to finish
   the current patient and call the next ones. Every open window, including
   the patient's ticket page, follows within a second or two.
4. **Hybrid queue:** register another remote patient and do *not* mark them as
   arrived. When their turn comes, the doctor calls the next patient who is
   here; the remote ticket shows *Giliran Anda terlewat*. Mark them as arrived
   and they rejoin two places behind the patients in the room.
5. **Wait estimates:** the doctor dashboard compares estimated and actual
   consultation lengths for the patients finished today.

## The problem

In many clinics, patients take a number and wait in the room without knowing
when they will be seen. Walk-in patients and patients who booked remotely are
often handled in separate lines. If someone is absent when called, the whole
queue stalls.

## How KlinikFlow works

- **One hybrid queue.** Walk-in and remote patients are merged into a single
  ordered queue that the receptionist, the doctor and the patient all see.
  Remote patients keep their place if they arrive in time; if their turn
  passes before they arrive, they rejoin two places behind the patients
  already waiting in the room.
- **Live updates.** When the doctor calls the next patient, every open screen
  updates within seconds, so no one has to refresh.
- **Wait estimates.** Each consultation's expected length is estimated from the
  patient's complaint. If the estimate is unavailable, a default duration is
  used and the screen says so.
- **Auto-defer.** A patient who is called but does not come in moves back two
  places instead of blocking the queue: the doctor presses *Tidak hadir*, or it
  happens on its own after 5 minutes. After two deferrals, the next absence
  removes the ticket.
- **WhatsApp alerts** *(planned)*. Patients get a message when their visit time
  changes and when they are three turns away, so they can wait elsewhere.
  Until then, the live ticket page tells them when to come.
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

5. In the dashboard, open **Authentication → Sign In / Providers** and turn
   off **Allow new users to sign up**. Staff accounts are created by script
   only (see [Staff accounts](#staff-accounts-and-roles)).

**Option B: local Supabase (Docker), also the offline fallback**

Everything runs on one computer: no hosted project and no internet needed
after the first download of the Docker images (a few GB).

1. Start Docker Desktop and wait until it says it is running.
2. Start the local stack. The first run downloads the images; then it applies
   all migrations and the synthetic seed:

   ```bash
   npm run db:start
   ```

3. Point the app at the local stack:

   ```bash
   cp .env.example .env.local   # only if you have no .env.local yet
   npm run env:local
   ```

   `env:local` fills in the local URL and keys. If `.env.local` pointed at a
   hosted project, it is saved first as `.env.hosted`; `npm run env:hosted`
   switches back.

### 3. Create the staff accounts

Set `DEMO_STAFF_PASSWORD` in `.env.local` (at least 10 characters), then:

```bash
npm run staff:seed
```

### 4. Start the app

```bash
npm run dev
```

Open <http://localhost:3000>. The footer of the home page shows whether the
app can reach Supabase. The same check is available as JSON at `/api/health`
(HTTP 200 when connected, 503 when not).

### Refreshing the demo queue

The seed builds today's queue around the moment it runs. On a later day,
rebuild only today's queue (past days, patients and staff accounts stay):

```bash
npm run demo:refresh -- --yes
```

It refuses to run if today's queue holds any patient with a real phone number
(outside the synthetic `+62 800` range), so it cannot erase real visits.

## Deploying

The app is a standard Next.js project and deploys to
[Vercel](https://vercel.com) as is:

1. Import the GitHub repository in Vercel (framework: Next.js, default build
   settings). [`vercel.json`](vercel.json) runs the server code in Sydney
   (`syd1`), next to the Supabase project (`ap-southeast-2`); change both
   together if you move the database.
2. Add the environment variables from [`.env.example`](.env.example) in
   **Settings → Environment Variables**. At least `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and
   `NEXT_PUBLIC_APP_URL` (the deployment's own URL). `NEXT_PUBLIC_*` values are
   built into the app, so redeploy after changing them.
3. In Supabase, open **Authentication → URL Configuration** and set the
   **Site URL** to the deployment's URL.
4. Check the deployment: `/api/health` should return HTTP 200, and

   ```bash
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app npm run test:auth
   ```

   should pass.

## Screens

| Path | For | What it does |
| --- | --- | --- |
| `/` | Everyone | Start page: one live ticket per doctor (who is being served, how many wait, opening hours; swipe or use the dots), take a queue number, staff sign-in |
| `/intake` | Patients | Register remotely: choose a doctor who is open now (with the current wait), enter name, WhatsApp number, complaint, age, visit purpose, whether they have seen this doctor before and (optionally) a chronic condition; short follow-up questions clarify the complaint |
| `/ticket/<id>` | Patients | The patient's own ticket: number, people ahead, estimated call time, when to arrive; updates live |
| `/login` | Staff | Sign in |
| `/doctor` | Doctors | Dashboard: current patient with a timer, one button to call / start / finish, complaint summary, next patients, today's predicted vs actual durations |
| `/reception` | Receptionists | All queues and opening hours, register a patient at the desk (same fields and complaint questions as the patient form, then the estimated consultation time), mark arrivals, cancel tickets |

Patients never sign in. After registering they are sent to their ticket page,
whose link contains the ticket id (a random UUID). That page reads
`ticket_public_status`, a database function that returns only what the patient
needs (no phone number, no complaint, only their first name and last initial),
and listens to a public Realtime broadcast for their queue whose messages
contain no personal data
([`patient_ticket_access` migration](supabase/migrations/20261120113207_patient_ticket_access.sql)).
The intake runs on the server with the secret key and validates every field;
a hidden form field filters out simple bots.

### Working hours

Each doctor has working days and hours in clinic time (WIB), stored on the
`doctors` row (`work_days`, `opens_at`, `closes_at`). The defaults follow
formal Indonesian office hours: **Monday to Friday, 08.00–16.00**. Outside
those hours a doctor shows as *Tutup* with the next opening time, and patients
cannot register for them online. The receptionist can still add a patient.
Set `CLINIC_ALWAYS_OPEN=true` to treat every doctor as open, for demos at night
or on weekends
([`doctor_hours_walk_in_check_in` migration](supabase/migrations/20261122114112_doctor_hours_walk_in_check_in.sql)).

## Staff accounts and roles

Only clinic staff sign in; patients never need an account. Each login has one
role, stored in the `profiles` table, which only trusted server code can change.

| Role | Signs in to | Can see | Can change |
| --- | --- | --- | --- |
| Receptionist | `/reception` | Every doctor's queue, all patients, their WhatsApp numbers (through `reception_patient_phones`), sent messages | Add and edit patients; add tickets, mark arrivals, cancel (through the queue functions) |
| Doctor | `/doctor` | Only their own queue and the patients in it (name, birth date), with complaints and AI summaries; no phone numbers | Call, start and finish patients in their own queue (through the queue functions) |

The rules are enforced three times: the proxy sends signed-out visitors to
`/login`, each page checks the role (`src/lib/auth/dal.ts`), and row-level
security in the database
([`auth_rls` migration](supabase/migrations/20261120105530_auth_rls.sql))
decides which rows each role can read or write. Visitors who are not signed in
can read nothing.

Row-level security filters rows, not columns, so phone numbers are protected
separately ([`patient_phone_reception_only` migration](supabase/migrations/20261125103634_patient_phone_reception_only.sql)):
signed-in staff can read every column of `patients` except `phone`, and only
the receptionist gets numbers, through the function
`reception_patient_phones(service_date)`. A doctor who queries the Data API
directly is refused the column and the function. Queries on `patients` must
therefore name their columns (`select *` is refused), and a new column needs
to be added to the grant in that migration before staff can read it.

`npm run staff:seed` creates these demo accounts, all with the password in
`DEMO_STAFF_PASSWORD`:

| Email | Role |
| --- | --- |
| `resepsionis@klinikflow.test` | Receptionist |
| `dokter.a@klinikflow.test` | Doctor, queue A (dr. Larasati Wibowo) |
| `dokter.b@klinikflow.test` | Doctor, queue B (dr. Hendra Kusuma) |
| `dokter.c@klinikflow.test` | Doctor, queue C (dr. Maya Sitompul) |

### Checking access rules

```bash
npm run test:rls    # signs in as each role and checks what the database returns
npm run test:auth   # with npm run dev running: checks which pages each role can open
npm run test:queue  # runs the whole queue flow and checks Realtime per role
```

`test:rls` and `test:auth` only read; their write checks are attempts that must
be refused. `test:queue` works on a test date (1 January 2099) and deletes
everything it created, so today's queue is not touched.

## Queue engine

Every queue change goes through a database function
([`queue_engine` migration](supabase/migrations/20261120111527_queue_engine.sql)),
so ticket numbers, positions, events and wait estimates stay consistent even
when two people click at the same moment. Staff cannot edit queue rows
directly; the functions check each caller's role themselves.

| Function | Who | What it does |
| --- | --- | --- |
| `queue_create_ticket` | Receptionist, server | Adds a ticket at the end of a doctor's queue with the next ticket number |
| `queue_check_in` | Staff | Marks a patient as arrived ("Tiba"); a patient who missed their turn rejoins (see below) |
| `queue_call_next` | Doctor (own queue), receptionist | Calls the next patient in line who is at the clinic; remote patients ahead who have not arrived miss their turn |
| `queue_start_consultation` | Doctor, receptionist | The called patient is with the doctor |
| `queue_finish_consultation` | Doctor, receptionist | Ends the consultation; `actual_minutes` is saved |
| `queue_cancel_ticket` | Doctor, receptionist | Removes a waiting or called ticket |
| `queue_mark_absent` | Doctor (own queue), receptionist | A called patient did not come in: moves them back two turns, or marks them *Tidak hadir* on the third absence (see Auto-defer) |

### Hybrid synchronizer

Walk-in and remote patients share one queue, numbered in the order they
register, at the desk or from home
([`hybrid_synchronizer` migration](supabase/migrations/20261120115246_hybrid_synchronizer.sql)).
Every patient, walk-in or remote, is marked as arrived by the receptionist
("Tiba") when they are in the waiting room: a walk-in may register while the
queue is long and go home in the meantime. Three rules keep everyone in step:

1. **On time.** A patient who is marked as arrived before their turn keeps
   their place.
2. **Missed turn.** When the doctor calls the next patient and a patient ahead
   has not arrived, that patient misses their turn. They stop counting in
   everyone else's wait estimate, and their ticket page asks them to come in.
3. **Rejoin.** When they arrive, they join the queue two places behind the
   patients who are at the clinic at that moment. Walk-ins who waited in the
   room are never pushed back by someone who was not there.

Example: queue A-001 (walk-in), A-002 (remote), A-003, A-004 (walk-in). After
A-001, the doctor calls next while A-002 is still at home, so A-003 is called
and A-002 misses its turn. When A-002 arrives, the order becomes A-003 (with
the doctor), A-004, A-002.

### Auto-defer

A patient who is **at the clinic** and is **called** but does not come into
the room ([`auto_defer` migration](supabase/migrations/20261123112326_auto_defer.sql)):

1. **Moved back two turns.** They go back behind the next two patients who are
   present, their ticket shows *Ditunda 1×*, and their ticket page tells them
   to stay in the waiting room. They are called again after those two.
2. **Triggered by the doctor or by time.** The doctor presses *Tidak hadir*
   on the current-patient card, or a `pg_cron` job does it once a called
   patient has not been started for 5 minutes.
3. **Third absence.** A patient already deferred twice becomes *Tidak hadir*
   (`no_show`) and leaves the queue; the receptionist can register them again.

This is different from a *missed turn* (hybrid synchronizer), which is for a
patient who has not arrived at the clinic when their turn comes. The numbers
(2 places, 5 minutes, 2 deferrals) are `private.rejoin_offset()`,
`private.absent_after()` and `private.max_defers()` in the database and
`src/lib/queue/rules.ts` in the app.

**Wait estimate.** After every change, each waiting patient's
`estimated_call_at` is recalculated: the remaining time of the current
consultation plus the predicted minutes of everyone ahead of them. Predictions
come from the consultation estimator when the ticket is created
([`src/lib/queue/estimator.ts`](src/lib/queue/estimator.ts)), which calls
the Gemini estimator in [`src/lib/ai`](src/lib/ai). The estimate is the
doctor's consultation time (2–30 minutes, following a practising GP's tiers)
plus `QUEUE_CHANGEOVER_MINUTES` (default 1) for the next patient to come in;
that total is stored as `predicted_minutes`. Without `GEMINI_API_KEY`, or when
Gemini is slow or fails, it uses the default consultation length
(`QUEUE_FALLBACK_CONSULT_MINUTES`, default 5). Because time also passes between changes (a
consultation runs over, a doctor is idle), a `pg_cron` job recalculates every
active queue once a minute
([`refresh_estimates_job` migration](supabase/migrations/20261120113912_refresh_estimates_job.sql)).

**Live updates.** The reception and doctor pages subscribe to changes in
`queue_tickets` through Supabase Realtime and re-render when anything changes,
so every open window shows the same queue. Realtime applies the same
row-level security, so a doctor only receives changes to their own queue.
Patient ticket pages use the public broadcast described under [Screens](#screens),
and also refresh every 30 seconds.

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

Every table has row-level security enabled; see
[Staff accounts and roles](#staff-accounts-and-roles) for who can see what.

### Seed data

The seed creates 3 doctors, 80 patients, about two weeks of finished visits
(with predicted and actual consultation lengths) and a live queue for the day
the seed runs. Seed phone numbers use the `+62 800` prefix, which is not a
mobile range, so no real person can receive messages from seed data.

Visits are generated by `private.generate_demo_day` in the database
([`demo_data` migration](supabase/migrations/20261120120318_demo_data.sql)).
Today's queue is built around the time the seed runs; on a later day use
`npm run demo:refresh -- --yes` (see [Refreshing the demo queue](#refreshing-the-demo-queue)).

To rebuild a database from scratch instead (**this deletes all data** in it):

```bash
npm run db:reset                  # local stack
npx supabase db reset --remote    # hosted project
npm run staff:seed                # then restore the staff accounts and their roles
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
| `DEMO_STAFF_PASSWORD` | Password given to the demo staff accounts by `npm run staff:seed` | **yes** |
| `NEXT_PUBLIC_APP_URL` | Base URL used in links and auth redirects | no |
| `CLINIC_ALWAYS_OPEN` | `true` treats every doctor as open, ignoring working hours (demos) | no |
| `GEMINI_API_KEY` | Consultation estimates | **yes** |
| `GEMINI_MODEL` | Gemini model used for estimates | no |
| `GEMINI_TIMEOUT_MS` | How long to wait for Gemini before using the default length | no |
| `QUEUE_FALLBACK_CONSULT_MINUTES` | Consultation minutes used when no AI estimate is available (default 5) | no |
| `QUEUE_CHANGEOVER_MINUTES` | Minutes added to every estimate for the next patient to come in (default 1) | no |
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
| `npm run staff:seed` | Create or update the demo staff accounts |
| `npm run test:rls` | Check row-level security for each role against the database |
| `npm run test:auth` | Check which staff pages each role can open (needs `npm run dev`) |
| `npm run test:queue` | Run the whole queue flow against the database and check Realtime |
| `npm run demo:refresh -- --yes` | Replace today's queue with a fresh synthetic one (never touches real patients) |
| `npm run demo:missed-turn -- <step>` | Step-by-step demo (steps: reset, next, arrive, show): a remote patient misses their turn and rejoins |
| `npm run demo:absent -- <step>` | Step-by-step demo (steps: reset, call, absent, show): a called patient does not come in and is moved back |
| `npm run env:local` / `env:hosted` | Point `.env.local` at the local Supabase stack or back at the hosted project |

## Project structure

```
src/app/            pages and API routes
src/lib/env.ts      reads environment variables
src/lib/supabase/   Supabase clients and generated database types
src/lib/auth/       sign-in, sign-out and role checks for staff pages
src/lib/queue/      queue actions, estimator entry point and labels
src/lib/intake/     remote registration by patients
src/components/     shared UI, including live queue updates
src/lib/ai/         consultation length estimator (Gemini)
src/proxy.ts        runs before each request, keeps the sign-in session fresh
                    and sends signed-out visitors away from staff pages
scripts/            staff account setup and access-rule checks
supabase/           Supabase configuration, migrations and seed data
docs/CONTRACT.md    interface between the queue and the estimation module
```

## AI disclosure

KlinikFlow uses Google's Gemini API (server-side only) for two narrow tasks:
estimating how long a GP consultation will take (2–30 minutes, following a
practising doctor's duration tiers) and writing a one- or two-sentence neutral
summary of the patient's complaint for the doctor. The AI never diagnoses,
recommends medication or reorders the queue by urgency. Only the complaint
text, age in years, visit purpose, whether the patient is new and a yes/no
chronic-condition flag are sent to the model; never a name, phone number, birth
date or ticket id. Every answer is validated, and on timeout or error the queue
uses a default length (5 minutes) so it never blocks. On a 24-case synthetic
benchmark, 22 of 24 estimates fell inside the doctor's ranges.

Full details, evaluation results and known limitations:
[docs/AI_DISCLOSURE.md](docs/AI_DISCLOSURE.md).

## Data and privacy

KlinikFlow is developed and demonstrated with synthetic data only. No real
patient information is stored in this repository, its seed files or the demo
database; seed phone numbers use the non-mobile `+62 800` range. Keys and
tokens live only in `.env.local` and in the hosting provider's settings, never
in the repository.
