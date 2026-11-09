// All level content lives here. To add a level: add an entry (plus a row in the `levels` table). No game code changes needed.
//   waves[]  : { title, sub, spawn: [[enemyType, count], ...], interval (s between spawns), maxAlive, hazards (s between asteroids, 0 = none) }
//   attacks  : per-enemy-type overrides { fire (s between shots), burst (shots per volley), spread (bolts per shot, fanned) }
//   scoring  : { parTime (s), clearBonus }
export const LEVELS = {
  1: {
    id: 1, name: 'Space Training', difficulty: 'Rookie',
    desc: 'A calm, quiet sector. Learn to fly, aim and dodge.',
    tips: ['Move out of the way of glowing orbs: they are slow.', 'Shoot a gunner when its eye starts to swell, then dodge.', 'You have 3 health points. Every hit costs one.'],
    bg: 0x02040f, fog: 0x040a1c, light: 0x9fb8ff, accent: 0x19e6ff,
    playerHp: 3, speedMul: 0.7, projSpeed: 15,
    attacks: { gunner: { fire: 3.2 } },
    scoring: { parTime: 150, clearBonus: 500 },
    env: { starColor: 0xffffff, dustColor: 0x6f8fff, rocks: 0, rockColor: 0x8a78b0,
      planets: [{ r: 20, color: 0x3a5fa8, emissive: 0x081230, glow: 0x6f9bff, pos: [-95, 28, -300], spin: 0.03 }] },
    waves: [
      { title: 'Warm-up', sub: 'Shoot the drones before they reach you', spawn: [['drone', 4]], interval: 2.6, maxAlive: 2, hazards: 0 },
      { title: 'Return fire', sub: 'Gunners shoot back. Dodge the orbs', spawn: [['drone', 3], ['gunner', 2]], interval: 2.4, maxAlive: 3, hazards: 0 },
      { title: 'Final squadron', sub: 'Everything you have learned, at once', spawn: [['drone', 4], ['gunner', 3]], interval: 2.2, maxAlive: 4, hazards: 0 },
    ],
  },
  2: {
    id: 2, name: 'Asteroid Zone', difficulty: 'Veteran',
    desc: 'A dense rock field with faster ships, weaving fighters and burst fire.',
    tips: ['Asteroids tumble through the lane. Shoot them or steer around them.', 'Gunners fire three-shot bursts. Weavers fire fans of three.', 'Dodge sideways across a fan: the middle shot is the one aimed at you.'],
    bg: 0x1a0600, fog: 0x3a1204, light: 0xff7a3a, accent: 0xffc83c,
    playerHp: 3, speedMul: 1.25, projSpeed: 26,
    attacks: { gunner: { fire: 2.2, burst: 3 }, weaver: { fire: 1.8, spread: 3 } },
    scoring: { parTime: 240, clearBonus: 1000 },
    env: { starColor: 0xffe2c0, dustColor: 0xffa040, rocks: 140, rockColor: 0xa07858,
      planets: [
        { r: 75, color: 0xd9531e, emissive: 0x3a0e04, glow: 0xff8a3a, pos: [140, 35, -350], ring: { color: 0xffcf9a, tilt: 0.3 }, spin: 0.03 },
        { r: 13, color: 0x8a4a2a, emissive: 0x200c04, glow: 0xff6a2a, pos: [-85, -28, -215], spin: 0.08 }] },
    waves: [
      { title: 'Into the belt', sub: 'Rocks and fighters ahead', spawn: [['drone', 4], ['gunner', 2]], interval: 1.6, maxAlive: 4, hazards: 3 },
      { title: 'Weavers', sub: 'Fighters sweep side to side and fan-fire', spawn: [['weaver', 4], ['drone', 3]], interval: 1.5, maxAlive: 5, hazards: 2.6 },
      { title: 'Crossfire', sub: 'Gunners fire three-shot bursts', spawn: [['gunner', 4], ['drone', 4]], interval: 1.4, maxAlive: 5, hazards: 2.4 },
      { title: 'Heavy assault', sub: 'All ship types together', spawn: [['weaver', 4], ['gunner', 3], ['drone', 2]], interval: 1.3, maxAlive: 6, hazards: 2.2 },
      { title: 'Last stand', sub: 'Clear this wave to win', spawn: [['weaver', 4], ['gunner', 4], ['drone', 3]], interval: 1.1, maxAlive: 7, hazards: 2 },
    ],
  },
};
export const totalEnemies = (cfg) => cfg.waves.reduce((a, w) => a + w.spawn.reduce((b, [, n]) => b + n, 0), 0);
