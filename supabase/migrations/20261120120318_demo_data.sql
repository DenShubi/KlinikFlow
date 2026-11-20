-- KlinikFlow synthetic demo data generator
--
-- The seed used to build visits in a one-off script, so "today's queue" only
-- existed on the day the seed ran. Moving the generator into the database lets
-- the demo be refreshed on any day (npm run demo:refresh) without wiping
-- history or staff accounts.
--
-- ALL GENERATED DATA IS SYNTHETIC. It reuses the synthetic patients from the
-- seed (WhatsApp numbers in the non-mobile +62 800 range).

-- Complaint catalogue. base_minutes is the "true" typical length used to
-- simulate actual durations.
create table private.demo_complaints (
  complaint text primary key,
  base_minutes integer not null,
  age_group text not null check (age_group in ('child', 'adult', 'any')),
  follow_up_rate numeric not null check (follow_up_rate between 0 and 1)
);

insert into private.demo_complaints values
  ('Batuk pilek sejak 2 hari, tidak sesak', 9, 'any', 0.05),
  ('Demam 2 hari disertai sakit kepala', 12, 'any', 0.05),
  ('Kontrol tekanan darah rutin', 6, 'adult', 0.9),
  ('Kontrol gula darah, minta resep lanjutan', 7, 'adult', 0.9),
  ('Minta surat keterangan sehat untuk melamar kerja', 5, 'adult', 0),
  ('Sakit perut dan diare sejak semalam', 12, 'any', 0.05),
  ('Nyeri ulu hati dan mual setelah makan', 11, 'adult', 0.2),
  ('Gatal-gatal dan ruam merah di lengan', 9, 'any', 0.15),
  ('Sakit tenggorokan dan sulit menelan', 9, 'any', 0.05),
  ('Anak demam sejak kemarin disertai muntah', 17, 'child', 0.05),
  ('Anak batuk berdahak sudah seminggu', 14, 'child', 0.2),
  ('Demam tinggi 4 hari, badan lemas', 18, 'any', 0.1),
  ('Luka gores di kaki, minta dibersihkan dan diperban', 18, 'any', 0),
  ('Ganti perban luka pasca jahitan', 15, 'any', 1),
  ('Nyeri punggung bawah setelah mengangkat barang', 11, 'adult', 0.15),
  ('Pusing berputar sejak pagi', 13, 'adult', 0.05),
  ('Sesak napas ringan, ada riwayat asma', 16, 'any', 0.3),
  ('Sakit kepala sebelah yang sering kambuh', 10, 'adult', 0.25),
  ('Mata merah dan berair sejak kemarin', 8, 'any', 0.05),
  ('Nyeri lutut saat berjalan', 11, 'adult', 0.3),
  ('Nyeri saat buang air kecil', 12, 'adult', 0.1),
  ('Kontrol hasil pemeriksaan laboratorium', 8, 'adult', 1),
  ('Sariawan tidak sembuh dua minggu', 8, 'any', 0.1),
  ('Nyeri dada sejak pagi disertai sesak dan keringat dingin', 25, 'adult', 0);

alter table private.demo_complaints enable row level security;

-- Generates one clinic day of synthetic visits for every active doctor.
-- A past day is a full day from 08:00 WIB, all finished. Today is a queue in
-- progress around now(): 3 done, 1 with the doctor, 8 waiting (walk-in and
-- remote, two remote patients not yet arrived, one deferred).
-- Returns the number of tickets created. The day must have no tickets yet.
create function private.generate_demo_day(p_day date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_doctor record;
  v_today date := public.clinic_today();
  v_is_today boolean := p_day = public.clinic_today();
  v_n int;
  v_i int;
  v_total int := 0;
  v_clock timestamptz;      -- when the doctor is free next
  v_arrival timestamptz;
  v_complaint record;
  v_patient uuid;
  v_channel public.ticket_channel;
  v_status public.ticket_status;
  v_follow_up boolean;
  v_source public.prediction_source;
  v_predicted int;
  v_confidence numeric;
  v_actual numeric;
  v_created timestamptz;
  v_checked_in timestamptz;
  v_called timestamptz;
  v_started timestamptz;
  v_ended timestamptz;
  v_deferred boolean;
  v_eta timestamptz;
  v_ticket uuid;
  v_fallback constant int := 10;
begin
  if p_day > v_today then
    raise exception 'cannot generate visits for a future day';
  end if;
  if exists (select 1 from public.queue_tickets t where t.service_date = p_day) then
    raise exception 'day % already has tickets', p_day;
  end if;
  if not exists (select 1 from public.patients) then
    raise exception 'no patients: load the seed first';
  end if;

  for v_doctor in select id from public.doctors where is_active order by ticket_prefix loop
    if v_is_today then
      v_n := 12;
      v_clock := now() - interval '60 minutes';
    else
      v_n := 14 + floor(random() * 9)::int;
      v_clock := (p_day + time '08:00') at time zone 'Asia/Jakarta';
    end if;
    v_arrival := v_clock - interval '40 minutes';

    for v_i in 1..v_n loop
      select * into v_complaint from private.demo_complaints order by random() limit 1;

      select p.id into v_patient
      from public.patients p
      where (p.phone is null or p.phone like '+62800%') -- synthetic patients only
        and case v_complaint.age_group
          when 'child' then p.birth_date > v_today - 4745  -- under 13
          when 'adult' then p.birth_date <= v_today - 6570 -- 18+
          else true
        end
      order by random()
      limit 1;

      v_channel := (case when random() < 0.45 then 'remote' else 'walk_in' end)::public.ticket_channel;
      v_follow_up := random() < v_complaint.follow_up_rate;

      -- Prediction: 70% AI / 30% fallback; the simulated AI is off by a few minutes.
      if random() < 0.7 then
        v_source := 'ai';
        v_predicted := least(25, greatest(5, round(v_complaint.base_minutes + (random() - 0.5) * 6)::int));
        v_confidence := round((0.7 + random() * 0.25)::numeric, 2);
      else
        v_source := 'fallback';
        v_predicted := v_fallback;
        v_confidence := null;
      end if;

      -- Real length varies ±30% around the typical length; follow-ups are a bit shorter.
      v_actual := greatest(3, v_complaint.base_minutes * (0.7 + random() * 0.6)
                              - case when v_follow_up then 1.5 else 0 end);

      -- Arrivals every 4-14 minutes; the doctor takes the next one when free.
      v_arrival := v_arrival + make_interval(mins => 4 + floor(random() * 11)::int);
      v_created := case
        when v_channel = 'remote' then v_arrival - make_interval(mins => 30 + floor(random() * 120)::int)
        else v_arrival
      end;
      v_checked_in := v_arrival;
      v_deferred := false;
      v_eta := null;
      v_called := null;
      v_started := null;
      v_ended := null;

      if not v_is_today then
        v_status := case
          when random() < 0.04 then 'no_show'
          when random() < 0.03 then 'cancelled'
          else 'done'
        end::public.ticket_status;
      elsif v_i <= 3 then
        v_status := 'done';
      elsif v_i = 4 then
        v_status := 'in_consultation';
      else
        v_status := 'waiting';
      end if;

      if v_status in ('done', 'in_consultation') then
        -- Keep today's finished visits short enough to end before now().
        if v_is_today then
          v_actual := least(v_actual, 14);
        end if;
        v_called := greatest(v_clock, v_checked_in + interval '1 minute');
        v_started := v_called + make_interval(secs => 30 + floor(random() * 90)::int);
        if v_status = 'done' then
          v_ended := v_started + make_interval(secs => round(v_actual * 60)::int);
          v_clock := v_ended + make_interval(secs => floor(random() * 120)::int);
        else
          v_clock := v_started + make_interval(secs => round(v_actual * 60)::int);
        end if;
        -- 4% were absent when first called and were moved back two turns.
        v_deferred := random() < 0.04;
      elsif v_status in ('no_show', 'cancelled') then
        v_checked_in := case when v_status = 'no_show' then null else v_checked_in end;
      else -- waiting (today)
        -- Remote patients near the back have not arrived yet.
        if v_channel = 'remote' and v_i >= 9 then
          v_checked_in := null;
        elsif v_checked_in > now() then
          v_checked_in := now() - make_interval(mins => v_n - v_i);
        end if;
        v_created := least(v_created, now() - make_interval(mins => v_n - v_i + 1));
        -- One patient per queue was absent when called and moved back.
        v_deferred := v_i = 7;
        v_eta := greatest(v_clock, now()) + make_interval(mins => 2);
        v_clock := greatest(v_clock, now()) + make_interval(mins => v_predicted);
      end if;

      insert into public.queue_tickets (
        doctor_id, patient_id, service_date, ticket_number, position, channel, status,
        complaint, is_follow_up,
        predicted_minutes, prediction_source, prediction_confidence, prediction_model, ai_summary,
        estimated_call_at, checked_in_at, called_at, started_at, ended_at, defer_count, created_at
      ) values (
        v_doctor.id, v_patient, p_day, v_i, v_i, v_channel, v_status,
        v_complaint.complaint, v_follow_up,
        v_predicted, v_source, v_confidence,
        case when v_source = 'ai' then 'synthetic-seed' end,
        case when v_source = 'ai' then 'Pasien melaporkan: ' || lower(v_complaint.complaint) || '.' end,
        v_eta, v_checked_in, v_called, v_started, v_ended,
        case when v_deferred then 1 else 0 end, v_created
      )
      returning id into v_ticket;
      v_total := v_total + 1;

      -- Event history, matching the timestamps above.
      insert into public.queue_events (ticket_id, event_type, details, created_at)
      select v_ticket, e.event_type, e.details, e.at
      from (values
        ('created'::public.queue_event_type,
          jsonb_build_object('channel', v_channel, 'predicted_minutes', v_predicted,
                             'prediction_source', v_source),
          v_created),
        ('checked_in', '{}'::jsonb, v_checked_in),
        ('deferred', jsonb_build_object('moved_back', 2),
          case when v_deferred then coalesce(v_called, now()) - interval '6 minutes' end),
        ('called', '{}'::jsonb, v_called),
        ('consultation_started', '{}'::jsonb, v_started),
        ('consultation_ended', '{}'::jsonb, v_ended),
        ((case when v_status in ('no_show', 'cancelled') then v_status::text end)::public.queue_event_type,
          '{}'::jsonb,
          case when v_status in ('no_show', 'cancelled') then v_arrival + interval '30 minutes' end)
      ) as e(event_type, details, at)
      where e.at is not null
        -- walk-in check-in is the same moment as creation
        and not (e.event_type = 'checked_in' and v_channel = 'walk_in');
    end loop;

    if v_is_today then
      perform private.refresh_estimates(v_doctor.id, p_day);
    end if;
  end loop;

  return v_total;
end;
$$;

revoke all on function private.generate_demo_day(date) from public;

-- Replaces today's queue with a fresh synthetic one, for demos. Trusted server
-- code only (npm run demo:refresh). Refuses when today's queue holds a patient
-- whose WhatsApp number is outside the synthetic +62 800 range, so it can
-- never wipe real visits during the clinic trial.
create function public.demo_refresh_today()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.clinic_today();
  v_removed int;
  v_created int;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.queue_tickets t
    join public.patients p on p.id = t.patient_id
    where t.service_date = v_today
      and p.phone is not null
      and p.phone not like '+62800%'
  ) then
    raise exception 'real_patients_today'
      using errcode = 'P0001',
            hint = 'Today''s queue has patients with real phone numbers; refusing to replace it.';
  end if;

  delete from public.queue_tickets where service_date = v_today; -- events and notifications cascade
  get diagnostics v_removed = row_count;

  v_created := private.generate_demo_day(v_today);

  return jsonb_build_object('service_date', v_today, 'removed', v_removed, 'created', v_created);
end;
$$;

revoke all on function public.demo_refresh_today() from public, anon, authenticated;
grant execute on function public.demo_refresh_today() to service_role;
