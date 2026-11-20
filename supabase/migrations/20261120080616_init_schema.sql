-- KlinikFlow initial schema
--
-- One clinic, several doctors. Each doctor has one queue per day. Walk-in and
-- remote patients share that queue (queue_tickets). Every ticket stores the
-- predicted consultation length (from estimateConsultation) and the actual
-- length (from started_at / ended_at), so the estimator can be calibrated.
--
-- Row-level security is enabled on every table with no policies yet, so the
-- publishable key can read nothing until the auth/RLS migration adds policies.

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- The clinic's calendar date. Queues reset at midnight in Indonesia (WIB).
create function public.clinic_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Jakarta')::date;
$$;

comment on function public.clinic_today() is 'Current date in the clinic time zone (Asia/Jakarta).';

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type public.app_role as enum ('receptionist', 'doctor');

create type public.ticket_channel as enum ('walk_in', 'remote');

-- waiting          in the queue (remote patients may not have arrived yet: see checked_in_at)
-- called           called to the room, not yet started
-- in_consultation  with the doctor
-- done             consultation finished
-- cancelled        withdrawn by the patient or the receptionist
-- no_show          never arrived, removed from the queue
-- A deferred patient goes back to 'waiting'; defer_count records how often.
create type public.ticket_status as enum (
  'waiting', 'called', 'in_consultation', 'done', 'cancelled', 'no_show'
);

create type public.prediction_source as enum ('ai', 'fallback');

create type public.queue_event_type as enum (
  'created',
  'checked_in',
  'called',
  'consultation_started',
  'consultation_ended',
  'deferred',
  'estimate_updated',
  'cancelled',
  'no_show'
);

create type public.notification_kind as enum ('visit_time_update', 'three_turns_alert');

-- skipped = not sent because WHATSAPP_SEND_ENABLED=false (stub mode)
create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');

-- ─── Staff ──────────────────────────────────────────────────────────────────

-- One row per staff login. Patients do not log in.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  role public.app_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Staff accounts (receptionist or doctor), one per auth user.';

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  -- Login of this doctor; null until a staff account is linked.
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name text not null check (length(trim(full_name)) > 0),
  room text,
  -- Letter shown before the ticket number, e.g. A-007.
  ticket_prefix text not null unique check (ticket_prefix ~ '^[A-Z]$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.doctors is 'Doctors who run a queue. Each has one queue per service date.';

-- ─── Patients ───────────────────────────────────────────────────────────────

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  -- WhatsApp number in E.164 format, e.g. +6281234567890. Optional for walk-ins.
  phone text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.patients is 'Patients. All rows in this project are synthetic.';

create index patients_phone_idx on public.patients (phone);

-- ─── Queue ──────────────────────────────────────────────────────────────────

create table public.queue_tickets (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id),
  patient_id uuid not null references public.patients (id),
  service_date date not null default public.clinic_today(),

  -- Number printed on the ticket; never changes.
  ticket_number integer not null check (ticket_number > 0),
  -- Place in the queue; the queue engine reorders it (hybrid merge, auto-defer).
  position integer not null check (position > 0),

  channel public.ticket_channel not null,
  status public.ticket_status not null default 'waiting',

  -- Intake (input to estimateConsultation)
  complaint text not null check (length(trim(complaint)) > 0),
  is_follow_up boolean not null default false,

  -- Prediction (output of estimateConsultation)
  predicted_minutes integer check (predicted_minutes between 1 and 240),
  prediction_source public.prediction_source,
  prediction_confidence numeric(3, 2) check (prediction_confidence between 0 and 1),
  prediction_model text,
  ai_summary text,

  -- Latest estimated time the patient will be called (shown to the patient,
  -- and sent in the WhatsApp visit-time update).
  estimated_call_at timestamptz,

  -- Timeline
  checked_in_at timestamptz, -- walk-in: on arrival; remote: when they arrive at the clinic
  called_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  -- Actual consultation length, filled by the database when the consultation ends.
  actual_minutes numeric(6, 2) generated always as (
    round(extract(epoch from (ended_at - started_at)) / 60, 2)
  ) stored,

  -- How many times this patient was moved back for being absent when called.
  defer_count smallint not null default 0 check (defer_count >= 0),

  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint queue_tickets_number_key unique (doctor_id, service_date, ticket_number),
  -- Deferrable so the queue engine can swap positions inside one transaction.
  constraint queue_tickets_position_key unique (doctor_id, service_date, position)
    deferrable initially deferred,
  constraint queue_tickets_prediction_complete check (
    (predicted_minutes is null) = (prediction_source is null)
  ),
  constraint queue_tickets_timeline_order check (
    (ended_at is null or (started_at is not null and ended_at >= started_at))
  )
);

comment on table public.queue_tickets is
  'One visit: a patient''s place in a doctor''s queue on one day, with predicted and actual consultation length.';
comment on column public.queue_tickets.predicted_minutes is 'From estimateConsultation (AI or fallback).';
comment on column public.queue_tickets.actual_minutes is 'ended_at - started_at in minutes; read by calibration.';

create index queue_tickets_queue_idx
  on public.queue_tickets (doctor_id, service_date, status, position);
create index queue_tickets_patient_idx on public.queue_tickets (patient_id);
create index queue_tickets_calibration_idx
  on public.queue_tickets (doctor_id, ended_at)
  where actual_minutes is not null;

-- Append-only history of every queue change. Used for auditing, waiting-time
-- measurement and debugging the hybrid merge and auto-defer.
create table public.queue_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.queue_tickets (id) on delete cascade,
  event_type public.queue_event_type not null,
  -- Staff member who caused the event; null for the patient or the system.
  actor_id uuid references public.profiles (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index queue_events_ticket_idx on public.queue_events (ticket_id, created_at);

-- ─── Notifications ──────────────────────────────────────────────────────────

-- WhatsApp outbox. A row is written for every message, also in stub mode.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.queue_tickets (id) on delete cascade,
  kind public.notification_kind not null,
  to_phone text not null check (to_phone ~ '^\+[1-9][0-9]{7,14}$'),
  body text not null,
  status public.notification_status not null default 'pending',
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_ticket_idx on public.notifications (ticket_id, created_at);
-- The 3-turn alert is sent at most once per ticket.
create unique index notifications_three_turns_once_idx
  on public.notifications (ticket_id)
  where kind = 'three_turns_alert';

-- ─── updated_at triggers ────────────────────────────────────────────────────

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger doctors_set_updated_at before update on public.doctors
  for each row execute function public.set_updated_at();
create trigger patients_set_updated_at before update on public.patients
  for each row execute function public.set_updated_at();
create trigger queue_tickets_set_updated_at before update on public.queue_tickets
  for each row execute function public.set_updated_at();

-- ─── Row-level security (policies come with the auth migration) ─────────────

alter table public.profiles enable row level security;
alter table public.doctors enable row level security;
alter table public.patients enable row level security;
alter table public.queue_tickets enable row level security;
alter table public.queue_events enable row level security;
alter table public.notifications enable row level security;
