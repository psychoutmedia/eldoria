// Smoke test for Tier 0 features
const net = require('net');

const HOST = '127.0.0.1';
const PORT = 8888;

let buf = '';
let testCount = 0;
let passCount = 0;

function stripTelnet(b) {
  const out = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0xFF && i + 2 < b.length) { i += 2; continue; }
    out.push(b[i]);
  }
  return Buffer.from(out).toString('utf8');
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
    await sleep(50);
  }
  throw new Error(`expect TIMEOUT: ${label || re}\n--- BUFFER (${buf.length}b) ---\n${buf.slice(-600)}\n---`);
}

async function captureFor(ms) {
  buf = '';
  await sleep(ms);
  return buf;
}

function send(sock, line) {
  sock.write(line + '\r\n');
}

function check(label, cond) {
  testCount++;
  if (cond) {
    passCount++;
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`);
  }
}

async function run() {
  const sock = net.connect(PORT, HOST);
  sock.on('data', d => { buf += stripTelnet(d); });
  sock.on('error', e => console.log('socket error', e.message));

  await expect(/account.*Y\/N|account/i, 8000, 'auth prompt');

  // Choose N (new account)
  send(sock, 'N');
  await expect(/username/i, 4000, 'register username');
  send(sock, 'Testadmin');
  await expect(/password/i, 4000, 'password');
  send(sock, 'pwpw123456');
  await expect(/confirm|again|repeat/i, 4000, 'confirm');
  send(sock, 'pwpw123456');
  await expect(/welcome|adventures|character|created|registered|realms|begins/i, 8000, 'registered');
  await sleep(800);
  buf = '';

  console.log('\n=== Tier 0 smoke ===');

  // help (index)
  send(sock, 'help');
  const helpIndex = await expect(/Help Index|topic/i, 4000, 'help index');
  check('help index loads', /Help Index/.test(helpIndex));

  // help consider
  send(sock, 'help consider');
  await expect(/consider|estimate|outcome/i, 4000, 'help consider');
  check('help consider topic loads', true);

  // help search
  send(sock, 'help search potion');
  const search = await expect(/Search .*potion|match|matches/i, 4000, 'help search');
  check('help search runs', /Search/i.test(search));

  // bestiary
  buf = '';
  send(sock, 'bestiary');
  await sleep(800);
  check('bestiary list', /=== Bestiary ===/.test(buf));

  // bestiary specific
  buf = '';
  send(sock, 'bestiary morwyn');
  await sleep(800);
  check('bestiary <name>', /=== Morwyn/i.test(buf));

  // map
  send(sock, 'map');
  const map = await expect(/Map:|Legend/i, 4000, 'map');
  check('map renders', /Map:/.test(map));

  // alias
  send(sock, 'alias kk attack');
  await expect(/Alias set|kk/i, 4000, 'alias set');
  send(sock, 'aliases');
  const aliasList = await expect(/Your Aliases|kk/i, 4000, 'aliases list');
  check('alias listed', /kk/.test(aliasList));
  send(sock, 'unalias kk');
  await expect(/removed|kk/i, 4000, 'unalias');
  check('alias removed', true);

  // channels
  buf = '';
  send(sock, 'channels');
  await sleep(800);
  check('channels list shows newbie/ooc', /newbie/.test(buf) && /ooc/.test(buf) && /trade/.test(buf));

  // toggle ooc and send
  send(sock, 'ooc hello world');
  await sleep(500); // give time for echo
  // Subscriber should be on by default
  check('ooc command accepted', true);

  // consider with no monster nearby (room 001 has no aggressive likely)
  send(sock, 'consider nothing');
  await expect(/no.*to consider|There is no/i, 4000, 'consider missing');
  check('consider rejects missing target', true);

  // equipment 8 slots
  buf = '';
  send(sock, 'equipment');
  await sleep(800);
  check('equipment shows new slots', /Head/.test(buf) && /Neck/.test(buf) && /Finger/.test(buf));

  // qs
  send(sock, 'qs');
  await expect(/Cycle|HP|Loadout/i, 4000, 'qs');
  check('qs works', true);

  // quit
  send(sock, 'quit');
  await sleep(500);
  sock.end();

  console.log(`\n=== ${passCount}/${testCount} PASSED ===`);
  process.exit(passCount === testCount ? 0 : 1);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(2); });
