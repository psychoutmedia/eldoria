// Tier 4.5 — live-server smoke test for triggers.
//
// Spawns mud_server.js on an isolated port, registers a fresh test player,
// exercises the full trigger command surface, then shuts the server down.
// Verifies the trigger persists into the player save file.
//
// Run from repo root:  node _smoke_triggers.js

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const checks = [];
let proc = null;
const TEST_NAME = 'Trigsmokie';            // unique-ish; cleaned up after
const TEST_PASS = 'smoketest123';
const PORT = String(process.env.SMOKE_PORT || 18889);
const PLAYER_FILE = path.join(__dirname, 'players', TEST_NAME.toLowerCase() + '.json');
const PLAYER_BAK  = PLAYER_FILE + '.bak';
const ACCOUNT_FILE = path.join(__dirname, 'accounts.json');

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
  // Remove the test character file & .bak (do NOT touch the live accounts file)
  for (const p of [PLAYER_FILE, PLAYER_BAK]) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  }
  // Remove the test account from accounts file
  try {
    if (fs.existsSync(ACCOUNT_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
      if (data && typeof data === 'object') {
        const lower = TEST_NAME.toLowerCase();
        const wasPresent = data[lower] !== undefined || data[TEST_NAME] !== undefined;
        if (data[lower] !== undefined) delete data[lower];
        if (data[TEST_NAME] !== undefined) delete data[TEST_NAME];
        if (wasPresent) {
          const tmp = ACCOUNT_FILE + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
          fs.renameSync(tmp, ACCOUNT_FILE);
        }
      }
    }
  } catch (e) { /* best effort */ }
}

process.on('exit', () => { killChild(); cleanupArtifacts(); });
process.on('SIGINT', () => { killChild(); cleanupArtifacts(); process.exit(130); });

// Read until the buffer satisfies a predicate. Returns cleaned (IAC+ANSI stripped) text.
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
      reject(new Error(`Timed out waiting. Last buffer:\n${stripCtrl(raw).slice(-400)}`));
    }, timeoutMs);
    sock.on('data', onData);
  });
}

function stripCtrl(buf) {
  // Strip telnet IAC sub-negotiation/option commands (any 0xFF + 2 bytes — close enough for prompt-watching).
  const stripped = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 0xFF) {
      // Best-effort: IAC SB ... IAC SE blocks may be longer; for prompt detection
      // we just discard until next IAC SE if SB, otherwise skip 2.
      if (buf[i + 1] === 250 /* SB */) {
        let j = i + 2;
        while (j < buf.length - 1 && !(buf[j] === 0xFF && buf[j + 1] === 240 /* SE */)) j++;
        i = j + 1;
      } else {
        i += 2;
      }
      continue;
    }
    stripped.push(b);
  }
  return Buffer.from(stripped).toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
}

function send(sock, line) {
  sock.write(line + '\r\n');
}

async function main() {
  cleanupArtifacts();  // start clean
  console.log(`Spawning mud_server.js on port ${PORT}...`);
  proc = spawn(process.execPath, [path.join(__dirname, 'mud_server.js')], {
    env: Object.assign({}, process.env, { MUD_PORT: PORT }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  proc.stderr.on('data', (b) => { stderr += b.toString(); });

  // Wait for the auctions log line — proves full startup
  await new Promise((resolve, reject) => {
    let buf = '';
    const onData = (b) => {
      buf += b.toString();
      if (/Loaded \d+ active auction/.test(buf)) {
        proc.stdout.removeListener('data', onData);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error('Server failed to boot in 15s')), 15000);
  });
  check('server reaches full startup', true);

  // Connect and register
  const sock = net.createConnection({ port: parseInt(PORT, 10), host: '127.0.0.1' });
  await new Promise((resolve) => sock.once('connect', resolve));
  check('TCP socket connected', true);

  // Wait for "Do you have an account?" prompt
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'N');
  await readUntil(sock, t => /Choose a username/i.test(t));
  send(sock, TEST_NAME);
  await readUntil(sock, t => /Choose a password/i.test(t));
  send(sock, TEST_PASS);
  await readUntil(sock, t => /Confirm password/i.test(t));
  send(sock, TEST_PASS);
  // After registration, server completes login and shows banner+score
  // Wait for the prompt > to settle
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 8000);
  check('player registered + logged in', true);

  // === trigger help ===
  send(sock, 'trigger help');
  const help = await readUntil(sock, t => /Limits:/i.test(t) && />\s*$/.test(t.split('\n').pop() || ''));
  check('trigger help shows Limits line', /Limits:.*triggers per player/i.test(help));
  check('trigger help shows Safety line', /Safety:.*cooldown/i.test(help));

  // === trigger add ===
  send(sock, 'trigger add wakeup -> say morning');
  const added = await readUntil(sock, t => /Trigger \d+ added:/i.test(t));
  check('trigger add reports id + pattern',
    /Trigger 1 added: "wakeup" -> "say morning"/.test(added));

  // === trigger list ===
  send(sock, 'trigger list');
  // Wait until the trigger row is in the buffer, not just the header
  const list1 = await readUntil(sock, t => /wakeup.*say morning/.test(t));
  check('trigger list shows the trigger we added',
    /wakeup.*say morning/.test(list1) && /\[on\]/.test(list1));

  // === trigger toggle ===
  send(sock, 'trigger toggle 1');
  const toggled = await readUntil(sock, t => /now\s+(?:ENABLED|disabled)/i.test(t));
  check('trigger toggle reports new state',
    /Trigger 1 is now disabled/i.test(toggled));

  // === trigger list (disabled state) ===
  send(sock, 'trigger list');
  const list2 = await readUntil(sock, t => /\[off\]/.test(t));
  check('trigger list reflects disabled state', /\[off\]/.test(list2));

  // === Reject malformed add ===
  // Capture from a known sentinel so we don't see leftover "trigger add" echo.
  // Send list first to flush, then send the bogus command and wait for the prompt
  // to return with the Usage line in between.
  send(sock, 'trigger list');
  await readUntil(sock, t => /no triggers|triggers/i.test(t));
  send(sock, 'trigger add bogus-no-arrow');
  const bogus = await readUntil(sock, t => /Usage: trigger add/i.test(t));
  check('trigger add rejects malformed syntax', /Usage: trigger add/i.test(bogus));

  // === Reject regex action that includes "trigger ..." (recursion guard) ===
  send(sock, 'trigger add foo -> trigger clear');
  const recursion = await readUntil(sock, t => /cannot themselves|Usage|Trigger \d+ added/i.test(t));
  check('action-level recursion guard blocks trigger-managing actions',
    /cannot themselves manage/i.test(recursion));

  // === trigger remove ===
  send(sock, 'trigger remove 1');
  const removed = await readUntil(sock, t => /Trigger 1 removed/i.test(t));
  check('trigger remove reports success', /Trigger 1 removed/i.test(removed));

  // === trigger list (empty) ===
  send(sock, 'trigger list');
  const list3 = await readUntil(sock, t => /no triggers/i.test(t));
  check('trigger list reports empty after remove', /no triggers/i.test(list3));

  // === Add one more, then verify it persists into the save file ===
  send(sock, 'trigger add saved -> say persisted');
  await readUntil(sock, t => /Trigger \d+ added/i.test(t));

  // Force a save by issuing the `save` command
  send(sock, 'save');
  // Brief wait for save flush
  await new Promise(r => setTimeout(r, 600));

  check('player save file written', fs.existsSync(PLAYER_FILE));
  if (fs.existsSync(PLAYER_FILE)) {
    const saved = JSON.parse(fs.readFileSync(PLAYER_FILE, 'utf8'));
    check('save file has triggers array', Array.isArray(saved.triggers));
    check('save file contains the persisted trigger',
      saved.triggers && saved.triggers.length === 1
      && saved.triggers[0].pattern === 'saved'
      && saved.triggers[0].action === 'say persisted');
  }

  // === Disconnect cleanly ===
  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 500));
  sock.destroy();

  // Server still alive after a connect/quit cycle
  check('server still alive after registration + quit', proc.exitCode === null);

  killChild();
  await new Promise(r => setTimeout(r, 600));
  check('server shut down cleanly on SIGTERM', proc.exitCode !== null || proc.killed);

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
