alter table public.signers
  add column if not exists nomor_sp_kta text not null default '';
