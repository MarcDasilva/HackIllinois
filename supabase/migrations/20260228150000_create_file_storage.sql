-- ============================================================
-- Migration: 20260228150000_create_file_storage.sql
--
-- Creates folders and storage_files tables for per-user
-- internal file/folder management.
-- ============================================================

-- ── Table: folders ──────────────────────────────────────────
create table if not exists public.folders (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  parent_id   uuid        references public.folders (id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists folders_user_id_idx   on public.folders (user_id);
create index if not exists folders_parent_id_idx on public.folders (parent_id);

alter table public.folders enable row level security;

create policy "users can select own folders"
  on public.folders for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own folders"
  on public.folders for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can update own folders"
  on public.folders for update to authenticated
  using (user_id = auth.uid());

create policy "users can delete own folders"
  on public.folders for delete to authenticated
  using (user_id = auth.uid());


-- ── Table: storage_files ────────────────────────────────────
create table if not exists public.storage_files (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  folder_id   uuid        references public.folders (id) on delete set null,
  name        text        not null,
  size        bigint,
  mime_type   text,
  created_at  timestamptz not null default now()
);

create index if not exists storage_files_user_id_idx   on public.storage_files (user_id);
create index if not exists storage_files_folder_id_idx on public.storage_files (folder_id);

alter table public.storage_files enable row level security;

create policy "users can select own files"
  on public.storage_files for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own files"
  on public.storage_files for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can update own files"
  on public.storage_files for update to authenticated
  using (user_id = auth.uid());

create policy "users can delete own files"
  on public.storage_files for delete to authenticated
  using (user_id = auth.uid());
