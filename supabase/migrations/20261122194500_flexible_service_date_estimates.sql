-- KlinikFlow: future service_date estimate calculation
--
-- When patients book for a future working day (p_service_date > clinic_today()),
-- estimated_call_at starts from the doctor's opens_at on that date (WIB) rather
-- than now(), then accumulates predicted_minutes down the queue.

create or replace function private.refresh_estimates(p_doctor_id uuid, p_service_date date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_opens_at time;
  v_base timestamptz;
  v_cursor timestamptz;
  v_ticket record;
  v_eta timestamptz;
begin
  select d.opens_at
    into v_opens_at
  from public.doctors d
  where d.id = p_doctor_id;

  -- Session start on p_service_date in clinic local time (WIB), never in the past.
  v_base := greatest(
    now(),
    ((p_service_date + coalesce(v_opens_at, time '08:00')) at time zone 'Asia/Jakarta')
  );

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

  v_cursor := coalesce(v_cursor, v_base);

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
