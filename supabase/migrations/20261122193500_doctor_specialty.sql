-- KlinikFlow: add doctor specialty/profession label
--
-- Clarifies each doctor's practice focus (e.g., general practitioner, family/pediatric,
-- maternal & child health) across the home carousel, patient intake, reception, and doctor views.

alter table public.doctors
  add column if not exists specialty text not null default 'Dokter Umum';

comment on column public.doctors.specialty is 'Doctor profession or practice focus shown to patients and staff.';

update public.doctors
set specialty = 'Dokter Umum'
where ticket_prefix = 'A';

update public.doctors
set specialty = 'Dokter Umum · Anak & Keluarga'
where ticket_prefix = 'B';

update public.doctors
set specialty = 'Dokter Umum · Kesehatan Ibu & Anak'
where ticket_prefix = 'C';
