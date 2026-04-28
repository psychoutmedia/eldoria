// Tier 6.6 Macrodata Vault - unit verification.
const vault = require('./world/vault');
const fs = require('fs');
const rooms = require('./rooms.json');
const monsters = require('./monsters.json');
const items = require('./items.json');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === Constants ===
{
  check('ENTRY_ROOM_ID is room_351', vault.ENTRY_ROOM_ID === 'room_351');
  check('BOSS_ROOM_ID is room_353', vault.BOSS_ROOM_ID === 'room_353');
  check('RECARREL_ROOM_ID is room_354', vault.RECARREL_ROOM_ID === 'room_354');
  check('FOUNDER_TEMPLATE is the_founders_echo', vault.FOUNDER_TEMPLATE === 'the_founders_echo');
  check('ENTRY_GATE.lifetimeBatchesRequired = 30', vault.ENTRY_GATE.lifetimeBatchesRequired === 30);
  check('ENTRY_GATE.requireLogicState = true', vault.ENTRY_GATE.requireLogicState === true);
  check('CLEAR_REWARD.suffix is "the Severed"', vault.CLEAR_REWARD.suffix === 'the Severed');
  check('CLEAR_REWARD.coherenceBonus = 20', vault.CLEAR_REWARD.coherenceBonus === 20);
  check('CLEAR_REWARD.xp = 5000', vault.CLEAR_REWARD.xp === 5000);
  check('CLEAR_REWARD.goldToCitizen = 2000', vault.CLEAR_REWARD.goldToCitizen === 2000);
  check('CLEAR_REWARD.itemId = vault_cipher', vault.CLEAR_REWARD.itemId === 'vault_cipher');
  check('FOUNDER_PHASES.phase2HpFraction = 0.5', vault.FOUNDER_PHASES.phase2HpFraction === 0.5);
  check('FOUNDER_PHASES.phase2CoherenceMult = 1.5', vault.FOUNDER_PHASES.phase2CoherenceMult === 1.5);
}

// === canEnterVault ===
{
  // No personas
  const r0 = vault.canEnterVault({}, { isLogicNow: true });
  check('canEnterVault rejects player with no Logician', !r0.ok && /Logician persona/.test(r0.error));

  // Citizen (active persona = life)
  const player = { personas: { life: {}, logic: { lifetimeBatches: 100 } } };
  const r1 = vault.canEnterVault(player, { isLogicNow: false });
  check('canEnterVault rejects when not in Logic-State', !r1.ok && /reader plate is dark/.test(r1.error));

  // Logician but under-batched
  const r2 = vault.canEnterVault(
    { personas: { life: {}, logic: { lifetimeBatches: 5 } } },
    { isLogicNow: true }
  );
  check('canEnterVault rejects under-batched Logician',
    !r2.ok && /throughput is insufficient/.test(r2.error));

  // Edge: exactly 29
  const r2b = vault.canEnterVault(
    { personas: { life: {}, logic: { lifetimeBatches: 29 } } },
    { isLogicNow: true }
  );
  check('canEnterVault still rejects at 29 batches', !r2b.ok);

  // Just enough
  const r3 = vault.canEnterVault(
    { personas: { life: {}, logic: { lifetimeBatches: 30 } } },
    { isLogicNow: true }
  );
  check('canEnterVault accepts at exactly 30 batches', r3.ok === true);

  // Over the line
  const r4 = vault.canEnterVault(
    { personas: { life: {}, logic: { lifetimeBatches: 100 } } },
    { isLogicNow: true }
  );
  check('canEnterVault accepts well over the gate', r4.ok === true);

  // Null player
  const r5 = vault.canEnterVault(null, { isLogicNow: true });
  check('canEnterVault on null player rejects', !r5.ok);
}

// === applyVaultClearReward ===
{
  const player = {
    suffix: null,
    experience: 100,
    personas: {
      life: { gold: 0 },
      logic: { coherence: 50, maxCoherence: 100, lifetimeBatches: 30 }
    }
  };
  const r = vault.applyVaultClearReward(player);
  check('applyVaultClearReward applies first time', r.applied === true);
  check('reward set vaultCleared = true', player.vaultCleared === true);
  check('reward set suffix = "the Severed"', player.suffix === 'the Severed');
  check('reward bumped maxCoherence by 20', player.personas.logic.maxCoherence === 120);
  check('reward topped current coherence to new max', player.personas.logic.coherence === 120);
  check('reward.details has suffixApplied=true', r.details.suffixApplied === true);

  // Idempotent: second call is a no-op
  const r2 = vault.applyVaultClearReward(player);
  check('second applyVaultClearReward is no-op', r2.applied === false && r2.alreadyCleared === true);
  check('second call does not double-bump maxCoherence', player.personas.logic.maxCoherence === 120);

  // Suffix-already-set: do not overwrite
  const player2 = {
    suffix: 'the Harmonist',
    personas: { life: {}, logic: { coherence: 50, maxCoherence: 100 } }
  };
  const r3 = vault.applyVaultClearReward(player2);
  check('reward does NOT overwrite an existing suffix', player2.suffix === 'the Harmonist');
  check('reward still applied (vaultCleared) when suffix preserved', player2.vaultCleared === true);
  check('reward.details.suffixApplied=false when suffix preserved',
    r3.details && r3.details.suffixApplied === false);

  // No personas: graceful
  const r4 = vault.applyVaultClearReward({});
  check('applyVaultClearReward on empty player returns applied=false', !r4.applied);
}

// === shouldTriggerPhase2 / founderCoherenceMult ===
{
  const fresh = { hp: 1000, maxHp: 1000, bossState: {} };
  check('shouldTriggerPhase2 false at full HP', !vault.shouldTriggerPhase2(fresh));

  const at60 = { hp: 600, maxHp: 1000, bossState: {} };
  check('shouldTriggerPhase2 false above 50%', !vault.shouldTriggerPhase2(at60));

  const at50 = { hp: 500, maxHp: 1000, bossState: {} };
  check('shouldTriggerPhase2 true at exactly 50%', vault.shouldTriggerPhase2(at50));

  const at40 = { hp: 400, maxHp: 1000, bossState: {} };
  check('shouldTriggerPhase2 true at 40%', vault.shouldTriggerPhase2(at40));

  const dead = { hp: 0, maxHp: 1000, bossState: {} };
  check('shouldTriggerPhase2 false at hp=0', !vault.shouldTriggerPhase2(dead));

  const already = { hp: 400, maxHp: 1000, bossState: { phase2: true } };
  check('shouldTriggerPhase2 false once already triggered', !vault.shouldTriggerPhase2(already));

  // founderCoherenceMult mirrors bossState.phase2
  check('founderCoherenceMult = 1.0 by default',
    vault.founderCoherenceMult({ bossState: {} }) === 1.0);
  check('founderCoherenceMult = 1.5 in phase 2',
    vault.founderCoherenceMult({ bossState: { phase2: true } }) === 1.5);
  check('founderCoherenceMult handles null',
    vault.founderCoherenceMult(null) === 1.0);
}

// === World content ===
{
  check('rooms.json has room_351 (Vault Threshold)',
    rooms.room_351 && /Vault Threshold/.test(rooms.room_351.name));
  check('rooms.json has room_352 (Cold Storage Aisle)',
    rooms.room_352 && /Cold Storage Aisle/.test(rooms.room_352.name));
  check('rooms.json has room_353 (Founder\'s Cubicle)',
    rooms.room_353 && /Founder/.test(rooms.room_353.name));
  check('rooms.json has room_354 (Reading Carrel)',
    rooms.room_354 && /Reading Carrel/.test(rooms.room_354.name));
  check('room_351 is flagged isVaultEntry',
    rooms.room_351.isVaultEntry === true);
  check('room_351 is flagged isLogicState',
    rooms.room_351.isLogicState === true);
  check('room_322 east exit -> room_351',
    rooms.room_322 && rooms.room_322.exits && rooms.room_322.exits.east === 'room_351');
  check('room_352 east exit -> room_354 (reading carrel side door)',
    rooms.room_352.exits.east === 'room_354');

  // Boss
  check('monsters.json bosses includes the_founders_echo',
    !!(monsters.bosses && monsters.bosses.the_founders_echo));
  const fb = monsters.bosses && monsters.bosses.the_founders_echo;
  check('the_founders_echo combatType = coherence',
    fb && fb.combatType === 'coherence');
  check('the_founders_echo fixedRoom = room_353',
    fb && fb.fixedRoom === 'room_353');
  check('the_founders_echo level >= 35',
    fb && fb.level >= 35);

  // Items
  check('items.json treasure includes vault_cipher',
    items.treasure && items.treasure.vault_cipher);
  check('items.json treasure includes personal_file',
    items.treasure && items.treasure.personal_file);
}

// === Server-side wiring greps ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('vault module imported', /require\('\.\/world\/vault'\)/.test(src));

  // Movement guard
  check('handleMove honours isVaultEntry guard',
    /isVaultEntry[\s\S]{0,400}vault\.canEnterVault\(player/.test(src));

  // Boss signature
  check('BOSS_SIGNATURES has the_founders_echo entry',
    /the_founders_echo: \{[\s\S]{0,300}onPlayerHit:/.test(src));
  check('Founder phase-2 trigger uses vault.shouldTriggerPhase2',
    /vault\.shouldTriggerPhase2\(monster\)/.test(src));
  check('Founder phase-2 trigger sets bossState.phase2',
    /monster\.bossState\.phase2 = true/.test(src));

  // Coherence damage path applies founder multiplier
  check('coherence damage path applies founderCoherenceMult',
    /vault\.founderCoherenceMult\(monster\)/.test(src));
  check('founder multiplier multiplies totalDamage',
    /Math\.floor\(totalDamage \* founderMult\)/.test(src));

  // Defeat hook
  check('Founder defeat hook applies vaultClearReward',
    /the_founders_echo[\s\S]{0,400}vault\.applyVaultClearReward\(player\)/.test(src));
  check('Founder defeat awards bonus XP from CLEAR_REWARD',
    /vault\.CLEAR_REWARD\.xp/.test(src));
  check('Founder defeat credits Citizen with goldToCitizen',
    /personas\.life\.gold[\s\S]{0,200}vault\.CLEAR_REWARD\.goldToCitizen/.test(src));
  check('Founder defeat drops vault_cipher into inventory',
    /createItem\(vault\.CLEAR_REWARD\.itemId\)/.test(src));
  check('Founder defeat saves player after reward',
    /the_founders_echo[\s\S]{0,2500}savePlayer\(player, socket, true\)/.test(src));
  check('Founder defeat narrates Severed title when applied',
    /Severed[\s\S]{0,400}suffixApplied/.test(src) || /suffixApplied[\s\S]{0,400}player\.suffix/.test(src));
  check('Founder re-kill (alreadyCleared) is graceful no-op narration',
    /alreadyCleared[\s\S]{0,200}second time/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
