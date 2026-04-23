// Spell & Combat Test Harness — expanded
// Usage: node test_spells.js
// Prereq: server running, Testmagea in admins.json (this test self-promotes it)

const net = require('net');

const HOST = process.env.TEST_HOST || '127.0.0.1';
const PORT = parseInt(process.env.TEST_PORT || '8888', 10);

function stripAnsi(s) { return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, ''); }
function stripTelnet(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0xFF && i + 2 < buf.length) { i += 2; continue; }
    out.push(buf[i]);
  }
  return Buffer.from(out);
}

class TelnetClient {
  constructor(name) { this.name = name; this.log = ''; this.socket = null; }
  connect() {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: HOST, port: PORT }, () => resolve());
      s.on('data', (chunk) => {
        const clean = stripAnsi(stripTelnet(chunk).toString('utf8'));
        this.log += clean;
      });
      s.on('error', reject);
      s.on('end', () => { this.log += '\n<DISCONNECTED>\n'; });
      this.socket = s;
    });
  }
  send(line) {
    this.log += `\n>>> [${this.name}] ${line}\n`;
    this.socket.write(line + '\r\n');
  }
  close() { try { this.socket.end(); } catch (_) {} }
  clear() { this.log = ''; }
  tail(n = 6000) { return this.log.slice(-n); }
  async waitFor(pattern, timeoutMs = 3000) {
    const start = Date.now();
    const rx = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
    return new Promise((resolve) => {
      const iv = setInterval(() => {
        if (rx.test(this.log)) { clearInterval(iv); resolve(true); }
        else if (Date.now() - start > timeoutMs) { clearInterval(iv); resolve(false); }
      }, 40);
    });
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function attemptLogin(client, name, password) {
  await client.waitFor(/Do you have an account/i, 4000);
  client.send('Y');
  await client.waitFor(/Username:/i, 2000);
  client.send(name);
  const passP = await client.waitFor(/Password:/i, 1500);
  if (!passP) return null;
  client.send(password);
  const loggedIn = await client.waitFor(/Login successful|Welcome back/i, 4000);
  return loggedIn ? 'ok' : 'fail';
}
async function registerFresh(client, name, password) {
  await client.waitFor(/Do you have an account/i, 4000);
  client.send('N');
  await client.waitFor(/Choose a username/i, 2000);
  client.send(name);
  await client.waitFor(/Choose a password/i, 2000);
  client.send(password);
  await client.waitFor(/Confirm password/i, 2000);
  client.send(password);
  const ok = await client.waitFor(/Welcome to The Shattered Realms|begins/i, 4000);
  return ok ? 'ok' : 'fail';
}
async function ensureLogin(name, password) {
  const c = new TelnetClient(name);
  await c.connect();
  const r = await attemptLogin(c, name, password);
  if (r === 'ok') return c;
  c.close();
  await sleep(300);
  const c2 = new TelnetClient(name);
  await c2.connect();
  const r2 = await registerFresh(c2, name, password);
  if (r2 !== 'ok') throw new Error(`Cannot auth ${name}\n${c2.tail()}`);
  return c2;
}

async function runCmd(client, cmd, waitMs = 400) {
  client.clear();
  client.send(cmd);
  await sleep(waitMs);
  return client.tail();
}
function section(t) { console.log('\n' + '='.repeat(72) + '\n  ' + t + '\n' + '='.repeat(72)); }

const results = [];
function record(name, output) {
  results.push({ name, output });
  console.log(`\n--- ${name} ---\n${output}`);
}

const checks = [];
function expect(name, predicate, evidence) {
  const pass = !!predicate;
  checks.push({ name, pass, evidence: evidence ? evidence.slice(-400) : '' });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}`);
}

async function main() {
  // A is admin (Testmagea in admins.json); B is ordinary
  const A = await ensureLogin('Testmagea', 'TestPass123!');
  const B = await ensureLogin('Testmageb', 'TestPass123!');
  await sleep(500); A.clear(); B.clear();

  // Bootstrap: both to lvl 15 (so most spells unlock)
  section('0. Admin bootstrap');
  record('A: set_level Testmagea 15', await runCmd(A, 'set_level Testmagea 15', 500));
  record('A: set_level Testmageb 15', await runCmd(A, 'set_level Testmageb 15', 500));
  record('A: heal Testmagea', await runCmd(A, 'heal Testmagea', 400));
  record('A: heal Testmageb', await runCmd(A, 'heal Testmageb', 400));
  record('A: send Testmagea 1', await runCmd(A, 'send Testmagea 1', 400));
  record('A: send Testmageb 1', await runCmd(A, 'send Testmageb 1', 400));

  section('1. spells list renders cleanly (no "undefined")');
  const spellsOut = await runCmd(A, 'spells', 600);
  record('A: spells', spellsOut);
  expect('spells output has no "undefined"', !/undefined/.test(spellsOut), spellsOut);

  section('2. In SAFE chapel: offensive spells blocked');
  await runCmd(A, 'pvp on', 300); await runCmd(B, 'pvp on', 300);
  const mm_safe = await runCmd(A, 'cast magic missile Testmageb', 600);
  record('A: cast magic missile Testmageb (SAFE)', mm_safe);
  expect('magic missile blocked in chapel', /sacred chapel.*harmful/i.test(mm_safe), mm_safe);

  const fb_safe = await runCmd(A, 'cast fireball Testmageb', 600);
  record('A: cast fireball Testmageb (SAFE)', fb_safe);
  expect('fireball blocked in chapel', /sacred chapel.*harmful/i.test(fb_safe), fb_safe);

  const dl_safe = await runCmd(A, 'cast drain life Testmageb', 600);
  record('A: cast drain life Testmageb (SAFE)', dl_safe);
  expect('drain life blocked in chapel', /sacred chapel.*harmful/i.test(dl_safe), dl_safe);

  section('3. Non-safe room: offensive spells work via PVP');
  await runCmd(A, 'n', 400); await runCmd(B, 'n', 400);
  const look_ns = await runCmd(A, 'look', 300);
  record('A look (non-safe)', look_ns);
  expect('moved out of SAFE', !/\[SAFE\]/.test(look_ns), look_ns);

  const mm_ns = await runCmd(A, 'cast magic missile Testmageb', 700);
  record('A: cast magic missile Testmageb (non-safe, PVP)', mm_ns);
  expect('cast damage on player lands', /magic missile strikes Testmageb/i.test(mm_ns), mm_ns);

  await runCmd(A, 'surrender', 500); await runCmd(B, 'surrender', 500);
  await runCmd(A, 'heal Testmagea', 300); await runCmd(A, 'heal Testmageb', 300);

  section('4. Cross-room cast: improved error names the room');
  // Move A further north, B stays.
  await runCmd(A, 'n', 400);
  const crossRoom = await runCmd(A, 'cast magic missile Testmageb', 600);
  record('A: cast magic missile Testmageb (cross-room)', crossRoom);
  expect('cross-room cast mentions "not in this room"', /not in this room/i.test(crossRoom), crossRoom);

  section('5. Heal spell self-target');
  const heal = await runCmd(A, 'cast minor heal', 600);
  record('A: cast minor heal', heal);
  expect('heal spell fires or reports max HP', /heal|HP|Healing light/i.test(heal), heal);

  section('6. Buff spell (battle cry)');
  const bc = await runCmd(A, 'cast battle cry', 600);
  record('A: cast battle cry', bc);
  expect('battle cry casts', /battle cry|25% more damage/i.test(bc), bc);

  section('7. Shield spell (minor ward)');
  const mw = await runCmd(A, 'cast minor ward', 600);
  record('A: cast minor ward', mw);
  expect('minor ward casts', /ward|shield|absorb/i.test(mw), mw);

  section('8. Info spell (reveal weakness) on player in room');
  // Move A back to B
  await runCmd(A, 's', 400);
  const rw = await runCmd(A, 'cast reveal weakness Testmageb', 600);
  record('A: cast reveal weakness Testmageb', rw);
  expect('reveal weakness targets a player', /secrets|reveal|weakness|Testmageb/i.test(rw), rw);

  section('9. Teleport spell recall');
  const recall = await runCmd(A, 'cast recall', 1000);
  record('A: cast recall', recall);
  expect('recall casts', /recall|Awakening Chamber|transport/i.test(recall), recall);
  const lookAfter = await runCmd(A, 'look', 400);
  record('A look after recall', lookAfter);
  expect('A is back in SAFE (room_001)', /\[SAFE\]|Awakening Chamber/.test(lookAfter), lookAfter);

  section('10. Offensive spell blocked in chapel after recall');
  // B is still in non-safe room from earlier; cast still blocked because CASTER is in chapel
  const mm_chapelAgain = await runCmd(A, 'cast magic missile Testmageb', 600);
  record('A: cast magic missile Testmageb (chapel)', mm_chapelAgain);
  expect('chapel block from caster side', /sacred chapel.*harmful/i.test(mm_chapelAgain), mm_chapelAgain);

  section('11. In-combat blocked utility spell: recall in monster combat');
  // Spawn a test monster for A: test_combat spawns weak test monster in A's current room (chapel)
  // Chapel should not allow monster combat initiation either. Let's test via test_combat.
  // Move A out of chapel first
  await runCmd(A, 'n', 400);
  const tc = await runCmd(A, 'test_combat', 800);
  record('A: test_combat', tc);
  await sleep(600);
  // now A is in monster combat (automatic)
  const cast_recall_combat = await runCmd(A, 'cast recall', 600);
  record('A: cast recall (in monster combat)', cast_recall_combat);
  expect('recall blocked in combat', /cannot cast.*combat/i.test(cast_recall_combat), cast_recall_combat);

  section('12. Cast damage spell in monster combat (auto-targets monster)');
  const cast_mm_combat = await runCmd(A, 'cast magic missile', 800);
  record('A: cast magic missile (monster combat)', cast_mm_combat);
  expect('cast damage hits monster', /magic missile strikes|damage/i.test(cast_mm_combat), cast_mm_combat);

  // Flee to end combat cleanly
  await runCmd(A, 'flee', 1200);
  await runCmd(A, 'flee', 1200);
  await sleep(600);

  section('13. Zap as non-admin non-L25 blocked (use B)');
  const zap_blocked = await runCmd(B, 'zap Testmagea', 400);
  record('B: zap Testmagea', zap_blocked);
  expect('non-admin cannot zap', /Only Echoes|cannot use the zap/i.test(zap_blocked), zap_blocked);

  section('14. Zap blocked when caster is in chapel');
  await runCmd(A, 'send Testmagea 1', 400); // A back to chapel
  await runCmd(A, 'send Testmageb 10', 400); // B in non-chapel
  const zap_chapel = await runCmd(A, 'zap Testmageb', 600);
  record('A (chapel): zap Testmageb', zap_chapel);
  expect('zap blocked when caster in chapel', /sacred chapel/i.test(zap_chapel), zap_chapel);

  section('15. Zap blocked when target is in chapel');
  await runCmd(A, 'send Testmagea 10', 400); // A non-chapel
  await runCmd(A, 'send Testmageb 1', 400);  // B in chapel
  const zap_target_safe = await runCmd(A, 'zap Testmageb', 600);
  record('A: zap Testmageb (target in chapel)', zap_target_safe);
  expect('zap blocked when target in chapel',
    /sheltering in a sacred chapel/i.test(zap_target_safe), zap_target_safe);

  section('16. Zap works: both outside chapel');
  await runCmd(A, 'send Testmageb 10', 400);
  await runCmd(A, 'send Testmagea 11', 400); // different non-chapel room
  const zap_ok = await runCmd(A, 'zap Testmageb', 1200);
  record('A: zap Testmageb (both non-chapel)', zap_ok);
  expect('zap hits target', /disintegrat|OBLITERAT|lightning/i.test(zap_ok), zap_ok);

  // Cleanup
  A.close(); B.close();

  section('CHECKS SUMMARY');
  const passed = checks.filter(c => c.pass).length;
  const failed = checks.filter(c => !c.pass);
  console.log(`Passed ${passed}/${checks.length}`);
  if (failed.length) {
    console.log('\nFAILURES:');
    failed.forEach(f => {
      console.log(`  * ${f.name}`);
      if (f.evidence) console.log(`    evidence: ${f.evidence.slice(-200)}`);
    });
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
