// Tier 4.8: Speedwalker.
//
// `run <directions>` chains single moves through a path. Pure parser:
// turns a user-supplied direction string into an array of canonical
// direction names. mud_server.js handles the actual stepping (so we can
// reuse handleMove and stop-conditions like in-combat, missing exits,
// etc.).
//
// Accepted input forms:
//   "n s e w"          space-separated tokens
//   "n,s,e,w"          comma-separated tokens
//   "n s, ne se"       mix
//   "nnneessd"         concatenated single-letter cardinal/up/down chars
//                      (n s e w u d only — multi-char dirs need explicit
//                      tokens because "ne" would otherwise be ambiguous
//                      with n+e)
//   "north east"       full names allowed
//
// Each token must resolve via DIR_SHORTCUTS or DIRECTIONS (passed in by
// the caller — we don't hard-code the dir tables here).

const MAX_STEPS = 50;

// Single-letter cardinal/vertical chars that can be safely concatenated
// without separators. "ne" is intentionally NOT included — "ne" in a
// concatenated string is read as n,e (two steps northeast over).
const SAFE_CONCAT_CHARS = new Set(['n', 's', 'e', 'w', 'u', 'd']);

// Returns { ok, steps, errorAt?, errorToken? } where steps is an array of
// canonical direction names (lowercase).
//
// shortcuts: object mapping shorthand -> canonical (e.g. n -> north)
// canonicals: Set of valid canonical names (e.g. {'north','south',...})
function parse(input, shortcuts, canonicals) {
  if (typeof input !== 'string') return { ok: false, error: 'Direction string required.' };
  const trimmed = input.trim();
  if (!trimmed.length) return { ok: false, error: 'Direction string required.' };
  if (!shortcuts || typeof shortcuts !== 'object') shortcuts = {};
  if (!canonicals || typeof canonicals.has !== 'function') {
    // Accept array as well
    canonicals = new Set(Array.isArray(canonicals) ? canonicals : []);
  }

  // Tokenize
  let tokens;
  if (/[\s,]/.test(trimmed)) {
    // Split on whitespace and commas
    tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  } else {
    // Single contiguous run — try concatenated single-letter form first
    if (/^[nsewud]+$/i.test(trimmed)) {
      tokens = trimmed.toLowerCase().split('');
    } else {
      // Otherwise treat the whole thing as one token (likely a full dir name)
      tokens = [trimmed];
    }
  }

  const steps = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = String(tokens[i] || '').toLowerCase();
    if (!t) continue;
    let canonical = null;
    if (canonicals.has(t)) canonical = t;
    else if (shortcuts[t]) canonical = shortcuts[t];
    if (!canonical) {
      return { ok: false, errorAt: i, errorToken: tokens[i], error: `Unknown direction: "${tokens[i]}"` };
    }
    steps.push(canonical);
    if (steps.length > MAX_STEPS) {
      return { ok: false, error: `Path too long (max ${MAX_STEPS} steps).`, errorAt: i, errorToken: tokens[i] };
    }
  }
  if (!steps.length) return { ok: false, error: 'Empty path.' };
  return { ok: true, steps };
}

module.exports = {
  MAX_STEPS, SAFE_CONCAT_CHARS,
  parse
};
