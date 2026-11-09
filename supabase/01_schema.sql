-- 01_schema.sql : tables, columns, constraints and seed data.
-- Idempotent: safe on an empty project AND on top of the earlier Nova Strike schema. Nothing is created twice.
-- Heads-up: it migrates user_stats.highest_level_unlocked into the new level_progress table, then drops that column.
-- Supabase may show a "destructive operation" warning for that. It is expected; the data is copied first.

-- ---------- profiles (public display name + leaderboard opt-in; NEVER the email or password) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists is_public boolean not null default false;   -- leaderboard opt-in, off by default
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$
declare c record;
begin
  for c in select * from (values
    ('profiles', 'profiles_display_name_length',     'check (char_length(btrim(display_name)) between 1 and 40)'),
    ('profiles', 'profiles_display_name_no_control', 'check (display_name !~ ''[[:cntrl:]]'')')
  ) as t (tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name and conrelid = ('public.' || c.tbl)::regclass) then
      execute format('alter table public.%I add constraint %I %s', c.tbl, c.name, c.def);
    end if;
  end loop;
end $$;

-- ---------- levels (reference data; also holds the limits used to validate submitted runs) ----------
create table if not exists public.levels (
  id smallint primary key,
  name text not null,
  slug text not null unique
);
alter table public.levels add column if not exists enemy_total smallint;                 -- enemies a cleared run must have defeated
alter table public.levels add column if not exists player_hp smallint not null default 3;
alter table public.levels add column if not exists min_seconds integer;                  -- fastest plausible clear
alter table public.levels add column if not exists max_score integer;                    -- highest plausible score

insert into public.levels (id, name, slug, enemy_total, player_hp, min_seconds, max_score) values
  (1, 'Space Training', 'space-training', 16, 3, 25, 20000),
  (2, 'Asteroid Zone',  'asteroid-zone',  41, 3, 45, 85000)
on conflict (id) do update set name = excluded.name, slug = excluded.slug, enemy_total = excluded.enemy_total,
  player_hp = excluded.player_hp, min_seconds = excluded.min_seconds, max_score = excluded.max_score;

-- ---------- level_progress (unlock + per-level bests). A row means the level is unlocked. ----------
create table if not exists public.level_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  level_id smallint not null references public.levels (id),
  unlocked_at timestamptz not null default now(),
  completions integer not null default 0 check (completions >= 0),
  best_score integer check (best_score between 0 and 1000000),
  best_time_seconds integer check (best_time_seconds between 1 and 3600),
  last_completed_at timestamptz,
  primary key (user_id, level_id)
);
create index if not exists level_progress_level_score_idx on public.level_progress (level_id, best_score desc);

-- ---------- user_stats (private aggregates, updated only by submit_run after a valid completed run) ----------
create table if not exists public.user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.user_stats add column if not exists total_score bigint not null default 0;
alter table public.user_stats add column if not exists best_score integer not null default 0;
alter table public.user_stats add column if not exists total_kills integer not null default 0;
alter table public.user_stats add column if not exists shots_fired integer not null default 0;
alter table public.user_stats add column if not exists shots_hit integer not null default 0;
alter table public.user_stats add column if not exists games_played integer not null default 0;
alter table public.user_stats add column if not exists play_time_seconds integer not null default 0;
comment on column public.user_stats.games_played is 'Completed runs. Failed attempts are not recorded.';

-- Migrate the old unlock column into level_progress, then remove it (level_progress is now the single source of truth).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'user_stats' and column_name = 'highest_level_unlocked') then
    insert into public.level_progress (user_id, level_id)
      select s.user_id, l.id from public.user_stats s join public.levels l on l.id <= s.highest_level_unlocked
      on conflict (user_id, level_id) do nothing;
    alter table public.user_stats drop column highest_level_unlocked;
  end if;
end $$;
-- every existing player has at least level 1
insert into public.level_progress (user_id, level_id) select id, 1 from public.profiles on conflict (user_id, level_id) do nothing;
insert into public.user_stats (user_id) select id from public.profiles on conflict (user_id) do nothing;

-- ---------- game_runs (one row per COMPLETED run) ----------
create table if not exists public.game_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level_id smallint not null references public.levels (id),
  score integer not null check (score between 0 and 1000000),
  kills integer not null check (kills between 0 and 500),
  shots_fired integer not null check (shots_fired between 0 and 5000),
  shots_hit integer not null check (shots_hit between 0 and 5000 and shots_hit <= shots_fired),
  damage_taken integer not null check (damage_taken between 0 and 10000),
  duration_seconds integer not null check (duration_seconds between 1 and 3600),   -- completion time
  completed boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists game_runs_user_created_idx on public.game_runs (user_id, created_at desc);

-- ---------- achievements ----------
create table if not exists public.achievements (
  code text primary key,
  name text not null,
  description text not null,
  sort_order smallint not null default 0
);
alter table public.achievements add column if not exists sort_order smallint not null default 0;
insert into public.achievements (code, name, description, sort_order) values
  ('first_blood',   'First Blood',   'Clear a level and destroy your first enemies.', 1),
  ('ace',           'Ace',           'Destroy 50 enemies across your cleared runs.', 2),
  ('sharpshooter',  'Sharpshooter',  'Clear a level with 60% accuracy or better.', 3),
  ('untouchable',   'Untouchable',   'Clear a level without taking damage.', 4),
  ('combo_master',  'Combo Master',  'Reach a x5 combo in a cleared run.', 5),
  ('level_1_clear', 'Training Complete', 'Clear Level 1.', 6),
  ('level_2_clear', 'Zone Cleared',  'Clear Level 2.', 7),
  ('score_10k',     'Ten Thousand',  'Earn 10,000 total points.', 8)
on conflict (code) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_code text not null references public.achievements (code),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_code)
);
