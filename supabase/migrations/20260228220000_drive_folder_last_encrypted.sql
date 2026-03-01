-- ============================================================
-- Migration: add last encryption status to drive_folder_settings
-- ============================================================

alter table public.drive_folder_settings
  add column if not exists last_encrypted_at timestamptz,
  add column if not exists last_encryption_success boolean;

comment on column public.drive_folder_settings.last_encrypted_at is 'When encryption last ran for this folder';
comment on column public.drive_folder_settings.last_encryption_success is 'True if last run succeeded, false if failed, null if never run';
