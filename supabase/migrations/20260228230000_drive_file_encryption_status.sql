-- ============================================================
-- Migration: per-file encryption status for Drive files
-- ============================================================

create table if not exists public.drive_file_encryption_status (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references auth.users (id) on delete cascade,
  drive_file_id           text        not null,
  last_encrypted_at       timestamptz,
  last_encryption_success boolean,
  created_at              timestamptz  not null default now(),
  updated_at              timestamptz  not null default now(),
  unique (user_id, drive_file_id)
);

create index if not exists drive_file_encryption_status_user_id_idx
  on public.drive_file_encryption_status (user_id);
create index if not exists drive_file_encryption_status_drive_file_id_idx
  on public.drive_file_encryption_status (drive_file_id);

alter table public.drive_file_encryption_status enable row level security;

create policy "users can select own drive_file_encryption_status"
  on public.drive_file_encryption_status for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own drive_file_encryption_status"
  on public.drive_file_encryption_status for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can update own drive_file_encryption_status"
  on public.drive_file_encryption_status for update to authenticated
  using (user_id = auth.uid());

create policy "users can delete own drive_file_encryption_status"
  on public.drive_file_encryption_status for delete to authenticated
  using (user_id = auth.uid());
