// Tier 6.4 - live-server smoke test for Chord Labor.
//
// Spawns mud_server.js, registers a fresh test admin, primes their
// save file so the Logician persona is unlocked + parked at a Chord
// Terminal, then exercises: task pull -> repeated verb application
// (parsing the batch description for the right verb on each row) ->
// batch completion -> quota counter increment -> task abandon path
// after a second pull. Verifies the cycle leaderboard picked up the
// batch.

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const checks = [];
let proc = null;
const NAME = 'Chordwright';
const PASS = 'chordpass123';
const PORT = String(process.env.SMOKE_PORT || 18896);
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
  // Only act if we actually snapshotted; otherwise we'd be deleting
  // a pre-existing admins.json on the initial pre-run cleanup pass.
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

// Parse the verb to use against row N from a `task` describeBatch
// output. Returns the verb string or null if not found.
function verbForRow(taskOutput, n) {
  const re = new RegExp(`\\[ \\] ${n}\\. (\\w+) -> use (\\w+)`);
  const m = taskOutput.match(re);
  return m ? { rowType: m[1], verb: m[2] } : null;
}

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
      if (/MUD Server.*started|MUD Server.*listening|listening on port/i.test(buf)
          || /Loaded \d+ active echo sign/.test(buf)) {
        proc.stdout.removeListener('data', onData);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error('Boot timeout. stdout tail:\n' + buf.slice(-400))), 15000);
  });
  check('server boots', true);

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
  check('player registered + logged in (pass 1)', true);

  send(sock, 'save');
  await readUntil(sock, t => /Character saved|Progress saved|saved/i.test(t), 4000);
  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 800));
  sock.destroy();

  // === Edit save: prime the Logician persona at a Chord Terminal ===
  let saveOk = false;
  try {
    const data = JSON.parse(fs.readFileSync(PLAYER_FILE, 'utf8'));
    if (!data.personas) throw new Error('no personas after pass 1');
    if (!data.personas.logic) throw new Error('no logic block');
    data.personas.logic.lastActiveAt = Date.now();
    data.personas.logic.currentRoom = 'room_313';
    data.personas.logic.coherence = 100;
    data.personas.logic.maxCoherence = 100;
    data.personas.logic.activeTask = null;
    data.personas.logic.shiftBatchesCompleted = 0;
    data.personas.logic.lifetimeBatches = data.personas.logic.lifetimeBatches || 0;
    fs.writeFileSync(PLAYER_FILE, JSON.stringify(data, null, 2));
    saveOk = true;
  } catch (e) {
    check('player save primed for Logician unlock', false, e.message);
  }
  if (saveOk) check('player save primed for Logician unlock', true);

  // === Pass 2: log back in, swap, run a batch ===
  sock = net.createConnection({ port: parseInt(PORT, 10), host: '127.0.0.1' });
  await new Promise((r) => sock.once('connect', r));
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'Y');
  await readUntil(sock, t => /username/i.test(t));
  send(sock, NAME);
  await readUntil(sock, t => /password/i.test(t.toLowerCase()));
  send(sock, PASS);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 8000);
  check('player logged in (pass 2)', true);

  // Citizen-side rejection paths
  send(sock, 'task pull');
  const r1 = await readUntil(sock, t => /Logician duty|Swap into Logic-State/i.test(t));
  check('task pull rejects Citizen', /Logician duty|Swap into Logic-State/i.test(r1));

  send(sock, 'sort 1');
  const r2 = await readUntil(sock, t => /does nothing here|Logician operation/i.test(t));
  check('sort rejects outside Logic-State', /does nothing here/i.test(r2));

  send(sock, 'quota');
  const r3 = await readUntil(sock, t => /apply to Logicians|Swap into Logic-State/i.test(t));
  check('quota rejects Citizen', /apply to Logicians/i.test(r3));

  // transurf to a Sync Terminal that's also Logic-State (room_311)
  send(sock, 'transurf 311');
  await readUntil(sock, t => /Antechamber|Refinement Floor 1 - Antechamber/i.test(t), 6000);
  check('transurf to room_311 (sync terminal)', true);

  send(sock, 'swap');
  const swapResp = await readUntil(sock, t => /now the Logician/i.test(t), 6000);
  check('swap to Logician succeeds with primed lastActiveAt', /now the Logician/i.test(swapResp));

  // We should be in room_313 (Cluster A) after the swap (we primed logic.currentRoom).
  send(sock, 'look');
  const lookResp = await readUntil(sock, t => /Console Cluster A|Cluster A/i.test(t), 6000);
  check('logician landed at room_313 (Cluster A)', /Cluster A/i.test(lookResp));

  // Pull a batch — wait for the full describeBatch tail (the row list)
  send(sock, 'task pull');
  const pullResp = await readUntil(sock, t => /Batch #\d+/.test(t) && /\d+ rows:/.test(t), 6000);
  check('task pull dispenses a batch', /Batch #\d+/.test(pullResp));
  check('batch description carries 4 rows for Cluster A', /4 rows/.test(pullResp));

  // Show task and parse rows
  send(sock, 'task');
  const taskResp = await readUntil(sock, t => /Batch #\d+/.test(t) && /\[ \] \d+\. \w+ -> use \w+/.test(t), 6000);
  check('task shows the active batch', /Batch #\d+/.test(taskResp));

  // Walk every row with the correct verb (parsed from describeBatch).
  // Cluster A = 4 rows.
  for (let n = 1; n <= 4; n++) {
    const v = verbForRow(taskResp, n);
    if (!v) {
      check(`row ${n} verb parsed`, false, 'no match in describeBatch');
      break;
    }
    send(sock, `${v.verb} ${n}`);
    if (n < 4) {
      await readUntil(sock, t => new RegExp(`Row ${n}.*clears`).test(t), 6000);
      check(`row ${n} clears with ${v.verb}`, true);
    } else {
      // Final row triggers reward block
      const winResp = await readUntil(sock, t => /Batch Refined/i.test(t) && /XP/.test(t), 6000);
      check('final row triggers Batch Refined block', /Batch Refined/i.test(winResp));
      check('reward includes Theta-credits',     /Theta-credits/.test(winResp));
      check('reward includes practice point',    /practice point/.test(winResp));
    }
  }

  // Quota should now be 1/3
  send(sock, 'quota');
  const quotaResp = await readUntil(sock, t => /Shift: \d+\/\d+/i.test(t), 6000);
  check('quota counter incremented to 1/3', /Shift: 1\/3/.test(quotaResp));

  // Pull and abandon a second batch
  send(sock, 'task pull');
  await readUntil(sock, t => /Batch #\d+/.test(t), 6000);
  send(sock, 'task abandon');
  const abandonResp = await readUntil(sock, t => /reabsorbed/i.test(t), 6000);
  check('task abandon clears the batch', /reabsorbed/i.test(abandonResp));

  // task should now report none active
  send(sock, 'task');
  const taskAfterAbandon = await readUntil(sock, t => /no active task/i.test(t), 6000);
  check('task reports no active task after abandon', /no active task/i.test(taskAfterAbandon));

  // Leaderboard should show the player as Refinement Champion
  send(sock, 'leaderboard');
  const lbResp = await readUntil(sock, t => /CHAMPIONS/i.test(t) && /Refinement Champion/i.test(t), 6000);
  check('leaderboard shows Refinement Champion entry',
    /Refinement Champion: Chordwright \(1 batches\)/.test(lbResp));

  // Swap back out and confirm shift counter resets
  send(sock, 'transurf 311');
  await readUntil(sock, t => /Antechamber/i.test(t), 6000);
  send(sock, 'swap');
  await readUntil(sock, t => /now the Citizen/i.test(t), 6000);
  check('swap back to Citizen succeeds', true);

  send(sock, 'transurf 311');
  await readUntil(sock, t => /Antechamber/i.test(t), 6000);
  send(sock, 'swap');
  await readUntil(sock, t => /now the Logician/i.test(t), 6000);

  send(sock, 'quota');
  const quotaReset = await readUntil(sock, t => /Shift: \d+\/\d+/i.test(t), 6000);
  check('shift counter resets at start of new shift',
    /Shift: 0\/3/.test(quotaReset));

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
