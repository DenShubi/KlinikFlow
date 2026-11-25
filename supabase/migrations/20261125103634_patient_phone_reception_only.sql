-- KlinikFlow: patient phone numbers are for the receptionist only
--
-- Row-level security decides which patient ROWS each role sees (a doctor:
-- only the patients in their own queue). It does not hide COLUMNS, so a
-- signed-in doctor could still read patients.phone through the Data API even
-- though the doctor screens never show it. This migration closes that gap:
--
--   - Signed-in staff (role "authenticated") may read every patients column
--     except phone. Inserting and updating patients is unchanged (the
--     receptionist's RLS policies still apply).
--   - The anonymous role loses read access to patients entirely (RLS already
--     returned no rows; now the table itself is closed too).
--   - The receptionist reads phone numbers through
--     public.reception_patient_phones(service_date), which refuses everyone
--     else with 'not_allowed'.
--
-- Trusted server code (secret key, e.g. the patient intake) and the queue
-- functions (SECURITY DEFINER) are not affected.
--
-- Note: column grants are explicit. A column added to patients later is NOT
-- readable by staff until it is added to the grant below.

revoke select on public.patients from anon, authenticated;

grant select (id, full_name, birth_date, created_at, updated_at)
  on public.patients to authenticated;

-- Phone numbers of the patients in one day's queues, for the receptionist.
create function public.reception_patient_phones(p_service_date date default public.clinic_today())
returns table (patient_id uuid, phone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.role()) is distinct from 'service_role'
     and (select private.staff_role()) is distinct from 'receptionist' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  return query
    select distinct p.id, p.phone
    from public.queue_tickets t
    join public.patients p on p.id = t.patient_id
    where t.service_date = p_service_date
      and p.phone is not null;
end;
$$;

comment on function public.reception_patient_phones(date) is
  'WhatsApp numbers of the patients in one day''s queues. Receptionist (and trusted server code) only.';

revoke all on function public.reception_patient_phones(date) from public, anon;
grant execute on function public.reception_patient_phones(date) to authenticated, service_role;
