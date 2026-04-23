# Shattered Realms — Audit & Roadmap to North Star

_Audit date: 2026-04-22. Target: Aardwolf-standard polish before going live._

## Part 1 — Current state (honest read)

**What's already built (and strong):**
- 201 rooms across 22 zones with dense thematic writing
- 53 monster templates + 9 bosses, zone-based spawning, wandering AI
- 127 items across 9 categories with loot tables + guaranteed boss drops
- **37-spell magic system across 6 schools** (Malefic, Theft, Divination, Combat, Protection, Utility) with mana regen — this is genuinely good
- Full auth (accounts + passwords + bans), persistence, auto-save, migration
- Real-time combat (PvE + PvP), flee/surrender, chapel healing, wandering NPC healer
- 4 NPCs with relationship scores, 4 quests with multiple objective types
- Hourly world-reset competitive cycle with leaderboards
- ~50 admin commands incl. invisibility, spawn/despawn, logs, bans
- Level 1–15 (realm 1), Level 15–30 (Eldoria 2.0) with five-Archmage finale
- **11,874-line server**, 3 data files, 1 world module (quests.js)

**Honest weak spots:**
- Combat is a damage calculator — no status effects, no crits, no resists, no types, no cooldowns
- Equipment is 3 slots (weapon/armor/shield) — shallow item differentiation
- No stats (STR/DEX/CON…); level is the only axis
- No classes, no skills-tree, no practice/train system
- Gold drops but nothing premium to buy — no shops, bank, or auction
- 4 quests total, all fetch/kill, no chains, no dailies, no campaigns
- Boss fights are HP bags — no phases, no adds (the Eldoria 2.0 plan specified them but they're unimplemented)
- Zero group/party mechanics — follow, assist, split XP, tank/heal/DPS roles
- No help system, no map, no aliases, no triggers, no channels beyond say/shout/tell
- No client integration (MSDP/GMCP/MXP) — modern clients (Mudlet, MUSHclient) can't auto-map or build UIs
- No achievements or meta-progression that survives cycle reset
- `Beasts of the realm.md` bestiary exists out-of-band; not accessible in-game

## Part 2 — Aardwolf standard, de-mystified

Aardwolf's reputation rests on 7 pillars. Here's where this MUD sits:

| Pillar | Aardwolf | Shattered Realms | Gap |
|---|---|---|---|
| Depth of combat | Classes, skills, spells, tank/heal/DPS, damage types, resists, crits, affects | Flat damage + 37 spells | **Large** |
| Progression | 201 levels × 10 tiers × multiple classes | 30 levels, 1 class | **Huge** |
| Group play | `follow`, `group`, assist, split XP, `consider`, tank/heal roles | None | **Blocker** |
| Content volume | 500+ areas, thousands of mobs | 22 zones, 53 mobs | Medium — OK at current scope |
| Quests/campaigns | Quest system (qps), campaigns (random daily kills), gquests | 4 static quests | **Large** |
| QOL / client | Aliases, triggers, map, help, MSDP, MXP, channels, notes board | Almost none | **Large** |
| Meta-progression | Trivia points, achievements, remorts, unlocks, pets | None (cycle wipes) | **Blocker for long-term retention** |

**You don't need to clone Aardwolf.** The cycle-reset + story-driven identity is distinctive. The north star is "feels as polished as Aardwolf *in the systems you do ship*." That's achievable.

## Part 3 — The roadmap

Four tiers. Tier 0 is the ship-blocker list. Tier 1 brings it to "Aardwolf-lite-but-polished." Tiers 2–3 are depth and north-star.

---

### Tier 0 — Pre-launch polish (ship-blockers) — ~2 weeks

Everything below is already half-started or feels broken without it.

#### 0.1 Boss signature mechanics
The Eldoria 2.0 plan explicitly promised these — currently bosses are stat bags.

- **Morwyn Ironheart**: at 50% HP, spawn 1–2 Discordant Note minions. Mechanic: minions buff Morwyn's damage until killed.
- **Zephyros the Recursive**: on 25%-chance hit, once per fight, "rewrites" and restores full HP with a 3-round telegraph ("Zephyros pauses. The room stutters. Rewrite incoming."). Player can interrupt with any damage spell during the telegraph.
- **Valdris the Radiant**: at 33% HP, spawns Shadow-Self. Damage to either splits 50/50 across both. Must kill within 3 rounds of each other or the dead one revives.
- **Nyxara / Echo-Self**: on hit, 20% chance to silence player spells for 3 rounds. Player's `cast` command rejects; `attack` still works.
- **Thessarian the Patient**: paradox stack — every other attack deals +50% damage, telegraphed ("Thessarian's clock winds tighter.").
- **Archmage Supreme (room 100)**: if not already present, give them a signature — e.g., phase change at 50% HP that swaps resistance types.

**Implementation:** extend the boss-kill/boss-tick paths in `mud_server.js` with a per-boss `onHit`/`onTick`/`onThreshold` hook table.

#### 0.2 `collect_five_instruments` quest chain
- Nomagio gives the meta-quest at room_001 when player reaches L15 (auto-offer).
- 5 sub-objectives (one per instrument), using existing `item_pickup` objective type.
- Chain completion reward: **+5,000 XP, +2,000 gold, permanent suffix "Symphonist"** (stacks under "the Harmonist" if finale also done).
- Progress tracking: `quest progress` command shows checkmarks.
- Ties together the 5 Archmage kills narratively.

#### 0.3 Help system — non-negotiable for playability
- `help` (list of topics), `help <topic>` (full article), `help search <term>` (substring match)
- Topics seeded from: every command, every spell, every zone, every boss, the novella lore (Gatekeeper, Harmonic finale), combat basics, equipment, quests.
- Store in `help/*.md` or `help.json`. Admin command `help_edit <topic>` for in-game authoring.
- Total effort: ~40 topics, most are 3–10 lines.

#### 0.4 In-game bestiary
- `bestiary` / `beasts` command reads from existing `Beasts of the realm.md`
- `bestiary <name>` shows description + level + zone + drops (redacted until first kill? optional)
- Solves the "what am I fighting" problem without spoiling loot tables.

#### 0.5 Zone map / `map`
- ASCII map of current zone (7×7 window centered on player).
- Mark player with `*`, visited rooms `.`, unvisited `?`, exits as lines, bosses as `!`.
- Per-player `visitedRooms` already exists. Add a per-room x/y grid to `rooms.json` (can be auto-generated by walking exits).

#### 0.6 Equipment slot expansion
- 3 slots → 8 slots: head, neck, body (armor), hands, feet, weapon (wield), offhand (shield OR second weapon), finger (ring).
- Existing 15 armor items re-slot where they make sense; leave weapon/shield as-is.
- Items.json schema add `slot: "head"` etc.; `getEquipmentSlot()` reads from item directly.
- Adds depth without adding systems.

#### 0.7 `consider` command
- `consider <monster>` — estimates fight outcome ("You will destroy them." → "You will die horribly.") based on HP/level gap.
- Already partly in the `score` command but needs an explicit `consider` that reads as a verdict, not stats.

#### 0.8 Channels
- `newbie`, `ooc`, `gossip`, `trade` channels with per-player on/off toggles.
- Save channel subscriptions to player file.
- Prevents say/shout from being the only options.

#### 0.9 Aliases
- `alias kk attack` → typing `kk rat` becomes `attack rat`.
- Per-player, persisted. 20 alias cap.
- This is the #1 QOL feature — every Aardwolf regular uses it.

---

### Tier 1 — Aardwolf-lite launch — ~4–6 weeks

This makes the MUD feel premium. After Tier 0 + Tier 1 you can go live and players will stay.

#### 1.1 Stats system (STR / DEX / CON / INT / WIS)
- 5 derived stats, 10 starting points to allocate on character creation (or roll 3d6 classic style).
- Each stat drives: STR → melee damage, DEX → dodge/flee, CON → HP pool, INT → mana pool/spell damage, WIS → mana regen/resist.
- `train <stat>` costs gold + practice points to raise.
- Replaces the flat level-based damage formula with `base + (STR × modifier) + weapon bonus`.

#### 1.2 Classes — 3 starter archetypes
- **Warder** (fighter): melee, tanky, gets Combat + Protection spell schools.
- **Loresinger** (caster): ranged spells, fragile, gets Malefic + Divination + Utility.
- **Echobound** (rogue): hybrid, gets Theft + stealth skills, backstab.
- Class chosen at L5. 37 existing spells partition by school across classes.
- Class determines HP/mana growth rate + spell access.

#### 1.3 Status effects / affects system
- Buffs and debuffs with duration in rounds: poisoned, burning, stunned, shielded, hasted, silenced.
- `affects` command lists active effects.
- Spells that already exist (`shield`, buff spells, debuffs) plug into this instead of being instant.
- Adds combat texture without adding systems.

#### 1.4 Damage types + resistances
- 5 types: Physical, Fire, Cold, Shadow, Harmonic.
- Monsters have resist/vuln percentages. Items grant resist.
- Tuning Fork/Drum-Stave deal Harmonic, effective vs Eldoria 2.0 mobs, weak vs realm 1.
- Justifies the novella's "sound cuts through illusion" lore in a mechanical way.

#### 1.5 Group system
- `follow <player>`, `group <player>`, `assist`, `grouptell`, `gquit`.
- Split XP: each kill gives `(base_xp × 1.2) / group_size` to every member in the same room.
- Enables co-op runs through Eldoria 2.0.

#### 1.6 Shops + economy
- 3 shops: Rusty's Armory (room_003, tier-1 gear), The Quiet Exchange (room_050, tier-2 gear), The Singing Merchant (room_105, harmonic gear).
- `list`, `buy <item>`, `sell <item>`, `value <item>`.
- Shop inventories rotate on cycle reset.
- Gives gold a meaningful sink.

#### 1.7 Bank
- `deposit <amount>`, `withdraw <amount>`. Bank survives death (no 10% loss).
- Single bank NPC at room_001.
- The 10% on-death penalty stays brutal if unbanked — creates risk/reward for carrying cash.

#### 1.8 Achievements
- ~40 achievements: first kill, first boss, "reached L15," "played all 5 instruments in one cycle," "killed 100 mobs," "died 10 times," "gifted 1000 gold," "found all 22 zones," etc.
- `achievements` command, unlocks give cosmetic titles or small permanent buffs.
- **Critical:** achievements persist across cycle resets. Gives meta-progression.

#### 1.9 Practice points + skill training
- Kill XP → level XP + practice XP. `practice` command trains spells (raising cast success chance) or skills (weapon mastery).
- Practice points cap at 100 per skill. Currently spells auto-cast at 100% — give them a learning curve.

#### 1.10 Bulletin board / mudmail
- `board` (read), `post <title>` (write), `mail <player>` (offline message).
- One board for announcements, one for players.
- Primary use: admin patch notes, player roleplay posts, trade ads.

---

### Tier 2 — Depth — ~2–3 months

After Tier 1 you have a premium MUD. Tier 2 is where it starts to *feel inexhaustible*.

#### 2.1 Campaign system (Aardwolf's daily quest)
- `campaign` — system picks 3 random kill targets from your level range.
- Complete all 3 → quest points (QPs).
- 1 campaign per real-time hour, or per cycle — designer's call.

#### 2.2 Quest points + redemption shop
- QPs earn from campaigns, boss kills, achievements.
- Spend at "Nomagio's Repository" (room_001): QP-only gear, cosmetic auras, pet eggs, zone unlock keys.

#### 2.3 Pets
- Tamed from certain mobs (`tame <monster>`, chance-based).
- Follow, assist in combat. Levels independently.
- Pet stable at room_001, cap 3 pets per player.

#### 2.4 Crafting + enchanting
- Drop crafting materials from monsters.
- 3 crafts: Weaponsmith (improve weapon damage), Enchanter (add resist/affect to gear), Alchemist (brew potions).
- `craft <recipe>` + materials → result.

#### 2.5 Boss signature mechanics v2
- Beyond Tier 0, add telegraphs, enrage timers, berserk phases.
- Group-designed fights: Archmage Supreme at L15 (realm 1 capstone) becomes a 3-player encounter designed to force assist + heal roles.

#### 2.6 Remort / tiers
- At L30 + finale complete, offer `remort`: reset to L1, keep 1 permanent stat boost + a tier tag ("Tier 1 Harmonist").
- Tier N grants %X permanent XP bonus + access to "tier-N only" gear.
- Cap at Tier 5.

#### 2.7 Clans
- `clan create <name>` (gold cost), clan hall room, `clantalk` channel, clan ranks.
- Clan leaderboard, clan gold pool.
- Optional: clan vs clan raid windows during specific cycle hours.

#### 2.8 MSDP + GMCP
- Telnet subnegotiation for modern clients (Mudlet, MUSHclient).
- Send stats, room, exits, HP/mana as structured data.
- Enables auto-mapper, HUDs, scripted triggers.
- Mudlet community will push this MUD hard if GMCP works.

#### 2.9 Triggers server-side
- `trigger add <name> <pattern> <action>` for in-game automation.
- Defensive (client-side triggers exist in Mudlet anyway), but needed for players on raw telnet.

---

### Tier 3 — North star — ~6 months

What makes people say "this is as good as Aardwolf."

- **Full second realm** (post-room-200) — "The Echo Beyond" — 100 more rooms, 5 new bosses, remort-gated content
- **Seasonal events** — cycle-based themed events (Harmonic Festival, Void Incursion) with unique drops
- **Player housing** in a shared persistent district that survives resets (gold sink + social hub)
- **PvP leagues + arenas** — scheduled tournaments, ELO ranking
- **Procedurally-generated "Dungeon" side-content** — random dungeon every cycle with unique loot
- **Guild halls + siege mechanics**
- **A public web leaderboard** (read accounts.json, render top-of-cycle stats)

---

## Recommended launch order (opinionated)

**Launch at end of Tier 0 + Tier 1.** That's ~6–8 weeks of focused work and it's already better than 95% of MUDs running today.

Tier 2 is live-ops: ship it in updates after launch to keep retention.

Tier 3 is the 12-month moonshot — don't block launch on it, but plant the flag publicly so players know the vision.

---

## Fastest wins per effort

1. **Boss signature mechanics (0.1)** — 2–3 days, makes existing bosses feel like real encounters.
2. **Instrument quest chain (0.2)** — 1 day, mostly JSON.
3. **Help system (0.3)** — 2 days of writing, enormous QoL delta.
4. **Equipment slot expansion (0.6)** — 1 day, transforms item variety perception.
5. **Aliases (0.9)** — half a day, every regular player uses it hourly.

Recommended next step: bundle 0.1 and 0.2 together (same edit surface) as the immediate implementation block.
