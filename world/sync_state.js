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
  // Tier 6.4 retro: Four Tempers attunement meter (shared across personas).
  // `tempers` accumulates correct-clear attunement; `tempersMissorts`
  // accumulates wrong-verb counts that trigger Temper boss manifestations.
  if (!player.tempers || typeof player.tempers !== 'object') {
    player.tempers = { dread: 0, frolic: 0, malice: 0, woe: 0 };
  } else {
    for (const k of ['dread', 'frolic', 'malice', 'woe']) {
      if (typeof player.tempers[k] !== 'number') player.tempers[k] = 0;
    }
  }
  if (!player.tempersMissorts || typeof player.tempersMissorts !== 'object') {
    player.tempersMissorts = { dread: 0, frolic: 0, malice: 0, woe: 0 };
  } else {
    for (const k of ['dread', 'frolic', 'malice', 'woe']) {
      if (typeof player.tempersMissorts[k] !== 'number') player.tempersMissorts[k] = 0;
    }
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

// === Tier 6.7: LLM-graded retorts ===
//
// Phase 6.2 stubbed the `retort` verb against Corrupted Queries with a
// keyword grader. Phase 6.7 upgrades that path to a genuine LLM grade
// against the specific Query's failure mode, with a structured-output
// parser and an offline keyword fallback that matches the original
// Phase 6.2 behaviour. Tests inject a deterministic `opts.llm` to side-
// step Ollama latency and non-determinism.
//
// Public entry: `gradeRetort(query, argument, opts)` returns a Promise
// resolving to `{ grade, feedback, fallback, error? }`. `grade` is a
// clamped integer 0-100. `fallback: true` means we used the keyword
// path (offline / timeout / parse-fail).

const RETORT_KEYWORDS = Object.freeze({
  query_dangling_pointer: ['address', 'free', 'deallocate', 'lifetime', 'ownership', 'valid', 'null', 'reference'],
  query_null_referent:    ['name', 'identifier', 'exists', 'defined', 'specify', 'concrete', 'subject', 'referent'],
  query_recursive_loop:   ['base case', 'halt', 'terminate', 'fixed point', 'induction', 'depth', 'finite'],
  query_off_by_one:       ['exact', 'boundary', 'inclusive', 'exclusive', 'index', 'count', 'fence', 'precise'],
  query_race_condition:   ['lock', 'atomic', 'order', 'synchron', 'sequence', 'barrier', 'happens-before', 'mutex'],
  query_cache_miss:       ['load', 'remember', 'recall', 'fetch', 'warm', 'concrete', 'instance', 'present'],
  query_segfault_phantom: ['permission', 'boundary', 'owned', 'consent', 'allowed', 'range', 'authorise', 'authorized'],
  query_orphaned_handle:  ['release', 'close', 'owner', 'parent', 'cleanup', 'lifecycle', 'free', 'dispose']
});

const RETORT_FALLBACK_FLOOR = 30;
const RETORT_FALLBACK_CAP = 95;
const RETORT_PER_KEYWORD = 12;

function _normaliseQueryId(query) {
  if (!query) return '';
  if (typeof query === 'string') return query;
  return query.id || query.templateId || query.monsterId || '';
}

function _normaliseQueryName(query) {
  if (!query) return 'a Corrupted Query';
  if (typeof query === 'string') return query;
  return query.name || _normaliseQueryId(query) || 'a Corrupted Query';
}

function _normaliseQueryDescription(query) {
  if (!query || typeof query === 'string') return '';
  return query.description || '';
}

function _keywordGrade(queryId, argument) {
  const arg = String(argument || '').toLowerCase().trim();
  if (!arg) return { grade: 0, feedback: 'Empty retort.' };
  const kw = RETORT_KEYWORDS[queryId] || [];
  let hits = 0;
  for (const k of kw) {
    if (arg.includes(k)) hits++;
  }
  // Length-floor: any non-trivial argument starts at the floor.
  let grade = arg.length >= 8 ? RETORT_FALLBACK_FLOOR : 10;
  grade += hits * RETORT_PER_KEYWORD;
  if (grade > RETORT_FALLBACK_CAP) grade = RETORT_FALLBACK_CAP;
  if (grade < 0) grade = 0;
  const feedback = hits > 0
    ? `Keyword grade: ${hits} relevant term${hits === 1 ? '' : 's'} identified.`
    : 'Keyword grade: no relevant terms identified.';
  return { grade, feedback };
}

function _buildRetortPrompt(queryName, queryDescription, argument) {
  const sys = [
    'You are the Saint-Reed Institute\'s Refinement Auditor. You grade Logicians\' verbal retorts against Corrupted Queries on a 0-100 scale.',
    'Grading rubric:',
    '- 90-100: incisive; names the exact failure mode and a correct remediation.',
    '- 70-89: substantively correct; identifies the failure mode.',
    '- 50-69: relevant but vague; partial fit.',
    '- 30-49: tangentially related; weak.',
    '- 0-29: irrelevant, incoherent, or worse than nothing.',
    'Output ONLY a single JSON object on one line, no prose, no code fences. Schema:',
    '{"grade": <integer 0-100>, "feedback": "<one short sentence, plain ASCII>"}'
  ].join('\n');
  const user = [
    `Corrupted Query: ${queryName}`,
    queryDescription ? `Nature: ${queryDescription}` : '',
    `Logician's retort: ${String(argument).slice(0, 600)}`
  ].filter(Boolean).join('\n');
  return [
    { role: 'system', content: sys },
    { role: 'user', content: user }
  ];
}

function _parseRetortJson(raw) {
  if (typeof raw !== 'string') return null;
  // Find the first balanced-looking {...} run. Cheap and good enough.
  const start = raw.indexOf('{');
  if (start < 0) return null;
  const end = raw.lastIndexOf('}');
  if (end <= start) return null;
  const candidate = raw.slice(start, end + 1);
  let obj;
  try { obj = JSON.parse(candidate); } catch (e) { return null; }
  if (!obj || typeof obj !== 'object') return null;
  let grade = obj.grade;
  if (typeof grade === 'string') grade = parseInt(grade, 10);
  if (typeof grade !== 'number' || !isFinite(grade)) return null;
  grade = Math.max(0, Math.min(100, Math.round(grade)));
  let feedback = obj.feedback;
  if (typeof feedback !== 'string') feedback = '';
  feedback = feedback.replace(/[\r\n]+/g, ' ').slice(0, 240).trim();
  return { grade, feedback };
}

// Async grader. Resolves to { grade, feedback, fallback, error? }.
//   query: monster instance or template (or string id)
//   argument: the Logician's retort string
//   opts.llm: optional async (messages) => string; defaults to ollama.chat
//   opts.timeoutMs: forwarded to ollama
async function gradeRetort(query, argument, opts = {}) {
  const queryId = _normaliseQueryId(query);
  const queryName = _normaliseQueryName(query);
  const queryDescription = _normaliseQueryDescription(query);
  const argText = String(argument || '').trim();
  if (!argText) {
    return { grade: 0, feedback: 'Empty retort.', fallback: true };
  }

  // Test/offline path: caller can short-circuit the LLM entirely.
  if (opts && opts.offline === true) {
    const kw = _keywordGrade(queryId, argText);
    return { grade: kw.grade, feedback: kw.feedback, fallback: true };
  }

  const messages = _buildRetortPrompt(queryName, queryDescription, argText);
  let raw;
  try {
    if (typeof opts.llm === 'function') {
      raw = await opts.llm(messages, { temperature: 0.2, num_predict: 80, timeoutMs: opts.timeoutMs });
    } else {
      // Lazy require so this module can be unit-tested without Node 18 fetch
      const ollama = require('../llm/ollama');
      raw = await ollama.chat(messages, { temperature: 0.2, num_predict: 80, timeoutMs: opts.timeoutMs });
    }
  } catch (err) {
    const kw = _keywordGrade(queryId, argText);
    return { grade: kw.grade, feedback: kw.feedback, fallback: true, error: err.message };
  }

  const parsed = _parseRetortJson(raw);
  if (!parsed) {
    const kw = _keywordGrade(queryId, argText);
    return { grade: kw.grade, feedback: kw.feedback, fallback: true, error: 'parse_failed' };
  }
  return { grade: parsed.grade, feedback: parsed.feedback || `LLM grade: ${parsed.grade}/100.`, fallback: false };
}

// === Test hooks ===
function _resetForTests() {
  // Module-level state is just constants; nothing to reset, but keep
  // the symbol so harnesses can call it without conditionals.
}

// === Tier 6.8: Splice ending - unlock the hybrid persona block ===
//
// The Splice ending sews a third persona from the seams of the first
// two. The hybrid block mirrors the player's snapshot at choice time
// (so the player wakes inside the hybrid with their current gear and
// HP), with one extra room - room_401_phantom - reserved for Tier 7.
function unlockHybridPersona(player, originRoom) {
  if (!player) return { ok: false, error: 'No player.' };
  if (!player.personas) return { ok: false, error: 'No personas registered.' };
  if (player.personas.hybrid) {
    return { ok: false, error: 'Hybrid persona already unlocked.' };
  }
  const snap = snapshotPersona(player);
  // The hybrid arrives at the Splice Theatre's defaulted anchor (caller
  // can override); persists its own equipped/HP/inventory from the
  // snapshot taken right after Splice was committed.
  snap.currentRoom = originRoom || snap.currentRoom;
  // Hybrid extras: same shape as logic + life extras, plus the phantom
  // hook for Tier 7.
  player.personas.hybrid = Object.assign({}, snap, {
    coherence: 100,
    maxCoherence: 100,
    muscleUnlocks: Array.isArray(player.personas.logic && player.personas.logic.muscleUnlocks)
      ? player.personas.logic.muscleUnlocks.slice() : [],
    activeTask: null,
    credits: (player.personas.life && player.personas.life.credits) || 0,
    muscleMemory: {},
    paintedPatterns: (player.personas.life && player.personas.life.paintedPatterns)
      ? Object.assign({}, player.personas.life.paintedPatterns) : {},
    phantomRoom: 'room_401_phantom'
  });
  return { ok: true };
}

module.exports = {
  // Constants
  SCHEMA_VERSION, PERSONA_FIELDS, LOGIC_EXTRAS, LIFE_EXTRAS,
  // Lifecycle
  migrateLegacySave, initializePersonas,
  // Tier 6.8 hybrid unlock
  unlockHybridPersona,
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
  // Tier 6.7: retort grading
  gradeRetort, RETORT_KEYWORDS, RETORT_FALLBACK_FLOOR, RETORT_FALLBACK_CAP,
  _keywordGrade, _buildRetortPrompt, _parseRetortJson,
  // Test hook
  _resetForTests
};
