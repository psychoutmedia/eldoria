// Tier 4.6 — live-server smoke test for goals.
//
// Spawns mud_server.js on an isolated port, registers a fresh test admin,
// then exercises the goal command surface end-to-end. Uses the admin's
// `set_level` to push the player to a level that completes the prog_adept
// goal, then claims it and verifies QP was awarded + the claim persists
// in the save file.

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const checks = [];
let proc = null;
const TEST_NAME = 'Goalsmokie';
const TEST_PASS = 'goalsmoketest123';
const PORT = String(process.env.SMOKE_PORT || 18890);
const PLAYER_FILE = path.join(__dirname, 'players', TEST_NAME.toLowerCase() + '.json');
const PLAYER_BAK  = PLAYER_FILE + '.bak';
const ACCOUNT_FILE = path.join(__dirname, 'accounts.json');
const ADMINS_FILE = path.join(__dirname, 'admins.json');

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
  // Add the test character to admins.json so set_level works; restore on exit.
  if (fs.existsSync(ADMINS_FILE)) {
    savedAdmins = fs.readFileSync(ADMINS_FILE, 'utf8');
    try {
      const data = JSON.parse(savedAdmins);
      if (Array.isArray(data.admins)) {
        if (!data.admins.includes(TEST_NAME)) data.admins.push(TEST_NAME);
      } else {
        data.admins = [TEST_NAME];
      }
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      // Replace if unreadable (we'll restore from saved string)
      fs.writeFileSync(ADMINS_FILE, JSON.stringify({ admins: [TEST_NAME] }, null, 2));
    }
  } else {
    fs.writeFileSync(ADMINS_FILE, JSON.stringify({ admins: [TEST_NAME] }, null, 2));
  }
}

function restoreAdmins() {
  try {
    if (savedAdmins !== null) fs.writeFileSync(ADMINS_FILE, savedAdmins);
    else if (fs.existsSync(ADMINS_FILE)) fs.unlinkSync(ADMINS_FILE);
  } catch (e) {}
}

function cleanupArtifacts() {
  for (const p of [PLAYER_FILE, PLAYER_BAK]) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  }
  try {
    if (fs.existsSync(ACCOUNT_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
      const lower = TEST_NAME.toLowerCase();
      let dirty = false;
      if (data && data[lower] !== undefined) { delete data[lower]; dirty = true; }
      if (data && data[TEST_NAME] !== undefined) { delete data[TEST_NAME]; dirty = true; }
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
  const stripped = [];
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
    stripped.push(b);
  }
  return Buffer.from(stripped).toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
}

function readUntil(sock, predicate, timeoutMs = 5000) {
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

  // Wait for the goals-load line — proves goals.json was parsed at startup
  await new Promise((resolve, reject) => {
    let buf = '';
    const onData = (b) => {
      buf += b.toString();
      if (/Loaded \d+ goal definition/.test(buf)) {
        proc.stdout.removeListener('data', onData);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error('Server failed to boot in 15s')), 15000);
  });
  check('server logs goal-definition load', true);

  // Connect + register
  const sock = net.createConnection({ port: parseInt(PORT, 10), host: '127.0.0.1' });
  await new Promise((r) => sock.once('connect', r));
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  // ADMIN warning expects min 10 chars; password is 'goalsmoketest123' (16) — fine.
  send(sock, 'N');
  // ANY pre-username admin warning is fine; just wait for username prompt
  await readUntil(sock, t => /Choose a username/i.test(t));
  send(sock, TEST_NAME);
  await readUntil(sock, t => /Choose a password/i.test(t));
  send(sock, TEST_PASS);
  await readUntil(sock, t => /Confirm password/i.test(t));
  send(sock, TEST_PASS);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 8000);
  check('player registered + logged in', true);

  // === goals list (default) ===
  send(sock, 'goals');
  const list1 = await readUntil(sock, t => /\[combat\]/i.test(t) && /\[progression\]/i.test(t));
  check('goals list shows category headers',
    /\[combat\]/.test(list1) && /\[exploration\]/.test(list1) && /\[economy\]/.test(list1) && /\[progression\]/.test(list1));
  check('goals list shows all-progress in_progress at start',
    /\[ \.\.\.\s*\]/.test(list1) && !/\[CLAIMED\]/.test(list1));

  // === goal info ===
  send(sock, 'goal info combat_apprentice');
  const info = await readUntil(sock, t => /Reward:\s+25 QP/.test(t));
  check('goal info shows reward + description',
    /Reward:\s+25 QP/.test(info) && /Kill 100 monsters\./.test(info));

  // === goal info on unknown id ===
  send(sock, 'goal info no_such_thing');
  const unknown = await readUntil(sock, t => /No such goal/i.test(t));
  check('goal info rejects unknown id', /No such goal/i.test(unknown));

  // === claim before complete ===
  send(sock, 'goal claim combat_apprentice');
  const tooSoon = await readUntil(sock, t => /Not yet/i.test(t));
  check('goal claim rejects in-progress', /Not yet/i.test(tooSoon));

  // === Use admin set_level to push to level 10 — completes prog_adept ===
  send(sock, `set_level ${TEST_NAME} 10`);
  await readUntil(sock, t => /level/i.test(t) && />\s*$/.test(t.split('\n').pop() || ''), 6000);

  // The goal hook fires inside checkLevelUp, which set_level may or may not call.
  // To reliably trigger the goal evaluation we'll use the explicit goal-info read
  // path: just claim and let canClaim run isComplete via threshold (uses live level).
  send(sock, 'goal claim prog_adept');
  const claimed = await readUntil(sock, t => /\+25 QP|Not yet/i.test(t), 6000);
  check('claim of prog_adept succeeds at level 10',
    /Goal claimed: Adept/.test(claimed));
  check('claim awards QP', /\+25 QP/.test(claimed));

  // === Re-claim is rejected ===
  send(sock, 'goal claim prog_adept');
  const reclaim = await readUntil(sock, t => /Already claimed/i.test(t));
  check('re-claim rejected as already-claimed', /Already claimed/i.test(reclaim));

  // === goals list now shows [CLAIMED] for prog_adept ===
  send(sock, 'goals');
  const list2 = await readUntil(sock, t => /\[CLAIMED\]/.test(t) && /prog_adept/.test(t));
  check('goals list reflects [CLAIMED] state', /\[CLAIMED\][\s\S]{0,40}prog_adept/.test(list2));

  // === Persistence ===
  send(sock, 'save');
  await new Promise(r => setTimeout(r, 700));
  check('player save file exists', fs.existsSync(PLAYER_FILE));
  if (fs.existsSync(PLAYER_FILE)) {
    const saved = JSON.parse(fs.readFileSync(PLAYER_FILE, 'utf8'));
    check('save file has goalsClaimed array',
      Array.isArray(saved.goalsClaimed) && saved.goalsClaimed.includes('prog_adept'));
    check('save file has goalProgress object', saved.goalProgress && typeof saved.goalProgress === 'object');
    check('save file QP reflects claim', (saved.questPoints || 0) >= 25);
  }

  // === Category filter ===
  send(sock, 'goal list combat');
  const combat = await readUntil(sock, t => /\[combat\]/i.test(t) && />\s*$/.test(t.split('\n').pop() || ''));
  check('category filter shows combat header',
    /\[combat\]/i.test(combat) && !/\[economy\]/i.test(combat));

  // === categories command ===
  send(sock, 'goal categories');
  const cats = await readUntil(sock, t => /Goal categories:/i.test(t));
  check('goal categories lists all four',
    /combat/.test(cats) && /exploration/.test(cats) && /economy/.test(cats) && /progression/.test(cats));

  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 500));
  sock.destroy();

  check('server still alive after quit', proc.exitCode === null);
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
