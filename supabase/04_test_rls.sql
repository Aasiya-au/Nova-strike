-- 04_test_rls.sql : proves two different accounts cannot read or change each other's private data.
-- Run in the SQL Editor AFTER 01-03. It creates two throwaway users INSIDE a transaction, acts as each of them
-- (same database role + JWT claims the API uses, so RLS applies exactly as for real requests), then ROLLS BACK.
--
-- EXPECTED RESULT: the editor shows an "error" whose message starts with "RLS TEST REPORT". That is deliberate: raising
-- an error is how the script guarantees everything is rolled back. Read the PASS / FAIL lines. Every line must say PASS.
-- If the first insert into auth.users fails on your project, create two accounts in the app and use tests/rls-test.html instead.

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  r text[] := '{}'; cnt bigint; n integer; ok boolean; codes text[]; fails integer;
begin
  -- two test users (as the admin role); the signup trigger creates their profile, stats and level 1
  insert into auth.users (id, email, raw_user_meta_data, aud, role, instance_id, created_at, updated_at) values
    (a, 'rls-a-' || a || '@example.test', '{"display_name":"Alice Ünï 🚀"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now()),
    (b, 'rls-b-' || b || '@example.test', '{"display_name":"Bob"}',          'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now(), now());
  select count(*) into cnt from public.profiles where id in (a, b);
  r := r || case when cnt = 2 then 'PASS: ' else 'FAIL: ' end || 'signup trigger created both profiles';
  select count(*) into cnt from public.profiles where id = a and display_name = 'Alice Ünï 🚀';
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'Unicode display name stored intact';

  ------------------------------------------------------------------ act as ALICE (signed-in role + her JWT)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a::text, 'role', 'authenticated')::text, true);

  select count(*) into cnt from public.profiles;
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'A sees exactly one profile (her own)';
  select count(*) into cnt from public.user_stats where user_id = b;
  r := r || case when cnt = 0 then 'PASS: ' else 'FAIL: ' end || 'A cannot read B''s stats';
  select count(*) into cnt from public.level_progress where user_id = b;
  r := r || case when cnt = 0 then 'PASS: ' else 'FAIL: ' end || 'A cannot read B''s level progress';

  update public.profiles set display_name = 'HACKED' where id = b;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS: ' else 'FAIL: ' end || 'A cannot rename B';
  update public.profiles set is_public = true where id = b;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS: ' else 'FAIL: ' end || 'A cannot change B''s leaderboard opt-in';
  update public.profiles set display_name = 'Alice 2' where id = a;
  get diagnostics n = row_count;
  r := r || case when n = 1 then 'PASS: ' else 'FAIL: ' end || 'A can rename herself';

  ok := false; begin update public.user_stats set total_score = 999999 where user_id = a; exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'A cannot edit her own stats directly';
  ok := false; begin update public.level_progress set best_score = 999999 where user_id = a; exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'A cannot edit her own level progress directly';
  ok := false; begin insert into public.game_runs (user_id, level_id, score, kills, shots_fired, shots_hit, damage_taken, duration_seconds) values (a, 1, 1, 1, 1, 1, 0, 1); exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'A cannot insert a run directly';
  ok := false; begin insert into public.user_achievements (user_id, achievement_code) values (a, 'ace'); exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'A cannot grant herself an achievement';
  ok := false; begin update public.profiles set id = b where id = a; exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'A cannot reassign a profile id';

  ok := false; begin perform public.submit_run(1::smallint, 99999999, 16, 60, 30, 0, 90, true, 3::smallint); exception when sqlstate '22023' then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'submit_run rejects an absurd score';
  ok := false; begin perform public.submit_run(1::smallint, 5000, 3, 10, 5, 3, 90, false, 1::smallint); exception when sqlstate '22023' then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'submit_run rejects a failed (not completed) run';
  ok := false; begin perform public.submit_run(2::smallint, 5000, 41, 100, 60, 0, 120, true, 3::smallint); exception when sqlstate '42501' then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'submit_run rejects a locked level';

  codes := public.submit_run(1::smallint, 5000, 16, 60, 30, 0, 90, true, 3::smallint);
  select count(*) into cnt from public.game_runs;
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'a valid completed run was saved (A sees 1 run)';
  select count(*) into cnt from public.game_runs where user_id = a;
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'the run belongs to A''s auth id';
  select count(*) into cnt from public.level_progress where level_id = 2;
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'completing level 1 unlocked level 2 for A';
  select count(*) into cnt from public.user_stats where total_score = 5000 and games_played = 1;
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'A''s stats updated after the valid run';

  select count(*) into cnt from public.get_leaderboard(null, 50);
  r := r || case when cnt = 0 then 'PASS: ' else 'FAIL: ' end || 'leaderboard is empty while nobody has opted in';
  update public.profiles set is_public = true where id = a;
  select count(*) into cnt from public.get_leaderboard(null, 50) where player_name = 'Alice 2' and is_me;
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'A appears on the leaderboard after opting in';

  ------------------------------------------------------------------ act as BOB
  perform set_config('request.jwt.claims', json_build_object('sub', b::text, 'role', 'authenticated')::text, true);

  select count(*) into cnt from public.game_runs;
  r := r || case when cnt = 0 then 'PASS: ' else 'FAIL: ' end || 'B cannot see A''s runs';
  select count(*) into cnt from public.user_stats where user_id = a;
  r := r || case when cnt = 0 then 'PASS: ' else 'FAIL: ' end || 'B cannot read A''s stats';
  select count(*) into cnt from public.level_progress where user_id = a;
  r := r || case when cnt = 0 then 'PASS: ' else 'FAIL: ' end || 'B cannot read A''s level progress';
  select count(*) into cnt from public.user_stats where total_score = 0;
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'B''s own stats are untouched by A''s run';
  select count(*) into cnt from public.profiles where id = a;
  r := r || case when cnt = 0 then 'PASS: ' else 'FAIL: ' end || 'B cannot read A''s profile row directly';
  update public.profiles set is_public = false where id = a;
  get diagnostics n = row_count;
  r := r || case when n = 0 then 'PASS: ' else 'FAIL: ' end || 'B cannot change A''s leaderboard opt-in';
  ok := false; begin perform public.submit_run(2::smallint, 5000, 41, 100, 60, 0, 120, true, 3::smallint); exception when sqlstate '42501' then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'B cannot submit to level 2 (A''s unlock is not B''s)';
  select count(*) into cnt from public.get_leaderboard(null, 50) where player_name = 'Alice 2' and not is_me;
  r := r || case when cnt = 1 then 'PASS: ' else 'FAIL: ' end || 'B sees A (opted in) on the leaderboard, flagged as not-me';
  select count(*) into cnt from public.get_leaderboard(null, 50) where player_name = 'Bob';
  r := r || case when cnt = 0 then 'PASS: ' else 'FAIL: ' end || 'B (not opted in) is not on the leaderboard';

  ------------------------------------------------------------------ anonymous visitor (no login)
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);
  ok := false; begin select count(*) into cnt from public.profiles; exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'anonymous visitors cannot read profiles';
  ok := false; begin select count(*) into cnt from public.game_runs; exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'anonymous visitors cannot read runs';
  ok := false; begin perform public.get_leaderboard(null, 10); exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'anonymous visitors cannot call the leaderboard';
  ok := false; begin perform public.submit_run(1::smallint, 5000, 16, 60, 30, 0, 90, true, 3::smallint); exception when insufficient_privilege then ok := true; end;
  r := r || case when ok then 'PASS: ' else 'FAIL: ' end || 'anonymous visitors cannot call submit_run';

  execute 'reset role';
  select count(*) into fails from unnest(r) as x where x like 'FAIL%';
  raise exception E'RLS TEST REPORT (rolled back on purpose; nothing was saved): % \n%',
    case when fails = 0 then 'ALL PASSED' else fails || ' FAILED' end, array_to_string(r, E'\n');
end $$;
