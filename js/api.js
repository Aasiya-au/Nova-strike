// All database access lives here. supabase-js sends parameterized requests; RLS limits every read to the signed-in user.
// Queries list explicit columns and never touch emails (those exist only in Supabase Auth, not in our tables).
import { supabase } from './supabaseClient.js';
import { getSession } from './auth.js';

const unwrap = ({ data, error }) => { if (error) throw error; return data; };
const uid = async () => (await getSession()).user.id;

export const getProfile = async () => unwrap(await supabase.from('profiles').select('id, display_name, is_public, created_at').eq('id', await uid()).single());
export const getStats = async () => unwrap(await supabase.from('user_stats')
  .select('total_score, best_score, total_kills, shots_fired, shots_hit, games_played, play_time_seconds').eq('user_id', await uid()).single());
export const getLevels = async () => unwrap(await supabase.from('levels').select('id, name, slug').order('id'));
export const getProgress = async () => unwrap(await supabase.from('level_progress')
  .select('level_id, unlocked_at, completions, best_score, best_time_seconds, last_completed_at').eq('user_id', await uid()).order('level_id'));
export const getRecentRuns = async (n = 8) => unwrap(await supabase.from('game_runs')
  .select('id, level_id, score, kills, damage_taken, duration_seconds, created_at').eq('user_id', await uid()).eq('completed', true)
  .order('created_at', { ascending: false }).limit(n));
export const getAchievements = async () => {
  const [all, mine] = await Promise.all([
    supabase.from('achievements').select('code, name, description').order('sort_order'),
    supabase.from('user_achievements').select('achievement_code, unlocked_at').eq('user_id', await uid()),
  ]);
  return { all: unwrap(all), unlocked: new Map(unwrap(mine).map((r) => [r.achievement_code, r.unlocked_at])) };
};

/** Only display_name and is_public are editable (the database grants nothing else). */
export const updateProfile = async (fields) => {
  const patch = {};
  if (fields.display_name !== undefined) patch.display_name = fields.display_name.trim();
  if (fields.is_public !== undefined) patch.is_public = !!fields.is_public;
  return unwrap(await supabase.from('profiles').update(patch).eq('id', await uid()).select('id, display_name, is_public, created_at').single());
};

/** Public leaderboard: only players who opted in, only public fields. levelId null = overall. */
export const getLeaderboard = async (levelId = null, limit = 10) => unwrap(await supabase.rpc('get_leaderboard', { p_level: levelId, p_limit: limit }));

/** Saves a COMPLETED run; the database validates it, updates stats, unlocks the next level and returns new achievement codes. */
export const submitRun = async (r) => unwrap(await supabase.rpc('submit_run', {
  p_level: r.level, p_score: r.score, p_kills: r.kills, p_shots_fired: r.shotsFired, p_shots_hit: r.shotsHit,
  p_damage: r.damage, p_duration: r.duration, p_completed: r.completed, p_max_combo: r.maxCombo,
}));
