# Tier 4 Manual — Aardwolf Foundations

*Sprint 1 of the Tier 4 closure pass. This document tracks what's shipped, what's in progress, and what's planned across the eight Tier 4 phases. Each section gets the full command surface and design notes once that phase lands. Phase-by-phase status table at the top.*

## Phase status

| # | Phase | Status |
| :-- | :-- | :-- |
| 4.1 | **Clans / Guilds** | **DONE** — see "Clans" below |
| 4.2 | Auction house | not started |
| 4.3 | Online creation (OLC, admin-only) | not started |
| 4.4 | MSDP/GMCP protocol | not started |
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

## 4.3 Online creation (OLC) — NOT STARTED (admin-only)

Per plan: admin commands `redit`, `medit`, `oedit` for in-game world editing with persistence. **Permissions confirmed: admin-only** (uses `isAdmin()` check). A future builder-rank tier may be added later, but Phase 4.3 ships admin-only.

---

## 4.4 MSDP/GMCP protocol — NOT STARTED

Per plan: telnet subnegotiation for rich client UIs (HP/mana bars in Mudlet, MUSHclient, etc.). New `protocol/msdp.js`, hooked into the player connect path. No game-state changes; pure protocol layer.

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

- **Sprint 1 — Foundation triad** (in progress): 4.1 Clans ✓ → 4.4 MSDP/GMCP → 4.3 OLC
- **Sprint 2 — Economy + social**: 4.2 Auction → 4.5 Triggers → 4.6 Goals
- **Sprint 3 — QoL bundle**: 4.7 Friend list + 4.8 Speedwalker

Then Tier 5 stretch goals.

---

*Document revision: Tier 4.1 shipped. Channel bug fixed. Sprint 1 next: 4.4 MSDP/GMCP.*
