-- KlinikFlow: visit details from the intake forms
--
-- Both intake forms (patient and receptionist) now ask for a few coarse,
-- non-identifying details that change how long a consultation takes:
--
--   visit_purpose          why the patient comes (new complaint, follow-up,
--                          routine check, certificate, procedure)
--   is_new_patient         first visit to this doctor
--   has_chronic_condition  yes/no only; the specific condition is not stored
--   patient_age_years      age in whole years at this visit, instead of a full
--                          birth date (data minimisation). patients.birth_date
--                          stays for older rows and the demo data.
--
-- They are passed to the AI estimator and stored on the ticket. Receptionists
-- and doctors read them through the existing row-level security on
-- queue_tickets. public.ticket_public_status (the patient page) does NOT
-- return them: it builds its JSON from an explicit list of fields.
-- Gender is deliberately not collected.

create type public.visit_purpose as enum ('new_complaint', 'follow_up', 'routine_check', 'certificate', 'procedure');

alter table public.queue_tickets
  add column visit_purpose public.visit_purpose,
  add column is_new_patient boolean,
  add column has_chronic_condition boolean,
  add column patient_age_years smallint check (patient_age_years between 0 and 120);

comment on column public.queue_tickets.visit_purpose is 'Why the patient comes, chosen on the intake form.';
comment on column public.queue_tickets.is_new_patient is 'First visit to this doctor (from the intake form).';
comment on column public.queue_tickets.has_chronic_condition is 'Patient reports a chronic condition (yes/no only).';
comment on column public.queue_tickets.patient_age_years is 'Age in whole years at this visit (from the intake form).';

-- queue_create_ticket gains four optional parameters. The argument list
-- changes, so the old function is dropped first (otherwise both would exist).
drop function public.queue_create_ticket(
  uuid, uuid, public.ticket_channel, text, boolean, integer, public.prediction_source, numeric, text, text, date
);

create function public.queue_create_ticket(
  p_doctor_id uuid,
  p_patient_id uuid,
  p_channel public.ticket_channel,
  p_complaint text,
  p_is_follow_up boolean default false,
  p_predicted_minutes integer default null,
  p_prediction_source public.prediction_source default null,
  p_prediction_confidence numeric default null,
  p_prediction_model text default null,
  p_ai_summary text default null,
  p_service_date date default public.clinic_today(),
  p_visit_purpose public.visit_purpose default null,
  p_is_new_patient boolean default null,
  p_has_chronic_condition boolean default null,
  p_patient_age_years integer default null
)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
  v_number integer;
  v_position integer;
begin
  -- Only the receptionist and trusted server code (patient intake) add tickets.
  if (select auth.role()) is distinct from 'service_role'
     and (select private.staff_role()) is distinct from 'receptionist' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active) then
    raise exception 'doctor_not_available' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.patients p where p.id = p_patient_id) then
    raise exception 'patient_not_found' using errcode = 'P0002';
  end if;
  if p_complaint is null or length(trim(p_complaint)) = 0 then
    raise exception 'complaint_required' using errcode = '22023';
  end if;

  perform private.lock_queue(p_doctor_id, p_service_date);

  select coalesce(max(t.ticket_number), 0) + 1, coalesce(max(t.position), 0) + 1
    into v_number, v_position
  from public.queue_tickets t
  where t.doctor_id = p_doctor_id and t.service_date = p_service_date;

  insert into public.queue_tickets (
    doctor_id, patient_id, service_date, ticket_number, position, channel, status,
    complaint, is_follow_up,
    predicted_minutes, prediction_source, prediction_confidence, prediction_model, ai_summary,
    checked_in_at, created_by,
    visit_purpose, is_new_patient, has_chronic_condition, patient_age_years
  ) values (
    p_doctor_id, p_patient_id, p_service_date, v_number, v_position, p_channel, 'waiting',
    trim(p_complaint), coalesce(p_is_follow_up, false),
    p_predicted_minutes, p_prediction_source, p_prediction_confidence, p_prediction_model, p_ai_summary,
    null, -- every patient is marked as arrived by the receptionist (queue_check_in)
    (select auth.uid()),
    p_visit_purpose, p_is_new_patient, p_has_chronic_condition, p_patient_age_years
  )
  returning * into v_ticket;

  insert into public.queue_events (ticket_id, event_type, actor_id, details)
  values (
    v_ticket.id, 'created', (select auth.uid()),
    jsonb_build_object(
      'channel', p_channel,
      'position', v_position,
      'predicted_minutes', p_predicted_minutes,
      'prediction_source', p_prediction_source
    )
  );

  perform private.refresh_estimates(p_doctor_id, p_service_date);
  select * into v_ticket from public.queue_tickets where id = v_ticket.id;
  return v_ticket;
end;
$$;

revoke all on function public.queue_create_ticket(
  uuid, uuid, public.ticket_channel, text, boolean, integer, public.prediction_source, numeric, text, text, date,
  public.visit_purpose, boolean, boolean, integer
) from public, anon;
grant execute on function public.queue_create_ticket(
  uuid, uuid, public.ticket_channel, text, boolean, integer, public.prediction_source, numeric, text, text, date,
  public.visit_purpose, boolean, boolean, integer
) to authenticated, service_role;

-- Slot length used when a ticket has no prediction: the estimator's new
-- fallback (5 consultation minutes) plus 1 minute of patient changeover.
create or replace function private.fallback_minutes()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 6;
$$;
