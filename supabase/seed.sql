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

-- ─── Visits ─────────────────────────────────────────────────────────────────
-- About two weeks of finished visits (closed on Sundays) and a live queue for
-- today, from private.generate_demo_day (see the demo_data migration).
-- `npm run demo:refresh` rebuilds only today's queue on a later day.

do $$
declare
  v_day date;
begin
  for v_day in
    select d::date
    from generate_series(public.clinic_today() - 14, public.clinic_today(), interval '1 day') as d
    where extract(isodow from d) <> 7
    order by d
  loop
    perform private.generate_demo_day(v_day);
  end loop;
end;
$$;
