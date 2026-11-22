-- KlinikFlow: doctor working hours, and every patient confirms arrival
--
-- 1. Working hours. Each doctor has working days and opening hours, in clinic
--    time (WIB). Defaults follow formal Indonesian office hours: Monday to
--    Friday, 08:00-16:00. The app shows a doctor as closed outside these
--    hours and patients cannot register for a closed doctor. The queue
--    functions do not enforce hours, so staff can still add a patient.
--
-- 2. Walk-ins confirm arrival too. A walk-in patient may register when the
--    queue is long and go home in the meantime, so a new ticket is no longer
--    marked as arrived automatically. The receptionist marks every patient as
--    arrived ("Tiba") when they are at the clinic; until then the hybrid
--    synchronizer treats them like a remote patient (missed turn, rejoin two
--    places behind the patients present).

alter table public.doctors
  add column work_days smallint[] not null default '{1,2,3,4,5}',
  add column opens_at time not null default '08:00',
  add column closes_at time not null default '16:00',
  add constraint doctors_work_days_valid check (work_days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  add constraint doctors_hours_order check (opens_at < closes_at);

comment on column public.doctors.work_days is 'ISO weekdays the doctor works (1 = Monday ... 7 = Sunday), clinic time.';
comment on column public.doctors.opens_at is 'Start of working hours, clinic time (WIB).';
comment on column public.doctors.closes_at is 'End of working hours, clinic time (WIB).';

create or replace function public.queue_create_ticket(
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
  p_service_date date default public.clinic_today()
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
    checked_in_at, created_by
  ) values (
    p_doctor_id, p_patient_id, p_service_date, v_number, v_position, p_channel, 'waiting',
    trim(p_complaint), coalesce(p_is_follow_up, false),
    p_predicted_minutes, p_prediction_source, p_prediction_confidence, p_prediction_model, p_ai_summary,
    null, -- every patient is marked as arrived by the receptionist (queue_check_in)
    (select auth.uid())
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
