# Tier 1 Manual — Shattered Realms MUD

Tier 1 is the **Aardwolf-lite launch**: the features that turn the playtest MUD into a real RPG. Every system in this file is live on the server, dispatched from `mud_server.js`, and verified by `test_tier1.js` (32/32 passing).

All commands below can be typed at the `>` prompt. Admin-only commands require your name in `admins.json`.

---

## 1.1 Stats System (STR / DEX / CON / INT / WIS)

Every character has five ability scores. They start at 10 and cap at 25. Modifiers are D&D-style: `bonus = floor((value - 10) / 2)`.

| Stat | What it does |
|---|---|
| **STR** | Flat melee damage bonus (`+floor((STR-10)/2)` per swing) |
| **DEX** | Flee success chance scales up to 90% |
| **CON** | +1 max HP per training rank, survivability |
| **INT** | +1 max Mana per training rank, future spell-damage hook |
| **WIS** | Mana regen bonus (added to base per tick) |

### Commands

| Command | Effect |
|---|---|
| `abilities` / `abi` | Show all five scores and their live modifiers |
| `train <stat>` | Spend 1 practice point + gold to raise the stat by 1 (chapel-only) |

### Training

- Must be in a **chapel room** (room_001, 020, 050, 062, 090). Outside a chapel, `train` is rejected.
- Costs scale with current value: early ranks are cheap, 20+ is expensive.
- Each rank consumes **1 practice point** and the gold cost.
- Practice points are granted **+5 per level gained** (see §1.9).

### Example

```
> abilities
=== Abilities ===  (cap 25)
  STR  10 (+0)
  DEX  10 (+0)
  CON  10 (+0)
  INT  10 (+0)
  WIS  10 (+0)
  Practice: 5 pts

> train str
Your Strength rises to 11! (-50 gold, -1 practice)
```

### Admin note
`set_level <player> <N>` now grants `+5 practice` per level of increase, so admins can fast-forward a test character and still have practice points to spend.

---

## 1.2 Classes — Warder / Loresinger / Echobound

At **level 5** you pick one of three classes. The choice is **permanent**. Classes gate spell schools and scale HP/mana.

| Class | HP Mult | Mana Mult | Schools | Role |
|---|---|---|---|---|
| **Warder** | 1.25× | 0.75× | Combat, Protection | Melee bulwark |
| **Loresinger** | 0.85× | 1.50× | Malefic, Divination, Utility | Ranged caster |
| **Echobound** | 1.00× | 1.10× | Theft, Utility | Hybrid rogue |

### Commands

| Command | Effect |
|---|---|
| `class` | Show all three classes, mark current |
| `class warder` / `class loresinger` / `class echobound` | Commit to a class (L5+, one-way) |

### Spell School Gating

From level 5 onward, `cast <spell>` is rejected if the spell's `school` field isn't allowed by your class:
```
Your class cannot wield Malefic magic. Fireball fizzles.
```
Before level 5, any spell is allowed (you have no class yet).

### HP / Mana multipliers

Applied on level-up so a Warder hitting level 10 ends up with `baseHP * 1.25`, while a Loresinger gets `baseMana * 1.50`. Existing characters back-fill a default of 1.0× until class is chosen.

---

## 1.3 Status Effects ("Affects")

Long-duration buffs and debuffs tracked independently of the old `player.effects` bag.

### Definitions (`AFFECT_DEFS`)

| Key | Label | Damage per tick | Behavior |
|---|---|---|---|
| `poisoned` | Poisoned | 4 | DoT |
| `burning` | Burning | 6 | DoT |
| `bleeding` | Bleeding | 3 | DoT |
| `stunned` | Stunned | — | Status |
| `shielded` | Shielded | — | Status |
| `hasted` | Hasted | — | Status |
| `silenced` | Silenced | — | Blocks `cast` |
| `blessed` | Blessed | — | Status |

Ticks fire on a 6-second timer (`tickAffects`). Expiring affects print a "fades" message.

### Commands

| Command | Effect |
|---|---|
| `affects` / `af` | List your active affects with time remaining and potency |

The display bridges **legacy** `player.effects` (shields, divine_protection, silenced from the older spell system) so you see one unified list.

### Programmatic API
- `applyAffect(player, key, durationMs, potency=0)`
- `removeAffect(player, key)`
- `hasAffect(player, key)` (expiration-aware)

---

## 1.4 Damage Types & Resistances

Five damage types: `physical`, `fire`, `cold`, `shadow`, `harmonic`.

### How it works

1. Weapons carry an optional `damageType` (defaults to `physical`).
2. Monsters carry `damageType` (their outgoing type) and `resists` (a map of type → percent).
3. Armor carries `resists` (percent reduction).
4. On hit:
   - **Player → Monster:** `damage *= (1 - monster.resists[weaponType] / 100)`
   - **Monster → Player:** `damage *= (1 - player.resists[monsterType] / 100)`
5. Player resists are summed across all equipped slots and **capped at 75%** per type.

### Annotated gear (examples)

| Item | Damage Type | Resists |
|---|---|---|
| Tuning Fork | harmonic | — |
| Obsidian Drum-Stave | harmonic | — |
| Shadow Cloak | — | shadow +20, cold +10 |
| Arcane Crystal Armor | — | fire +15, cold +15, shadow +15, harmonic +10 |
| Void Barrier | — | shadow +30, harmonic +20 |

### Annotated Eldoria bosses

| Boss | Room | Damage Type | Resists |
|---|---|---|---|
| Morwyn Ironheart | 108 | fire | phys +40, fire +50, harmonic **-25** |
| The Recursive Zephyros | 144 | shadow | phys +50, shadow +30, harmonic **-25** |
| Valdris the Radiant | 150 | harmonic | phys +60, harmonic +40, shadow **-20** |
| Nyxara, Echo-Self | 175 | shadow | phys +55, shadow +50, harmonic **-20** |
| Thessarian the Patient | 198 | harmonic | phys +65, harmonic +40, fire **-20** |

Negative values are **vulnerabilities** — bringing the right instrument-forged weapon to the right fight can swing DPS by 60%+.

---

## 1.5 Group System

Party up with up to 4 other players. XP from shared kills is split with a group bonus.

### Commands

| Command | Effect |
|---|---|
| `follow <player>` | Follow a player through exits |
| `follow` | Stop following |
| `group` | Show your group; if no group, show usage |
| `group <player>` | Invite a player to your group (creates one if needed) |
| `group kick <player>` | Kick a member (leader only) |
| `gquit` / `leavegroup` | Leave the current group |
| `grouptell <msg>` / `gt <msg>` | Chat with groupmates only |
| `assist <player>` | Attack whatever a groupmate is attacking |

### XP split

For a kill with `N` group members **in the same room** as the kill:
```
memberXP = (baseXP * 1.2) / N
```
So a solo kill of 100 XP becomes 60 XP each in a 2-person group (net 120 XP — bonus for grouping).

---

## 1.6 Shops

Three static shops, each in a different zone.

| Shop | Room | Keeper | Buy Mult | Sell Mult | Stock highlights |
|---|---|---|---|---|---|
| Rusty's Armory | 003 | Rusty | 1.0× | 0.4× | Leather vest, iron shortsword, wooden shield, minor healing potion, torch |
| The Quiet Exchange | 050 | The Quiet Man | 1.2× | 0.5× | Mid-tier armor, shadow cloak, greater healing potion |
| The Singing Merchant | 105 | Singing Merchant | 0.9× | 0.6× | Post-Gatekeeper gear, mana potions, superior healing potion |

### Commands

| Command | Effect |
|---|---|
| `list` / `wares` | Show everything the keeper sells, with prices |
| `buy <item>` | Purchase (partial name match) |
| `sell <item>` | Sell something in your inventory |
| `value <item>` / `appraise <item>` | Preview sell price |

Buy/sell prices come from each item's `value` field × the shop multiplier. Minimum 1 gold.

---

## 1.7 Bank

Gold stored in a bank **survives death** and cycle resets.

### Rooms
- Currently only **room_001** (Awakening Chamber).

### Commands

| Command | Effect |
|---|---|
| `bank` / `bank balance` | Show bank + on-hand gold |
| `bank deposit <amt>` / `deposit <amt>` | Move gold from hand to bank |
| `bank withdraw <amt>` / `withdraw <amt>` | Move gold from bank to hand |

### Notes
- Deposit/withdraw both only work at bank rooms.
- `bankUses` counter tracks lifetime uses; hitting 50 unlocks the **Banker** achievement.
- Balance ≥ 100,000 unlocks the **Patron** achievement (title: *the Patron*).

---

## 1.8 Achievements

~30 persistent achievements. Unlock messages broadcast server-wide; titles (where granted) can be worn via the `title` command.

### Commands

| Command | Effect |
|---|---|
| `achievements` / `ach` | List all achievements with unlock status |
| `title` | Show available titles and which one is active |
| `title <name>` | Wear a title suffix |
| `title clear` | Remove your active title suffix |

### Current achievements

| ID | Name | Unlock | Title |
|---|---|---|---|
| first_blood | First Blood | First monster kill | — |
| first_boss | Dragonfell | First boss kill | *the Bold* |
| hundred_kills | Century Slayer | 100 monster kills | — |
| thousand_kills | Genocidal | 1000 monster kills | *the Exterminator* |
| level_15 | The Gatekeeper | Reach level 15 | — |
| level_30 | Apex | Reach level 30 | *the Apex* |
| class_chosen | Oath Sworn | Choose a class at L5 | — |
| explorer_50 | Wanderer | Visit 50 rooms | — |
| explorer_all | Cartographer | Visit every room | *the Cartographer* |
| rich | Affluent | Hold 10,000 gold at once | — |
| banked_100k | Patron | Bank 100,000 gold | *the Patron* |
| banker | Banker | Use the bank 50 times | — |
| harmonist | Harmonist | Play 5 instruments in cycle | *the Harmonist* |
| symphonist | Symphonist | Complete the Shattered Symphony | *the Symphonist* |
| died_10 | Fragile | Die 10 times | — |
| group_kill | Party Animal | Get a kill while grouped | — |
| big_hit | Crushing Blow | Deal 500+ in one hit | — |
| five_bosses | Bossbane | Defeat 5 different bosses | — |
| nine_bosses | Legend | Defeat all 9 named bosses | *the Legend* |
| silencer | Silencer | Kill a Bookworm | — |
| quest_first | First Errand | Complete first quest | — |
| quest_five | Quester | Complete 5 quests | — |
| master_smith | Master Smith | Max out a stat to 25 | — |
| chapel_pilgrim | Pilgrim | Pray at all 5 chapels | *the Pilgrim* |
| alias_power | Shortcut Master | Create 10 aliases | — |
| hermit | Hermit | 1 hour without chatting | — |
| all_shops | Patron of Trade | Buy from every shop | — |
| all_classes_met | Scholar of the Schools | Cast from every school | — |
| helped | Helper | Give an item to another player | — |
| pvp_first | Drawn Blood | First PVP win | — |
| pvp_10 | Arena Regular | 10 PVP wins | *the Duelist* |

---

## 1.9 Practice Points & Skill Training

Practice is the currency for both **stat training** (§1.1) and **spell proficiency** (cast success).

### Earning

- **+5 practice** per level gained (via level-up hook and `set_level` delta)
- **+1 practice** per monster kill

### Commands

| Command | Effect |
|---|---|
| `practice` / `pra` | List spells and your proficiency % in each |
| `practice <spell>` | Spend 1 practice point to raise that spell's proficiency by 10-15% (cap 100%) |
| `train <stat>` | See §1.1 |

### Cast success

Every `cast` now rolls against practice:
```
effectiveChance = min(100, practice + 40)
```
Brand-new spells start at **50% practice → 90% effective cast chance**. A fizzle:
- Prints `You lose focus. X fizzles!`
- Refunds **half** the mana cost (you still pay the other half)
- Sets cooldown to **half** the normal duration
- Prompts you to `practice <spell>`

### Implications

- The first cast of a new spell is a coin-flippy 90%. Practice to 60%+ → near-guaranteed.
- Loresingers who chain-cast Malefic still benefit from training under-used schools for emergency fallback.

---

## 1.10 Bulletin Board + MUD Mail

Two persistence-backed messaging systems.

### Boards (`boards.json`)

Two boards:
- **announcements** — server-wide flavor, admin posts
- **players** — community threads

| Command | Effect |
|---|---|
| `board` / `boards` | List board names and post counts |
| `board list` | Same |
| `board read <announcements\|players>` | Read posts on that board |
| `board post <announcements\|players> <title> \| <body>` | Post a new topic |

Format the post with a literal `|` between title and body, e.g.:
```
board post announcements Tier 1 Live | All new systems are online. Train hard, bank smart.
```

Posts persist to `boards.json` on disk.

### Mail

Mail is stored on the recipient's player save file, so it survives cycles and offline recipients.

| Command | Effect |
|---|---|
| `mail` / `mudmail` | Show your inbox |
| `mail read <n>` | Read message #n |
| `mail send <player> \| <subject> \| <body>` | Send a message |
| `mail delete <n>` | Delete message #n |

If the recipient is **offline**, mail is appended to their save file on disk and surfaces next time they log in.

---

## Integration Notes

A few cross-cutting behaviors worth remembering:

- **Level 15 Gatekeeper** (Eldoria 2.0): on hitting L15, all weapons are destroyed, you teleport to room 101, and receive the Tuning Fork. Your ability scores, class, practice, and bank all persist unchanged.
- **Cycle reset**: the hourly world reset wipes monsters and cycle leaderboards but leaves your stats, bank, achievements, practice, and mail intact.
- **Back-compat**: old save files missing any Tier 1 field load with sane defaults (`abilities: 10/10/10/10/10`, `bank: 0`, `charClass: null`, `affects: []`, etc).

---

## Running the Test Suite

From `H:\claude-practice`:

```
# Start a test server on an alternate port (leaves port 8888 alone)
MUD_PORT=18888 node mud_server.js &

# Run the suite
MUD_PORT=18888 node test_tier1.js
```

The suite connects as `Testadmin`, exercises all 10 sub-systems, and prints a `/32 PASSED` summary. The test is idempotent — re-running it is safe (`set_level 1 → 15` ensures practice points reset deterministically).

### Current result
```
=========================
  32/32 PASSED
=========================
```

---

## File Map

| File | Role |
|---|---|
| `mud_server.js` | All Tier 1 logic (§1.1 – §1.10) |
| `items.json` | Weapons with `damageType`, armor with `resists` |
| `monsters.json` | Monsters with `damageType` + `resists` |
| `boards.json` | Persistent bulletin board storage |
| `players/<name>.json` | Per-player: abilities, charClass, bank, achievements, practice, practicePoints, mail, affects, resists |
| `test_tier1.js` | End-to-end smoke test |
