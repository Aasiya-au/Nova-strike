// Shared page components: header/navigation, stat cards, achievement grid.
import { getSession, signOut } from './auth.js';
import { el, fmtNum, fmtTime, pct } from './ui.js';

export async function renderHeader() {
  const host = document.getElementById('site-header');
  const session = await getSession();
  const page = location.pathname.split('/').pop() || 'index.html';
  const links = session
    ? [['Dashboard', 'dashboard.html'], ['Play', 'game.html'], ['Profile', 'profile.html']]
    : [['Home', 'index.html'], ['Login', 'login.html'], ['Sign up', 'signup.html']];
  const items = links.map(([t, h]) => el('li', {}, el('a', { class: 'nav-link', href: h, 'aria-current': h.split('?')[0] === page ? 'page' : null }, t)));
  if (session) items.push(el('li', {}, el('button', { class: 'nav-link', type: 'button', onclick: async () => { await signOut(); location.href = 'index.html'; } }, 'Log out')));

  const nav = el('nav', { id: 'site-nav', 'aria-label': 'Main' }, el('ul', { class: 'nav-list' }, items));
  const toggle = el('button', { class: 'nav-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'site-nav', onclick: () => {
    const open = nav.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); } }, 'Menu');
  host.classList.add('site-header');
  host.replaceChildren(el('a', { class: 'brand', href: session ? 'dashboard.html' : 'index.html' }, 'NOVA ', el('span', {}, 'STRIKE')), toggle, nav);

  document.querySelectorAll('[data-auth]').forEach((n) => n.classList.toggle('hidden', (n.dataset.auth === 'in') !== !!session));
  return session;
}

export const statCard = (label, value) => el('div', { class: 'stat' }, el('span', { class: 'stat-value' }, value), el('span', { class: 'stat-label' }, label));

export function renderStats(host, s, { done = 0, total } = {}) {
  host.replaceChildren(
    statCard('Total score', fmtNum(s.total_score)), statCard('Best single run', fmtNum(s.best_score)),
    statCard('Levels completed', total != null ? `${done}/${total}` : String(done)), statCard('Runs completed', fmtNum(s.games_played)),
    statCard('Enemies defeated', fmtNum(s.total_kills)), statCard('Accuracy', pct(s.shots_hit, s.shots_fired)),
    statCard('Time flown', fmtTime(s.play_time_seconds)));
}

export function renderAchievements(host, { all, unlocked }) {
  host.replaceChildren(...all.map((a) => {
    const on = unlocked.has(a.code);
    return el('li', { class: `ach${on ? ' unlocked' : ''}` },
      el('span', { class: 'ach-mark', 'aria-hidden': 'true' }, on ? '★' : '☆'),
      el('div', {}, el('strong', {}, a.name), el('small', {}, `${a.description} ${on ? '(unlocked)' : '(locked)'}`)));
  }));
}
