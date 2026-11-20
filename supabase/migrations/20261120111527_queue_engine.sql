-- KlinikFlow queue engine
--
-- Every queue change goes through one of these functions, so ticket numbers,
-- positions, timestamps, events and wait estimates always stay consistent:
--
--   queue_create_ticket        add a ticket at the end of a doctor's queue
--   queue_check_in             a remote patient has arrived at the clinic
--   queue_call_next            call the next arrived patient in line
--   queue_start_consultation   the called patient is with the doctor
--   queue_finish_consultation  consultation over; actual_minutes is saved
--   queue_cancel_ticket        remove a waiting or called ticket
--
-- They run as the caller (SECURITY INVOKER), so row-level security still
-- applies, and they check that the caller may manage that doctor's queue.
-- Errors use a short machine-readable message (e.g. 'queue_empty') that the
-- app translates for the user.
--
-- After every change the estimated call time of each waiting patient is
-- recalculated from the predicted minutes of everyone ahead of them.

-- ─── Internal helpers ───────────────────────────────────────────────────────

grant usage on schema private to service_role;

-- Receptionists manage every queue, a doctor only their own, and trusted
-- server code (secret key) everything.
create function private.assert_can_manage_queue(p_doctor_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return;
  end if;
  if (select private.staff_role()) = 'receptionist' then
    return;
  end if;
  if p_doctor_id is not null and (select private.staff_doctor_id()) = p_doctor_id then
    return;
  end if;
  raise exception 'not_allowed' using errcode = '42501';
end;
$$;

-- Serialises changes to one doctor's queue for one day (until the transaction ends),
-- so two clicks at the same moment cannot get the same number or both call a patient.
create function private.lock_queue(p_doctor_id uuid, p_service_date date)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_doctor_id::text || '/' || p_service_date::text, 0));
$$;

-- Default consultation length when a ticket has no prediction.
create function private.fallback_minutes()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 10;
$$;

-- Recalculates estimated_call_at for the doctor's active tickets of one day:
-- the called patient keeps their call time; each waiting patient is estimated
-- after the remaining time of the current consultation plus the predicted
-- minutes of everyone ahead of them.
create function private.refresh_estimates(p_doctor_id uuid, p_service_date date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_cursor timestamptz := now();
  v_ticket record;
  v_eta timestamptz;
begin
  -- Patient with the doctor: expected to finish after their predicted minutes
  -- (at least one more minute if they are running over).
  select greatest(
           t.started_at + make_interval(mins => coalesce(t.predicted_minutes, private.fallback_minutes())),
           now() + interval '1 minute')
    into v_cursor
  from public.queue_tickets t
  where t.doctor_id = p_doctor_id
    and t.service_date = p_service_date
    and t.status = 'in_consultation'
  order by t.started_at
  limit 1;
  v_cursor := coalesce(v_cursor, now());

  for v_ticket in
    select t.id, t.status, t.called_at, t.predicted_minutes, t.estimated_call_at
    from public.queue_tickets t
    where t.doctor_id = p_doctor_id
      and t.service_date = p_service_date
      and t.status in ('called', 'waiting')
    order by (t.status = 'called') desc, t.position
  loop
    if v_ticket.status = 'called' then
      v_eta := v_ticket.called_at;
    else
      v_eta := v_cursor;
    end if;
    v_cursor := v_cursor + make_interval(mins => coalesce(v_ticket.predicted_minutes, private.fallback_minutes()));

    if v_ticket.estimated_call_at is distinct from v_eta then
      update public.queue_tickets set estimated_call_at = v_eta where id = v_ticket.id;
    end if;
  end loop;
end;
$$;

-- Loads and locks one ticket after checking the caller may manage its queue.
create function private.load_ticket_for_update(p_ticket_id uuid)
returns public.queue_tickets
language plpgsql
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
begin
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;
  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
  perform private.assert_can_manage_queue(v_ticket.doctor_id);
  perform private.lock_queue(v_ticket.doctor_id, v_ticket.service_date);
  -- Re-read under the lock so the status check below sees the latest state.
  select * into v_ticket from public.queue_tickets where id = p_ticket_id for update;
  return v_ticket;
end;
$$;

-- ─── Public queue operations ────────────────────────────────────────────────

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
  p_service_date date default public.clinic_today()
)
returns public.queue_tickets
language plpgsql
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
  v_number integer;
  v_position integer;
begin
  perform private.assert_can_manage_queue(p_doctor_id);

  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.is_active) then
    raise exception 'doctor_not_available' using errcode = 'P0001';
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
    -- A walk-in patient is already at the clinic; a remote patient checks in on arrival.
    case when p_channel = 'walk_in' then now() end,
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

create function public.queue_check_in(p_ticket_id uuid)
returns public.queue_tickets
language plpgsql
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
begin
  v_ticket := private.load_ticket_for_update(p_ticket_id);

  if v_ticket.status not in ('waiting', 'called') then
    raise exception 'invalid_status' using errcode = 'P0001',
      detail = format('ticket is %s', v_ticket.status);
  end if;
  if v_ticket.checked_in_at is not null then
    return v_ticket; -- already here; nothing to do
  end if;

  update public.queue_tickets set checked_in_at = now()
  where id = p_ticket_id
  returning * into v_ticket;

  insert into public.queue_events (ticket_id, event_type, actor_id)
  values (p_ticket_id, 'checked_in', (select auth.uid()));

  return v_ticket;
end;
$$;

create function public.queue_call_next(
  p_doctor_id uuid,
  p_service_date date default public.clinic_today()
)
returns public.queue_tickets
language plpgsql
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
begin
  perform private.assert_can_manage_queue(p_doctor_id);
  perform private.lock_queue(p_doctor_id, p_service_date);

  if exists (
    select 1 from public.queue_tickets t
    where t.doctor_id = p_doctor_id and t.service_date = p_service_date
      and t.status = 'in_consultation'
  ) then
    raise exception 'consultation_in_progress' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.queue_tickets t
    where t.doctor_id = p_doctor_id and t.service_date = p_service_date
      and t.status = 'called'
  ) then
    raise exception 'patient_already_called' using errcode = 'P0001';
  end if;

  -- Next in line who is at the clinic. Remote patients who have not arrived
  -- keep their place and are skipped until they check in.
  select * into v_ticket
  from public.queue_tickets t
  where t.doctor_id = p_doctor_id and t.service_date = p_service_date
    and t.status = 'waiting' and t.checked_in_at is not null
  order by t.position
  limit 1
  for update;

  if not found then
    if exists (
      select 1 from public.queue_tickets t
      where t.doctor_id = p_doctor_id and t.service_date = p_service_date and t.status = 'waiting'
    ) then
      raise exception 'no_patient_arrived' using errcode = 'P0001';
    end if;
    raise exception 'queue_empty' using errcode = 'P0001';
  end if;

  update public.queue_tickets set status = 'called', called_at = now()
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.queue_events (ticket_id, event_type, actor_id, details)
  values (v_ticket.id, 'called', (select auth.uid()), jsonb_build_object('position', v_ticket.position));

  perform private.refresh_estimates(p_doctor_id, p_service_date);
  select * into v_ticket from public.queue_tickets where id = v_ticket.id;
  return v_ticket;
end;
$$;

create function public.queue_start_consultation(p_ticket_id uuid)
returns public.queue_tickets
language plpgsql
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
begin
  v_ticket := private.load_ticket_for_update(p_ticket_id);

  if v_ticket.status <> 'called' then
    raise exception 'invalid_status' using errcode = 'P0001',
      detail = format('ticket is %s, expected called', v_ticket.status);
  end if;

  update public.queue_tickets
  set status = 'in_consultation',
      started_at = now(),
      checked_in_at = coalesce(checked_in_at, now())
  where id = p_ticket_id
  returning * into v_ticket;

  insert into public.queue_events (ticket_id, event_type, actor_id)
  values (p_ticket_id, 'consultation_started', (select auth.uid()));

  perform private.refresh_estimates(v_ticket.doctor_id, v_ticket.service_date);
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;
  return v_ticket;
end;
$$;

create function public.queue_finish_consultation(p_ticket_id uuid)
returns public.queue_tickets
language plpgsql
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
begin
  v_ticket := private.load_ticket_for_update(p_ticket_id);

  if v_ticket.status <> 'in_consultation' then
    raise exception 'invalid_status' using errcode = 'P0001',
      detail = format('ticket is %s, expected in_consultation', v_ticket.status);
  end if;

  update public.queue_tickets
  set status = 'done', ended_at = now(), estimated_call_at = null
  where id = p_ticket_id
  returning * into v_ticket;

  -- actual_minutes is generated from started_at/ended_at; logged for calibration.
  insert into public.queue_events (ticket_id, event_type, actor_id, details)
  values (
    p_ticket_id, 'consultation_ended', (select auth.uid()),
    jsonb_build_object(
      'predicted_minutes', v_ticket.predicted_minutes,
      'actual_minutes', v_ticket.actual_minutes,
      'prediction_source', v_ticket.prediction_source
    )
  );

  perform private.refresh_estimates(v_ticket.doctor_id, v_ticket.service_date);
  return v_ticket;
end;
$$;

create function public.queue_cancel_ticket(p_ticket_id uuid, p_reason text default null)
returns public.queue_tickets
language plpgsql
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
begin
  v_ticket := private.load_ticket_for_update(p_ticket_id);

  if v_ticket.status not in ('waiting', 'called') then
    raise exception 'invalid_status' using errcode = 'P0001',
      detail = format('ticket is %s', v_ticket.status);
  end if;

  update public.queue_tickets
  set status = 'cancelled', estimated_call_at = null
  where id = p_ticket_id
  returning * into v_ticket;

  insert into public.queue_events (ticket_id, event_type, actor_id, details)
  values (
    p_ticket_id, 'cancelled', (select auth.uid()),
    case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason', p_reason) end
  );

  perform private.refresh_estimates(v_ticket.doctor_id, v_ticket.service_date);
  return v_ticket;
end;
$$;

-- ─── Permissions ────────────────────────────────────────────────────────────
-- Only signed-in staff and trusted server code may call queue operations.

revoke all on function private.assert_can_manage_queue(uuid) from public;
revoke all on function private.lock_queue(uuid, date) from public;
revoke all on function private.fallback_minutes() from public;
revoke all on function private.refresh_estimates(uuid, date) from public;
revoke all on function private.load_ticket_for_update(uuid) from public;
grant execute on function private.assert_can_manage_queue(uuid) to authenticated, service_role;
grant execute on function private.lock_queue(uuid, date) to authenticated, service_role;
grant execute on function private.fallback_minutes() to authenticated, service_role;
grant execute on function private.refresh_estimates(uuid, date) to authenticated, service_role;
grant execute on function private.load_ticket_for_update(uuid) to authenticated, service_role;

revoke all on function public.queue_create_ticket(
  uuid, uuid, public.ticket_channel, text, boolean, integer, public.prediction_source, numeric, text, text, date
) from public, anon;
revoke all on function public.queue_check_in(uuid) from public, anon;
revoke all on function public.queue_call_next(uuid, date) from public, anon;
revoke all on function public.queue_start_consultation(uuid) from public, anon;
revoke all on function public.queue_finish_consultation(uuid) from public, anon;
revoke all on function public.queue_cancel_ticket(uuid, text) from public, anon;

grant execute on function public.queue_create_ticket(
  uuid, uuid, public.ticket_channel, text, boolean, integer, public.prediction_source, numeric, text, text, date
) to authenticated, service_role;
grant execute on function public.queue_check_in(uuid) to authenticated, service_role;
grant execute on function public.queue_call_next(uuid, date) to authenticated, service_role;
grant execute on function public.queue_start_consultation(uuid) to authenticated, service_role;
grant execute on function public.queue_finish_consultation(uuid) to authenticated, service_role;
grant execute on function public.queue_cancel_ticket(uuid, text) to authenticated, service_role;

-- ─── Realtime ───────────────────────────────────────────────────────────────
-- Screens subscribe to ticket changes. Realtime applies the same RLS, so a
-- doctor only receives changes to their own queue.

alter publication supabase_realtime add table public.queue_tickets;
