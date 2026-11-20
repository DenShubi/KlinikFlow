-- Keep wait estimates current while nothing happens in a queue.
--
-- Estimates are recalculated after every queue change, but time also passes
-- between changes: a consultation can run over, or the doctor can be idle.
-- This job recalculates every active queue of today once a minute, so the
-- patient's "called in about N minutes" never points to a time already past.
-- Only rows whose estimate changed are written (see private.refresh_estimates).

create function private.refresh_all_estimates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue record;
begin
  for v_queue in
    select distinct t.doctor_id, t.service_date
    from public.queue_tickets t
    where t.service_date = public.clinic_today()
      and t.status in ('waiting', 'called', 'in_consultation')
  loop
    perform private.refresh_estimates(v_queue.doctor_id, v_queue.service_date);
  end loop;
end;
$$;

revoke all on function private.refresh_all_estimates() from public;

-- Schedule with pg_cron where available (Supabase hosted and local stack).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('refresh-queue-estimates', '* * * * *', 'select private.refresh_all_estimates()');
  else
    raise notice 'pg_cron not available: wait estimates refresh only on queue changes';
  end if;
end;
$$;

-- Bring existing estimates up to date now.
select private.refresh_all_estimates();
