-- KlinikFlow auto-defer: a called patient who does not come in moves back
--
-- When the doctor calls a patient who does not come into the room:
--
--   1. The patient moves back two turns: behind the next rejoin_offset() (2)
--      patients who are at the clinic, status back to 'waiting',
--      defer_count + 1, event 'deferred'. They keep their arrival mark, so
--      they are called again after those two patients.
--   2. On the third absence (already deferred max_defers() = 2 times) the
--      ticket becomes 'no_show' and leaves the queue. The receptionist can
--      register the patient again.
--
-- Triggered two ways:
--   - manually: the doctor presses "Tidak hadir" (public.queue_mark_absent)
--   - automatically: a called patient who has not been started after
--     absent_after() (5 minutes) is deferred by a pg_cron job every minute.

-- ─── Settings ───────────────────────────────────────────────────────────────

create function private.max_defers()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 2;
$$;

create function private.absent_after()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '5 minutes';
$$;

-- ─── Core: defer (or no-show) one called ticket ─────────────────────────────
-- The caller has checked permission, locked the queue and verified the
-- ticket is 'called'.

create function private.defer_called_ticket(p_ticket_id uuid, p_reason text, p_actor uuid)
returns public.queue_tickets
language plpgsql
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
  v_after_id uuid;
  v_after_position integer;
  v_after_number integer;
begin
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;

  if v_ticket.defer_count >= private.max_defers() then
    update public.queue_tickets
    set status = 'no_show', called_at = null, estimated_call_at = null
    where id = p_ticket_id
    returning * into v_ticket;

    insert into public.queue_events (ticket_id, event_type, actor_id, details)
    values (
      p_ticket_id, 'no_show', p_actor,
      jsonb_build_object('reason', p_reason, 'defer_count', v_ticket.defer_count)
    );
  else
    -- The rejoin_offset()-th waiting patient who is at the clinic, after this one.
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

    update public.queue_tickets
    set status = 'waiting', called_at = null, defer_count = defer_count + 1
    where id = p_ticket_id;

    if v_after_id is not null and v_after_position > v_ticket.position then
      perform private.place_after(p_ticket_id, v_after_id);
    end if;

    insert into public.queue_events (ticket_id, event_type, actor_id, details)
    values (
      p_ticket_id, 'deferred', p_actor,
      jsonb_build_object(
        'reason', p_reason,
        'defer_count', v_ticket.defer_count + 1,
        'moved_behind_ticket_number', v_after_number
      )
    );
  end if;

  perform private.refresh_estimates(v_ticket.doctor_id, v_ticket.service_date);
  select * into v_ticket from public.queue_tickets where id = p_ticket_id;
  return v_ticket;
end;
$$;

-- ─── Manual: the doctor (or receptionist) marks a called patient absent ─────

create function public.queue_mark_absent(p_ticket_id uuid)
returns public.queue_tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.queue_tickets;
begin
  v_ticket := private.load_ticket_for_update(p_ticket_id); -- checks permission, locks the queue

  if v_ticket.status <> 'called' then
    raise exception 'invalid_status' using errcode = 'P0001',
      detail = format('ticket is %s, expected called', v_ticket.status);
  end if;

  return private.defer_called_ticket(p_ticket_id, 'manual', (select auth.uid()));
end;
$$;

-- ─── Automatic: called too long ago and not started ─────────────────────────

create function private.auto_defer_absent()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
  v_count integer := 0;
begin
  for v_ticket in
    select t.id, t.doctor_id, t.service_date
    from public.queue_tickets t
    where t.status = 'called'
      and t.service_date = public.clinic_today()
      and t.called_at < now() - private.absent_after()
  loop
    perform private.lock_queue(v_ticket.doctor_id, v_ticket.service_date);
    -- Re-check under the lock: the doctor may have started the consultation.
    if exists (
      select 1 from public.queue_tickets t
      where t.id = v_ticket.id and t.status = 'called' and t.called_at < now() - private.absent_after()
    ) then
      perform private.defer_called_ticket(v_ticket.id, 'auto', null);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ─── Permissions ────────────────────────────────────────────────────────────

revoke all on function private.max_defers() from public;
revoke all on function private.absent_after() from public;
revoke all on function private.defer_called_ticket(uuid, text, uuid) from public;
revoke all on function private.auto_defer_absent() from public;
grant execute on function private.max_defers() to authenticated, service_role;

revoke all on function public.queue_mark_absent(uuid) from public, anon;
grant execute on function public.queue_mark_absent(uuid) to authenticated, service_role;

-- ─── Schedule (pg_cron, where available) ────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('auto-defer-absent', '* * * * *', 'select private.auto_defer_absent()');
  else
    raise notice 'pg_cron not available: absent patients are only deferred with the "Tidak hadir" button';
  end if;
end;
$$;
