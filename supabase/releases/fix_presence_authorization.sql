-- Production hotfix after lockdown: authorize private Presence topics without
-- exposing participants.user_id to authenticated clients.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.can_access_presence_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select auth.uid() is not null
    and exists (
      select 1
        from public.participants p
       where p.user_id = auth.uid()
         and p.left_at is null
         and (
           p_topic = 'session:' || p.session_id::text
           or p_topic like 'session:' || p.session_id::text || ':%'
         )
    );
$function$;

revoke execute on function private.can_access_presence_topic(text)
  from public, anon, authenticated;
grant execute on function private.can_access_presence_topic(text)
  to authenticated;

drop policy if exists "Session members can read presence" on realtime.messages;
drop policy if exists "Session members can publish presence" on realtime.messages;

create policy "Session members can read presence"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('presence', 'broadcast')
    and (select private.can_access_presence_topic((select realtime.topic())))
  );

create policy "Session members can publish presence"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and (select private.can_access_presence_topic((select realtime.topic())))
  );
