// GMCP (Generic MUD Communication Protocol) — Tier 4.4
// Telnet subnegotiation layer. Lets supporting clients (Mudlet, MUSHclient,
// Blowtorch, etc.) receive structured JSON data for HP bars, automap, status
// displays, etc.
//
// Wire format:
//   server -> client:  IAC SB GMCP "Package.Sub" "JSON_data" IAC SE
//   client -> server:  IAC SB GMCP "Package.Sub" "JSON_data" IAC SE
//
// Negotiation:
//   server: IAC WILL GMCP        (we offer)
//   client: IAC DO GMCP          (client accepts)  --> enabled
//   client: IAC DONT GMCP        (client refuses)  --> stays disabled
//
// We only emit if the client confirmed support. Plain telnet sessions see
// nothing — the bytes are filtered out cleanly by the parser.

const IAC  = 255; // 0xFF
const DONT = 254; // 0xFE
const DO   = 253; // 0xFD
const WONT = 252; // 0xFC
const WILL = 251; // 0xFB
const SB   = 250; // 0xFA
const SE   = 240; // 0xF0

const GMCP_OPT = 201; // 0xC9
const MSDP_OPT = 69;  // 0x45

// MSDP control bytes (per tintin++/Aardwolf MSDP spec)
const MSDP_VAR         = 1;
const MSDP_VAL         = 2;
const MSDP_TABLE_OPEN  = 3;
const MSDP_TABLE_CLOSE = 4;
const MSDP_ARRAY_OPEN  = 5;
const MSDP_ARRAY_CLOSE = 6;

// Parser states for the IAC state machine
const ST_NORMAL     = 0;
const ST_IAC        = 1;
const ST_WILL       = 2;
const ST_WONT       = 3;
const ST_DO         = 4;
const ST_DONT       = 5;
const ST_SB         = 6;
const ST_SB_IAC     = 7;

// Per-socket state map (avoids polluting socket object directly)
const socketState = new WeakMap();

function getState(socket) {
  let s = socketState.get(socket);
  if (!s) {
    s = {
      parserState: ST_NORMAL,
      sbBuffer: [],            // accumulated subnegotiation payload
      sbOption: null,          // the option byte (e.g. GMCP_OPT)
      gmcpEnabled: false,
      msdpEnabled: false,
      msdpReported: new Set(),  // variables the client subscribed to via REPORT
      clientName: null,
      clientVersion: null
    };
    socketState.set(socket, s);
  }
  return s;
}

// === Negotiation: announce support to the client ===
//
// Call once on connect. We send "IAC WILL GMCP" — the client either responds
// "IAC DO GMCP" (accepts) which our parser will catch and flip the flag, or
// it ignores us / sends DONT and we stay disabled.
function offerSupport(socket) {
  if (!socket || socket.destroyed) return;
  try {
    socket.write(Buffer.from([IAC, WILL, GMCP_OPT]));
  } catch (e) {
    // socket may already be closing; ignore
  }
}

// === Send a GMCP message to the client ===
//
// Only writes if the client has confirmed GMCP support via IAC DO GMCP.
// Safe to call from anywhere — silently no-ops on plain telnet sessions.
function send(socket, packageName, data) {
  if (!socket || socket.destroyed) return;
  const state = getState(socket);
  if (!state.gmcpEnabled) return;
  let payload;
  if (data === undefined || data === null) {
    payload = packageName;
  } else if (typeof data === 'string') {
    payload = `${packageName} ${data}`;
  } else {
    try {
      payload = `${packageName} ${JSON.stringify(data)}`;
    } catch (e) {
      return; // unserializable data, drop silently
    }
  }
  // Encode payload as UTF-8 bytes; escape any literal 0xFF as IAC IAC inside SB
  const payloadBytes = Buffer.from(payload, 'utf8');
  const escaped = [];
  for (const b of payloadBytes) {
    if (b === IAC) { escaped.push(IAC, IAC); } else { escaped.push(b); }
  }
  const frame = Buffer.from([IAC, SB, GMCP_OPT, ...escaped, IAC, SE]);
  try { socket.write(frame); } catch (e) { /* socket closing */ }
}

// === MSDP: announce support ===
//
// MSDP is a sister protocol to GMCP — older, byte-tagged rather than JSON.
// Mudlet, MUSHclient, tintin++ and Aardwolf-derived clients all speak it.
// Exposed variables: CHARACTER_NAME, HEALTH, HEALTH_MAX, MANA, MANA_MAX,
// LEVEL, EXPERIENCE, ROOM_VNUM, ROOM_NAME, ROOM_AREA, ROOM_EXITS, GOLD.
function offerMsdpSupport(socket) {
  if (!socket || socket.destroyed) return;
  try {
    socket.write(Buffer.from([IAC, WILL, MSDP_OPT]));
  } catch (e) { /* socket closing */ }
}

// Encode a JS value as MSDP byte fragments.
//   string/number  -> raw UTF-8 bytes
//   array          -> ARRAY_OPEN VAL <item> VAL <item> ... ARRAY_CLOSE
//   plain object   -> TABLE_OPEN VAR k VAL <v> VAR k VAL <v> ... TABLE_CLOSE
function msdpEncodeValue(value) {
  if (Array.isArray(value)) {
    const parts = [Buffer.from([MSDP_ARRAY_OPEN])];
    for (const item of value) {
      parts.push(Buffer.from([MSDP_VAL]));
      parts.push(msdpEncodeValue(item));
    }
    parts.push(Buffer.from([MSDP_ARRAY_CLOSE]));
    return Buffer.concat(parts);
  }
  if (value !== null && typeof value === 'object') {
    const parts = [Buffer.from([MSDP_TABLE_OPEN])];
    for (const [k, v] of Object.entries(value)) {
      parts.push(Buffer.from([MSDP_VAR]));
      parts.push(Buffer.from(String(k), 'utf8'));
      parts.push(Buffer.from([MSDP_VAL]));
      parts.push(msdpEncodeValue(v));
    }
    parts.push(Buffer.from([MSDP_TABLE_CLOSE]));
    return Buffer.concat(parts);
  }
  return Buffer.from(String(value === null || value === undefined ? '' : value), 'utf8');
}

// Decode an MSDP body (the bytes between IAC SB MSDP and IAC SE) into a flat
// object of varname -> value. Used to interpret client SEND/REPORT/LIST.
function msdpDecode(bytes) {
  const result = {};
  let i = 0;
  function parseScalar() {
    const start = i;
    while (i < bytes.length && bytes[i] >= 7) i++;
    return Buffer.from(bytes.slice(start, i)).toString('utf8');
  }
  function parseValue() {
    if (i >= bytes.length) return '';
    if (bytes[i] === MSDP_TABLE_OPEN) {
      i++;
      const obj = {};
      while (i < bytes.length && bytes[i] !== MSDP_TABLE_CLOSE) {
        if (bytes[i] !== MSDP_VAR) { i++; continue; }
        i++;
        const name = parseScalar();
        if (bytes[i] === MSDP_VAL) { i++; obj[name] = parseValue(); }
      }
      if (bytes[i] === MSDP_TABLE_CLOSE) i++;
      return obj;
    }
    if (bytes[i] === MSDP_ARRAY_OPEN) {
      i++;
      const arr = [];
      while (i < bytes.length && bytes[i] !== MSDP_ARRAY_CLOSE) {
        if (bytes[i] !== MSDP_VAL) { i++; continue; }
        i++;
        arr.push(parseValue());
      }
      if (bytes[i] === MSDP_ARRAY_CLOSE) i++;
      return arr;
    }
    return parseScalar();
  }
  while (i < bytes.length) {
    if (bytes[i] !== MSDP_VAR) { i++; continue; }
    i++;
    const name = parseScalar();
    if (bytes[i] === MSDP_VAL) { i++; result[name] = parseValue(); }
  }
  return result;
}

// Send a single MSDP variable update. Silently no-ops when MSDP not enabled.
function sendMsdp(socket, varName, value) {
  if (!socket || socket.destroyed) return;
  const state = getState(socket);
  if (!state.msdpEnabled) return;
  const body = Buffer.concat([
    Buffer.from([MSDP_VAR]),
    Buffer.from(String(varName), 'utf8'),
    Buffer.from([MSDP_VAL]),
    msdpEncodeValue(value)
  ]);
  // Escape any literal 0xFF inside the SB block as IAC IAC
  const escaped = [];
  for (const b of body) {
    if (b === IAC) { escaped.push(IAC, IAC); } else { escaped.push(b); }
  }
  const frame = Buffer.from([IAC, SB, MSDP_OPT, ...escaped, IAC, SE]);
  try { socket.write(frame); } catch (e) { /* socket closing */ }
}

function isMsdpEnabled(socket) {
  if (!socket) return false;
  const s = socketState.get(socket);
  return !!(s && s.msdpEnabled);
}

// === Process incoming bytes ===
//
// Strips telnet negotiation/subnegotiation bytes from the stream and emits
// events. Returns the cleaned bytes (game commands that should be passed to
// the line buffer).
//
// Events emitted (caller-provided handler):
//   { type: 'gmcp_enabled' }            client confirmed DO GMCP
//   { type: 'gmcp_disabled' }           client sent DONT GMCP
//   { type: 'gmcp_message', package, payload }
//   { type: 'msdp_enabled' / 'msdp_disabled' }
//
// Pure on the input buffer; per-socket state lives in the WeakMap.
function processIncoming(socket, data, onEvent) {
  const state = getState(socket);
  const out = [];
  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    switch (state.parserState) {
      case ST_NORMAL:
        if (byte === IAC) state.parserState = ST_IAC;
        else out.push(byte);
        break;
      case ST_IAC:
        if (byte === IAC) {
          out.push(IAC); // literal escaped 0xFF in stream
          state.parserState = ST_NORMAL;
        } else if (byte === WILL) state.parserState = ST_WILL;
        else if (byte === WONT) state.parserState = ST_WONT;
        else if (byte === DO)   state.parserState = ST_DO;
        else if (byte === DONT) state.parserState = ST_DONT;
        else if (byte === SB) {
          state.parserState = ST_SB;
          state.sbBuffer = [];
          state.sbOption = null;
        } else {
          // Other 2-byte command (NOP, AYT, etc.) - consume and ignore
          state.parserState = ST_NORMAL;
        }
        break;
      case ST_WILL:
        // Client offers: we acknowledge or refuse
        if (byte === GMCP_OPT) {
          // We don't expect WILL GMCP from client (we offer first); acknowledge with DO so they can send
          try { socket.write(Buffer.from([IAC, DO, GMCP_OPT])); } catch (e) {}
        } else if (byte === MSDP_OPT) {
          try { socket.write(Buffer.from([IAC, DO, MSDP_OPT])); } catch (e) {}
        }
        state.parserState = ST_NORMAL;
        break;
      case ST_WONT:
        state.parserState = ST_NORMAL;
        break;
      case ST_DO:
        // Client accepts our offer
        if (byte === GMCP_OPT) {
          state.gmcpEnabled = true;
          if (onEvent) onEvent({ type: 'gmcp_enabled' });
        } else if (byte === MSDP_OPT) {
          state.msdpEnabled = true;
          if (onEvent) onEvent({ type: 'msdp_enabled' });
        } else {
          // We didn't offer this option; refuse politely
          try { socket.write(Buffer.from([IAC, WONT, byte])); } catch (e) {}
        }
        state.parserState = ST_NORMAL;
        break;
      case ST_DONT:
        if (byte === GMCP_OPT) {
          state.gmcpEnabled = false;
          if (onEvent) onEvent({ type: 'gmcp_disabled' });
        } else if (byte === MSDP_OPT) {
          state.msdpEnabled = false;
          if (onEvent) onEvent({ type: 'msdp_disabled' });
        }
        state.parserState = ST_NORMAL;
        break;
      case ST_SB:
        if (state.sbOption === null) {
          state.sbOption = byte;
        } else if (byte === IAC) {
          state.parserState = ST_SB_IAC;
        } else {
          state.sbBuffer.push(byte);
        }
        break;
      case ST_SB_IAC:
        if (byte === SE) {
          // End of subnegotiation
          if (state.sbOption === GMCP_OPT && onEvent) {
            const text = Buffer.from(state.sbBuffer).toString('utf8');
            // Format: "Package.Name JSON_payload" or just "Package.Name"
            const spaceIdx = text.indexOf(' ');
            const pkg = spaceIdx === -1 ? text.trim() : text.slice(0, spaceIdx).trim();
            const payloadStr = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();
            let payload = null;
            if (payloadStr) {
              try { payload = JSON.parse(payloadStr); } catch (e) { payload = payloadStr; }
            }
            handleIncomingGmcp(socket, state, pkg, payload, onEvent);
          } else if (state.sbOption === MSDP_OPT) {
            const decoded = msdpDecode(state.sbBuffer);
            handleIncomingMsdp(socket, state, decoded, onEvent);
          }
          state.sbBuffer = [];
          state.sbOption = null;
          state.parserState = ST_NORMAL;
        } else if (byte === IAC) {
          state.sbBuffer.push(IAC); // escaped 0xFF
          state.parserState = ST_SB;
        } else {
          // Malformed (IAC followed by something other than SE or IAC); abandon
          state.sbBuffer = [];
          state.sbOption = null;
          state.parserState = ST_NORMAL;
        }
        break;
    }
  }
  return Buffer.from(out);
}

// === Built-in handlers for client->server GMCP messages ===
function handleIncomingGmcp(socket, state, pkg, payload, onEvent) {
  // Standard "Core" packages we recognise without forwarding to game logic
  if (pkg === 'Core.Hello' && payload && typeof payload === 'object') {
    state.clientName = payload.client || null;
    state.clientVersion = payload.version || null;
    return;
  }
  if (pkg === 'Core.Supports.Set' || pkg === 'Core.Supports.Add') {
    // Client is announcing supported packages; we don't gate emits on this,
    // but record it for future use
    return;
  }
  // Pass everything else through as a generic event for the game layer
  if (onEvent) onEvent({ type: 'gmcp_message', package: pkg, payload });
}

// === Built-in handlers for client->server MSDP messages ===
//
// Standard MSDP commands the client can send us (per MSDP spec):
//   LIST       - "COMMANDS" / "REPORTABLE_VARIABLES" / "REPORTED_VARIABLES" / "SENDABLE_VARIABLES"
//   REPORT     - subscribe to one or more variables (push on change)
//   UNREPORT   - unsubscribe
//   SEND       - one-shot "give me the current value of X"
//   RESET      - reset reportable list
//
// We answer LIST and SEND immediately, track REPORT subscriptions so callers
// can choose to gate updates if they want (game code currently always pushes
// to enabled clients regardless). Unknown commands forward to the game layer.
function handleIncomingMsdp(socket, state, vars, onEvent) {
  const reportableVars = [
    'CHARACTER_NAME', 'HEALTH', 'HEALTH_MAX', 'MANA', 'MANA_MAX',
    'LEVEL', 'EXPERIENCE', 'GOLD',
    'ROOM_VNUM', 'ROOM_NAME', 'ROOM_AREA', 'ROOM_EXITS'
  ];
  const sendableVars = reportableVars.concat(['SERVER_NAME', 'SERVER_TIME']);
  const supportedCommands = ['LIST', 'REPORT', 'UNREPORT', 'SEND', 'RESET'];

  for (const [varName, value] of Object.entries(vars)) {
    if (varName === 'LIST') {
      const target = String(value || '').toUpperCase();
      if (target === 'COMMANDS') {
        sendMsdp(socket, 'COMMANDS', supportedCommands);
      } else if (target === 'REPORTABLE_VARIABLES') {
        sendMsdp(socket, 'REPORTABLE_VARIABLES', reportableVars);
      } else if (target === 'REPORTED_VARIABLES') {
        sendMsdp(socket, 'REPORTED_VARIABLES', [...state.msdpReported]);
      } else if (target === 'SENDABLE_VARIABLES') {
        sendMsdp(socket, 'SENDABLE_VARIABLES', sendableVars);
      }
    } else if (varName === 'REPORT') {
      const list = Array.isArray(value) ? value : [value];
      for (const v of list) state.msdpReported.add(String(v).toUpperCase());
    } else if (varName === 'UNREPORT') {
      const list = Array.isArray(value) ? value : [value];
      for (const v of list) state.msdpReported.delete(String(v).toUpperCase());
    } else if (varName === 'RESET') {
      const target = String(value || '').toUpperCase();
      if (target === 'REPORTABLE_VARIABLES' || target === 'REPORTED_VARIABLES') {
        state.msdpReported.clear();
      }
    } else if (varName === 'SEND') {
      // The game layer must answer SEND with current values; bubble it up
      const list = Array.isArray(value) ? value : [value];
      if (onEvent) onEvent({ type: 'msdp_send', vars: list.map(v => String(v).toUpperCase()) });
    } else {
      if (onEvent) onEvent({ type: 'msdp_message', name: varName, value });
    }
  }
}

// Push the standard MSDP variable set for a player. Used on login, level-up,
// movement — same hot points as their GMCP equivalents.
function emitMsdpPlayerState(socket, player) {
  if (!isMsdpEnabled(socket) || !player) return;
  sendMsdp(socket, 'CHARACTER_NAME', player.name || '');
  sendMsdp(socket, 'HEALTH', player.currentHP || 0);
  sendMsdp(socket, 'HEALTH_MAX', player.maxHP || 0);
  sendMsdp(socket, 'MANA', player.currentMana || 0);
  sendMsdp(socket, 'MANA_MAX', player.maxMana || 0);
  sendMsdp(socket, 'LEVEL', player.level || 1);
  sendMsdp(socket, 'EXPERIENCE', player.experience || 0);
  sendMsdp(socket, 'GOLD', player.gold || 0);
}

function emitMsdpVitals(socket, player) {
  if (!isMsdpEnabled(socket) || !player) return;
  sendMsdp(socket, 'HEALTH', player.currentHP || 0);
  sendMsdp(socket, 'HEALTH_MAX', player.maxHP || 0);
  sendMsdp(socket, 'MANA', player.currentMana || 0);
  sendMsdp(socket, 'MANA_MAX', player.maxMana || 0);
}

function emitMsdpRoom(socket, player, room, roomId) {
  if (!isMsdpEnabled(socket) || !room) return;
  sendMsdp(socket, 'ROOM_VNUM', roomId || (player && player.currentRoom) || '');
  sendMsdp(socket, 'ROOM_NAME', room.name || '');
  sendMsdp(socket, 'ROOM_AREA', room.zone || '');
  sendMsdp(socket, 'ROOM_EXITS', room.exits ? Object.keys(room.exits) : []);
}

// === Convenience: standard package emitters ===
//
// These are thin wrappers around send() that build the canonical payload
// shape for each well-known package. Game code calls these without needing
// to know GMCP encoding rules.

function emitCharVitals(socket, player) {
  if (!player) return;
  send(socket, 'Char.Vitals', {
    hp: player.currentHP || 0,
    maxhp: player.maxHP || 0,
    mp: player.currentMana || 0,
    maxmp: player.maxMana || 0,
    xp: player.experience || 0
  });
}

function emitCharStats(socket, player) {
  if (!player) return;
  const a = player.abilities || {};
  send(socket, 'Char.Stats', {
    str: a.str || 10,
    dex: a.dex || 10,
    con: a.con || 10,
    int: a.int || 10,
    wis: a.wis || 10,
    level: player.level || 1,
    practice: player.practicePoints || 0
  });
}

function emitCharStatus(socket, player) {
  if (!player) return;
  send(socket, 'Char.Status', {
    name: player.name || '',
    title: player.title || '',
    suffix: player.suffix || '',
    class: player.charClass || null,
    tier: player.remortTier || 0,
    gold: player.gold || 0,
    bank: player.bank || 0,
    qp: player.questPoints || 0,
    clan: player.clan || null,
    clanRank: player.clanRank || null
  });
}

function emitRoomInfo(socket, player, room, roomId) {
  if (!room) return;
  send(socket, 'Room.Info', {
    id: roomId || (player && player.currentRoom) || '',
    name: room.name || '',
    zone: room.zone || '',
    exits: room.exits ? Object.keys(room.exits) : [],
    description: room.shortDescription || ''
  });
}

function emitCommChannel(socket, channel, talker, text) {
  send(socket, 'Comm.Channel.Text', {
    channel: channel || '',
    talker: talker || '',
    text: text || ''
  });
}

function isGmcpEnabled(socket) {
  if (!socket) return false;
  const s = socketState.get(socket);
  return !!(s && s.gmcpEnabled);
}

function getClientInfo(socket) {
  const s = socketState.get(socket);
  if (!s) return null;
  return { name: s.clientName, version: s.clientVersion, gmcpEnabled: s.gmcpEnabled };
}

// Strip socket state on disconnect (WeakMap will GC eventually but explicit is cleaner)
function cleanup(socket) {
  socketState.delete(socket);
}

module.exports = {
  // Constants exposed for tests
  IAC, SB, SE, WILL, WONT, DO, DONT, GMCP_OPT, MSDP_OPT,
  MSDP_VAR, MSDP_VAL, MSDP_TABLE_OPEN, MSDP_TABLE_CLOSE, MSDP_ARRAY_OPEN, MSDP_ARRAY_CLOSE,
  // Lifecycle
  offerSupport, offerMsdpSupport, processIncoming, cleanup,
  // Sending (GMCP)
  send, isGmcpEnabled, getClientInfo,
  // Sending (MSDP)
  sendMsdp, isMsdpEnabled,
  // Standard GMCP emitters
  emitCharVitals, emitCharStats, emitCharStatus, emitRoomInfo, emitCommChannel,
  // Standard MSDP emitters
  emitMsdpPlayerState, emitMsdpVitals, emitMsdpRoom
};
