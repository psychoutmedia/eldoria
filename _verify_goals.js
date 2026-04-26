// Tier 4.6 Goals — unit verification.
const goals = require('./world/goals');
const fs = require('fs');
const path = require('path');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

const player = () => ({ name: 'TestPlayer', goalProgress: {}, goalsClaimed: [], level: 1, gold: 0, remortTier: 0 });

// === Definition validation ===
{
  check('validate: missing id rejected',
    !goals.validateDefinition({ category: 'combat', name: 'X', description: 'd', type: 'counter', key: 'k', target: 1, reward: { qp: 1 } }).ok);
  check('validate: bad category rejected',
    !goals.validateDefinition({ id: 'x', category: 'bogus', name: 'X', description: 'd', type: 'counter', key: 'k', target: 1, reward: {} }).ok);
  check('validate: bad type rejected',
    !goals.validateDefinition({ id: 'x', category: 'combat', name: 'X', description: 'd', type: 'bogus', key: 'k', target: 1, reward: {} }).ok);
  check('validate: counter target must be positive',
    !goals.validateDefinition({ id: 'x', category: 'combat', name: 'X', description: 'd', type: 'counter', key: 'k', target: 0, reward: {} }).ok);
  check('validate: boolean target must be true/false',
    !goals.validateDefinition({ id: 'x', category: 'combat', name: 'X', description: 'd', type: 'boolean', key: 'k', target: 'maybe', reward: {} }).ok);
  check('validate: ALL_ZONES is a valid set target',
    goals.validateDefinition({ id: 'x', category: 'exploration', name: 'X', description: 'd', type: 'set', key: 'k', target: 'ALL_ZONES', reward: { qp: 1 } }).ok);
  check('validate: empty set array rejected',
    !goals.validateDefinition({ id: 'x', category: 'exploration', name: 'X', description: 'd', type: 'set', key: 'k', target: [], reward: {} }).ok);
  check('validate: missing reward rejected',
    !goals.validateDefinition({ id: 'x', category: 'combat', name: 'X', description: 'd', type: 'counter', key: 'k', target: 1 }).ok);
  check('validate: negative qp rejected',
    !goals.validateDefinition({ id: 'x', category: 'combat', name: 'X', description: 'd', type: 'counter', key: 'k', target: 1, reward: { qp: -5 } }).ok);
  check('validate: full valid object accepted',
    goals.validateDefinition({ id: 'x', category: 'combat', name: 'X', description: 'd', type: 'counter', key: 'k', target: 100, reward: { qp: 25, gold: 10, title: 't' } }).ok);
}

// === loadDefinitions on the real goals.json ===
{
  goals._resetForTests();
  const result = goals.loadDefinitions();
  check('loadDefinitions ok against real goals.json', result.ok);
  check('loadDefinitions returned a plausible count', result.count >= 10);
  const all = goals.getDefinitions();
  check('getDefinitions returns array', Array.isArray(all) && all.length === result.count);
  // Spot-check well-known goals from the curated launch set
  check('combat_apprentice exists', goals.getDefinition('combat_apprentice') !== null);
  check('explore_realm_walker uses ALL_ZONES', goals.getDefinition('explore_realm_walker').target === goals.TARGET_ALL_ZONES);
  check('every loaded goal validates', all.every(g => goals.validateDefinition(g).ok));
  // No duplicate ids
  const ids = new Set(all.map(g => g.id));
  check('no duplicate ids in real goals.json', ids.size === all.length);
}

// === loadDefinitions resilience ===
{
  goals._resetForTests();
  const tmp = path.join(__dirname, '_test_goals_garbage.json');
  fs.writeFileSync(tmp, '{not json', 'utf8');
  const r = goals.loadDefinitions(tmp);
  check('loadDefinitions returns ok=false on garbage', !r.ok && /parse error/i.test(r.error));
  check('loadDefinitions sets count=0 on parse failure', goals.getDefinitions().length === 0);
  try { fs.unlinkSync(tmp); } catch (e) {}
}

// === Restore real definitions for the rest of the tests ===
goals._resetForTests();
goals.loadDefinitions();

// === ensureProgressShape ===
{
  const p = { name: 'X' };
  goals.ensureProgressShape(p);
  check('ensureProgressShape adds goalProgress', p.goalProgress && typeof p.goalProgress === 'object');
  check('ensureProgressShape adds goalsClaimed array', Array.isArray(p.goalsClaimed));
  // Idempotent
  p.goalProgress.foo = 1;
  goals.ensureProgressShape(p);
  check('ensureProgressShape preserves existing data', p.goalProgress.foo === 1);
}

// === incrementCounter ===
{
  const p = player();
  goals.incrementCounter(p, 'monstersKilled', 3);
  goals.incrementCounter(p, 'monstersKilled', 2);
  check('incrementCounter accumulates', p.goalProgress.monstersKilled === 5);
  goals.incrementCounter(p, 'monstersKilled');  // default n=1
  check('incrementCounter defaults n=1', p.goalProgress.monstersKilled === 6);
  // Non-existent counter starts at 0
  goals.incrementCounter(p, 'newCounter', 7);
  check('incrementCounter starts new keys at 0', p.goalProgress.newCounter === 7);
}

// === setBoolean ===
{
  const p = player();
  goals.setBoolean(p, 'enteredNeoKyoto');
  check('setBoolean default true', p.goalProgress.enteredNeoKyoto === true);
  goals.setBoolean(p, 'flag', false);
  check('setBoolean accepts explicit false', p.goalProgress.flag === false);
}

// === addToSet ===
{
  const p = player();
  goals.addToSet(p, 'zones', 'Crystal Caverns');
  goals.addToSet(p, 'zones', 'Shadow Marshes');
  goals.addToSet(p, 'zones', 'Crystal Caverns');  // duplicate
  check('addToSet stores unique members', p.goalProgress.zones.length === 2);
  check('addToSet preserves order', p.goalProgress.zones[0] === 'Crystal Caverns' && p.goalProgress.zones[1] === 'Shadow Marshes');
}

// === isComplete: counter ===
{
  const p = player();
  const goal = goals.getDefinition('combat_apprentice');  // 100 kills
  check('counter not complete at 0', !goals.isComplete(goal, p));
  goals.incrementCounter(p, 'monstersKilled', 99);
  check('counter not complete at 99', !goals.isComplete(goal, p));
  goals.incrementCounter(p, 'monstersKilled', 1);
  check('counter complete at 100', goals.isComplete(goal, p));
  goals.incrementCounter(p, 'monstersKilled', 50);
  check('counter still complete past target', goals.isComplete(goal, p));
}

// === isComplete: boolean ===
{
  const p = player();
  const goal = goals.getDefinition('explore_neo_kyoto');
  check('boolean not complete by default', !goals.isComplete(goal, p));
  goals.setBoolean(p, 'enteredNeoKyoto', true);
  check('boolean complete when true', goals.isComplete(goal, p));
}

// === isComplete: set with ALL_ZONES expansion ===
{
  const p = player();
  const goal = goals.getDefinition('explore_realm_walker');
  // ctx supplies the live zone count
  const ctx = { zoneCount: 3 };
  check('set goal not complete with no zones', !goals.isComplete(goal, p, ctx));
  goals.addToSet(p, 'zonesVisited', 'A');
  goals.addToSet(p, 'zonesVisited', 'B');
  check('set goal not complete with 2/3 zones', !goals.isComplete(goal, p, ctx));
  goals.addToSet(p, 'zonesVisited', 'C');
  check('set goal complete when zones match count', goals.isComplete(goal, p, ctx));
  // Without ctx (zoneCount=0), goal is uncomputable -> not complete
  check('set goal not complete without ctx', !goals.isComplete(goal, p, {}));
}

// === isComplete: threshold (level/gold/remort via ctx.values) ===
{
  const p = player();
  const goal = goals.getDefinition('prog_master');  // level 25
  check('threshold not complete at level 1', !goals.isComplete(goal, p, { values: { level: 1 } }));
  check('threshold not complete at level 24', !goals.isComplete(goal, p, { values: { level: 24 } }));
  check('threshold complete at level 25', goals.isComplete(goal, p, { values: { level: 25 } }));
  // Bullion hoard goal needs ctx.values.currentGold
  const goldGoal = goals.getDefinition('econ_bullion_hoard');
  check('gold threshold uses ctx.values', goals.isComplete(goldGoal, p, { values: { currentGold: 12000 } }));
}

// === progressFor ===
{
  const p = player();
  const goal = goals.getDefinition('combat_apprentice');
  goals.incrementCounter(p, 'monstersKilled', 25);
  const pr = goals.progressFor(goal, p);
  check('progressFor counter percent math', pr.current === 25 && pr.target === 100 && pr.percent === 25);
  // Boolean
  const b = goals.getDefinition('explore_neo_kyoto');
  const bp1 = goals.progressFor(b, p);
  check('progressFor boolean false -> 0%', bp1.percent === 0);
  goals.setBoolean(p, 'enteredNeoKyoto', true);
  const bp2 = goals.progressFor(b, p);
  check('progressFor boolean true -> 100%', bp2.percent === 100);
  // Percent caps at 100
  goals.incrementCounter(p, 'monstersKilled', 9999);
  const cap = goals.progressFor(goal, p);
  check('progressFor caps at 100%', cap.percent === 100);
}

// === statusFor ===
{
  const p = player();
  const goal = goals.getDefinition('combat_apprentice');
  check('status starts in_progress', goals.statusFor(goal, p) === 'in_progress');
  goals.incrementCounter(p, 'monstersKilled', 100);
  check('status becomes completed when target met', goals.statusFor(goal, p) === 'completed');
  goals.markClaimed(goal, p);
  check('status becomes claimed after markClaimed', goals.statusFor(goal, p) === 'claimed');
}

// === canClaim ===
{
  const p = player();
  const goal = goals.getDefinition('combat_apprentice');
  const c1 = goals.canClaim(goal, p);
  check('canClaim rejects in-progress', !c1.ok && /Not yet/i.test(c1.error));
  goals.incrementCounter(p, 'monstersKilled', 100);
  const c2 = goals.canClaim(goal, p);
  check('canClaim ok when complete', c2.ok && c2.goal === goal);
  goals.markClaimed(goal, p);
  const c3 = goals.canClaim(goal, p);
  check('canClaim rejects already-claimed', !c3.ok && /Already claimed/i.test(c3.error));
  // Unknown goal
  const c4 = goals.canClaim(null, p);
  check('canClaim rejects null goal', !c4.ok);
}

// === markClaimed idempotent ===
{
  const p = player();
  const goal = goals.getDefinition('combat_apprentice');
  goals.markClaimed(goal, p);
  goals.markClaimed(goal, p);
  check('markClaimed is idempotent', p.goalsClaimed.length === 1);
}

// === listByCategory ===
{
  const combat = goals.listByCategory('combat');
  const economy = goals.listByCategory('economy');
  check('listByCategory combat returns combat goals only',
    combat.length > 0 && combat.every(g => g.category === 'combat'));
  check('listByCategory economy returns economy goals only',
    economy.length > 0 && economy.every(g => g.category === 'economy'));
  check('listByCategory unknown returns empty',
    goals.listByCategory('bogus').length === 0);
}

// === Server-side wiring checks ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('goals module imported', /require\('\.\/world\/goals'\)/.test(src));
  check('goals.json loaded at startup',
    /goals\.loadDefinitions\(\)/.test(src) && /Loaded \$\{goalsLoad\.count\} goal definition/.test(src));
  check('handleGoals defined', /function handleGoals\s*\(/.test(src));
  check('goal/goals routed in command dispatcher',
    /command === 'goal' \|\| command === 'goals'/.test(src) && /handleGoals\(socket, player/.test(src));
  // Hot-point hooks
  check('goalOnMonsterKilled hooked into kill handler',
    /handleMonsterDeath[\s\S]+?goalOnMonsterKilled\(player, socket, monster\)/.test(src));
  check('goalOnDamageDealt hooked into per-hit damage',
    /stats\.totalDamageDealt \+= totalDamage[\s\S]{0,200}goalOnDamageDealt/.test(src));
  check('goalOnRoomEntered hooked into handleMove',
    /player\.currentRoom = newRoomId[\s\S]{0,400}goalOnRoomEntered/.test(src));
  check('goalOnLevelChanged hooked into checkLevelUp',
    /Auto-save on level up[\s\S]+?goalOnLevelChanged/.test(src));
  check('goalOnAuctionSold hooked into settleAuction',
    /Auction \$\{auction\.id\}: \$\{auction\.seller\} sold[\s\S]{0,200}goalOnAuctionSold/.test(src));
  check('goalOnPvpKill hooked into PVP victory',
    /winner\.stats\.pvpKills\+\+[\s\S]{0,100}goalOnPvpKill\(winner/.test(src));
  check('goalOnRemort hooked into remort confirm',
    /player\.remortTier \+= 1[\s\S]{0,400}goalOnRemort\(player/.test(src));
  // Save/load integration
  check('savePlayer persists goalProgress + goalsClaimed',
    /goalProgress: \(player\.goalProgress[\s\S]+?goalsClaimed: Array\.isArray\(player\.goalsClaimed\)/.test(src));
  check('loadPlayer hydrates goalProgress + goalsClaimed',
    /goalProgress: \(data\.goalProgress[\s\S]+?goalsClaimed: Array\.isArray\(data\.goalsClaimed\)/.test(src));
  check('createPlayer initializes goal fields',
    /goalProgress: \{\},[\s\S]{0,40}goalsClaimed: \[\]/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
