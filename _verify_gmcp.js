// Tier 4.4 GMCP verification
// Tests the protocol module in isolation: parser correctness + emit byte sequences.
const gmcp = require('./protocol/gmcp');
const fs = require('fs');

const checks = [];
function check(label, pass, detail) {
  checks.push({ label, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${label}${detail ? ' - ' + detail : ''}`);
}

// === Mock socket that captures writes ===
function mockSocket() {
  const writes = [];
  return {
    destroyed: false,
    write(buf) { writes.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)); return true; },
    _writes: writes,
    _written: () => Buffer.concat(writes)
  };
}

// === offerSupport sends IAC WILL GMCP ===
{
  const s = mockSocket();
  gmcp.offerSupport(s);
  const out = s._written();
  check('offerSupport sends IAC WILL GMCP',
    out.length === 3 && out[0] === 255 && out[1] === 251 && out[2] === 201,
    `bytes: ${[...out].map(b => b.toString(16)).join(' ')}`);
}

// === Client sends DO GMCP - parser flips enabled flag ===
{
  const s = mockSocket();
  gmcp.offerSupport(s); // setup
  // Clear writes from setup
  s._writes.length = 0;
  let evt = null;
  // IAC DO GMCP from client
  const res = gmcp.processIncoming(s, Buffer.from([255, 253, 201]), (e) => { evt = e; });
  check('client DO GMCP -> gmcp_enabled event', evt && evt.type === 'gmcp_enabled');
  check('cleaned bytes empty (negotiation absorbed)', res.length === 0, `len=${res.length}`);
  check('isGmcpEnabled true after handshake', gmcp.isGmcpEnabled(s));
}

// === Client sends DONT GMCP - parser disables ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 201]), () => {});
  let evt = null;
  gmcp.processIncoming(s, Buffer.from([255, 254, 201]), (e) => { evt = e; });
  check('client DONT GMCP -> gmcp_disabled event', evt && evt.type === 'gmcp_disabled');
  check('isGmcpEnabled false after disable', !gmcp.isGmcpEnabled(s));
}

// === send() emits proper IAC SB GMCP ... IAC SE frame ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 201]), () => {}); // enable
  s._writes.length = 0;
  gmcp.send(s, 'Char.Vitals', { hp: 50, maxhp: 100 });
  const out = s._written();
  // Expected: IAC SB GMCP "Char.Vitals {\"hp\":50,\"maxhp\":100}" IAC SE
  const startsRight = out[0] === 255 && out[1] === 250 && out[2] === 201;
  const endsRight = out[out.length - 2] === 255 && out[out.length - 1] === 240;
  const body = out.slice(3, -2).toString('utf8');
  check('send() frame format (IAC SB GMCP ... IAC SE)', startsRight && endsRight,
    `start=${out.slice(0,3).toString('hex')}, end=${out.slice(-2).toString('hex')}`);
  check('send() body contains package name', body.startsWith('Char.Vitals'), `body="${body}"`);
  check('send() body contains JSON payload', body.includes('"hp":50') && body.includes('"maxhp":100'), `body="${body}"`);
}

// === send() no-ops if GMCP not enabled ===
{
  const s = mockSocket();
  // No DO GMCP yet
  gmcp.send(s, 'Char.Vitals', { hp: 50 });
  check('send() no-ops on disabled session', s._writes.length === 0);
}

// === Parser strips IAC sequences from mixed data ===
{
  const s = mockSocket();
  // Plain "hello" with embedded IAC NOP (255, 241) and IAC IAC (literal 0xFF) and IAC DO GMCP
  // hello = 68 65 6c 6c 6f
  // After: hello + 0xFF (literal) + world
  const input = Buffer.from([
    0x68, 0x65, 0x6c, 0x6c, 0x6f,            // hello
    255, 241,                                  // IAC NOP (consume)
    255, 253, 201,                             // IAC DO GMCP (enable)
    0x77, 0x6f, 0x72, 0x6c, 0x64,             // world
    255, 255,                                  // IAC IAC (literal 0xFF in stream)
    0x21                                        // !
  ]);
  let evtCount = 0;
  const cleaned = gmcp.processIncoming(s, input, (e) => { if (e.type === 'gmcp_enabled') evtCount++; });
  // Compare as bytes (UTF-8 toString mangles 0xFF). Expected: "hello" + "world" + 0xFF + "!"
  const expected = Buffer.concat([
    Buffer.from('helloworld', 'ascii'),
    Buffer.from([0xFF]),
    Buffer.from('!', 'ascii')
  ]);
  check('parser strips IAC commands and emits enable event',
    evtCount === 1 && cleaned.equals(expected),
    `cleaned hex=${cleaned.toString('hex')} expected hex=${expected.toString('hex')}`);
}

// === Subnegotiation: client sends Core.Hello back ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 201]), () => {}); // enable
  // Build: IAC SB GMCP "Core.Hello {\"client\":\"Mudlet\",\"version\":\"4.17\"}" IAC SE
  const payload = Buffer.from('Core.Hello {"client":"Mudlet","version":"4.17"}', 'utf8');
  const frame = Buffer.concat([Buffer.from([255, 250, 201]), payload, Buffer.from([255, 240])]);
  let lastEvt = null;
  gmcp.processIncoming(s, frame, (e) => { lastEvt = e; });
  // Core.Hello is consumed internally, so no gmcp_message event for it
  const info = gmcp.getClientInfo(s);
  check('Core.Hello records client name/version',
    info && info.name === 'Mudlet' && info.version === '4.17',
    `info=${JSON.stringify(info)}`);
}

// === Subnegotiation: generic GMCP message bubbles up ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 201]), () => {}); // enable
  const payload = Buffer.from('Char.Login {"name":"Alice","password":"secret"}', 'utf8');
  const frame = Buffer.concat([Buffer.from([255, 250, 201]), payload, Buffer.from([255, 240])]);
  let captured = null;
  gmcp.processIncoming(s, frame, (e) => { if (e.type === 'gmcp_message') captured = e; });
  check('Generic GMCP message bubbles up via gmcp_message event',
    captured && captured.package === 'Char.Login' && captured.payload && captured.payload.name === 'Alice',
    `evt=${JSON.stringify(captured)}`);
}

// === Standard emitters produce well-formed payloads ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 201]), () => {});
  s._writes.length = 0;
  const player = {
    currentHP: 80, maxHP: 100, currentMana: 30, maxMana: 50, experience: 1234,
    abilities: { str: 12, dex: 10, con: 14, int: 8, wis: 9 },
    level: 15, practicePoints: 6,
    name: 'Alice', title: 'the Patient', suffix: 'of the Two Servers',
    charClass: 'warder', remortTier: 1, gold: 500, bank: 1000, questPoints: 75,
    clan: 'shadow_walkers', clanRank: 'leader'
  };
  gmcp.emitCharVitals(s, player);
  gmcp.emitCharStats(s, player);
  gmcp.emitCharStatus(s, player);
  check('emitCharVitals + emitCharStats + emitCharStatus produced 3 frames', s._writes.length === 3);
  // Decode each frame and verify payload
  for (const buf of s._writes) {
    const body = buf.slice(3, -2).toString('utf8');
    const parts = body.split(' ');
    const pkg = parts[0];
    const json = JSON.parse(parts.slice(1).join(' '));
    if (pkg === 'Char.Vitals') {
      check('Char.Vitals payload', json.hp === 80 && json.maxhp === 100 && json.mp === 30 && json.maxmp === 50);
    } else if (pkg === 'Char.Stats') {
      check('Char.Stats payload', json.str === 12 && json.level === 15 && json.practice === 6);
    } else if (pkg === 'Char.Status') {
      check('Char.Status payload', json.name === 'Alice' && json.tier === 1 && json.clan === 'shadow_walkers');
    }
  }
}

// === Server-side wiring checks ===
{
  const src = fs.readFileSync('mud_server.js', 'utf8');
  check('gmcp module imported', /require\('\.\/protocol\/gmcp'\)/.test(src));
  check('gmcp.offerSupport called on connect', /gmcp\.offerSupport\(socket\)/.test(src));
  check('gmcp.processIncoming wired in data handler', /gmcp\.processIncoming\(socket, rawData/.test(src));
  check('gmcp.cleanup called on disconnect', /gmcp\.cleanup\(socket\)/.test(src));
  check('completePlayerLogin pushes initial state', /gmcp\.emitCharStatus\(socket, player\)[\s\S]*?gmcp\.emitCharVitals\(socket, player\)/.test(src));
  check('handleMove emits Room.Info', /gmcpRoom\(player\)/.test(src));
  check('combat tick emits Char.Vitals', /gmcp\.emitCharVitals\(socket, player\);[\s\S]{1,200}Automatic combat/.test(src));
  check('checkLevelUp emits status+stats+vitals', /Auto-save on level up[\s\S]+?gmcp\.emitCharStats/.test(src));
  check('handleUse emits vitals after consumable', /healMessage[\s\S]+?gmcp\.emitCharVitals/.test(src));
  check('Channel msg emits Comm.Channel.Text', /gmcp\.emitCommChannel\(sock, channelKey/.test(src));
  check('Clan channel emits Comm.Channel.Text', /gmcp\.emitCommChannel\(s, `clan:/.test(src));
  // MSDP wiring
  check('MSDP offerMsdpSupport called on connect', /gmcp\.offerMsdpSupport\(socket\)/.test(src));
  check('MSDP push on login', /gmcp\.emitMsdpPlayerState\(socket, player\)/.test(src));
  check('MSDP push on move (msdpRoom helper)', /msdpRoom\(player\)/.test(src));
  check('MSDP push on combat tick', /gmcp\.emitMsdpVitals\(socket, player\)/.test(src));
  check('MSDP push on level-up', /Auto-save on level up[\s\S]+?gmcp\.emitMsdpPlayerState/.test(src));
  check('MSDP SEND request answered in onGmcpEvent', /msdp_send[\s\S]+?gmcp\.sendMsdp/.test(src));
  check('MSDP enabled-event triggers initial push', /msdp_enabled[\s\S]+?gmcp\.emitMsdpPlayerState/.test(src));
}

// ============================================================================
// === MSDP tests (Tier 4.4 sister protocol) =================================
// ============================================================================

// === offerMsdpSupport sends IAC WILL MSDP ===
{
  const s = mockSocket();
  gmcp.offerMsdpSupport(s);
  const out = s._written();
  check('offerMsdpSupport sends IAC WILL MSDP',
    out.length === 3 && out[0] === 255 && out[1] === 251 && out[2] === 69,
    `bytes: ${[...out].map(b => b.toString(16)).join(' ')}`);
}

// === Client DO MSDP enables it ===
{
  const s = mockSocket();
  let evt = null;
  const res = gmcp.processIncoming(s, Buffer.from([255, 253, 69]), (e) => { evt = e; });
  check('client DO MSDP -> msdp_enabled event', evt && evt.type === 'msdp_enabled');
  check('cleaned bytes empty (MSDP negotiation absorbed)', res.length === 0);
  check('isMsdpEnabled true after handshake', gmcp.isMsdpEnabled(s));
}

// === Client DONT MSDP disables it ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  let evt = null;
  gmcp.processIncoming(s, Buffer.from([255, 254, 69]), (e) => { evt = e; });
  check('client DONT MSDP -> msdp_disabled event', evt && evt.type === 'msdp_disabled');
  check('isMsdpEnabled false after disable', !gmcp.isMsdpEnabled(s));
}

// === sendMsdp() emits IAC SB MSDP VAR..VAL.. IAC SE for scalar ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {}); // enable
  s._writes.length = 0;
  gmcp.sendMsdp(s, 'HEALTH', 80);
  const out = s._written();
  const startsRight = out[0] === 255 && out[1] === 250 && out[2] === 69;
  const endsRight = out[out.length - 2] === 255 && out[out.length - 1] === 240;
  // Body: VAR "HEALTH" VAL "80"
  // After SB MSDP: byte 3 should be MSDP_VAR (1)
  const varTag = out[3] === 1;
  const nameMatches = out.slice(4, 10).toString('utf8') === 'HEALTH';
  const valTag = out[10] === 2;
  const valMatches = out.slice(11, 13).toString('utf8') === '80';
  check('sendMsdp scalar frame format', startsRight && endsRight && varTag && nameMatches && valTag && valMatches,
    `hex=${out.toString('hex')}`);
}

// === sendMsdp() emits ARRAY for array values ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  s._writes.length = 0;
  gmcp.sendMsdp(s, 'ROOM_EXITS', ['north', 'south']);
  const out = s._written();
  // After IAC SB MSDP VAR "ROOM_EXITS" VAL ARRAY_OPEN VAL "north" VAL "south" ARRAY_CLOSE IAC SE
  const body = out.slice(3, -2);
  const hasArrayOpen = [...body].includes(5);
  const hasArrayClose = [...body].includes(6);
  const containsNorth = body.toString('binary').includes('north');
  const containsSouth = body.toString('binary').includes('south');
  check('sendMsdp array frame contains ARRAY_OPEN/CLOSE and items',
    hasArrayOpen && hasArrayClose && containsNorth && containsSouth,
    `body hex=${body.toString('hex')}`);
}

// === sendMsdp() emits TABLE for object values ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  s._writes.length = 0;
  gmcp.sendMsdp(s, 'ROOM', { VNUM: 'room_001', NAME: 'The Plaza' });
  const out = s._written();
  const body = out.slice(3, -2);
  const hasTableOpen = [...body].includes(3);
  const hasTableClose = [...body].includes(4);
  check('sendMsdp table frame contains TABLE_OPEN/CLOSE',
    hasTableOpen && hasTableClose && body.toString('binary').includes('room_001') && body.toString('binary').includes('The Plaza'),
    `body hex=${body.toString('hex')}`);
}

// === sendMsdp() no-ops when disabled ===
{
  const s = mockSocket();
  gmcp.sendMsdp(s, 'HEALTH', 50);
  check('sendMsdp no-ops on disabled session', s._writes.length === 0);
}

// === Client SEND command bubbles up via msdp_send event ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  // Build: IAC SB MSDP VAR "SEND" VAL "HEALTH" IAC SE
  const body = Buffer.concat([
    Buffer.from([1]), Buffer.from('SEND', 'utf8'),
    Buffer.from([2]), Buffer.from('HEALTH', 'utf8')
  ]);
  const frame = Buffer.concat([Buffer.from([255, 250, 69]), body, Buffer.from([255, 240])]);
  let captured = null;
  gmcp.processIncoming(s, frame, (e) => { if (e.type === 'msdp_send') captured = e; });
  check('Client SEND HEALTH bubbles up as msdp_send event',
    captured && captured.vars.includes('HEALTH'),
    `evt=${JSON.stringify(captured)}`);
}

// === Client REPORT subscription is tracked ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  // VAR "REPORT" VAL ARRAY_OPEN VAL "HEALTH" VAL "MANA" ARRAY_CLOSE
  const body = Buffer.concat([
    Buffer.from([1]), Buffer.from('REPORT', 'utf8'),
    Buffer.from([2, 5]),
    Buffer.from([2]), Buffer.from('HEALTH', 'utf8'),
    Buffer.from([2]), Buffer.from('MANA', 'utf8'),
    Buffer.from([6])
  ]);
  const frame = Buffer.concat([Buffer.from([255, 250, 69]), body, Buffer.from([255, 240])]);
  s._writes.length = 0;
  gmcp.processIncoming(s, frame, () => {});
  // Now ask for the reported list
  const listFrame = Buffer.concat([
    Buffer.from([255, 250, 69, 1]),
    Buffer.from('LIST', 'utf8'),
    Buffer.from([2]),
    Buffer.from('REPORTED_VARIABLES', 'utf8'),
    Buffer.from([255, 240])
  ]);
  s._writes.length = 0;
  gmcp.processIncoming(s, listFrame, () => {});
  // Server should have responded with REPORTED_VARIABLES containing HEALTH and MANA
  const replied = Buffer.concat(s._writes);
  const repliedStr = replied.toString('binary');
  check('REPORT subscription tracked, returned in LIST REPORTED_VARIABLES',
    repliedStr.includes('REPORTED_VARIABLES') && repliedStr.includes('HEALTH') && repliedStr.includes('MANA'),
    `bytes hex=${replied.toString('hex').slice(0, 200)}`);
}

// === LIST COMMANDS returns supported MSDP commands ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  s._writes.length = 0;
  const frame = Buffer.concat([
    Buffer.from([255, 250, 69, 1]),
    Buffer.from('LIST', 'utf8'),
    Buffer.from([2]),
    Buffer.from('COMMANDS', 'utf8'),
    Buffer.from([255, 240])
  ]);
  gmcp.processIncoming(s, frame, () => {});
  const replied = Buffer.concat(s._writes).toString('binary');
  check('LIST COMMANDS reply lists LIST/REPORT/UNREPORT/SEND/RESET',
    replied.includes('COMMANDS') && replied.includes('LIST') && replied.includes('REPORT') && replied.includes('SEND'),
    `reply length ${replied.length}`);
}

// === LIST REPORTABLE_VARIABLES returns standard set ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  s._writes.length = 0;
  const frame = Buffer.concat([
    Buffer.from([255, 250, 69, 1]),
    Buffer.from('LIST', 'utf8'),
    Buffer.from([2]),
    Buffer.from('REPORTABLE_VARIABLES', 'utf8'),
    Buffer.from([255, 240])
  ]);
  gmcp.processIncoming(s, frame, () => {});
  const replied = Buffer.concat(s._writes).toString('binary');
  check('LIST REPORTABLE_VARIABLES includes core vars',
    replied.includes('HEALTH') && replied.includes('LEVEL') && replied.includes('ROOM_VNUM') && replied.includes('GOLD'));
}

// === Standard MSDP emitters produce correct frame count ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  s._writes.length = 0;
  const player = {
    name: 'Alice', currentHP: 80, maxHP: 100, currentMana: 30, maxMana: 50,
    level: 15, experience: 1234, gold: 500
  };
  gmcp.emitMsdpPlayerState(s, player);
  // 8 vars: name, hp, hpmax, mp, mpmax, level, exp, gold
  check('emitMsdpPlayerState sends 8 frames', s._writes.length === 8, `got ${s._writes.length}`);
  // Verify HEALTH frame contains "80"
  const allBytes = Buffer.concat(s._writes);
  check('emitMsdpPlayerState contains LEVEL=15',
    allBytes.toString('binary').includes('LEVEL') && allBytes.includes(Buffer.from('15', 'utf8')[0]));
  check('emitMsdpPlayerState contains CHARACTER_NAME=Alice',
    allBytes.toString('binary').includes('CHARACTER_NAME') && allBytes.toString('binary').includes('Alice'));
}

// === emitMsdpRoom encodes exits as ARRAY ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});
  s._writes.length = 0;
  const room = { name: 'The Plaza', zone: 'starting', exits: { north: 'r2', east: 'r3' } };
  gmcp.emitMsdpRoom(s, { currentRoom: 'room_001' }, room, 'room_001');
  // Should produce 4 frames: VNUM, NAME, AREA, EXITS
  check('emitMsdpRoom sends 4 frames', s._writes.length === 4);
  const exitsFrame = s._writes.find(buf => buf.toString('binary').includes('ROOM_EXITS'));
  check('emitMsdpRoom EXITS frame uses ARRAY encoding',
    exitsFrame && [...exitsFrame].includes(5) && [...exitsFrame].includes(6));
}

// === Both protocols can coexist on the same socket ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 201]), () => {}); // enable GMCP
  gmcp.processIncoming(s, Buffer.from([255, 253, 69]), () => {});  // enable MSDP
  s._writes.length = 0;
  gmcp.send(s, 'Char.Vitals', { hp: 50 });
  gmcp.sendMsdp(s, 'HEALTH', 50);
  check('GMCP + MSDP coexist on one socket (both write)', s._writes.length === 2);
  // First write is GMCP (option 201), second is MSDP (option 69)
  check('GMCP frame uses option 201', s._writes[0][2] === 201);
  check('MSDP frame uses option 69', s._writes[1][2] === 69);
}

// === MSDP option not enabled does not affect GMCP ===
{
  const s = mockSocket();
  gmcp.processIncoming(s, Buffer.from([255, 253, 201]), () => {}); // GMCP only
  s._writes.length = 0;
  gmcp.send(s, 'Char.Vitals', { hp: 50 });    // should write
  gmcp.sendMsdp(s, 'HEALTH', 50);             // should NOT write
  check('GMCP-only session: only GMCP writes (MSDP no-ops)', s._writes.length === 1 && s._writes[0][2] === 201);
}

// Summary
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
