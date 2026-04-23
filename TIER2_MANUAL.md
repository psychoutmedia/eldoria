# Tier 2 Manual — The Shattered Realms MUD

Scope: the **core depth loop** — five of the nine Tier 2 features from
`ROADMAP_NORTH_STAR.md`. Deferred to Tier 2 part 2: 2.5 (boss mechanics v2),
2.7 (clans), 2.8 (MSDP/GMCP), 2.9 (server-side triggers).

This pass ships:

1. **2.1 Campaigns** — daily kill-target quest.
2. **2.2 Quest Points shop** — spend QPs at Nomagio's Repository.
3. **2.3 Pets** — tame, follow, assist in combat.
4. **2.4 Crafting + enchanting** — three skills, recipe-driven.
5. **2.6 Remort** — reset to L1 keeping a permanent bonus; cap Tier 5.

---

## Contents

1. [Campaign system (2.1)](#1-campaign-system-21)
2. [Quest Points + Repository (2.2)](#2-quest-points--repository-22)
3. [Pet system (2.3)](#3-pet-system-23)
4. [Crafting + enchanting (2.4)](#4-crafting--enchanting-24)
5. [Remort (2.6)](#5-remort-26)
6. [Save-file changes & migration](#6-save-file-changes--migration)
7. [Smoke test](#7-smoke-test)

---

## 1. Campaign system (2.1)

### Player view

```
campaign            show current campaign (or start one if ready)
campaign start      force-start a new campaign
campaign status     alias for the bare "campaign" command
campaign abandon    abandon current campaign (no QP reward, no cooldown reset)
```

On first run, the system picks **3 random kill targets** from monster
templates in your level band (±3 levels, capped at the world's range).
Each target lists the monster name and a counter `0/N` where `N` is 1–3.

When you kill a monster, every campaign target with a matching
`templateId` ticks. When all three reach their target count, the campaign
completes and you receive:

- **QP reward**: `50 + 10 * player.level` quest points
- **XP reward**: `250 * player.level`
- **Gold reward**: `50 * player.level`
- Unlock of the `campaigner_first` achievement (and `campaigner_ten` at
  10 completions)

### Cooldown

One campaign per real-time hour. After completion, the next campaign can
be started once `Date.now() - campaignLastCompletedAt >= 3600000`. The
`campaign` command tells you the remaining cooldown.

Abandon has no cooldown reset — you can abandon and immediately restart
a fresh one, but you lose the progress you had.

### Maintainer notes

- Player fields added:
  - `player.campaign` — `{ targets: [{templateId,name,required,killed}], startedAt }` or `null`
  - `player.campaignLastCompletedAt` — epoch ms
  - `player.campaignsCompleted` — integer count
  - `player.questPoints` — integer
- Constants:
  - `CAMPAIGN_COOLDOWN_MS = 3600000`
  - `CAMPAIGN_TARGET_COUNT = 3`
  - `CAMPAIGN_LEVEL_RANGE = 3`
- Hook: `handleMonsterDeath` calls `tickCampaignOnKill(player, monster.templateId)`
  *before* the XP-split block, so the kill counts even if the player
  splits XP with group members.
- Commands dispatched in the Tier 2 router block.

---

## 2. Quest Points + Repository (2.2)

### Player view

Spend QPs at **Nomagio's Repository** (room_001). Use:

```
redeem             list all items available for QP redemption
redeem <item>      redeem an item by short name
qp                 show your current QP balance
```

The Repository stocks three classes of goods:

| Category  | Example                   | Cost     | Effect                                 |
|-----------|---------------------------|---------:|----------------------------------------|
| Gear      | Resonant Blade            |  500 QP  | Weapon, levelReq 15, +30 damage        |
| Gear      | Ring of Quiet Hours       |  800 QP  | Finger accessory, +5 armor, +10 mana   |
| Aura      | Aura: "the Resolute"      |  300 QP  | Sets `player.suffix = "the Resolute"`  |
| Aura      | Aura: "the Campaigner"    |  500 QP  | Sets `player.suffix = "the Campaigner"`|
| Pet egg   | Pet Egg: Loyal Spirit     | 1000 QP  | Grants 1 pet (see §3)                  |
| Pet egg   | Pet Egg: Singing Hound    | 1500 QP  | Grants 1 pet (stronger)                |

QPs come from campaigns (primary), boss kills (secondary: `+5 QP` per
first-time boss kill), and the `redemption_first` achievement (+20 QP
one-time).

Redemption is blocked outside room_001 with the message
`"You must be in Nomagio's Repository (room 001) to redeem."` Auras
override your current suffix; consumed pet eggs are deleted from the
stock list only for that player action.

### Maintainer notes

- `NOMAGIO_REPOSITORY` is a map of `{ id: {kind, name, cost, payload} }`.
- `handleRedeem(socket, player, itemName)` dispatches by `kind`:
  `gear` → `createItem` + `inventory.push`; `aura` → `player.suffix`;
  `pet_egg` → `grantPetFromEgg`.
- QPs are never negative; if the player is short, print the gap.

---

## 3. Pet system (2.3)

### Player view

```
tame <monster>     attempt to tame a monster in this room
pets               list your pets (active + stabled)
pet <name>         detail view for one pet
release <name>     release a pet forever (cannot be undone)
pet stable         stable the currently-following pet (room_001 only)
pet summon <name>  summon a stabled pet (room_001 only)
```

### Taming rules

- Works only on `templateId`-driven monsters **not** in the Boss list.
- Base success chance:
  - Passive monster → 25%
  - Neutral monster → 15%
  - Aggressive monster → 8%
- Success consumes the monster (removed from room, no XP/loot).
- Failure consumes a turn — if the monster is aggressive it will attack.
- **Cap: 3 pets total** (active + stabled combined).

### Pet behaviour

- Pets follow their owner through rooms automatically (unless stabled).
- In combat, an active pet rolls a bonus attack each round:
  `petDamage = floor(pet.level * 1.5) + rand(0..pet.str)`.
- Pet HP regenerates at +5/tick (6s) out of combat.
- Pet death: HP dropped to 0 → returns to stable at 50% HP, cannot
  re-summon for 2 minutes.
- Pet levels up by sharing in kills: `pet.xp += floor(monster.xpValue / 3)`;
  levels scale HP and damage.

### Pet eggs

From the Repository (see §2). Hatching gives a pet with preset
templateId, level, and suffix. Egg names come from the
`NOMAGIO_REPOSITORY` payloads.

### Maintainer notes

- `player.pets` — array of `{ id, templateId, name, level, hp, maxHp, str, xp, active, stabledAt }`.
- Active pet is `player.pets.find(p => p.active)` (max one active at a time).
- `handleTame`, `handlePets`, `handleRelease`, `handlePetStable` wired
  in the Tier 2 router.
- Movement hook: extend `handleMove` to run the active pet's room
  through a `followPet(player)` helper after the player's own move.
- Combat hook: `playerAttackMonster` calls `petAssistAttack(player, monster)`
  after the player's own damage roll.

---

## 4. Crafting + enchanting (2.4)

### Player view

```
recipes                list all known recipes
recipes <skill>        filter by weaponsmith / enchanter / alchemist
craft <recipe>         craft; materials are consumed from inventory
skills                 show your skill levels
```

Three skills, each leveling 1→10:

- **weaponsmith** — forges + improves weapons
- **enchanter** — imbues resist/affect onto gear
- **alchemist** — brews potions

Skill level rises 1 per craft, capped at 10. You cannot craft a recipe
above your skill level + 2 (so early-game gating applies).

### Starter recipes (in `recipes.json`)

| Recipe id             | Skill        | Req Lvl | Materials                             | Produces                      |
|-----------------------|--------------|--------:|---------------------------------------|-------------------------------|
| sharpened_dagger      | weaponsmith  |  1      | 2× iron_scrap                         | Sharpened Dagger (+8 dmg)     |
| warhammer             | weaponsmith  |  4      | 3× iron_scrap, 1× ember_core          | Warhammer (+18 dmg)           |
| resonant_edge         | weaponsmith  |  7      | 2× harmonic_shard, 1× iron_scrap      | Resonant Edge (+28 dmg)       |
| fire_ward_ring        | enchanter    |  2      | 1× silver_band, 1× fire_essence       | Ring of Fire Ward (+10 fire resist) |
| spell_focus_amulet    | enchanter    |  5      | 1× traveler_amulet, 2× harmonic_shard | Spell Focus Amulet (+15 max mana)   |
| minor_healing_brew    | alchemist    |  1      | 2× herb_bundle, 1× spring_water       | Minor Healing Brew (+30 HP)   |
| mana_draught          | alchemist    |  3      | 1× mana_petal, 1× spring_water        | Mana Draught (+40 mana)       |
| greater_healing_brew  | alchemist    |  6      | 3× herb_bundle, 1× phoenix_feather    | Greater Healing Brew (+100 HP)|

Materials drop from monsters via the existing loot system (minor updates
to `itemData.monsterLootTables` and a new `crafting` category in
`items.json`).

### Maintainer notes

- `recipes.json` — top-level object `{ recipes: { [id]: { skill, reqLevel, inputs, output } } }`.
- `player.skills` — `{ weaponsmith: int, enchanter: int, alchemist: int }`.
- `loadRecipes()` at startup, caches `recipeData`.
- `handleCraft(socket, player, recipeId)` validates materials, consumes
  them, produces the output, bumps the appropriate skill.

---

## 5. Remort (2.6)

### Player view

At **level 30** with `finaleCompleted === true`:

```
remort                  show remort preview (level reset, bonuses, caveats)
remort confirm <stat>   perform the remort. Stat: str/dex/con/int/wis
```

Effects:
- `player.level` → 1, experience → 0, HP/mana → L1 baselines.
- **Equipped gear unequipped and stays in inventory** (but you can't
  re-equip anything over your new level).
- Inventory **preserved**, gold **preserved**, story flags preserved
  (finale stays done).
- `player.remortTier += 1` (1..5). At 5, further `remort confirm` is rejected.
- The chosen stat gets `+1` permanent bonus (via
  `player.permStatBonuses[stat]`, applied on top of any trained value).
- `player.suffix` is set to `"the Tier-N Harmonist"` (unless player has
  purchased a higher-prestige aura — don't overwrite purchased auras).
- **+5% XP gain** per remort tier, permanent. Applied at XP award sites.

### Maintainer notes

- `player.remortTier` — int, default 0.
- `player.permStatBonuses` — `{ str,dex,con,int,wis: 0 }`.
- `getAbilityScore(player, key)` — new helper. Returns
  `player.abilities[key] + (permStatBonuses[key] || 0)`. STR/DEX/etc.
  helpers updated to call through this.
- `REMORT_XP_BONUS = 0.05` per tier; multiplier applied in
  `handleMonsterDeath` before the group-split block.

---

## 6. Save-file changes & migration

New top-level fields on `players/<name>.json`:

```json
{
  "questPoints": 0,
  "campaign": null,
  "campaignLastCompletedAt": 0,
  "campaignsCompleted": 0,
  "pets": [],
  "skills": { "weaponsmith": 0, "enchanter": 0, "alchemist": 0 },
  "remortTier": 0,
  "permStatBonuses": { "str": 0, "dex": 0, "con": 0, "int": 0, "wis": 0 }
}
```

All fields are back-filled with safe defaults in `loadPlayer` via
`typeof` checks or `Object.assign`. Old saves remain playable.

---

## 7. Smoke test

`test_tier2.js` connects to `127.0.0.1:8888`, registers `Testadmin2`
(password `pwpw123456`, satisfies the password policy), and runs lenient
assertions against each of the new commands. It does **not** grind
through a full campaign or remort path — those are integration scenarios
the lenient test can't efficiently cover.

Expected assertions:

- `campaign` prints campaign status or starts one.
- `qp` prints a QP balance.
- `redeem` lists items or rejects (wrong room).
- `recipes` prints the recipe list.
- `skills` prints the three skill levels.
- `pets` prints "no pets" or a pet list.
- `remort` prints the preview (gated on L30, so the test accepts the
  "you must be L30" rejection as success).
- Aliases of the above (`camp`, `qs`-style shortcuts) if provided.

---

## Appendix: file map

| Concern          | Files touched                                  |
|------------------|------------------------------------------------|
| Campaigns        | `mud_server.js`                                |
| QP + Repository  | `mud_server.js`, `items.json`                  |
| Pets             | `mud_server.js`                                |
| Crafting         | `mud_server.js`, `recipes.json` *(new)*, `items.json` |
| Remort           | `mud_server.js`                                |
| Smoke test       | `test_tier2.js` *(new)*                        |
