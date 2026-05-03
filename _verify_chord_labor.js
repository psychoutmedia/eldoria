// Tier 6.4 Chord Labor — unit verification.
const chord = require('./world/chord_labor');
const fs = require('fs');
const rooms = require('./rooms.json');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === Constants ===
{
  check('ROW_TYPES is signal/noise/pattern',
    JSON.stringify(chord.ROW_TYPES) === JSON.stringify(['signal','noise','pattern']));
  check('VERB_FOR_TYPE maps signal->sort', chord.VERB_FOR_TYPE.signal === 'sort');
  check('VERB_FOR_TYPE maps noise->bind',  chord.VERB_FOR_TYPE.noise  === 'bind');
  check('VERB_FOR_TYPE maps pattern->refine', chord.VERB_FOR_TYPE.pattern === 'refine');
  check('TYPE_FOR_VERB inverse mapping',
    chord.TYPE_FOR_VERB.sort === 'signal'
    && chord.TYPE_FOR_VERB.bind === 'noise'
    && chord.TYPE_FOR_VERB.refine === 'pattern');
  check('BATCH_TIMEOUT_MS is 5 minutes', chord.BATCH_TIMEOUT_MS === 5 * 60 * 1000);
  check('COHERENCE_COST_WRONG_VERB is 5', chord.COHERENCE_COST_WRONG_VERB === 5);
  check('BASE_BATCH_XP is 30', chord.BASE_BATCH_XP === 30);
  check('XP_PER_LEVEL is 2', chord.XP_PER_LEVEL === 2);
  check('BATCH_CREDITS is 8', chord.BATCH_CREDITS === 8);
  check('RAPID_BONUS_THRESHOLD_MS is 60000', chord.RAPID_BONUS_THRESHOLD_MS === 60_000);
  check('RAPID_BONUS_MULTIPLIER is 1.5', chord.RAPID_BONUS_MULTIPLIER === 1.5);
  check('FLOOR_QUOTA_TARGET is 3', chord.FLOOR_QUOTA_TARGET === 3);
  check('TERMINAL_PROFILES has 10 entries (4 original + 6 from 6.4b cluster 355-360)',
    Object.keys(chord.TERMINAL_PROFILES).length === 10);
  check('TERMINAL_PROFILES room_313 has rowCount 4',
    chord.TERMINAL_PROFILES.room_313.rowCount === 4);
  check('TERMINAL_PROFILES room_319 has rowCount 5',
    chord.TERMINAL_PROFILES.room_319.rowCount === 5);
  check('TERMINAL_PROFILES room_327 has rowCount 6 (pattern-heavy)',
    chord.TERMINAL_PROFILES.room_327.rowCount === 6
    && chord.TERMINAL_PROFILES.room_327.weights.pattern >= 0.5);
}

// === isChordTerminal ===
{
  check('isChordTerminal true via room flag',
    chord.isChordTerminal({ isChordTerminal: true }, 'room_x'));
  check('isChordTerminal true via room id (313)',
    chord.isChordTerminal({}, 'room_313'));
  check('isChordTerminal false elsewhere',
    !chord.isChordTerminal({}, 'room_001'));
  check('isChordTerminal handles null roomData', chord.isChordTerminal(null, 'room_315'));
}

// === generateBatch ===
{
  chord._resetForTests();
  // Force rng to always pick first type slot (signal)
  const allSignal = () => 0;
  const b = chord.generateBatch('room_313', allSignal, 1000);
  check('generateBatch returns object for terminal room', !!b);
  check('generateBatch row count matches profile', b.rows.length === 4);
  check('generateBatch all signal under rng=0', b.rows.every(r => r.type === 'signal'));
  check('generateBatch rows start uncleared', b.rows.every(r => r.cleared === false));
  check('generateBatch sets startedAt and lastTouchedAt to now', b.startedAt === 1000 && b.lastTouchedAt === 1000);
  check('generateBatch returns null for non-terminal', chord.generateBatch('room_001') === null);
  check('generateBatch assigns batchId', typeof b.batchId === 'number' && b.batchId >= 1);

  // rng=0.99 should fall through to last type (pattern)
  const b2 = chord.generateBatch('room_313', () => 0.999);
  check('generateBatch rng=0.999 prefers last bucket', b2.rows.every(r => r.type === 'pattern'));
}

// === describeBatch ===
{
  const b = chord.generateBatch('room_315', () => 0); // all signal, 4 rows
  const s = chord.describeBatch(b);
  check('describeBatch mentions row count', /4 rows/.test(s));
  check('describeBatch shows uncleared marker (with 6.4 retro temper hint)', /\[ \] 1\. signal\/(dread|frolic|malice|woe) -> use sort/.test(s));
  b.rows[0].cleared = true;
  const s2 = chord.describeBatch(b);
  check('describeBatch shows cleared marker after clear', /\[X\] 1\. \(cleared\)/.test(s2));
  check('describeBatch with null returns "(no active task)"', chord.describeBatch(null) === '(no active task)');
}

// === isComplete / nextRowIndex ===
{
  const b = chord.generateBatch('room_313', () => 0); // 4 signal rows
  check('isComplete false on fresh batch', !chord.isComplete(b));
  check('nextRowIndex 0 on fresh batch', chord.nextRowIndex(b) === 0);
  b.rows[0].cleared = true;
  check('nextRowIndex 1 after first cleared', chord.nextRowIndex(b) === 1);
  for (const r of b.rows) r.cleared = true;
  check('isComplete true once all cleared', chord.isComplete(b));
  check('isComplete false on null', !chord.isComplete(null));
  check('isComplete false on empty rows', !chord.isComplete({ rows: [] }));
}

// === applyVerb: correct verb clears row ===
{
  const b = chord.generateBatch('room_313', () => 0); // all signal
  const r = chord.applyVerb(b, 'sort', 0, 1000);
  check('applyVerb correct verb returns ok+cleared', r.ok && r.cleared && r.rowType === 'signal');
  check('applyVerb correct verb sets row.cleared', b.rows[0].cleared === true);
  check('applyVerb correct verb updates lastTouchedAt', b.lastTouchedAt === 1000);
  // Apply remaining
  const r2 = chord.applyVerb(b, 'sort', 1);
  check('applyVerb second clear ok', r2.ok && r2.cleared);
  chord.applyVerb(b, 'sort', 2);
  const last = chord.applyVerb(b, 'sort', 3);
  check('applyVerb final-row clear sets complete=true', last.ok && last.cleared && last.complete === true);
}

// === applyVerb: wrong verb returns coherence cost ===
{
  const b = chord.generateBatch('room_313', () => 0); // all signal -> need sort
  const r = chord.applyVerb(b, 'bind', 0);
  check('applyVerb wrong verb returns ok with cleared=false',
    r.ok && r.cleared === false && r.coherenceCost === 5 && r.expected === 'sort');
  check('applyVerb wrong verb does not clear the row', b.rows[0].cleared === false);
}

// === applyVerb guards ===
{
  const b = chord.generateBatch('room_313', () => 0);
  const r1 = chord.applyVerb(null, 'sort', 0);
  check('applyVerb null batch returns ok=false', !r1.ok);
  const r2 = chord.applyVerb(b, 'sort', -1);
  check('applyVerb negative index rejects', !r2.ok && /out of range/.test(r2.error));
  const r3 = chord.applyVerb(b, 'sort', 99);
  check('applyVerb out-of-range index rejects', !r3.ok && /out of range/.test(r3.error));
  const r4 = chord.applyVerb(b, 'fizzle', 0);
  check('applyVerb unknown verb rejects', !r4.ok && /Unknown verb/.test(r4.error));
  // Already-cleared row
  chord.applyVerb(b, 'sort', 0);
  const r5 = chord.applyVerb(b, 'sort', 0);
  check('applyVerb already-cleared row rejects', !r5.ok && /already cleared/.test(r5.error));
}

// === isExpired ===
{
  const b = chord.generateBatch('room_313', () => 0, 1000);
  check('isExpired false within window',
    chord.isExpired(b, 1000 + chord.BATCH_TIMEOUT_MS - 1) === false);
  check('isExpired true past window',
    chord.isExpired(b, 1000 + chord.BATCH_TIMEOUT_MS + 1) === true);
  check('isExpired false on null', !chord.isExpired(null));
}

// === computeReward ===
{
  const b = chord.generateBatch('room_313', () => 0, 0);
  const fast = chord.computeReward(b, 30, 30_000);  // within 60s threshold
  check('computeReward base XP = 30 + level*2',
    fast.xp === chord.BASE_BATCH_XP + 30 * chord.XP_PER_LEVEL);
  check('computeReward credits with rapid bonus',
    fast.isRapid === true && fast.credits === Math.round(chord.BATCH_CREDITS * 1.5));
  check('computeReward 1 practice point', fast.practicePoints === 1);

  const slow = chord.computeReward(b, 30, 90_000);  // beyond 60s
  check('computeReward isRapid false when over threshold', slow.isRapid === false);
  check('computeReward credits standard outside rapid window',
    slow.credits === chord.BATCH_CREDITS);

  // Edge: exactly threshold counts as rapid (<=)
  const edge = chord.computeReward(b, 30, chord.RAPID_BONUS_THRESHOLD_MS);
  check('computeReward at exact threshold counts as rapid', edge.isRapid === true);

  const lowLevel = chord.computeReward(b, 1, 0);
  check('computeReward level 1 baseline', lowLevel.xp === chord.BASE_BATCH_XP + 1 * chord.XP_PER_LEVEL);
  const noLevel = chord.computeReward(b, 0, 0);
  check('computeReward treats level 0/missing as 1', noLevel.xp === chord.BASE_BATCH_XP + 1 * chord.XP_PER_LEVEL);
}

// === rooms.json: chord terminal flags ===
{
  check('rooms.json room_313 isChordTerminal', rooms.room_313 && rooms.room_313.isChordTerminal === true);
  check('rooms.json room_315 isChordTerminal', rooms.room_315 && rooms.room_315.isChordTerminal === true);
  check('rooms.json room_319 isChordTerminal', rooms.room_319 && rooms.room_319.isChordTerminal === true);
  check('rooms.json room_327 isChordTerminal', rooms.room_327 && rooms.room_327.isChordTerminal === true);
  check('rooms.json non-terminal room (e.g., 311) does not have isChordTerminal',
    !rooms.room_311.isChordTerminal);
}

// === Server-side wiring greps ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('chord_labor module imported', /require\('\.\/world\/chord_labor'\)/.test(src));
  check('handleTask defined', /function handleTask\(socket, player, args\)/.test(src));
  check('handleQuota defined', /function handleQuota\(socket, player\)/.test(src));
  check('handleApplyVerb defined', /function handleApplyVerb\(verb, socket, player, args\)/.test(src));
  check('task verb routed', /command === 'task'[\s\S]{0,300}handleTask\(/.test(src));
  check('quota verb routed', /command === 'quota'[\s\S]{0,200}handleQuota\(/.test(src));
  check('sort verb routed via handleApplyVerb', /command === 'sort'[\s\S]{0,300}handleApplyVerb\('sort'/.test(src));
  check('bind verb routed via handleApplyVerb', /command === 'bind'[\s\S]{0,300}handleApplyVerb\('bind'/.test(src));
  check('refine verb routed via handleApplyVerb', /command === 'refine'[\s\S]{0,300}handleApplyVerb\('refine'/.test(src));
  check('cycleBatchesCompleted seeded in createPlayer',
    /cycleBatchesCompleted: 0,\s*\/\/ Chapel/.test(src));
  check('cycleBatchesCompleted seeded in loadPlayer',
    /cycleBatchesCompleted: 0,\s*\/\/ Chapel/.test(src));
  check('cycleBatchesCompleted reset in executeWorldReset',
    /player\.cycleBatchesCompleted = 0;/.test(src));
  check('cycleLeaderboard.batchesCompleted struct present',
    /batchesCompleted: \{ name: null, value: 0 \}/.test(src));
  check('updateCycleLeaderboard handles batches category',
    /category === 'batches'[\s\S]{0,200}cycleLeaderboard\.batchesCompleted = \{ name: playerName/.test(src));
  check('displayCycleLeaderboard shows Refinement Champion',
    /Refinement Champion: \$\{cycleLeaderboard\.batchesCompleted\.name\}/.test(src));
  check('cycleLeaderboard.batchesCompleted reset on world reset',
    /cycleLeaderboard\.batchesCompleted = \{ name: null, value: 0 \};/.test(src));
  check('handleSwap drops activeTask when leaving Logic',
    /We're leaving Logic-State[\s\S]{0,1200}activeTask = null/.test(src));
  check('handleSwap resets shiftBatchesCompleted on entering Logic',
    /r\.to === 'logic'[\s\S]{0,400}shiftBatchesCompleted = 0/.test(src));
  check('Coherence eject path drops activeTask',
    /Coherence \? = full[\s\S]{0,400}activeTask = null/.test(src)
    || /coherence = player\.personas\.logic\.maxCoherence[\s\S]{0,400}activeTask = null/.test(src));
  check('handleApplyVerb awards XP through standard path',
    /handleApplyVerb[\s\S]{0,4000}player\.experience = \(player\.experience \|\| 0\) \+ reward\.xp/.test(src));
  check('handleApplyVerb credits Citizen with reward.credits',
    /handleApplyVerb[\s\S]{0,4000}player\.personas\.life\.credits[\s\S]{0,80}\+ reward\.credits/.test(src));
  check('handleApplyVerb increments cycleBatchesCompleted + leaderboard',
    /handleApplyVerb[\s\S]{0,4000}cycleBatchesCompleted[\s\S]{0,200}updateCycleLeaderboard\(player\.name, 'batches'/.test(src));
  check('handleApplyVerb forced eject on coherence collapse',
    /handleApplyVerb[\s\S]{0,8000}YOUR COHERENCE COLLAPSES[\s\S]{0,400}ejectToLifeState/.test(src));
  check('handleTask pull rejects under quota_lock',
    /handleTask[\s\S]{0,2500}quota_lock[\s\S]{0,200}quota period is in effect/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
