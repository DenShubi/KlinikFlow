-- KlinikFlow synthetic seed data
--
-- ALL DATA HERE IS SYNTHETIC. Names are invented. Phone numbers use the
-- +62 800 prefix, which is not a mobile range, so no real person can receive
-- a WhatsApp message from seed data. Use your own number for live tests.
--
-- Contents:
--   3 doctors (A, B, C), 80 patients
--   ~13 clinic days of finished visits before today, with predicted and actual
--   consultation length (calibration data for the estimator)
--   a live queue for today per doctor: done, in consultation, waiting
--   (walk-in and remote, some remote not arrived yet, one deferred)
--
-- Deterministic: setseed() makes every reset produce the same rows, relative
-- to the day the seed runs. Staff logins are created by the auth setup, not here.

select setseed(0.2026);

-- ─── Doctors ────────────────────────────────────────────────────────────────

insert into public.doctors (id, full_name, room, ticket_prefix) values
  ('00000000-0000-4000-8000-00000000d001', 'dr. Larasati Wibowo', 'Ruang 1', 'A'),
  ('00000000-0000-4000-8000-00000000d002', 'dr. Hendra Kusuma', 'Ruang 2', 'B'),
  ('00000000-0000-4000-8000-00000000d003', 'dr. Maya Sitompul', 'Ruang 3', 'C');

-- ─── Patients ───────────────────────────────────────────────────────────────

insert into public.patients (full_name, phone, birth_date)
select
  first_names[1 + (i * 7) % array_length(first_names, 1)]
    || ' ' || last_names[1 + (i * 11) % array_length(last_names, 1)],
  -- 20% of patients have no WhatsApp number (walk-ins often skip it)
  case when i % 5 = 0 then null else '+62800' || lpad(i::text, 7, '0') end,
  -- every 8th patient is a child (2-12 years), the rest are 18-80
  case
    when i % 8 = 0 then public.clinic_today() - (730 + floor(random() * 3650))::int
    else public.clinic_today() - (6570 + floor(random() * 22630))::int
  end
from generate_series(1, 80) as i,
  lateral (select
    array['Adi', 'Bunga', 'Citra', 'Dimas', 'Eka', 'Fajar', 'Gita', 'Hadi', 'Intan', 'Joko',
          'Kartika', 'Lukman', 'Mega', 'Nanda', 'Oki', 'Putri', 'Rizky', 'Sari', 'Taufik', 'Wulan',
          'Yoga', 'Zahra', 'Bayu', 'Dewi', 'Galih'] as first_names,
    array['Santoso', 'Rahmawati', 'Siregar', 'Nugroho', 'Hasibuan', 'Lestari', 'Saputra',
          'Wijaya', 'Hidayat', 'Purba', 'Maharani', 'Setiawan', 'Pangaribuan'] as last_names
  ) as names;

-- ─── Complaint catalogue ────────────────────────────────────────────────────
-- base_minutes is the "true" typical length used to simulate actual durations.

create temporary table seed_complaints (
  complaint text not null,
  base_minutes int not null,
  age_group text not null,          -- 'child' | 'adult' | 'any'
  follow_up_rate numeric not null   -- share of visits that are follow-ups
);

insert into seed_complaints values
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

-- ─── Visits ─────────────────────────────────────────────────────────────────

do $$
declare
  v_doctor record;
  v_day date;
  v_today date := public.clinic_today();
  v_is_today boolean;
  v_n int;
  v_i int;
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
  for v_day in
    select d::date
    from generate_series(v_today - 14, v_today, interval '1 day') as d
    where extract(isodow from d) <> 7 -- closed on Sundays
    order by d
  loop
    v_is_today := v_day = v_today;

    for v_doctor in select id from public.doctors order by ticket_prefix loop
      -- Today: a queue in progress around "now". Past days: a full clinic day from 08:00 WIB.
      if v_is_today then
        v_n := 12;
        v_clock := now() - interval '60 minutes';
      else
        v_n := 14 + floor(random() * 9)::int;
        v_clock := (v_day + time '08:00') at time zone 'Asia/Jakarta';
      end if;
      v_arrival := v_clock - interval '40 minutes';

      for v_i in 1..v_n loop
        select * into v_complaint from seed_complaints order by random() limit 1;

        select p.id into v_patient
        from public.patients p
        where case v_complaint.age_group
          when 'child' then p.birth_date > v_today - 4745  -- under 13
          when 'adult' then p.birth_date <= v_today - 6570 -- 18+
          else true
        end
        order by random()
        limit 1;

        v_channel := (case when random() < 0.45 then 'remote' else 'walk_in' end)::public.ticket_channel;
        v_follow_up := random() < v_complaint.follow_up_rate;

        -- Prediction: past days are 70% AI / 30% fallback; AI is off by a few minutes.
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
          v_doctor.id, v_patient, v_day, v_i, v_i, v_channel, v_status,
          v_complaint.complaint, v_follow_up,
          v_predicted, v_source, v_confidence,
          case when v_source = 'ai' then 'synthetic-seed' end,
          case when v_source = 'ai' then 'Pasien melaporkan: ' || lower(v_complaint.complaint) || '.' end,
          v_eta, v_checked_in, v_called, v_started, v_ended,
          case when v_deferred then 1 else 0 end, v_created
        )
        returning id into v_ticket;

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
          -- channel 'remote' tickets were created before arrival; walk-in check-in equals creation
          and not (e.event_type = 'checked_in' and v_channel = 'walk_in');
      end loop;
    end loop;
  end loop;
end;
$$;

drop table seed_complaints;
