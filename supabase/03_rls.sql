-- 03_rls.sql : Row Level Security + privileges. Run AFTER 01 and 02. Safe to re-run.
-- Model: players can READ only their own private rows; the only direct write is editing their own display name / leaderboard opt-in.
-- All game data is written by submit_run (security definer). The leaderboard is exposed only through get_leaderboard.

alter table public.profiles          enable row level security;
alter table public.levels            enable row level security;
alter table public.level_progress    enable row level security;
alter table public.user_stats        enable row level security;
alter table public.game_runs         enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;

-- Start from a clean slate: drop every existing policy on these tables so no old or misnamed policy lingers.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('profiles', 'levels', 'level_progress', 'user_stats', 'game_runs', 'achievements', 'user_achievements')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Privileges: nothing for anonymous visitors; read-only for signed-in users, except two columns on their own profile.
revoke all on table public.profiles, public.levels, public.level_progress, public.user_stats, public.game_runs,
                    public.achievements, public.user_achievements from anon, authenticated;
grant select on table public.profiles, public.levels, public.level_progress, public.user_stats, public.game_runs,
                      public.achievements, public.user_achievements to authenticated;
grant update (display_name, is_public) on table public.profiles to authenticated;

-- Private records: own rows only.
create policy "profiles: read own"          on public.profiles          for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own"        on public.profiles          for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "level_progress: read own"    on public.level_progress    for select to authenticated using (user_id = (select auth.uid()));
create policy "user_stats: read own"        on public.user_stats        for select to authenticated using (user_id = (select auth.uid()));
create policy "game_runs: read own"         on public.game_runs         for select to authenticated using (user_id = (select auth.uid()));
create policy "user_achievements: read own" on public.user_achievements for select to authenticated using (user_id = (select auth.uid()));
-- Reference data: readable by any signed-in player.
create policy "levels: read"                on public.levels            for select to authenticated using (true);
create policy "achievements: read"          on public.achievements      for select to authenticated using (true);
