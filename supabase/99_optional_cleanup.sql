-- 99_optional_cleanup.sql : OPTIONAL. Only for projects that ran the earlier version of the game, which also saved failed runs.
-- Deletes failed (completed = false) runs and recomputes every player's stats and per-level bests from the remaining completed runs.
-- Destructive for test data. Skip it on a fresh project.

delete from public.game_runs where completed = false;

update public.user_stats set total_score = 0, best_score = 0, total_kills = 0, shots_fired = 0, shots_hit = 0, games_played = 0, play_time_seconds = 0;
update public.user_stats us set
  total_score = a.total_score, best_score = a.best_score, total_kills = a.total_kills,
  shots_fired = a.shots_fired, shots_hit = a.shots_hit, games_played = a.games_played, play_time_seconds = a.play_time_seconds
from (select user_id, sum(score)::bigint as total_score, max(score) as best_score, sum(kills) as total_kills, sum(shots_fired) as shots_fired,
             sum(shots_hit) as shots_hit, count(*) as games_played, sum(duration_seconds) as play_time_seconds
      from public.game_runs where completed group by user_id) a
where us.user_id = a.user_id;

update public.level_progress set completions = 0, best_score = null, best_time_seconds = null, last_completed_at = null;
update public.level_progress lp set completions = a.c, best_score = a.bs, best_time_seconds = a.bt, last_completed_at = a.lc
from (select user_id, level_id, count(*) as c, max(score) as bs, min(duration_seconds) as bt, max(created_at) as lc
      from public.game_runs where completed group by user_id, level_id) a
where lp.user_id = a.user_id and lp.level_id = a.level_id;

-- a cleared level always unlocks the next one
insert into public.level_progress (user_id, level_id)
select distinct lp.user_id, lp.level_id + 1 from public.level_progress lp join public.levels l on l.id = lp.level_id + 1
where lp.completions > 0 on conflict (user_id, level_id) do nothing;
