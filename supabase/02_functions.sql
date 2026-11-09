-- 02_functions.sql : signup trigger, the ONLY write path for game data (submit_run), and the public leaderboard.
-- Safe to re-run (create or replace). Run AFTER 01_schema.sql.

-- keep profiles.updated_at current
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();

-- New auth user -> profile + stats + level 1 unlocked. The display name comes from signup metadata (any Unicode; control chars stripped).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  v_name := btrim(left(btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '[[:cntrl:]]', '', 'g')), 40));
  if v_name = '' then v_name := 'Pilot'; end if;
  insert into public.profiles (id, display_name) values (new.id, v_name) on conflict (id) do nothing;
  insert into public.user_stats (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.level_progress (user_id, level_id) values (new.id, 1) on conflict (user_id, level_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Records one COMPLETED run for the signed-in user (auth.uid(), never a client-supplied id), after validating it.
-- Updates stats, per-level bests, the next level's unlock and achievements in one transaction.
-- Failed attempts are rejected, so they never touch statistics.
create or replace function public.submit_run(
  p_level smallint, p_score integer, p_kills integer, p_shots_fired integer, p_shots_hit integer,
  p_damage integer, p_duration integer, p_completed boolean, p_max_combo smallint
) returns text[] language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  lv public.levels;
  s public.user_stats;
  v_codes text[] := '{}';
  v_new text[];
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_completed is not true then raise exception 'only completed runs are recorded' using errcode = '22023'; end if;
  if num_nulls(p_level, p_score, p_kills, p_shots_fired, p_shots_hit, p_damage, p_duration, p_max_combo) > 0 then
    raise exception 'missing run data' using errcode = '22023'; end if;

  select * into lv from public.levels where id = p_level;
  if not found or lv.enemy_total is null or lv.min_seconds is null or lv.max_score is null then
    raise exception 'unknown level' using errcode = '22023'; end if;
  if p_level <> 1 and not exists (select 1 from public.level_progress where user_id = v_uid and level_id = p_level) then
    raise exception 'level locked' using errcode = '42501'; end if;

  -- Plausibility checks (not real anti-cheat: a determined cheater can still craft values inside these limits).
  if p_kills <> lv.enemy_total                              -- a cleared run defeated every enemy
     or p_damage < 0 or p_damage >= lv.player_hp            -- survived, so fewer hits than health
     or p_duration < lv.min_seconds                         -- not faster than the level physically allows
     or p_score < 0 or p_score > lv.max_score
     or p_shots_hit * 2 < p_kills or p_shots_hit > p_shots_fired   -- at most half the kills can be rams (no shots needed)
     or p_shots_fired > p_duration / 0.17 + 5               -- fire rate cap (0.18 s cooldown)
     or p_max_combo not between 1 and 5 then
    raise exception 'run failed validation' using errcode = '22023';
  end if;

  insert into public.game_runs (user_id, level_id, score, kills, shots_fired, shots_hit, damage_taken, duration_seconds, completed)
  values (v_uid, p_level, p_score, p_kills, p_shots_fired, p_shots_hit, p_damage, p_duration, true);

  insert into public.level_progress as lp (user_id, level_id, completions, best_score, best_time_seconds, last_completed_at)
  values (v_uid, p_level, 1, p_score, p_duration, now())
  on conflict (user_id, level_id) do update set
    completions = lp.completions + 1,
    best_score = greatest(coalesce(lp.best_score, 0), excluded.best_score),
    best_time_seconds = least(coalesce(lp.best_time_seconds, excluded.best_time_seconds), excluded.best_time_seconds),
    last_completed_at = now();

  insert into public.level_progress (user_id, level_id)           -- unlock the next level, if there is one
  select v_uid, l.id from public.levels l where l.id = p_level + 1
  on conflict (user_id, level_id) do nothing;

  insert into public.user_stats as us (user_id, total_score, best_score, total_kills, shots_fired, shots_hit, games_played, play_time_seconds)
  values (v_uid, p_score, p_score, p_kills, p_shots_fired, p_shots_hit, 1, p_duration)
  on conflict (user_id) do update set
    total_score = us.total_score + excluded.total_score,
    best_score = greatest(us.best_score, excluded.best_score),
    total_kills = us.total_kills + excluded.total_kills,
    shots_fired = us.shots_fired + excluded.shots_fired,
    shots_hit = us.shots_hit + excluded.shots_hit,
    games_played = us.games_played + 1,
    play_time_seconds = us.play_time_seconds + excluded.play_time_seconds
  returning * into s;

  if s.total_kills >= 1 then v_codes := array_append(v_codes, 'first_blood'); end if;
  if s.total_kills >= 50 then v_codes := array_append(v_codes, 'ace'); end if;
  if s.total_score >= 10000 then v_codes := array_append(v_codes, 'score_10k'); end if;
  if p_max_combo >= 5 then v_codes := array_append(v_codes, 'combo_master'); end if;
  if p_shots_fired >= 10 and p_shots_hit::numeric / p_shots_fired >= 0.6 then v_codes := array_append(v_codes, 'sharpshooter'); end if;
  if p_damage = 0 then v_codes := array_append(v_codes, 'untouchable'); end if;
  if p_level = 1 then v_codes := array_append(v_codes, 'level_1_clear'); end if;
  if p_level = 2 then v_codes := array_append(v_codes, 'level_2_clear'); end if;

  with ins as (
    insert into public.user_achievements (user_id, achievement_code)
    select v_uid, c from unnest(v_codes) as c
    on conflict (user_id, achievement_code) do nothing
    returning achievement_code)
  select coalesce(array_agg(achievement_code), '{}') into v_new from ins;
  return v_new;
end $$;

-- Public leaderboard. Returns ONLY players who opted in (profiles.is_public), and only: rank, display name, scores, times.
-- No user ids, emails or other private data. p_level = null ranks the sum of each player's best scores per level
-- (so replaying one level cannot inflate it); a level id ranks that level's best score, ties broken by best time.
create or replace function public.get_leaderboard(p_level smallint default null, p_limit integer default 20)
returns table (rank_no bigint, player_name text, score bigint, levels_completed integer, best_time_seconds integer, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if p_level is null then
    return query
      select (row_number() over (order by sum(lp.best_score) desc, min(p.created_at)))::bigint,
             p.display_name, sum(lp.best_score)::bigint, (count(*) filter (where lp.completions > 0))::integer,
             null::integer, (p.id = auth.uid())
      from public.level_progress lp join public.profiles p on p.id = lp.user_id
      where p.is_public and lp.completions > 0
      group by p.id, p.display_name
      order by 1 limit lim;
  else
    return query
      select (row_number() over (order by lp.best_score desc, lp.best_time_seconds asc, p.created_at))::bigint,
             p.display_name, lp.best_score::bigint, 1, lp.best_time_seconds, (p.id = auth.uid())
      from public.level_progress lp join public.profiles p on p.id = lp.user_id
      where p.is_public and lp.level_id = p_level and lp.completions > 0
      order by 1 limit lim;
  end if;
end $$;

-- Only signed-in users may call these. Never anonymous visitors.
revoke all on function public.submit_run(smallint, integer, integer, integer, integer, integer, integer, boolean, smallint) from public, anon, authenticated;
grant execute on function public.submit_run(smallint, integer, integer, integer, integer, integer, integer, boolean, smallint) to authenticated;
revoke all on function public.get_leaderboard(smallint, integer) from public, anon, authenticated;
grant execute on function public.get_leaderboard(smallint, integer) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
