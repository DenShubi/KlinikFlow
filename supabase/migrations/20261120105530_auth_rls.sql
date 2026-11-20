-- KlinikFlow auth and role-based access (row-level security)
--
-- Staff sign in with Supabase Auth. Their role lives in public.profiles, which
-- only trusted server code (secret key) can write. Every policy below is for
-- the "authenticated" role; the anonymous role gets no access to any table.
--
--                      receptionist             doctor
--   profiles           all staff                own profile
--   doctors            read                     read
--   patients           read, add, edit          read, only patients in own queue
--   queue_tickets      read all, add, edit      read and edit own queue only
--   queue_events       read all, add            read and add for own queue only
--   notifications      read                     none
--
-- Patients do not log in; patient-facing pages read through server code.

-- ─── Role helpers ───────────────────────────────────────────────────────────
-- In a schema that the Data API does not expose. SECURITY DEFINER so the lookup
-- is not itself filtered by RLS (which would recurse on profiles).

create schema if not exists private;
grant usage on schema private to authenticated;

create function private.staff_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

comment on function private.staff_role() is
  'Role of the signed-in staff member, or null when the user has no staff profile.';

create function private.staff_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id
  from public.doctors d
  join public.profiles p on p.id = d.profile_id
  where p.id = (select auth.uid()) and p.role = 'doctor';
$$;

comment on function private.staff_doctor_id() is
  'doctors.id of the signed-in doctor, or null for anyone else.';

revoke all on function private.staff_role() from public;
revoke all on function private.staff_doctor_id() from public;
grant execute on function private.staff_role() to authenticated;
grant execute on function private.staff_doctor_id() to authenticated;

-- ─── profiles ───────────────────────────────────────────────────────────────

create policy "staff read own profile; receptionist reads all staff"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.staff_role()) = 'receptionist'
  );

-- ─── doctors ────────────────────────────────────────────────────────────────

create policy "staff read doctors"
  on public.doctors for select to authenticated
  using ((select private.staff_role()) is not null);

-- ─── patients ───────────────────────────────────────────────────────────────

create policy "receptionist reads all patients; doctor reads own queue's patients"
  on public.patients for select to authenticated
  using (
    (select private.staff_role()) = 'receptionist'
    or exists (
      select 1
      from public.queue_tickets t
      where t.patient_id = patients.id
        and t.doctor_id = (select private.staff_doctor_id())
    )
  );

create policy "receptionist adds patients"
  on public.patients for insert to authenticated
  with check ((select private.staff_role()) = 'receptionist');

create policy "receptionist edits patients"
  on public.patients for update to authenticated
  using ((select private.staff_role()) = 'receptionist')
  with check ((select private.staff_role()) = 'receptionist');

-- ─── queue_tickets ──────────────────────────────────────────────────────────

create policy "receptionist reads all tickets; doctor reads own queue"
  on public.queue_tickets for select to authenticated
  using (
    (select private.staff_role()) = 'receptionist'
    or doctor_id = (select private.staff_doctor_id())
  );

create policy "receptionist adds tickets"
  on public.queue_tickets for insert to authenticated
  with check ((select private.staff_role()) = 'receptionist');

create policy "receptionist edits any ticket; doctor edits own queue"
  on public.queue_tickets for update to authenticated
  using (
    (select private.staff_role()) = 'receptionist'
    or doctor_id = (select private.staff_doctor_id())
  )
  with check (
    (select private.staff_role()) = 'receptionist'
    or doctor_id = (select private.staff_doctor_id())
  );

-- ─── queue_events ───────────────────────────────────────────────────────────
-- Visible when the ticket is visible (the subquery is itself filtered by the
-- queue_tickets policy above).

create policy "staff read events of tickets they can see"
  on public.queue_events for select to authenticated
  using (
    exists (select 1 from public.queue_tickets t where t.id = queue_events.ticket_id)
  );

create policy "staff log events as themselves on tickets they can see"
  on public.queue_events for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and exists (select 1 from public.queue_tickets t where t.id = queue_events.ticket_id)
  );

-- ─── notifications ──────────────────────────────────────────────────────────
-- Written only by server code with the secret key.

create policy "receptionist reads notifications"
  on public.notifications for select to authenticated
  using ((select private.staff_role()) = 'receptionist');
