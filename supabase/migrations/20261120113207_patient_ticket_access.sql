-- KlinikFlow patient access to their own ticket
--
-- Patients do not sign in. Their ticket page is reached through a link that
-- contains the ticket id (a random UUID), and reads this function, which
-- returns only what the patient needs: no phone number, no complaint, no
-- other patients' names.
--
-- Live updates for patients use a public Realtime broadcast per queue
-- ("queue:<doctor_id>:<date>") whose message carries no personal data; the
-- page re-reads ticket_public_status when it hears one.

-- ─── Ticket status for the patient ──────────────────────────────────────────

create function public.ticket_public_status(p_ticket_id uuid)
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
    'defer_count', t.defer_count,
    -- First name and last initial only, so the patient recognises their ticket.
    'patient_short_name',
      split_part(p.full_name, ' ', 1)
      || coalesce(' ' || nullif(left(split_part(p.full_name, ' ', 2), 1), '') || '.', ''),
    'predicted_minutes', t.predicted_minutes,
    'prediction_source', t.prediction_source,
    'estimated_call_at', t.estimated_call_at,
    -- Patients still to be called before this one (0 once this one is called).
    'people_ahead', case when t.status = 'waiting' then (
      select count(*)
      from public.queue_tickets o
      where o.doctor_id = t.doctor_id
        and o.service_date = t.service_date
        and o.status in ('waiting', 'called')
        and o.position < t.position
    ) else 0 end,
    -- Ticket currently with the doctor (or called to the room), if any.
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

comment on function public.ticket_public_status(uuid) is
  'What a patient may see about their own ticket, given its id. No contact or medical data.';

revoke all on function public.ticket_public_status(uuid) from public;
grant execute on function public.ticket_public_status(uuid) to anon, authenticated, service_role;

-- ─── Public broadcast when a queue changes ──────────────────────────────────

create function private.broadcast_queue_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue record;
begin
  for v_queue in select distinct doctor_id, service_date from new_rows loop
    begin
      perform realtime.send(
        jsonb_build_object('doctor_id', v_queue.doctor_id, 'service_date', v_queue.service_date),
        'queue_changed',
        'queue:' || v_queue.doctor_id::text || ':' || v_queue.service_date::text,
        false -- public channel: patients are not signed in
      );
    exception when others then
      -- A Realtime hiccup must never block a queue change.
      raise warning 'broadcast_queue_changes failed: %', sqlerrm;
    end;
  end loop;
  return null;
end;
$$;

revoke all on function private.broadcast_queue_changes() from public;

create trigger queue_tickets_broadcast_insert
  after insert on public.queue_tickets
  referencing new table as new_rows
  for each statement execute function private.broadcast_queue_changes();

create trigger queue_tickets_broadcast_update
  after update on public.queue_tickets
  referencing new table as new_rows
  for each statement execute function private.broadcast_queue_changes();
