// Tier 4.7 — live-server smoke test for friend list.
//
// Registers two test players A and B, adds A as B's friend, has A log in
// while B is connected, and verifies B sees the [Friends] notification.
// Then has A quit and verifies the offline notification fires too.

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const checks = [];
let proc = null;
const NAME_A = 'Friendia';   // logs in/out, watched
const NAME_B = 'Friendib';   // watcher with NAME_A on their friend list
const PASS = 'friendpass123';
const PORT = String(process.env.SMOKE_PORT || 18891);
const ACCOUNT_FILE = path.join(__dirname, 'accounts.json');
const PLAYER_FILE = (n) => path.join(__dirname, 'players', n.toLowerCase() + '.json');

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
  for (const n of [NAME_A, NAME_B]) {
    for (const p of [PLAYER_FILE(n), PLAYER_FILE(n) + '.bak']) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
    }
  }
  try {
    if (fs.existsSync(ACCOUNT_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
      let dirty = false;
      for (const n of [NAME_A, NAME_B]) {
        const lower = n.toLowerCase();
        if (data && data[lower] !== undefined)  { delete data[lower]; dirty = true; }
        if (data && data[n] !== undefined)      { delete data[n]; dirty = true; }
      }
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

async function registerPlayer(name, pass, port) {
  const sock = net.createConnection({ port, host: '127.0.0.1' });
  await new Promise((r) => sock.once('connect', r));
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'N');
  await readUntil(sock, t => /Choose a username/i.test(t));
  send(sock, name);
  await readUntil(sock, t => /Choose a password/i.test(t));
  send(sock, pass);
  await readUntil(sock, t => /Confirm password/i.test(t));
  send(sock, pass);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 8000);
  return sock;
}

async function loginPlayer(name, pass, port) {
  const sock = net.createConnection({ port, host: '127.0.0.1' });
  await new Promise((r) => sock.once('connect', r));
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'Y');
  await readUntil(sock, t => /Username/i.test(t));
  send(sock, name);
  await readUntil(sock, t => /Password/i.test(t));
  send(sock, pass);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 8000);
  return sock;
}

async function main() {
  cleanupArtifacts();
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

  // === Register A and B ===
  const sockA = await registerPlayer(NAME_A, PASS, parseInt(PORT, 10));
  check('player A registered + logged in', true);
  const sockB = await registerPlayer(NAME_B, PASS, parseInt(PORT, 10));
  check('player B registered + logged in', true);

  // === B adds A as friend ===
  send(sockB, 'friend add ' + NAME_A);
  const added = await readUntil(sockB, t => /Added .* to your friend list/i.test(t));
  check('friend add succeeds', /Added friendia/i.test(added));

  // === B lists friends — A should show as online (A is still connected) ===
  send(sockB, 'friends');
  const list = await readUntil(sockB, t => /\[online\]|\[offline\]/.test(t));
  check('friend list shows online status', /\[online\][\s\S]{0,30}friendia/i.test(list) || /\[online\][\s\S]{0,80}Friendia/i.test(list));

  // === Self-friend rejected ===
  send(sockB, 'friend add ' + NAME_B);
  const selfReject = await readUntil(sockB, t => /yourself/i.test(t));
  check('friend add rejects self', /yourself/i.test(selfReject));

  // === Duplicate add rejected ===
  send(sockB, 'friend add ' + NAME_A);
  const dup = await readUntil(sockB, t => /already on your friend list/i.test(t));
  check('friend add rejects duplicate', /already/i.test(dup));

  // === Invalid name rejected ===
  send(sockB, 'friend add Bad1Name');
  const badName = await readUntil(sockB, t => /letters/i.test(t));
  check('friend add rejects invalid name', /letters/i.test(badName));

  // === A quits, B should see offline notification ===
  // Drain any prior output on B before triggering A's quit
  let drainBuf = '';
  const drainHandler = (chunk) => { drainBuf += chunk.toString(); };
  sockB.on('data', drainHandler);
  send(sockA, 'quit');
  // Wait a moment for the quit + broadcast to propagate
  await new Promise(r => setTimeout(r, 1500));
  sockB.removeListener('data', drainHandler);
  const cleanDrain = stripCtrl(Buffer.from(drainBuf, 'binary'));
  check('B receives offline [Friends] notification when A quits',
    /\[Friends\][\s\S]{0,80}gone offline/i.test(cleanDrain),
    `drain tail: "${cleanDrain.slice(-150).replace(/\r?\n/g, ' ')}"`);

  // === A logs back in, B should see online notification ===
  drainBuf = '';
  sockB.on('data', drainHandler);
  const sockA2 = await loginPlayer(NAME_A, PASS, parseInt(PORT, 10));
  await new Promise(r => setTimeout(r, 1000));
  sockB.removeListener('data', drainHandler);
  const cleanDrain2 = stripCtrl(Buffer.from(drainBuf, 'binary'));
  check('B receives online [Friends] notification when A logs in',
    /\[Friends\][\s\S]{0,80}come online/i.test(cleanDrain2),
    `drain tail: "${cleanDrain2.slice(-150).replace(/\r?\n/g, ' ')}"`);

  // === friend remove ===
  send(sockB, 'friend remove ' + NAME_A);
  const removed = await readUntil(sockB, t => /Removed .* from your friend list/i.test(t));
  check('friend remove succeeds', /Removed friendia/i.test(removed));

  // === friend list now empty ===
  send(sockB, 'friend list');
  const empty = await readUntil(sockB, t => /no friends/i.test(t));
  check('empty list shows hint', /no friends/i.test(empty));

  // === Persistence: B's empty list survives a save ===
  send(sockB, 'save');
  await new Promise(r => setTimeout(r, 600));
  const sB = JSON.parse(fs.readFileSync(PLAYER_FILE(NAME_B), 'utf8'));
  check('save file has friends array', Array.isArray(sB.friends));
  check('save file friends array is empty after remove', sB.friends.length === 0);

  // Persistence with one entry
  send(sockB, 'friend add ' + NAME_A);
  await readUntil(sockB, t => /Added/i.test(t));
  send(sockB, 'save');
  await new Promise(r => setTimeout(r, 600));
  const sB2 = JSON.parse(fs.readFileSync(PLAYER_FILE(NAME_B), 'utf8'));
  check('save file persists added friend (lowercase)',
    Array.isArray(sB2.friends) && sB2.friends.includes(NAME_A.toLowerCase()));

  send(sockA2, 'quit');
  send(sockB,  'quit');
  await new Promise(r => setTimeout(r, 800));
  sockA.destroy(); sockA2.destroy(); sockB.destroy();

  check('server alive after both quit', proc.exitCode === null);
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
