-- Defence in depth. Hosts such as Supabase expose every table in the public schema through an HTTP API
-- using public keys. This app never uses that API: it connects server-side as the database owner, which
-- bypasses row level security. Enabling RLS with NO policies therefore leaves the app untouched while making
-- every table unreadable and unwritable to anyone using the API keys.
--
-- Every future migration that creates a table must also run:  alter table <name> enable row level security;
-- (tests/integration/security.test.ts fails if a table is missing it).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
  end if;
end $$;
