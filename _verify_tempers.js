// _verify_tempers.js - Tier 6.4 retro: Four Tempers bolt-on.
// Validates the Tempers data layer in chord_labor, the schema seeding
// in sync_state, and the dispatcher wiring in mud_server.js (without
// running the server).

const fs = require('fs');
const path = require('path');

const checks = [];
function check(name, cond) {
  checks.push({ name, pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}`);
}

const chord = require('./world/chord_labor');
const sync  = require('./world/sync_state');
const src   = fs.readFileSync(path.join(__dirname, 'mud_server.js'), 'utf8');
const quests = JSON.parse(fs.readFileSync(path.join(__dirname, 'quests.json'), 'utf8'));
const monsters = JSON.parse(fs.readFileSync(path.join(__dirname, 'monsters.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(__dirname, 'items.json'), 'utf8'));

// === chord_labor: Tempers data layer ===
{
  check('TEMPERS export is [dread, frolic, malice, woe]',
    Array.isArray(chord.TEMPERS) && chord.TEMPERS.length === 4
    && chord.TEMPERS.includes('dread') && chord.TEMPERS.includes('frolic')
    && chord.TEMPERS.includes('malice') && chord.TEMPERS.includes('woe'));
  check('DEFAULT_TEMPER_WEIGHTS is uniform 0.25 across 4 tempers',
    chord.DEFAULT_TEMPER_WEIGHTS.dread === 0.25
    && chord.DEFAULT_TEMPER_WEIGHTS.frolic === 0.25
    && chord.DEFAULT_TEMPER_WEIGHTS.malice === 0.25
    && chord.DEFAULT_TEMPER_WEIGHTS.woe === 0.25);
  check('ATTUNEMENT_PER_CLEAR is 1', chord.ATTUNEMENT_PER_CLEAR === 1);
  check('MIS_SORT_MANIFEST_THRESHOLD is 6', chord.MIS_SORT_MANIFEST_THRESHOLD === 6);
}

// === Per-row temper assignment in generateBatch ===
{
  chord._resetForTests();
  const b = chord.generateBatch('room_313', () => 0.05); // first bucket on both axes
  check('every row carries a temper', b.rows.every(r => typeof r.temper === 'string' && r.temper.length > 0));
  check('rng=0.05 picks first temper (dread)', b.rows.every(r => r.temper === 'dread'));
  // Biased terminal: room_355 dread weight 0.55 -> mid-range rng should still hit dread
  const b2 = chord.generateBatch('room_355', () => 0.30);
  check('room_355 (Dread Bench) at rng=0.30 picks dread', b2.rows.every(r => r.temper === 'dread'));
  // Frolic bench: 0.55 frolic after 0.15 dread offset, so rng=0.30 -> frolic
  const b3 = chord.generateBatch('room_356', () => 0.40);
  check('room_356 (Frolic Bench) at rng=0.40 picks frolic', b3.rows.every(r => r.temper === 'frolic'));
  // Malice bench: dread 0.15 + frolic 0.15 + malice 0.55 -> rng=0.50 -> malice
  const b4 = chord.generateBatch('room_357', () => 0.50);
  check('room_357 (Malice Bench) at rng=0.50 picks malice', b4.rows.every(r => r.temper === 'malice'));
  // Woe bench: dread 0.15 + frolic 0.15 + malice 0.15 + woe 0.55 -> rng=0.70 -> woe
  const b5 = chord.generateBatch('room_358', () => 0.70);
  check('room_358 (Woe Bench) at rng=0.70 picks woe', b5.rows.every(r => r.temper === 'woe'));
}

// === applyVerb returns temper + attunement on correct clear ===
{
  chord._resetForTests();
  const b = chord.generateBatch('room_355', () => 0.05); // all signal/dread
  const r = chord.applyVerb(b, 'sort', 0);
  check('applyVerb correct clear returns temper', r.ok && r.cleared && r.temper === 'dread');
  check('applyVerb correct clear returns attunement = 1', r.attunement === 1);
}

// === applyVerb returns temper on wrong verb (for missort tracking) ===
{
  chord._resetForTests();
  // room_356 (Frolic Bench: dread 0.15 cum, frolic 0.70 cum). rng=0.30 -> row_type=signal (0.30<0.34), temper=frolic (0.30 in [0.15, 0.70)).
  const b = chord.generateBatch('room_356', () => 0.30);
  const r = chord.applyVerb(b, 'bind', 0); // wrong verb (needs sort)
  check('applyVerb wrong verb returns temper', r.ok && !r.cleared && r.temper === 'frolic');
  check('applyVerb wrong verb still drains coherence', r.coherenceCost === chord.COHERENCE_COST_WRONG_VERB);
}

// === describeBatch shows temper hint ===
{
  chord._resetForTests();
  // room_355 (Dread Bench), rng=0.05 -> all rows signal/dread.
  const b = chord.generateBatch('room_355', () => 0.05);
  const s = chord.describeBatch(b);
  check('describeBatch shows row type / temper combo', /signal\/dread -> use sort/.test(s));
}

// === sync_state: schema seeding (idempotent) ===
{
  const p = {};
  sync.migrateLegacySave(p);
  check('migrateLegacySave seeds player.tempers',
    p.tempers && typeof p.tempers === 'object'
    && p.tempers.dread === 0 && p.tempers.frolic === 0
    && p.tempers.malice === 0 && p.tempers.woe === 0);
  check('migrateLegacySave seeds player.tempersMissorts',
    p.tempersMissorts && typeof p.tempersMissorts === 'object'
    && p.tempersMissorts.dread === 0 && p.tempersMissorts.frolic === 0
    && p.tempersMissorts.malice === 0 && p.tempersMissorts.woe === 0);

  // Idempotency: existing values preserved across re-migration
  p.tempers.dread = 7;
  p.tempersMissorts.malice = 3;
  sync.migrateLegacySave(p);
  check('re-migration preserves existing tempers values', p.tempers.dread === 7);
  check('re-migration preserves existing missort values', p.tempersMissorts.malice === 3);

  // Repair partial objects
  const p2 = { tempers: { dread: 5 }, tempersMissorts: { woe: 'bad' } };
  sync.migrateLegacySave(p2);
  check('partial tempers object gets defaulted keys', p2.tempers.frolic === 0 && p2.tempers.malice === 0 && p2.tempers.woe === 0);
  check('partial tempersMissorts object gets defaulted keys', typeof p2.tempersMissorts.woe === 'number' && p2.tempersMissorts.woe === 0);
  check('partial tempers object preserves valid keys', p2.tempers.dread === 5);
}

// === mud_server.js: dispatcher wiring ===
{
  check('handleTempers function defined', /function handleTempers\(socket, player\)/.test(src));
  check('tempers command routed to handleTempers', /command === 'tempers'[\s\S]{0,80}handleTempers/.test(src));
  check('handleApplyVerb credits tempers on correct clear',
    /handleApplyVerb[\s\S]{0,3000}player\.tempers\[r\.temper\][\s\S]{0,200}\+ r\.attunement/.test(src));
  check('handleApplyVerb drains missort tally on correct clear (decay)',
    /handleApplyVerb[\s\S]{0,4000}tempersMissorts\[r\.temper\][\s\S]{0,200}Math\.max\(0/.test(src));
  check('handleApplyVerb increments missort tally on wrong verb',
    /handleApplyVerb[\s\S]{0,8000}tempersMissorts\[r\.temper\][\s\S]{0,200}\+ 1/.test(src));
  check('handleApplyVerb manifestTemperBoss path on threshold',
    /handleApplyVerb[\s\S]{0,8000}MIS_SORT_MANIFEST_THRESHOLD[\s\S]{0,400}manifestTemperBoss/.test(src));
  check('handleApplyVerb tempers_attune quest hook',
    /handleApplyVerb[\s\S]{0,3000}questManager\.updateObjective\(player\.name, 'tempers_attune'/.test(src));
  check('handleApplyVerb tempers_attune_total quest hook on batch complete',
    /handleApplyVerb[\s\S]{0,8000}questManager\.updateObjective\(player\.name, 'tempers_attune_total'/.test(src));
  check('manifestTemperBoss function defined',
    /function manifestTemperBoss\(temper, roomId\)/.test(src));
  check('spawnBosses skips bosses without fixedRoom',
    /spawnBosses[\s\S]{0,500}if \(!bossTemplate\.fixedRoom\) return;/.test(src));
}

// === BOSS_SIGNATURES: 4 manifest entries present ===
{
  check('BOSS_SIGNATURES has manifest_dread', /manifest_dread:\s*\{/.test(src));
  check('BOSS_SIGNATURES has manifest_frolic', /manifest_frolic:\s*\{/.test(src));
  check('BOSS_SIGNATURES has manifest_malice (mirror damage)',
    /manifest_malice:\s*\{[\s\S]{0,400}lastIncomingDamage/.test(src));
  check('BOSS_SIGNATURES has manifest_woe (XP drain)',
    /manifest_woe:\s*\{[\s\S]{0,400}player\.experience[\s\S]{0,80}- drain/.test(src));
}

// === monsters.json: 4 manifest bosses ===
{
  for (const t of ['manifest_dread', 'manifest_frolic', 'manifest_malice', 'manifest_woe']) {
    check(`monsters.json bosses has ${t}`, !!(monsters.bosses && monsters.bosses[t]));
    check(`${t} is combatType: coherence`, monsters.bosses && monsters.bosses[t] && monsters.bosses[t].combatType === 'coherence');
    check(`${t} has no fixedRoom (manifest dynamically)`, monsters.bosses && monsters.bosses[t] && !monsters.bosses[t].fixedRoom);
  }
}

// === items.json: chord shards + tempers compass ===
{
  // items.json is keyed by category at the top level (weapons, armor, ..., qp_gear).
  // Mirror the runtime getItemById helper: walk all categories.
  function flatHas(id) {
    for (const cat of Object.keys(items)) {
      if (items[cat] && typeof items[cat] === 'object' && items[cat][id]) return true;
    }
    return false;
  }
  for (const id of ['chord_shard_dread', 'chord_shard_frolic', 'chord_shard_malice', 'chord_shard_woe']) {
    check(`items.json has ${id}`, flatHas(id));
  }
  check('items.json has tempers_compass', flatHas('tempers_compass'));
  check('items.json has tuning_fork_bin', flatHas('tuning_fork_bin'));
}

// === quests.json: the_quota + four_tempers_attune ===
{
  check('quests.json has the_quota', !!quests.the_quota);
  check('quests.json has four_tempers_attune', !!quests.four_tempers_attune);
  check('the_quota objective type is tempers_attune_total',
    quests.the_quota && quests.the_quota.objectives[0].type === 'tempers_attune_total');
  check('the_quota objective targetId is "_any"',
    quests.the_quota && quests.the_quota.objectives[0].targetId === '_any');
  check('four_tempers_attune has 4 objectives',
    quests.four_tempers_attune && quests.four_tempers_attune.objectives.length === 4);
  check('four_tempers_attune objectives target each temper by id',
    quests.four_tempers_attune
    && quests.four_tempers_attune.objectives.every(o => o.type === 'tempers_attune' && ['dread','frolic','malice','woe'].includes(o.targetId)));
}

// === rooms.json: Refinement Console Cluster 355-360 (Phase 6.4b) ===
{
  const rooms = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
  for (let i = 355; i <= 360; i++) {
    const id = `room_${i}`;
    check(`rooms.json has ${id}`, !!rooms[id]);
    check(`${id} flagged isLogicState`, rooms[id] && rooms[id].isLogicState === true);
    check(`${id} flagged isChordTerminal`, rooms[id] && rooms[id].isChordTerminal === true);
    check(`${id} flagged isRefinementCluster`, rooms[id] && rooms[id].isRefinementCluster === true);
  }
  check('room_354 east exit opens onto room_355',
    rooms.room_354 && rooms.room_354.exits && rooms.room_354.exits.east === 'room_355');
  check('room_360 is also a sync terminal',
    rooms.room_360 && rooms.room_360.isSyncTerminal === true);
  check('room_360 east exit reserved for room_361 (Black Hallway entry, Phase 6.5b)',
    rooms.room_360 && rooms.room_360.exits && rooms.room_360.exits.east === 'room_361');
  // Symmetry checks
  check('355 east <-> 356 west', rooms.room_355.exits.east === 'room_356' && rooms.room_356.exits.west === 'room_355');
  check('356 east <-> 357 west', rooms.room_356.exits.east === 'room_357' && rooms.room_357.exits.west === 'room_356');
  check('355 south <-> 358 north', rooms.room_355.exits.south === 'room_358' && rooms.room_358.exits.north === 'room_355');
  check('356 south <-> 359 north', rooms.room_356.exits.south === 'room_359' && rooms.room_359.exits.north === 'room_356');
  check('357 south <-> 360 north', rooms.room_357.exits.south === 'room_360' && rooms.room_360.exits.north === 'room_357');
  check('358 east <-> 359 west', rooms.room_358.exits.east === 'room_359' && rooms.room_359.exits.west === 'room_358');
  check('359 east <-> 360 west', rooms.room_359.exits.east === 'room_360' && rooms.room_360.exits.west === 'room_359');
}

// === TERMINAL_PROFILES covers 355-360 ===
{
  for (let i = 355; i <= 360; i++) {
    const id = `room_${i}`;
    check(`TERMINAL_PROFILES has ${id}`, !!chord.TERMINAL_PROFILES[id]);
  }
  check('room_355 biased toward dread',
    chord.TERMINAL_PROFILES.room_355.tempers && chord.TERMINAL_PROFILES.room_355.tempers.dread >= 0.5);
  check('room_356 biased toward frolic',
    chord.TERMINAL_PROFILES.room_356.tempers && chord.TERMINAL_PROFILES.room_356.tempers.frolic >= 0.5);
  check('room_357 biased toward malice',
    chord.TERMINAL_PROFILES.room_357.tempers && chord.TERMINAL_PROFILES.room_357.tempers.malice >= 0.5);
  check('room_358 biased toward woe',
    chord.TERMINAL_PROFILES.room_358.tempers && chord.TERMINAL_PROFILES.room_358.tempers.woe >= 0.5);
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
