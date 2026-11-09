-- 00_inspect.sql : READ-ONLY. Run these one at a time (select one query, then Run) to see what your project already has.
-- Nothing here changes data. The scripts 01-03 are written to be safe on top of whatever you find.

-- 1) Every column in the public schema
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position;

-- 2) Is row level security on? (every table below should say true after 03_rls.sql)
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 1;

-- 3) Existing policies
select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2;

-- 4) Existing functions (submit_run, get_leaderboard, handle_new_user are expected after 02)
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1;

-- 5) Triggers on auth.users (on_auth_user_created is expected)
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
