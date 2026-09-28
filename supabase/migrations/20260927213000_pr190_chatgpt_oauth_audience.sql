-- Bind ChatGPT OAuth access tokens to the LVE360 health-context MCP resource.
-- All non-ChatGPT sessions keep Supabase's default audience unchanged.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  is_chatgpt_connector boolean := false;
begin
  claims := event -> 'claims';

  if jsonb_typeof(claims) <> 'object' or claims ->> 'client_id' is null then
    return event;
  end if;

  select exists (
    select 1
    from auth.oauth_clients as client
    where client.id::text = claims ->> 'client_id'
      and client.deleted_at is null
      and client.registration_type::text = 'dynamic'
      and client.client_type::text = 'public'
      and client.token_endpoint_auth_method = 'none'
      and client.client_name = 'ChatGPT'
      and client.redirect_uris ~ '^https://chatgpt\.com/connector/oauth/[A-Za-z0-9_-]+$'
  ) into is_chatgpt_connector;

  if is_chatgpt_connector then
    claims := jsonb_set(
      claims,
      '{aud}',
      to_jsonb('https://splafvdwllglorcegxam.supabase.co/functions/v1/health-context-mcp'::text)
    );
    event := jsonb_set(event, '{claims}', claims);
  end if;

  return event;
exception
  when others then
    -- Authentication must fail open to the unchanged token if the lookup ever breaks.
    return event;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

comment on function public.custom_access_token_hook(jsonb) is
  'Scopes ChatGPT dynamic OAuth tokens to the LVE360 health-context MCP resource; all other tokens are unchanged.';
