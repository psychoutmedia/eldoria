// Tier 6.6 - live smoke test for the Macrodata Vault.
//
// Spawns mud_server.js, registers a fresh test admin, then drives
// three scenarios end-to-end:
//   1. The Citizen cannot cross the threshold (reader plate is dark).
//   2. A Logician with 0 lifetime batches is rejected (insufficient
//      throughput).
//   3. A Logician with 100 lifetime batches walks the Vault, finds
//      the Founder's Echo at room_353 (boss spawned + room desc OK).
//
// The actual boss fight is exhaustively unit-tested in
// _verify_vault.js; the smoke focuses on the integration boundary
// the unit can't reach (movement guard, world-content load, boss spawn).

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const checks = [];
let proc = null;
const NAME = 'Severant';
const PASS = 'severpass123';
const PORT = String(process.env.SMOKE_PORT || 18898);
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
let snapshotted = false;
function setupTestAdmin() {
  snapshotted = true;
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
  if (!snapshotted) return;
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

  let bootBuf = '';
  await new Promise((resolve, reject) => {
    const onData = (b) => {
      bootBuf += b.toString();
      if (/Loaded \d+ active echo sign/.test(bootBuf) || /listening on port/i.test(bootBuf)) {
        proc.stdout.removeListener('data', onData);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error('Boot timeout. stdout tail:\n' + bootBuf.slice(-400))), 15000);
  });
  check('server boots', true);
  // The boss-spawn count line includes Founder's Echo
  check('server log mentions spawned bosses', /Spawned \d+ monsters \(including \d+ bosses\)/.test(bootBuf));

  // === Pass 1: register, save, disconnect ===
  let sock = net.createConnection({ port: parseInt(PORT, 10), host: '127.0.0.1' });
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

  // === Citizen-side rejection: walk to room_322, try east ===
  // First transurf to room_322 (Vault Antechamber).
  send(sock, 'transurf 322');
  await readUntil(sock, t => /Vault Antechamber/i.test(t), 6000);
  check('admin transurf to room_322 succeeds', true);

  // The Citizen tries to enter east -> should be rejected
  send(sock, 'east');
  const citizenRej = await readUntil(sock, t => /reader plate is dark|Logician carries the right clearance/i.test(t), 6000);
  check('Citizen rejected at vault threshold', /reader plate is dark/.test(citizenRej));

  // === Save and prep for Logician test ===
  send(sock, 'save');
  await readUntil(sock, t => /Character saved|Progress saved|saved/i.test(t), 4000);
  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 800));
  sock.destroy();

  // Edit save: prime Logician unlock with 0 lifetimeBatches
  try {
    const data = JSON.parse(fs.readFileSync(PLAYER_FILE, 'utf8'));
    data.personas.logic.lastActiveAt = Date.now();
    data.personas.logic.currentRoom = 'room_322';
    data.personas.logic.coherence = 100;
    data.personas.logic.maxCoherence = 100;
    data.personas.logic.lifetimeBatches = 0;     // intentionally under the gate
    data.personas.logic.activeTask = null;
    fs.writeFileSync(PLAYER_FILE, JSON.stringify(data, null, 2));
    check('save primed for Logician (lifetimeBatches=0)', true);
  } catch (e) {
    check('save primed for Logician (lifetimeBatches=0)', false, e.message);
  }

  // === Pass 2: log back in, swap, attempt entry ===
  sock = net.createConnection({ port: parseInt(PORT, 10), host: '127.0.0.1' });
  await new Promise((r) => sock.once('connect', r));
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'Y');
  await readUntil(sock, t => /username/i.test(t));
  send(sock, NAME);
  await readUntil(sock, t => /password/i.test(t.toLowerCase()));
  send(sock, PASS);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 8000);
  check('player logged back in', true);

  // Transurf to a sync terminal that's also Logic-State (room_311) and swap
  send(sock, 'transurf 311');
  await readUntil(sock, t => /Antechamber/i.test(t), 6000);
  send(sock, 'swap');
  await readUntil(sock, t => /now the Logician/i.test(t), 6000);
  check('swap to Logician', true);

  // After swap we land at logic.currentRoom = room_322 (we primed it)
  send(sock, 'look');
  await readUntil(sock, t => /Vault Antechamber/i.test(t), 6000);
  check('Logician parked at room_322 after swap', true);

  // Try east with 0 batches -> insufficient throughput
  send(sock, 'east');
  const lowRej = await readUntil(sock, t => /throughput is insufficient|Lifetime batches: 0/i.test(t), 6000);
  check('Logician with 0 batches rejected at threshold',
    /throughput is insufficient/.test(lowRej) && /Lifetime batches: 0/.test(lowRej));

  // Swap back to Citizen before saving so recoverFromCrashIfNeeded
  // doesn't snap us out of Logic on the next login.
  send(sock, 'transurf 311');
  await readUntil(sock, t => /Antechamber/i.test(t), 6000);
  send(sock, 'swap');
  await readUntil(sock, t => /now the Citizen/i.test(t), 6000);

  // === Now patch up to 100 lifetime batches and try again ===
  send(sock, 'save');
  await readUntil(sock, t => /Character saved|Progress saved|saved/i.test(t), 4000);
  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 800));
  sock.destroy();

  try {
    const data = JSON.parse(fs.readFileSync(PLAYER_FILE, 'utf8'));
    data.personas.logic.lifetimeBatches = 100;
    data.personas.logic.currentRoom = 'room_322';
    fs.writeFileSync(PLAYER_FILE, JSON.stringify(data, null, 2));
    check('save bumped to lifetimeBatches=100', true);
  } catch (e) {
    check('save bumped to lifetimeBatches=100', false, e.message);
  }

  // === Pass 3: log in, swap, walk the Vault ===
  sock = net.createConnection({ port: parseInt(PORT, 10), host: '127.0.0.1' });
  await new Promise((r) => sock.once('connect', r));
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'Y');
  await readUntil(sock, t => /username/i.test(t));
  send(sock, NAME);
  await readUntil(sock, t => /password/i.test(t.toLowerCase()));
  send(sock, PASS);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 8000);
  check('logged back in (third pass)', true);

  send(sock, 'transurf 311');
  await readUntil(sock, t => /Antechamber/i.test(t), 6000);
  send(sock, 'swap');
  await readUntil(sock, t => /now the Logician/i.test(t), 6000);

  send(sock, 'look');
  await readUntil(sock, t => /Vault Antechamber/i.test(t), 6000);

  // Now east should succeed
  send(sock, 'east');
  const enterResp = await readUntil(sock, t => /Vault Threshold/i.test(t), 6000);
  check('Logician with 100 batches enters Vault Threshold',
    /Vault Threshold/.test(enterResp));
  check('Threshold description mentions throughput',
    /THROUGHPUT/i.test(enterResp));

  // North to Cold Storage Aisle
  send(sock, 'north');
  const aisleResp = await readUntil(sock, t => /Cold Storage Aisle/i.test(t), 6000);
  check('Cold Storage Aisle reachable', /Cold Storage Aisle/.test(aisleResp));

  // East to side door (Reading Carrel)
  send(sock, 'east');
  const carrelResp = await readUntil(sock, t => /Reading Carrel/i.test(t), 6000);
  check('Reading Carrel reachable from aisle', /Reading Carrel/.test(carrelResp));

  // Back west and north into the cubicle
  send(sock, 'west');
  await readUntil(sock, t => /Cold Storage Aisle/i.test(t), 6000);
  send(sock, 'north');
  const cubicleResp = await readUntil(sock, t => /Founder's Cubicle|Founder/i.test(t), 6000);
  check("Founder's Cubicle reachable", /Founder/i.test(cubicleResp));

  // The Founder's Echo should be present in the cubicle
  check('Founder\'s Echo monster in the room',
    /The Founder's Echo|Founder's Echo|FOUNDER/i.test(cubicleResp));

  // Verify the score command sees the Founder
  send(sock, 'score founder');
  const scoreResp = await readUntil(sock, t => /level|Level|HP|hp/i.test(t), 6000);
  check('score founder finds the boss',
    /Founder/i.test(scoreResp) && /38|level\s*38|level:\s*38/i.test(scoreResp));

  // Check that the player isn't yet vaultCleared
  send(sock, 'memory');  // benign Citizen-side verb to confirm we're still alive
  await readUntil(sock, t => /Muscle Memories/i.test(t) || /Citizen/i.test(t), 6000);
  check('memory verb still routes (player alive)', true);

  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 600));
  sock.destroy();

  check('server alive after run', proc.exitCode === null);
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
