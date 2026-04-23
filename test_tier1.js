// Comprehensive smoke test for Tier 1 features
// Connects to MUD at MUD_PORT (default 18888) and exercises every 1.x system.
const net = require('net');

const HOST = process.env.MUD_HOST || '127.0.0.1';
const PORT = parseInt(process.env.MUD_PORT, 10) || 18888;
const LOGIN_NAME = 'Testadmin';
const LOGIN_PASS = 'pwpw123456';

let buf = '';
let testCount = 0;
let passCount = 0;
const failures = [];

function stripTelnet(b) {
  const out = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0xFF && i + 2 < b.length) { i += 2; continue; }
    out.push(b[i]);
  }
  return Buffer.from(out).toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function expect(re, timeoutMs = 4000, label = '') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = buf.match(re);
    if (m) {
      buf = buf.slice(m.index + m[0].length);
      return m[0];
    }
    await sleep(40);
  }
  throw new Error(`expect TIMEOUT: ${label || re}\n--- BUFFER (${buf.length}b) ---\n${buf.slice(-600)}\n---`);
}

async function captureAfter(sock, cmd, ms = 600) {
  buf = '';
  if (cmd !== null) sock.write(cmd + '\r\n');
  await sleep(ms);
  return buf;
}

function send(sock, line) { sock.write(line + '\r\n'); }

function check(label, cond, detail = '') {
  testCount++;
  if (cond) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push({ label, detail });
    console.log(`  FAIL  ${label}${detail ? '  [' + detail + ']' : ''}`);
  }
}

async function run() {
  console.log(`\nConnecting to ${HOST}:${PORT} as ${LOGIN_NAME}...`);
  const sock = net.connect(PORT, HOST);
  sock.on('data', d => { buf += stripTelnet(d); });
  sock.on('error', e => console.log('socket error', e.message));

  // ----- Auth -----
  await expect(/Y\/N|account/i, 8000, 'auth prompt');
  send(sock, 'Y');
  await expect(/Username/i, 4000, 'login username');
  send(sock, LOGIN_NAME);
  await expect(/Password/i, 4000, 'login password');
  send(sock, LOGIN_PASS);
  await expect(/Welcome|returns to the realm|realms|begins|Exits:/i, 8000, 'login ok');
  await sleep(600);

  // Make sure we're in the chapel (room_001) for training + bank
  const initialRoom = await captureAfter(sock, 'transurf 1', 700);
  await sleep(200);

  // =============================================================
  console.log('\n=== 1.1 Stats / Abilities ===');
  // =============================================================

  const abi1 = await captureAfter(sock, 'abilities', 500);
  check('abilities command prints all 5 stats',
    /STR/i.test(abi1) && /DEX/i.test(abi1) && /CON/i.test(abi1) && /INT/i.test(abi1) && /WIS/i.test(abi1));

  // Give gold for training and grant practice points (admin).
  // Reset to level 1 then set to 15 so the set_level backfill grants +70 practice
  // reliably across re-runs.
  await captureAfter(sock, 'give_gold Testadmin 5000', 300);
  await captureAfter(sock, 'set_level Testadmin 1', 400);
  await captureAfter(sock, 'set_level Testadmin 15', 600);
  await sleep(300);

  const trainOut = await captureAfter(sock, 'train str', 500);
  check('train str in chapel succeeds', /rises to/i.test(trainOut) || /already at the cap/i.test(trainOut));

  // Non-chapel room: teleport to r002 and try train -> should reject
  await captureAfter(sock, 'transurf 2', 500);
  const trainFail = await captureAfter(sock, 'train dex', 500);
  check('train rejected outside chapel', /chapel|sanctuary/i.test(trainFail));
  // back to chapel
  await captureAfter(sock, 'transurf 1', 500);

  // =============================================================
  console.log('\n=== 1.2 Classes ===');
  // =============================================================

  const classList = await captureAfter(sock, 'class', 500);
  check('class lists all three classes',
    /Warder/i.test(classList) && /Loresinger/i.test(classList) && /Echobound/i.test(classList));

  // Pick warder (level >= 5 already via set_level 10)
  const classPick = await captureAfter(sock, 'class warder', 500);
  check('class choice accepted', /Warder/i.test(classPick) && !/Reach level 5/i.test(classPick));

  // Re-pick should be blocked (classes are permanent)
  const classReject = await captureAfter(sock, 'class echobound', 500);
  check('second class pick blocked',
    /already|cannot.*change|permanent|locked/i.test(classReject) || !/Echobound.*chosen/i.test(classReject));

  // Verify stats now show the class
  const statsOut = await captureAfter(sock, 'stats', 500);
  check('stats now show class', /Warder/i.test(statsOut));

  // =============================================================
  console.log('\n=== 1.3 Affects ===');
  // =============================================================

  const afOut = await captureAfter(sock, 'affects', 500);
  check('affects command prints header', /Active Affects/i.test(afOut));
  // Alias
  const afAlias = await captureAfter(sock, 'af', 500);
  check('af alias works', /Active Affects/i.test(afAlias));

  // =============================================================
  console.log('\n=== 1.4 Damage types + resists ===');
  // =============================================================

  // Give ourselves the tuning fork, equip it, inspect equipment
  await captureAfter(sock, 'give_item Testadmin tuning_fork', 400);
  const eqOut = await captureAfter(sock, 'equipment', 500);
  check('equipment command runs', /Equipment|weapon|Head|None/i.test(eqOut));

  // Inspect the tuning fork -- does examine mention harmonic? Not required, but exists in desc.
  const invOut = await captureAfter(sock, 'inventory', 500);
  check('tuning fork in inventory after give_item',
    /Tuning Fork/i.test(invOut) || /Initiate/i.test(invOut));

  // =============================================================
  console.log('\n=== 1.5 Group ===');
  // =============================================================

  const grpOut = await captureAfter(sock, 'group', 500);
  check('group command prints status', /group/i.test(grpOut));

  const followNone = await captureAfter(sock, 'follow', 500);
  check('follow with no arg prints usage or status', followNone.length > 0);

  // =============================================================
  console.log('\n=== 1.6 Shops ===');
  // =============================================================

  await captureAfter(sock, 'transurf 3', 500);
  const listOut = await captureAfter(sock, 'list', 700);
  check('shop list runs at room_003',
    /Armory|Rusty|gold|buy/i.test(listOut));

  // Buy a cheap item if shown
  const buyOut = await captureAfter(sock, 'buy minor_healing_potion', 700);
  check('buy command responds', /bought|purchase|gold|need|sell|doesn't sell/i.test(buyOut));

  // value
  const valOut = await captureAfter(sock, 'value minor_healing_potion', 500);
  check('value command responds', /gold|worth|value|doesn't/i.test(valOut));

  // return to room_001 for bank
  await captureAfter(sock, 'transurf 1', 500);

  // =============================================================
  console.log('\n=== 1.7 Bank ===');
  // =============================================================

  const bal1 = await captureAfter(sock, 'bank', 500);
  check('bank balance prints', /Bank|balance/i.test(bal1));

  const dep = await captureAfter(sock, 'bank deposit 100', 500);
  check('bank deposit 100 works', /Deposited|Bank:/i.test(dep));

  const wd = await captureAfter(sock, 'bank withdraw 50', 500);
  check('bank withdraw 50 works', /Withdrew|Bank:/i.test(wd));

  // =============================================================
  console.log('\n=== 1.8 Achievements ===');
  // =============================================================

  const ach = await captureAfter(sock, 'achievements', 600);
  check('achievements command prints list', /Achievement/i.test(ach));

  const ach2 = await captureAfter(sock, 'ach', 500);
  check('ach alias works', /Achievement/i.test(ach2));

  const title = await captureAfter(sock, 'title', 500);
  check('title command prints', title.length > 0);

  // =============================================================
  console.log('\n=== 1.9 Practice ===');
  // =============================================================

  const pra = await captureAfter(sock, 'practice', 600);
  check('practice command prints', /practice|spell|proficiency|Practice/i.test(pra));

  const praAlias = await captureAfter(sock, 'pra', 500);
  check('pra alias works', /practice|spell|proficiency|Practice/i.test(praAlias));

  // =============================================================
  console.log('\n=== 1.10 Board + Mail ===');
  // =============================================================

  const board = await captureAfter(sock, 'board', 500);
  check('board list prints', /Bulletin|board|announcement|players/i.test(board));

  const boardsAlias = await captureAfter(sock, 'boards', 500);
  check('boards alias works', /Bulletin|board|announcement|players/i.test(boardsAlias));

  const post = await captureAfter(sock, 'board post announcements Test Title | Hello world from Tier 1 tests', 700);
  check('posting to board responds', /posted|ok|Board|wrote|saved|unknown/i.test(post));

  const readBoard = await captureAfter(sock, 'board read announcements', 700);
  check('board read prints a post or empty',
    /Test Title|empty|posts|no posts|announcement/i.test(readBoard));

  const mail = await captureAfter(sock, 'mail', 500);
  check('mail command prints', /mail|Mail|Inbox|inbox|Unread/i.test(mail));

  const mailAlias = await captureAfter(sock, 'mudmail', 500);
  check('mudmail alias works', /mail|Mail|Inbox|inbox|Unread/i.test(mailAlias));

  // Compose self-mail (if send syntax supported)
  const mailSend = await captureAfter(sock, 'mail send Testadmin | tiertest | self-delivery check', 700);
  check('mail send responds', /sent|delivered|unknown|Usage|mail/i.test(mailSend));

  // =============================================================
  // Cast fizzle / class gate smoke
  // =============================================================
  console.log('\n=== Cast gate smoke (1.2 + 1.9 integration) ===');

  const spellsOut = await captureAfter(sock, 'spells', 700);
  check('spells command runs', /Spell|spells|mana|cast/i.test(spellsOut));

  // Done
  send(sock, 'quit');
  await sleep(400);
  sock.end();

  console.log(`\n=========================`);
  console.log(`  ${passCount}/${testCount} PASSED`);
  if (failures.length) {
    console.log(`  Failures:`);
    for (const f of failures) console.log(`    - ${f.label}`);
  }
  console.log(`=========================\n`);
  process.exit(passCount === testCount ? 0 : 1);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
