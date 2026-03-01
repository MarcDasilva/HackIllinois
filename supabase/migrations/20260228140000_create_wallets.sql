-- ============================================================
-- Migration: 20260228140000_create_wallets.sql
--
-- Creates the wallets table for storing user wallet IDs and secrets.
-- user_id references auth.users. RLS restricts access to own rows.
-- ============================================================

create table if not exists public.wallets (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  name          text,
  wallet_id     text        not null,
  wallet_secret text,
  created_at    timestamptz not null default now()
);

create index if not exists wallets_user_id_idx
  on public.wallets (user_id);

create index if not exists wallets_created_at_idx
  on public.wallets (created_at desc);

alter table public.wallets enable row level security;

create policy "users can read own wallets"
  on public.wallets for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own wallets"
  on public.wallets for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can update own wallets"
  on public.wallets for update to authenticated
  using (user_id = auth.uid());

create policy "users can delete own wallets"
  on public.wallets for delete to authenticated
  using (user_id = auth.uid());
