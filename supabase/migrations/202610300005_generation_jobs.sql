alter table public.certificates add column issue_locked_at timestamptz;

create or replace function public.claim_certificate_issue(p_certificate_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  update public.certificates
  set issue_locked_at = now(), updated_at = now()
  where id = p_certificate_id
    and status = 'DRAFT'
    and (issue_locked_at is null or issue_locked_at < now() - interval '15 minutes')
  returning id into claimed_id;
  return claimed_id is not null;
end;
$$;
revoke all on function public.claim_certificate_issue(uuid) from public, anon, authenticated;
grant execute on function public.claim_certificate_issue(uuid) to service_role;

create or replace function public.release_certificate_issue(p_certificate_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.certificates
  set issue_locked_at = null, updated_at = now()
  where id = p_certificate_id and status = 'DRAFT';
$$;
revoke all on function public.release_certificate_issue(uuid) from public, anon, authenticated;
grant execute on function public.release_certificate_issue(uuid) to service_role;

create unique index generation_job_items_one_active_certificate_idx
  on public.generation_job_items(certificate_id)
  where certificate_id is not null and status in ('MENUNGGU','DIPROSES');
