// Tier 6.3 Echoes + Township — unit verification.
const echoes = require('./world/echoes');
const fs = require('fs');
const path = require('path');
const rooms = require('./rooms.json');
const monsters = require('./monsters.json');
const items = require('./items.json');
const quests = require('./quests.json');
const npcTemplates = require('./npcs/templates.json');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === Constants ===
{
  check('TTL_MS is 24h', echoes.TTL_MS === 24 * 60 * 60 * 1000);
  check('MAX_PER_ROOM is 5', echoes.MAX_PER_ROOM === 5);
  check('MAX_PAYLOAD_LEN is 80', echoes.MAX_PAYLOAD_LEN === 80);
  check('VALID_KINDS has arrange and stack', echoes.VALID_KINDS.has('arrange') && echoes.VALID_KINDS.has('stack'));
}

// === emptyState / addSign / listForRoom ===
{
  const s = echoes.emptyState();
  check('emptyState has signs array', Array.isArray(s.signs));
  const r = echoes.addSign(s, 'room_337', 'Alice', 'arrange', 'pebbles in a spiral');
  check('addSign returns ok', r.ok && r.sign.kind === 'arrange');
  check('addSign appends to signs', s.signs.length === 1);
  check('addSign sets createdAt and expiresAt', r.sign.createdAt && r.sign.expiresAt && (r.sign.expiresAt - r.sign.createdAt) === echoes.TTL_MS);
  // Pass explicit timestamps so the newest-first sort is deterministic
  // even when Date.now() returns the same value across rapid calls.
  const t0 = 2_000_000_000;
  s.signs.length = 0;
  echoes.addSign(s, 'room_337', 'Alice', 'arrange', 'pebbles in a spiral', t0);
  echoes.addSign(s, 'room_337', 'Bob',   'stack',   'three smooth stones', t0 + 100);
  echoes.addSign(s, 'room_338', 'Carol', 'arrange', 'leaves',              t0 + 200);
  const list = echoes.listForRoom(s, 'room_337', t0 + 300);
  check('listForRoom returns only that room', list.length === 2 && list.every(x => x.roomId === 'room_337'));
  check('listForRoom sorts newest first', list[0].leftBy === 'Bob' && list[1].leftBy === 'Alice');
}

// === Validation ===
{
  const v1 = echoes.validatePayload('');
  check('validatePayload rejects empty', !v1.ok);
  const v2 = echoes.validatePayload('   ');
  check('validatePayload rejects whitespace-only', !v2.ok);
  const v3 = echoes.validatePayload('x'.repeat(echoes.MAX_PAYLOAD_LEN + 1));
  check('validatePayload rejects oversize', !v3.ok);
  // Anti-dialogue rule
  const v4 = echoes.validatePayload('"hello there"');
  check('validatePayload rejects double-quote dialogue', !v4.ok);
  const v5 = echoes.validatePayload("say something");
  check('validatePayload rejects "say"', !v5.ok);
  const v6 = echoes.validatePayload("tell them later");
  check('validatePayload rejects "tell"', !v6.ok);
  const v7 = echoes.validatePayload('three smooth stones');
  check('validatePayload accepts plain text', v7.ok && v7.value === 'three smooth stones');
}

// === addSign rejection paths ===
{
  const s = echoes.emptyState();
  check('addSign rejects bad kind', !echoes.addSign(s, 'room_1', 'X', 'spit', 'foo').ok);
  check('addSign rejects empty room', !echoes.addSign(s, '', 'X', 'arrange', 'foo').ok);
  check('addSign rejects empty author', !echoes.addSign(s, 'room_1', '', 'arrange', 'foo').ok);
  check('addSign rejects empty payload', !echoes.addSign(s, 'room_1', 'X', 'arrange', '').ok);
}

// === MAX_PER_ROOM cap ===
{
  const s = echoes.emptyState();
  for (let i = 0; i < echoes.MAX_PER_ROOM + 3; i++) {
    echoes.addSign(s, 'room_X', 'A' + i, 'arrange', 'item ' + i, Date.now() + i);
  }
  const list = echoes.listForRoom(s, 'room_X');
  check('addSign caps per-room at MAX_PER_ROOM', list.length === echoes.MAX_PER_ROOM);
  // Oldest dropped
  check('addSign drops oldest when at cap', !list.some(x => x.leftBy === 'A0'));
}

// === pruneExpired ===
{
  const now = 1_000_000_000;
  const s = echoes.emptyState();
  echoes.addSign(s, 'room_1', 'A', 'arrange', 'fresh', now);
  // Manually add an expired one
  s.signs.push({ roomId: 'room_1', leftBy: 'B', kind: 'stack', text: 'old', createdAt: 0, expiresAt: now - 1 });
  const dropped = echoes.pruneExpired(s, now);
  check('pruneExpired drops past-expiry signs', dropped === 1 && s.signs.length === 1);
  check('pruneExpired keeps live signs', s.signs[0].leftBy === 'A');
}

// === removeSignsBy ===
{
  const s = echoes.emptyState();
  echoes.addSign(s, 'r1', 'Alice', 'arrange', 'x');
  echoes.addSign(s, 'r2', 'BOB', 'stack', 'y');
  echoes.addSign(s, 'r3', 'alice', 'arrange', 'z');
  const removed = echoes.removeSignsBy(s, 'Alice');
  check('removeSignsBy is case-insensitive', removed === 2 && s.signs.length === 1);
  check('removeSignsBy preserves other authors', s.signs[0].leftBy === 'BOB');
}

// === Persistence round-trip ===
{
  const tmp = path.join(__dirname, '_test_echoes_tmp.json');
  const tmpBak = tmp + '.bak';
  try { fs.unlinkSync(tmp); } catch (e) {}
  // loadState on missing file
  const fresh = echoes.loadState(tmp);
  check('loadState empty when file missing', fresh.signs.length === 0);
  // Save + reload
  const s = echoes.emptyState();
  echoes.addSign(s, 'room_337', 'Alice', 'arrange', 'spiral');
  const sr = echoes.saveState(s, tmp);
  check('saveState ok', sr.ok && fs.existsSync(tmp));
  const loaded = echoes.loadState(tmp);
  check('loadState round-trips signs', loaded.signs.length === 1 && loaded.signs[0].leftBy === 'Alice');
  // Garbage file
  fs.writeFileSync(tmp, '{not json', 'utf8');
  const garbage = echoes.loadState(tmp);
  check('loadState resilient to garbage file', garbage.signs.length === 0);
  // Cleanup
  try { fs.unlinkSync(tmp); } catch (e) {}
  try { fs.unlinkSync(tmpBak); } catch (e) {}
}

// === formatRemaining ===
{
  check('formatRemaining minutes', /^\d+m$/.test(echoes.formatRemaining(30 * 60 * 1000)));
  check('formatRemaining hours', /^\d+h$/.test(echoes.formatRemaining(5 * 60 * 60 * 1000)));
  check('formatRemaining days', /^\d+d$/.test(echoes.formatRemaining(2 * 24 * 60 * 60 * 1000)));
  check('formatRemaining expired', echoes.formatRemaining(0) === 'expired');
}

// === Rooms 331-350 present + flagged ===
{
  for (let i = 331; i <= 350; i++) {
    const id = 'room_' + i;
    if (!rooms[id]) check(`${id} exists`, false);
  }
  check('all 20 Township rooms exist', Array.from({length: 20}, (_, i) => rooms['room_' + (331 + i)]).every(Boolean));
  check('room_331 isLifeState', rooms.room_331.isLifeState === true);
  check('room_350 isLifeState (Edge of Town)', rooms.room_350.isLifeState === true);
  check('room_308 north opens to room_331', rooms.room_308.exits.north === 'room_331');
  check('room_337 (Town Green) is the central plaza',
    /Central Plaza/.test(rooms.room_337.name) && rooms.room_337.exits.north === 'room_338');
  check('room_343 (booths) leads to room_344 (kitchen)', rooms.room_343.exits.north === 'room_344');
}

// === 6 ambient monster templates with correct structure ===
{
  const expected = ['hollow_neighbor','townie_drunk','town_dog_wrong','manager_off_duty','wellness_counselor','goat_disquiet'];
  for (const id of expected) {
    const t = monsters.templates[id];
    check(`monster template ${id} exists`, !!t);
    if (t) check(`${id} has no combatType (physical)`, !t.combatType);
  }
  check('zone "Theta Township" present', !!monsters.zones['Theta Township']);
  check('zone "Wax Lily Tavern" present', !!monsters.zones['Wax Lily Tavern']);
  check('zone "Dormitory Block" present', !!monsters.zones['Dormitory Block']);
  check('zone "Town Green" includes goat_disquiet', monsters.zones['Town Green'].monsters.includes('goat_disquiet'));
}

// === Items + quests + NPCs ===
{
  check('townhouse_key item exists', !!items.treasure.townhouse_key);
  check('pocket_finger_trap item exists', !!items.treasure.pocket_finger_trap);
  check('townhouse_assignment quest exists', !!quests.townhouse_assignment);
  check('the_local_who_drinks_alone quest exists', !!quests.the_local_who_drinks_alone);
  check('townhouse_assignment rewards include townhouse_key',
    quests.townhouse_assignment.rewards.items.includes('townhouse_key'));
  check('barkeep_oslo NPC template exists', !!npcTemplates.barkeep_oslo);
  check('donovan_life NPC template exists', !!npcTemplates.donovan_life);
  check('barkeep_oslo offers the_local_who_drinks_alone',
    Array.isArray(npcTemplates.barkeep_oslo.questsOffered) && npcTemplates.barkeep_oslo.questsOffered.includes('the_local_who_drinks_alone'));
  check('barkeep_oslo brain.json file exists', fs.existsSync(path.join(__dirname, 'npcs', 'brains', 'barkeep_oslo.json')));
  check('donovan_life brain.json file exists', fs.existsSync(path.join(__dirname, 'npcs', 'brains', 'donovan_life.json')));
}

// === Server-side wiring greps ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('echoes module imported', /require\('\.\/world\/echoes'\)/.test(src));
  check('echoesState declared and initialised at startup',
    /let echoesState = echoesModule\.emptyState\(\)/.test(src) && /echoesState = echoesModule\.loadState\(\)/.test(src));
  check('persistEchoes helper defined', /function persistEchoes\s*\(\)/.test(src));
  check('handleEcho function defined', /function handleEcho\(kind, socket, player, args\)/.test(src));
  check('renderEchoesForRoom function defined', /function renderEchoesForRoom\(socket, roomId\)/.test(src));
  check('showRoom calls renderEchoesForRoom',
    /showRoom[\s\S]{0,8000}renderEchoesForRoom\(socket, player\.currentRoom\)/.test(src));
  check('arrange verb routed in dispatcher',
    /command === 'arrange'[\s\S]{0,300}handleEcho\('arrange'/.test(src));
  check('stack verb routed in dispatcher',
    /command === 'stack'[\s\S]{0,300}handleEcho\('stack'/.test(src));
  check('handleSwap surfaces pocket artifacts on swap',
    /handleSwap[\s\S]{0,5000}drainPocketArtifacts\(player, 3\)/.test(src));
  check('handleSwap accrues credits when leaving Logician',
    /handleSwap[\s\S]{0,3000}wasLogic && r\.to === 'life'[\s\S]{0,200}credits = \(player\.personas\.life\.credits/.test(src));
  check('handleSwap stamps shiftStartedAt when entering Logician',
    /r\.to === 'logic'[\s\S]{0,200}shiftStartedAt = Date\.now\(\)/.test(src));
}

// === Summary ===
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
