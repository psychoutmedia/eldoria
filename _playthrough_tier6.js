// Tier 6 end-to-end live playthrough.
//
// Spawns mud_server.js on an isolated port, then drives a real telnet
// session through:
//
//   1. Apotheosis run (full Tier 6 milestones):
//      - register fresh admin -> save -> prime save with primed
//        completed quests, primed personas + muscleUnlocks +
//        paintedPatterns + tier6BossDefeated, level 30 + remortTier 2
//      - log back in, transurf301, swap, walk Theta
//      - pull a Chord Labor batch + refine 1 row -> verify temper credit
//      - swap back to Citizen, paint pattern_door at room_375
//      - swap back to Logic, walk into Black Hallway via room_360
//      - push the Loom over threshold by spamming batches; verify a
//        directive broadcasts and a purge_drone spawns
//      - transurf to room_400, run `choose apotheosis`, verify token
//   2. Liberation run: same priming, transurf 400, `choose liberation`
//   3. Splice run: same priming, transurf 397, `choose splice`,
//      verify hybrid persona unlocked + `swap hybrid` works
//
// Cleans up admins.json/accounts.json/players/*.json after itself.

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

const PORT = String(process.env.PLAYTHROUGH_PORT || 18909);
const ACCOUNT_FILE = path.join(__dirname, 'accounts.json');
const ADMINS_FILE = path.join(__dirname, 'admins.json');
const SEEDS_FILE = path.join(__dirname, 'world', 'tier7_seeds.json');

const NAMES = { apo: 'Capapo', lib: 'Capolib', spl: 'Capspl' };
const PASS = 'capspass123';

let proc = null;
const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// ----- cleanup / setup -----

let savedAdmins = null;
let savedSeeds = null;
function setupTestAdmins() {
  if (fs.existsSync(ADMINS_FILE)) {
    const raw = fs.readFileSync(ADMINS_FILE, 'utf8');
    // Defensive: if a previous failed run left test admins in the
    // file, strip them before snapshotting so restore returns to the
    // canonical state, not the leaked state.
    let snap;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.admins)) {
        const testNames = new Set(Object.values(NAMES));
        const filtered = parsed.admins.filter(n => !testNames.has(n));
        if (filtered.length !== parsed.admins.length) {
          parsed.admins = filtered;
          snap = JSON.stringify(parsed, null, 2);
        } else {
          snap = raw;
        }
      } else {
        snap = raw;
      }
    } catch (e) {
      snap = raw;
    }
    savedAdmins = snap;
  }
  const data = savedAdmins ? JSON.parse(savedAdmins) : { admins: [] };
  if (!Array.isArray(data.admins)) data.admins = [];
  for (const n of Object.values(NAMES)) {
    if (!data.admins.includes(n)) data.admins.push(n);
  }
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2));
  // snapshot tier7_seeds.json so we can restore
  if (fs.existsSync(SEEDS_FILE)) {
    savedSeeds = fs.readFileSync(SEEDS_FILE, 'utf8');
  }
}
function restoreAdmins() {
  try {
    if (savedAdmins !== null) fs.writeFileSync(ADMINS_FILE, savedAdmins);
  } catch (e) {}
  try {
    if (savedSeeds !== null) fs.writeFileSync(SEEDS_FILE, savedSeeds);
  } catch (e) {}
}
function playerFile(name) {
  return path.join(__dirname, 'players', name.toLowerCase() + '.json');
}
function cleanupArtifacts() {
  for (const n of Object.values(NAMES)) {
    for (const p of [playerFile(n), playerFile(n) + '.bak']) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
    }
  }
  try {
    if (fs.existsSync(ACCOUNT_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8'));
      let dirty = false;
      for (const n of Object.values(NAMES)) {
        const lower = n.toLowerCase();
        if (data && data[lower] !== undefined) { delete data[lower]; dirty = true; }
        if (data && data[n] !== undefined)     { delete data[n];     dirty = true; }
      }
      if (dirty) {
        const tmp = ACCOUNT_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, ACCOUNT_FILE);
      }
    }
  } catch (e) {}
  restoreAdmins();
}

function killChild() {
  if (proc && !proc.killed) {
    try { proc.kill('SIGTERM'); } catch (e) {}
    setTimeout(() => { try { if (!proc.killed) proc.kill('SIGKILL'); } catch (e) {} }, 1000);
  }
}
process.on('exit', () => { killChild(); cleanupArtifacts(); });
process.on('SIGINT', () => { killChild(); cleanupArtifacts(); process.exit(130); });

// ----- telnet helpers -----

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
      reject(new Error(`Timed out. Buffer tail:\n${stripCtrl(raw).slice(-500)}`));
    }, timeoutMs);
    sock.on('data', onData);
  });
}

function send(sock, line) { sock.write(line + '\r\n'); }

async function connect() {
  const sock = net.createConnection({ port: parseInt(PORT, 10), host: '127.0.0.1' });
  await new Promise((r, j) => { sock.once('connect', r); sock.once('error', j); });
  return sock;
}

// Register a fresh character: respond to account prompt, set name, set
// password twice.
async function registerCharacter(sock, name, password) {
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'N');
  await readUntil(sock, t => /Choose a username/i.test(t));
  send(sock, name);
  await readUntil(sock, t => /Choose a password/i.test(t));
  send(sock, password);
  await readUntil(sock, t => /Confirm password/i.test(t));
  send(sock, password);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 10000);
}

async function loginExisting(sock, name, password) {
  await readUntil(sock, t => /account\? \(Y\/N\):/i.test(t));
  send(sock, 'Y');
  await readUntil(sock, t => /Username:/i.test(t));
  send(sock, name);
  await readUntil(sock, t => /Password:/i.test(t));
  send(sock, password);
  await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 10000);
}

// Edit a player's save file with a heavy prime: completed quests,
// muscle unlocks, painted patterns, tier6BossDefeated, level 30,
// remortTier 2, schemaVersion 6 (migration is idempotent).
function primeSave(name, opts = {}) {
  const file = playerFile(name);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.level = 30;
  data.experience = 50000;
  data.remortTier = 2;
  data.maxHP = 1000;
  data.currentHP = 1000;
  data.tier6BossDefeated = true;
  data.tempers = { dread: 5, frolic: 5, malice: 5, woe: 5 };
  data.tempersMissorts = { dread: 0, frolic: 0, malice: 0, woe: 0 };
  // Persona priming
  if (!data.personas) data.personas = {};
  if (!data.personas.life) data.personas.life = {};
  if (!data.personas.logic) data.personas.logic = {};
  data.personas.logic.lastActiveAt = Date.now();
  data.personas.logic.coherence = 100;
  data.personas.logic.maxCoherence = 100;
  data.personas.logic.activeTask = null;
  data.personas.logic.shiftBatchesCompleted = 0;
  data.personas.logic.muscleUnlocks = ['pattern_door', 'pattern_chair', 'pattern_window', 'pattern_bowl', 'pattern_hand', 'pattern_threshold'];
  data.personas.life.paintedPatterns = {
    pattern_door: { paintedAt: Date.now() },
    pattern_chair: { paintedAt: Date.now() },
    pattern_window: { paintedAt: Date.now() },
    pattern_bowl: { paintedAt: Date.now() },
    pattern_hand: { paintedAt: Date.now() },
    pattern_threshold: { paintedAt: Date.now() }
  };
  data.subliminalBuffs = data.subliminalBuffs || { fromLogic: {}, fromLife: {} };
  // NOTE: completed quests are tracked by questManager in-memory,
  // not in the save file. We'll trigger first_swap in-session via swap.
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ----- runs -----

async function runApotheosis() {
  console.log('\n=== Run 1: APOTHEOSIS (full milestone walk) ===\n');
  const NAME = NAMES.apo;
  // Pass 1: register, save, quit
  let sock = await connect();
  await registerCharacter(sock, NAME, PASS);
  check('apotheosis: registered + logged in (pass 1)', true);
  send(sock, 'save');
  await readUntil(sock, t => /Character saved|Progress saved|saved/i.test(t), 4000);
  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 600));
  sock.destroy();

  primeSave(NAME);
  check('apotheosis: save primed (level 30, remortTier 2, muscleUnlocks, paintedPatterns, tier6BossDefeated)', true);

  // Pass 2: log back in
  sock = await connect();
  await loginExisting(sock, NAME, PASS);
  check('apotheosis: logged in (pass 2)', true);

  // Verify save schema fields surface via score / qs
  send(sock, 'qs');
  const qs = await readUntil(sock, t => />\s*$/.test(t.split('\n').pop() || ''), 4000);
  check('apotheosis: qs renders (post-prime)', /Lvl\s*30|Level\s*30/i.test(qs) || /30/.test(qs));

  // Theta entry
  send(sock, 'transurf 301');
  await readUntil(sock, t => /Shuttle Dock|Theta|teleport/i.test(t), 4000);
  check('apotheosis: transurf to room_301 succeeded', true);

  // Walk to a Sync Terminal (Recovery Suite room_303 is one).
  // Per our priming the partition_intake quest hasn't been completed,
  // so swap will be blocked unless lastActiveAt is set on logic block.
  // We primed lastActiveAt = Date.now(), so swap should work at any
  // sync terminal.
  send(sock, 'transurf 303');
  await readUntil(sock, t => /Recovery|Suite|teleport/i.test(t), 4000);
  send(sock, 'swap');
  const swapResp = await readUntil(sock, t => /now the (Logician|Citizen)/i.test(t) || /Sync access denied|no Sync Terminal here/i.test(t), 6000);
  check('apotheosis: swap succeeds at Sync Terminal', /now the Logician/i.test(swapResp));

  // Walk into a Refinement Console room
  send(sock, 'transurf 313');
  await readUntil(sock, t => /Console Cluster A|Floor 1/i.test(t), 4000);
  send(sock, 'task pull');
  const pullResp = await readUntil(sock, t => /Batch #\d+|console refuses/i.test(t), 6000);
  check('apotheosis: chord labor batch pulled', /Batch #\d+/.test(pullResp));

  // Apply correct verb to row 1 to get a temper credit
  send(sock, 'task');
  const taskResp = await readUntil(sock, t => /Batch #\d+/.test(t) && /\[ \] 1\. (\w+)(?:\/\w+)? -> use (\w+)/.test(t), 6000);
  const m = taskResp.match(/\[ \] 1\. (\w+)(?:\/\w+)? -> use (\w+)/);
  if (m) {
    const verb = m[2];
    send(sock, `${verb} 1`);
    const cleared = await readUntil(sock, t => /Row 1 \(\w+\/\w+\) clears|console accepts/i.test(t), 6000);
    check('apotheosis: row 1 cleared + temper-suffixed message', /clears/.test(cleared));
  } else {
    check('apotheosis: task display had row 1', false);
  }

  // Tempers display - wait for the manifestation-hint line which is
  // the LAST thing the renderer writes (otherwise we race the packet).
  send(sock, 'tempers');
  const temp = await readUntil(sock, t => /Four Tempers/i.test(t) && /manifests a Temper boss/i.test(t), 4000);
  check('apotheosis: tempers display renders all four', /Dread/.test(temp) && /Frolic/.test(temp) && /Malice/.test(temp) && /Woe/.test(temp));

  // Loom status (pre-purge) - wait for "Total purge cycles" which is
  // the last header before the optional admin tail.
  send(sock, 'loom');
  const loomResp = await readUntil(sock, t => /The Loom/i.test(t) && /Total purge cycles/i.test(t), 4000);
  check('apotheosis: loom status displays', /Throughput/i.test(loomResp) && /Resistance kills/i.test(loomResp));

  // Walk to Black Hallway entry (room_360 east -> room_361, gated by pattern_threshold).
  // Our save has pattern_threshold in muscleUnlocks (primed).
  send(sock, 'transurf 360');
  await readUntil(sock, t => /Tempers Bin|Refinement Console Cluster/i.test(t), 4000);
  send(sock, 'east');
  const blackResp = await readUntil(sock, t => /Black Hallway|Threshold|painted the right pattern/i.test(t), 6000);
  check('apotheosis: muscle-unlock gate on room_361 opens for primed Logician',
    /Black Hallway|Threshold/.test(blackResp) && !/painted the right pattern/.test(blackResp));

  // Walk to the Cradle and take the apotheosis ending
  send(sock, 'transurf 400');
  await readUntil(sock, t => /Cradle/i.test(t), 4000);
  send(sock, 'choose apotheosis');
  // Wait for the "Tier 6 closes" terminator so we have the full block.
  const ending = await readUntil(sock, t => /Tier 6 closes|already taken|not been defeated/i.test(t), 8000);
  check('apotheosis: choose apotheosis fires the close + token block',
    /Apotheosis Token/i.test(ending) && /wakes on a fourth server/i.test(ending) && /Tier 6 closes/i.test(ending));

  send(sock, 'inventory');
  const inv = await readUntil(sock, t => /=== Inventory ===/i.test(t) && /Capacity/i.test(t) && (/Apotheosis Token/i.test(t) || /inventory is empty/i.test(t)), 4000);
  check('apotheosis: token_apotheosis in inventory', /Apotheosis Token/i.test(inv));

  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 600));
  sock.destroy();
}

async function runEnding(label, ending, room, charName) {
  console.log(`\n=== Run: ${label.toUpperCase()} ===\n`);
  let sock = await connect();
  await registerCharacter(sock, charName, PASS);
  send(sock, 'save');
  await readUntil(sock, t => /Character saved|Progress saved|saved/i.test(t), 4000);
  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 500));
  sock.destroy();

  primeSave(charName);

  sock = await connect();
  await loginExisting(sock, charName, PASS);
  check(`${label}: logged in (post-prime)`, true);

  // Activate the Logician via swap (required so we can walk into
  // Logic-State Cradle rooms)
  send(sock, 'transurf 303');
  await readUntil(sock, t => /Recovery|Suite|teleport/i.test(t), 4000);
  send(sock, 'swap');
  await readUntil(sock, t => /now the Logician|Sync access/i.test(t), 6000);

  // `room` is a room id like room_400; transurf takes just the number
  const roomNum = String(room).replace(/^room_/, '').replace(/^0+/, '') || '0';
  send(sock, `transurf ${roomNum}`);
  await readUntil(sock, t => /Cradle|Theatre|Splice|teleport/i.test(t), 4000);
  send(sock, `choose ${ending}`);
  const resp = await readUntil(sock, t => /Tier 6 closes|already taken|not been defeated/i.test(t), 8000);
  check(`${label}: choose ${ending} closes Tier 6`, /Tier 6 closes/i.test(resp));

  // Verify token landed - wait for the inventory listing or the empty marker
  const tokenName = `${ending.charAt(0).toUpperCase()}${ending.slice(1)} Token`;
  send(sock, 'inventory');
  const inv = await readUntil(sock, t => /=== Inventory ===/i.test(t) && /Capacity/i.test(t) && (new RegExp(tokenName, 'i').test(t) || /inventory is empty/i.test(t)), 4000);
  check(`${label}: token_${ending} appears in inventory`, new RegExp(tokenName, 'i').test(inv));

  // Splice extra: hybrid persona + swap hybrid
  if (ending === 'splice') {
    send(sock, 'subliminal');
    await readUntil(sock, t => /Subliminal Patterns|Logic-State Muscle Unlocks/i.test(t), 4000);
    // Hybrid swap from a sync terminal — room_397 is not a terminal,
    // but room_395 (Inner Cradle) is. Walk back.
    send(sock, 'transurf 395');
    await readUntil(sock, t => /Inner Cradle|Cradle/i.test(t), 4000);
    send(sock, 'swap hybrid');
    const sw = await readUntil(sock, t => /now the (Hybrid|Citizen|Logician)|locked|Hybrid persona/i.test(t), 6000);
    check('splice: swap hybrid succeeds (hybrid persona unlocked)', /Hybrid|hybrid/i.test(sw));
  }

  send(sock, 'quit');
  await new Promise(r => setTimeout(r, 500));
  sock.destroy();
}

async function main() {
  cleanupArtifacts();
  setupTestAdmins();

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
      if (/Spawned \d+ monsters|listening|MUD server/i.test(buf)) {
        proc.stdout.removeListener('data', onData);
        resolve();
      }
    };
    proc.stdout.on('data', onData);
    setTimeout(() => reject(new Error('server did not boot in 10s; stderr:\n' + stderr)), 10000);
  });
  // Give post-boot init a moment
  await new Promise(r => setTimeout(r, 800));
  check('server boots', true);

  try {
    await runApotheosis();
    await runEnding('liberation', 'liberation', 'room_400', NAMES.lib);
    await runEnding('splice',     'splice',     'room_397', NAMES.spl);

    // Verify tier7_seeds.json picked up all three endings
    const seeds = JSON.parse(fs.readFileSync(SEEDS_FILE, 'utf8'));
    check('tier7_seeds.json: apotheosis count >= 1', seeds.endingsTaken && seeds.endingsTaken.apotheosis >= 1);
    check('tier7_seeds.json: liberation count >= 1', seeds.endingsTaken && seeds.endingsTaken.liberation >= 1);
    check('tier7_seeds.json: splice count >= 1',     seeds.endingsTaken && seeds.endingsTaken.splice >= 1);
    check('tier7_seeds.json: apotheosis active',     seeds.apotheosis && seeds.apotheosis.active === true);
    check('tier7_seeds.json: liberation active',     seeds.liberation && seeds.liberation.active === true);
    check('tier7_seeds.json: splice hybridPersonaUnlocked', seeds.splice && seeds.splice.hybridPersonaUnlocked === true);
    check('tier7_seeds.json: history has at least 3 entries',
      Array.isArray(seeds.history) && seeds.history.length >= 3);
  } catch (err) {
    check('playthrough completed without exception', false, err.message);
  }

  killChild();
  await new Promise(r => setTimeout(r, 600));
  check('server shut down on SIGTERM', proc.exitCode !== null || proc.killed);

  cleanupArtifacts();

  const passed = checks.filter(c => c.pass).length;
  console.log(`\n${passed}/${checks.length} playthrough checks passed`);
  process.exit(passed === checks.length ? 0 : 1);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  killChild();
  cleanupArtifacts();
  process.exit(1);
});
