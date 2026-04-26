// Tier 4.5: Server-side triggers.
//
// Player-defined "when output line matches X, run command Y" rules. Lives
// server-side so even plain-telnet players get them. The dangerous part of
// triggers is runaway loops; this module owns the safety logic.
//
// Pure data + matching layer — no IO. mud_server.js wraps socket.write to
// feed outgoing text into matchAgainst() and dispatches the resulting
// actions through processCommand.

const MAX_TRIGGERS_PER_PLAYER = 20;
const MAX_PATTERN_LENGTH      = 200;
const MAX_ACTION_LENGTH       = 200;
const TRIGGER_COOLDOWN_MS     = 500;     // min gap between any two trigger fires per player
const RATE_LIMIT_FIRES        = 5;       // max fires per RATE_LIMIT_WINDOW_MS
const RATE_LIMIT_WINDOW_MS    = 1000;
const RATE_LIMIT_PENALTY_MS   = 30000;   // auto-disable all of a player's triggers if they exceed cap

// Strip ANSI escape codes — output text contains color sequences which would
// otherwise leak into the user's pattern (and they're never going to type
// `\x1b[31m` in their pattern).
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s) {
  return String(s).replace(ANSI_RE, '');
}

// Regex shorthand: a pattern wrapped in /…/ is treated as a regex.
//   /You hit (\w+)/   ->  regex with capture group, %1 in action becomes group 1
//   You took damage   ->  case-insensitive substring match
function isRegexShorthand(pattern) {
  return typeof pattern === 'string' && pattern.length >= 2 && pattern.startsWith('/') && pattern.endsWith('/');
}

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Compile a pattern string into a RegExp. Returns { ok, regex, error? }.
function compilePattern(pattern) {
  if (typeof pattern !== 'string')          return { ok: false, error: 'Pattern must be a string.' };
  if (!pattern.length)                      return { ok: false, error: 'Pattern cannot be empty.' };
  if (pattern.length > MAX_PATTERN_LENGTH)  return { ok: false, error: `Pattern must be <= ${MAX_PATTERN_LENGTH} chars.` };
  if (isRegexShorthand(pattern)) {
    try {
      const body = pattern.slice(1, -1);
      // Always case-insensitive; this is text-output matching, not source-code regex
      return { ok: true, regex: new RegExp(body, 'i') };
    } catch (e) {
      return { ok: false, error: `Invalid regex: ${e.message}` };
    }
  }
  return { ok: true, regex: new RegExp(escapeForRegex(pattern), 'i') };
}

function validateAction(action) {
  if (typeof action !== 'string')                     return { ok: false, error: 'Action must be a string.' };
  const a = action.trim();
  if (!a.length)                                      return { ok: false, error: 'Action cannot be empty.' };
  if (a.length > MAX_ACTION_LENGTH)                   return { ok: false, error: `Action must be <= ${MAX_ACTION_LENGTH} chars.` };
  // Disallow nested triggers via action — `trigger add` from inside an action could explode
  if (/^trigger(\s|$)/i.test(a))                      return { ok: false, error: 'Trigger actions cannot themselves manage triggers.' };
  return { ok: true, action: a };
}

// Split "<pattern> -> <action>" — the user-facing add syntax. The arrow
// must be standalone (surrounding whitespace), and the pattern wins on
// the first matching arrow so `/foo -> bar/ -> shout hi` parses sensibly.
function parseAddSyntax(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  // Find the first arrow that is OUTSIDE a /.../ regex section
  let inRegex = false;
  for (let i = 0; i < s.length - 2; i++) {
    if (s[i] === '/') {
      // toggle if we see a forward slash that isn't escaped
      if (i === 0 || s[i - 1] !== '\\') inRegex = !inRegex;
    }
    if (!inRegex && s[i] === '-' && s[i + 1] === '>' && (i === 0 || /\s/.test(s[i - 1])) && /\s/.test(s[i + 2] || '')) {
      const pattern = s.slice(0, i).trim();
      const action  = s.slice(i + 2).trim();
      if (!pattern || !action) return null;
      return { pattern, action };
    }
  }
  return null;
}

// Apply %1..%9 capture-group substitution from a regex match.
function applyCaptures(action, match) {
  if (!match || !match.length) return action;
  return action.replace(/%(\d)/g, (whole, n) => {
    const idx = parseInt(n, 10);
    return (idx > 0 && idx < match.length && match[idx] != null) ? match[idx] : whole;
  });
}

// Build a normalized trigger record from raw input. ID assignment is the
// caller's job (it needs to know the player's existing IDs).
function buildTrigger(id, pattern, action) {
  const compiled = compilePattern(pattern);
  if (!compiled.ok) return { ok: false, error: compiled.error };
  const a = validateAction(action);
  if (!a.ok) return { ok: false, error: a.error };
  return {
    ok: true,
    trigger: {
      id,
      pattern,
      action: a.action,
      enabled: true,
      regex: isRegexShorthand(pattern),
      fired: 0
    }
  };
}

// Match outgoing text against a list of triggers. Returns the first matching
// firing — we deliberately fire one trigger per output flush to keep the
// rate manageable. ANSI is stripped before matching.
function findFiring(triggers, text) {
  if (!Array.isArray(triggers) || !triggers.length) return null;
  const clean = stripAnsi(text);
  if (!clean) return null;
  for (const t of triggers) {
    if (!t.enabled) continue;
    const compiled = compilePattern(t.pattern);
    if (!compiled.ok) continue;
    const m = clean.match(compiled.regex);
    if (m) {
      return { trigger: t, match: m, action: applyCaptures(t.action, m) };
    }
  }
  return null;
}

// Update a player's transient rate state and decide whether the next firing
// should be allowed. Returns { allow, reason? }. The caller passes a state
// object held on the player; we mutate it in place.
function checkRate(state, now) {
  if (!state.fires) state.fires = [];
  if (state.lockedUntil && now < state.lockedUntil) {
    return { allow: false, reason: 'rate-locked' };
  }
  if (state.lastFired && (now - state.lastFired) < TRIGGER_COOLDOWN_MS) {
    return { allow: false, reason: 'cooldown' };
  }
  // Drop fires older than the rolling window
  state.fires = state.fires.filter(t => (now - t) <= RATE_LIMIT_WINDOW_MS);
  if (state.fires.length >= RATE_LIMIT_FIRES) {
    state.lockedUntil = now + RATE_LIMIT_PENALTY_MS;
    state.fires = [];
    return { allow: false, reason: 'rate-exceeded', lockedUntil: state.lockedUntil };
  }
  return { allow: true };
}

function recordFiring(state, now) {
  if (!state.fires) state.fires = [];
  state.fires.push(now);
  state.lastFired = now;
}

// Resolve the next available trigger id for a player (smallest unused 1..N).
function nextId(triggers) {
  const used = new Set((triggers || []).map(t => t.id));
  for (let i = 1; i <= MAX_TRIGGERS_PER_PLAYER + 1; i++) {
    if (!used.has(i)) return i;
  }
  return triggers.length + 1;
}

// Sanitize triggers loaded from disk — drop malformed/legacy entries, cap
// at MAX_TRIGGERS_PER_PLAYER, ensure required fields exist.
function loadTriggers(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    if (typeof t.pattern !== 'string' || typeof t.action !== 'string') continue;
    if (t.pattern.length > MAX_PATTERN_LENGTH || t.action.length > MAX_ACTION_LENGTH) continue;
    let id = (Number.isInteger(t.id) && t.id > 0) ? t.id : null;
    if (id == null || seenIds.has(id)) id = nextId(out);
    seenIds.add(id);
    out.push({
      id,
      pattern: t.pattern,
      action: t.action,
      enabled: t.enabled !== false,
      regex: isRegexShorthand(t.pattern),
      fired: Number.isInteger(t.fired) ? t.fired : 0
    });
    if (out.length >= MAX_TRIGGERS_PER_PLAYER) break;
  }
  return out;
}

module.exports = {
  // Constants
  MAX_TRIGGERS_PER_PLAYER, MAX_PATTERN_LENGTH, MAX_ACTION_LENGTH,
  TRIGGER_COOLDOWN_MS, RATE_LIMIT_FIRES, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_PENALTY_MS,
  // Helpers exposed for tests
  stripAnsi, isRegexShorthand, escapeForRegex,
  compilePattern, validateAction, parseAddSyntax, applyCaptures,
  buildTrigger, nextId, loadTriggers,
  // Match + rate
  findFiring, checkRate, recordFiring
};
