// Tier 6.4: Chord Labor - the Logician's work loop.
//
// Logicians clock in at a Refinement Console (a room flagged
// isChordTerminal) and pull a "batch" of typed rows. Each row carries
// a type - signal, noise, or pattern - and clears when the matching
// verb (sort, bind, refine) is applied. The wrong verb costs
// Coherence; finishing the batch pays XP + Theta-credits + a practice
// point and bumps the shift's quota counter.
//
// Pure data + lifecycle. mud_server.js dispatches the verbs and owns
// reward delivery (XP path, credit accrual, leaderboard).

const ROW_TYPES = ['signal', 'noise', 'pattern'];
const VERB_FOR_TYPE = Object.freeze({ signal: 'sort', noise: 'bind', pattern: 'refine' });
const TYPE_FOR_VERB = Object.freeze({ sort: 'signal', bind: 'noise', refine: 'pattern' });

const BATCH_TIMEOUT_MS = 5 * 60 * 1000;
const COHERENCE_COST_WRONG_VERB = 5;
const BASE_BATCH_XP = 30;
const XP_PER_LEVEL = 2;
const BATCH_CREDITS = 8;
const RAPID_BONUS_THRESHOLD_MS = 60 * 1000;
const RAPID_BONUS_MULTIPLIER = 1.5;
const FLOOR_QUOTA_TARGET = 3;

// Terminal-room id -> { rowCount, weights, label }
// Weights are used to roll row types when generating a batch.
const TERMINAL_PROFILES = Object.freeze({
  room_313: { rowCount: 4, weights: { signal: 0.40, noise: 0.40, pattern: 0.20 }, label: 'Floor 1, Console Cluster A' },
  room_315: { rowCount: 4, weights: { signal: 0.40, noise: 0.40, pattern: 0.20 }, label: 'Floor 1, Console Cluster B' },
  room_319: { rowCount: 5, weights: { signal: 0.35, noise: 0.35, pattern: 0.30 }, label: 'Floor 2, Console Cluster C' },
  room_327: { rowCount: 6, weights: { signal: 0.20, noise: 0.20, pattern: 0.60 }, label: 'Optics & Drafting, Layout Room' }
});

let batchIdCounter = 1;

// === Queries / room flags ===

function isChordTerminal(roomData, roomId) {
  if (roomData && roomData.isChordTerminal) return true;
  return !!(roomId && Object.prototype.hasOwnProperty.call(TERMINAL_PROFILES, roomId));
}

function getTerminalProfile(roomId) {
  return TERMINAL_PROFILES[roomId] || null;
}

// === Batch generation ===
//
// roomId picks the profile (size + type weights). rng is injectable
// for tests; defaults to Math.random.
function generateBatch(roomId, rng = Math.random, now = Date.now()) {
  const profile = TERMINAL_PROFILES[roomId];
  if (!profile) return null;
  const rows = [];
  for (let i = 0; i < profile.rowCount; i++) {
    const r = rng();
    let acc = 0, picked = ROW_TYPES[0];
    for (const t of ROW_TYPES) {
      acc += profile.weights[t] || 0;
      if (r < acc) { picked = t; break; }
    }
    rows.push({ type: picked, cleared: false });
  }
  return {
    batchId: batchIdCounter++,
    terminalRoom: roomId,
    terminalLabel: profile.label,
    rows,
    startedAt: now,
    lastTouchedAt: now
  };
}

function isComplete(batch) {
  return !!(batch && Array.isArray(batch.rows) && batch.rows.length > 0
            && batch.rows.every(r => r && r.cleared));
}

function nextRowIndex(batch) {
  if (!batch || !Array.isArray(batch.rows)) return -1;
  return batch.rows.findIndex(r => r && !r.cleared);
}

function isExpired(batch, now = Date.now()) {
  if (!batch) return false;
  return (now - (batch.lastTouchedAt || batch.startedAt)) > BATCH_TIMEOUT_MS;
}

// === Render ===

function describeBatch(batch) {
  if (!batch) return '(no active task)';
  const lines = [];
  const stamp = batch.terminalLabel || batch.terminalRoom;
  lines.push(`Batch #${batch.batchId} from ${stamp} - ${batch.rows.length} rows:`);
  for (let i = 0; i < batch.rows.length; i++) {
    const r = batch.rows[i];
    if (r.cleared) {
      lines.push(`  [X] ${i + 1}. (cleared)`);
    } else {
      lines.push(`  [ ] ${i + 1}. ${r.type} -> use ${VERB_FOR_TYPE[r.type]}`);
    }
  }
  return lines.join('\r\n');
}

// === Mutator ===
//
// Apply a verb against a row index. Returns one of:
//  { ok:true, cleared:true, complete:bool, rowType }       - right verb
//  { ok:true, cleared:false, coherenceCost, expected, rowType } - wrong verb
//  { ok:false, error }                                     - guard violation
function applyVerb(batch, verb, rowIndex, now = Date.now()) {
  if (!batch) return { ok: false, error: 'No active task. Pull a batch first.' };
  if (!Array.isArray(batch.rows) || batch.rows.length === 0) {
    return { ok: false, error: 'Batch has no rows.' };
  }
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= batch.rows.length) {
    return { ok: false, error: `Row ${rowIndex + 1} is out of range (1-${batch.rows.length}).` };
  }
  const row = batch.rows[rowIndex];
  if (!row) return { ok: false, error: `Row ${rowIndex + 1} is missing.` };
  if (row.cleared) return { ok: false, error: `Row ${rowIndex + 1} is already cleared.` };
  if (!TYPE_FOR_VERB[verb]) return { ok: false, error: `Unknown verb: ${verb}` };
  batch.lastTouchedAt = now;
  const expected = VERB_FOR_TYPE[row.type];
  if (verb === expected) {
    row.cleared = true;
    return { ok: true, cleared: true, complete: isComplete(batch), rowType: row.type };
  }
  return {
    ok: true,
    cleared: false,
    coherenceCost: COHERENCE_COST_WRONG_VERB,
    expected,
    rowType: row.type
  };
}

// === Rewards ===
//
// Compute the payout for a completed batch. mud_server.js applies the
// XP through its existing addExperience path, the credits to
// player.personas.life.credits, the practice point to
// player.practicePoints, and the leaderboard increment. This function
// is pure: it just decides the numbers.
function computeReward(batch, level, now = Date.now()) {
  const baseXP = BASE_BATCH_XP + (Math.max(1, level || 1)) * XP_PER_LEVEL;
  const startedAt = batch ? batch.startedAt : now;
  const elapsed = Math.max(0, now - startedAt);
  const isRapid = elapsed <= RAPID_BONUS_THRESHOLD_MS;
  const credits = Math.round(BATCH_CREDITS * (isRapid ? RAPID_BONUS_MULTIPLIER : 1));
  return {
    xp: baseXP,
    credits,
    practicePoints: 1,
    isRapid,
    elapsedMs: elapsed
  };
}

// === Test hook ===

function _resetForTests() {
  batchIdCounter = 1;
}

module.exports = {
  // Constants
  ROW_TYPES, VERB_FOR_TYPE, TYPE_FOR_VERB,
  BATCH_TIMEOUT_MS, COHERENCE_COST_WRONG_VERB,
  BASE_BATCH_XP, XP_PER_LEVEL, BATCH_CREDITS,
  RAPID_BONUS_THRESHOLD_MS, RAPID_BONUS_MULTIPLIER,
  FLOOR_QUOTA_TARGET, TERMINAL_PROFILES,
  // Lifecycle
  generateBatch, describeBatch,
  // Queries
  isComplete, nextRowIndex, isExpired, isChordTerminal, getTerminalProfile,
  // Mutators / rewards
  applyVerb, computeReward,
  // Test hook
  _resetForTests
};
