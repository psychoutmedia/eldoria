# Tier 4 Manual — Aardwolf Foundations

*Sprint 1 of the Tier 4 closure pass. This document tracks what's shipped, what's in progress, and what's planned across the eight Tier 4 phases. Each section gets the full command surface and design notes once that phase lands. Phase-by-phase status table at the top.*

## Phase status

| # | Phase | Status |
| :-- | :-- | :-- |
| 4.1 | **Clans / Guilds** | **DONE** — see "Clans" below |
| 4.2 | **Auction house** | **DONE** — see "Auction house" below |
| 4.3 | **Online creation (OLC, admin-only)** | **DONE (Sprint-1 scope: rooms only)** — see "OLC" below |
| 4.4 | **MSDP/GMCP protocol** | **DONE** — see "MSDP/GMCP" below |
| 4.5 | **Server-side triggers** | **DONE** — see "Triggers" below |
| 4.6 | **Goals system** | **DONE** — see "Goals" below |
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

## 4.2 Auction house — SHIPPED

Player-driven asynchronous trading. List items for a fixed duration, accept bids, settle on expiry — gold and items move automatically and offline players are notified on next login.

### Concepts

- **Active auction** — an item escrowed off the seller's inventory, with a starting bid and an expiry timestamp. Bidders escrow their gold to take the top slot; outbid bidders are auto-refunded.
- **Pending claim** — a won (or returned) item the recipient couldn't accept because their inventory was full. Picked up via `auction claim`.
- **History** — settled / cancelled auctions. Capped at 200 entries on disk to keep `auctions.json` small.
- **House fee** — 5% of the winning bid is burned (not paid to anyone) on a successful sale.
- **Gold flow is conserved** for failed bids: a 100g bid creates a 100g escrow; if the bidder is outbid they get all 100g back; if the auction is cancelled they get all 100g back; if they win, only the fee disappears.

### Tunables (`world/auctions.js`)

| Constant | Default | Meaning |
| :-- | :-- | :-- |
| `HOUSE_FEE_PCT` | 0.05 | Fee on winning bids (burned, not redistributed) |
| `MIN_INCREMENT_PCT` | 0.05 | Min next-bid bump as a fraction of current bid |
| `MIN_INCREMENT_GOLD` | 1 | Floor on the bump for cheap auctions |
| `DEFAULT_DURATION_HRS` | 24 | If `auction sell` omits the hours arg |
| `MIN_DURATION_HRS` / `MAX_DURATION_HRS` | 1 / 72 | Valid range for duration |
| `MIN_STARTING_BID` | 1 | Cheapest valid starting bid |
| `MAX_PER_SELLER` | 5 | Per-account active-listing cap |
| `MAX_TOTAL_ACTIVE` | 100 | House-wide active-listing cap |

The reaper runs every **60 seconds** (`AUCTION_REAPER_INTERVAL_MS` in `mud_server.js`).

### Command surface

| Command | Effect |
| :-- | :-- |
| `auction` / `auction list` / `ah` | List all active auctions (sorted by soonest expiry) |
| `auction info <id>` | Detail page for one auction (item, bids, time left, min next bid) |
| `auction sell <item> <minBid> [hours]` | List an item from your inventory. Default duration 24h. Item is escrowed immediately. Equipped items must be unequipped first. |
| `auction bid <id> <amount>` | Escrow `amount` gold and take top bid. Auto-refunds the previous top bidder. |
| `auction cancel <id>` | Seller cancels. Top bidder (if any) is refunded; item is returned (or queued if inventory full). |
| `auction claim` | Pick up items waiting in your queue (won bids that couldn't deliver, or cancelled listings whose seller had a full inventory). |

The `ah` shorthand is wired identically to `auction`.

### Validation rules

**Listing (`auction sell`):**
- Item must be in inventory (partial-name match supported via `findItemInInventory`).
- Item must not be equipped.
- Starting bid ≥ 1g.
- Duration in `[1h, 72h]`.
- Seller may not exceed `MAX_PER_SELLER` active listings.
- House may not exceed `MAX_TOTAL_ACTIVE` active listings.

**Bidding (`auction bid`):**
- Auction must exist and not be expired.
- Bidder cannot be the seller.
- Amount must be a positive integer.
- For the first bid: amount ≥ starting bid.
- For subsequent bids: amount ≥ current bid + max(`MIN_INCREMENT_GOLD`, `ceil(currentBid * MIN_INCREMENT_PCT)`).
- Bidder must hold enough gold (escrow happens at the moment of `auction bid`).

**Cancelling (`auction cancel`):**
- Only the seller can cancel.
- Top bidder (if any) is refunded the full escrowed amount.

### Settlement flow (the reaper)

Every 60 seconds, `runAuctionReaper` calls `auctions.findExpired(now)` and processes each match:

1. **Sold** — top bidder + non-null current bid:
   - Move auction to history with `outcome: 'sold'` and computed fee.
   - Pay seller `currentBid - fee` (online: live; offline: edits player file).
   - Try to deliver the item to the winner. If their inventory is full, route to `pending` queue.
   - Notify both parties (live-write if online, queue to `auctionMail` if offline).
2. **Unsold** — no bidder:
   - Move auction to history with `outcome: 'unsold'`.
   - Try to deliver the item back to the seller; route to pending if full.
   - Notify the seller.
3. Persist to `auctions.json` once at the end of the tick.

`auctions.json` is written via temp-file + atomic rename, with a `.bak` rotated on every save (same pattern as OLC and player files).

### Notifications

- **Online recipient** — direct write to their socket: `\r\n[Auctions] <message>\r\n> `.
- **Offline recipient** — appended to a per-player `auctionMail` array on disk (capped at 50 entries). Flushed on next login as `=== N auction message(s) while you were away ===`.
- **Pending claim warning** — printed on every login if the player has anything in the claim queue.

### Persistence schema (`auctions.json`)

```json
{
  "active": [
    {
      "id": "auc_0001",
      "seller": "Alice",
      "item": { /* full item snapshot at list time */ },
      "startingBid": 100,
      "currentBid": 150,
      "topBidder": "Bob",
      "listedAt": 1700000000000,
      "expiresAt": 1700086400000
    }
  ],
  "pending": [
    { "id": "auc_xxx", "winner": "Bob", "item": { /* ... */ }, "pendingSince": 1700000000000 }
  ],
  "history": [
    {
      "id": "auc_xxx",
      "seller": "Alice",
      "winner": "Bob",
      "item": { /* ... */ },
      "finalBid": 150,
      "fee": 7,
      "outcome": "sold",          // | "unsold" | "cancelled"
      "listedAt": 1700000000000,
      "settledAt": 1700086400123
    }
  ],
  "nextSeq": 7
}
```

The `item` is a snapshot taken at list time — if the item template changes mid-auction the auction still delivers the original.

### Module API (`world/auctions.js`)

```js
emptyState() / loadState(filePath?) / saveState(state, filePath?)

canList(state, sellerName, item, startingBid, durationHrs)
  -> { ok, startingBid, durationHrs } | { ok:false, error }
addAuction(state, sellerName, item, startingBid, durationHrs, now)
  -> auction
getAuction(state, auctionId) -> auction | null

canBid(state, auctionId, bidderName, amount, now)
  -> { ok, auction, amount, prevBidder, prevBid } | { ok:false, error }
applyBid(state, auctionId, bidderName, amount) -> auction | null

canCancel(state, auctionId, sellerName)
  -> { ok, auction, refundBidder, refundAmount } | { ok:false, error }
removeAuction(state, auctionId) -> auction | null

findExpired(state, now) -> [auction]
moveToHistory(state, auction, outcome, settledAt) -> fee (0 if not sold)

addPending(state, winnerName, auction)
takePending(state, winnerName, auctionId?) -> claim | null
listPendingFor(state, winnerName) -> [claim]

listActive(state) -> sorted by expiresAt
formatRemaining(ms) -> "Xh Ym" / "Ym Zs" / "Ns" / "expired"
```

### Server-side wiring

| Hot point | What runs |
| :-- | :-- |
| `server.listen` callback (startup) | `auctions.loadState()` populates `auctionState`; `setInterval(runAuctionReaper, 60s)` scheduled |
| `processCommand` (`auction` / `auction ...` / `ah` / `ah ...`) | Routes to `handleAuction` with original-case args |
| `handleAuction sell` | Validates, escrows item, calls `addAuction`, persists, broadcasts `[Auctions] ... listed ...` |
| `handleAuction bid` | Validates, escrows bidder gold, refunds prev bidder, calls `applyBid`, persists, notifies seller |
| `handleAuction cancel` | Validates, refunds top bidder, returns item (or queues), removes auction, persists |
| `handleAuction claim` | Drains pending queue subject to inventory cap, persists |
| `runAuctionReaper` (every 60s) | Settles each expired auction, persists once at end of tick |
| `completePlayerLogin` | Flushes `player.auctionMail` queue; warns if pending claims exist |

Gold and inventory mutation lives entirely in `mud_server.js`; the module is pure data + validation. This separation lets the unit tests run without booting the server.

### Testing

Two harnesses cover this phase:

**Unit (`_verify_auctions.js`)** — 65 checks against the module in isolation:
- `canList` validation (negative bid, oversize/undersize duration, missing seller/item, default duration, per-seller cap, total cap)
- `addAuction` returns id, increments seq, computes expiresAt
- `canBid` (self-bid, under starting, increment threshold, prev-bidder reflection, expired auction, unknown id, non-positive amount)
- Min-increment math floor of 1g for cheap bids
- `canCancel` (seller-only, unknown id)
- `findExpired` + `moveToHistory` fee math + history unshift + cap
- `removeAuction` semantics
- Pending queue (`addPending` / `listPendingFor` / `takePending`, case-insensitive)
- `formatRemaining` formatting bands
- `loadState` / `saveState` round-trip, .bak rotation, garbage-file resilience
- 14 server-side wiring grep checks

**Live integration (`_smoke_auctions.js`)** — 6 checks against a real spawned server:
- Spawns `mud_server.js` on `MUD_PORT=18888` so it doesn't collide with anything on 8888.
- Waits for the `Loaded N active auction` log line — proves the module integrates with startup and `auctions.json` is parsed at boot.
- Opens a real TCP socket; receives the welcome banner; verifies the "Do you have an account?" prompt arrives (after stripping IAC + ANSI).
- Confirms the server process stays alive after a connect/disconnect cycle.
- Sends SIGTERM and confirms a clean shutdown.

Run from the repo root:

```
node _verify_auctions.js     # 65/65 unit checks
node _smoke_auctions.js      # 6/6 live-server smoke checks
```

The smoke harness spawns its own server, so don't run a second instance on `localhost:18888` while it's executing.

### Anti-griefing & known limitations

**Implemented:**
- Self-bid blocked.
- Equipped items can't be listed.
- Per-seller and house-wide listing caps.
- Min-increment floor (no 1-copper bid wars on cheap items).
- All gold movement is escrow-based — no orphan gold on outbid/cancel.
- Pending-claim queue means winning a bid never silently destroys an item.

**Deferred to a future pass:**
- No `auction history` command yet — history is persisted but not user-visible. (Admins can `cat auctions.json`.)
- No `auction search <text>` filter.
- No buyout / reserve-price mechanic.
- Pending claims have no expiry — items live in the queue forever until claimed.
- No multi-currency support (only `gold`).
- No anti-shill mechanism beyond the self-bid block (alts can collude).
- No admin break-glass tool to force-settle or void an auction.

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

## 4.5 Server-side triggers — SHIPPED

Player-defined "when output line matches X, run command Y" rules. The classic MUD-client trigger feature, but **server-side** so plain-telnet players get them without needing Mudlet/MUSHclient. Triggers persist in the player's save file.

### Concepts

- **Pattern** — what to match against the server's outgoing text. Substring match is case-insensitive by default; wrap in `/.../` for full regex with capture groups.
- **Action** — a command line the server runs as if the player typed it (goes through `processCommand`).
- **Capture substitution** — regex groups become `%1`, `%2`, …, `%9` inside the action, so `/took (\d+) damage/ -> say I took %1` becomes `say I took 25` when the line `You took 25 damage` is matched.
- **Per-player** — every player owns their own trigger list, capped at 20. Loaded with the save file, saved on every change.
- **Always-on safety** — fires are throttled, runaway loops auto-disable the offender's triggers, and trigger-action output is flagged so it can't itself fire more triggers.

### Command surface

| Command | Effect |
| :-- | :-- |
| `trigger` / `trigger help` | Show usage, limits, and safety constants |
| `trigger add <pattern> -> <action>` | Create a new trigger (ids assigned 1..20, smallest unused) |
| `trigger list` (`trigger ls`) | Show all your triggers with id / state / kind / fired counter |
| `trigger toggle <id>` | Flip enabled ↔ disabled |
| `trigger remove <id>` (`rm` / `delete`) | Delete one trigger |
| `trigger clear` | Wipe all your triggers (and reset the rate-state) |

The arrow `->` must have whitespace on both sides — patterns can contain `->` mid-text without confusing the parser, and the regex form `/foo -> bar/` parses correctly because the splitter ignores arrows inside `/.../` zones.

### Pattern matching rules

- Plain text patterns are matched as case-insensitive substrings; regex metacharacters are escaped automatically (so `foo (1)` matches the literal string `foo (1)`).
- `/...../` patterns are compiled as `RegExp(body, 'i')` — always case-insensitive.
- ANSI escape sequences are stripped from outgoing text **before** matching, so a colorized `[red]low hp[reset]` line still matches the pattern `low hp`.
- The first enabled trigger that matches wins for a given output chunk — only one fire per chunk.

### Capture group substitution

Captures `%1` through `%9` are replaced with the matching regex group. Tokens with no corresponding group are left as-is (e.g. `%9` in an action when only one group exists → still `%9`).

```
trigger add /HP: (\d+)\/(\d+)/ -> say I'm at %1 of %2
```

When the server prints `HP: 35/100`, the action becomes `say I'm at 35 of 100`.

### Safety constants (`world/triggers.js`)

| Constant | Default | What it does |
| :-- | :-- | :-- |
| `MAX_TRIGGERS_PER_PLAYER` | 20 | Hard cap; `trigger add` rejects beyond this |
| `MAX_PATTERN_LENGTH` | 200 chars | Pattern compile rejects oversize input |
| `MAX_ACTION_LENGTH` | 200 chars | Action validation rejects oversize input |
| `TRIGGER_COOLDOWN_MS` | 500 ms | Minimum gap between any two trigger fires per player |
| `RATE_LIMIT_FIRES` | 5 | Max fires within `RATE_LIMIT_WINDOW_MS` before auto-disable |
| `RATE_LIMIT_WINDOW_MS` | 1000 ms | Rolling window the rate cap watches |
| `RATE_LIMIT_PENALTY_MS` | 30 000 ms | If rate cap is exceeded, all the player's triggers are flipped off and stay off until they're re-enabled with `trigger toggle` |

The cooldown alone is sufficient to keep ordinary use sane; the rate cap is defense-in-depth — under current tunables you cannot legitimately reach it (the cooldown enforces ≥ 500 ms between fires, which already caps the rate at 2/sec). It exists so a future change to the cooldown can't accidentally turn this into a runaway-action footgun.

### Recursion guard

When a trigger's action runs, the player's `_inTriggerAction` flag is set true for the duration of the dispatch. The `socket.write` tap checks this flag and skips trigger evaluation on output produced inside that scope. This means:

- A trigger `low hp -> use potion` whose `use potion` produces output containing the substring `low hp` will not chain into itself.
- One trigger cannot fire another trigger via the action's text output.
- Players can still use multiple triggers — they just can't cascade.

Action validation also rejects any action starting with the literal word `trigger` (so `trigger add ... -> trigger clear` is blocked at add-time).

### Server-side wiring

`mud_server.js` integrates with the module via three hot points:

| Hot point | What it does |
| :-- | :-- |
| `installTriggerTap(socket, player)` (called in `completePlayerLogin`) | Wraps the socket's `write` method once. The wrapper extracts text, strips ANSI/IAC, runs `triggers.findFiring`, gates by `triggers.checkRate`, and schedules the matching action via `setImmediate` so it doesn't reenter the current write call. Idempotent (`socket._triggerTapInstalled` flag). |
| `handleTrigger` | Dispatches the six subcommands above. Persists via `savePlayer` on every state change. |
| Save/load (`savePlayer` / `loadPlayer`) | `triggers` array is stored alongside aliases and channelSubs. `loadPlayer` runs the array through `triggers.loadTriggers()` to drop malformed entries, fill missing ids, and cap at `MAX_TRIGGERS_PER_PLAYER`. `createPlayer` initializes an empty array for new characters. |

### Module API (`world/triggers.js`)

```js
// Constants exported for tests + the runtime help screen
MAX_TRIGGERS_PER_PLAYER, MAX_PATTERN_LENGTH, MAX_ACTION_LENGTH,
TRIGGER_COOLDOWN_MS, RATE_LIMIT_FIRES, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_PENALTY_MS

// Helpers
stripAnsi(text) -> text
isRegexShorthand(pattern) -> bool
escapeForRegex(s) -> escaped
compilePattern(pattern) -> { ok, regex } | { ok:false, error }
validateAction(action) -> { ok, action } | { ok:false, error }
parseAddSyntax('<pattern> -> <action>') -> { pattern, action } | null
applyCaptures(action, regexMatch) -> action with %N substituted
buildTrigger(id, pattern, action) -> { ok, trigger } | { ok:false, error }
nextId(triggers[]) -> smallest unused id 1..MAX_TRIGGERS_PER_PLAYER
loadTriggers(rawArray) -> sanitized triggers[]

// Match + rate gating
findFiring(triggers, text) -> { trigger, match, action } | null
checkRate(state, now) -> { allow } | { allow:false, reason, lockedUntil? }
recordFiring(state, now)
```

### Persistence schema

Each player save (`players/<name>.json`) gets a `triggers` array:

```json
{
  "triggers": [
    {
      "id": 1,
      "pattern": "low hp",
      "action": "use minor potion",
      "enabled": true,
      "regex": false,
      "fired": 7
    },
    {
      "id": 2,
      "pattern": "/took (\\d+) damage/",
      "action": "say I took %1",
      "enabled": true,
      "regex": true,
      "fired": 0
    }
  ]
}
```

`loadTriggers` is forgiving: malformed entries are dropped, missing ids are reassigned, oversize patterns are rejected, the array is capped. A garbage save never crashes the server.

### Verification

**Unit (`_verify_triggers.js`)** — 73 checks against the module in isolation:
- ANSI strip, regex-shorthand detection, regex metachar escaping
- Pattern compilation: substring vs regex, length cap, empty rejection, bad-regex error reporting
- Action validation: trim, length cap, empty rejection, recursive-trigger block
- `parseAddSyntax`: simple, regex form, missing whitespace, multiple arrows, non-string
- `applyCaptures`: %1..%9 substitution, missing groups, no match
- `buildTrigger`: success path, bad pattern, bad action, regex flag detection
- `nextId`: empty list, gap-filling, contiguous extension
- `loadTriggers`: valid entries preserved, missing ids reassigned, regex flag inferred from pattern shape, oversize patterns dropped, disabled state preserved, garbage input → empty, MAX_TRIGGERS_PER_PLAYER cap honored
- `findFiring`: substring match, regex w/ capture, skip disabled, ANSI-strip before match, first-trigger-wins, empty inputs
- Rate state: cooldown enforcement, RATE_LIMIT_FIRES cap (defense-in-depth via direct stuffing), penalty expiry, rolling window
- 12 server-side wiring grep checks (import, handler, dispatch, tap install, idempotency flag, setImmediate scheduling, recursion guard, rate-exceeded auto-disable, save/load integration, createPlayer init)

**Live integration (`_smoke_triggers.js`)** — 18 checks against a real spawned server:
- Spawns `mud_server.js` on port 18889; waits for the auctions-loaded log line.
- Real TCP connect + full registration flow (Y/N → username → password → confirm).
- Exercises every trigger subcommand via real user input: `help`, `add`, `list`, `toggle`, `remove`, `clear` (implicitly).
- Verifies the help screen shows the safety/limits constants.
- Verifies malformed `trigger add` is rejected with the Usage line.
- Verifies the action-level recursion guard rejects `... -> trigger clear`.
- Issues `save`, then reads the player save file from disk and asserts the trigger persisted with the right pattern/action.
- Verifies the server stays alive across the connect/quit cycle and shuts down cleanly on SIGTERM.
- All test artifacts (test character + accounts entry + .bak files) are cleaned up on exit so the harness leaves the repo unchanged.

Run from repo root:

```
node _verify_triggers.js     # 73/73 unit checks
node _smoke_triggers.js      # 18/18 live-server checks
```

The smoke test owns its server child — don't run a second instance on `localhost:18889` while it's executing.

### Known limitations

- **No multi-line patterns** — each `socket.write` call is matched in isolation. A line split across two writes won't match a pattern that spans both.
- **No timer triggers** — only output-driven matches. (Aardwolf has timer triggers; future addition.)
- **No grouping / priorities** — first-match-wins; you can't say "trigger A only fires if trigger B has fired recently."
- **Captures are positional** — no named-group support yet.
- **Trigger fire counter is not persisted** — `fired` resets to 0 on save (though incremented in memory). Easy fix if it becomes useful for analytics.
- **Rate-locked state is in-memory** — surviving a server restart wipes the lock; if a player burned through the rate cap right before a crash, they get a clean slate next login. Acceptable: the lock is a brake, not a punishment.

---

## 4.6 Goals system — SHIPPED

Long-term passive achievements with explicit claim. Distinct from the existing `achievementsUnlocked` (which auto-unlock and have no reward); goals surface progress, require a `goal claim` step, and pay out QP / gold / titles.

### Concepts

- **A goal** is a curated definition in `goals.json` with id, category, name, description, type, key, target, and reward. Definitions are loaded at server boot and validated.
- **Progress** is stored on the player as `goalProgress` (object: `{ key: counter | bool | string[] }`) plus `goalsClaimed` (array of claimed ids).
- **Goal types**:
  - `counter` — accumulator (kills, damage, sales). Complete when `current >= target`.
  - `boolean` — flag (entered Neo Kyoto). Complete when matches target.
  - `set` — distinct-membership tracker (zones visited). Complete when set size hits target.
  - `threshold` — watches a live player attribute (level, gold, remortTier). Complete when `current >= target`.
- **Categories**: `combat`, `exploration`, `economy`, `progression`. Used for the list-view grouping and the `goal list <category>` filter.
- **Claim is one-shot** — once claimed, a goal can never be claimed again. Re-completion has no effect.

### Launch goal set

| Category | id | Name | Trigger | Reward |
| :-- | :-- | :-- | :-- | :-- |
| combat | `combat_apprentice` | Bloodied Initiate | 100 monster kills | 25 QP |
| combat | `combat_veteran` | Veteran Warrior | 1000 monster kills | 100 QP + title "the Battle-Hardened" |
| combat | `combat_boss_crusher` | Boss Crusher | 10 unique named bosses | 50 QP |
| combat | `combat_demolisher` | Demolisher | 100 000 cumulative damage | 75 QP + 500 gold |
| combat | `combat_pvp_first` | First Blood | 1 PVP kill | 30 QP |
| exploration | `explore_wanderer` | Wanderer | 50 unique rooms | 20 QP |
| exploration | `explore_cartographer` | Cartographer | 200 unique rooms | 50 QP |
| exploration | `explore_realm_walker` | Realm-Walker | 1 room in every zone (`ALL_ZONES`) | 100 QP + title "the Realm-Walker" |
| exploration | `explore_neo_kyoto` | Across the Threshold | Enter any room 201-300 | 25 QP |
| economy | `econ_first_sale` | Open for Business | 1 auction sale | 15 QP |
| economy | `econ_bullion_hoard` | Bullion Hoard | Hold 10 000 gold at once | 50 QP |
| economy | `econ_tycoon` | Auction Tycoon | 25 auction sales | 100 QP + title "the Marketmaker" |
| progression | `prog_adept` | Adept | Reach level 10 | 25 QP |
| progression | `prog_master` | Master | Reach level 25 | 75 QP + 250 gold |
| progression | `prog_eternal` | Eternal | Reach remort tier 1 | 100 QP + title "the Reborn" |

The set is curated for launch; new goals can be added by editing `goals.json` and restarting the server. Validation runs at load — malformed entries are warned about and skipped.

### Command surface

| Command | Effect |
| :-- | :-- |
| `goals` / `goal list [category]` | List all goals grouped by category, with progress + status badge per goal. Optional filter to a single category. |
| `goal info <id>` | Detail page: name, category, description, type, current vs target, percent, status, reward breakdown. |
| `goal claim <id>` | Pay out the reward and mark claimed. Rejects if incomplete or already claimed. |
| `goal categories` | List the four valid categories. |
| `goal help` / `goal ?` | Show the command summary. |

Status badges in the list view:
- `[ ... ]` — in progress
- `[READY]` — complete and ready to claim
- `[CLAIMED]` — already claimed (greyed out)

### Special target: `ALL_ZONES`

Goals can use the literal string `"ALL_ZONES"` as their target. At evaluation time the server substitutes the live count of distinct zones in `rooms.json` (cached on first read). This means the `Realm-Walker` goal automatically tracks the right number when zones are added or removed via `redit zone` (Tier 4.3) — no manual goal-file maintenance needed.

The current realm has **33 zones** across both servers (Eldoria + Neo Kyoto).

### Hot-point hooks

The wiring follows the rule that every progress mutation goes through one helper. The hot points and what they update:

| Event | Helper | Goals affected |
| :-- | :-- | :-- |
| `handleMonsterDeath` | `goalOnMonsterKilled(player, socket, monster)` | `combat_apprentice`, `combat_veteran`, `combat_boss_crusher` (boss-set tracking via `uniqueBossesKilledList`) |
| Per-hit damage in `playerAttackMonster` | `goalOnDamageDealt(player, socket, amount)` | `combat_demolisher` |
| PVP victory in `handlePvpVictory` | `goalOnPvpKill(winner, winnerSocket)` | `combat_pvp_first` |
| `handleMove` after `currentRoom` updated | `goalOnRoomEntered(player, socket, roomId, room)` | `explore_wanderer`, `explore_cartographer`, `explore_realm_walker`, `explore_neo_kyoto` |
| `settleAuction` (sold path) | `goalOnAuctionSold(sellerName)` — handles online + offline sellers | `econ_first_sale`, `econ_tycoon` |
| `checkLevelUp` after auto-save | `goalOnLevelChanged(player, socket)` | `prog_adept`, `prog_master` |
| Remort confirm path | `goalOnRemort(player, socket)` | `prog_eternal` |
| `savePlayer` on every save | `goalOnGoldChanged(player, socket)` | `econ_bullion_hoard` (threshold checked on save tick) |

Each helper increments / sets / appends to `goalProgress` then calls `notifyIfNewlyComplete` to print a `[Goal Complete]` line when the goal first becomes claimable. The notification is idempotent against `goalsClaimed`, so it doesn't repeat after the player claims.

Threshold goals (`level`, `currentGold`, `remortTier`) read live values from `ctx.values` rather than `goalProgress`, so they don't need persistent counters — the player attribute IS the counter.

### Module API (`world/goals.js`)

```js
// Constants
CATEGORIES, VALID_TYPES, TARGET_ALL_ZONES, GOALS_PATH

// Lifecycle
loadDefinitions(filePath?) -> { ok, count, errors? }
getDefinitions() -> [definition]
getDefinition(id) -> definition | null
listByCategory(category) -> [definition]

// Progress mutation (mutates player.goalProgress in place)
ensureProgressShape(player) -> player
incrementCounter(player, key, n=1) -> new value
setBoolean(player, key, value=true) -> bool
addToSet(player, key, member) -> set size
getProgress(player, key, default) -> value

// Evaluation
resolveTarget(goal, ctx) -> number
readCurrent(goal, player, ctx) -> number | bool
isComplete(goal, player, ctx) -> bool
progressFor(goal, player, ctx) -> { current, target, percent }
statusFor(goal, player, ctx) -> 'completed' | 'in_progress' | 'claimed'

// Claim flow
canClaim(goal, player, ctx) -> { ok, goal } | { ok:false, error, progress? }
markClaimed(goal, player) -> claimed count
```

### Persistence schema

Each player save (`players/<name>.json`) gets two new fields:

```json
{
  "goalProgress": {
    "monstersKilled": 1234,
    "damageDealt": 87650,
    "uniqueBossesKilledList": ["Throne Wraith", "Ash Dragon", "..."],
    "uniqueBossesKilled": 3,
    "roomsVisitedList": ["room_001", "room_002", "..."],
    "uniqueRoomsVisited": 87,
    "zonesVisited": ["Starting Chamber", "Crystal Caverns", "..."],
    "enteredNeoKyoto": false,
    "auctionSales": 4,
    "pvpKills": 0
  },
  "goalsClaimed": ["combat_apprentice", "explore_wanderer"]
}
```

The `*List` arrays back the `*` counters — the counter is a derived integer kept up to date by the helpers. Both formats are persisted so reading the save file directly is straightforward.

`loadPlayer` defaults missing fields to empty values, so old saves work transparently. `createPlayer` initializes them empty. `savePlayer` writes whatever's currently on the player object.

### Verification

**Unit (`_verify_goals.js`)** — 72 checks against the module + the real `goals.json`:
- Definition validation (all fields, every type, valid ALL_ZONES, malformed/missing/negative reward rejection)
- Real goals.json loads cleanly with the expected count, every entry validates, no duplicate ids
- `loadDefinitions` resilient to garbage JSON (returns ok=false but doesn't crash)
- Progress shape ensured + idempotent
- `incrementCounter` (default n=1, accumulation, new-key initialization)
- `setBoolean` / `addToSet` (deduplication, order preservation)
- `isComplete` for all four types: counter (boundary, past target), boolean, set with ALL_ZONES expansion (zoneCount via ctx, missing ctx graceful), threshold via ctx.values
- `progressFor` math (counter percent, boolean 0/100, percent capped at 100)
- `statusFor` transitions (in_progress → completed → claimed)
- `canClaim` rejects in-progress, accepts when complete, rejects already-claimed, rejects null goal
- `markClaimed` is idempotent
- `listByCategory` filters correctly
- 14 server-side wiring grep checks (import, startup load, handler, dispatcher, all 7 hot-point hooks, save/load integration, createPlayer init)

**Live integration (`_smoke_goals.js`)** — 19 checks against a real spawned server:
- Spawns `mud_server.js` on port 18890 with the test character pre-added to `admins.json` (restored on exit).
- Waits for the `Loaded N goal definition` startup log line.
- Real TCP connect + full registration flow.
- Exercises every subcommand: `goals`, `goal info <id>`, `goal info <unknown>`, `goal claim <incomplete>`, `goal claim <ready>`, `goal claim <already claimed>`, `goal list <category>`, `goal categories`.
- Uses admin `set_level` to push to level 10, then claims `prog_adept` and asserts the `+25 QP` payout line.
- Verifies the list view's status badge transitions (`[ ... ]` → `[CLAIMED]`).
- Runs `save`, reads the player file from disk, asserts `goalsClaimed` includes `prog_adept`, `goalProgress` is present, `questPoints` ≥ 25.
- All test artifacts (player file, accounts entry, admins.json modification, .bak files) cleaned up on exit.

Run from repo root:

```
node _verify_goals.js     # 72/72 unit checks
node _smoke_goals.js      # 19/19 live-server checks
```

The smoke harness owns its server child + admins.json patch — don't run a second instance on `localhost:18890` while it's executing.

### Known limitations

- **No goal chains / prerequisites** — every goal is independent. (e.g. you can claim `Veteran Warrior` without first claiming `Bloodied Initiate`.)
- **No hidden goals** — all goals are visible from list-view immediately.
- **No daily / weekly resets** — goals are one-shot lifetime achievements. Daily-reset content lives in the campaign system (Tier 2.1).
- **No achievement→goal cross-linking** — the existing `achievementsUnlocked` and the new `goalsClaimed` are independent ledgers. A goal could in theory be earned via the same event that unlocks an achievement, but they're tracked separately.
- **Title rewards add to `titlesUnlocked`** but don't auto-equip — the player still needs to use the existing `title` command to switch to a goal title.
- **Threshold goals fire on the next event tick**, not retroactively — if a player is already level 25 when goals.json adds a goal at that level, they need to trigger any level event (`set_level` or natural level-up) for the in-memory threshold check to print the "ready" notification. The `goal claim` command itself bypasses this since `canClaim` re-evaluates from live attributes.

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
- **Sprint 2 — Economy + social**: 4.2 Auction ✓ → 4.5 Triggers ✓ → 4.6 Goals ✓
- **Sprint 3 — QoL bundle**: 4.7 Friend list + 4.8 Speedwalker

Then Tier 5 stretch goals.

---

*Document revision: Sprints 1 + 2 closed (4.1 Clans, 4.4 MSDP/GMCP, 4.3 OLC rooms, 4.2 Auction, 4.5 Triggers, 4.6 Goals). Sprint 3 next: 4.7 Friend list → 4.8 Speedwalker.*
