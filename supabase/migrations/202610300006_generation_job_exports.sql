alter table public.generation_jobs
  add column output_asset_id uuid references public.media_assets(id) on delete set null,
  add column output_file_name text,
  add column output_error text,
  add column output_locked_at timestamptz;

alter table public.media_assets drop constraint media_assets_asset_type_check;
alter table public.media_assets add constraint media_assets_asset_type_check
  check (asset_type in ('logo_pn','logo_rayon','logo_nu','stempel','signature','participant_photo','certificate_pdf','job_export'));

create or replace function public.claim_generation_job_export(p_job_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  update public.generation_jobs
  set output_locked_at = now(), status = 'DIPROSES'
  where id = p_job_id
    and job_type in ('PDF_COMBINED', 'ZIP')
    and output_asset_id is null
    and status in ('MENUNGGU', 'DIPROSES')
    and (output_locked_at is null or output_locked_at < now() - interval '15 minutes')
  returning id into claimed_id;
  return claimed_id is not null;
end;
$$;
revoke all on function public.claim_generation_job_export(uuid) from public, anon, authenticated;
grant execute on function public.claim_generation_job_export(uuid) to service_role;

create or replace function public.release_generation_job_export(p_job_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.generation_jobs
  set output_locked_at = null
  where id = p_job_id and output_asset_id is null;
$$;
revoke all on function public.release_generation_job_export(uuid) from public, anon, authenticated;
grant execute on function public.release_generation_job_export(uuid) to service_role;
