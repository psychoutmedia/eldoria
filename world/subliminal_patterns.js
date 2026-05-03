// Tier 6.5b: Subliminal Patterns - cross-persona unlock mechanic.
//
// Citizens (Life-State) paint pattern swatches at the Sketch Wall in
// Theta Township. Each painted pattern surfaces as a "muscle unlock"
// on the Logician (Logic-State) persona at the next swap, opening
// doors in the Black Hallway. The Citizen does not, in any sense,
// remember painting; the Logician simply discovers the door now opens.
//
// Storage:
//   player.personas.life.paintedPatterns = { pattern_door: { paintedAt }, ... }
//   player.personas.logic.muscleUnlocks  = ['pattern_door', ...] (rebuilt on each swap)
//
// The buff side (subliminalBuffs) is the existing slot from sync_state.js
// LIFE_EXTRAS / LOGIC_EXTRAS. We populate it during swap.

const PATTERN_IDS = Object.freeze([
  'pattern_door',
  'pattern_chair',
  'pattern_window',
  'pattern_bowl',
  'pattern_hand',
  'pattern_threshold'
]);

// Each pattern, when painted, contributes a passive cross-persona buff.
// Buffs are read from player.subliminalBuffs.fromLife by the Logician
// damage / coherence path, and from .fromLogic by the Citizen path
// (most pattern buffs feed Logic since the painting happens in Life).
const PATTERN_BUFFS = Object.freeze({
  pattern_door:      { fromLife: { coherence_regen_pct: 0.05 } },
  pattern_chair:     { fromLife: { logic_xp_bonus_pct: 0.05 } },
  pattern_window:    { fromLife: { logic_credits_bonus_pct: 0.05 } },
  pattern_bowl:      { fromLife: { citizen_hp_bonus_flat: 10 } },
  pattern_hand:      { fromLife: { logic_attune_bonus: 1 } },
  pattern_threshold: { fromLife: { swap_speed_bonus: 1 } }
});

function getLifeBlock(player) {
  return player && player.personas && player.personas.life;
}

function getLogicBlock(player) {
  return player && player.personas && player.personas.logic;
}

// === Validation ===

function isValidPattern(patternId) {
  return PATTERN_IDS.includes(patternId);
}

// === Painting (Life-State) ===
//
// Citizens call this when they `paint <pattern>` at the Sketch Wall.
// Idempotent: repainting the same pattern updates the timestamp without
// changing anything else. Returns { ok: true, alreadyPainted: bool }.
function paintPattern(player, patternId, now = Date.now()) {
  if (!player) return { ok: false, error: 'No player.' };
  if (!isValidPattern(patternId)) return { ok: false, error: `Unknown pattern: ${patternId}` };
  const life = getLifeBlock(player);
  if (!life) return { ok: false, error: 'No Citizen persona registered.' };
  if (!life.paintedPatterns || typeof life.paintedPatterns !== 'object') {
    life.paintedPatterns = {};
  }
  const alreadyPainted = !!life.paintedPatterns[patternId];
  life.paintedPatterns[patternId] = { paintedAt: now };
  return { ok: true, alreadyPainted, patternId };
}

function listPaintedPatterns(player) {
  const life = getLifeBlock(player);
  if (!life || !life.paintedPatterns) return [];
  return Object.keys(life.paintedPatterns);
}

// === Cross-persona sync (called by sync_state.swapPersona post-hook) ===
//
// On any swap into Logic-State, refresh the Logician's muscleUnlocks
// list from the Citizen's paintedPatterns. The list is the canonical
// source of which Black Hallway doors open.
function syncMuscleUnlocks(player) {
  if (!player) return;
  const life = getLifeBlock(player);
  const logic = getLogicBlock(player);
  if (!life || !logic) return;
  const painted = life.paintedPatterns ? Object.keys(life.paintedPatterns) : [];
  // Persist the freshly-computed list. Order is stable insertion-order.
  logic.muscleUnlocks = painted.filter(p => PATTERN_IDS.includes(p));
}

// === Subliminal buffs ===
//
// On swap, recompute subliminalBuffs.fromLife (which the Logician reads)
// from the painted patterns. Citizens do not currently earn buffs from
// Logician work; that feed could be wired here later.
function syncSubliminalBuffs(player) {
  if (!player) return;
  if (!player.subliminalBuffs || typeof player.subliminalBuffs !== 'object') {
    player.subliminalBuffs = { fromLogic: {}, fromLife: {} };
  }
  const fromLife = {};
  const painted = listPaintedPatterns(player);
  for (const p of painted) {
    const bundle = PATTERN_BUFFS[p];
    if (!bundle || !bundle.fromLife) continue;
    for (const [k, v] of Object.entries(bundle.fromLife)) {
      // Sum numeric buffs of the same key. (Currently each pattern
      // contributes a unique key, but we tolerate overlap.)
      fromLife[k] = (fromLife[k] || 0) + v;
    }
  }
  player.subliminalBuffs.fromLife = fromLife;
}

// Convenience for the swap hook.
function applySwapHooks(player) {
  syncMuscleUnlocks(player);
  syncSubliminalBuffs(player);
}

// === Lock checks (used by isRealmGateOpen for Black Hallway rooms) ===

function hasUnlock(player, patternId) {
  const logic = getLogicBlock(player);
  if (!logic || !Array.isArray(logic.muscleUnlocks)) return false;
  return logic.muscleUnlocks.includes(patternId);
}

function hasAllUnlocks(player, patternIds) {
  if (!Array.isArray(patternIds)) return false;
  for (const p of patternIds) {
    if (!hasUnlock(player, p)) return false;
  }
  return true;
}

// === Render helpers ===

function describeBuffs(player) {
  const buffs = (player && player.subliminalBuffs && player.subliminalBuffs.fromLife) || {};
  const lines = [];
  for (const [k, v] of Object.entries(buffs)) {
    lines.push(`  ${k}: ${v}`);
  }
  if (lines.length === 0) lines.push('  (no subliminal buffs active)');
  return lines.join('\r\n');
}

module.exports = {
  PATTERN_IDS, PATTERN_BUFFS,
  isValidPattern,
  paintPattern, listPaintedPatterns,
  syncMuscleUnlocks, syncSubliminalBuffs, applySwapHooks,
  hasUnlock, hasAllUnlocks,
  describeBuffs
};
