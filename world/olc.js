// Tier 4.3: Online Creation (OLC), admin-only.
//
// Sprint-1 scope: room editing only (name, short/long desc, zone, exits).
// Sessions are per-player; only one active session at a time. The session
// holds a draft copy of the room — we don't mutate the live `rooms` object
// until the admin runs `redit save` or `redit done`. Cancelling discards
// the draft.
//
// Persistence: on save we copy rooms.json to rooms.json.bak then write the
// updated map. The write is atomic-on-Windows via writeFileSync to a temp
// path followed by rename.

const fs = require('fs');
const path = require('path');

const VALID_DIRS = new Set([
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
  'up', 'down'
]);

const DIR_ALIASES = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down'
};

const ROOMS_PATH = path.join(__dirname, '..', 'rooms.json');
const ROOMS_BAK  = ROOMS_PATH + '.bak';
const ROOMS_TMP  = ROOMS_PATH + '.tmp';

const MAX_NAME = 80;
const MAX_ZONE = 50;
const MAX_SHORT = 200;
const MAX_LONG  = 4000;

// Per-player session map. Key: player.name (lowercase). Value: { roomId, draft }
const sessions = new Map();

function key(player) {
  return (player && player.name || '').toLowerCase();
}

function normalizeDir(d) {
  if (!d) return null;
  const lower = String(d).toLowerCase().trim();
  if (DIR_ALIASES[lower]) return DIR_ALIASES[lower];
  if (VALID_DIRS.has(lower)) return lower;
  return null;
}

// Begin a session on the player's current room. Returns a result object.
function start(player, rooms) {
  if (!player || !player.currentRoom) {
    return { ok: false, error: 'You are not in a room.' };
  }
  const room = rooms[player.currentRoom];
  if (!room) {
    return { ok: false, error: `Room ${player.currentRoom} not found in world.` };
  }
  const draft = {
    name:         room.name || '',
    zone:         room.zone || '',
    shortDescription: room.shortDescription || '',
    longDescription:  room.longDescription || '',
    exits:        Object.assign({}, room.exits || {})
  };
  sessions.set(key(player), { roomId: player.currentRoom, draft, dirty: false });
  return { ok: true, roomId: player.currentRoom, draft };
}

function get(player) {
  return sessions.get(key(player)) || null;
}

function cancel(player) {
  const k = key(player);
  if (!sessions.has(k)) return { ok: false, error: 'No active redit session.' };
  sessions.delete(k);
  return { ok: true };
}

// Apply a field edit to the draft. field: 'name' | 'short' | 'desc' | 'zone'
function setField(player, field, value) {
  const sess = get(player);
  if (!sess) return { ok: false, error: 'No active redit session. Run `redit` first.' };
  if (typeof value !== 'string') return { ok: false, error: 'Value must be a string.' };
  const trimmed = value.replace(/\s+$/, '');
  switch (field) {
    case 'name':
      if (trimmed.length === 0)             return { ok: false, error: 'Name cannot be empty.' };
      if (trimmed.length > MAX_NAME)        return { ok: false, error: `Name must be <= ${MAX_NAME} chars.` };
      sess.draft.name = trimmed;
      break;
    case 'zone':
      if (trimmed.length === 0)             return { ok: false, error: 'Zone cannot be empty.' };
      if (trimmed.length > MAX_ZONE)        return { ok: false, error: `Zone must be <= ${MAX_ZONE} chars.` };
      sess.draft.zone = trimmed;
      break;
    case 'short':
      if (trimmed.length > MAX_SHORT)       return { ok: false, error: `Short description must be <= ${MAX_SHORT} chars.` };
      sess.draft.shortDescription = trimmed;
      break;
    case 'desc':
    case 'long':
      if (trimmed.length === 0)             return { ok: false, error: 'Description cannot be empty.' };
      if (trimmed.length > MAX_LONG)        return { ok: false, error: `Description must be <= ${MAX_LONG} chars.` };
      sess.draft.longDescription = trimmed;
      break;
    default:
      return { ok: false, error: `Unknown field: ${field}` };
  }
  sess.dirty = true;
  return { ok: true, field, value: trimmed };
}

// Add/replace/remove an exit. target='none' or null removes; otherwise must be a known room id.
function setExit(player, dir, target, rooms) {
  const sess = get(player);
  if (!sess) return { ok: false, error: 'No active redit session. Run `redit` first.' };
  const ndir = normalizeDir(dir);
  if (!ndir) return { ok: false, error: `Invalid direction: ${dir}. Try n/s/e/w/ne/nw/se/sw/u/d.` };
  if (!target || target === 'none' || target === 'remove') {
    if (!sess.draft.exits[ndir]) return { ok: false, error: `No ${ndir} exit to remove.` };
    delete sess.draft.exits[ndir];
    sess.dirty = true;
    return { ok: true, dir: ndir, removed: true };
  }
  if (!rooms[target]) {
    return { ok: false, error: `Target room "${target}" does not exist.` };
  }
  if (target === sess.roomId) {
    return { ok: false, error: 'A room cannot exit to itself.' };
  }
  sess.draft.exits[ndir] = target;
  sess.dirty = true;
  return { ok: true, dir: ndir, target };
}

// Commit the draft into the live `rooms` map and persist to rooms.json.
// Returns { ok, persistError? } — even if the in-memory commit succeeds,
// disk persistence may fail (logged as persistError so the admin sees it).
function save(player, rooms) {
  const sess = get(player);
  if (!sess) return { ok: false, error: 'No active redit session.' };
  const live = rooms[sess.roomId];
  if (!live) return { ok: false, error: 'Live room vanished while editing.' };

  // Apply draft to live room
  live.name = sess.draft.name;
  live.zone = sess.draft.zone;
  live.shortDescription = sess.draft.shortDescription;
  live.longDescription = sess.draft.longDescription;
  live.exits = Object.assign({}, sess.draft.exits);

  sess.dirty = false;

  // Persist to disk: backup current file, write temp, rename
  let persistError = null;
  try {
    if (fs.existsSync(ROOMS_PATH)) {
      try { fs.copyFileSync(ROOMS_PATH, ROOMS_BAK); }
      catch (e) { /* backup failure is non-fatal; still try the write */ }
    }
    const json = JSON.stringify(rooms, null, 2);
    fs.writeFileSync(ROOMS_TMP, json, 'utf8');
    fs.renameSync(ROOMS_TMP, ROOMS_PATH);
  } catch (e) {
    persistError = e.message || String(e);
  }
  return { ok: true, roomId: sess.roomId, persistError };
}

// "redit done" = save + end session. "redit cancel" just ends.
function end(player) {
  return cancel(player);
}

// Format the draft for display. Caller wraps with colorize as desired.
function formatDraft(player) {
  const sess = get(player);
  if (!sess) return null;
  const d = sess.draft;
  const exits = Object.keys(d.exits).length
    ? Object.entries(d.exits).map(([k, v]) => `${k} -> ${v}`).join(', ')
    : '(none)';
  return [
    `=== Editing ${sess.roomId}${sess.dirty ? ' [unsaved]' : ''} ===`,
    `Name : ${d.name}`,
    `Zone : ${d.zone}`,
    `Short: ${d.shortDescription || '(empty)'}`,
    `Long : ${d.longDescription.slice(0, 200)}${d.longDescription.length > 200 ? '...' : ''}`,
    `Exits: ${exits}`
  ].join('\r\n') + '\r\n';
}

function isEditing(player) {
  return sessions.has(key(player));
}

function activeRoom(player) {
  const s = get(player);
  return s ? s.roomId : null;
}

// Test hook: clear all sessions (used by the verify harness).
function _resetForTests() {
  sessions.clear();
}

module.exports = {
  // Lifecycle
  start, cancel, end, save,
  // Mutators
  setField, setExit,
  // Queries
  get, isEditing, activeRoom, formatDraft,
  // Helpers exposed for tests
  normalizeDir,
  VALID_DIRS,
  // Constants
  MAX_NAME, MAX_ZONE, MAX_SHORT, MAX_LONG,
  // Test hook
  _resetForTests
};
