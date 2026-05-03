// _verify_subliminal_patterns.js - Tier 6.5b: Subliminal Patterns +
// Black Hallway. Validates the new module, dispatcher wiring, room
// gating, items/monsters/quests, and warden boss signature.

const fs = require('fs');
const path = require('path');

const checks = [];
function check(name, cond) {
  checks.push({ name, pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}`);
}

const sub = require('./world/subliminal_patterns');
const sync = require('./world/sync_state');
const src = fs.readFileSync(path.join(__dirname, 'mud_server.js'), 'utf8');
const rooms = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, 'monsters.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'items.json'), 'utf8'));
const quests = JSON.parse(fs.readFileSync(path.join(__dirname, 'quests.json'), 'utf8'));

// === Module exports ===
{
  check('PATTERN_IDS has six entries',
    Array.isArray(sub.PATTERN_IDS) && sub.PATTERN_IDS.length === 6);
  for (const p of ['pattern_door','pattern_chair','pattern_window','pattern_bowl','pattern_hand','pattern_threshold']) {
    check(`PATTERN_IDS includes ${p}`, sub.PATTERN_IDS.includes(p));
  }
  check('isValidPattern accepts known pattern', sub.isValidPattern('pattern_door'));
  check('isValidPattern rejects unknown pattern', !sub.isValidPattern('pattern_typo'));
}

// === Painting (Life-State) ===
{
  const p = {};
  sync.migrateLegacySave(p);
  // Force active persona to life
  p.activePersona = 'life';
  const r = sub.paintPattern(p, 'pattern_door');
  check('paintPattern returns ok', r.ok);
  check('paintPattern is not alreadyPainted on first paint', r.alreadyPainted === false);
  check('paintPattern stores in personas.life.paintedPatterns',
    p.personas && p.personas.life && p.personas.life.paintedPatterns && p.personas.life.paintedPatterns.pattern_door);

  const r2 = sub.paintPattern(p, 'pattern_door');
  check('paintPattern repaint marks alreadyPainted', r2.alreadyPainted === true);

  const r3 = sub.paintPattern(p, 'pattern_typo');
  check('paintPattern rejects unknown pattern', !r3.ok);

  const list = sub.listPaintedPatterns(p);
  check('listPaintedPatterns returns array including pattern_door', list.includes('pattern_door'));
}

// === Cross-persona sync ===
{
  const p = {};
  sync.migrateLegacySave(p);
  p.activePersona = 'life';
  sub.paintPattern(p, 'pattern_door');
  sub.paintPattern(p, 'pattern_chair');
  sub.applySwapHooks(p);
  check('syncMuscleUnlocks writes painted patterns to logic.muscleUnlocks',
    p.personas.logic.muscleUnlocks.includes('pattern_door')
    && p.personas.logic.muscleUnlocks.includes('pattern_chair'));
  check('hasUnlock true for painted pattern', sub.hasUnlock(p, 'pattern_door'));
  check('hasUnlock false for unpainted pattern', !sub.hasUnlock(p, 'pattern_window'));
  check('hasAllUnlocks true for subset of painted',
    sub.hasAllUnlocks(p, ['pattern_door', 'pattern_chair']));
  check('hasAllUnlocks false when one unpainted',
    !sub.hasAllUnlocks(p, ['pattern_door', 'pattern_chair', 'pattern_window']));
  check('subliminalBuffs.fromLife populated by sync',
    p.subliminalBuffs && p.subliminalBuffs.fromLife
    && p.subliminalBuffs.fromLife.coherence_regen_pct === 0.05);
}

// === Idempotency: re-sync doesn't duplicate ===
{
  const p = {};
  sync.migrateLegacySave(p);
  p.activePersona = 'life';
  sub.paintPattern(p, 'pattern_hand');
  sub.applySwapHooks(p);
  sub.applySwapHooks(p);
  check('re-sync keeps muscleUnlocks length stable',
    p.personas.logic.muscleUnlocks.filter(u => u === 'pattern_hand').length === 1);
}

// === mud_server.js: wiring ===
{
  check('subliminal_patterns module required', /require\('\.\/world\/subliminal_patterns'\)/.test(src));
  check('handleSwap calls subliminalPatterns.applySwapHooks',
    /handleSwap[\s\S]{0,5000}subliminalPatterns\.applySwapHooks\(player\)/.test(src));
  check('paint command routed to handlePaint',
    /command === 'paint'[\s\S]{0,200}handlePaint/.test(src));
  check('subliminal command routed to handleSubliminal',
    /command === 'subliminal'[\s\S]{0,80}handleSubliminal/.test(src));
  check('handlePaint function defined', /function handlePaint\(socket, player, args\)/.test(src));
  check('handleSubliminal function defined', /function handleSubliminal\(socket, player\)/.test(src));
  check('handlePaint requires Life-State', /handlePaint[\s\S]{0,2000}getActivePersona\(player\) !== 'life'/.test(src));
  check('handlePaint requires paintbrush_set + matching swatch',
    /handlePaint[\s\S]{0,3000}paintbrush_set[\s\S]{0,500}pattern_swatch_/.test(src));
  check('isRealmGateOpen honours requiresMuscleUnlock',
    /isRealmGateOpen[\s\S]{0,1500}requiresMuscleUnlock[\s\S]{0,200}hasUnlock/.test(src));
  check('isRealmGateOpen honours requiresMuscleUnlocks (array)',
    /isRealmGateOpen[\s\S]{0,1500}requiresMuscleUnlocks[\s\S]{0,200}hasAllUnlocks/.test(src));
  check('handleMove gives a flavoured message for muscle-unlock fail',
    /requiresMuscleUnlock[\s\S]{0,500}painted the right pattern/.test(src));
  check('initializeRoomItems seeds paintbrush_set in room_373',
    /initializeRoomItems[\s\S]{0,2000}paintbrush_set[\s\S]{0,200}room_373/.test(src));
  check('initializeRoomItems seeds pattern swatches in room_374',
    /initializeRoomItems[\s\S]{0,3000}pattern_swatch_door[\s\S]{0,500}room_374/.test(src));
}

// === Rooms 361-375 + room_348 east exit ===
{
  for (let i = 361; i <= 375; i++) {
    check(`rooms.json has room_${i}`, !!rooms[`room_${i}`]);
  }
  // Black Hallway flag on Logic-State rooms 361-372
  for (let i = 361; i <= 372; i++) {
    check(`room_${i} flagged isBlackHallway`, rooms[`room_${i}`] && rooms[`room_${i}`].isBlackHallway === true);
  }
  // Painting rooms 373-375 are Life-State
  for (let i = 373; i <= 375; i++) {
    check(`room_${i} flagged isLifeState`, rooms[`room_${i}`] && rooms[`room_${i}`].isLifeState === true);
  }
  check('room_375 flagged isPaintRoom', rooms.room_375 && rooms.room_375.isPaintRoom === true);
  check('room_348 east exit -> room_373', rooms.room_348 && rooms.room_348.exits && rooms.room_348.exits.east === 'room_373');
  check('room_360 east exit -> room_361 (Black Hallway entry)',
    rooms.room_360 && rooms.room_360.exits && rooms.room_360.exits.east === 'room_361');
  check('room_361 requires pattern_threshold', rooms.room_361.requiresMuscleUnlock === 'pattern_threshold');
  check('room_363 requires pattern_door',     rooms.room_363.requiresMuscleUnlock === 'pattern_door');
  check('room_364 requires pattern_chair',    rooms.room_364.requiresMuscleUnlock === 'pattern_chair');
  check('room_365 requires pattern_window',   rooms.room_365.requiresMuscleUnlock === 'pattern_window');
  check('room_366 requires pattern_bowl',     rooms.room_366.requiresMuscleUnlock === 'pattern_bowl');
  check('room_367 requires pattern_hand',     rooms.room_367.requiresMuscleUnlock === 'pattern_hand');
  check('room_372 requires all 5 patterns',
    Array.isArray(rooms.room_372.requiresMuscleUnlocks)
    && rooms.room_372.requiresMuscleUnlocks.length === 5);
  check('room_369 (Subliminal Annex) is a sync terminal', rooms.room_369.isSyncTerminal === true);
}

// === monsters.json: black_hallway_warden ===
{
  check('monsters.json has black_hallway_warden boss',
    !!(monsters.bosses && monsters.bosses.black_hallway_warden));
  check('warden fixedRoom is room_372',
    monsters.bosses.black_hallway_warden.fixedRoom === 'room_372');
  check('warden combatType: coherence',
    monsters.bosses.black_hallway_warden.combatType === 'coherence');
}

// === BOSS_SIGNATURES: warden filing-review mechanic ===
{
  check('BOSS_SIGNATURES has black_hallway_warden',
    /black_hallway_warden:\s*\{/.test(src));
  check('warden filing-review at 50% HP',
    /black_hallway_warden:\s*\{[\s\S]{0,1500}filingReview[\s\S]{0,200}maxHp \* 0\.5/.test(src));
}

// === items.json: brush, swatches, poster, keyring ===
{
  function flatHas(id) {
    for (const cat of Object.keys(items)) {
      if (items[cat] && typeof items[cat] === 'object' && items[cat][id]) return true;
    }
    return false;
  }
  check('items.json has paintbrush_set', flatHas('paintbrush_set'));
  for (const swatch of ['pattern_swatch_door','pattern_swatch_chair','pattern_swatch_window','pattern_swatch_bowl','pattern_swatch_hand','pattern_swatch_threshold']) {
    check(`items.json has ${swatch}`, flatHas(swatch));
  }
  check('items.json has motivational_poster_hang_in_there', flatHas('motivational_poster_hang_in_there'));
  check('items.json has warden_keyring', flatHas('warden_keyring'));
}

// === quests.json ===
{
  check('quests.json has paint_what_you_cannot_remember', !!quests.paint_what_you_cannot_remember);
  check('quests.json has the_door_that_was_not_there', !!quests.the_door_that_was_not_there);
  const pq = quests.paint_what_you_cannot_remember;
  check('paint quest has 5 paint_pattern objectives',
    pq && pq.objectives && pq.objectives.length === 5
    && pq.objectives.every(o => o.type === 'paint_pattern'));
  check('paint quest rewards pattern_swatch_threshold',
    pq && pq.rewards && Array.isArray(pq.rewards.items) && pq.rewards.items.includes('pattern_swatch_threshold'));
  check('the_door_that_was_not_there visits room_372',
    quests.the_door_that_was_not_there
    && quests.the_door_that_was_not_there.objectives[0].targetId === 'room_372');
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
