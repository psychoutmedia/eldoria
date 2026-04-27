// Tier 6.1 Sync-State Architecture — unit verification.
const sync = require('./world/sync_state');
const fs = require('fs');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === Constants ===
{
  check('SCHEMA_VERSION === 6', sync.SCHEMA_VERSION === 6);
  check('PERSONA_FIELDS includes currentRoom and HP', sync.PERSONA_FIELDS.includes('currentRoom') && sync.PERSONA_FIELDS.includes('currentHP'));
  check('LOGIC_EXTRAS has coherence', sync.LOGIC_EXTRAS.coherence === 100);
  check('LIFE_EXTRAS has credits', sync.LIFE_EXTRAS.credits === 0);
}

// Helper to build a legacy (pre-Tier-6) player object.
function legacyPlayer() {
  return {
    name: 'Test',
    currentRoom: 'room_001',
    currentHP: 50, maxHP: 50,
    currentMana: 15, maxMana: 15,
    inventory: [{ id: 'rusty_dagger', name: 'Rusty Dagger' }],
    equipped: { weapon: { id: 'torch' }, armor: null, shield: null, head: null, neck: null, hands: null, feet: null, finger: null },
    gold: 100,
    effects: { foo: { expiresAt: 999 } },
    affects: [{ key: 'blessed', expiresAt: 999, potency: 1 }],
    spellCooldowns: { fireball: 12345 },
    inCombat: false
  };
}

// === Migration: legacy → personas ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  check('migrate sets schemaVersion=6', p.schemaVersion === 6);
  check('migrate creates personas object', !!p.personas);
  check('migrate creates life persona block', !!p.personas.life);
  check('migrate creates logic persona block', !!p.personas.logic);
  check('migrate sets activePersona=life', p.activePersona === 'life');
  check('migrate creates pocketArtifacts array', Array.isArray(p.pocketArtifacts));
  check('migrate creates subliminalBuffs object', p.subliminalBuffs && p.subliminalBuffs.fromLogic && p.subliminalBuffs.fromLife);
  check('migrate hybrid is null', p.personas.hybrid === null);
  // Citizen block should mirror the legacy fields
  check('Citizen block has legacy currentRoom', p.personas.life.currentRoom === 'room_001');
  check('Citizen block has legacy gold', p.personas.life.gold === 100);
  check('Citizen block inventory is a copy', p.personas.life.inventory.length === 1 && p.personas.life.inventory !== p.inventory);
  // Logician is empty (no inventory, no equipped, fresh extras)
  check('Logician block has empty inventory', Array.isArray(p.personas.logic.inventory) && p.personas.logic.inventory.length === 0);
  check('Logician block has zero gold', p.personas.logic.gold === 0);
  check('Logician block has coherence=100', p.personas.logic.coherence === 100);
  check('Citizen block has lifeAnchorRoom field', 'lifeAnchorRoom' in p.personas.life);
}

// === Migration: idempotent ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  const personasRef = p.personas;
  const lifeBlockRef = p.personas.life;
  sync.migrateLegacySave(p);   // call twice
  check('migrate is idempotent (same personas object)', p.personas === personasRef);
  check('migrate is idempotent (same life block)', p.personas.life === lifeBlockRef);
}

// === Snapshot independence ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  // Mutate live inventory after migration; Citizen snapshot should not change
  p.inventory.push({ id: 'new_item', name: 'New Item' });
  check('Citizen snapshot is shallow-independent of live inventory',
    p.personas.life.inventory.length === 1);
}

// === blankEquipped shape ===
{
  const eq = sync.blankEquipped();
  const slots = ['weapon', 'armor', 'shield', 'head', 'neck', 'hands', 'feet', 'finger'];
  check('blankEquipped has all 8 slots', slots.every(s => s in eq && eq[s] === null));
}

// === getActivePersona / getPersonaBlock ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  check('getActivePersona defaults to life', sync.getActivePersona(p) === 'life');
  check('getPersonaBlock(life) returns life block', sync.getPersonaBlock(p, 'life') === p.personas.life);
  check('getPersonaBlock(logic) returns logic block', sync.getPersonaBlock(p, 'logic') === p.personas.logic);
  check('getPersonaBlock(hybrid) returns null', sync.getPersonaBlock(p, 'hybrid') === null);
  // No personas case
  check('getActivePersona on null player returns life default', sync.getActivePersona(null) === 'life');
}

// === Swap: validation ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  // Combat blocks swap
  p.inCombat = true;
  const combatBlock = sync.swapPersona(p);
  check('swap rejected during combat', !combatBlock.ok && /combat/i.test(combatBlock.error));
  p.inCombat = false;
  // Same target rejected
  const same = sync.swapPersona(p, { target: 'life' });
  check('swap rejected if target === current', !same.ok && /Already in/i.test(same.error));
  // Missing persona rejected
  p.personas.hybrid = null;
  const noHybrid = sync.swapPersona(p, { target: 'hybrid' });
  check('swap rejected if target persona is null', !noHybrid.ok && /No hybrid/i.test(noHybrid.error));
}

// === Swap: actual mechanic ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  // Pre-set Logician's room/inventory to distinguish
  p.personas.logic.currentRoom = 'room_311';
  p.personas.logic.inventory = [{ id: 'logic_only_item', name: 'Refinement Tool' }];
  p.personas.logic.gold = 0;
  const r = sync.swapPersona(p);
  check('swap returns ok', r.ok && r.from === 'life' && r.to === 'logic');
  check('swap updates activePersona', p.activePersona === 'logic');
  // Live fields now reflect Logician
  check('swap copied Logician currentRoom into live', p.currentRoom === 'room_311');
  check('swap copied Logician inventory into live', p.inventory.length === 1 && p.inventory[0].id === 'logic_only_item');
  check('swap copied Logician gold into live (0)', p.gold === 0);
  // Citizen block still holds the original
  check('Citizen block preserved across swap', p.personas.life.gold === 100 && p.personas.life.inventory[0].id === 'rusty_dagger');
  // Swap back
  const r2 = sync.swapPersona(p);
  check('swap back returns ok', r2.ok && r2.from === 'logic' && r2.to === 'life');
  check('swap back restored Citizen state', p.gold === 100 && p.inventory[0].id === 'rusty_dagger');
}

// === Multiple swaps preserve state — round-trip stress ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  p.personas.logic.currentRoom = 'room_311';
  for (let i = 0; i < 50; i++) {
    sync.swapPersona(p);
    sync.swapPersona(p);
  }
  check('100-swap round-trip: Citizen gold intact', p.gold === 100);
  check('100-swap round-trip: live inventory matches Citizen', p.inventory.length === 1 && p.inventory[0].id === 'rusty_dagger');
  check('100-swap round-trip: still active=life', sync.getActivePersona(p) === 'life');
}

// === syncLiveToActivePersona ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  p.gold = 250;  // mutate live without going through swap
  sync.syncLiveToActivePersona(p);
  check('syncLiveToActivePersona mirrors live gold to Citizen block', p.personas.life.gold === 250);
  // Mutate live again then swap; Citizen should hold the latest live state
  p.currentHP = 17;
  sync.syncLiveToActivePersona(p);
  check('syncLiveToActivePersona mirrors HP', p.personas.life.currentHP === 17);
}

// === ejectToLifeState ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  // Set up Logician active
  sync.swapPersona(p);
  p.inCombat = true;
  p.combatTarget = 'someMonsterId';
  const r = sync.ejectToLifeState(p);
  check('eject returns ok', r.ok && r.to === 'life' && r.hangover === true);
  check('eject clears combat state', !p.inCombat && p.combatTarget === null);
  check('eject applies neural_hangover effect', p.effects && p.effects.neural_hangover && p.effects.neural_hangover.severity > 0);
  // Eject from Citizen rejected
  const r2 = sync.ejectToLifeState(p);
  check('eject rejected when already in Citizen state', !r2.ok && /Not in Logic/i.test(r2.error));
}

// === recoverFromCrashIfNeeded ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  p.personas.life.lifeAnchorRoom = 'room_335';
  // Pretend the player was on Logician shift when the server died
  sync.swapPersona(p);
  p.inCombat = false;  // crash happened outside combat
  // Apply recovery
  const recovered = sync.recoverFromCrashIfNeeded(p);
  check('recoverFromCrashIfNeeded reports true', recovered === true);
  check('recoverFromCrashIfNeeded snaps to lifeAnchorRoom', p.currentRoom === 'room_335');
  check('recoverFromCrashIfNeeded sets neural_hangover', !!p.effects.neural_hangover);
  check('recoverFromCrashIfNeeded sets active=life', sync.getActivePersona(p) === 'life');
  // No-op when already in Citizen
  const r2 = sync.recoverFromCrashIfNeeded(p);
  check('recoverFromCrashIfNeeded no-op when in Citizen', r2 === false);
}

// === Pocket artifacts queue ===
{
  const p = legacyPlayer();
  sync.migrateLegacySave(p);
  sync.pushPocketArtifact(p, 'item_1');
  sync.pushPocketArtifact(p, 'item_2');
  sync.pushPocketArtifact(p, 'item_3');
  sync.pushPocketArtifact(p, 'item_4');
  check('pushPocketArtifact appends', p.pocketArtifacts.length === 4);
  const drained = sync.drainPocketArtifacts(p, 2);
  check('drainPocketArtifacts returns first 2', drained.length === 2 && drained[0] === 'item_1');
  check('drainPocketArtifacts removes them from queue', p.pocketArtifacts.length === 2);
  check('drainPocketArtifacts default max=3 returns all remaining', sync.drainPocketArtifacts(p).length === 2);
  // Cap at 50
  for (let i = 0; i < 60; i++) sync.pushPocketArtifact(p, 'i' + i);
  check('pocketArtifacts capped at 50', p.pocketArtifacts.length === 50);
}

// === isSyncTerminal ===
{
  check('isSyncTerminal true for flagged room', sync.isSyncTerminal({ isSyncTerminal: true }));
  check('isSyncTerminal false for plain room', !sync.isSyncTerminal({ name: 'X' }));
  check('isSyncTerminal false for null', !sync.isSyncTerminal(null));
}

// === Server-side wiring checks ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('syncState module imported', /require\('\.\/world\/sync_state'\)/.test(src));
  check('createPlayer calls initializePersonas', /syncState\.initializePersonas\(_p\)/.test(src));
  check('loadPlayer calls migrateLegacySave', /syncState\.migrateLegacySave\(player\)/.test(src));
  check('loadPlayer calls recoverFromCrashIfNeeded', /syncState\.recoverFromCrashIfNeeded\(player\)/.test(src));
  check('savePlayer calls syncLiveToActivePersona', /syncState\.syncLiveToActivePersona\(player\)/.test(src));
  check('savePlayer persists personas field', /personas: player\.personas/.test(src));
  check('savePlayer persists schemaVersion', /schemaVersion: player\.schemaVersion/.test(src));
  check('handleSwap defined', /function handleSwap\s*\(socket, player\)/.test(src));
  check('swap routed in dispatcher', /command === 'swap'[\s\S]{0,80}handleSwap\(socket, player\)/.test(src));
  check('REALM_GATES has room_301 entry', /room_301:[\s\S]{0,200}requiresQuest: 'paging_oncall'/.test(src));
  check('isRealmGateOpen honors requiresQuest', /isRealmGateOpen[\s\S]{0,400}requiresQuest[\s\S]{0,200}questManager\.listCompleted/.test(src));
  check('handleSwap requires sync terminal room', /handleSwap[\s\S]{0,400}isSyncTerminal/.test(src));
  check('handleSwap blocks if first_swap quest not complete', /handleSwap[\s\S]{0,1500}first_swap/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
