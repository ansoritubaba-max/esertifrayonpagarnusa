create extension if not exists pgcrypto;

create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  singleton boolean not null default true unique check (singleton),
  nama text not null,
  email_display text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0),
  asset_type text not null check (asset_type in ('logo_pn','logo_rayon','logo_nu','stempel','signature','participant_photo','certificate_pdf')),
  checksum text,
  created_at timestamptz not null default now()
);

create table public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  nama_organisasi text not null default 'Pencak Silat Nahdlatul Ulama Pagar Nusa',
  nama_rayon text not null default 'Rayon Pondok Pesantren Al-Amien',
  nama_pondok text,
  alamat text,
  kota text not null default '',
  prefix_nomor text not null default 'PN-RAYON',
  logo_pn_asset_id uuid references public.media_assets(id) on delete restrict,
  logo_rayon_asset_id uuid references public.media_assets(id) on delete restrict,
  logo_nu_asset_id uuid references public.media_assets(id) on delete restrict,
  stempel_asset_id uuid references public.media_assets(id) on delete restrict,
  watermark_opacity numeric(4,3) not null default 0.060 check (watermark_opacity between 0.03 and 0.15),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.signers (
  id uuid primary key default gen_random_uuid(),
  posisi text not null unique check (posisi in ('kiri','kanan')),
  nama text not null default '',
  jabatan text not null default '',
  signature_asset_id uuid references public.media_assets(id) on delete restrict,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.signers (posisi, jabatan) values ('kiri','Ketua Rayon'),('kanan','Pembina / Pelatih');

create table public.ukt_events (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  jenis_kegiatan text not null default 'UKT',
  lokasi text not null,
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  tanggal_terbit_default date not null,
  periode text,
  deskripsi text,
  status text not null default 'DRAFT' check (status in ('DRAFT','SELESAI')),
  created_at timestamptz not null default now(),
  check (tanggal_selesai >= tanggal_mulai)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  nama_lengkap text not null,
  nomor_anggota text,
  foto_asset_id uuid references public.media_assets(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ukt_events(id) on delete restrict,
  participant_id uuid not null references public.participants(id) on delete restrict,
  tingkat_strip text not null,
  hasil_ukt text not null check (hasil_ukt in ('LULUS','TIDAK_LULUS')),
  catatan text,
  created_at timestamptz not null default now(),
  unique (event_id, participant_id)
);
create index event_participants_event_idx on public.event_participants(event_id);

create table public.certificate_templates (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  nama text not null,
  config_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index certificate_templates_one_active_idx on public.certificate_templates(is_active) where is_active;

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  event_participant_id uuid not null references public.event_participants(id) on delete restrict,
  template_id uuid not null references public.certificate_templates(id) on delete restrict,
  nomor_sertifikat text unique,
  verification_token_hash text unique,
  status text not null default 'DRAFT' check (status in ('DRAFT','TERBIT','DICABUT')),
  data_snapshot jsonb not null default '{}'::jsonb,
  signer_snapshot jsonb not null default '[]'::jsonb,
  media_snapshot jsonb not null default '{}'::jsonb,
  pdf_asset_id uuid references public.media_assets(id) on delete restrict,
  pdf_sha256 text,
  issued_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  replacement_of_id uuid references public.certificates(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'DRAFT' and issued_at is null) or status <> 'DRAFT'),
  check ((status <> 'DICABUT') or (revoked_at is not null and revocation_reason is not null))
);
create index certificates_status_idx on public.certificates(status);
create index certificates_participant_idx on public.certificates(event_participant_id);

create table public.certificate_sequences (
  id uuid primary key default gen_random_uuid(),
  scope_key text not null unique,
  last_number integer not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ukt_events(id) on delete restrict,
  job_type text not null check (job_type in ('PUBLISH','PDF_COMBINED','ZIP')),
  status text not null default 'MENUNGGU' check (status in ('MENUNGGU','DIPROSES','BERHASIL','SEBAGIAN_GAGAL','GAGAL')),
  total_items integer not null default 0 check (total_items >= 0),
  completed_items integer not null default 0 check (completed_items >= 0),
  failed_items integer not null default 0 check (failed_items >= 0),
  requested_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.generation_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  certificate_id uuid references public.certificates(id) on delete restrict,
  status text not null default 'MENUNGGU' check (status in ('MENUNGGU','DIPROSES','BERHASIL','GAGAL')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  updated_at timestamptz not null default now(),
  unique (job_id, certificate_id)
);
create index generation_job_items_job_idx on public.generation_job_items(job_id, status);

create table public.certificate_verifications (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid references public.certificates(id) on delete set null,
  result_status text not null check (result_status in ('VALID','DICABUT','TIDAK_DITEMUKAN','BELUM_TERSEDIA')),
  verified_at timestamptz not null default now()
);
create index certificate_verifications_certificate_idx on public.certificate_verifications(certificate_id, verified_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.admin_profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);

-- Business data is accessed by server-only routes using the service role.
-- The signed-in admin can only read their own active profile; direct browser writes are denied.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admin_profiles','media_assets','organization_settings','signers','ukt_events','participants',
    'event_participants','certificate_templates','certificates','certificate_sequences','generation_jobs',
    'generation_job_items','certificate_verifications','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
  end loop;
end $$;

grant select on table public.admin_profiles to authenticated;
create policy "Admin can read own active profile" on public.admin_profiles
  for select to authenticated using (id = auth.uid() and is_active = true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificate-assets','certificate-assets',false,10485760,array['image/png','image/webp','image/jpeg','application/pdf'])
on conflict (id) do update set public = false;

-- No anon/authenticated storage policies are created. Storage access stays server-side.
