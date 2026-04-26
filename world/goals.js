// Tier 4.6: Goals system.
//
// Long-term passive achievements distinct from the existing
// `achievementsUnlocked` (which auto-unlock). Goals require an explicit
// `goal claim` step and surface progress to the player.
//
// Pure data + evaluation layer. mud_server.js increments counters via
// `incrementCounter`, sets booleans via `setBoolean`, expands sets via
// `addToSet`, then calls `evaluateAll` to recompute completion state.
// Reward delivery (qp / gold / title) lives in mud_server.js — this
// module just answers "is goal X complete?" and "is goal X claimable?".

const fs = require('fs');
const path = require('path');

const GOALS_PATH = path.join(__dirname, '..', 'goals.json');

// Categories the UI groups by. New goals must use one of these.
const CATEGORIES = ['combat', 'exploration', 'economy', 'progression'];

// Counter-style goal types accumulate progress over time.
// Boolean-style flip once. Set-style track membership in a finite set.
// Threshold-style watch a value that may go up or down (level, gold).
const VALID_TYPES = new Set(['counter', 'boolean', 'set', 'threshold']);

// Special marker — when target is "ALL_ZONES" the runtime substitutes
// the live world's zone count. This keeps goals.json portable across
// world-edit additions.
const TARGET_ALL_ZONES = 'ALL_ZONES';

let definitions = null;        // [{ id, category, name, ... }]
let definitionsById = null;    // Map<id, def>

function loadDefinitions(filePath = GOALS_PATH) {
  if (!fs.existsSync(filePath)) {
    definitions = [];
    definitionsById = new Map();
    return { ok: true, count: 0 };
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    definitions = [];
    definitionsById = new Map();
    return { ok: false, error: `goals.json parse error: ${e.message}` };
  }
  const list = Array.isArray(raw.goals) ? raw.goals : [];
  const errors = [];
  const cleaned = [];
  const seen = new Set();
  for (const g of list) {
    const v = validateDefinition(g);
    if (!v.ok) { errors.push(`${g && g.id || '<unnamed>'}: ${v.error}`); continue; }
    if (seen.has(g.id))    { errors.push(`${g.id}: duplicate id`); continue; }
    seen.add(g.id);
    cleaned.push(g);
  }
  definitions = cleaned;
  definitionsById = new Map(cleaned.map(g => [g.id, g]));
  return { ok: errors.length === 0, count: cleaned.length, errors };
}

function validateDefinition(g) {
  if (!g || typeof g !== 'object')                              return { ok: false, error: 'not an object' };
  if (typeof g.id !== 'string' || !g.id.length)                 return { ok: false, error: 'missing id' };
  if (!CATEGORIES.includes(g.category))                         return { ok: false, error: `bad category "${g.category}"` };
  if (typeof g.name !== 'string' || !g.name.length)             return { ok: false, error: 'missing name' };
  if (typeof g.description !== 'string')                        return { ok: false, error: 'missing description' };
  if (!VALID_TYPES.has(g.type))                                 return { ok: false, error: `bad type "${g.type}"` };
  if (typeof g.key !== 'string' || !g.key.length)               return { ok: false, error: 'missing key' };
  if (g.type === 'boolean') {
    if (g.target !== true && g.target !== false)                return { ok: false, error: 'boolean target must be true/false' };
  } else if (g.type === 'set') {
    if (g.target !== TARGET_ALL_ZONES && (!Array.isArray(g.target) || !g.target.length))
                                                                return { ok: false, error: 'set target must be ALL_ZONES or non-empty array' };
  } else { // counter / threshold
    if (typeof g.target !== 'number' || g.target <= 0 || !Number.isFinite(g.target))
                                                                return { ok: false, error: 'numeric target must be a positive finite number' };
  }
  if (!g.reward || typeof g.reward !== 'object')                return { ok: false, error: 'missing reward' };
  if (g.reward.qp != null && (!Number.isFinite(g.reward.qp) || g.reward.qp < 0))
                                                                return { ok: false, error: 'reward.qp must be non-negative number' };
  if (g.reward.gold != null && (!Number.isFinite(g.reward.gold) || g.reward.gold < 0))
                                                                return { ok: false, error: 'reward.gold must be non-negative number' };
  if (g.reward.title != null && typeof g.reward.title !== 'string')
                                                                return { ok: false, error: 'reward.title must be string' };
  return { ok: true };
}

function getDefinitions() { return definitions || []; }
function getDefinition(id) { return definitionsById ? definitionsById.get(id) || null : null; }
function listByCategory(cat) { return getDefinitions().filter(g => g.category === cat); }

// === Player progress access helpers ===
//
// player.goalProgress is { [goalKey]: number | bool | string[] }
// player.goalsClaimed is string[]   (ids that have been claimed)

function ensureProgressShape(player) {
  if (!player.goalProgress || typeof player.goalProgress !== 'object') player.goalProgress = {};
  if (!Array.isArray(player.goalsClaimed)) player.goalsClaimed = [];
  return player;
}

function getProgress(player, key, defaultValue = 0) {
  ensureProgressShape(player);
  const v = player.goalProgress[key];
  return v == null ? defaultValue : v;
}

// Add `n` to a counter-style key. Returns the new value.
function incrementCounter(player, key, n = 1) {
  ensureProgressShape(player);
  const cur = Number(player.goalProgress[key]) || 0;
  const next = cur + n;
  player.goalProgress[key] = next;
  return next;
}

// Set a boolean key to true (or value).
function setBoolean(player, key, value = true) {
  ensureProgressShape(player);
  player.goalProgress[key] = !!value;
  return player.goalProgress[key];
}

// Add a member to a set-tracked key. Returns the set's size.
function addToSet(player, key, member) {
  ensureProgressShape(player);
  let arr = player.goalProgress[key];
  if (!Array.isArray(arr)) { arr = []; player.goalProgress[key] = arr; }
  if (!arr.includes(member)) arr.push(member);
  return arr.length;
}

// === Evaluation ===
//
// Resolve the runtime target for a goal (handles ALL_ZONES expansion etc).
// The caller passes a context with anything dynamic; for now only zoneCount.
function resolveTarget(goal, ctx) {
  if (goal.target === TARGET_ALL_ZONES) {
    return ctx && Number.isInteger(ctx.zoneCount) && ctx.zoneCount > 0 ? ctx.zoneCount : 0;
  }
  return goal.target;
}

// Pull the goal's "current value" from the player. For threshold-type goals,
// the key may live outside goalProgress (e.g. player.level), so we fall back
// to ctx.values for those.
function readCurrent(goal, player, ctx) {
  if (goal.type === 'threshold') {
    if (ctx && ctx.values && ctx.values[goal.key] != null) return ctx.values[goal.key];
    return getProgress(player, goal.key, 0);
  }
  if (goal.type === 'set') {
    const arr = getProgress(player, goal.key, []);
    return Array.isArray(arr) ? arr.length : 0;
  }
  if (goal.type === 'boolean') {
    return !!getProgress(player, goal.key, false);
  }
  // counter
  return Number(getProgress(player, goal.key, 0));
}

// Returns one of: 'completed' | 'in_progress' | 'claimed'
function statusFor(goal, player, ctx) {
  ensureProgressShape(player);
  if (player.goalsClaimed.includes(goal.id)) return 'claimed';
  if (isComplete(goal, player, ctx)) return 'completed';
  return 'in_progress';
}

function isComplete(goal, player, ctx) {
  const cur = readCurrent(goal, player, ctx);
  if (goal.type === 'boolean') return cur === !!goal.target;
  const target = resolveTarget(goal, ctx);
  if (target == null || target <= 0) return false;
  return cur >= target;
}

function progressFor(goal, player, ctx) {
  const cur = readCurrent(goal, player, ctx);
  if (goal.type === 'boolean') {
    return { current: cur ? 1 : 0, target: 1, percent: cur ? 100 : 0 };
  }
  const target = resolveTarget(goal, ctx);
  if (target <= 0) return { current: cur, target: 0, percent: 0 };
  const pct = Math.min(100, Math.floor((cur / target) * 100));
  return { current: cur, target, percent: pct };
}

// === Claim ===
//
// Caller checks `canClaim` first, performs the reward delivery (qp/gold/title)
// in mud_server.js, then calls `markClaimed` so the goal can never be claimed
// twice. `canClaim` enforces idempotency.
function canClaim(goal, player, ctx) {
  ensureProgressShape(player);
  if (!goal) return { ok: false, error: 'No such goal.' };
  if (player.goalsClaimed.includes(goal.id)) return { ok: false, error: 'Already claimed.' };
  if (!isComplete(goal, player, ctx)) {
    const p = progressFor(goal, player, ctx);
    return { ok: false, error: `Not yet complete (${p.current}/${p.target}).`, progress: p };
  }
  return { ok: true, goal };
}

function markClaimed(goal, player) {
  ensureProgressShape(player);
  if (!player.goalsClaimed.includes(goal.id)) player.goalsClaimed.push(goal.id);
  return player.goalsClaimed.length;
}

// Test hook
function _resetForTests() {
  definitions = null;
  definitionsById = null;
}

module.exports = {
  // Constants
  CATEGORIES, VALID_TYPES, TARGET_ALL_ZONES, GOALS_PATH,
  // Lifecycle
  loadDefinitions, getDefinitions, getDefinition, listByCategory,
  // Validation (exposed for tests)
  validateDefinition,
  // Progress mutation
  ensureProgressShape, incrementCounter, setBoolean, addToSet, getProgress,
  // Evaluation
  resolveTarget, readCurrent, isComplete, progressFor, statusFor,
  // Claim flow
  canClaim, markClaimed,
  // Test hook
  _resetForTests
};
