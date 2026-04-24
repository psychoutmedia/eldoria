# Tier 2 Manual — The Shattered Realms MUD

_Reference documentation for the Tier 2 depth loop._

This tier takes the MUD from "Aardwolf-lite launch" (the end of Tier 1) into
the territory the north-star roadmap calls **depth**. Tier 2 ships the five
core features that turn level-30 from an endpoint into a renewable identity:
daily campaigns, a quest-point economy, pets, crafting, and remort.

> **Scope of this pass.** Tier 2 features 2.5 (boss-signature v2), 2.7
> (clans), 2.8 (MSDP/GMCP), and 2.9 (server-side triggers) are **deferred**
> to a follow-up "Tier 2 Part 2" pass. Everything below is live in the
> server.

Target audience: players who want to know what the commands do and
maintainers who need to understand the wiring.

---

## Contents

1. [At a glance — commands & keys](#1-at-a-glance--commands--keys)
2. [2.1 Campaigns](#2-21-campaigns)
3. [2.2 Quest Points & Nomagio's Repository](#3-22-quest-points--nomagios-repository)
4. [2.3 Pets](#4-23-pets)
5. [2.4 Crafting & enchanting](#5-24-crafting--enchanting)
6. [2.6 Remort](#6-26-remort)
7. [Save-file schema & migration](#7-save-file-schema--migration)
8. [Hooks the Tier 2 module installs into existing code](#8-hooks-the-tier-2-module-installs-into-existing-code)
9. [Smoke test](#9-smoke-test)
10. [Known limitations & deferred work](#10-known-limitations--deferred-work)
11. [Tuning constants reference](#11-tuning-constants-reference)

---

## 1. At a glance — commands & keys

All commands below are dispatched through `handleTier2Command` (in
`mud_server.js`) before the legacy command router sees the input, so none
of them collide with Tier 0 / Tier 1 verbs.

| Verb                              | What it does                                          |
|-----------------------------------|-------------------------------------------------------|
| `campaign` / `camp`               | Show current campaign / cooldown                      |
| `campaign start`                  | Begin a new campaign (if cooldown is clear)           |
| `campaign abandon`                | Drop the active campaign; cooldown is not refunded    |
| `qp` / `questpoints`              | Show your Quest Point balance                         |
| `redeem`                          | List the Repository catalog (must be in room_001)     |
| `redeem <id>`                     | Redeem an item by id or substring                     |
| `tame <monster>`                  | Try to tame a monster in the room                     |
| `pets`                            | List your pets                                        |
| `pet <name>`                      | Show a pet's detail sheet                             |
| `pet stable`                      | Stable the active pet (room_001 only)                 |
| `pet summon <name>`               | Re-summon a stabled pet (room_001 only)               |
| `release <name>`                  | Release a pet forever                                 |
| `recipes` / `recipes <skill>`     | List known recipes, optionally filtered by skill      |
| `craft <recipe-id>`               | Craft an item (consumes materials)                    |
| `skills`                          | Show your weaponsmith/enchanter/alchemist levels      |
| `remort`                          | Show remort preview                                   |
| `remort confirm <stat>`           | Perform remort; `stat` is str/dex/con/int/wis         |

---

## 2. 2.1 Campaigns

A campaign is a short daily-quest-style kill list. One campaign per real
hour; complete it for Quest Points, XP, and gold.

### How it works

When you run `campaign start`:

1. The server reads the regular-monster template list
   (`monsterData.templates`).
2. It filters down to templates whose level is within **±3** of your
   current level (`CAMPAIGN_LEVEL_RANGE`).
3. It picks **3** unique templates at random (`CAMPAIGN_TARGET_COUNT`).
4. Each target gets a required kill count rolled `1..3`.
5. The campaign object is stored as
   `player.campaign = { targets, startedAt }`.

While a campaign is active, every monster you kill is matched against your
targets by `templateId`. The hook lives in `handleMonsterDeath` and fires
**after** the practice-point bump but **before** the group XP split —
so group-killed mobs still count for whoever pulled the target.

A `[Campaign progress]` line prints on every tick. When every target hits
its required count the campaign auto-completes.

### Completion rewards

Let `L = player.level` at the moment of completion:

| Reward                  | Amount             |
|-------------------------|--------------------|
| Quest Points            | `50 + 10 * L`      |
| Experience              | `250 * L`          |
| Gold                    | `50 * L`           |
| Achievement             | `campaigner_first` (first campaign ever), `campaigner_ten` (10th) |

Completion also sets `campaignLastCompletedAt = Date.now()` and bumps
`campaignsCompleted`.

### Cooldown

`CAMPAIGN_COOLDOWN_MS = 3600000` (one hour of wall-clock time). Until the
cooldown clears, `campaign start` rejects with a "you must wait N minutes"
message. A bare `campaign` with no active quest tells you how long remains.

### Abandoning

`campaign abandon` clears `player.campaign` but **does not** reset
`campaignLastCompletedAt`. You can abandon and immediately restart if the
cooldown happens to be clear. This matters if your target list contains a
template you can't reach (e.g., a zone that's gated by a boss you
haven't killed yet).

### Edge cases

- If no templates match your level band at all, `campaign start` prints
  "No suitable campaign targets could be found at your level." This can
  happen to Tier-5 remorts at L1 briefly, since the level band is narrow.
- Boss templates are excluded: the candidate pool is only the regular
  `templates` section of `monsters.json`, never the `bosses` section.
- Multiple kill progress in a single `attack` round (e.g., an AoE) fires
  one `[Campaign progress]` line per matching tick.

---

## 3. 2.2 Quest Points & Nomagio's Repository

Quest Points (QP) are the second currency. They survive cycle resets, so
they are genuinely meta-progression.

### Earning QP

| Source                                            | Reward            |
|---------------------------------------------------|-------------------|
| Completing a campaign                             | `50 + 10 * L`     |
| First-time kill of any boss (`first-time` means the boss name wasn't already in `player.stats.bossesDefeated`) | `+5 QP`           |
| Redemption (on any purchase)                      | Unlocks `redemption_first` achievement (no QP; just a flag) |

QPs are stored on `player.questPoints` (integer, never negative).
The `qp` command prints the current balance and the count of campaigns
completed.

### Spending QP — the Repository

**Location:** `room_001` (the starting chamber, which is where Nomagio
sits). Run `redeem` from any other room and the server replies:

> You must be in Nomagio's Repository (room 001) to redeem.

The catalog, with prices at commit time:

| Id                  | Kind     | Cost    | Payload                                         |
|---------------------|----------|--------:|-------------------------------------------------|
| `resonant_blade`    | gear     | 500 QP  | Weapon, L15, +30 damage, harmonic type          |
| `quiet_ring`        | gear     | 800 QP  | Finger slot, +5 armor, +10 max mana             |
| `aura_resolute`     | aura     | 300 QP  | Sets `player.suffix = "the Resolute"`           |
| `aura_campaigner`   | aura     | 500 QP  | Sets `player.suffix = "the Campaigner"`         |
| `egg_loyal`         | pet_egg  | 1000 QP | Hatches a L5 Spirit pet                         |
| `egg_singing`       | pet_egg  | 1500 QP | Hatches a L8 Hound pet                          |

`redeem <id>` also accepts substring matches against the id or the item
name — so `redeem ring` matches `quiet_ring`.

The purchase flow:

- **Insufficient QP** → prints `You need N more Quest Points to redeem X.`
- **Gear** → `createItem(payload.itemId)` is pushed into inventory.
- **Aura** → `player.suffix` is overwritten with the aura string. The
  purchased-aura list is honoured later by the remort code: remort will
  not overwrite an aura you paid for.
- **Pet egg** → calls `grantPetFromEgg(...)`. Capped at 3 total pets; an
  attempt to redeem past the cap refunds nothing and prints
  `"You cannot keep more than 3 pets."`

---

## 4. 2.3 Pets

Pets are optional combat companions. You own them; they live on your
player save file as `player.pets`, an array of up to 3 entries.

### Acquisition

Two paths:

1. **Taming.** Walk into a room, `tame <monster>`, roll against
   `PET_TAME_CHANCE`:
   - Passive monster → **25%**
   - Neutral monster → **15%**
   - Aggressive monster → **8%**
   - Bosses can never be tamed.
   On success the monster is removed from the room (no XP, no loot) and
   a pet is created from its stats. On failure aggressive monsters will
   still retaliate as normal — taming does not break combat mechanics.
2. **Pet eggs** from the Repository (see §3). Egg pets have preset
   `templateId`, `name`, and `level`.

In both cases the new pet becomes `active: true` if and only if you have
no other active pet (so taming while one is already out results in a
stabled companion).

### Pet data model

```
{
  id:         "pet_<timestamp>_<counter>",
  templateId: "shadow_wolf",
  name:       "Shadow Wolf",
  level:      4,
  maxHp:      88,
  hp:         88,
  str:        14,
  xp:         0,
  active:     true,
  stabledAt:  0   // epoch ms of last stabling, 0 if never
}
```

### Pet behaviour

| Moment                  | What the server does                                                              |
|-------------------------|-----------------------------------------------------------------------------------|
| Owner kills a monster   | `petShareXP` adds `floor(xpGain/3)` to the active pet. If pet xp ≥ `200 * level`, it levels up (+12 max HP, full heal, +2 str). |
| Owner attacks a monster | `petAssistAttack(player, monster)` — *currently defined but not yet wired into the attack path, see §10.* |
| Owner changes rooms     | `followPet(player, fromRoom, toRoom)` — *currently a no-op scaffold, see §10.*    |
| Pet HP reaches 0        | Pet remains at 0 HP in the list (no auto-revive yet, see §10).                    |

### Pet commands — detail

- `pets` — lists every pet with `[Active]` / `[Stabled]` tag, level, HP/maxHP, XP.
- `pet <name>` — detail sheet: level, HP, str, xp, state.
- `pet stable` — **room_001 only.** Sets the active pet's `active = false`
  and timestamps `stabledAt`. Prints `"<Name> settles into the stable."`
- `pet summon <name>` — **room_001 only.** Deactivates every other pet,
  makes the chosen one `active = true`.
- `release <name>` — filters the pet out of `player.pets`. There is no
  undo and no refund.

---

## 5. 2.4 Crafting & enchanting

Three skills, each levelling 1→10:

- **weaponsmith** — forges new weapons
- **enchanter** — binds resistance / mana onto gear
- **alchemist** — brews potions

### Skill progression

`player.skills` is `{ weaponsmith, enchanter, alchemist }` (integers,
0–10). Each successful craft bumps the relevant skill by 1, capping at 10.

A recipe is craftable when `player.skills[recipe.skill] + 2 >= recipe.reqLevel`.
In practice that means you can craft a recipe up to **two levels above**
your current skill — a gentle pull-forward that lets new players work
through the low-level recipes without grinding the skill to each exact
level.

### Recipes

All recipes live in `recipes.json`. Every recipe is:

```json
{
  "skill":    "weaponsmith",
  "reqLevel": 4,
  "inputs":   [ { "itemId": "iron_scrap", "count": 3 },
                { "itemId": "ember_core", "count": 1 } ],
  "output":   { "itemId": "warhammer" }
}
```

The starter set shipped with Tier 2:

| Recipe id              | Skill        | Req | Inputs                                        | Output                                      |
|------------------------|--------------|----:|-----------------------------------------------|---------------------------------------------|
| `sharpened_dagger`     | weaponsmith  | 1   | 2× iron_scrap                                 | Sharpened Dagger (+8 dmg)                   |
| `warhammer`            | weaponsmith  | 4   | 3× iron_scrap, 1× ember_core                  | Warhammer (+18 dmg)                         |
| `resonant_edge`        | weaponsmith  | 7   | 2× harmonic_shard, 1× iron_scrap              | Resonant Edge (+28 dmg, harmonic)           |
| `fire_ward_ring`       | enchanter    | 2   | 1× silver_band, 1× fire_essence               | Ring of Fire Ward (finger, +10 fire resist) |
| `spell_focus_amulet`   | enchanter    | 5   | 1× traveler_amulet, 2× harmonic_shard         | Spell Focus Amulet (neck, +15 max mana)     |
| `minor_healing_brew`   | alchemist    | 1   | 2× herb_bundle, 1× spring_water               | Minor Healing Brew (+30 HP)                 |
| `mana_draught`         | alchemist    | 3   | 1× mana_petal, 1× spring_water                | Mana Draught (+40 mana)                     |
| `greater_healing_brew` | alchemist    | 6   | 3× herb_bundle, 1× phoenix_feather            | Greater Healing Brew (+100 HP)              |

### The craft flow

1. `craft <recipe-id>` — exact id match, lower-cased.
2. Skill check — reject if `skillLvl + 2 < reqLevel`.
3. Material check — every input must be present in inventory in the
   required count. Missing materials → `"Missing materials: need 3x
   iron_scrap, have 1."`
4. Material consumption — inputs are `splice`d out of `player.inventory`
   in-order. No partial consumption: failure happens before anything is
   removed.
5. `createItem(output.itemId)` is called; the instance is pushed to
   inventory. Failure at this step prints "The craft failed".
6. Skill ticks up (capped at 10).
7. Achievements: `craft_first` (first-ever craft), `craft_master`
   (skill hits 10).

### Item-schema extensions for Tier 2 crafting

`createItem` now passes through these fields so crafted / redemption gear
works end-to-end:

- `slot` (for fine-grained equipment slots — finger, neck, etc.)
- `manaBonus` (used by the mana-pool calc and consumables)
- `resistBonus` (per-element resist dictionary)
- `damageType` (physical/fire/cold/shadow/harmonic — used once Tier 1
  damage-type routing lands)

---

## 6. 2.6 Remort

Remort is the Tier 2 meta-loop: at L30 + finale complete, you can reset
to L1 in exchange for a permanent ability bonus, a permanent XP
multiplier, and a tier tag. Up to **5 remorts** per character
(`REMORT_CAP = 5`).

### Prerequisites

All three must hold, or the command rejects:

1. `player.level >= 30`
2. `player.stats.storyFlags.finaleCompleted === true` (the harmonic
   finale in room 200 — see the Eldoria 2.0 expansion).
3. `player.remortTier < 5`.

### The preview (`remort` with no arg)

Prints the full consequence list and asks you to confirm with
`remort confirm <stat>`. The preview names the next tier, the XP-gain
increase, and the title you'll wear.

### The confirm (`remort confirm <str|dex|con|int|wis>`)

Atomic, all-or-nothing. In order:

1. `remortTier += 1`.
2. `permStatBonuses[stat] += 1` — permanent ability bonus, read via
   `getAbilityScore(player, key)`.
3. **Unequip every slot** — weapon, armor, shield, head, neck, hands,
   feet, finger. Items stay in inventory; you have to re-equip as you
   level again (and you can't equip anything with `levelReq > 1` until
   you level back up).
4. `level = 1`, `experience = 0`, HP/mana/damage reset to `getLevelData(1)`.
5. Suffix — set to `"the Tier-N Harmonist"` **unless** you have a
   purchased aura (`the Resolute` or `the Campaigner`), in which case
   your aura is preserved.
6. `savePlayer(..., silent=true)` — remort persists immediately.
7. Achievements: `remort_first` on the first remort, `remort_max` when
   reaching Tier 5.
8. `logActivity(...)` emits "`<name>` has remorted to Tier N" for the
   global log.

### What remort **preserves**

- Inventory (including the newly-unequipped gear).
- Gold.
- Quest Points.
- `stats.storyFlags.finaleCompleted` (so you don't have to run the
  finale again for subsequent remorts).
- Achievements already unlocked.
- Trained abilities and base ability scores.
- Purchased auras.

### What remort **does not** preserve

- Level, XP, title.
- Equipped slots.
- Active campaign (reset to null is not forced, but tiers of level band
  won't match your old targets — abandon + restart).

### The XP multiplier

`handleMonsterDeath` multiplies XP for every kill:

```js
xpGain = floor(xpGain * (1 + 0.05 * player.remortTier))
```

So:

- Tier 1 → +5% XP per kill
- Tier 3 → +15% XP per kill
- Tier 5 → +25% XP per kill

It compounds additively with the remort tier, not multiplicatively across
tiers.

---

## 7. Save-file schema & migration

New top-level fields on `players/<name>.json`:

```json
{
  "questPoints": 0,
  "campaign": null,
  "campaignLastCompletedAt": 0,
  "campaignsCompleted": 0,
  "pets": [],
  "skills":          { "weaponsmith": 0, "enchanter": 0, "alchemist": 0 },
  "remortTier": 0,
  "permStatBonuses": { "str": 0, "dex": 0, "con": 0, "int": 0, "wis": 0 }
}
```

All fields are back-filled with safe defaults inside `ensureT2Defaults`,
which is called at the top of **every** Tier 2 handler. Old saves
remain playable — the first Tier 2 command run after loading an old
save is what materialises the fields, and they then persist through the
normal save path.

The `ensureT2Defaults` pattern is deliberate: we do not mass-migrate
`loadPlayer` the way older tiers did, because it keeps the migration
scoped to players who actually touch Tier 2 features.

---

## 8. Hooks the Tier 2 module installs into existing code

This is the only way the module reaches into code outside its own block:

| Site                                                | Hook                                                      |
|-----------------------------------------------------|-----------------------------------------------------------|
| `handleMonsterDeath` (just after the XP base calc)  | `xpGain = floor(xpGain * (1 + 0.05 * player.remortTier))` |
| `handleMonsterDeath` (before the group XP split)    | `tickCampaignOnKill(socket, player, monster.templateId)`  |
| `handleMonsterDeath` (right after the above)        | `petShareXP(socket, player, xpGain)`                      |
| `handleMonsterDeath` (boss first-time block)        | `player.questPoints += 5`                                 |
| Main command dispatch (after Tier 1 router)         | `if (handleTier2Command(...)) return true;`               |
| `getItemById` categories array                      | `'crafting'` and `'qp_gear'` added                        |
| `createItem` returned object                        | `manaBonus`, `resistBonus`, `damageType`, `slot` pass-through |
| Startup (after `buildZoneMap`)                      | `loadRecipes()`                                           |

All other Tier 2 functions live in a single clearly-labelled block in
`mud_server.js` between `// ---------- 2.1 Campaign system ----------`
and `// ---------- Tier 2 router ----------`. Moving the block as a unit
is safe; no other code grabs references by line number.

---

## 9. Smoke test

`test_tier2.js` is a lenient black-box test that connects to the live
server on `127.0.0.1:8888` as user **Tiertwo** (password
`pwpw123456` — chosen to clear the 3–12-letters username policy and the
password policy) and runs 16 assertions.

Coverage:

| # | Subsystem    | Assertion                                                       |
|--:|--------------|-----------------------------------------------------------------|
| 1 | 2.1 campaign | `campaign` prints status or "no campaign"                       |
| 2 | 2.1 campaign | `campaign start` prints "New Campaign" / "already" / "must wait"|
| 3 | 2.1 campaign | `campaign abandon` prints "abandon" / "no active"               |
| 4 | 2.2 qp       | `qp` prints "Quest Points"                                      |
| 5 | 2.2 qp       | `redeem` lists the Repository in room_001                       |
| 6 | 2.2 qp       | `redeem aura_resolute` rejects broke buyer OR succeeds          |
| 7 | 2.3 pets     | `pets` prints "no pets" or pet list                             |
| 8 | 2.3 pets     | bare `tame` rejects with "Tame what"                            |
| 9 | 2.3 pets     | bare `release` rejects with "Release which"                     |
| 10 | 2.3 pets    | `pet stable` responds (no active / settles / stable)            |
| 11 | 2.4 craft   | `recipes` prints the recipe list                                |
| 12 | 2.4 craft   | `recipes weaponsmith` filter works                              |
| 13 | 2.4 craft   | `skills` lists all three skills                                 |
| 14 | 2.4 craft   | `craft sharpened_dagger` rejects without materials              |
| 15 | 2.6 remort  | `remort` shows preview gated by L30                             |
| 16 | 2.6 remort  | `remort confirm str` blocked pre-L30                            |

Current status: **16/16 pass.** The test does not exercise the success
paths for taming, redemption with balance, or remort at L30 + finale —
those are integration runs the lenient test cannot set up efficiently.

---

## 10. Known limitations & deferred work

Tracked honestly so future-you knows what was shipped vs scaffolded.

### Inside Tier 2 scope, not fully wired

- **`petAssistAttack`** is defined but not yet invoked from the combat
  path. Pets take no active combat turn; they only share post-kill XP.
  Wiring is a one-line addition inside `playerAttackMonster` and a
  mirror inside the real-time combat tick.
- **`followPet`** is a no-op scaffold. Room transitions do not notify
  pets or broadcast pet movement. Pets still "follow" conceptually
  because they are stored on the player, but there is no arrival/departure
  print to the room.
- **Pet death / revive.** A pet at 0 HP stays in the list at 0 HP; there
  is no auto-stable-on-death, no 2-minute revive timer. The manual spec
  called for both — left to a follow-up.
- **Crafting materials drop path.** Materials exist as items
  (`iron_scrap`, `ember_core`, `harmonic_shard`, `fire_essence`,
  `herb_bundle`, `spring_water`, `mana_petal`, `phoenix_feather`) and
  are produced by `createItem`, but **no monster loot table currently
  lists them.** In the short term you can obtain materials only via
  admin `create_item` / `give_item`. Adding them to zone-appropriate
  loot tables is a one-file change in `items.json`.

### Out of scope for this pass

- **2.5 Boss signature v2** — enrage timers, telegraphs, group-required
  Archmage fights. Not started.
- **2.7 Clans** — not started.
- **2.8 MSDP / GMCP** — not started.
- **2.9 Server-side triggers** — not started.

---

## 11. Tuning constants reference

All in `mud_server.js`, Tier 2 block.

| Constant                     | Value    | Meaning                                                |
|------------------------------|---------:|--------------------------------------------------------|
| `CAMPAIGN_COOLDOWN_MS`       | 3600000  | Real ms between campaigns                              |
| `CAMPAIGN_TARGET_COUNT`      | 3        | Distinct kill targets per campaign                     |
| `CAMPAIGN_LEVEL_RANGE`       | 3        | ±N levels around player level for target eligibility   |
| `PET_FOLLOW_CAP`             | 3        | Total pets per player (active + stabled)               |
| `PET_TAME_CHANCE.Passive`    | 0.25     | Tame success vs passive monster                        |
| `PET_TAME_CHANCE.Neutral`    | 0.15     | Tame success vs neutral monster                        |
| `PET_TAME_CHANCE.Aggressive` | 0.08     | Tame success vs aggressive monster                     |
| `REMORT_CAP`                 | 5        | Maximum remort tier                                    |
| `NOMAGIO_REPOSITORY_ROOM`    | `room_001` | Room gate for `redeem`                               |
| Remort XP bonus              | 5% × tier| Additive per-remort multiplier applied in `handleMonsterDeath` |
| Pet XP share                 | `floor(xpGain / 3)` | Active pet gains this fraction of every kill |
| Pet level-up threshold       | `200 * pet.level`   | XP required to level up                      |
| Pet level-up gains           | +12 max HP, full heal, +2 str | Per level                          |
| Skill cap                    | 10       | Max weaponsmith / enchanter / alchemist level          |
| Skill pull-forward           | +2       | You can craft recipes up to `skill + 2` req level      |
| First-time boss QP bounty    | 5        | QP awarded on first-ever kill of a boss                |

---

## Appendix: file map

| Concern            | Files touched                                         |
|--------------------|-------------------------------------------------------|
| Campaigns          | `mud_server.js`                                       |
| QP + Repository    | `mud_server.js`, `items.json` (`qp_gear` section)     |
| Pets               | `mud_server.js`                                       |
| Crafting           | `mud_server.js`, `recipes.json` *(new)*, `items.json` |
| Remort             | `mud_server.js`                                       |
| Save-file schema   | `mud_server.js` (`ensureT2Defaults`)                  |
| Smoke test         | `test_tier2.js` *(new)*                               |
| Documentation      | `TIER2_MANUAL.md` *(this file)*                       |
