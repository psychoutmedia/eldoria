// Tier 4.7: Friend list.
//
// Per-player social graph mirror of the existing (session-only) ignore list,
// but persisted across sessions and decorated with online-status broadcasts.
//
// Pure data + validation. mud_server.js owns connection state and
// notification dispatch.

const MAX_FRIENDS = 50;
const NAME_MIN = 3;
const NAME_MAX = 12;

// Names are stored lowercase (matches ignoreList convention) for stable
// comparison. Display capitalization comes from the live player object or
// the saved file when offline.
function normalize(name) {
  return String(name || '').trim().toLowerCase();
}

function isValidName(name) {
  if (typeof name !== 'string') return false;
  const n = name.trim();
  if (n.length < NAME_MIN || n.length > NAME_MAX) return false;
  return /^[a-zA-Z]+$/.test(n);
}

// Sanitize a friends array loaded from a save file.
function loadFriends(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const norm = normalize(entry);
    if (!norm || !isValidName(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= MAX_FRIENDS) break;
  }
  return out;
}

// === Mutators (return { ok, error?, list? } so callers can show feedback) ===

function add(friendList, name, selfName) {
  if (!isValidName(name)) {
    return { ok: false, error: 'Name must be 3-12 letters, no spaces or digits.' };
  }
  const norm = normalize(name);
  if (selfName && norm === normalize(selfName)) {
    return { ok: false, error: 'You cannot friend yourself.' };
  }
  if (friendList.includes(norm)) {
    return { ok: false, error: `${name} is already on your friend list.` };
  }
  if (friendList.length >= MAX_FRIENDS) {
    return { ok: false, error: `Friend list is full (${MAX_FRIENDS}).` };
  }
  friendList.push(norm);
  return { ok: true, name: norm };
}

function remove(friendList, name) {
  const norm = normalize(name);
  const idx = friendList.indexOf(norm);
  if (idx === -1) return { ok: false, error: `${name} is not on your friend list.` };
  friendList.splice(idx, 1);
  return { ok: true, name: norm };
}

function has(friendList, name) {
  return friendList.includes(normalize(name));
}

// Find online friends, given a list of friends and a function that maps a
// lowercase name to a live player record (or null if offline). Returns an
// array of { name, online: bool, player? }.
function statusList(friendList, lookupOnline) {
  const out = [];
  for (const name of friendList) {
    const live = lookupOnline ? lookupOnline(name) : null;
    if (live) {
      out.push({ name, online: true, player: live });
    } else {
      out.push({ name, online: false });
    }
  }
  return out;
}

// Of all online players, return the names of those who have `name` on their
// friend list. Used to broadcast "your friend logged in" messages. Caller
// supplies an iterable of online players (or { player } pairs).
function whoseFriendsContain(name, onlinePlayers) {
  const norm = normalize(name);
  const watchers = [];
  for (const entry of onlinePlayers) {
    const p = entry.player || entry;
    if (!p || !Array.isArray(p.friends)) continue;
    if (p.friends.includes(norm)) watchers.push(entry);
  }
  return watchers;
}

module.exports = {
  // Constants
  MAX_FRIENDS, NAME_MIN, NAME_MAX,
  // Helpers
  normalize, isValidName, loadFriends,
  // Mutators
  add, remove, has,
  // Queries
  statusList, whoseFriendsContain
};
