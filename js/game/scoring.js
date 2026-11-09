// One scoring system for every level. Kill points come from the enemy type; the combo multiplier scales them (x1 to x5).
export const comboFor = (streak) => Math.min(5, 1 + Math.floor(streak / 2));

/** Final score = kill score + (on a cleared level) clear bonus + accuracy bonus + no-damage bonus + time bonus. */
export function levelResult({ killScore, completed, shots, hits, damage, time, scoring }) {
  const accuracy = shots ? hits / shots : 0;
  const bonuses = { clear: 0, accuracy: 0, noDamage: 0, time: 0 };
  if (completed) {
    bonuses.clear = scoring.clearBonus; bonuses.accuracy = Math.round(accuracy * 1000);
    bonuses.noDamage = damage === 0 ? 1000 : 0; bonuses.time = Math.max(0, Math.round((scoring.parTime - time) * 10));
  }
  return { accuracy, bonuses, total: killScore + bonuses.clear + bonuses.accuracy + bonuses.noDamage + bonuses.time };
}
