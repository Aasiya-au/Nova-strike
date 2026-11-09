import { renderHeader, renderStats, renderAchievements } from '../components.js';
import { requireAuth, signOut } from '../auth.js';
import { getProfile, getStats, getLevels, getProgress, getAchievements, updateProfile } from '../api.js';
import { showMessage, setBusy, setFieldError, validateDisplayName, fmtDate } from '../ui.js';

const session = await requireAuth();
renderHeader();
const msg = document.getElementById('page-message'), name = document.getElementById('display-name'), btn = document.getElementById('submit-btn'), pub = document.getElementById('is-public');
const paint = (p) => { name.value = p.display_name; pub.checked = p.is_public; document.getElementById('avatar').textContent = [...p.display_name][0].toUpperCase(); };
document.getElementById('email').value = session.user.email || '';   // from the player's own session, never from a table
document.getElementById('logout-btn').addEventListener('click', async () => { await signOut(); location.href = 'index.html'; });

try {
  const [profile, stats, levels, progress, ach] = await Promise.all([getProfile(), getStats(), getLevels(), getProgress(), getAchievements()]);
  paint(profile);
  document.getElementById('member-since').textContent = `Pilot since ${fmtDate(profile.created_at)}`;
  renderStats(document.getElementById('stats'), stats, { done: progress.filter((p) => p.completions > 0).length, total: levels.length });
  renderAchievements(document.getElementById('achievements'), ach);
} catch (e) { showMessage(msg, 'error', 'Could not load your profile. Refresh the page to try again.'); console.error(e); }

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!setFieldError(name, validateDisplayName(name.value))) return name.focus();
  setBusy(btn, true, 'Saving…');
  try { paint(await updateProfile({ display_name: name.value })); showMessage(msg, 'success', 'Display name saved.'); }
  catch (err) { showMessage(msg, 'error', 'Could not save your display name. Try again.'); console.error(err); }
  setBusy(btn, false);
});

pub.addEventListener('change', async () => {
  pub.disabled = true;
  try { const p = await updateProfile({ is_public: pub.checked }); paint(p); showMessage(msg, 'success', p.is_public ? 'You now appear on the public leaderboard.' : 'You are hidden from the public leaderboard.'); }
  catch (err) { pub.checked = !pub.checked; showMessage(msg, 'error', 'Could not change your leaderboard setting. Try again.'); console.error(err); }
  pub.disabled = false;
});
