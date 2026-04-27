// Tier 6.1: Sync-State Architecture.
//
// Players who reach Severance Layer Theta carry two personas in one save
// file: a Logician (Logic-State, work-side) and a Citizen (Life-State,
// home-side). They share the player's character level, abilities, and
// achievements; they isolate location, HP/mana, inventory, equipped
// gear, gold, effects, and per-persona timers.
//
// At runtime the *active* persona's fields live on the flat player
// object (so the rest of mud_server.js can keep reading `player.currentHP`
// etc. unchanged). The inactive persona block holds the frozen mirror.
// On `swap` we mirror live → active block, then unfreeze inactive →
// live, then flip `activePersona`.
//
// Pre-Tier-6 saves don't have personas. `migrateLegacySave` synthesizes
// a Citizen from the existing flat fields plus an empty Logician on
// first read. The migration is idempotent — once `schemaVersion: 6` is
// set, we never re-migrate.

const SCHEMA_VERSION = 6;

// Fields that belong to a persona (i.e. mirrored on swap).
// EVERYTHING else stays at the player root and is shared between personas.
const PERSONA_FIELDS = Object.freeze([
  'currentRoom',
  'currentHP', 'maxHP',
  'currentMana', 'maxMana',
  'inventory',
  'equipped',
  'gold',
  'effects',
  'affects',
  'spellCooldowns'
]);

// Persona-specific extra fields that don't exist on the legacy player object.
// Default values applied on persona creation.
const LOGIC_EXTRAS = Object.freeze({
  coherence: 100,
  maxCoherence: 100,
  muscleUnlocks: [],          // populated by Phase 6.5
  activeTask: null            // populated by Phase 6.4 (Chord Labor batch)
});

const LIFE_EXTRAS = Object.freeze({
  credits: 0,                 // populated passively by 6.3
  lifeAnchorRoom: null,       // assigned townhouse — set when partition_intake completes
  muscleMemory: {}            // populated by Phase 6.5
});

// === Migration ===
//
// Given a freshly-loaded player object (post-loadPlayer), upgrade it to
// the Tier-6 schema. Idempotent. Returns the same object for chaining.
function migrateLegacySave(player) {
  if (!player || typeof player !== 'object') return player;
  if (player.schemaVersion === SCHEMA_VERSION && player.personas && player.personas.life) {
    return player;
  }

  // Snapshot the flat fields as the Citizen baseline. The legacy player
  // never visited Theta, so they're a Citizen by default.
  const lifeBlock = snapshotPersona(player);
  Object.assign(lifeBlock, LIFE_EXTRAS);

  // Logician is fresh — same room/HP as the Citizen so a first swap is
  // mechanically safe, but with empty inventory/equipped (logic-state
  // gear is earned, not inherited from the surface life).
  const logicBlock = snapshotPersona(player);
  logicBlock.inventory = [];
  logicBlock.equipped = blankEquipped();
  logicBlock.gold = 0;
  logicBlock.effects = {};
  logicBlock.affects = [];
  logicBlock.spellCooldowns = {};
  Object.assign(logicBlock, LOGIC_EXTRAS);

  player.personas = {
    life: lifeBlock,
    logic: logicBlock,
    hybrid: null
  };
  player.activePersona = 'life';
  if (!Array.isArray(player.pocketArtifacts)) player.pocketArtifacts = [];
  if (!player.subliminalBuffs || typeof player.subliminalBuffs !== 'object') {
    player.subliminalBuffs = { fromLogic: {}, fromLife: {} };
  }
  player.schemaVersion = SCHEMA_VERSION;
  return player;
}

// Initialize personas on a fresh player from createPlayer. The flat
// fields already have starter values; we just need to seed the persona
// blocks. Same code path as migration but called from createPlayer.
function initializePersonas(player) {
  return migrateLegacySave(player);
}

// Lift the current flat-field values into a plain object (deep enough
// for the persona block). Inventory and equipped get shallow-copied so
// the live player and the snapshot don't alias.
function snapshotPersona(player) {
  return {
    currentRoom: player.currentRoom,
    currentHP: player.currentHP,
    maxHP: player.maxHP,
    currentMana: player.currentMana,
    maxMana: player.maxMana,
    inventory: Array.isArray(player.inventory) ? player.inventory.slice() : [],
    equipped: Object.assign(blankEquipped(), player.equipped || {}),
    gold: player.gold || 0,
    effects: Object.assign({}, player.effects || {}),
    affects: Array.isArray(player.affects) ? player.affects.slice() : [],
    spellCooldowns: Object.assign({}, player.spellCooldowns || {})
  };
}

function blankEquipped() {
  return { weapon: null, armor: null, shield: null, head: null, neck: null, hands: null, feet: null, finger: null };
}

// === Active persona accessors ===

function getActivePersona(player) {
  if (!player || !player.personas) return 'life';
  return player.activePersona || 'life';
}

function getPersonaBlock(player, which) {
  if (!player || !player.personas) return null;
  return player.personas[which] || null;
}

// === Swap mechanic ===
//
// Validates the swap, then performs it: mirror live fields into the
// outgoing persona block, copy the incoming persona block into live
// fields, flip activePersona. Caller is responsible for the narrative
// crawl, broadcasts, and any post-swap hooks (Phase 6.5 muscle-memory
// unlocks, Phase 6.3 pocket-artifact surfacing).
//
// Options:
//   { ignoreTerminal: true } — bypass the sync-terminal location check
//   (used by ejectToLifeState during forced ejects)
//   { target: 'logic'|'life'|'hybrid' } — explicit target instead of toggle
function swapPersona(player, options = {}) {
  if (!player || !player.personas) return { ok: false, error: 'No personas registered.' };
  if (player.inCombat || player.pvpCombatTarget) {
    return { ok: false, error: "You can't swap during combat." };
  }
  const current = getActivePersona(player);
  let target = options.target;
  if (!target) target = current === 'life' ? 'logic' : 'life';
  if (target === current) return { ok: false, error: `Already in ${current === 'logic' ? 'Logician' : 'Citizen'} state.` };
  if (!player.personas[target]) return { ok: false, error: `No ${target} persona on this character.` };

  // Mirror live → outgoing block
  const outgoing = player.personas[current];
  if (outgoing) {
    Object.assign(outgoing, snapshotPersona(player));
  }

  // Lift incoming block → live fields
  const incoming = player.personas[target];
  applyPersonaBlockToPlayer(player, incoming);

  player.activePersona = target;
  return { ok: true, from: current, to: target };
}

// Copy a persona block's persona-fields onto the live player object.
function applyPersonaBlockToPlayer(player, block) {
  if (!block) return;
  player.currentRoom    = block.currentRoom;
  player.currentHP      = block.currentHP;
  player.maxHP          = block.maxHP;
  player.currentMana    = block.currentMana;
  player.maxMana        = block.maxMana;
  player.inventory      = Array.isArray(block.inventory) ? block.inventory.slice() : [];
  player.equipped       = Object.assign(blankEquipped(), block.equipped || {});
  player.gold           = block.gold || 0;
  player.effects        = Object.assign({}, block.effects || {});
  player.affects        = Array.isArray(block.affects) ? block.affects.slice() : [];
  player.spellCooldowns = Object.assign({}, block.spellCooldowns || {});
}

// On savePlayer, mirror live → active persona block so a server crash
// doesn't lose progress. Idempotent.
function syncLiveToActivePersona(player) {
  if (!player || !player.personas) return;
  const active = getActivePersona(player);
  const block = player.personas[active];
  if (!block) return;
  Object.assign(block, snapshotPersona(player));
}

// === Forced eject (Phase 6.2 hook — stub here so 6.1 wiring is complete) ===
//
// Called when a Logician's Coherence drops to 0. Forces a swap to Life-
// State, applies Neural Hangover, and surfaces pocket artifacts. The
// actual Coherence / Hangover application lives in Phase 6.2; here we
// just provide the hook so other modules can call it.
function ejectToLifeState(player) {
  if (!player || !player.personas) return { ok: false, error: 'No personas.' };
  if (getActivePersona(player) !== 'logic') {
    return { ok: false, error: 'Not in Logic-State.' };
  }
  // Drop combat state before swapping
  player.inCombat = false;
  player.combatTarget = null;
  const r = swapPersona(player, { target: 'life', ignoreTerminal: true });
  if (!r.ok) return r;
  // Neural Hangover effect (placeholder; Phase 6.2 fills in the stat-debuff math)
  if (!player.effects) player.effects = {};
  player.effects.neural_hangover = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    severity: 0.20
  };
  return { ok: true, from: 'logic', to: 'life', hangover: true };
}

// === Sync-terminal gating ===
//
// `swap` is only legal in rooms flagged as sync terminals. The list of
// rooms is read from rooms.json on demand (not cached here — Phase 6.1
// keeps it simple).
function isSyncTerminal(roomData) {
  return !!(roomData && roomData.isSyncTerminal);
}

// === Crash recovery ===
//
// On login, if activePersona was 'logic' but no live combat is in
// progress, the player likely crashed during a Logician shift. Snap
// them to their Citizen's lifeAnchorRoom and flag a Hangover.
function recoverFromCrashIfNeeded(player) {
  if (!player || !player.personas) return false;
  if (getActivePersona(player) !== 'logic') return false;
  // Snap to the Citizen's anchor room
  const lifeBlock = player.personas.life;
  const anchor = (lifeBlock && lifeBlock.lifeAnchorRoom) || lifeBlock && lifeBlock.currentRoom;
  if (!anchor) return false;
  swapPersona(player, { target: 'life', ignoreTerminal: true });
  if (player.personas.life && anchor) {
    player.personas.life.currentRoom = anchor;
    player.currentRoom = anchor;
  }
  if (!player.effects) player.effects = {};
  player.effects.neural_hangover = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    severity: 0.20
  };
  return true;
}

// === Pocket artifacts (Phase 6.3 hook — basic queue helpers) ===
function pushPocketArtifact(player, item) {
  if (!player) return;
  if (!Array.isArray(player.pocketArtifacts)) player.pocketArtifacts = [];
  player.pocketArtifacts.push(item);
  if (player.pocketArtifacts.length > 50) player.pocketArtifacts.shift();
}

function drainPocketArtifacts(player, max = 3) {
  if (!player || !Array.isArray(player.pocketArtifacts)) return [];
  const out = player.pocketArtifacts.splice(0, Math.max(0, max));
  return out;
}

// === Test hooks ===
function _resetForTests() {
  // Module-level state is just constants; nothing to reset, but keep
  // the symbol so harnesses can call it without conditionals.
}

module.exports = {
  // Constants
  SCHEMA_VERSION, PERSONA_FIELDS, LOGIC_EXTRAS, LIFE_EXTRAS,
  // Lifecycle
  migrateLegacySave, initializePersonas,
  // Snapshot helpers (exposed for tests)
  snapshotPersona, blankEquipped, applyPersonaBlockToPlayer,
  // Active persona accessors
  getActivePersona, getPersonaBlock,
  // Mutators
  swapPersona, syncLiveToActivePersona, ejectToLifeState, recoverFromCrashIfNeeded,
  // Pocket artifact queue
  pushPocketArtifact, drainPocketArtifacts,
  // Helpers
  isSyncTerminal,
  // Test hook
  _resetForTests
};
