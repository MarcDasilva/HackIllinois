-- ============================================================
-- Migration: 20260228180000_add_storage_path_and_bucket.sql
--
-- Adds storage_path to storage_files for Supabase Storage object path.
-- Create bucket "uploads" in Dashboard: Storage → New bucket → "uploads" (private).
-- ============================================================

alter table public.storage_files
  add column if not exists storage_path text;

comment on column public.storage_files.storage_path is
  'Path of the object in Supabase Storage bucket "uploads" (e.g. {user_id}/{id}/{name})';
