// Tier 6.5 Muscle Memory - unit verification.
const mm = require('./world/muscle_memory');
const fs = require('fs');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === Constants / definitions ===
{
  check('MEMORY_DEFS has 4 entries', Object.keys(mm.MEMORY_DEFS).length === 4);
  check('MEMORY_DEFS.refinement_reflex earns every 3 batches',
    mm.MEMORY_DEFS.refinement_reflex && mm.MEMORY_DEFS.refinement_reflex.earnEvery === 3);
  check('MEMORY_DEFS.quota_grit earns every 5 batches',
    mm.MEMORY_DEFS.quota_grit.earnEvery === 5);
  check('MEMORY_DEFS.console_calm earns every 8 batches and heals 50',
    mm.MEMORY_DEFS.console_calm.earnEvery === 8
    && mm.MEMORY_DEFS.console_calm.instantHeal === 50);
  check('MEMORY_DEFS.floor_finesse earns every 12 batches',
    mm.MEMORY_DEFS.floor_finesse.earnEvery === 12);
  check('refinement_reflex effectKey is muscle_refinement_reflex',
    mm.MEMORY_DEFS.refinement_reflex.effectKey === 'muscle_refinement_reflex');
  check('console_calm effectKey is null (instant)',
    mm.MEMORY_DEFS.console_calm.effectKey === null);
}

// === chargesForShift ===
{
  const r0 = mm.chargesForShift(0);
  check('chargesForShift(0) gives all zeros',
    r0.refinement_reflex === 0 && r0.quota_grit === 0
    && r0.console_calm === 0 && r0.floor_finesse === 0);

  const r3 = mm.chargesForShift(3);
  check('chargesForShift(3) gives 1 reflex, 0 grit/calm/finesse',
    r3.refinement_reflex === 1 && r3.quota_grit === 0
    && r3.console_calm === 0 && r3.floor_finesse === 0);

  const r5 = mm.chargesForShift(5);
  check('chargesForShift(5) gives 1 reflex, 1 grit',
    r5.refinement_reflex === 1 && r5.quota_grit === 1);

  const r12 = mm.chargesForShift(12);
  check('chargesForShift(12) gives 4 reflex, 2 grit, 1 calm, 1 finesse',
    r12.refinement_reflex === 4 && r12.quota_grit === 2
    && r12.console_calm === 1 && r12.floor_finesse === 1);

  const rNaN = mm.chargesForShift(NaN);
  check('chargesForShift(NaN) treats as 0',
    rNaN.refinement_reflex === 0 && rNaN.quota_grit === 0);

  const rNeg = mm.chargesForShift(-5);
  check('chargesForShift(negative) treats as 0',
    rNeg.refinement_reflex === 0);
}

// === creditShiftMemories ===
{
  const player = { personas: { life: { muscleMemory: {} } } };
  const r = mm.creditShiftMemories(player, 5);
  check('creditShiftMemories applies', r.applied === true);
  check('creditShiftMemories anyEarned true at batches=5', r.anyEarned === true);
  check('creditShiftMemories writes to muscleMemory',
    player.personas.life.muscleMemory.refinement_reflex === 1
    && player.personas.life.muscleMemory.quota_grit === 1);

  // Stacks on subsequent calls
  mm.creditShiftMemories(player, 5);
  check('creditShiftMemories stacks across calls',
    player.personas.life.muscleMemory.refinement_reflex === 2
    && player.personas.life.muscleMemory.quota_grit === 2);

  // Below all thresholds
  const player2 = { personas: { life: { muscleMemory: {} } } };
  const r2 = mm.creditShiftMemories(player2, 2);
  check('creditShiftMemories at batches=2 anyEarned=false', r2.anyEarned === false);

  // No personas: graceful
  const r3 = mm.creditShiftMemories(null, 5);
  check('creditShiftMemories on null player returns applied=false', r3.applied === false);
  const r4 = mm.creditShiftMemories({}, 5);
  check('creditShiftMemories on player with no personas returns applied=false', r4.applied === false);
}

// === consumeMemory ===
{
  const player = { personas: { life: { muscleMemory: { refinement_reflex: 2, console_calm: 1 } } } };
  const r1 = mm.consumeMemory(player, 'refinement_reflex');
  check('consumeMemory returns ok+def', r1.ok && r1.def && r1.def.id === 'refinement_reflex');
  check('consumeMemory decrements charges', player.personas.life.muscleMemory.refinement_reflex === 1);
  check('consumeMemory reports remaining', r1.remaining === 1);

  // Drain to 0
  mm.consumeMemory(player, 'refinement_reflex');
  const r2 = mm.consumeMemory(player, 'refinement_reflex');
  check('consumeMemory rejects when 0 charges', !r2.ok && /no Refinement Reflex/i.test(r2.error));

  // Unknown id
  const r3 = mm.consumeMemory(player, 'fake_id');
  check('consumeMemory unknown id rejects', !r3.ok && /Unknown memory/i.test(r3.error));

  // No personas
  const r4 = mm.consumeMemory(null, 'console_calm');
  check('consumeMemory null player rejects', !r4.ok);
}

// === listMemories ===
{
  const player = { personas: { life: { muscleMemory: { quota_grit: 3 } } } };
  const list = mm.listMemories(player);
  check('listMemories returns 4 entries', list.length === 4);
  const grit = list.find(x => x.id === 'quota_grit');
  check('listMemories shows quota_grit charges=3', grit.charges === 3);
  const reflex = list.find(x => x.id === 'refinement_reflex');
  check('listMemories shows zero charges for unearned', reflex.charges === 0);
  check('listMemories carries description text', !!grit.description && grit.description.length > 0);
  check('listMemories carries earnEvery', grit.earnEvery === 5);

  // Empty player still gives a 4-entry list with all zeros
  const empty = mm.listMemories({});
  check('listMemories on empty player returns 4 zeroes',
    empty.length === 4 && empty.every(x => x.charges === 0));
}

// === resolveMemoryName ===
{
  check('resolveMemoryName exact id', mm.resolveMemoryName('refinement_reflex') === 'refinement_reflex');
  check('resolveMemoryName prefix match (qu)', mm.resolveMemoryName('qu') === 'quota_grit');
  check('resolveMemoryName prefix match (refi)', mm.resolveMemoryName('refi') === 'refinement_reflex');
  check('resolveMemoryName label-form (Console Calm)',
    mm.resolveMemoryName('Console Calm') === 'console_calm');
  check('resolveMemoryName empty returns null', mm.resolveMemoryName('') === null);
  check('resolveMemoryName non-string returns null', mm.resolveMemoryName(null) === null);
  check('resolveMemoryName unknown returns null', mm.resolveMemoryName('zzz') === null);
}

// === Server-side wiring greps ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('muscle_memory module imported', /require\('\.\/world\/muscle_memory'\)/.test(src));
  check('handleMemory function defined', /function handleMemory\(socket, player, args\)/.test(src));
  check('memory verb routed in dispatcher',
    /command === 'memory'[\s\S]{0,400}handleMemory\(/.test(src));
  check('memories alias also routed',
    /command === 'memories'[\s\S]{0,400}handleMemory\(/.test(src));
  check('handleSwap credits muscle memory on shift-end',
    /handleSwap[\s\S]{0,5000}batchesThisShift[\s\S]{0,200}creditShiftMemories\(player, batchesThisShift\)/.test(src));
  check('Coherence-eject path (combat) credits muscle memory',
    /batchesAtCollapse[\s\S]{0,500}creditShiftMemories\(player, batchesAtCollapse\)/.test(src));
  check('handleApplyVerb eject path also credits muscle memory',
    /handleApplyVerb[\s\S]{0,8000}batchesAtCollapse[\s\S]{0,500}creditShiftMemories/.test(src));
  check('playerAttackMonster consumes muscle_quota_grit',
    /muscle_quota_grit[\s\S]{0,200}delete player\.effects\.muscle_quota_grit/.test(src));
  check('quota_grit applies +25%',
    /muscle_quota_grit[\s\S]{0,200}totalDamage \* 1\.25/.test(src));
  check('monsterAttackPlayer consumes muscle_refinement_reflex',
    /muscle_refinement_reflex[\s\S]{0,200}delete player\.effects\.muscle_refinement_reflex/.test(src));
  check('refinement_reflex returns false (cancels attack)',
    /muscle_refinement_reflex[\s\S]{0,500}return false;/.test(src));
  check('flee paths consume muscle_floor_finesse',
    (src.match(/muscle_floor_finesse/g) || []).length >= 4); // both flee paths declare and clear
  check('floor_finesse forces flee success',
    /finesseFired \|\| Math\.random\(\) < getFleeChance/.test(src));
  check('handleMemory rejects refinement_reflex outside combat',
    /muscle_refinement_reflex[\s\S]{0,500}player\.inCombat[\s\S]{0,100}No incoming attack/.test(src));
  check('handleMemory rejects use from Logician',
    /Muscle memory belongs to the Citizen[\s\S]{0,200}Swap to Life-State first/.test(src));
  check('handleMemory applies instant heal for console_calm',
    /instantHeal[\s\S]{0,200}player\.currentHP = after/.test(src));
  check('handleMemory arms effects via effectKey',
    /effectKey[\s\S]{0,200}player\.effects\[def\.effectKey\] = \{ armed: true/.test(src));
  check('swap message announces muscle-memory credits',
    /\$\{def\.label\}[\s\S]{0,200}Muscle memory carries through/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
