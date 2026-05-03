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

// Tier 6.4 retro: Four Tempers. Each row also carries a temper so a
// correctly-cleared row attunes the player to that temper, and a wrong-
// verb mistake adds to the missort counter for that temper. Hitting the
// missort threshold manifests a Temper boss in the player's room. The
// tempers axis is purely additive on top of the signal/noise/pattern
// grammar - the existing verb dispatcher and reward math are untouched.
const TEMPERS = Object.freeze(['dread', 'frolic', 'malice', 'woe']);
const DEFAULT_TEMPER_WEIGHTS = Object.freeze({ dread: 0.25, frolic: 0.25, malice: 0.25, woe: 0.25 });
const ATTUNEMENT_PER_CLEAR = 1;
const MIS_SORT_MANIFEST_THRESHOLD = 6;

const BATCH_TIMEOUT_MS = 5 * 60 * 1000;
const COHERENCE_COST_WRONG_VERB = 5;
const BASE_BATCH_XP = 30;
const XP_PER_LEVEL = 2;
const BATCH_CREDITS = 8;
const RAPID_BONUS_THRESHOLD_MS = 60 * 1000;
const RAPID_BONUS_MULTIPLIER = 1.5;
const FLOOR_QUOTA_TARGET = 3;

// Terminal-room id -> { rowCount, weights, tempers, label }
// `weights` rolls row types; `tempers` rolls the temper axis. Terminals
// with no `tempers` field use DEFAULT_TEMPER_WEIGHTS (uniform). The 6.4b
// Refinement Console Cluster (rooms 355-360) bias toward specific
// tempers to give the four_tempers_attune quest a clean play-path.
const TERMINAL_PROFILES = Object.freeze({
  room_313: { rowCount: 4, weights: { signal: 0.40, noise: 0.40, pattern: 0.20 }, label: 'Floor 1, Console Cluster A' },
  room_315: { rowCount: 4, weights: { signal: 0.40, noise: 0.40, pattern: 0.20 }, label: 'Floor 1, Console Cluster B' },
  room_319: { rowCount: 5, weights: { signal: 0.35, noise: 0.35, pattern: 0.30 }, label: 'Floor 2, Console Cluster C' },
  room_327: { rowCount: 6, weights: { signal: 0.20, noise: 0.20, pattern: 0.60 }, label: 'Optics & Drafting, Layout Room' },
  // 6.4b Refinement Console Cluster - one terminal biased per Temper
  room_355: { rowCount: 4, weights: { signal: 0.34, noise: 0.33, pattern: 0.33 }, tempers: { dread: 0.55, frolic: 0.15, malice: 0.15, woe: 0.15 }, label: 'Console Cluster D - Dread Bench' },
  room_356: { rowCount: 4, weights: { signal: 0.34, noise: 0.33, pattern: 0.33 }, tempers: { dread: 0.15, frolic: 0.55, malice: 0.15, woe: 0.15 }, label: 'Console Cluster E - Frolic Bench' },
  room_357: { rowCount: 4, weights: { signal: 0.34, noise: 0.33, pattern: 0.33 }, tempers: { dread: 0.15, frolic: 0.15, malice: 0.55, woe: 0.15 }, label: 'Console Cluster F - Malice Bench' },
  room_358: { rowCount: 4, weights: { signal: 0.34, noise: 0.33, pattern: 0.33 }, tempers: { dread: 0.15, frolic: 0.15, malice: 0.15, woe: 0.55 }, label: 'Console Cluster G - Woe Bench' },
  room_359: { rowCount: 5, weights: { signal: 0.30, noise: 0.30, pattern: 0.40 }, label: 'Console Cluster H - Mixed Bench' },
  room_360: { rowCount: 6, weights: { signal: 0.25, noise: 0.25, pattern: 0.50 }, label: 'Tempers Bin - Final Console' }
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
  const temperWeights = profile.tempers || DEFAULT_TEMPER_WEIGHTS;
  const rows = [];
  for (let i = 0; i < profile.rowCount; i++) {
    // Row type roll
    const r1 = rng();
    let acc = 0, pickedType = ROW_TYPES[0];
    for (const t of ROW_TYPES) {
      acc += profile.weights[t] || 0;
      if (r1 < acc) { pickedType = t; break; }
    }
    // Temper roll (independent)
    const r2 = rng();
    let tacc = 0, pickedTemper = TEMPERS[0];
    for (const tk of TEMPERS) {
      tacc += temperWeights[tk] || 0;
      if (r2 < tacc) { pickedTemper = tk; break; }
    }
    rows.push({ type: pickedType, cleared: false, temper: pickedTemper });
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
      const temperHint = r.temper ? `/${r.temper}` : '';
      lines.push(`  [ ] ${i + 1}. ${r.type}${temperHint} -> use ${VERB_FOR_TYPE[r.type]}`);
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
    return {
      ok: true, cleared: true, complete: isComplete(batch),
      rowType: row.type, temper: row.temper || null,
      attunement: row.temper ? ATTUNEMENT_PER_CLEAR : 0
    };
  }
  return {
    ok: true,
    cleared: false,
    coherenceCost: COHERENCE_COST_WRONG_VERB,
    expected,
    rowType: row.type,
    temper: row.temper || null
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
  TEMPERS, DEFAULT_TEMPER_WEIGHTS,
  ATTUNEMENT_PER_CLEAR, MIS_SORT_MANIFEST_THRESHOLD,
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
