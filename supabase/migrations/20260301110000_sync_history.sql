-- ============================================================
-- Migration: sync_history — append-only log of every file sync
-- ============================================================

create table if not exists public.sync_history (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references auth.users (id) on delete cascade,
  drive_file_id           text        not null,
  drive_file_name         text,
  drive_folder_id         text,
  synced_at               timestamptz not null default now(),
  success                 boolean     not null,
  error_message           text,
  created_at              timestamptz not null default now()
);

create index if not exists sync_history_user_file_idx
  on public.sync_history (user_id, drive_file_id);
create index if not exists sync_history_user_folder_idx
  on public.sync_history (user_id, drive_folder_id);
create index if not exists sync_history_synced_at_idx
  on public.sync_history (synced_at desc);

alter table public.sync_history enable row level security;

create policy "users can select own sync_history"
  on public.sync_history for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own sync_history"
  on public.sync_history for insert to authenticated
  with check (user_id = auth.uid());
