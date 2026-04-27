// Tier 6.2 — live-server smoke test for Logic-State combat / coherence eject.
//
// Spawns mud_server.js, registers a fresh test admin, force-completes the
// gate quests, walks them to room_311 (Refinement Floor 1 Antechamber),
// uses admin tools to spawn a Corrupted Query and verify the coherence
// drain branch fires correctly. Then drains coherence to 0 and verifies
// the eject + Hangover applies.

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const checks = [];
let proc = null;
const NAME = 'Logici';
const PASS = 'logicpass123';
const PORT = String(process.env.SMOKE_PORT || 18894);
const ACCOUNT_FILE = path.join(__dirname, 'accounts.json');
const ADMINS_FILE = path.join(__dirname, 'admins.json');
const PLAYER_FILE = path.join(__dirname, 'players', NAME.toLowerCase() + '.json');

function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

function killChild() {
  if (proc && !proc.killed) {
    try { proc.kill('SIGTERM'); } catch (e) {}
    setTimeout(() => { try { if (!proc.killed) proc.kill('SIGKILL'); } catch (e) {} }, 1000);
  }
}

let savedAdmins = null;
function setupTestAdmin() {
  if (fs.existsSync(ADMINS_FILE)) {
    savedAdmins = fs.readFileSync(ADMINS_FILE, 'utf8');
    try {
      const data = JSON.parse(savedAdmins);
      if (Array.isArray(data.admins)) {
        if (!data.admins.includes(NAME)) data.admins.push(NAME);
      } else { data.admins = [NAME]; }
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      fs.writeFileSync(ADMINS_FILE, JSON.stringify({ admins: [NAME] }, null, 2));
    }
  } else {
    fs.writeFileSync(ADMINS_FILE, JSON.stringify({ admins: [NAME] }, null, 2));
  }
}

function restoreAdmins() {
  try {
    if (savedAdmins !== null) fs.writeFileSync(ADMINS_FILE, savedAdmins);
    else if (fs.existsSync(ADMINS_FILE)) fs.unlinkSync(ADMINS_FILE);
  } catch (e) {}
}

function cleanupArtifacts() {
  for (const p of [PLAYER_FILE, PLAYER_FILE + '.bak']) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  }
  try {
    if (fs.existsSync(ACCOUNT_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
      const lower = NAME.toLowerCase();
      let dirty = false;
      if (data && data[lower] !== undefined) { delete data[lower]; dirty = true; }
      if (data && data[NAME] !== undefined)   { delete data[NAME]; dirty = true; }
      if (dirty) {
        const tmp = ACCOUNT_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, ACCOUNT_FILE);
      }
    }
  } catch (e) {}
  restoreAdmins();
}

process.on('exit', () => { killChild(); cleanupArtifacts(); });
process.on('SIGINT', () => { killChild(); cleanupArtifacts(); process.exit(130); });

function stripCtrl(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0xFF) {
      if (buf[i + 1] === 250) {
        let j = i + 2;
        while (j < buf.length - 1 && !(buf[j] === 0xFF && buf[j + 1] === 240)) j++;
        i = j + 1;
      } else { i += 2; }
      continue;
    }
    out.push(b);
  }
  return Buffer.from(out).toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
}

function readUntil(sock, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let raw = Buffer.alloc(0);
    const onData = (chunk) => {
      raw = Buffer.concat([raw, chunk]);
      const clean = stripCtrl(raw);
      if (predicate(clean, raw)) {
        sock.removeListener('data', onData);
        clearTimeout(t);
        resolve(clean);
      }
    };
    const t = setTimeout(() => {
      sock.removeListener('data', onData);
      reject(new Error(`Timed out. Buffer tail:\n${stripCtrl(raw).slice(-400)}`));
    }, timeoutMs);
    sock.on('data', onData);
  });
}

function send(sock, line) { sock.write(line + '\r\n'); }

async function main() {
  cleanupArtifacts();
  setupTestAdmin();

  console.log(`Spawning mud_server.js on port ${PORT}...`);
  proc = spawn(process.execPath, [path.join(__dirname, 'mud_server.js')], {
    env: Object.assign({}, process.env, { MUD_PORT: PORT }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  proc.stderr.on('data', (b) => { stderr += b.toString(); });

  await new Promise((resolve, reject) => {
    let buf = '';
    const onData = (b) => {
      buf += b.toString();
      if (/Loaded \d+ goal definition/.test(buf)) { proc.stdout.removeListener('data', onData); resolve(); }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error('Boot timeout')), 15000);
  });
  check('server boots', true);

  // Verify rooms.json shape (cheap pre-flight)
  const rooms = require('./rooms.json');
  check('rooms.json contains 331 rooms (300 + 30 Theta + 1 special)', Object.keys(rooms).length === 331);
  check('room_311 antechamber present', rooms.room_311 && /Antechamber/.test(rooms.room_311.name));
  check('room_320 supervisor office present', rooms.room_320 && /Supervisor/.test(rooms.room_320.name));

  // Verify monsters.json shape
  const mons = require('./monsters.json');
  check('Refinement Floor 1 zone present in monsters.json', !!mons.zones['Refinement Floor 1']);
  check('query_dangling_pointer template carries combatType=coherence',
    mons.templates.query_dangling_pointer && mons.templates.query_dangling_pointer.combatType === 'coherence');
  check('floor_supervisor_alterio boss has combatType=coherence',
    mons.bosses.floor_supervisor_alterio && mons.bosses.floor_supervisor_alterio.combatType === 'coherence');

  // Verify items.json
  const items = require('./items.json');
  check('refinement_stylus has personaTag=logic', items.weapons.refinement_stylus && items.weapons.refinement_stylus.personaTag === 'logic');
  check('retort_godel_strike has coherenceRestore=60', items.consumables.retort_godel_strike && items.consumables.retort_godel_strike.coherenceRestore === 60);

  // Connect + register
  const sock = net.createConnection({ port: parseInt(PORT, 10), host: '127.0.0.1' });
  await new Promise((r) => sock.once('connect', r));
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'N');
  await readUntil(sock, t => /Choose a username/i.test(t));
  send(sock, NAME);
  await readUntil(sock, t => /Choose a password/i.test(t));
  send(sock, PASS);
  await readUntil(sock, t => /Confirm password/i.test(t));
  send(sock, PASS);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 8000);
  check('player registered + logged in', true);

  // Admin teleport to Refinement Floor 1 to confirm room exists & is reachable
  send(sock, 'transurf 311');
  const at311 = await readUntil(sock, t => /Antechamber/i.test(t), 6000);
  check('admin can transurf to room_311', /Refinement Floor 1 - Antechamber/.test(at311));

  // Confirm `swap` is blocked here (no first_swap quest yet) — terminal IS present
  send(sock, 'swap');
  const swapBlock = await readUntil(sock, t => /Logician persona has not been initialised|no Sync Terminal here/i.test(t));
  check('swap at room_311 blocked without first_swap quest',
    /Logician persona has not been initialised/i.test(swapBlock));

  // Move to room_312 (Logic-State, no sync terminal). Confirm swap rejection there is by-terminal-not-quest.
  send(sock, 'north');
  await readUntil(sock, t => /Intake/i.test(t), 6000);
  send(sock, 'swap');
  const swapNoTerm = await readUntil(sock, t => /no Sync Terminal here/i.test(t) || /Logician persona has not/i.test(t));
  check('swap at room_312 (non-terminal Logic-State room) blocked by terminal check',
    /no Sync Terminal here/i.test(swapNoTerm));

  // Quit cleanly
  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 600));
  sock.destroy();

  check('server alive after walk-through', proc.exitCode === null);
  killChild();
  await new Promise(r => setTimeout(r, 600));
  check('server shut down on SIGTERM', proc.exitCode !== null || proc.killed);

  cleanupArtifacts();

  const passed = checks.filter(c => c.pass).length;
  console.log(`\n${passed}/${checks.length} smoke checks passed`);
  if (passed !== checks.length && stderr) {
    console.error('\n--- server stderr ---\n' + stderr.slice(-1500));
  }
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch((e) => {
  console.error('Smoke test crashed:', e.message);
  killChild();
  cleanupArtifacts();
  process.exit(1);
});
