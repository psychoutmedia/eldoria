// _verify_capstone.js - Tier 6.8: Cradle + Three Endings.
// Validates the capstone rooms 393-400, gia_saint_reed_proto boss,
// three ending tokens, world/tier7_seeds.json schema, hybrid persona
// unlock on Splice, choose verb, and quest objectives.

const fs = require('fs');
const path = require('path');

const checks = [];
function check(name, cond) {
  checks.push({ name, pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}`);
}

const sync = require('./world/sync_state');
const src = fs.readFileSync(path.join(__dirname, 'mud_server.js'), 'utf8');
const rooms = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, 'monsters.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'items.json'), 'utf8'));
const quests = JSON.parse(fs.readFileSync(path.join(__dirname, 'quests.json'), 'utf8'));
const seeds = JSON.parse(fs.readFileSync(path.join(__dirname, 'world', 'tier7_seeds.json'), 'utf8'));

// === Rooms 393-400 ===
{
  for (let i = 393; i <= 400; i++) {
    check(`rooms.json has room_${i}`, !!rooms[`room_${i}`]);
    check(`room_${i} flagged isCradle`, rooms[`room_${i}`] && rooms[`room_${i}`].isCradle === true);
  }
  check('room_400 flagged isCapstone', rooms.room_400 && rooms.room_400.isCapstone === true);
  check('room_392 north exit -> room_393 (Cradle entry)',
    rooms.room_392 && rooms.room_392.exits && rooms.room_392.exits.north === 'room_393');
  check('room_400 east exit -> room_399 (back through Severance Core)',
    rooms.room_400 && rooms.room_400.exits && rooms.room_400.exits.east === 'room_399');
  check('room_395 (Inner Cradle) is a sync terminal',
    rooms.room_395 && rooms.room_395.isSyncTerminal === true);
  // Splice Theatre is the canonical Splice room (room_397)
  check('room_397 (Splice Theatre) reachable from room_396',
    rooms.room_396 && rooms.room_396.exits && rooms.room_396.exits.north === 'room_397');
}

// === gia_saint_reed_proto ===
{
  check('monsters.json has gia_saint_reed_proto',
    !!(monsters.bosses && monsters.bosses.gia_saint_reed_proto));
  const g = monsters.bosses && monsters.bosses.gia_saint_reed_proto;
  check('gia_saint_reed_proto fixedRoom is room_400', g && g.fixedRoom === 'room_400');
  check('gia_saint_reed_proto combatType is coherence', g && g.combatType === 'coherence');
  check('gia_saint_reed_proto level is 50', g && g.level === 50);
}

// === Boss death dispatcher hook ===
{
  check('handleMonsterDeath sets tier6BossDefeated on proto kill',
    /handleMonsterDeath[\s\S]{0,3000}gia_saint_reed_proto[\s\S]{0,200}tier6BossDefeated = true/.test(src));
  check('handleMonsterDeath surfaces three-ending prompt',
    /handleMonsterDeath[\s\S]{0,4000}APOTHEOSIS[\s\S]{0,400}LIBERATION[\s\S]{0,400}SPLICE/.test(src));
}

// === handleChoose + dispatcher ===
{
  check('handleChoose function defined', /function handleChoose\(socket, player, args\)/.test(src));
  check('choose command routed to handleChoose',
    /command === 'choose'[\s\S]{0,200}handleChoose/.test(src));
  check('handleChoose rejects without boss defeated',
    /handleChoose[\s\S]{0,1500}!player\.tier6BossDefeated/.test(src));
  check('handleChoose enforces room_397 for splice',
    /handleChoose[\s\S]{0,2000}'splice'[\s\S]{0,200}player\.currentRoom !== 'room_397'/.test(src));
  check('handleChoose enforces room_400 for non-splice',
    /handleChoose[\s\S]{0,2000}player\.currentRoom !== 'room_400'/.test(src));
  check('handleChoose sets player.tier6Ending',
    /handleChoose[\s\S]{0,3000}player\.tier6Ending = ending/.test(src));
  check('handleChoose calls recordTier6Ending',
    /handleChoose[\s\S]{0,3500}recordTier6Ending\(player\.name, ending\)/.test(src));
  check('handleChoose unlocks hybrid on splice',
    /handleChoose[\s\S]{0,3000}ending === 'splice'[\s\S]{0,200}unlockHybridPersona/.test(src));
  check('handleChoose awards diaspora_compass on liberation',
    /handleChoose[\s\S]{0,3000}ending === 'liberation'[\s\S]{0,300}diaspora_compass/.test(src));
}

// === tier7_seeds writer ===
{
  check('TIER7_SEEDS_PATH constant defined',
    /const TIER7_SEEDS_PATH/.test(src));
  check('readTier7Seeds defined', /function readTier7Seeds\(\)/.test(src));
  check('writeTier7Seeds defined', /function writeTier7Seeds\(data\)/.test(src));
  check('recordTier6Ending defined', /function recordTier6Ending\(playerName, ending/.test(src));
  check('recordTier6Ending increments endingsTaken[ending]',
    /endingsTaken\[ending\] = \(seeds\.endingsTaken\[ending\] \|\| 0\) \+ 1/.test(src));
  check('recordTier6Ending sets hybridPersonaUnlocked on splice',
    /'splice'[\s\S]{0,200}hybridPersonaUnlocked = true/.test(src));
}

// === tier7_seeds.json schema ===
{
  check('tier7_seeds.json has schemaVersion', typeof seeds.schemaVersion === 'number');
  check('tier7_seeds.json has endingsTaken with all three keys',
    seeds.endingsTaken
    && typeof seeds.endingsTaken.apotheosis === 'number'
    && typeof seeds.endingsTaken.liberation === 'number'
    && typeof seeds.endingsTaken.splice === 'number');
  check('tier7_seeds.json has apotheosis.minRemortTier === 3',
    seeds.apotheosis && seeds.apotheosis.minRemortTier === 3);
  check('tier7_seeds.json has liberation.factionMarker === theta_diaspora',
    seeds.liberation && seeds.liberation.factionMarker === 'theta_diaspora');
  check('tier7_seeds.json has splice.room_401_phantom reference',
    seeds.splice && typeof seeds.splice.room_401_phantom === 'string');
  check('tier7_seeds.json has history array', Array.isArray(seeds.history));
}

// === sync_state.unlockHybridPersona ===
{
  const p = {};
  sync.migrateLegacySave(p);
  check('player has personas.hybrid: null after migration',
    p.personas && Object.prototype.hasOwnProperty.call(p.personas, 'hybrid')
    && p.personas.hybrid === null);
  const r = sync.unlockHybridPersona(p, 'room_397');
  check('unlockHybridPersona ok on first call', r.ok === true);
  check('hybrid block created with currentRoom override',
    p.personas.hybrid && p.personas.hybrid.currentRoom === 'room_397');
  check('hybrid block has phantomRoom -> room_401_phantom',
    p.personas.hybrid && p.personas.hybrid.phantomRoom === 'room_401_phantom');
  check('hybrid block carries coherence stats',
    p.personas.hybrid && p.personas.hybrid.coherence === 100);
  const r2 = sync.unlockHybridPersona(p, 'room_397');
  check('unlockHybridPersona is idempotent (rejects re-unlock)', r2.ok === false);
}

// === Items: tokens + saint_reed_institute_pin + diaspora_compass ===
{
  function flatHas(id) {
    for (const cat of Object.keys(items)) {
      if (items[cat] && typeof items[cat] === 'object' && items[cat][id]) return true;
    }
    return false;
  }
  check('items.json has token_apotheosis', flatHas('token_apotheosis'));
  check('items.json has token_liberation', flatHas('token_liberation'));
  check('items.json has token_splice', flatHas('token_splice'));
  check('items.json has saint_reed_institute_pin', flatHas('saint_reed_institute_pin'));
  check('items.json has diaspora_compass', flatHas('diaspora_compass'));
}

// === Quests ===
{
  check('quests.json has the_cradle', !!quests.the_cradle);
  check('quests.json has assemble_the_founder', !!quests.assemble_the_founder);
  check('quests.json has cut_the_cord', !!quests.cut_the_cord);
  check('quests.json has splice_the_cord', !!quests.splice_the_cord);
  check('the_cradle visits room_400',
    quests.the_cradle && quests.the_cradle.objectives[0].targetId === 'room_400');
  check('assemble_the_founder kills gia_saint_reed_proto',
    quests.assemble_the_founder && quests.assemble_the_founder.objectives[0].targetId === 'gia_saint_reed_proto');
  check('cut_the_cord uses tier6_ending_chosen objective',
    quests.cut_the_cord && quests.cut_the_cord.objectives[0].type === 'tier6_ending_chosen');
  check('splice_the_cord targets splice ending',
    quests.splice_the_cord && quests.splice_the_cord.objectives[0].targetId === 'splice');
}

// === handleSwap accepts hybrid target ===
{
  check('handleSwap accepts args parameter',
    /function handleSwap\s*\(socket, player, args\)/.test(src));
  check('handleSwap parses targetArg for hybrid',
    /handleSwap[\s\S]{0,2000}targetArg === 'hybrid'/.test(src));
  check('handleSwap blocks hybrid target until unlocked',
    /handleSwap[\s\S]{0,2000}!player\.personas\.hybrid[\s\S]{0,200}Hybrid persona is locked/.test(src));
  check('swapPersona invoked with explicitTarget option',
    /swapPersona\(player, explicitTarget \? \{ target: explicitTarget \} : undefined\)/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
