// Tier 6.3 — live-server smoke test for Life-State Township + echoes.
//
// Spawns mud_server.js, registers a fresh test admin, transurfs to the
// Township, exercises the `arrange` and `stack` verbs, and verifies the
// signs persist into world/echoes.json on disk.

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const checks = [];
let proc = null;
const NAME = 'Townie';
const PASS = 'townpass123';
const PORT = String(process.env.SMOKE_PORT || 18895);
const ACCOUNT_FILE = path.join(__dirname, 'accounts.json');
const ADMINS_FILE = path.join(__dirname, 'admins.json');
const PLAYER_FILE = path.join(__dirname, 'players', NAME.toLowerCase() + '.json');
const ECHOES_FILE = path.join(__dirname, 'world', 'echoes.json');
const ECHOES_BAK = ECHOES_FILE + '.bak';

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
let savedEchoes = null;
let savedEchoesBak = null;
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
  // Snapshot echoes state so we can restore it after
  if (fs.existsSync(ECHOES_FILE)) savedEchoes = fs.readFileSync(ECHOES_FILE, 'utf8');
  if (fs.existsSync(ECHOES_BAK))  savedEchoesBak = fs.readFileSync(ECHOES_BAK, 'utf8');
}
function restoreState() {
  try {
    if (savedAdmins !== null) fs.writeFileSync(ADMINS_FILE, savedAdmins);
    else if (fs.existsSync(ADMINS_FILE)) fs.unlinkSync(ADMINS_FILE);
  } catch (e) {}
  try {
    if (savedEchoes !== null) fs.writeFileSync(ECHOES_FILE, savedEchoes);
    else if (fs.existsSync(ECHOES_FILE)) fs.unlinkSync(ECHOES_FILE);
    if (savedEchoesBak !== null) fs.writeFileSync(ECHOES_BAK, savedEchoesBak);
    else if (fs.existsSync(ECHOES_BAK)) fs.unlinkSync(ECHOES_BAK);
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
  restoreState();
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
      if (/Loaded \d+ active echo sign/.test(buf)) {
        proc.stdout.removeListener('data', onData);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error('Boot timeout')), 15000);
  });
  check('server boots and loads echoes', true);

  // Validate static data shape via require()
  const rooms = require('./rooms.json');
  check('Township has 20 rooms (331-350)',
    Array.from({length: 20}, (_, i) => rooms['room_' + (331 + i)]).every(Boolean));
  check('room_341 (Wax Lily front door)', /Wax Lily/.test(rooms.room_341.name));
  check('room_342 contains barkeep narrative',
    /OSLO/.test(rooms.room_342.longDescription));

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

  // Admin transurf to room_337 (Town Green)
  send(sock, 'transurf 337');
  await readUntil(sock, t => /Town Green - Central Plaza/i.test(t), 6000);
  check('admin can transurf to Town Green', true);

  // === arrange a sign here ===
  send(sock, 'arrange three pebbles in a row');
  const arrangeResp = await readUntil(sock, t => /room remembers/i.test(t));
  check('arrange creates a sign', /three pebbles/.test(arrangeResp));

  // === stack a sign too ===
  send(sock, 'stack a small cairn of bottle caps');
  const stackResp = await readUntil(sock, t => /room remembers/i.test(t));
  check('stack creates a sign', /bottle caps/.test(stackResp));

  // === Reject a "say" / dialogue echo ===
  send(sock, 'arrange say something interesting');
  const reject = await readUntil(sock, t => /non-linguistic/i.test(t) || /spoken-word/i.test(t));
  check('echoes reject dialogue patterns', /non-linguistic/i.test(reject) || /spoken-word/i.test(reject));

  // === look — should display the active echoes ===
  send(sock, 'look');
  const lookOutput = await readUntil(sock, t => /Echoes here:/i.test(t) && /bottle caps/.test(t) && /three pebbles/.test(t));
  check('look renders active echoes',
    /three pebbles/.test(lookOutput) && /bottle caps/.test(lookOutput));

  // === Validate the echoes.json file on disk ===
  // The save is debounced via persistEchoes (synchronous), so it should be there.
  await new Promise(r => setTimeout(r, 400));
  if (fs.existsSync(ECHOES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ECHOES_FILE, 'utf8'));
      check('echoes.json has signs array', Array.isArray(data.signs));
      check('echoes.json contains the arrange sign',
        data.signs.some(s => s.kind === 'arrange' && /three pebbles/.test(s.text)));
      check('echoes.json contains the stack sign',
        data.signs.some(s => s.kind === 'stack' && /bottle caps/.test(s.text)));
    } catch (e) {
      check('echoes.json parses', false, e.message);
    }
  } else {
    check('echoes.json file exists', false);
  }

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
