-- Velum Workflow Builder — Supabase migration
-- Stores workflow graphs, run history, and per-node results.

-- ─── Workflows ────────────────────────────────────────────────────────────────

create table if not exists public.workflows (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Untitled Workflow',
  template    text not null default 'blank',
  nodes_json  text not null default '[]',
  edges_json  text not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.workflows enable row level security;

create policy "Users can manage their own workflows"
  on public.workflows
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ─── Runs ─────────────────────────────────────────────────────────────────────

create table if not exists public.workflow_runs (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.workflows(id) on delete cascade,
  status       text not null default 'pending',   -- pending | running | done | error
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.workflow_runs enable row level security;

create policy "Users can manage runs for their workflows"
  on public.workflow_runs
  for all
  using (
    exists (
      select 1 from public.workflows w
      where w.id = workflow_id and w.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workflows w
      where w.id = workflow_id and w.owner_id = auth.uid()
    )
  );

-- ─── Run Nodes ────────────────────────────────────────────────────────────────

create table if not exists public.workflow_run_nodes (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.workflow_runs(id) on delete cascade,
  node_id      text not null,
  node_type    text not null,
  status       text not null default 'pending',   -- pending | running | done | error | skipped
  logs         text not null default '[]',
  output_json  text not null default '{}',
  started_at   timestamptz,
  finished_at  timestamptz
);

alter table public.workflow_run_nodes enable row level security;

create policy "Users can manage run nodes for their runs"
  on public.workflow_run_nodes
  for all
  using (
    exists (
      select 1 from public.workflow_runs wr
      join public.workflows w on w.id = wr.workflow_id
      where wr.id = run_id and w.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workflow_runs wr
      join public.workflows w on w.id = wr.workflow_id
      where wr.id = run_id and w.owner_id = auth.uid()
    )
  );

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workflows_updated_at
  before update on public.workflows
  for each row execute function public.update_updated_at();
