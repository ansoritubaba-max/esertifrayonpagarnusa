create table public.participant_import_previews (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.admin_profiles(id) on delete cascade,
  event_id uuid not null references public.ukt_events(id) on delete cascade,
  rows_json jsonb not null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index participant_import_previews_expiry_idx on public.participant_import_previews(expires_at);
alter table public.participant_import_previews enable row level security;
revoke all on table public.participant_import_previews from anon, authenticated;

create or replace function public.import_event_participants(p_event_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  row_item jsonb;
  row_number integer := 0;
  imported_count integer := 0;
  failed_rows jsonb := '[]'::jsonb;
  participant_id uuid;
  registration_id uuid;
  row_error text;
  member_number text;
  participant_name text;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'Data impor tidak valid atau melebihi 500 baris.';
  end if;

  if not exists (select 1 from public.ukt_events where id = p_event_id) then
    raise exception 'Kegiatan tidak ditemukan.';
  end if;

  for row_item in select value from jsonb_array_elements(p_rows) loop
    row_number := row_number + 1;
    participant_name := nullif(btrim(row_item->>'nama_lengkap'), '');
    member_number := nullif(btrim(row_item->>'nomor_anggota'), '');
    row_error := null;

    begin
      if participant_name is null or char_length(participant_name) > 180 then
        raise exception 'Nama lengkap wajib diisi (maksimal 180 karakter).';
      end if;
      if nullif(btrim(row_item->>'tingkat_strip'), '') is null or char_length(btrim(row_item->>'tingkat_strip')) > 80 then
        raise exception 'Tingkat/strip wajib diisi (maksimal 80 karakter).';
      end if;
      if row_item->>'hasil_ukt' not in ('LULUS', 'TIDAK_LULUS') then
        raise exception 'Hasil UKT harus LULUS atau TIDAK_LULUS.';
      end if;
      if char_length(coalesce(row_item->>'catatan', '')) > 500 or char_length(coalesce(member_number, '')) > 80 then
        raise exception 'Nomor anggota maksimal 80 dan catatan maksimal 500 karakter.';
      end if;

      participant_id := null;
      if member_number is not null then
        select id into participant_id from public.participants
          where lower(btrim(nomor_anggota)) = lower(member_number)
          order by created_at asc limit 1;
      end if;
      if participant_id is null then
        insert into public.participants (nama_lengkap, nomor_anggota)
          values (participant_name, member_number) returning id into participant_id;
      end if;
      insert into public.event_participants (event_id, participant_id, tingkat_strip, hasil_ukt, catatan)
        values (p_event_id, participant_id, btrim(row_item->>'tingkat_strip'), row_item->>'hasil_ukt', nullif(btrim(row_item->>'catatan'), ''))
        returning id into registration_id;
      imported_count := imported_count + 1;
    exception when others then
      row_error := case when sqlstate = '23505' then 'Peserta sudah terdaftar pada kegiatan ini.' else sqlerrm end;
      failed_rows := failed_rows || jsonb_build_array(jsonb_build_object('row', row_number, 'error', row_error));
    end;
  end loop;

  return jsonb_build_object('imported', imported_count, 'failed', failed_rows);
end;
$$;
revoke all on function public.import_event_participants(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_event_participants(uuid, jsonb) to service_role;
