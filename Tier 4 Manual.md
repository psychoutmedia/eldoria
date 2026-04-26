# Tier 4 Manual — Aardwolf Foundations

*Sprint 1 of the Tier 4 closure pass. This document tracks what's shipped, what's in progress, and what's planned across the eight Tier 4 phases. Each section gets the full command surface and design notes once that phase lands. Phase-by-phase status table at the top.*

## Phase status

| # | Phase | Status |
| :-- | :-- | :-- |
| 4.1 | **Clans / Guilds** | **DONE** — see "Clans" below |
| 4.2 | Auction house | not started |
| 4.3 | **Online creation (OLC, admin-only)** | **DONE (Sprint-1 scope: rooms only)** — see "OLC" below |
| 4.4 | **MSDP/GMCP protocol** | **DONE** — see "MSDP/GMCP" below |
| 4.5 | Server-side triggers | not started |
| 4.6 | Goals system | not started |
| 4.7 | Friend list | not started |
| 4.8 | Speedwalker | not started |

Plus one **pre-existing bug fix** landed alongside 4.1 (channel broadcast iteration), documented in the Bug Fixes appendix.

---

## 4.1 Clans / Guilds — SHIPPED

Player-organized social groups with shared treasury, ranks, invite system, and clan channel.

### Concepts

- **A clan** has a name (3-24 chars, must start with a letter, alphanumeric + spaces/dashes/underscores), an optional 2-5 char alphanumeric tag, a founder (immutable), a leader (transferrable), a treasury (gold pool), a motto (≤100 chars), and a member roster.
- **Three ranks:** `member` < `officer` < `leader`. Exactly one leader at all times.
- **A player** can be in at most one clan. Joining auto-clears any pending invites from other clans.
- **Founding cost:** 1000 gold. Refunded to the leader on `clan disband`.
- **Clan tag** is prepended to the player's display name everywhere via `getDisplayName` — visible in say/shout/who/combat broadcasts/etc.

### Permissions matrix

| Action | Member | Officer | Leader |
| :-- | :-- | :-- | :-- |
| `clan info` / `clan list` / `clan invites` | ✓ | ✓ | ✓ |
| `clan deposit` | ✓ | ✓ | ✓ |
| `c <message>` (channel) | ✓ | ✓ | ✓ |
| `cwho` | ✓ | ✓ | ✓ |
| `clan invite <player>` | ✗ | ✓ | ✓ |
| `clan kick <player>` | ✗ | ✓ (members only) | ✓ (anyone) |
| `clan promote <player>` | ✗ | ✗ | ✓ |
| `clan demote <player>` | ✗ | ✗ | ✓ |
| `clan withdraw <amount>` | ✗ | ✗ | ✓ |
| `clan motto <text>` | ✗ | ✗ | ✓ |
| `clan disband` | ✗ | ✗ | ✓ |
| `clan leave` | ✓ | ✓ | only if last member |

### Command reference

#### `clan` / `clan help`

Shows the command list. With no clan, suggests `clan list` or `clan create`. Inside a clan, defaults to showing your own `clan info`.

#### `clan list`

Lists every clan on the server with name, tag (if any), member count, and leader.

```
=== Clans ===
  [SW] Shadow Walkers (4 members) - leader: Alice
  [TF] The Footnotes (2 members) - leader: Henry
```

#### `clan create <name> [tag]`

Founds a new clan. Costs **1000 gold**.

- Name must be 3-24 chars, start with a letter, contain only letters/digits/spaces/hyphens/underscores.
- Tag is optional; 2-5 alphanumeric chars; must be unique across all clans.
- The creator becomes the founder + leader. Founder is immutable for posterity; leader can change.

```
clan create Shadow Walkers SW
*** Clan founded: Shadow Walkers [SW] ***
You are its first leader. 1000 gold has been spent on the founding charter.
```

The founding is broadcast globally as `[Clan] Alice has founded Shadow Walkers [SW].`

#### `clan info [name]`

With no argument, shows your own clan. With a clan name (or tag), shows that clan. Includes: motto, leader, founder, treasury, member roster sorted by rank then name with online indicators.

```
=== Shadow Walkers [SW] ===
  "We hack the cron, not the man."
  Leader:   Alice
  Founder:  Alice
  Treasury: 240 gold
  Members (3):
    [ON] leader   Alice
    [ON] officer  Bob
    [..] member   Carol
```

#### `clan invite <player>`

Officers and the leader only. Sends an invite to an online player. The target sees an inline notification immediately. Their `pendingClanInvites` list grows by one.

You can't invite someone who's already in your clan or in another clan.

#### `clan invites`

Lists your pending invites with the inviting clan's name and leader.

#### `clan accept <name>`

Joins the named clan if you have a pending invite from it. Joining clears **all** pending invites (cannot hold a slot in two clans). You enter as `member` rank.

#### `clan decline <name>`

Removes a single pending invite without joining. Other invites remain.

#### `clan leave`

Leaves your clan. Two guardrails:
- If you're the leader **and** other members exist, you must transfer leadership first (`clan promote <player>` who is currently officer or member).
- If you're the **last** member (solo leader), the clan auto-disbands and refunds the treasury to you.

Otherwise, leaves cleanly. Broadcast to the clan: `[Clan] <Name> has left the clan.`

#### `clan kick <player>`

Officers can kick members (not other officers, not the leader). The leader can kick anyone except themselves. The kicked player's clan refs clear immediately if they're online — they receive `[Clan] You have been kicked from <Clan>.`

#### `clan promote <player>`

Leader-only. Three behaviors based on target rank:
- `member` → `officer`
- `officer` → `leader` (the old leader **automatically demotes to officer** in the same operation — this is how leadership transfers are done)
- `leader` (target) — error, they're already leader

#### `clan demote <player>`

Leader-only. `officer` → `member`. Cannot demote yourself or another leader.

#### `clan deposit <amount>`

Anyone in the clan can contribute gold to the shared treasury. Broadcast to clanmates with the new total.

```
clan deposit 50
Deposited 50 gold into Shadow Walkers treasury (now 290).
```

#### `clan withdraw <amount>`

Leader-only. Pulls gold from treasury into the leader's personal gold. Broadcast to clanmates.

#### `clan motto <text>`

Leader-only. Sets the clan motto displayed in `clan info`. Max 100 characters. Empty string clears it.

#### `clan disband`

Leader-only. Dissolves the clan. The treasury (full amount) refunds to the leader's gold. All online members see `[Clan] <Name> has been disbanded by <Leader>.` and have their clan refs cleared. Broadcast globally as `[Clan] <Name> has been dissolved.`

#### `c <message>`

Clan channel. Broadcasts to all online clanmates only. Tag-prefixed format:

```
[SW] Bob: anyone up for the SYSADMIN run?
```

If the clan has no tag, the clan name is bracketed instead.

#### `cwho`

Lists online clanmates with their rank.

```
=== Shadow Walkers - online (2) ===
  leader   Alice
  officer  Bob
```

### Persistence

- **`clans.json`** at the project root holds the full clan registry. Backed up to `clans.json.bak` before every write.
- **Player file fields**: `clan` (clan ID), `clanRank` (string), `pendingClanInvites` (array of clan IDs).
- **On login**: `reconcilePlayerClan(player)` runs — if a player's saved clan was disbanded while they were offline, refs clear cleanly. If their rank in the clan changed (someone promoted/demoted them), it syncs from the clan record.

### Edge cases handled

| Scenario | Behavior |
| :-- | :-- |
| Solo leader leaves | Clan auto-disbands, treasury refunds |
| Leader gets disconnected | Their rank persists; another officer can't auto-take over (manual transfer only — admin can intervene) |
| Player joins clan while having other pending invites | Joining clears all pending invites |
| Two clans pick same name | Second create is rejected (case-insensitive) |
| Two clans pick same tag | Second create is rejected (case-insensitive) |
| Clan name with special chars | Rejected — must match `/^[A-Za-z][A-Za-z0-9 _-]*$/` |
| Negative deposit/withdraw | Rejected with "Usage:" hint |
| Withdraw more than treasury | Rejected, no partial |
| Kicked player offline | `clan members` updates immediately; their clan refs clear next login via `reconcilePlayerClan` |
| Disband while members are online | All online members notified inline, clan refs cleared in real time |

### Files touched (4.1)

- **`clans.json`** (new) — empty registry on first boot
- **`mud_server.js`** — 17 new functions (~430 lines): `loadClans`, `saveClans`, `clanIdFromName`, `getClan`, `listClans`, `getPlayerClan`, `clanRankAtLeast`, `clanMemberByName`, `isClanNameTaken`, `isClanTagTaken`, `reconcilePlayerClan`, `getOnlineClanmates`, `broadcastToClan`, `handleClan` (dispatcher), 13 sub-handlers, `handleClanChannel`, `handleClanWho`. Plus: `ensureT2Defaults` extension, save/load schema additions, `getDisplayName` clan-tag prefix, `completePlayerLogin` reconcile call, `loadClans()` at startup, command-dispatcher hooks for `clan`/`clans`/`c`/`cwho`.

### Verification (4.1)

Static + simulation suite: **38/38 PASS** (every command wired, full clan lifecycle simulated end-to-end including create/invite/accept/promote/deposit/withdraw/leadership transfer/disband).

---

## 4.2 Auction house — NOT STARTED

Per plan: `auction list/bid/post`, time-based, gold escrow, broadcasts on bid. New `auctions.json` config. Will detail commands and flow when this phase ships.

---

## 4.3 Online creation (OLC, admin-only) — SHIPPED (Sprint-1 scope)

The world-building scaffolding for in-game editing. Sprint 1 ships **room editing only** (`redit`); items and monster templates land in a follow-up.

### Concepts

- **A session** is per-admin and edits the room they're standing in. Multiple admins can edit different rooms in parallel; one admin can hold one session at a time.
- **Drafts are isolated** — edits buffer in the session and don't touch live world state until `redit save` or `redit done`.
- **Persistence is durable** — `save` updates the live `rooms` map *and* writes through to `rooms.json` with a `.bak` backup, using a temp-file + rename pattern so partial writes can't corrupt the world file.
- **Permissions** — gated through `isAdmin(player.name)` and logged via `logAdminCommand`. Non-admins get a permission-denied message.
- **No live-edit race** — the draft is a shallow copy of the room object; if another admin's `modify_room` mutates the live room while a `redit` session is open, the session's `save` overwrites their change. Use `modify_room` for ad-hoc tweaks, `redit` for considered work.

### Command surface

All subcommands live under the `redit` verb:

| Command | Effect |
| :-- | :-- |
| `redit` | Start a session on the current room (if none active) and show the draft |
| `redit show` | Display the current draft (also shown by bare `redit`) |
| `redit name <text>` | Set room name (≤ 80 chars, non-empty) |
| `redit short <text>` | Set short description (≤ 200 chars) — used in `Room.Info` GMCP and brief view |
| `redit desc <text>` | Set the long description (≤ 4000 chars, non-empty) |
| `redit zone <text>` | Set the zone label (≤ 50 chars, non-empty) |
| `redit exit <dir> <roomId>` | Add or replace an exit. `dir` accepts full names or `n/s/e/w/ne/nw/se/sw/u/d` |
| `redit exit <dir> none` | Remove the named exit |
| `redit save` | Commit the draft to the live world *and* write `rooms.json` (keeps session open) |
| `redit done` | Save + end the session |
| `redit cancel` | Discard the draft and end the session |

`redit name` / `redit short` / `redit desc` / `redit zone` / `redit exit` will **auto-start a session on the current room** if one isn't already active, so you can begin editing with a single command.

### Validation rules

- **Name:** non-empty, ≤ 80 chars
- **Zone:** non-empty, ≤ 50 chars
- **Short description:** ≤ 200 chars (may be empty)
- **Long description:** non-empty, ≤ 4000 chars
- **Exit direction:** must normalize to one of north/south/east/west/northeast/northwest/southeast/southwest/up/down
- **Exit target:** must be a known room id; `redit exit dir none` (or `remove`) deletes the exit instead
- **No self-loops:** a room cannot exit to itself
- All inputs are trimmed of trailing whitespace; descriptions and room ids preserve case (the dispatcher passes the original input through, not the lowercased command).

### Persistence flow

`redit save` does, in order:

1. Apply draft fields onto the live `rooms[roomId]` object (name, zone, shortDescription, longDescription, exits — exits is replaced wholesale via `Object.assign({}, draft.exits)`).
2. Mark the session as clean (`dirty = false`).
3. `fs.copyFileSync(rooms.json, rooms.json.bak)` — rotate the previous backup. Failure here is non-fatal; the in-memory commit already happened.
4. `fs.writeFileSync(rooms.json.tmp, JSON.stringify(rooms, 2))`
5. `fs.renameSync(rooms.json.tmp, rooms.json)` — the rename is atomic, so an interrupted save can never leave a half-written world file.

If the disk write fails, the live in-memory edit still stands and the admin sees a `WARNING: rooms.json write failed` line. Run `save_all` or restart with caution if that ever fires.

### Live broadcast

After `save` or `done`, occupants of the edited room receive a flavor message:

> *The fabric of this room shifts as a creator's edit takes hold.*

This makes edits feel intentional rather than ghostly, and prompts players to `look` again to pick up the new description.

### Module API (`world/olc.js`)

```js
start(player, rooms)            -> { ok, roomId, draft } | { ok:false, error }
get(player)                     -> { roomId, draft, dirty } | null
isEditing(player)               -> bool
activeRoom(player)              -> roomId | null
setField(player, field, value)  -> { ok, field, value } | { ok:false, error }
                                   field: 'name' | 'short' | 'desc' | 'zone'
setExit(player, dir, target, rooms)
                                -> { ok, dir, target?, removed? } | { ok:false, error }
                                   target='none' or 'remove' to delete
save(player, rooms)             -> { ok, roomId, persistError? } | { ok:false, error }
                                   (persistError is set if disk write failed)
end(player)                     -> alias for cancel
cancel(player)                  -> { ok } | { ok:false, error }
formatDraft(player)             -> string | null  (multi-line summary for display)
normalizeDir(d)                 -> canonical name | null
```

### Server-side wiring

| Hot point | What runs |
| :-- | :-- |
| `processCommand` (`redit` / `redit ...`) | Routes to `handleRedit`, passing the original case-preserved tail |
| `handleRedit` | `isAdmin` guard → subcommand parse → calls into `world/olc.js` |
| `redit save` / `redit done` | Calls `olc.save(player, rooms)` then `broadcastToRoom` for occupants |
| Admin help (`admin redit`) | One-line summary in the help map; `redit` listed in the World category |
| Logging | `logAdminCommand` fires for every state-changing subcommand (start, save, cancel, done) |

### Verification

`_verify_olc.js` runs a 53-check standalone harness. From the repo root:

```
node _verify_olc.js
```

Coverage:

- Direction normalization (full forms, short aliases, case-insensitivity, invalid input)
- Session lifecycle (start, isEditing, activeRoom, cancel, draft isolation)
- Field edits (each field, length caps, empty rejection, unknown-field rejection, no live mutation pre-save)
- Exit edits (add, replace, remove, alias direction, invalid direction, missing target room, self-loop rejection, remove-nothing rejection)
- Persistence round trip — writes to the real `rooms.json` location, asserts the file content reflects the edit, then **restores the original `rooms.json` and `rooms.json.bak` byte-for-byte** so the harness leaves the repo unchanged
- Per-player session isolation
- Server-side wiring grep checks (import, handler, dispatch, help map, world-category list, broadcast, isAdmin gate, command logging)

The persistence test is the load-bearing one — if it ever leaves residue in `rooms.json` you have a bug in either the rollback or the OLC `save` path. Run from a clean working tree to make this obvious.

### Limitations / deferred to 4.3-pt2

- **Item OLC (`oedit`)** and **monster template OLC (`medit`)** are not implemented yet — items and monsters still come from `items.json` and `monsters.json` static data.
- **Zone OLC** — adding/removing zones, editing zone-level spawn rules — not implemented.
- **No undo log** beyond the single `.bak` rotation; multiple successive `save`s only keep the most recent prior state.
- **No cross-admin lock** — two admins editing the same room will see whichever `save` runs last.
- The session is in-memory only; if the server restarts mid-edit the unsaved draft is lost (mid-edit `redit save` would have committed it, by design).

---

## 4.4 MSDP/GMCP protocol — SHIPPED

Telnet sub-negotiation layer. Rich clients (Mudlet, MUSHclient, tintin++, Blowtorch, BeipMU…) receive structured live data — HP/mana bars, automaps, status panels, channel highlights — and the plain-telnet experience is byte-for-byte unchanged.

Both sister protocols are implemented in a single module — `protocol/gmcp.js` — because they share the IAC parser and the same per-socket state map. Plain telnet sessions strip negotiation cleanly and never see a single rogue byte.

### Concepts

- **GMCP** (Generic MUD Communication Protocol, telnet option **201 / 0xC9**): JSON-payload sub-negotiation. Clients receive `Package.Subpackage <json>` messages.
- **MSDP** (Mud Server Data Protocol, telnet option **69 / 0x45**): byte-tagged sub-negotiation. Older but still widely supported. Variables not packages.
- We are the **server-side** of both — we offer support, and clients accept or ignore.
- Both protocols **silently no-op** on plain telnet. Nothing leaks into the user-visible stream.
- Both protocols can run on the same socket simultaneously and are independent.

### Wire format quick-reference

```
GMCP send:   IAC SB 201 "Package.Sub <json>" IAC SE
MSDP send:   IAC SB  69 VAR <name> VAL <value> IAC SE
             (where VAR=1, VAL=2, TABLE_OPEN=3, TABLE_CLOSE=4,
              ARRAY_OPEN=5, ARRAY_CLOSE=6)
```

Any literal `0xFF` inside the payload is escaped as `IAC IAC` per RFC 854.

### Negotiation handshake

| Step | Direction | Bytes |
| :-- | :-- | :-- |
| 1. Server offers GMCP | server → client | `IAC WILL 201` |
| 2. Server offers MSDP | server → client | `IAC WILL 69` |
| 3. Client accepts GMCP | client → server | `IAC DO 201` |
| 4. Client accepts MSDP | client → server | `IAC DO 69` |
| 5. Server pushes initial state | server → client | full vital/status/room frames |

Plain telnet clients ignore the offers — server stays silent on those options. Refusal (`IAC DONT …`) flips the per-socket flag back to disabled and the next push silently no-ops.

### GMCP packages emitted

| Package | When | Payload shape |
| :-- | :-- | :-- |
| `Char.Status` | login, level-up | `{ name, title, suffix, class, tier, gold, bank, qp, clan, clanRank }` |
| `Char.Stats` | login, level-up | `{ str, dex, con, int, wis, level, practice }` |
| `Char.Vitals` | login, level-up, combat tick, consumable use | `{ hp, maxhp, mp, maxmp, xp }` |
| `Room.Info` | login, room change | `{ id, name, zone, exits, description }` |
| `Comm.Channel.Text` | global channel msg, clan-channel msg | `{ channel, talker, text }` |

Clients that send `Core.Hello` get their name/version recorded and visible to admins via `getClientInfo`. `Core.Supports.Set` / `Core.Supports.Add` are accepted (informational only — we don't gate emits on declared support).

### MSDP variables emitted

Standard Aardwolf-derived variable set:

| Variable | Type | Pushed on |
| :-- | :-- | :-- |
| `CHARACTER_NAME` | string | login |
| `HEALTH` / `HEALTH_MAX` | int | login, level-up, combat tick, consumable |
| `MANA` / `MANA_MAX` | int | login, level-up, combat tick, consumable |
| `LEVEL` | int | login, level-up |
| `EXPERIENCE` | int | login, level-up |
| `GOLD` | int | login, level-up |
| `ROOM_VNUM` / `ROOM_NAME` / `ROOM_AREA` | string | login, room change |
| `ROOM_EXITS` | array of strings | login, room change |

Plus pseudo-variables answered on demand only (via SEND): `SERVER_NAME`, `SERVER_TIME`.

### MSDP commands the server understands

| Client command | Effect |
| :-- | :-- |
| `LIST COMMANDS` | server replies with the list above |
| `LIST REPORTABLE_VARIABLES` | server replies with the variable list above |
| `LIST REPORTED_VARIABLES` | server replies with this socket's REPORT subscriptions |
| `LIST SENDABLE_VARIABLES` | server replies with reportable + `SERVER_NAME` + `SERVER_TIME` |
| `REPORT <var>` or `REPORT [<var>, <var>]` | subscribe (currently informational — we always push) |
| `UNREPORT <var>` | unsubscribe |
| `RESET REPORTED_VARIABLES` | clear all subscriptions |
| `SEND <var>` or `SEND [<var>, <var>]` | one-shot read, server pushes the current value |

Unknown variables bubble up as a `msdp_message` event for future game-layer handling. Currently no game logic listens (parity with GMCP — clients mostly listen, not talk).

### Module API

`protocol/gmcp.js` exports:

```js
// Lifecycle
offerSupport(socket)              // server offers GMCP
offerMsdpSupport(socket)          // server offers MSDP
processIncoming(socket, data, onEvent) -> Buffer  // strips IAC, returns clean bytes
cleanup(socket)                   // wipe per-socket state on disconnect

// State
isGmcpEnabled(socket) / isMsdpEnabled(socket)
getClientInfo(socket)             // { name, version, gmcpEnabled }

// Raw send
send(socket, packageName, data)            // GMCP
sendMsdp(socket, varName, value)           // MSDP — value can be string/number/array/object

// Standard GMCP emitters
emitCharVitals / emitCharStats / emitCharStatus / emitRoomInfo / emitCommChannel

// Standard MSDP emitters
emitMsdpPlayerState(socket, player)        // 8 vars: name, hp, hpmax, mp, mpmax, level, xp, gold
emitMsdpVitals(socket, player)             // hp/mp pair only — used in combat
emitMsdpRoom(socket, player, room, roomId) // 4 vars: vnum, name, area, exits
```

Events delivered to the `onEvent` handler in `processIncoming`:

```
{ type: 'gmcp_enabled' | 'gmcp_disabled' | 'msdp_enabled' | 'msdp_disabled' }
{ type: 'gmcp_message',  package, payload }
{ type: 'msdp_message',  name, value }
{ type: 'msdp_send', vars: ['HEALTH', ...] }
```

### Server-side wiring

| Hot point | Functions called |
| :-- | :-- |
| `net.createServer` connection handler | `gmcp.offerSupport(socket)` + `gmcp.offerMsdpSupport(socket)` |
| socket `data` listener (every chunk) | `gmcp.processIncoming(socket, rawData, onGmcpEvent)` runs first; the returned cleaned bytes feed the line buffer |
| `completePlayerLogin` | full GMCP `Char.Status` + `Char.Stats` + `Char.Vitals` + `Room.Info`; full MSDP `emitMsdpPlayerState` + `emitMsdpRoom` |
| `checkLevelUp` (after auto-save) | GMCP `Char.Status` + `Char.Stats` + `Char.Vitals`; MSDP `emitMsdpPlayerState` |
| `executeMonsterCounterAttack` | GMCP `Char.Vitals`; MSDP `emitMsdpVitals` |
| `handleUse` (after consumable applied) | GMCP `Char.Vitals`; MSDP `emitMsdpVitals` |
| `handleMove` (after `currentRoom` updated) | GMCP `gmcpRoom` + `gmcpVitals`; MSDP `msdpRoom` + `msdpVitals` |
| `handleChannelMessage` (per subscribed peer) | GMCP `Comm.Channel.Text` to each socket |
| `handleClanChannel` (per online clanmate) | GMCP `Comm.Channel.Text` to each socket |
| disconnect handler | `gmcp.cleanup(socket)` |

The `onGmcpEvent` handler in `mud_server.js` reacts to `gmcp_enabled` / `msdp_enabled` events with a deferred initial-state push (in case the client confirmed support after login was already in progress) and answers `msdp_send` requests immediately by reading from the live player object.

### Plain-telnet safety

The original socket data path used to do its own ad-hoc IAC stripping. With Tier 4.4 that hand-rolled stripping is removed — `gmcp.processIncoming` is now the single point of truth for IAC handling and runs on every chunk before line-buffering. This means:

- Negotiation bytes never reach the password-input or command-input paths.
- Literal `0xFF` survives via `IAC IAC` escaping in both directions.
- A malformed sub-negotiation block is dropped silently (parser resets to NORMAL).

### Client setup notes

Mudlet:
- GMCP is on by default. The server's `Char.Vitals` package will fire the `gmcp.Char.Vitals` event in your client script.
- For MSDP, enable in **Settings → MSDP** and the `msdp.HEALTH` etc. variables become live-readable in scripts.

MUSHclient / tintin++ / Blowtorch:
- Both GMCP and MSDP are negotiated automatically once you accept our `IAC WILL` offers.
- Neither protocol prints anything to the user's screen — they're parsed and routed by the client's plugin layer.

### Verification

`_verify_gmcp.js` is a one-shot harness that exercises the protocol module in isolation and grep-checks the server-side wiring. Run it from the repo root:

```
node _verify_gmcp.js
```

Expected: `58/58 checks passed` (28 GMCP + 30 MSDP). Coverage:

- Both negotiation handshakes (offer, DO, DONT, WILL-from-client)
- IAC-strip correctness on mixed-data input (literal `0xFF`, NOPs, embedded sub-negotiation blocks)
- Frame format for scalar/array/table values in both protocols
- `send()` and `sendMsdp()` both no-op cleanly on disabled sockets
- All five GMCP standard emitter payload shapes
- MSDP `LIST COMMANDS` / `LIST REPORTABLE_VARIABLES` / `LIST REPORTED_VARIABLES` replies
- MSDP REPORT-then-LIST round-trip subscribes correctly
- MSDP `SEND` bubbles up as event for the game layer to answer
- Coexistence of both protocols on the same socket
- Server-side wiring grep checks for every hot point above

The harness is intentionally lightweight (no test framework dependency) so it can run on any clean checkout.

### Known limitations

- We don't yet implement **MCCP** (compression) or **ATCP** (Achaea's older variant) — neither is needed for current clients.
- MSDP REPORT subscriptions are **tracked but not enforced** — we always push to enabled sockets regardless of declared subscription. Strict-subscription mode is a one-line gate change in `sendMsdp` if a future client needs it.
- Packages `Comm.Channel.List` and `Char.Items.List` (per the GMCP spec) are not emitted yet. Players still get inventory data via the standard `inventory` command.
- No persistence of negotiated client name/version — `getClientInfo` is per-socket only and is dropped on disconnect.

---

## 4.5 Server-side triggers — NOT STARTED

Per plan: player-defined `trigger add "low hp" -> use minor potion`. Extends player schema + command dispatcher hook.

---

## 4.6 Goals system — NOT STARTED

Per plan: Aardwolf-style long-term goals layered on quests/achievements (e.g. "Visit all 32 zones", "Hit Tier 5"). New `goals.json` + checker on key events.

---

## 4.7 Friend list — NOT STARTED

Per plan: `friend add/remove/list`, online notifications. Extends player schema. Counterpart to the existing ignore list.

---

## 4.8 Speedwalker — NOT STARTED

Per plan: `run nnnesseu` resolves into a chained sequence of single moves with collision/exit checks. Extends `handleMove` with a new `handleRun`.

---

## Bug Fixes (Sprint 1)

### Channel broadcast iteration — FIXED

**Symptom (pre-existing):** the `gossip`, `ooc`, `trade`, and `newbie` channels appeared to send messages but no other player ever received them. Only the sender saw the toggle confirmation.

**Cause:** `handleChannelMessage` iterated `getOnlinePlayers()` as if each element were a bare player object. The function actually returns `{player, socket}` pairs. The subscription check `if (!p.channelSubs ...)` was reading `channelSubs` off the wrapper (always `undefined`) and skipping every recipient.

**Fix:** changed the iteration to destructure correctly:
```js
for (const { player: p, socket: sock } of getOnlinePlayers()) { ... }
```

The bug was found while implementing the clan channel (Phase 4.1) — the new clan channel was written correctly from the start, and the existing channel handler had been silently broken. All four base channels now broadcast to subscribed online players as designed.

---

## Sprint roadmap reminder

Per the approved Tier 4 plan (`audit-against-the-north-sharded-wombat.md`):

- **Sprint 1 — Foundation triad**: 4.1 Clans ✓ → 4.4 MSDP/GMCP ✓ → 4.3 OLC ✓ (rooms only; items/mobs deferred)
- **Sprint 2 — Economy + social**: 4.2 Auction → 4.5 Triggers → 4.6 Goals
- **Sprint 3 — QoL bundle**: 4.7 Friend list + 4.8 Speedwalker

Then Tier 5 stretch goals.

---

*Document revision: Sprint 1 closed (4.1 Clans, 4.4 MSDP/GMCP, 4.3 OLC rooms). Sprint 2 next: 4.2 Auction → 4.5 Triggers → 4.6 Goals.*
