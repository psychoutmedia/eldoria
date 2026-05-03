// _verify_loom.js - Tier 6.6: The Loom (predictive AI overseer).
// Validates the world/loom module's deterministic decision engine,
// dispatcher wiring (telemetry record, resistance kill, status command),
// boot/reset hooks, rooms 376-385, monsters, items, and quests.

const fs = require('fs');
const path = require('path');

const checks = [];
function check(name, cond) {
  checks.push({ name, pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}`);
}

const loom = require('./world/loom');
const src = fs.readFileSync(path.join(__dirname, 'mud_server.js'), 'utf8');
const rooms = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, 'monsters.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'items.json'), 'utf8'));
const quests = JSON.parse(fs.readFileSync(path.join(__dirname, 'quests.json'), 'utf8'));

// === Constants ===
{
  check('TICK_INTERVAL_MS is 30000', loom.TICK_INTERVAL_MS === 30 * 1000);
  check('THROUGHPUT_WINDOW_MS is 5min', loom.THROUGHPUT_WINDOW_MS === 5 * 60 * 1000);
  check('PURGE_THRESHOLD is 10', loom.PURGE_THRESHOLD === 10);
  check('PURGE_COOLDOWN_MS is 10min', loom.PURGE_COOLDOWN_MS === 10 * 60 * 1000);
  check('DRONES_PER_PURGE is 3', loom.DRONES_PER_PURGE === 3);
}

// === Telemetry rolling window ===
{
  loom._resetForTests();
  for (let i = 0; i < 5; i++) loom.recordBatchCompletion(1000 + i);
  check('currentThroughput counts batches in window', loom.currentThroughput(1000 + 5) === 5);
  // Slide forward by more than the window: old entries pruned
  const future = 1000 + loom.THROUGHPUT_WINDOW_MS + 5000;
  loom.recordBatchCompletion(future);
  check('window prunes outside-window batches', loom.currentThroughput(future) === 1);
}

// === tick: below threshold -> no fire ===
{
  loom._resetForTests();
  for (let i = 0; i < 5; i++) loom.recordBatchCompletion(1000);
  const r = loom.tick(2000, {});
  check('tick below threshold does not fire', r.fired === false);
  check('tick reports throughput and threshold', r.throughput === 5 && r.threshold === loom.PURGE_THRESHOLD);
}

// === tick: at-threshold -> fires + spawns drones + broadcasts ===
{
  loom._resetForTests();
  let dronesSpawned = 0;
  let directiveBroadcast = null;
  const fakeRooms = ['room_313', 'room_315', 'room_319', 'room_327', 'room_355'];
  for (let i = 0; i < loom.PURGE_THRESHOLD; i++) loom.recordBatchCompletion(1000);
  const r = loom.tick(5000, {
    spawnDrone: (roomId) => { dronesSpawned += 1; return { roomId }; },
    findRefinementRooms: () => fakeRooms,
    broadcastDirective: (text) => { directiveBroadcast = text; }
  });
  check('tick at threshold fires', r.fired === true);
  check('tick spawns DRONES_PER_PURGE drones', r.dronesSpawned === loom.DRONES_PER_PURGE);
  check('drone spawn hook invoked', dronesSpawned === loom.DRONES_PER_PURGE);
  check('broadcast hook invoked with directive', typeof directiveBroadcast === 'string' && directiveBroadcast.length > 0);
  check('throughput resets after purge fires', loom.currentThroughput(5001) === 0);
}

// === tick: cooldown blocks back-to-back purges ===
{
  loom._resetForTests();
  for (let i = 0; i < loom.PURGE_THRESHOLD; i++) loom.recordBatchCompletion(1000);
  loom.tick(5000, { spawnDrone: () => ({}), findRefinementRooms: () => ['room_313'], broadcastDirective: () => {} });
  // Refill window and try again before cooldown expires
  for (let i = 0; i < loom.PURGE_THRESHOLD; i++) loom.recordBatchCompletion(6000);
  const r = loom.tick(7000, { spawnDrone: () => ({}), findRefinementRooms: () => ['room_313'], broadcastDirective: () => {} });
  check('tick within cooldown does not fire', r.fired === false && r.cooldown === true);
}

// === tick: cooldown clears after PURGE_COOLDOWN_MS ===
{
  loom._resetForTests();
  for (let i = 0; i < loom.PURGE_THRESHOLD; i++) loom.recordBatchCompletion(1000);
  loom.tick(5000, { spawnDrone: () => ({}), findRefinementRooms: () => ['room_313'], broadcastDirective: () => {} });
  // Wait past cooldown
  const after = 5000 + loom.PURGE_COOLDOWN_MS + 1;
  for (let i = 0; i < loom.PURGE_THRESHOLD; i++) loom.recordBatchCompletion(after - 100);
  const r = loom.tick(after, { spawnDrone: () => ({}), findRefinementRooms: () => ['room_313'], broadcastDirective: () => {} });
  check('tick fires again after cooldown clears', r.fired === true);
}

// === Resistance counter ===
{
  loom._resetForTests();
  loom.recordResistanceKill();
  loom.recordResistanceKill();
  check('recordResistanceKill increments counter', loom.getResistanceKills() === 2);
  loom.resetForCycle();
  check('resetForCycle clears resistance counter', loom.getResistanceKills() === 0);
}

// === decorateDirective fallback when LLM throws ===
(async () => {
  const decorated = await loom.decorateDirective('FALLBACK PLEASE', { llm: async () => { throw new Error('boom'); } });
  if (decorated === 'FALLBACK PLEASE') {
    checks.push({ name: 'decorateDirective falls back to static text on LLM error', pass: true });
    console.log('[PASS] decorateDirective falls back to static text on LLM error');
  } else {
    checks.push({ name: 'decorateDirective falls back to static text on LLM error', pass: false });
    console.log('[FAIL] decorateDirective falls back to static text on LLM error');
  }

  const decorated2 = await loom.decorateDirective('STATIC', { llm: async () => 'flavoured-text' });
  if (decorated2 === 'flavoured-text') {
    checks.push({ name: 'decorateDirective uses LLM output when present', pass: true });
    console.log('[PASS] decorateDirective uses LLM output when present');
  } else {
    checks.push({ name: 'decorateDirective uses LLM output when present', pass: false });
    console.log('[FAIL] decorateDirective uses LLM output when present');
  }

  // === mud_server.js dispatcher wiring ===
  check('loom module required', /require\('\.\/world\/loom'\)/.test(src));
  check('handleApplyVerb feeds loom.recordBatchCompletion on batch complete',
    /handleApplyVerb[\s\S]{0,9000}loom\.recordBatchCompletion\(\)/.test(src));
  check('handleMonsterDeath feeds loom.recordResistanceKill on purge_drone kill',
    /handleMonsterDeath[\s\S]{0,2000}purge_drone[\s\S]{0,200}loom\.recordResistanceKill/.test(src));
  check('boot starts loom tick loop',
    /loom\.startTickLoop\([\s\S]{0,500}spawnDrone:[\s\S]{0,200}findRefinementRooms:[\s\S]{0,200}broadcastDirective:/.test(src));
  check('executeWorldReset calls loom.resetForCycle',
    /executeWorldReset[\s\S]{0,500}loom\.resetForCycle/.test(src));
  check('handleLoomStatus function defined', /function handleLoomStatus\(socket, player\)/.test(src));
  check('loom command routed to handleLoomStatus',
    /command === 'loom'[\s\S]{0,200}handleLoomStatus/.test(src));
  check('spawnPurgeDrone helper defined', /function spawnPurgeDrone\(roomId\)/.test(src));
  check('findRefinementRoomIds helper defined', /function findRefinementRoomIds\(\)/.test(src));

  // === BOSS_SIGNATURES: the_loom_proxy efficiency review ===
  check('BOSS_SIGNATURES has the_loom_proxy', /the_loom_proxy:\s*\{/.test(src));
  check('the_loom_proxy efficiency_review at 50% HP',
    /the_loom_proxy:\s*\{[\s\S]{0,1500}efficiencyReview[\s\S]{0,200}maxHp \* 0\.5/.test(src));

  // === Rooms 376-385 ===
  for (let i = 376; i <= 385; i++) {
    check(`rooms.json has room_${i}`, !!rooms[`room_${i}`]);
    check(`room_${i} flagged isLoomTower`, rooms[`room_${i}`] && rooms[`room_${i}`].isLoomTower === true);
  }
  check('room_376 (Loom Lobby) is also a sync terminal', rooms.room_376 && rooms.room_376.isSyncTerminal === true);
  check('room_386 has up exit -> room_376 (lift to Loom Tower)',
    rooms.room_386 && rooms.room_386.exits && rooms.room_386.exits.up === 'room_376');
  check('room_385 (The Loom) is the boss room', rooms.room_385 && rooms.room_385.zone === 'Loom Tower');

  // === monsters.json ===
  check('monsters.json has purge_drone', !!(monsters.bosses && monsters.bosses.purge_drone));
  check('purge_drone has no fixedRoom (spawned dynamically)',
    monsters.bosses && monsters.bosses.purge_drone && !monsters.bosses.purge_drone.fixedRoom);
  check('monsters.json has efficiency_inspector at room_380',
    monsters.bosses && monsters.bosses.efficiency_inspector && monsters.bosses.efficiency_inspector.fixedRoom === 'room_380');
  check('monsters.json has compliance_revenant at room_383',
    monsters.bosses && monsters.bosses.compliance_revenant && monsters.bosses.compliance_revenant.fixedRoom === 'room_383');
  check('monsters.json has the_loom_proxy at room_385',
    monsters.bosses && monsters.bosses.the_loom_proxy && monsters.bosses.the_loom_proxy.fixedRoom === 'room_385');

  // === items.json ===
  function flatHas(id) {
    for (const cat of Object.keys(items)) {
      if (items[cat] && typeof items[cat] === 'object' && items[cat][id]) return true;
    }
    return false;
  }
  check('items.json has drone_compliance_badge', flatHas('drone_compliance_badge'));
  check('items.json has inspector_clipboard', flatHas('inspector_clipboard'));
  check('items.json has revenant_lanyard', flatHas('revenant_lanyard'));
  check('items.json has loom_shuttle (Loom Proxy drop)', flatHas('loom_shuttle'));

  // === quests.json ===
  check('quests.json has audit_the_loom', !!quests.audit_the_loom);
  check('quests.json has the_purge_cycle_warning', !!quests.the_purge_cycle_warning);
  check('quests.json has loom_test_subjects', !!quests.loom_test_subjects);
  check('audit_the_loom visits room_380',
    quests.audit_the_loom && quests.audit_the_loom.objectives[0].targetId === 'room_380');
  check('the_purge_cycle_warning kills 3 purge_drones',
    quests.the_purge_cycle_warning
    && quests.the_purge_cycle_warning.objectives[0].type === 'monster_kill'
    && quests.the_purge_cycle_warning.objectives[0].targetId === 'purge_drone'
    && quests.the_purge_cycle_warning.objectives[0].count === 3);
  check('loom_test_subjects kills compliance_revenant',
    quests.loom_test_subjects
    && quests.loom_test_subjects.objectives[0].targetId === 'compliance_revenant');

  // === Summary ===
  loom._resetForTests();
  const passed = checks.filter(c => c.pass).length;
  console.log(`\n${passed}/${checks.length} checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
})();
