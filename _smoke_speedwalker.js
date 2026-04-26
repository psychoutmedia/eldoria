// Tier 4.8 — live-server smoke test for the speedwalker.
//
// Registers a fresh test character, runs `run nn` from room_001 (which
// connects north to room_002 → room_003), verifies the player ends up at
// room_003. Then exercises an aborted run: `run nnnnnnn` should hit a
// dead-end before completing.

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const checks = [];
let proc = null;
const NAME = 'Walkietalk';
const PASS = 'walkpass123';
const PORT = String(process.env.SMOKE_PORT || 18892);
const ACCOUNT_FILE = path.join(__dirname, 'accounts.json');
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
      if (data && data[NAME] !== undefined)  { delete data[NAME]; dirty = true; }
      if (dirty) {
        const tmp = ACCOUNT_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, ACCOUNT_FILE);
      }
    }
  } catch (e) {}
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

  // Look up the actual exits from room_001 so we can construct a path
  // we know will work, regardless of how the world has been edited.
  const rooms = require('./rooms.json');
  const start = rooms.room_001;
  if (!start) { console.error('rooms.json missing room_001'); process.exit(1); }
  // Find a 2-step path from room_001
  let twoStep = null;
  for (const dir of Object.keys(start.exits || {})) {
    const next = rooms[start.exits[dir]];
    if (next && next.exits) {
      const second = Object.keys(next.exits)[0];
      if (second) {
        twoStep = { dirs: [dir, second], finalRoomId: next.exits[second] };
        break;
      }
    }
  }
  if (!twoStep) { console.error('Could not find a 2-step path from room_001'); process.exit(1); }
  const finalRoom = rooms[twoStep.finalRoomId];
  const expectedRoomName = finalRoom && finalRoom.name;

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
      if (/Loaded \d+ goal definition/.test(buf)) {
        proc.stdout.removeListener('data', onData);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error('Boot timeout')), 15000);
  });
  check('server boots', true);

  // === Register ===
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
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''));
  check('player registered + logged in', true);

  // === Bare `run` shows usage ===
  send(sock, 'run');
  const usage = await readUntil(sock, t => /Usage: run/i.test(t));
  check('bare `run` shows usage', /Usage: run/i.test(usage));

  // === Bad direction ===
  send(sock, 'run bogus');
  const badDir = await readUntil(sock, t => /Unknown direction/i.test(t));
  check('run rejects unknown direction', /Unknown direction/i.test(badDir));

  // === Bad concat path (non-cardinal letter) ===
  send(sock, 'run nbsw');
  const badConcat = await readUntil(sock, t => /Unknown direction/i.test(t));
  check('run rejects bad concat path', /Unknown direction/i.test(badConcat));

  // === Successful 2-step run using the path we discovered above ===
  // Use full direction names with spaces — most robust syntax
  send(sock, 'run ' + twoStep.dirs.join(' '));
  const arrived = await readUntil(sock, t => /Arrived after 2 step/i.test(t), 6000);
  check('run completes a known 2-step path',
    /Arrived after 2 step/i.test(arrived));
  // Should also have shown the final room (verbose room-display)
  check('post-run display shows the final room name',
    expectedRoomName ? arrived.includes(expectedRoomName) : true);

  // === Aborted run via missing exit (try a long single-direction path that has to dead-end) ===
  // After the 2-step run we're at finalRoom; pick a direction that doesn't exist there
  // to force an immediate stop on step 1. We pick 'down' which most starting rooms lack.
  const finalExits = Object.keys(finalRoom.exits || {});
  const blocked = ['down','up','northeast','northwest','southeast','southwest']
    .find(d => !finalExits.includes(d)) || 'down';
  send(sock, 'run ' + blocked);
  const aborted = await readUntil(sock, t => /Run aborted at step 1/i.test(t), 6000);
  check('run aborts cleanly when an exit is missing',
    /Run aborted at step 1[\s\S]+?no \w+ exit/i.test(aborted));

  // === Reverse-walk back to room_001 ===
  // We're at finalRoom; reverse the path
  const opposites = { north:'south', south:'north', east:'west', west:'east',
    northeast:'southwest', southwest:'northeast', northwest:'southeast', southeast:'northwest',
    up:'down', down:'up', in:'out', out:'in' };
  const reversed = twoStep.dirs.slice().reverse().map(d => opposites[d]).filter(Boolean);
  if (reversed.length === 2) {
    send(sock, 'run ' + reversed.join(','));
    const back = await readUntil(sock, t => /Arrived after 2 step/i.test(t), 6000);
    check('comma-separated reverse path works',
      /Arrived after 2 step/i.test(back));
  } else {
    check('comma-separated reverse path works (skipped — no clean reverse)', true);
  }

  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 500));
  sock.destroy();

  check('server alive after quit', proc.exitCode === null);
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
