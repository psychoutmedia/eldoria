# Tier 0 Manual — The Shattered Realms MUD

A reference for everything introduced in the Tier 0 pre-launch polish pass.
Written for both **players** (what to type, what happens) and **maintainers**
(where the code lives, how it's wired).

---

## Contents

1. [Equipment slots (8-slot system)](#1-equipment-slots-0.6)
2. [Boss signature mechanics](#2-boss-signature-mechanics-0.1)
3. [The Shattered Symphony quest](#3-the-shattered-symphony-quest-0.2)
4. [`consider` — fight outcome estimate](#4-consider--fight-outcome-estimate-0.7)
5. [Aliases](#5-aliases-0.9)
6. [Channels](#6-channels-0.8)
7. [Help system](#7-help-system-0.3)
8. [Bestiary](#8-bestiary-0.4)
9. [Map](#9-map-0.5)
10. [Save-file changes & migration](#10-save-file-changes--migration)
11. [Smoke test](#11-smoke-test)

---

## 1. Equipment slots (0.6)

### Player view

You have **eight equipment slots**, up from three:

| Slot   | Typical items                                | Effect          |
|--------|----------------------------------------------|-----------------|
| weapon | Daggers, hammers, swords, instruments-as-arms| `+damageBonus`  |
| armor  | Vests, robes, cloaks, body armor             | `+armorBonus`   |
| shield | Wooden/crystal/void shields                  | `+armorBonus`   |
| head   | Caps, helms, circlets                        | `+armorBonus`   |
| neck   | Amulets, pendants                            | `+armorBonus`   |
| hands  | Gloves, gauntlets                            | `+armorBonus`   |
| feet   | Boots                                        | `+armorBonus`   |
| finger | Rings, signets, bands                        | `+armorBonus`   |

Use:

```
equip <item>          equip the item, slot is auto-detected
unequip <slot>        remove gear from a slot
equipment / eq / gear show all eight slots
```

You **cannot change equipment in combat**. Old gear in a slot returns to your bag.

### Starter loadout

Every new accessory tier in `items.json`:

| Item                  | Slot   | Lvl | Bonus |
|-----------------------|--------|----:|------:|
| Leather Cap           | head   |  1  |  +1   |
| Iron Helm             | head   |  5  |  +3   |
| Bone Circlet          | head   | 10  |  +6   |
| Traveler's Amulet     | neck   |  1  |  +1   |
| Warding Pendant       | neck   |  6  |  +3   |
| Pendant of the Pale Star | neck | 12 |  +6   |
| Leather Gloves        | hands  |  1  |  +1   |
| Iron Gauntlets        | hands  |  6  |  +3   |
| Runed Gauntlets       | hands  | 11  |  +5   |
| Worn Boots            | feet   |  1  |  +1   |
| Ironshod Boots        | feet   |  5  |  +3   |
| Stormwalker Boots     | feet   | 10  |  +5   |
| Silver Band           | finger |  1  |  +1   |
| Signet of Patience    | finger |  7  |  +3   |
| Ring of the Archmage  | finger | 13  |  +6   |

A fully-decked level-15 character gains roughly **+25–30 armor** above the
old 3-slot maximum. Combat math wasn't rebalanced; pre-15 monsters now hit
slightly less, which is fine — Eldoria 2.0 (rooms 101+) is balanced for
this loadout.

### Maintainer notes

- Constants live near the equipment helpers in `mud_server.js`:
  - `ALL_EQUIP_SLOTS` — canonical slot order, used everywhere
  - `slotLabel(slot)` — pretty-prints a slot name
  - `getEquipmentSlot(item)` — reads `item.slot` first, falls back to `item.type`
- Items declare a slot field only when ambiguous (`accessories` section).
  Existing `armor`/`shield`/`weapon` items are inferred from their `type`.
- `getEquippedArmorBonus(player)` iterates **all seven non-weapon slots**.
- `createItem` carries `slot` through; `getItemById` includes the new
  `accessories` category.
- Save format adds nothing new — `equipped` is a free-form object. Old
  saves are back-filled in `loadPlayer` via `Object.assign({...defaults}, data.equipped)`.
- `unequip` accepts any slot in `ALL_EQUIP_SLOTS`, not just weapon/armor/shield.

---

## 2. Boss signature mechanics (0.1)

Six bosses now have unique abilities that fire automatically during combat.

### Player view

| Boss                       | Room | Signature                                                    |
|----------------------------|------|--------------------------------------------------------------|
| Morwyn Ironheart           | 108  | At 50% HP: spawns 1–2 Discordant Note minions (one-time)     |
| The Recursive Zephyros     | 144  | When below 70% HP: 25% chance per hit to rewrite to full HP, **once per fight** |
| Valdris the Radiant        | 150  | At 33% HP: spawns Valdris's Shadow-Self (L22, 600 HP)        |
| Nyxara / Echo-Self         | 175  | 20% chance per attack to **silence** you for 9 seconds       |
| Thessarian the Patient     | 198  | Every 2nd attack deals **+50% damage** (paradox stack)       |
| Archmage Supreme           | 100  | At 50% HP: phase 2 — strength × 1.25 for the rest of the fight |

You'll see flavour text when each mechanic fires. **Silence** prevents
casting; the spell `cast` command tells you exactly how many seconds you
have left to wait.

### Tactics

- **Morwyn** — focus the boss; kiting around the minions is usually safer
  than fighting all three at once.
- **Zephyros** — burst him below 70% in a single push; the rewrite only
  triggers on hits below that threshold.
- **Valdris** — the Shadow-Self is the same level as the boss. If you can,
  finish Valdris before the shadow appears (under 33% HP).
- **Nyxara** — bring potions. Silenced casters become melee until it expires.
- **Thessarian** — count his swings. Every other one will land hard.
- **Archmage Supreme** — at 50% you'll suddenly take more damage; pre-pop
  shields or a healing potion right before that threshold.

### Maintainer notes

- The dispatch table is `BOSS_SIGNATURES` in `mud_server.js`, keyed by
  monster `templateId`. Each entry can implement any of:
  - `onPlayerHit(socket, player, monster)` — runs after the player damages
    the boss; HP threshold logic goes here. Skipped if the boss is dead.
  - `onMonsterAttack(socket, player, monster)` — runs *before* the boss's
    damage roll. Used for Nyxara's silence proc.
  - `damageMultiplier(socket, player, monster)` — returns a number; the
    boss's damage is multiplied by it. Used for Thessarian's paradox stack.
- The hooks are invoked from `playerAttackMonster` (after `monster.hp -= totalDamage`)
  and `monsterAttackPlayer` (before damage roll). Each is wrapped in
  `try/catch` so a buggy hook can't kill combat.
- Per-fight state lives in `monster.bossState`, an object initialised on
  spawn (`spawnBosses`). Use it for `minionsSpawned`, `rewritten`, etc.
- `spawnBossMinion(parentBoss, templateId, count)` adds minions to the
  boss's room with `parentBossId` set. They behave like normal monsters.
- New monster template: `valdris_shadow_self` in `monsters.json`.
- New status effect: `player.effects['silenced'] = { expiresAt: <ms> }`.
  `handleCast` rejects spells with a "you are silenced" message and a
  remaining-seconds count.

---

## 3. The Shattered Symphony quest (0.2)

The five-instrument arc is now an explicit, trackable quest.

### Player view

When you hit **level 15** and cross the Gatekeeper of Resonance, the
quest is **auto-accepted** for you. Use:

```
quests          show your active quest log
```

…and you'll see a five-objective checklist:

1. Claim the Obsidian Drum-Stave (from Morwyn Ironheart)
2. Retrieve the Silver Harp of Creation (Lyralei's garden, room 138)
3. Claim the Golden Trumpet of Change (from the Recursive Zephyros)
4. Claim the Lute of Whispering Shadows (from Nyxara)
5. Claim the Crystal Flute of Wisdom (from Thessarian the Patient)

Each objective ticks off the moment you `get` the relevant instrument.

### Turn-in & rewards

The quest giver is `nomagio_apprentice` (Nomagio). Once all five
instruments are in your bag, return to him and the quest closes.

| Reward       | Amount               |
|--------------|----------------------|
| Gold         | 2,000                |
| XP           | 5,000                |
| Relationship | +50 with Nomagio     |
| Custom title | "the Symphonist"     |

**The instruments stay in your bag** after turn-in — you still need them
for the room 200 finale.

### Maintainer notes

- Quest definition lives in `quests.json` under
  `collect_five_instruments`. New optional fields on the quest schema:
  - `keepItems: true` — when set, the turn-in handler in `mud_server.js`
    skips the usual "remove pickup-quest items" cleanup.
  - `rewards.suffix` — a string that is applied to `player.suffix` on
    turn-in (printed to the player as `+Custom title: "..."`).
- The auto-accept call lives in `triggerGatekeeperTransition`, wrapped in
  `try/catch` so a bad quest definition cannot block the L15 transition
  itself.
- Pickup detection reuses the existing `item_pickup` objective type and
  `handleGet` hook — no new event code. Boss-dropped instruments fall to
  the floor first, so picking them up triggers the same hook.
- The Silver Harp is seeded into room 138 by `initializeRoomItems`.

---

## 4. `consider` — fight outcome estimate (0.7)

### Usage

```
consider <monster>
con <monster>
```

Works during combat (you can size up your current opponent or another
monster in the room).

### What it shows

```
=== Consider: Morwyn Ironheart ===
Level:     16  (you: 15, gap: +1)
HP:        900/900
Strength:  ~55 raw damage per hit
Type:      Boss

Your est. DPS:   ~58.0 per round (kills it in ~16 rounds)
Its est. DPS:    ~52.5 per round (kills you in ~9 rounds)

You'd probably lose this fight.
```

### Verdict scale

| Condition                                               | Verdict                                |
|---------------------------------------------------------|----------------------------------------|
| Monster kills you in ≤2 rounds                          | "It will crush you in moments."        |
| You die ≥3 rounds before it does                        | "You are badly outmatched. Run."       |
| You die before it dies                                  | "You'd probably lose this fight."      |
| It dies ≥3 rounds before you do                         | "You would likely win with ease."      |
| It dies before you do                                   | "You would likely win, but bring a potion." |
| Both within 2 rounds of each other                      | "A coin-toss fight."                   |

### Maintainer notes

- `handleConsider(socket, player, name)` is in `mud_server.js`. It calls
  `findMonsterInRoom`, then computes per-round averages from
  `player.baseDamage`, equipment bonuses, monster `str`, and current HP.
- The verdict string is the model the UI uses to communicate risk — it's
  cheap to recalibrate; just nudge the thresholds.
- The command is allowed during combat by extending the
  `isMonsterCombatAllowed` whitelist in `processCommand`.

---

## 5. Aliases (0.9)

### Usage

```
alias <name> <command>     create or replace
alias <name>               show one alias
alias                      list all your aliases
unalias <name>             remove
```

Example session:

```
> alias k attack
Alias set: k = attack
> k goblin
You strike the goblin for 8 damage!
```

Only the **first whitespace-separated word** of your input is replaced.
Anything after it is appended to the expansion.

### Rules

- Names: **1–20 characters**, must start with a letter, then letters,
  digits, `_`, or `-` only.
- Values: **max 120 characters**.
- Reserved (cannot be aliased): `alias`, `unalias`, `aliases`, `quit`,
  `help`, `admin` — anything that would lock you out or shadow help.
- Aliases are **personal** and **persistent** — saved with your character
  in `players/<name>.json` under `aliases: { ... }`.

### Maintainer notes

- `expandAlias(player, raw)` does a single-pass first-word substitution.
  It's deliberately not recursive: aliases cannot expand to other aliases.
  This avoids loops without needing a depth check.
- The expansion is the **first thing** `processCommand` does, before
  case-folding or matching. The full input is rewritten before any
  command dispatch sees it.
- Persistence: `aliases` is added to the save object in `savePlayer` and
  back-filled in `loadPlayer` (`data.aliases || {}`).

---

## 6. Channels (0.8)

Server-wide topical chat. Four channels ship by default.

| Channel | Default | Purpose                                    |
|---------|---------|--------------------------------------------|
| newbie  | ON      | New players asking questions               |
| ooc     | ON      | Out-of-character chat                      |
| gossip  | ON      | Idle server-wide banter                    |
| trade   | ON      | Buying / selling gear and potions          |

### Usage

```
<channel> <message>     send a message on that channel
<channel>               toggle the channel ON/OFF for you
channels                list all channels and your subscriptions
```

For example:

```
> ooc anyone seen Lyralei lately?
[OOC] Mark: anyone seen Lyralei lately?

> trade
Channel trade: OFF

> trade WTS Stormwalker Boots, 200g
You are not listening to trade. Type "trade" with no message to toggle on.
```

### Visibility & ignore

- Only players with the channel **ON** see messages on it.
- Channel messages respect your **ignore list** — ignored players are
  silenced on every channel.
- Messages display as `[Channel] PlayerName: message` with channel
  colours.

### Maintainer notes

- `CHANNELS` is a small map in `mud_server.js`: `{ key: { color, label, description } }`.
  Add a channel by appending one entry, no other code needed.
- `handleChannelMessage(socket, player, channelKey, message)` handles
  both "send" and "toggle" (toggle when `message` is empty).
- Toggle state lives in `player.channelSubs[key]`. Persisted with
  `aliases` in the save format. Defaults are seeded in `createPlayer`.

---

## 7. Help system (0.3)

Comprehensive in-game help, fed from `help.json`.

### Usage

```
help                        index of all topics, grouped by category
help <topic>                full text for one topic
help search <term>          full-text search across all topics
?                           alias for "help"
```

### Topic structure

`help.json` is a single object with a `topics` map. Each topic has:

| Field      | Required | Notes                                                   |
|------------|----------|---------------------------------------------------------|
| `title`    | yes      | Header for the topic                                    |
| `category` | yes      | Index grouping (Basics / Combat / Items / etc.)         |
| `summary`  | yes      | One-line description (used by search and the index)     |
| `body`     | yes      | The detailed text, with `\r\n` for line breaks          |
| `seeAlso`  | no       | Array of other topic keys to suggest                    |

### Topics shipped (35)

Basics: `look`, `brief`, `movement`, `save`, `quit`
Information: `score`, `qs`, `consider`, `who`, `whois`, `time`, `leaderboard`, `map`, `bestiary`, `monsters`
Combat: `attack`, `flee`, `cast`, `spells`, `mana`, `pray`, `pvp`
Items: `inventory`, `equipment`, `equip`, `unequip`, `get`, `drop`, `use`, `examine`
Communication: `say`, `shout`, `tell`, `emote`, `channels`, `afk`, `ignore`
Customization: `alias`, `aliases`, `channels-on-off`
Quests: `quests`, `accept`, `abandon`

### Maintainer notes

- `loadHelpData()` reads and caches `help.json` at startup. Re-call to
  hot-reload edits (currently only triggered on boot).
- `handleHelp(socket, player, args)` distinguishes three cases by the
  args string: empty → index, starts with `search ` → full-text scan,
  otherwise → topic lookup.
- Search is case-insensitive substring on key, summary, and body. First
  30 hits returned.
- Adding a topic: edit `help.json`, restart server. No code changes.

---

## 8. Bestiary (0.4)

In-game encyclopedia of every monster.

### Usage

```
bestiary               list every monster, sorted by level
bestiary <name>        details for one monster (partial match works)
```

The list shows each entry as `L<level>  <Type>  <Name>`, with the type
colour-coded (red = Aggressive, yellow = Neutral, green = Passive,
bright red = Boss).

### Detail view

```
=== The Recursive Zephyros ===
[Boss]
Level: 19
Type: Boss
HP: 1200
Strength: 70

A wizard whose mind cracked along temporal seams...

Lair: room_144

Guaranteed drops: golden_trumpet_of_change, superior_mana_potion

This foe has a signature mechanic. Fight with caution.
```

The "signature mechanic" line appears whenever the monster's templateId
is registered in `BOSS_SIGNATURES` — i.e. you'll know the fight has a
twist before you start it.

### Maintainer notes

- `handleBestiary(socket, player, args)` in `mud_server.js` enumerates
  `monsterData.monsters` and `monsterData.bosses`, then renders.
- Drops are pulled from `itemData.bossDrops` (guaranteed) or
  `itemData.monsterLootTables` (regular). No new data files.
- Search prefers exact id/name match, then falls back to substring on
  either.

---

## 9. Map (0.5)

A 7×7 ASCII window of your current zone.

### Usage

```
map
```

Output:

```
=== Map: Crystal Caverns ===
* * * #
*   @ * #
* *
  *

Legend: @ you  * visited  # unvisited
```

- `@` — your current room
- `*` — a room you have visited
- `#` — a room in this zone you haven't been to yet
- (blank) — no room at this coordinate, or it's in a different zone

### How layout is computed

Coordinates are derived by **BFS** from the lowest-numbered room in each
zone. Standard direction vectors:

| Direction | dx, dy   |
|-----------|----------|
| north     | (0, -1)  |
| south     | (0, +1)  |
| east      | (+1, 0)  |
| west      | (-1, 0)  |
| northeast | (+1, -1) |
| northwest | (-1, -1) |
| southeast | (+1, +1) |
| southwest | (-1, +1) |
| up / down | (0, 0)   |

Up/down don't change x/y, so multi-floor zones may overlap on the map —
this is by design (the window is small; vertical layouts get a future
pass if needed).

### Maintainer notes

- `buildZoneMap()` runs once at server boot and caches the result in
  `zoneMapCache`. To refresh after editing `rooms.json`, restart the
  server.
- Visited rooms are read from `player.stats.roomsExplored`. If your
  exploration tracker changes shape, update the `visited.includes(...)`
  check.
- The window radius is hard-coded as `RADIUS = 3` (giving 7×7). Bump it
  for larger displays, but watch out for telnet width.

---

## 10. Save-file changes & migration

Two new top-level fields are written to `players/<name>.json`:

```json
{
  "...existing fields...": "...",
  "aliases": { "k": "attack" },
  "channelSubs": { "newbie": true, "ooc": true, "gossip": true, "trade": true }
}
```

`equipped` may now contain entries for `head`, `neck`, `hands`, `feet`,
and `finger`. Old saves missing these fields are back-filled with `null`
on load via `Object.assign({...defaults}, data.equipped || {})` — **no
manual migration is required**.

The pre-existing `storyFlags` object (Eldoria 2.0) and `suffix` string
are unchanged. The Symphonist suffix is stored in the same
`player.suffix` field used by the admin `suffix` command.

---

## 11. Smoke test

A cycle test lives at `test_tier0.js`. It connects to `127.0.0.1:8888`,
registers `Testadmin`, and runs 13 assertions against the new commands.

Run it with the server already up:

```bash
node mud_server.js &
node test_tier0.js
```

Expected output:

```
=== Tier 0 smoke ===
  PASS  help index loads
  PASS  help consider topic loads
  PASS  help search runs
  PASS  bestiary list
  PASS  bestiary <name>
  PASS  map renders
  PASS  alias listed
  PASS  alias removed
  PASS  channels list shows newbie/ooc
  PASS  ooc command accepted
  PASS  consider rejects missing target
  PASS  equipment shows new slots
  PASS  qs works

=== 13/13 PASSED ===
```

If `Testadmin` already exists in `accounts.json`, clear it first:

```bash
rm -f players/testadmin.json players/testadmin.json.bak
node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('accounts.json','utf8'));delete a['testadmin'];fs.writeFileSync('accounts.json',JSON.stringify(a,null,2));"
```

The harness uses `pwpw123456` (10 chars, satisfies the password policy).
Adjust if the policy changes.

---

## Appendix: file map

| Concern                | Files touched                                                |
|------------------------|--------------------------------------------------------------|
| Equipment slots        | `mud_server.js`, `items.json`                                |
| Boss mechanics         | `mud_server.js`, `monsters.json`                             |
| Symphony quest         | `mud_server.js`, `quests.json`                               |
| Consider               | `mud_server.js`                                              |
| Aliases                | `mud_server.js` (+ save format)                              |
| Channels               | `mud_server.js` (+ save format)                              |
| Help system            | `mud_server.js`, `help.json` *(new)*                         |
| Bestiary               | `mud_server.js`                                              |
| Map                    | `mud_server.js`                                              |
| Smoke test             | `test_tier0.js` *(new)*                                      |

The bulk of new code sits in `mud_server.js` between the Eldoria 2.0
finale helpers and the auth state machine — search for
`CONSIDER COMMAND (Tier 0.7)` to find the entry point.
