create unique index if not exists certificates_one_active_per_event_participant_idx
  on public.certificates (event_participant_id)
  where status in ('DRAFT', 'TERBIT');
