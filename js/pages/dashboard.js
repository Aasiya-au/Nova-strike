import { renderHeader, renderStats, renderAchievements } from '../components.js';
import { requireAuth } from '../auth.js';
import { getProfile, getStats, getLevels, getProgress, getRecentRuns, getAchievements, getLeaderboard } from '../api.js';
import { LEVELS } from '../game/levels.js';
import { el, linkButton, showMessage, clearMessage, fmtNum, fmtDate, fmtTime } from '../ui.js';

await requireAuth();
renderHeader();
const $ = (id) => document.getElementById(id);
const levelName = (id, fallback) => LEVELS[id]?.name ?? fallback ?? id;

// ----- everything below is the signed-in player's own data (RLS returns only their rows) -----
let levels = [];
try {
  let profile, stats, progress, runs, ach;
  [profile, stats, levels, progress, runs, ach] = await Promise.all([getProfile(), getStats(), getLevels(), getProgress(), getRecentRuns(), getAchievements()]);
  $('pilot-name').textContent = profile.display_name;                      // textContent: names are never parsed as HTML
  $('avatar').textContent = [...profile.display_name][0].toUpperCase();
  $('member-since').textContent = `Pilot since ${fmtDate(profile.created_at)}`;

  const prog = new Map(progress.map((p) => [p.level_id, p]));
  renderStats($('stats'), stats, { done: progress.filter((p) => p.completions > 0).length, total: levels.length });
  renderAchievements($('achievements'), ach);

  $('levels').replaceChildren(...levels.map((l) => {
    const p = prog.get(l.id), open = !!p || l.id === 1, cfg = LEVELS[l.id];
    return el('article', { class: `panel level-card${open ? '' : ' locked'}` },
      el('h3', {}, `Level ${l.id}: ${levelName(l.id, l.name)}`), el('span', { class: 'tag' }, cfg?.difficulty || 'Level'),
      el('p', { class: 'muted' }, cfg?.desc || ''),
      el('p', {}, p?.completions > 0
        ? `Best score ${fmtNum(p.best_score)}, best time ${fmtTime(p.best_time_seconds)}, cleared ${p.completions} time${p.completions === 1 ? '' : 's'}.`
        : (open ? 'Not cleared yet.' : 'Locked.')),
      open && cfg ? linkButton(p?.completions > 0 ? 'Play again' : 'Play level', `game.html?level=${l.id}`)
                  : el('span', { class: 'btn btn-ghost', 'aria-disabled': 'true' }, `Locked: clear Level ${l.id - 1} first`));
  }));

  $('history').replaceChildren(runs.length
    ? el('table', {}, el('thead', {}, el('tr', {}, ['Date', 'Level', 'Score', 'Enemies', 'Time', 'Damage taken'].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, runs.map((r) => el('tr', {}, el('td', {}, fmtDate(r.created_at)), el('td', {}, levelName(r.level_id)), el('td', {}, fmtNum(r.score)),
          el('td', {}, r.kills), el('td', {}, fmtTime(r.duration_seconds)), el('td', {}, r.damage_taken)))))
    : el('p', { class: 'muted' }, 'No completed runs yet. Clear a level to get on the board.'));

  $('board-note').textContent = profile.is_public
    ? 'You are listed on the public leaderboard. You can opt out on your profile page.'
    : 'You are not listed. Only players who opt in appear here. Opt in on your profile page if you want to be ranked.';
} catch (e) { showMessage($('page-message'), 'error', 'Could not load your data. Refresh the page to try again.'); console.error(e); }

// ----- the leaderboard: other players who opted in; separate from the personal stats above -----
const select = $('board-level');
select.replaceChildren(el('option', { value: '' }, 'Overall (sum of best scores)'), ...levels.map((l) => el('option', { value: l.id }, `Level ${l.id}: ${levelName(l.id, l.name)}`)));
async function loadBoard() {
  const lvl = select.value === '' ? null : Number(select.value), msg = $('board-message'); clearMessage(msg);
  try {
    const rows = await getLeaderboard(lvl, 10);
    $('board').replaceChildren(rows.length
      ? el('table', {}, el('thead', {}, el('tr', {}, ['Rank', 'Player', 'Score', lvl === null ? 'Levels cleared' : 'Best time'].map((h) => el('th', { scope: 'col' }, h)))),
          el('tbody', {}, rows.map((r) => el('tr', { class: r.is_me ? 'me' : null }, el('td', {}, String(r.rank_no)),
            el('td', {}, r.player_name + (r.is_me ? ' (you)' : '')), el('td', {}, fmtNum(r.score)),
            el('td', {}, lvl === null ? r.levels_completed : fmtTime(r.best_time_seconds))))))
      : el('p', { class: 'muted' }, 'No public players with completed levels yet.'));
  } catch (e) { $('board').replaceChildren(); showMessage(msg, 'error', 'Could not load the leaderboard.'); console.error(e); }
}
select.addEventListener('change', loadBoard);
loadBoard();
