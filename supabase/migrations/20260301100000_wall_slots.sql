-- Wall display slots: per-slot token assignment and staggered "last changed" timestamp.
-- One row per (epoch, slot_index). Stored so timestamps are persistent and staggered.
create table if not exists public.wall_slots (
  epoch          bigint      not null,
  slot_index     smallint    not null,
  token_id       uuid        null references public.token_accounts(id) on delete set null,
  last_changed_at timestamptz not null,
  primary key (epoch, slot_index),
  constraint wall_slots_slot_index_range check (slot_index >= 0 and slot_index < 30)
);

create index if not exists wall_slots_epoch_idx on public.wall_slots (epoch);

alter table public.wall_slots enable row level security;

create policy "anon can read wall_slots"
  on public.wall_slots for select to anon using (true);

create policy "anon can insert wall_slots"
  on public.wall_slots for insert to anon with check (true);

create policy "anon can update wall_slots"
  on public.wall_slots for update to anon using (true) with check (true);
