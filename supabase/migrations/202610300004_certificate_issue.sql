create or replace function public.reserve_certificate_number(p_scope_key text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  reserved_number integer;
begin
  if p_scope_key is null or char_length(p_scope_key) > 80 then
    raise exception 'Ruang nomor sertifikat tidak valid.';
  end if;

  insert into public.certificate_sequences (scope_key, last_number, updated_at)
  values (p_scope_key, 1, now())
  on conflict (scope_key) do update
    set last_number = public.certificate_sequences.last_number + 1,
        updated_at = now()
  returning last_number into reserved_number;

  return reserved_number;
end;
$$;
revoke all on function public.reserve_certificate_number(text) from public, anon, authenticated;
grant execute on function public.reserve_certificate_number(text) to service_role;

create table public.verification_rate_limits (
  client_hash text primary key check (char_length(client_hash) = 64),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);
alter table public.verification_rate_limits enable row level security;
revoke all on table public.verification_rate_limits from anon, authenticated;

create or replace function public.allow_certificate_verification(p_client_hash text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_count integer;
begin
  if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  insert into public.verification_rate_limits (client_hash, window_started_at, request_count, updated_at)
  values (p_client_hash, now(), 1, now())
  on conflict (client_hash) do update set
    window_started_at = case
      when public.verification_rate_limits.window_started_at < now() - interval '1 minute' then now()
      else public.verification_rate_limits.window_started_at
    end,
    request_count = case
      when public.verification_rate_limits.window_started_at < now() - interval '1 minute' then 1
      else public.verification_rate_limits.request_count + 1
    end,
    updated_at = now()
  returning request_count into current_count;

  delete from public.verification_rate_limits
    where window_started_at < now() - interval '24 hours' and random() < 0.01;
  return current_count <= 30;
end;
$$;
revoke all on function public.allow_certificate_verification(text) from public, anon, authenticated;
grant execute on function public.allow_certificate_verification(text) to service_role;
