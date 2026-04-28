// Tier 6.5: Muscle Memory - cross-persona one-shot abilities.
//
// A Logician on shift accumulates "muscle memory" that the Citizen
// inherits at swap-out. The Citizen consumes charges via `memory <id>`
// to fire one-shot abilities that hook into the existing combat
// (flee, melee attack, monster turn) and healing paths.
//
// Charges are stored on player.personas.life.muscleMemory[id]. The
// Logician earns them by completing batches; the more batches in a
// single shift, the more charges credited at shift-end.

const MEMORY_DEFS = Object.freeze({
  refinement_reflex: {
    id: 'refinement_reflex',
    label: 'Refinement Reflex',
    description: 'Cancel the next monster attack against you.',
    earnEvery: 3,
    effectKey: 'muscle_refinement_reflex',
    instantHeal: 0
  },
  quota_grit: {
    id: 'quota_grit',
    label: 'Quota Grit',
    description: 'Your next melee attack deals +25% damage.',
    earnEvery: 5,
    effectKey: 'muscle_quota_grit',
    instantHeal: 0
  },
  console_calm: {
    id: 'console_calm',
    label: 'Console Calm',
    description: 'Restore 50 HP immediately.',
    earnEvery: 8,
    effectKey: null,
    instantHeal: 50
  },
  floor_finesse: {
    id: 'floor_finesse',
    label: 'Floor Finesse',
    description: 'Your next flee attempt automatically succeeds.',
    earnEvery: 12,
    effectKey: 'muscle_floor_finesse',
    instantHeal: 0
  }
});

// Compute charges earned for a shift with N batches. Pure.
function chargesForShift(batches) {
  const out = {};
  const n = (typeof batches === 'number' && batches > 0) ? Math.floor(batches) : 0;
  for (const def of Object.values(MEMORY_DEFS)) {
    out[def.id] = (def.earnEvery > 0) ? Math.floor(n / def.earnEvery) : 0;
  }
  return out;
}

// Credit charges to player.personas.life.muscleMemory based on the
// shift's batch count. Returns { earned: { id: count }, applied: bool }.
function creditShiftMemories(player, batches) {
  if (!player || !player.personas || !player.personas.life) {
    return { earned: {}, applied: false };
  }
  const earned = chargesForShift(batches);
  const mm = player.personas.life.muscleMemory || {};
  let any = false;
  for (const id of Object.keys(earned)) {
    if (earned[id] > 0) {
      mm[id] = (mm[id] || 0) + earned[id];
      any = true;
    }
  }
  player.personas.life.muscleMemory = mm;
  return { earned, applied: true, anyEarned: any };
}

// Consume one charge of `id` from player.personas.life.muscleMemory.
// Returns { ok, def, remaining } on success or { ok:false, error } on failure.
function consumeMemory(player, id) {
  if (!player || !player.personas || !player.personas.life) {
    return { ok: false, error: 'No Citizen persona registered.' };
  }
  if (!id || !MEMORY_DEFS[id]) {
    return { ok: false, error: `Unknown memory id: ${id}` };
  }
  const mm = player.personas.life.muscleMemory || {};
  const have = mm[id] || 0;
  if (have <= 0) {
    return { ok: false, error: `You have no ${MEMORY_DEFS[id].label} charges.` };
  }
  mm[id] = have - 1;
  player.personas.life.muscleMemory = mm;
  return { ok: true, def: MEMORY_DEFS[id], remaining: mm[id] };
}

// Snapshot the player's current muscle-memory standings for display.
function listMemories(player) {
  const mm = (player && player.personas && player.personas.life
              && player.personas.life.muscleMemory) || {};
  const out = [];
  for (const def of Object.values(MEMORY_DEFS)) {
    out.push({
      id: def.id,
      label: def.label,
      description: def.description,
      charges: mm[def.id] || 0,
      earnEvery: def.earnEvery
    });
  }
  return out;
}

// Resolve a user-typed token (id, prefix, or label) against a memory id.
// Returns the canonical id or null.
function resolveMemoryName(token) {
  if (typeof token !== 'string') return null;
  const t = token.trim().toLowerCase().replace(/\s+/g, '_');
  if (!t) return null;
  if (MEMORY_DEFS[t]) return t;
  // Prefix match against known ids
  const ids = Object.keys(MEMORY_DEFS);
  const prefixHit = ids.find(id => id.startsWith(t));
  if (prefixHit) return prefixHit;
  // Match against label words
  const labelHit = ids.find(id => MEMORY_DEFS[id].label.toLowerCase().replace(/\s+/g, '_').startsWith(t));
  return labelHit || null;
}

function _resetForTests() { /* no module-level mutable state */ }

module.exports = {
  MEMORY_DEFS,
  chargesForShift,
  creditShiftMemories,
  consumeMemory,
  listMemories,
  resolveMemoryName,
  _resetForTests
};
