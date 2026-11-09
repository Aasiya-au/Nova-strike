import * as THREE from 'three';
import { requireAuth } from '../auth.js';
import { getProgress, submitRun } from '../api.js';
import { renderHeader } from '../components.js';
import { el, showMessage, fmtNum, fmtTime } from '../ui.js';
import { LEVELS, totalEnemies } from './levels.js';
import { WaveManager } from './waves.js';
import { comboFor, levelResult } from './scoring.js';
import { GameState } from './state.js';
import { Input } from './input.js';
import { Player, spawnEnemy, releaseEnemy, updateEnemy, ProjectilePool, ExplosionPool, SparkPool, makePlayerBolt, makeEnemyBolt, segmentHitsSphere } from './entities.js';
import { Environment } from './environment.js';
import { ChaseCamera } from './camera.js';
import { Aimer } from './aiming.js';
import { Sfx } from './audio.js';
import { buildHud, buildMenu, setHud, showOverlay, hideOverlays, fillResult } from './hud.js';

const BOLT_SPEED = 80, PLAYER_RADIUS = 1.1, PLAYER_BOLT_RADIUS = 0.35, FIRE_COOLDOWN = 0.18, HIT_INVULNERABLE = 1.5;
const halt = () => new Promise(() => {});
const $ = (id) => document.getElementById(id);
await requireAuth();
renderHeader();

// ---------- which level? (no ?level= means the main menu) ----------
const params = new URLSearchParams(location.search);
const wantsLevel = params.has('level');
const levelId = Number(params.get('level')) || 1;
const cfg = LEVELS[levelId];
if (!cfg) { location.replace('game.html'); await halt(); }
let unlocked;   // level_progress rows are the unlock records; level 1 is always open
try { unlocked = new Set([1, ...(await getProgress()).map((p) => p.level_id)]); }
catch { showMessage($('game-message'), 'error', 'Could not load your progress. Check your connection and refresh.'); await halt(); }
if (wantsLevel && !unlocked.has(levelId)) { location.replace('dashboard.html'); await halt(); }
const nextLevel = LEVELS[levelId + 1];

$('level-name').textContent = `Level ${cfg.id}: ${cfg.name}`;
$('start-level').textContent = `Level ${cfg.id}: ${cfg.name}`;
$('start-info').textContent = `${cfg.desc} Clear ${cfg.waves.length} waves (${totalEnemies(cfg)} enemies).`;
$('start-tips').replaceChildren(...cfg.tips.map((t) => el('li', {}, t)));
buildHud($('hud-stats'), cfg.playerHp);
buildMenu($('menu-levels'), LEVELS, (id) => unlocked.has(id));

// ---------- the one renderer, scene and camera ----------
const wrap = $('game-wrap'), canvas = $('game-canvas'), cross = $('crosshair'), banner = $('wave-banner');
const lifecycle = new AbortController(), { signal } = lifecycle;   // aborting removes every listener added with this signal
const input = new Input(canvas, { wrap, onPause: togglePause, onMute: toggleMute, signal });
input.bindStick($('touch-stick'), $('touch-knob')); input.bindFire($('touch-fire'));
const sfx = new Sfx();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(cfg.bg); scene.fog = new THREE.Fog(cfg.fog, 40, 170);
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 700);
scene.add(new THREE.AmbientLight(0x6070a0, 1.2));
const sun = new THREE.DirectionalLight(cfg.light, 2.4); sun.position.set(5, 10, 8); scene.add(sun);

function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); input.setSize(w, h);
}
const resizeObserver = new ResizeObserver(resize);   // fires on window resize and on layout changes
resizeObserver.observe(wrap);
resize();

// ---------- game objects ----------
const env = new Environment(scene, cfg);
const player = new Player(cfg.accent); scene.add(player.mesh);
const chase = new ChaseCamera(camera); chase.snap(player.mesh.position);
const aimer = new Aimer(scene, camera);
const playerBolts = new ProjectilePool(scene, { make: () => makePlayerBolt(cfg.accent), size: 48, orient: true });
const enemyBolts = new ProjectilePool(scene, { make: () => makeEnemyBolt(0xff3355), size: 64, pulse: true });
const blasts = new ExplosionPool(scene, 24), sparks = new SparkPool(scene, 96);
const waves = new WaveManager(cfg.waves);
const muzzle = new THREE.Vector3(), vel = new THREE.Vector3(), base = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// All temporary per-run state lives in S, so a restart is just "make a fresh S".
const fresh = () => ({ score: 0, kills: 0, combo: 1, streak: 0, comboT: 0, maxCombo: 1, hp: cfg.playerHp, inv: 0, shots: 0, hits: 0, damage: 0,
  time: 0, fireCd: 0, bannerT: 0, vignetteT: 0, hitmarkT: 0, pendingEnd: null, enemies: [] });
const S = fresh();

// ---------- game states ----------
const OVERLAY = { menu: 'overlay-menu', ready: 'overlay-start', paused: 'overlay-pause', completed: 'overlay-result', gameover: 'overlay-result', victory: 'overlay-result' };
const state = new GameState((next) => {
  if (OVERLAY[next]) showOverlay(OVERLAY[next]); else hideOverlays();
  wrap.classList.toggle('playing', next === 'playing'); wrap.dataset.state = next;
  if (next !== 'playing') input.reset();
});

function togglePause() {
  if (state.is('playing')) state.set('paused'); else if (state.is('paused')) state.set('playing');
}
function startLevel() { sfx.init(); resetLevel(); state.set('playing'); }
function restartLevel() { sfx.init(); resetLevel(); state.set('playing'); }
function toggleMute() {
  sfx.setMuted(!sfx.muted);
  const b = $('btn-mute'); b.textContent = sfx.muted ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', String(sfx.muted));
}
$('btn-start').addEventListener('click', startLevel);
$('btn-resume').addEventListener('click', togglePause);
$('btn-restart-pause').addEventListener('click', restartLevel);
$('btn-restart').addEventListener('click', restartLevel);
$('btn-pause').addEventListener('click', togglePause);
$('btn-mute').addEventListener('click', toggleMute);
{ const b = $('btn-mute'); b.textContent = sfx.muted ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', String(sfx.muted)); }
document.addEventListener('visibilitychange', () => { if (document.hidden && state.is('playing')) state.set('paused'); }, { signal });

/** Clears everything temporary: enemies, bolts, effects, timers, score, health, waves, player and camera. */
function resetLevel() {
  for (let i = S.enemies.length - 1; i >= 0; i--) dropEnemy(i);
  playerBolts.clear(); enemyBolts.clear(); blasts.clear(); sparks.clear(); aimer.hide();
  cross.classList.remove('locked', 'hitmark'); wrap.classList.remove('hit'); banner.classList.remove('show');
  Object.assign(S, fresh()); waves.reset(); player.reset(); chase.snap(player.mesh.position);
}

// ---------- gameplay helpers ----------
function aliveCount() { let n = 0; for (let i = 0; i < S.enemies.length; i++) if (S.enemies[i].def.counts) n++; return n; }
function dropEnemy(i) { const e = S.enemies[i]; scene.remove(e.mesh); releaseEnemy(e); S.enemies.splice(i, 1); }
function spawn(type) {
  const e = spawnEnemy(type, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, cfg.speedMul, cfg.attacks?.[type]);
  scene.add(e.mesh); S.enemies.push(e);
}
function showBanner(title, sub = '') {
  banner.replaceChildren(el('strong', {}, title), el('span', {}, sub));
  banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show'); S.bannerT = 2.6;
}
function hurt() {   // every hit costs exactly one health point
  if (S.inv > 0 || S.pendingEnd || !state.is('playing')) return;
  S.hp -= 1; S.damage += 1; S.inv = HIT_INVULNERABLE; S.streak = 0; S.combo = 1;
  sparks.spawn(player.mesh.position, 0xff4d6d, 14, 9); chase.shake(S.hp <= 0 ? 1.5 : 0.7); sfx.hurt();
  wrap.classList.add('hit'); S.vignetteT = 0.25;
  if (S.hp <= 0) S.pendingEnd = 'gameover';
}
/** Destroys an enemy. Shot kills score points and build the combo; a ram still counts as defeated (the wave needs it) but scores nothing. */
function killEnemy(i, scored = true) {
  const e = S.enemies[i];
  if (e.def.counts) S.kills++;
  if (scored) { S.score += e.def.points * S.combo; S.streak++; S.combo = comboFor(S.streak); S.maxCombo = Math.max(S.maxCombo, S.combo); S.comboT = 3; }
  blasts.spawn(e.mesh.position, e.def.color, e.type === 'asteroid' ? 1.4 : 1); sparks.spawn(e.mesh.position, 0xffffff, 12, 12); sfx.explode();
  dropEnemy(i);
}
function enemyShoot(p, e) {   // aimed at where the player is right now; spread enemies fan out three bolts
  const n = e.spread || 1; let fired = false;
  base.copy(player.mesh.position).sub(p).normalize();
  for (let i = 0; i < n; i++) {
    vel.copy(base).applyAxisAngle(UP, n === 1 ? 0 : (i - (n - 1) / 2) * 0.22).multiplyScalar(cfg.projSpeed);
    fired = enemyBolts.fire(p, vel, 6) || fired;
  }
  if (fired) sfx.enemyShoot();
}

// Hoisted so no closures are created every frame. Return true when the bolt hit something (the pool then recycles it).
function onPlayerBolt(pos, prev) {
  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i];
    if (!segmentHitsSphere(prev, pos, e.mesh.position, e.radius + PLAYER_BOLT_RADIUS)) continue;
    S.hits++; e.hp -= 1; sparks.spawn(pos, cfg.accent, 8, 10);
    cross.classList.add('hitmark'); S.hitmarkT = 0.12;
    if (e.hp <= 0) killEnemy(i); else { e.hitFlash(); sfx.hit(); }
    return true;
  }
  return false;
}
function onEnemyBolt(pos, prev) {
  if (!segmentHitsSphere(prev, pos, player.mesh.position, PLAYER_RADIUS + 0.3)) return false;
  hurt(); return true;
}

// ---------- per-frame update (runs only while playing, so pause freezes everything) ----------
function update(dt) {
  S.time += dt; S.inv = Math.max(0, S.inv - dt);
  if (S.vignetteT > 0 && (S.vignetteT -= dt) <= 0) wrap.classList.remove('hit');
  if (S.hitmarkT > 0 && (S.hitmarkT -= dt) <= 0) cross.classList.remove('hitmark');
  if (S.bannerT > 0 && (S.bannerT -= dt) <= 0) banner.classList.remove('show');

  player.update(dt, input.moveX, input.moveY);
  player.mesh.visible = S.inv <= 0 || Math.floor(S.inv * 12) % 2 === 0;
  env.update(dt); chase.update(dt, player.mesh.position, player.vel);
  blasts.update(dt); sparks.update(dt);

  // waves: the level config decides what spawns and when
  const ev = waves.update(dt, aliveCount(), spawn);
  if (ev === 'wave') showBanner(`Wave ${waves.number} of ${waves.total}`, waves.current.title + (waves.current.sub ? `: ${waves.current.sub}` : ''));
  else if (ev === 'cleared') showBanner('Wave cleared', 'Get ready…');
  else if (ev === 'complete') S.pendingEnd = nextLevel ? 'completed' : 'victory';

  // Aiming: Raycaster picks the enemy under the crosshair; otherwise the invisible plane gives the aim point.
  muzzle.copy(player.mesh.position); muzzle.z -= 1.8;
  cross.classList.toggle('locked', !!aimer.update(input.ndc, S.enemies, muzzle, BOLT_SPEED));

  S.fireCd -= dt;
  if (input.firing && S.fireCd <= 0 && !S.pendingEnd) {
    S.fireCd = FIRE_COOLDOWN;
    if (playerBolts.fire(muzzle, vel.copy(aimer.point).sub(muzzle).normalize().multiplyScalar(BOLT_SPEED), 2)) { S.shots++; player.fire(); sfx.shoot(); }
  }

  // Player bolts vs enemy bounding spheres (swept). A bolt is recycled on its first hit.
  playerBolts.update(dt, onPlayerBolt);
  // Enemies move, fire, and can ram the player.
  for (let i = S.enemies.length - 1; i >= 0; i--) {
    const e = S.enemies[i]; updateEnemy(e, dt, player.mesh.position, enemyShoot);
    if (e.mesh.position.z > 14) { if (e.def.counts) waves.requeue(e.type); dropEnemy(i); continue; }   // escaped: rejoins the wave
    if (e.mesh.position.distanceTo(player.mesh.position) < e.radius + PLAYER_RADIUS) {
      hurt(); killEnemy(i, false);   // ramming costs one health point and destroys the enemy
    }
  }
  enemyBolts.update(dt, onEnemyBolt);
  aimer.sync(); cross.classList.toggle('locked', !!aimer.target);

  if ((S.comboT -= dt) <= 0) { S.streak = 0; S.combo = 1; }
  if (S.pendingEnd) finish(S.pendingEnd);
}

// Backdrop motion on the menu, launch and result screens (no gameplay runs here).
function idle(dt) {
  env.update(dt); player.update(dt, 0, 0); chase.update(dt, player.mesh.position, player.vel); blasts.update(dt); sparks.update(dt);
  aimer.hide(); cross.classList.remove('locked');
}

// ---------- end of a run: completed / gameover / victory ----------
function finish(kind) {
  if (!state.is('playing')) return;
  const won = kind !== 'gameover';
  for (let i = S.enemies.length - 1; i >= 0; i--) dropEnemy(i);
  playerBolts.clear(); enemyBolts.clear(); aimer.hide(); cross.classList.remove('locked');
  if (won) { player.mesh.visible = true; sfx.win(); }
  else { blasts.spawn(player.mesh.position, 0xff8844, 2.5); sparks.spawn(player.mesh.position, 0xffcc66, 24, 14); player.mesh.visible = false; sfx.explode(); sfx.lose(); }

  const r = levelResult({ killScore: S.score, completed: won, shots: S.shots, hits: S.hits, damage: S.damage, time: S.time, scoring: cfg.scoring });
  const copy = {
    completed: ['Level complete', `Level ${nextLevel?.id}: ${nextLevel?.name} is unlocked once your run is saved.`],
    victory: ['Victory!', `You cleared the ${cfg.name} and finished the campaign. Well flown, pilot.`],
    gameover: ['Game over', `Your ship was destroyed on wave ${waves.number} of ${waves.total}. Try again.`],
  }[kind];
  const rows = [['Level', `${cfg.id}: ${cfg.name}`], ['Enemies defeated', `${S.kills}/${totalEnemies(cfg)}`], ['Time', fmtTime(S.time)],
    ['Damage taken', `${S.damage} hit${S.damage === 1 ? '' : 's'}`], ['Accuracy', `${Math.round(r.accuracy * 100)}%`], ['Highest combo', `x${S.maxCombo}`], ['Kill score', fmtNum(S.score)]];
  if (won) rows.push(['Level clear bonus', fmtNum(r.bonuses.clear)], ['Accuracy bonus', fmtNum(r.bonuses.accuracy)], ['No-damage bonus', fmtNum(r.bonuses.noDamage)], ['Time bonus', fmtNum(r.bonuses.time)]);
  rows.push(['Final score', fmtNum(r.total), 'total']);
  fillResult({ kind, title: copy[0], lead: copy[1], rows });

  // The Next level link stays disabled until the run is saved, because saving is what unlocks the next level.
  const next = $('btn-next'), retry = $('btn-retry-save'), out = $('result-save');
  next.classList.toggle('hidden', kind !== 'completed'); next.href = '#'; next.setAttribute('aria-disabled', 'true'); next.tabIndex = -1;
  $('btn-restart').textContent = won ? 'Replay level' : 'Try again';
  out.replaceChildren(); retry.hidden = true;
  state.set(kind);
  if (!won) { showMessage(out, 'info', 'This run was not recorded. Only cleared levels count toward your stats.'); return; }

  const payload = { level: levelId, score: r.total, kills: S.kills, shotsFired: S.shots, shotsHit: S.hits, damage: S.damage, duration: Math.max(1, Math.round(S.time)), completed: won, maxCombo: S.maxCombo };
  const save = async () => {
    retry.hidden = true; showMessage(out, 'info', 'Saving your run…');
    try {
      const codes = await submitRun(payload);
      showMessage(out, 'success', codes?.length ? `Run saved. New achievements unlocked: ${codes.length}. See your dashboard.` : 'Run saved.');
      if (kind === 'completed') { next.href = `game.html?level=${nextLevel.id}`; next.removeAttribute('aria-disabled'); next.removeAttribute('tabindex'); next.focus(); }
    } catch (e) { console.error(e); showMessage(out, 'error', 'Could not save this run. Check your connection and retry.'); retry.hidden = false; }
  };
  retry.onclick = save; save();
}

// ---------- the one animation loop ----------
const clock = new THREE.Clock();
let rafId = 0, running = true, lastX = -1, lastY = -1;
function tick() {
  if (!running) return;
  rafId = requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);   // cap so a background tab can't cause a huge jump
  if (state.is('playing')) update(dt); else if (!state.is('paused')) idle(dt);   // paused: world stays frozen
  if (input.x !== lastX || input.y !== lastY) { lastX = input.x; lastY = input.y; cross.style.transform = `translate(${lastX}px, ${lastY}px)`; }
  setHud({ score: S.score, combo: S.combo, hp: S.hp, wave: waves.number, waves: waves.total, left: waves.remaining(aliveCount()) });
  renderer.render(scene, camera);
}
state.set(wantsLevel ? 'ready' : 'menu');
tick();

// ---------- cleanup: stop the loop, remove listeners, free GPU memory ----------
function dispose() {
  if (!running) return;
  running = false; cancelAnimationFrame(rafId); lifecycle.abort(); resizeObserver.disconnect();
  scene.traverse((o) => {
    o.geometry?.dispose();
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) m.dispose();
  });
  renderer.dispose();
}
addEventListener('pagehide', dispose);
addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });   // restored from the back/forward cache: restart cleanly
