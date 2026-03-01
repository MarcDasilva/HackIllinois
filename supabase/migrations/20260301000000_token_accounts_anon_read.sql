-- Allow anonymous read of token_accounts for the public Wall display.
create policy "anon can read active token accounts"
  on public.token_accounts
  for select
  to anon
  using (is_active = true);
