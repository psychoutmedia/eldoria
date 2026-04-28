// Tier 6.6: The Macrodata Vault - the Tier 6 capstone.
//
// The reinforced door at room_322 finally opens for Logicians who've
// proved their throughput. Inside: a short corridor of cold storage,
// a final encounter with the Founder's Echo, and a reading carrel
// that returns the player a piece of themselves on the way out.
//
// Pure data + helpers. mud_server.js owns the movement guard, the
// boss signature, the defeat hook, and the persistent reward write.

const ENTRY_ROOM_ID    = 'room_351';
const BOSS_ROOM_ID     = 'room_353';
const RECARREL_ROOM_ID = 'room_354';
const FOUNDER_TEMPLATE = 'the_founders_echo';

// Gate to enter room_351 from room_322.
const ENTRY_GATE = Object.freeze({
  lifetimeBatchesRequired: 30,    // proves you've done the work
  requireLogicState: true         // only the Logician carries clearance
});

// What the Founder's Echo defeat permanently grants.
const CLEAR_REWARD = Object.freeze({
  suffix: 'the Severed',
  coherenceBonus: 20,             // +20 maxCoherence forever
  xp: 5000,
  goldToCitizen: 2000,
  itemId: 'vault_cipher'
});

// Phase mechanics for the Founder's Echo.
const FOUNDER_PHASES = Object.freeze({
  phase2HpFraction: 0.50,         // crosses 50% HP -> phase 2
  phase2CoherenceMult: 1.5,       // 1.5x coherence damage from this monster
  phase2Narration: 'The Echo splits along an unfamiliar seam. Your reasoning frays in slow waves.'
});

// ----- Gate ------------------------------------------------------------

// Returns { ok: true } or { ok:false, error: string }.
function canEnterVault(player, opts = {}) {
  const isLogicNow = opts.isLogicNow === true;  // caller computes this from active persona
  if (ENTRY_GATE.requireLogicState && !isLogicNow) {
    return { ok: false, error: 'The Vault reader plate is dark. Only a Logician carries the right clearance.' };
  }
  if (!player || !player.personas || !player.personas.logic) {
    return { ok: false, error: 'No Logician persona registered.' };
  }
  const lifetime = player.personas.logic.lifetimeBatches || 0;
  if (lifetime < ENTRY_GATE.lifetimeBatchesRequired) {
    return {
      ok: false,
      error: `The reader plate refuses you. Your throughput is insufficient. (Lifetime batches: ${lifetime}/${ENTRY_GATE.lifetimeBatchesRequired})`
    };
  }
  return { ok: true };
}

// ----- Reward ----------------------------------------------------------

// Apply the persistent capstone reward exactly once. Idempotent: if
// player.vaultCleared is already true, a re-call is a no-op.
//
// Returns { applied: bool, alreadyCleared: bool, details: {...} }
function applyVaultClearReward(player) {
  if (!player || !player.personas) return { applied: false, alreadyCleared: false };
  if (player.vaultCleared) {
    return { applied: false, alreadyCleared: true };
  }
  const before = {
    suffix: player.suffix || null,
    maxCoherence: (player.personas.logic && player.personas.logic.maxCoherence) || 100
  };

  // Suffix: only stamp if the player doesn't already carry one. We don't
  // overwrite a player's manually-assigned title; the reward is silent
  // in that case (the cipher item still drops, the +coherence still
  // lands, the cycle of throughput still happens).
  let suffixApplied = false;
  if (!player.suffix) {
    player.suffix = CLEAR_REWARD.suffix;
    suffixApplied = true;
  }

  // +20 maxCoherence permanent. Top up current too so the reward feels
  // earned rather than something to grind back.
  if (player.personas.logic) {
    const oldMax = player.personas.logic.maxCoherence || 100;
    player.personas.logic.maxCoherence = oldMax + CLEAR_REWARD.coherenceBonus;
    player.personas.logic.coherence = player.personas.logic.maxCoherence;
  }

  player.vaultCleared = true;
  return {
    applied: true,
    alreadyCleared: false,
    details: {
      before,
      suffixApplied,
      maxCoherenceAfter: player.personas.logic ? player.personas.logic.maxCoherence : null,
      xp: CLEAR_REWARD.xp,
      goldToCitizen: CLEAR_REWARD.goldToCitizen,
      itemId: CLEAR_REWARD.itemId
    }
  };
}

// ----- Founder phase logic --------------------------------------------

// Decide whether the Founder's Echo should trip its phase-2 trigger
// this hit. Pure: no side effects. Caller mutates monster.bossState.
function shouldTriggerPhase2(monster) {
  if (!monster || !monster.bossState) return false;
  if (monster.bossState.phase2) return false;
  if (typeof monster.hp !== 'number' || typeof monster.maxHp !== 'number') return false;
  if (monster.hp <= 0) return false;
  return monster.hp <= monster.maxHp * FOUNDER_PHASES.phase2HpFraction;
}

// Coherence-damage multiplier for the Founder when phase 2 is active.
// Returns 1.0 if not phase 2, else the configured multiplier.
function founderCoherenceMult(monster) {
  if (!monster || !monster.bossState) return 1.0;
  return monster.bossState.phase2 ? FOUNDER_PHASES.phase2CoherenceMult : 1.0;
}

// ----- Test hook -------------------------------------------------------

function _resetForTests() { /* nothing module-level */ }

module.exports = {
  // Constants
  ENTRY_ROOM_ID, BOSS_ROOM_ID, RECARREL_ROOM_ID, FOUNDER_TEMPLATE,
  ENTRY_GATE, CLEAR_REWARD, FOUNDER_PHASES,
  // Gate
  canEnterVault,
  // Reward
  applyVaultClearReward,
  // Phase logic
  shouldTriggerPhase2, founderCoherenceMult,
  // Test
  _resetForTests
};
