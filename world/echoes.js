// Tier 6.3: Echoes - non-linguistic multiplayer signs.
//
// Players in Severance Layer Theta cannot speak across personas. They
// can leave structured "echoes" - arrangements, stackings - that other
// players (across sessions) discover when they enter the same room.
// Each sign carries an author, a roomId, a kind ('arrange' | 'stack'),
// a short text payload, and an expiry 24h after creation.
//
// Pure data + persistence. mud_server.js dispatches the verbs and reads
// out the active signs in showRoom.

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, 'echoes.json');
const STORE_TMP  = STORE_PATH + '.tmp';
const STORE_BAK  = STORE_PATH + '.bak';

const TTL_MS = 24 * 60 * 60 * 1000;     // 24 hours
const MAX_PER_ROOM = 5;                  // cap of visible signs per room
const MAX_PAYLOAD_LEN = 80;              // user-facing text length cap

const VALID_KINDS = new Set(['arrange', 'stack']);

function emptyState() {
  return { signs: [] };
}

function loadState(filePath = STORE_PATH) {
  if (!fs.existsSync(filePath)) return emptyState();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      signs: Array.isArray(raw.signs)
        ? raw.signs.filter(s => s && typeof s === 'object'
            && typeof s.roomId === 'string'
            && typeof s.leftBy === 'string'
            && VALID_KINDS.has(s.kind))
        : []
    };
  } catch (e) {
    return emptyState();
  }
}

function saveState(state, filePath = STORE_PATH) {
  try {
    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, filePath + '.bak'); } catch (e) {}
    }
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Drop expired entries. Pure mutator on the state object.
function pruneExpired(state, now = Date.now()) {
  if (!state || !Array.isArray(state.signs)) return 0;
  const before = state.signs.length;
  state.signs = state.signs.filter(s => s.expiresAt > now);
  return before - state.signs.length;
}

// === Validation ===
function validatePayload(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Sign text required.' };
  const trimmed = text.trim();
  if (trimmed.length === 0)              return { ok: false, error: 'Sign cannot be empty.' };
  if (trimmed.length > MAX_PAYLOAD_LEN)  return { ok: false, error: `Sign must be <= ${MAX_PAYLOAD_LEN} chars.` };
  // Reject anything that looks like dialogue (Logicians don't speak across personas)
  if (/["']|\bsay\b|\btell\b|\bshout\b/i.test(trimmed)) {
    return { ok: false, error: 'Echoes are non-linguistic. No spoken-word patterns allowed.' };
  }
  return { ok: true, value: trimmed };
}

// === Mutators ===
function addSign(state, roomId, leftBy, kind, text, now = Date.now()) {
  if (!state || !Array.isArray(state.signs)) return { ok: false, error: 'No state.' };
  if (typeof roomId !== 'string' || !roomId.length) return { ok: false, error: 'Invalid room.' };
  if (typeof leftBy !== 'string' || !leftBy.length) return { ok: false, error: 'Invalid author.' };
  if (!VALID_KINDS.has(kind)) return { ok: false, error: `Unknown echo kind: ${kind}` };
  const v = validatePayload(text);
  if (!v.ok) return v;
  pruneExpired(state, now);
  // Cap per-room: drop the oldest if at the limit
  const inRoom = state.signs.filter(s => s.roomId === roomId);
  if (inRoom.length >= MAX_PER_ROOM) {
    // Find the oldest by createdAt and remove it
    let oldestIdx = -1, oldestT = Infinity;
    for (let i = 0; i < state.signs.length; i++) {
      const s = state.signs[i];
      if (s.roomId === roomId && s.createdAt < oldestT) {
        oldestT = s.createdAt;
        oldestIdx = i;
      }
    }
    if (oldestIdx >= 0) state.signs.splice(oldestIdx, 1);
  }
  const sign = {
    roomId,
    leftBy,
    kind,
    text: v.value,
    createdAt: now,
    expiresAt: now + TTL_MS
  };
  state.signs.push(sign);
  return { ok: true, sign };
}

// Remove all signs left by a given author (e.g., if they delete their character).
function removeSignsBy(state, leftBy) {
  if (!state || !Array.isArray(state.signs)) return 0;
  const lower = (leftBy || '').toLowerCase();
  const before = state.signs.length;
  state.signs = state.signs.filter(s => s.leftBy.toLowerCase() !== lower);
  return before - state.signs.length;
}

// === Queries ===
function listForRoom(state, roomId, now = Date.now()) {
  if (!state || !Array.isArray(state.signs)) return [];
  pruneExpired(state, now);
  return state.signs.filter(s => s.roomId === roomId).sort((a, b) => b.createdAt - a.createdAt);
}

function totalActive(state, now = Date.now()) {
  if (!state || !Array.isArray(state.signs)) return 0;
  return state.signs.filter(s => s.expiresAt > now).length;
}

// === Render ===
function formatRemaining(ms) {
  if (ms <= 0) return 'expired';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function _resetForTests() { /* nothing module-level */ }

module.exports = {
  // Constants
  STORE_PATH, TTL_MS, MAX_PER_ROOM, MAX_PAYLOAD_LEN, VALID_KINDS,
  // State lifecycle
  emptyState, loadState, saveState, pruneExpired,
  // Validation
  validatePayload,
  // Mutators
  addSign, removeSignsBy,
  // Queries
  listForRoom, totalActive,
  // Render
  formatRemaining,
  // Test hook
  _resetForTests
};
