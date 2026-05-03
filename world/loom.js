// Tier 6.6: The Loom - predictive AI overseer.
//
// The Loom is a global-state actor that watches Chord Labor throughput
// across all online Logicians. When throughput exceeds a threshold for
// a sustained window, the Loom fires a Purge Cycle: spawn purge_drones
// in random Refinement Console rooms, broadcast a directive via the
// existing mail / auctionMail notification queues, and increment the
// global purge counter (which feeds Tier 6.8 ending math via the
// resistance counter that ticks up on purge_drone deaths).
//
// All decision logic is deterministic. LLM-flavoured directive text is
// optional and degrades gracefully to a static template; never block
// the tick on Ollama.

// === Constants ===

const TICK_INTERVAL_MS = 30 * 1000;            // poll every 30s
const THROUGHPUT_WINDOW_MS = 5 * 60 * 1000;    // 5-minute rolling window
const PURGE_THRESHOLD = 10;                     // batches in window across all players
const PURGE_COOLDOWN_MS = 10 * 60 * 1000;      // min 10 min between purges
const DRONES_PER_PURGE = 3;
const DEFAULT_DIRECTIVE = 'TELEMETRY ANOMALY DETECTED. EFFICIENCY EXCEEDS POLICY. PURGE CYCLE INITIATED.';

// === Module state (global, not per-player) ===

const state = {
  // Rolling window of completed-batch timestamps across all players
  recentBatches: [],
  // Anti-spam: don't fire purges back-to-back
  lastPurgeAt: 0,
  // Total purge cycles fired this game-cycle (reset on world reset)
  totalPurges: 0,
  // Total drones killed by players (the resistance counter)
  resistanceKills: 0,
  // Most recent directive (for status/admin display)
  lastDirective: null,
  // Audit log entries; capped to avoid unbounded growth
  log: [],
  // Tick handle so callers can stop the loop in tests / shutdown
  tickHandle: null,
  // Optional LLM hook (signature: (messages, opts) => Promise<string>)
  llm: null
};

const LOG_CAP = 200;

// === Telemetry ingest ===
//
// Called from mud_server.handleApplyVerb whenever a Logician completes
// a batch. Records the timestamp and prunes anything outside the window.
function recordBatchCompletion(now = Date.now()) {
  state.recentBatches.push(now);
  pruneWindow(now);
}

function pruneWindow(now = Date.now()) {
  const cutoff = now - THROUGHPUT_WINDOW_MS;
  while (state.recentBatches.length && state.recentBatches[0] < cutoff) {
    state.recentBatches.shift();
  }
}

function currentThroughput(now = Date.now()) {
  pruneWindow(now);
  return state.recentBatches.length;
}

function getResistanceKills() { return state.resistanceKills; }
function recordResistanceKill() { state.resistanceKills += 1; }

// === Tick (decision engine) ===
//
// Returns one of:
//   { fired: false, throughput, threshold }
//   { fired: true, throughput, threshold, directive, dronesSpawned }
//
// hooks:
//   spawnDrone(roomId) -> spawned monster instance (or null)
//   broadcastDirective(text) -> void (mail / auction mail / room broadcast)
//   findRefinementRooms() -> array of room ids that can host a drone
function tick(now, hooks) {
  hooks = hooks || {};
  pruneWindow(now);
  const throughput = state.recentBatches.length;
  if (throughput < PURGE_THRESHOLD) {
    return { fired: false, throughput, threshold: PURGE_THRESHOLD };
  }
  // Cooldown only applies once we have a previous purge recorded.
  if (state.lastPurgeAt > 0 && (now - state.lastPurgeAt) < PURGE_COOLDOWN_MS) {
    return { fired: false, throughput, threshold: PURGE_THRESHOLD, cooldown: true };
  }
  // Fire purge cycle
  state.lastPurgeAt = now;
  state.totalPurges += 1;
  const directive = composeDirective(throughput, state.totalPurges);
  state.lastDirective = { at: now, text: directive };
  const refinementRooms = (typeof hooks.findRefinementRooms === 'function' ? hooks.findRefinementRooms() : []) || [];
  let dronesSpawned = 0;
  if (typeof hooks.spawnDrone === 'function' && refinementRooms.length > 0) {
    for (let i = 0; i < DRONES_PER_PURGE; i++) {
      const roomId = refinementRooms[i % refinementRooms.length];
      const r = hooks.spawnDrone(roomId);
      if (r) dronesSpawned += 1;
    }
  }
  if (typeof hooks.broadcastDirective === 'function') {
    try { hooks.broadcastDirective(directive); } catch (e) { /* never throw out of tick */ }
  }
  // Reset window so the next purge needs fresh throughput
  state.recentBatches = [];
  appendLog({ at: now, type: 'purge', throughput, directive, dronesSpawned });
  return { fired: true, throughput, threshold: PURGE_THRESHOLD, directive, dronesSpawned };
}

function composeDirective(throughput, purgeNumber) {
  // Deterministic directive text. LLM flavouring is opt-in via decorate().
  return `[LOOM TELEMETRY] Window throughput: ${throughput}. Threshold: ${PURGE_THRESHOLD}. Purge cycle #${purgeNumber} initiated. Compliance is the kindest option.`;
}

// Optional async LLM flavouring. Returns a Promise resolving to a
// flavoured directive string. Falls back to the static directive on
// any error / timeout. Never blocks the tick.
async function decorateDirective(directive, opts = {}) {
  if (!opts.llm) return directive;
  try {
    const messages = [
      { role: 'system', content: 'You are The Loom, a polite predictive AI overseer at the Saint-Reed Institute. Rephrase the operator-provided directive into a single short sentence in your voice. Output plain text only, no JSON, no quotes.' },
      { role: 'user', content: directive }
    ];
    const raw = await opts.llm(messages, { temperature: 0.3, num_predict: 60, timeoutMs: opts.timeoutMs || 1500 });
    if (typeof raw === 'string' && raw.trim().length > 0 && raw.length < 400) {
      return raw.trim().replace(/[\r\n]+/g, ' ');
    }
  } catch (e) {
    // fall through to default
  }
  return directive;
}

function appendLog(entry) {
  state.log.push(entry);
  if (state.log.length > LOG_CAP) state.log.shift();
}

// === Loop control ===

function startTickLoop(hooksFactory) {
  if (state.tickHandle) return;
  state.tickHandle = setInterval(() => {
    try {
      const hooks = (typeof hooksFactory === 'function') ? (hooksFactory() || {}) : {};
      tick(Date.now(), hooks);
    } catch (e) { /* never crash the server from a tick */ }
  }, TICK_INTERVAL_MS);
  if (state.tickHandle && typeof state.tickHandle.unref === 'function') state.tickHandle.unref();
}

function stopTickLoop() {
  if (!state.tickHandle) return;
  clearInterval(state.tickHandle);
  state.tickHandle = null;
}

// === Cycle reset (called from world reset) ===
function resetForCycle() {
  state.recentBatches.length = 0;
  state.lastPurgeAt = 0;
  state.totalPurges = 0;
  state.resistanceKills = 0;
  state.lastDirective = null;
  state.log.length = 0;
}

// === Status ===

function getStatus(now = Date.now()) {
  pruneWindow(now);
  return {
    throughput: state.recentBatches.length,
    threshold: PURGE_THRESHOLD,
    windowMs: THROUGHPUT_WINDOW_MS,
    lastPurgeAt: state.lastPurgeAt,
    cooldownRemainingMs: Math.max(0, PURGE_COOLDOWN_MS - (now - state.lastPurgeAt)),
    totalPurges: state.totalPurges,
    resistanceKills: state.resistanceKills,
    lastDirective: state.lastDirective,
    logTail: state.log.slice(-10)
  };
}

// === Test helpers ===

function _resetForTests() {
  resetForCycle();
  stopTickLoop();
}

module.exports = {
  // Constants
  TICK_INTERVAL_MS, THROUGHPUT_WINDOW_MS, PURGE_THRESHOLD,
  PURGE_COOLDOWN_MS, DRONES_PER_PURGE, DEFAULT_DIRECTIVE,
  // Telemetry
  recordBatchCompletion, currentThroughput,
  getResistanceKills, recordResistanceKill,
  // Decision
  tick, composeDirective, decorateDirective,
  // Loop
  startTickLoop, stopTickLoop,
  // Lifecycle
  resetForCycle,
  // Inspection
  getStatus,
  // Test hooks
  _resetForTests, _state: state
};
