// Smoke test for Tier 2 features
// Connects to MUD at MUD_PORT (default 8888) and exercises the five core
// Tier 2 systems: campaigns, QP shop, pets, crafting, remort.
const net = require('net');

const HOST = process.env.MUD_HOST || '127.0.0.1';
const PORT = parseInt(process.env.MUD_PORT, 10) || 8888;
const LOGIN_NAME = 'Tiertwo';
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

  // ----- Auth: register -----
  await expect(/Y\/N|account/i, 8000, 'auth prompt');
  send(sock, 'N');
  await expect(/username/i, 4000, 'register username');
  send(sock, LOGIN_NAME);
  await expect(/password/i, 4000, 'password');
  send(sock, LOGIN_PASS);
  await expect(/confirm|again|repeat/i, 4000, 'confirm');
  send(sock, LOGIN_PASS);
  await expect(/welcome|begins|Exits:/i, 8000, 'registered');
  await sleep(800);

  // Make sure we're in room_001 for redeem / stable tests
  await captureAfter(sock, 'transurf 1', 700);

  console.log('\n=== Tier 2 smoke ===');

  // 2.1 campaign
  let out = await captureAfter(sock, 'campaign', 800);
  check('campaign shows status or starts',
    /Campaign/i.test(out) || /no.*campaign/i.test(out));

  out = await captureAfter(sock, 'campaign start', 800);
  check('campaign start accepted',
    /New Campaign|already.*active|must wait/i.test(out));

  out = await captureAfter(sock, 'campaign abandon', 600);
  check('campaign abandon runs',
    /abandon|no active/i.test(out));

  // 2.2 QP
  out = await captureAfter(sock, 'qp', 600);
  check('qp prints balance', /Quest Points/i.test(out));

  out = await captureAfter(sock, 'redeem', 800);
  check('redeem lists repository in room_001', /Repository|Quest Points/i.test(out));

  out = await captureAfter(sock, 'redeem aura_resolute', 600);
  // Tiertwo probably has 0 QPs; we expect the "need more QPs" path
  check('redeem rejects broke buyer or succeeds',
    /need.*more|applied|Aura/i.test(out));

  // 2.3 pets
  out = await captureAfter(sock, 'pets', 600);
  check('pets prints status', /no pets|Your Pets/i.test(out));

  out = await captureAfter(sock, 'tame', 400);
  check('tame with no arg rejects', /Tame what/i.test(out));

  out = await captureAfter(sock, 'release', 400);
  check('release with no arg rejects', /Release which/i.test(out));

  out = await captureAfter(sock, 'pet stable', 500);
  check('pet stable responds in room_001',
    /no active|settles|stable/i.test(out));

  // 2.4 crafting
  out = await captureAfter(sock, 'recipes', 800);
  check('recipes lists recipes', /Recipes|sharpened_dagger|alchemist/i.test(out));

  out = await captureAfter(sock, 'recipes weaponsmith', 600);
  check('recipes filter works', /weaponsmith/i.test(out));

  out = await captureAfter(sock, 'skills', 500);
  check('skills lists three skills',
    /weaponsmith/i.test(out) && /enchanter/i.test(out) && /alchemist/i.test(out));

  out = await captureAfter(sock, 'craft sharpened_dagger', 600);
  check('craft rejects without materials',
    /Missing|skill.*too low/i.test(out));

  // 2.6 remort
  out = await captureAfter(sock, 'remort', 800);
  check('remort preview gated by L30',
    /Remort Preview|must reach level 30/i.test(out));

  out = await captureAfter(sock, 'remort confirm str', 600);
  check('remort confirm blocked pre-L30',
    /must reach level 30|finale/i.test(out));

  // quit
  send(sock, 'quit');
  await sleep(500);
  sock.end();

  console.log(`\n=========================`);
  console.log(`  ${passCount}/${testCount} PASSED`);
  console.log(`=========================`);
  if (failures.length) {
    for (const f of failures) console.log(`   - ${f.label}`);
  }
  process.exit(passCount === testCount ? 0 : 1);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
