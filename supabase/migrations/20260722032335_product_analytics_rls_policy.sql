create policy "product_events: no direct client access"
  on public.product_events
  for all
  to anon, authenticated
  using (false)
  with check (false);
