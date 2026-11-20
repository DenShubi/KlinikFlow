-- KlinikFlow hybrid synchronizer: walk-in and remote patients in one queue
--
-- Everyone gets a place in one queue in the order they register, whether they
-- registered at the desk (walk-in) or from home (remote). The rules that keep
-- the two kinds of patient in step:
--
--   1. On time: a remote patient who checks in before their turn keeps their
--      place.
--   2. Missed turn: when the doctor calls the next patient and a remote
--      patient ahead of them has not arrived, that patient misses their turn.
--      They stop counting in other patients' wait estimates, and their ticket
--      page tells them to come in.
--   3. Rejoin: a remote patient who checks in after missing their turn joins
--      two places behind the patients who are at the clinic right now (the
--      same "two turns back" rule auto-defer uses). Walk-ins who waited in
--      the room are never pushed back by someone who was not there.
--
-- This migration also makes the queue functions the only way to change the
-- queue: they now run as SECURITY DEFINER with their own role checks, and
-- staff lose direct INSERT/UPDATE rights on queue_tickets and queue_events.
-- That keeps positions, numbers and events consistent.

-- ─── Schema ─────────────────────────────────────────────────────────────────

alter type public.queue_event_type add value if not exists 'missed_turn';
alter type public.queue_event_type add value if not exists 'rejoined';

alter table public.queue_tickets add column missed_turn_at timestamptz;

comment on column public.queue_tickets.missed_turn_at is
  'When this remote patient''s turn came while they had not arrived yet (null = never missed).';

-- How many present patients a late or absent patient goes behind.
create function private.rejoin_offset()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 2;
$$;

-- Moves a ticket to directly after another ticket of the same queue and day,
-- renumbering positions 1..n. Ticket numbers never change.
create function private.place_after(p_ticket_id uuid, p_after_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_doctor_id uuid;
  v_service_date date;
  v_after_position integer;
begin
  select t.doctor_id, t.service_date into v_doctor_id, v_service_date
  from public.queue_tickets t where t.id = p_ticket_id;
  select t.position into v_after_position
  from public.queue_tickets t where t.id = p_after_id;

  with ordered as (
    select t.id,
           row_number() over (
             order by case when t.id = p_ticket_id then v_after_position + 0.5 else t.position end
           ) as new_position
    from public.queue_tickets t
    where t.doctor_id = v_doctor_id and t.service_date = v_service_date
  )
  update public.queue_tickets t
  set position = o.new_position
  from ordered o
  where t.id = o.id and t.position <> o.new_position;
end;
$$;

revoke all on function private.rejoin_offset() from public;
revoke all on function private.place_after(uuid, uuid) from public;

-- ─── Estimates skip patients who missed their turn and are not here ─────────

create or replace function private.refresh_estimates(p_doctor_id uuid, p_service_date date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_cursor timestamptz := now();
  v_ticket record;
  v_eta timestamptz;
begin
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
    select t.id, t.status, t.called_at, t.predicted_minutes, t.estimated_call_at,
           (t.missed_turn_at is not null and t.checked_in_at is null) as missed_and_away
    from public.queue_tickets t
    where t.doctor_id = p_doctor_id
      and t.service_date = p_service_date
      and t.status in ('called', 'waiting')
    order by (t.status = 'called') desc, t.position
  loop
    if v_ticket.missed_and_away then
      -- Not in line until they arrive; they take no one's time.
      v_eta := null;
    else
      if v_ticket.status = 'called' then
        v_eta := v_ticket.called_at;
      else
        v_eta := v_cursor;
      end if;
      v_cursor := v_cursor + make_interval(mins => coalesce(v_ticket.predicted_minutes, private.fallback_minutes()));
    end if;

    if v_ticket.estimated_call_at is distinct from v_eta then
      update public.queue_tickets set estimated_call_at = v_eta where id = v_ticket.id;
    end if;
  end loop;
end;
$$;

-- ─── Queue functions (now SECURITY DEFINER) ─────────────────────────────────

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

create or replace function public.queue_check_in(p_ticket_id uuid)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
  v_after_id uuid;
  v_after_position integer;
  v_after_number integer;
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

  -- Rule 3: arrived after missing their turn -> join behind the next
  -- rejoin_offset() patients who are at the clinic now.
  if v_ticket.missed_turn_at is not null then
    select x.id, x.position, x.ticket_number into v_after_id, v_after_position, v_after_number
    from (
      select t.id, t.position, t.ticket_number
      from public.queue_tickets t
      where t.doctor_id = v_ticket.doctor_id
        and t.service_date = v_ticket.service_date
        and t.status = 'waiting'
        and t.checked_in_at is not null
        and t.id <> v_ticket.id
      order by t.position
      limit private.rejoin_offset()
    ) x
    order by x.position desc
    limit 1;

    if v_after_id is not null and v_after_position > v_ticket.position then
      perform private.place_after(v_ticket.id, v_after_id);
    end if;

    insert into public.queue_events (ticket_id, event_type, actor_id, details)
    values (
      p_ticket_id, 'rejoined', (select auth.uid()),
      jsonb_build_object('after_ticket_number', v_after_number, 'missed_turn_at', v_ticket.missed_turn_at)
    );
  end if;

  perform private.refresh_estimates(v_ticket.doctor_id, v_ticket.service_date);
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;
  return v_ticket;
end;
$$;

create or replace function public.queue_call_next(
  p_doctor_id uuid,
  p_service_date date default public.clinic_today()
)
returns public.queue_tickets
language plpgsql
security definer
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

  -- Next in line who is at the clinic.
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

  -- Rule 2: remote patients ahead who are not here miss their turn.
  with missed as (
    update public.queue_tickets t
    set missed_turn_at = now()
    where t.doctor_id = p_doctor_id and t.service_date = p_service_date
      and t.status = 'waiting'
      and t.checked_in_at is null
      and t.missed_turn_at is null
      and t.position < v_ticket.position
    returning t.id
  )
  insert into public.queue_events (ticket_id, event_type, actor_id, details)
  select m.id, 'missed_turn', (select auth.uid()),
         jsonb_build_object('called_instead_ticket_number', v_ticket.ticket_number)
  from missed m;

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

alter function public.queue_start_consultation(uuid) security definer;
alter function public.queue_finish_consultation(uuid) security definer;
alter function public.queue_cancel_ticket(uuid, text) security definer;

-- ─── Patient view: report a missed turn ─────────────────────────────────────

create or replace function public.ticket_public_status(p_ticket_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ticket_id', t.id,
    'ticket_code', d.ticket_prefix || '-' || lpad(t.ticket_number::text, 3, '0'),
    'doctor_id', t.doctor_id,
    'doctor_name', d.full_name,
    'room', d.room,
    'service_date', t.service_date,
    'status', t.status,
    'channel', t.channel,
    'checked_in', t.checked_in_at is not null,
    'missed_turn', t.missed_turn_at is not null and t.checked_in_at is null,
    'rejoin_offset', private.rejoin_offset(),
    'defer_count', t.defer_count,
    'patient_short_name',
      split_part(p.full_name, ' ', 1)
      || coalesce(' ' || nullif(left(split_part(p.full_name, ' ', 2), 1), '') || '.', ''),
    'predicted_minutes', t.predicted_minutes,
    'prediction_source', t.prediction_source,
    'estimated_call_at', t.estimated_call_at,
    -- Patients still to be called before this one: not those who missed
    -- their turn and are not here (0 once this one is called).
    'people_ahead', case when t.status = 'waiting' then (
      select count(*)
      from public.queue_tickets o
      where o.doctor_id = t.doctor_id
        and o.service_date = t.service_date
        and o.status in ('waiting', 'called')
        and o.position < t.position
        and not (o.missed_turn_at is not null and o.checked_in_at is null)
    ) else 0 end,
    'now_serving', (
      select d.ticket_prefix || '-' || lpad(o.ticket_number::text, 3, '0')
      from public.queue_tickets o
      where o.doctor_id = t.doctor_id
        and o.service_date = t.service_date
        and o.status in ('in_consultation', 'called')
      order by (o.status = 'in_consultation') desc, o.called_at desc
      limit 1
    )
  )
  from public.queue_tickets t
  join public.doctors d on d.id = t.doctor_id
  join public.patients p on p.id = t.patient_id
  where t.id = p_ticket_id;
$$;

-- ─── Only the queue functions write the queue ───────────────────────────────

drop policy "receptionist adds tickets" on public.queue_tickets;
drop policy "receptionist edits any ticket; doctor edits own queue" on public.queue_tickets;
drop policy "staff log events as themselves on tickets they can see" on public.queue_events;

revoke insert, update, delete on public.queue_tickets from anon, authenticated;
revoke insert, update, delete on public.queue_events from anon, authenticated;
