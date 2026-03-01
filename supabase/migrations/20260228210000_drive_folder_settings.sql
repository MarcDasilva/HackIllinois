-- ============================================================
-- Migration: drive_folder_settings
-- Per–Google Drive folder encryption and viewer settings.
-- ============================================================

create table if not exists public.drive_folder_settings (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,
  drive_folder_id       text        not null,
  drive_folder_name     text,
  is_encrypted          boolean     not null default false,
  encrypt_trigger       text        check (encrypt_trigger in ('on_update', 'daily', 'hourly')),
  encrypt_content_types text       check (encrypt_content_types in ('images', 'pdfs', 'both')),
  allowed_viewer_emails text[]     not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, drive_folder_id)
);

create index if not exists drive_folder_settings_user_id_idx
  on public.drive_folder_settings (user_id);
create index if not exists drive_folder_settings_drive_folder_id_idx
  on public.drive_folder_settings (drive_folder_id);

alter table public.drive_folder_settings enable row level security;

create policy "users can select own drive_folder_settings"
  on public.drive_folder_settings for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own drive_folder_settings"
  on public.drive_folder_settings for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can update own drive_folder_settings"
  on public.drive_folder_settings for update to authenticated
  using (user_id = auth.uid());

create policy "users can delete own drive_folder_settings"
  on public.drive_folder_settings for delete to authenticated
  using (user_id = auth.uid());
