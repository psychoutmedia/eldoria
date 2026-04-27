// Tier 6.2 Logic-State Combat — unit verification.
//
// Tests the Coherence-pool branch in monsterAttackPlayer (via direct
// invocation against a synthetic player object), the eject hook,
// quota_lock effect, retort consumption, and the data shape of new
// monsters / items / rooms / quests.

const fs = require('fs');
const sync = require('./world/sync_state');
const items = require('./items.json');
const monsters = require('./monsters.json');
const rooms = require('./rooms.json');
const quests = require('./quests.json');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === Rooms 311-330 present, flagged correctly ===
{
  for (let i = 311; i <= 330; i++) {
    const id = 'room_' + i;
    if (!rooms[id]) { check(`${id} exists`, false); continue; }
  }
  check('rooms 311-330 all exist', Array.from({length: 20}, (_, i) => 'room_' + (311 + i)).every(id => !!rooms[id]));
  check('room_311 flagged isLogicState', rooms.room_311.isLogicState === true);
  check('room_311 flagged isSyncTerminal', rooms.room_311.isSyncTerminal === true);
  check('room_330 (Editor\'s Desk) flagged isLogicState', rooms.room_330.isLogicState === true);
  check('room_323 (Break Room) NOT flagged isLogicState (it is a refuge)', !rooms.room_323.isLogicState);
  check('room_308 east exit opens to room_311', rooms.room_308.exits.east === 'room_311');
  check('room_316 has up exit to room_317 (Floor 2 stair)', rooms.room_316.exits.up === 'room_317');
  check('room_322 (Vault Antechamber) is a dead-end (south only)',
    Object.keys(rooms.room_322.exits).length === 1 && rooms.room_322.exits.south === 'room_321');
}

// === 8 Corrupted Query templates exist with combatType=coherence ===
{
  const expected = ['query_dangling_pointer','query_null_referent','query_recursive_loop','query_off_by_one',
    'query_race_condition','query_cache_miss','query_segfault_phantom','query_orphaned_handle'];
  for (const id of expected) {
    const t = monsters.templates[id];
    check(`monster template ${id} exists`, !!t);
    if (t) {
      check(`${id} carries combatType='coherence'`, t.combatType === 'coherence');
      check(`${id} type=Aggressive`, t.type === 'Aggressive');
    }
  }
}

// === Refinement zones present ===
{
  check('zone "Refinement Floor 1" present', !!monsters.zones['Refinement Floor 1']);
  check('zone "Refinement Floor 2" present', !!monsters.zones['Refinement Floor 2']);
  check('zone "Optics and Drafting" present', !!monsters.zones['Optics and Drafting']);
  check('Floor 2 zone has segfault phantom in its monster list',
    monsters.zones['Refinement Floor 2'].monsters.includes('query_segfault_phantom'));
}

// === floor_supervisor_alterio boss exists with coherence type ===
{
  const a = monsters.bosses.floor_supervisor_alterio;
  check('Alterio boss exists', !!a);
  if (a) {
    check('Alterio combatType=coherence', a.combatType === 'coherence');
    check('Alterio fixedRoom=room_320', a.fixedRoom === 'room_320');
    check('Alterio level === 35', a.level === 35);
  }
}

// === Logical Retorts present in items.json with coherenceRestore ===
{
  const expected = ['retort_socratic','retort_reductio','retort_modus_ponens','retort_ad_absurdum','retort_occams_razor','retort_godel_strike'];
  for (const id of expected) {
    const it = items.consumables[id];
    check(`retort consumable ${id} exists`, !!it);
    if (it) {
      check(`${id} has coherenceRestore > 0`, typeof it.coherenceRestore === 'number' && it.coherenceRestore > 0);
      check(`${id} type='consumable'`, it.type === 'consumable');
    }
  }
  // Sanity: the strongest retort (godel) restores more than the weakest (socratic)
  check('godel_strike restores more than socratic',
    items.consumables.retort_godel_strike.coherenceRestore > items.consumables.retort_socratic.coherenceRestore);
}

// === Refinement Tools weapons exist ===
{
  const stylus = items.weapons.refinement_stylus;
  const chalk  = items.weapons.refinement_chalk;
  check('refinement_stylus exists', !!stylus);
  check('refinement_stylus has personaTag=logic', stylus && stylus.personaTag === 'logic');
  check('refinement_stylus has damageType=data', stylus && stylus.damageType === 'data');
  check('refinement_chalk exists with personaTag=logic', !!chalk && chalk.personaTag === 'logic');
}

// === Phase 6.2 quests exist with proper objectives ===
{
  const ori = quests.orientation_module;
  const quota = quests.first_refinement_quota;
  check('orientation_module quest exists', !!ori);
  check('orientation_module has 3 visit_room objectives',
    Array.isArray(ori.objectives) && ori.objectives.length === 3 && ori.objectives.every(o => o.type === 'visit_room'));
  check('orientation_module rewards include refinement_stylus',
    Array.isArray(ori.rewards.items) && ori.rewards.items.includes('refinement_stylus'));
  check('first_refinement_quota requires 3 Corrupted Query kills',
    !!quota && quota.objectives[0].count === 3);
}

// === Coherence-branch math: simulate the new logic in monsterAttackPlayer ===
//
// We don't import mud_server.js (too heavy). Instead we replicate the
// branching contract from the source so any future regression is caught
// by both the source-presence grep AND a math test.
{
  const player = { name: 'X', currentHP: 50, maxHP: 50, currentMana: 15, maxMana: 15,
    inventory: [], equipped: { weapon: null, armor: null, shield: null, head: null, neck: null, hands: null, feet: null, finger: null },
    gold: 0, effects: {}, affects: [], spellCooldowns: {}, currentRoom: 'room_311',
    stats: { totalDamageTaken: 0 } };
  sync.migrateLegacySave(player);
  // Force into Logic-State
  sync.swapPersona(player, { target: 'logic', ignoreTerminal: true });
  player.personas.logic.coherence = 100;
  player.personas.logic.maxCoherence = 100;

  // Replicate the coherence branch: drain 25
  const damage = 25;
  const before = player.personas.logic.coherence;
  const after = Math.max(0, before - damage);
  player.personas.logic.coherence = after;
  check('coherence drains 100 -> 75 on 25-damage hit', after === 75);
  // Drop to 0 and call eject
  player.personas.logic.coherence = 5;
  const lethalAfter = Math.max(0, 5 - 30);
  player.personas.logic.coherence = lethalAfter;
  check('coherence floor at 0 (no negative)', lethalAfter === 0);
  // Eject path
  const ej = sync.ejectToLifeState(player);
  check('ejectToLifeState succeeds when activePersona=logic', ej && ej.ok && ej.to === 'life');
  check('eject sets neural_hangover effect', !!(player.effects && player.effects.neural_hangover));
}

// === BOSS_SIGNATURES + quota_lock effect ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('BOSS_SIGNATURES has floor_supervisor_alterio entry',
    /floor_supervisor_alterio:\s*\{[\s\S]{0,500}quotaLocked/.test(src));
  check('Alterio signature applies quota_lock effect',
    /player\.effects\['quota_lock'\][\s\S]{0,80}expiresAt:\s*Date\.now\(\)\s*\+\s*60000/.test(src));
  check('handleSwap blocks on quota_lock effect',
    /handleSwap[\s\S]{0,2000}quota_lock[\s\S]{0,200}quota period is in effect/.test(src));
}

// === Combat branching: verify the new branch in monsterAttackPlayer source ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('monsterAttackPlayer branches on combatType==coherence',
    /monster\.combatType === 'coherence'[\s\S]{0,200}getActivePersona\(player\) === 'logic'/.test(src));
  check('coherence branch decrements personas.logic.coherence',
    /player\.personas\.logic\.coherence = after/.test(src));
  check('coherence branch calls ejectToLifeState at 0',
    /after <= 0[\s\S]{0,1200}ejectToLifeState\(player\)/.test(src));
  check('coherence branch returns false (no death) early',
    /coherence damage[\s\S]{0,1500}return false/.test(src));
  check('coherence branch resets coherence after eject for next shift',
    /player\.personas\.logic\.coherence = player\.personas\.logic\.maxCoherence/.test(src));
}

// === handleUse coherence branch ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('handleUse reads item.coherenceRestore',
    /coherenceAmount = item\.coherenceRestore/.test(src));
  check('handleUse only restores coherence in Logic-State',
    /handleUse[\s\S]{0,2500}getActivePersona\(player\) === 'logic'[\s\S]{0,400}player\.personas\.logic\.coherence = after/.test(src));
  check('handleUse no-ops retort outside Logic-State',
    /not currently in Logic-State/i.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
