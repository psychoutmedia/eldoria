// Tier 4.8 Speedwalker — unit verification.
const sw = require('./world/speedwalker');
const fs = require('fs');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// Set up shortcuts + canonicals to mirror mud_server.js
const SHORTCUTS = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  ne: 'northeast', nw: 'northwest', se: 'southeast', sw: 'southwest',
  u: 'up', d: 'down',
  enter: 'in', inside: 'in', exit: 'out', outside: 'out', leave: 'out'
};
const CANONICALS = new Set(['north','south','east','west','northeast','northwest','southeast','southwest','up','down','in','out']);

// === Empty / non-string input ===
{
  check('parse rejects empty string', !sw.parse('', SHORTCUTS, CANONICALS).ok);
  check('parse rejects whitespace-only', !sw.parse('   ', SHORTCUTS, CANONICALS).ok);
  check('parse rejects null', !sw.parse(null, SHORTCUTS, CANONICALS).ok);
  check('parse rejects non-string', !sw.parse(42, SHORTCUTS, CANONICALS).ok);
}

// === Concatenated single-letter input ===
{
  const r = sw.parse('nneessd', SHORTCUTS, CANONICALS);
  check('parse "nneessd" -> 7 steps',
    r.ok && r.steps.length === 7
    && r.steps[0] === 'north' && r.steps[1] === 'north'
    && r.steps[4] === 'south' && r.steps[6] === 'down');
  // Concat with mixed case
  const r2 = sw.parse('NEW', SHORTCUTS, CANONICALS);
  check('concatenated input is case-insensitive',
    r2.ok && r2.steps.length === 3 && r2.steps[0] === 'north' && r2.steps[1] === 'east' && r2.steps[2] === 'west');
}

// === Space-separated tokens ===
{
  const r = sw.parse('n e ne', SHORTCUTS, CANONICALS);
  check('space-separated: n e ne',
    r.ok && r.steps.length === 3 && r.steps[0] === 'north' && r.steps[1] === 'east' && r.steps[2] === 'northeast');
  // Multi-spaces
  const r2 = sw.parse('  north   south   ', SHORTCUTS, CANONICALS);
  check('multi-space tokens handled', r2.ok && r2.steps.length === 2);
}

// === Comma-separated tokens ===
{
  const r = sw.parse('n,s,e,w', SHORTCUTS, CANONICALS);
  check('comma-separated tokens', r.ok && r.steps.length === 4);
  // Mixed comma + space
  const r2 = sw.parse('n, ne ,s', SHORTCUTS, CANONICALS);
  check('mixed comma+space tokens', r2.ok && r2.steps.length === 3 && r2.steps[1] === 'northeast');
}

// === Full-name single token ===
{
  const r = sw.parse('northeast', SHORTCUTS, CANONICALS);
  check('single full-name token', r.ok && r.steps.length === 1 && r.steps[0] === 'northeast');
  // Single full-name (case-insensitive)
  const r2 = sw.parse('UP', SHORTCUTS, CANONICALS);
  check('single full-name case-insensitive', r2.ok && r2.steps[0] === 'up');
}

// === Mixed shorthands and full names in tokens ===
{
  const r = sw.parse('north ne e southwest u', SHORTCUTS, CANONICALS);
  check('mix of shorthand + full names',
    r.ok && r.steps.length === 5 &&
    r.steps[0] === 'north' && r.steps[1] === 'northeast' &&
    r.steps[3] === 'southwest' && r.steps[4] === 'up');
}

// === Concat with non-cardinal char rejected ===
{
  // 'a' isn't in [nsewud] → falls through to single-token path → unknown direction
  const r = sw.parse('na', SHORTCUTS, CANONICALS);
  check('concatenated path with non-cardinal -> error',
    !r.ok && /Unknown direction/i.test(r.error));
  // 'b' likewise
  const r2 = sw.parse('nbsw', SHORTCUTS, CANONICALS);
  check('concatenated path with letter outside [nsewud] -> error',
    !r2.ok);
}

// === Unknown token in space-separated input ===
{
  const r = sw.parse('n bogus s', SHORTCUTS, CANONICALS);
  check('unknown token surfaces error with index',
    !r.ok && r.errorAt === 1 && /bogus/i.test(r.error));
}

// === Step cap (MAX_STEPS) ===
{
  const tooMany = ('n '.repeat(sw.MAX_STEPS + 5)).trim();
  const r = sw.parse(tooMany, SHORTCUTS, CANONICALS);
  check('parse rejects path over MAX_STEPS',
    !r.ok && /max \d+/i.test(r.error));
  // Exactly at the cap is OK
  const atCap = ('n '.repeat(sw.MAX_STEPS)).trim();
  const r2 = sw.parse(atCap, SHORTCUTS, CANONICALS);
  check('parse accepts exactly MAX_STEPS', r2.ok && r2.steps.length === sw.MAX_STEPS);
}

// === Concatenated cap test (special: nnnnnn... uses 1 char per step) ===
{
  const longConcat = 'n'.repeat(sw.MAX_STEPS + 3);
  const r = sw.parse(longConcat, SHORTCUTS, CANONICALS);
  check('concatenated path over cap rejected',
    !r.ok);
}

// === in/out and enter/leave aliases ===
{
  const r = sw.parse('enter leave', SHORTCUTS, CANONICALS);
  check('enter/leave aliases', r.ok && r.steps[0] === 'in' && r.steps[1] === 'out');
}

// === Default canonicals param (Set or array) ===
{
  const r = sw.parse('north', SHORTCUTS, ['north','south']);
  check('parse accepts canonicals as array', r.ok && r.steps[0] === 'north');
  // Missing canonicals → only shortcuts work
  const r2 = sw.parse('n', SHORTCUTS, null);
  check('parse falls back gracefully on null canonicals', r2.ok && r2.steps[0] === 'north');
}

// === Server-side wiring ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('speedwalker module imported', /require\('\.\/world\/speedwalker'\)/.test(src));
  check('handleRun defined', /function handleRun\s*\(/.test(src));
  check('run routed in dispatcher',
    /command === 'run' \|\| command\.startsWith\('run '\)/.test(src) && /handleRun\(socket, player/.test(src));
  check('handleRun blocks on combat',
    /handleRun[\s\S]+?inCombat[\s\S]+?isInMonsterCombat[\s\S]+?isInPvpCombat[\s\S]+?can't speedwalk/.test(src));
  check('handleRun parses via speedwalker.parse',
    /speedwalker\.parse\(args, DIR_SHORTCUTS, canonicals\)/.test(src));
  check('handleRun uses setInterval for stepping',
    /setInterval\(\(\) => \{[\s\S]{0,2000}handleMove\(socket, player, dir\)/.test(src));
  check('handleRun aborts on missing exit',
    /Run aborted[\s\S]{0,200}no \$\{dir\} exit/.test(src));
  check('handleRun aborts on combat start',
    /Run aborted[\s\S]{0,200}combat started/.test(src));
  check('handleRun restores displayMode after run',
    /player\.displayMode = wasMode/.test(src));
  check('handleRun enforces displayMode = brief during run',
    /player\.displayMode = 'brief'/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
