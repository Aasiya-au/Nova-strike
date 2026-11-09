// HUD components, menu and overlays. Values only update when they change.
import { el, linkButton, fmtNum } from '../ui.js';
import { totalEnemies } from './levels.js';

const tile = (label, id) => el('div', { class: 'hud-stat' }, el('span', { class: 'hud-label' }, label), el('span', { class: 'hud-value', id: `hud-${id}` }, '0'));
export function buildHud(host, maxHp) {
  for (const k in cache) delete cache[k]; for (const k in nodes) delete nodes[k];
  const pips = el('span', { class: 'pips', id: 'hud-hp', role: 'meter', 'aria-label': 'Health', 'aria-valuemin': 0, 'aria-valuemax': maxHp, 'aria-valuenow': maxHp },
    Array.from({ length: maxHp }, () => el('span', { class: 'pip' })));
  host.replaceChildren(tile('Score', 'score'), tile('Combo', 'combo'), el('div', { class: 'hud-stat' }, el('span', { class: 'hud-label' }, 'Health'), pips),
    tile('Wave', 'wave'), tile('Enemies left', 'left'));
}

const cache = {}, nodes = {};
const node = (id) => (nodes[id] ||= document.getElementById(`hud-${id}`));
export function setHud(v) {   // compares raw values first, so nothing is built or written unless a number actually changed
  if (cache.score !== v.score) { cache.score = v.score; node('score').textContent = fmtNum(v.score); }
  if (cache.combo !== v.combo) { cache.combo = v.combo; node('combo').textContent = `x${v.combo}`; }
  if (cache.wave !== v.wave || cache.waves !== v.waves) { cache.wave = v.wave; cache.waves = v.waves; node('wave').textContent = `${v.wave}/${v.waves}`; }
  if (cache.left !== v.left) { cache.left = v.left; node('left').textContent = String(v.left); }
  if (cache.hp !== v.hp) {
    cache.hp = v.hp; const m = node('hp');
    for (let i = 0; i < m.children.length; i++) m.children[i].classList.toggle('off', i >= v.hp);
    m.setAttribute('aria-valuenow', v.hp);
  }
}

export function buildMenu(host, levels, isUnlocked) {
  host.replaceChildren(...Object.values(levels).map((l) => {
    const open = isUnlocked(l.id);
    return el('li', { class: `panel level-card${open ? '' : ' locked'}` },
      el('h3', {}, `Level ${l.id}: ${l.name}`), el('span', { class: 'tag' }, l.difficulty),
      el('p', { class: 'muted' }, `${l.waves.length} waves, ${totalEnemies(l)} enemies. ${l.desc}`),
      open ? linkButton('Play level', `game.html?level=${l.id}`) : el('span', { class: 'btn btn-ghost', 'aria-disabled': 'true' }, `Locked: clear Level ${l.id - 1} first`));
  }));
}

export function showOverlay(id) {
  document.querySelectorAll('.overlay').forEach((o) => o.classList.toggle('hidden', o.id !== id));
  document.querySelector(`#${id} .btn-primary:not([hidden]):not(.hidden):not([aria-disabled="true"])`)?.focus();
}
export const hideOverlays = () => document.querySelectorAll('.overlay').forEach((o) => o.classList.add('hidden'));

export function fillResult({ kind, title, lead, rows }) {
  document.getElementById('overlay-result').dataset.kind = kind;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-lead').textContent = lead;
  document.getElementById('result-rows').replaceChildren(...rows.flatMap(([k, v, cls]) => [el('dt', {}, k), el('dd', { class: cls || '' }, v)]));
}
