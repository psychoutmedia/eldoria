// Tier 4.5 Server-side triggers — unit verification.
const triggers = require('./world/triggers');
const fs = require('fs');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === stripAnsi ===
{
  check('stripAnsi removes ANSI codes',
    triggers.stripAnsi('\x1b[31mhello\x1b[0m world') === 'hello world');
  check('stripAnsi handles plain text', triggers.stripAnsi('plain') === 'plain');
  check('stripAnsi handles empty', triggers.stripAnsi('') === '');
}

// === isRegexShorthand ===
{
  check('isRegexShorthand true for /foo/', triggers.isRegexShorthand('/foo/'));
  check('isRegexShorthand false for plain', !triggers.isRegexShorthand('foo'));
  check('isRegexShorthand false for missing close', !triggers.isRegexShorthand('/foo'));
  check('isRegexShorthand false for too short', !triggers.isRegexShorthand('/'));
}

// === compilePattern ===
{
  const r1 = triggers.compilePattern('You are hit');
  check('compile substring ok', r1.ok && r1.regex instanceof RegExp);
  check('compile substring is case-insensitive', r1.regex.test('YOU ARE HIT'));
  // Special chars in substring are escaped
  const r2 = triggers.compilePattern('foo (1)');
  check('compile escapes regex metachars in substring', r2.ok && r2.regex.test('foo (1) bar'));
  // Regex shorthand
  const r3 = triggers.compilePattern('/take (\\d+) damage/');
  check('compile regex with capture', r3.ok && r3.regex.test('take 25 damage') && 'take 25 damage'.match(r3.regex)[1] === '25');
  // Empty rejected
  check('compile rejects empty', !triggers.compilePattern('').ok);
  // Oversize rejected
  check('compile rejects oversize',
    !triggers.compilePattern('x'.repeat(triggers.MAX_PATTERN_LENGTH + 1)).ok);
  // Bad regex rejected with message
  const bad = triggers.compilePattern('/foo(/');
  check('compile reports bad regex', !bad.ok && /regex/i.test(bad.error));
  // Non-string rejected
  check('compile rejects non-string', !triggers.compilePattern(null).ok && !triggers.compilePattern(123).ok);
}

// === validateAction ===
{
  check('validateAction ok plain', triggers.validateAction('use potion').ok);
  check('validateAction trims', triggers.validateAction('   use potion   ').action === 'use potion');
  check('validateAction rejects empty', !triggers.validateAction('').ok);
  check('validateAction rejects whitespace-only', !triggers.validateAction('   ').ok);
  check('validateAction rejects oversize',
    !triggers.validateAction('x'.repeat(triggers.MAX_ACTION_LENGTH + 1)).ok);
  check('validateAction blocks recursive trigger ops',
    !triggers.validateAction('trigger add foo -> bar').ok);
  check('validateAction blocks "trigger" subcommand',
    !triggers.validateAction('trigger clear').ok);
  check('validateAction allows things starting with "trig" but not "trigger"',
    triggers.validateAction('trig something').ok);  // hypothetical future cmd, not blocked
}

// === parseAddSyntax ===
{
  const p1 = triggers.parseAddSyntax('low hp -> use potion');
  check('parse simple substring',
    p1 && p1.pattern === 'low hp' && p1.action === 'use potion');
  const p2 = triggers.parseAddSyntax('/took (\\d+) damage/ -> say I took %1');
  check('parse regex pattern',
    p2 && p2.pattern === '/took (\\d+) damage/' && p2.action === 'say I took %1');
  // Whitespace mandatory around the arrow (not greedy mid-pattern)
  const p3 = triggers.parseAddSyntax('foo->bar');
  check('parse rejects when no whitespace around arrow', p3 === null);
  // Empty either side rejected
  const p4 = triggers.parseAddSyntax(' -> bar');
  check('parse rejects empty pattern', p4 === null);
  // Non-string
  check('parse rejects non-string', triggers.parseAddSyntax(null) === null);
  // Multiple arrows — first valid wins
  const p5 = triggers.parseAddSyntax('a -> b -> c');
  check('parse uses first arrow', p5 && p5.pattern === 'a' && p5.action === 'b -> c');
}

// === applyCaptures ===
{
  const m = ['took 25 damage', '25', 'damage'];
  m.index = 0;  // shape it like a real regex match
  check('applyCaptures substitutes %1',
    triggers.applyCaptures('say I took %1', m) === 'say I took 25');
  check('applyCaptures multiple captures',
    triggers.applyCaptures('emote %2 was %1', m) === 'emote damage was 25');
  check('applyCaptures leaves unknown %N alone',
    triggers.applyCaptures('foo %9 bar', m) === 'foo %9 bar');
  check('applyCaptures handles no match',
    triggers.applyCaptures('foo', null) === 'foo');
  check('applyCaptures handles no captures',
    triggers.applyCaptures('foo %1', ['just text']) === 'foo %1');
}

// === buildTrigger ===
{
  const r = triggers.buildTrigger(1, 'low hp', 'use potion');
  check('buildTrigger ok shape',
    r.ok && r.trigger.id === 1 && r.trigger.enabled === true && r.trigger.regex === false && r.trigger.fired === 0);
  const r2 = triggers.buildTrigger(2, '/foo/', 'bar');
  check('buildTrigger marks regex true', r2.trigger.regex === true);
  const r3 = triggers.buildTrigger(3, '', 'bar');
  check('buildTrigger fails on bad pattern', !r3.ok);
  const r4 = triggers.buildTrigger(4, 'pat', '');
  check('buildTrigger fails on bad action', !r4.ok);
}

// === nextId ===
{
  check('nextId starts at 1 for empty', triggers.nextId([]) === 1);
  check('nextId fills gap',
    triggers.nextId([{ id: 1 }, { id: 3 }]) === 2);
  check('nextId continues after contiguous',
    triggers.nextId([{ id: 1 }, { id: 2 }, { id: 3 }]) === 4);
}

// === loadTriggers (sanitization) ===
{
  const loaded = triggers.loadTriggers([
    { id: 1, pattern: 'foo', action: 'bar', enabled: true, fired: 5 },
    { id: 2, pattern: '/baz/', action: 'qux' },
    { /* malformed */ pattern: 'ok', action: 'no id', enabled: false },
    null,
    { id: 'string-id', pattern: 'p', action: 'a' },
    { id: 99, pattern: 'too long' + 'x'.repeat(triggers.MAX_PATTERN_LENGTH), action: 'a' }  // dropped
  ]);
  check('loadTriggers preserves valid entries',
    loaded.length >= 3 && loaded.find(t => t.pattern === 'foo'));
  check('loadTriggers fills missing ids',
    loaded.every(t => Number.isInteger(t.id) && t.id > 0));
  check('loadTriggers infers regex flag from pattern shape',
    loaded.find(t => t.pattern === '/baz/').regex === true);
  check('loadTriggers drops oversized patterns',
    !loaded.find(t => t.pattern.startsWith('too long')));
  check('loadTriggers preserves disabled state',
    loaded.find(t => t.pattern === 'ok').enabled === false);
  // Non-array input
  check('loadTriggers returns [] on garbage', Array.isArray(triggers.loadTriggers(null)) && triggers.loadTriggers(null).length === 0);
  // Cap honored
  const big = Array.from({ length: triggers.MAX_TRIGGERS_PER_PLAYER + 5 }, (_, i) => ({
    id: i + 1, pattern: 'p' + i, action: 'a'
  }));
  check('loadTriggers caps at MAX_TRIGGERS_PER_PLAYER',
    triggers.loadTriggers(big).length === triggers.MAX_TRIGGERS_PER_PLAYER);
}

// === findFiring ===
{
  const trigs = [
    { id: 1, pattern: 'low hp', action: 'use potion', enabled: true, regex: false, fired: 0 },
    { id: 2, pattern: '/took (\\d+) damage/', action: 'say I took %1', enabled: true, regex: true, fired: 0 },
    { id: 3, pattern: 'should not fire', action: 'noop', enabled: false, regex: false, fired: 0 }
  ];
  const f1 = triggers.findFiring(trigs, 'Your hp is low hp now');
  check('findFiring substring match', f1 && f1.trigger.id === 1);
  const f2 = triggers.findFiring(trigs, 'You took 25 damage from the dragon.');
  check('findFiring regex match w/ capture',
    f2 && f2.trigger.id === 2 && f2.action === 'say I took 25');
  const f3 = triggers.findFiring(trigs, 'should not fire here');
  check('findFiring skips disabled triggers', !f3 || f3.trigger.id !== 3);
  // Strips ANSI before matching
  const f4 = triggers.findFiring(trigs, '\x1b[31mlow hp\x1b[0m');
  check('findFiring strips ANSI', f4 && f4.trigger.id === 1);
  // First trigger wins
  const f5 = triggers.findFiring(trigs, 'low hp and you took 5 damage');
  check('findFiring returns first matching trigger', f5 && f5.trigger.id === 1);
  // Empty/null
  check('findFiring null for empty triggers', triggers.findFiring([], 'anything') === null);
  check('findFiring null for empty text', triggers.findFiring(trigs, '') === null);
}

// === checkRate / recordFiring ===
{
  const state = {};
  const t0 = 1_000_000;
  const r1 = triggers.checkRate(state, t0);
  check('checkRate allows first fire', r1.allow);
  triggers.recordFiring(state, t0);
  // Second fire too soon — cooldown rejects
  const r2 = triggers.checkRate(state, t0 + 100);
  check('checkRate rejects within cooldown', !r2.allow && r2.reason === 'cooldown');
  // After cooldown, allow
  const r3 = triggers.checkRate(state, t0 + triggers.TRIGGER_COOLDOWN_MS + 1);
  check('checkRate allows after cooldown', r3.allow);
  // Rate-cap is defense-in-depth: with the 500ms cooldown gating individual
  // fires, you cannot legitimately reach RATE_LIMIT_FIRES within the
  // RATE_LIMIT_WINDOW_MS. So we exercise the cap by stuffing fires directly
  // into state — this models a future scenario where cooldown is bypassed
  // (e.g. multi-trigger fan-out, lower cooldown tunable).
  const burstState = { lastFired: 0, fires: [] };
  // Pre-load with fires all within the rolling window, no cooldown impact
  // (lastFired is 0 so the cooldown check passes).
  const burstNow = 5_000_000;
  for (let i = 0; i < triggers.RATE_LIMIT_FIRES; i++) {
    burstState.fires.push(burstNow - 100);  // all 100ms ago
  }
  const r4 = triggers.checkRate(burstState, burstNow);
  check('checkRate enforces RATE_LIMIT_FIRES cap when window has too many fires',
    !r4.allow && r4.reason === 'rate-exceeded' && r4.lockedUntil > burstNow);
  // After penalty, allow again
  const r5 = triggers.checkRate(burstState, burstNow + triggers.RATE_LIMIT_PENALTY_MS + 1);
  check('checkRate allows after penalty expires', r5.allow);
  // Old fires (outside window) don't count toward cap
  const oldState = { lastFired: 0, fires: [] };
  for (let i = 0; i < triggers.RATE_LIMIT_FIRES * 2; i++) {
    oldState.fires.push(burstNow - triggers.RATE_LIMIT_WINDOW_MS - 5000);  // way old
  }
  const r6 = triggers.checkRate(oldState, burstNow);
  check('checkRate ignores fires outside the rolling window', r6.allow);
}

// === Server-side wiring checks ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('triggers module imported', /require\('\.\/world\/triggers'\)/.test(src));
  check('handleTrigger defined', /function handleTrigger\s*\(/.test(src));
  check('trigger routed in command dispatcher',
    /command === 'trigger' \|\| command\.startsWith\('trigger '\)/.test(src) && /handleTrigger\(socket, player/.test(src));
  check('installTriggerTap defined', /function installTriggerTap\s*\(/.test(src));
  check('tap installed during login', /installTriggerTap\(socket, player\)/.test(src) && /completePlayerLogin/.test(src));
  check('tap idempotent flag set', /_triggerTapInstalled/.test(src));
  check('tap uses setImmediate to avoid stack reentry',
    /setImmediate\(\(\) => \{[\s\S]{0,400}processCommand\(socket, player, firing\.action\)/.test(src));
  check('recursion guard via _inTriggerAction',
    /player\._inTriggerAction = true[\s\S]{0,200}processCommand[\s\S]{0,200}_inTriggerAction = false/.test(src));
  check('rate-exceeded auto-disables triggers',
    /rate-exceeded[\s\S]{0,200}for \(const t of player\.triggers\) t\.enabled = false/.test(src));
  check('triggers persisted in savePlayer',
    /triggers: Array\.isArray\(player\.triggers\)/.test(src));
  check('triggers loaded from save via triggers.loadTriggers',
    /triggers: triggers\.loadTriggers\(data\.triggers\)/.test(src));
  check('createPlayer initializes empty triggers array', /triggers: \[\],/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
