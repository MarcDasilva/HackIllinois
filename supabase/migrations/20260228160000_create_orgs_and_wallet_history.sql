-- ============================================================
-- Migration: 20260228160000_create_orgs_and_wallet_history.sql
-- ============================================================

-- ── Table: organizations ────────────────────────────────────
create table if not exists public.organizations (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  name          text        not null,
  org_id        text,
  role          text,
  created_at    timestamptz not null default now()
);

create index if not exists organizations_user_id_idx on public.organizations (user_id);

alter table public.organizations enable row level security;

create policy "users can select own orgs"
  on public.organizations for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own orgs"
  on public.organizations for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can update own orgs"
  on public.organizations for update to authenticated
  using (user_id = auth.uid());

create policy "users can delete own orgs"
  on public.organizations for delete to authenticated
  using (user_id = auth.uid());


-- ── Table: wallet_history ───────────────────────────────────
create table if not exists public.wallet_history (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  wallet_id     uuid        references public.wallets (id) on delete set null,
  type          text        not null default 'transfer' check (type in ('transfer', 'receive', 'fee', 'other')),
  amount        text,
  description   text,
  tx_hash       text,
  created_at    timestamptz not null default now()
);

create index if not exists wallet_history_user_id_idx   on public.wallet_history (user_id);
create index if not exists wallet_history_wallet_id_idx on public.wallet_history (wallet_id);

alter table public.wallet_history enable row level security;

create policy "users can select own wallet history"
  on public.wallet_history for select to authenticated
  using (user_id = auth.uid());

create policy "users can insert own wallet history"
  on public.wallet_history for insert to authenticated
  with check (user_id = auth.uid());

create policy "users can delete own wallet history"
  on public.wallet_history for delete to authenticated
  using (user_id = auth.uid());
alter table public.organizations
  add column if not exists org_code text;