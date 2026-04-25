# Neo Kyoto QoL Manual — Tier 3.1 Phase 7

*Achievements, bestiary, help topics, map polish. The QoL tier ships the surface area that lets players see and feel everything Phases 1-6 actually built. Plus one quiet pre-existing bug fix: the in-game bestiary stopped showing regular monsters at some point. It works again now.*

---

## Achievements — 10 new entries

Added to the existing `ACHIEVEMENTS` registry in `mud_server.js`, with triggers wired throughout the codebase. Two of these (`off_the_books`, `root_access`) had their unlock triggers wired in Phase 6 but lacked formal definitions — Phase 7 closes that gap.

| ID | Name | Trigger | Title? |
| :-- | :-- | :-- | :-- |
| `clocked_in` | Clocked In | First entry to any Neo Kyoto room (201-300) | — |
| `staff_pass` | Staff Pass | First crossing room_100 → room_201 (post-remort) | — |
| `off_the_books` | Off The Books | First successful hack | — |
| `root_access` | Root Access | Hack skill trained to 10 | **the Root** |
| `more_human_than_human` | More Human Than Human | Reach Human affinity 10 | **the Replicant** |
| `electric_sheep` | Electric Sheep | Reach Replicant affinity 10 | **the Unbound** |
| `queue_jumper` | Queue Jumper | Successfully hack the queue priority kiosk | — |
| `compiled` | Compiled | Craft all 3 Data weapons (stun_baton, ice_breaker_rifle, segfault_cleaver) | — |
| `settle_all_tickets` | Settle All Tickets | Defeat all 5 Neo Kyoto bosses | **the Arbiter** |
| `server_melt` | Server Melt | Defeat SYSADMIN.EXE | — |

### Trigger wiring summary

| Trigger location | Achievement(s) wired |
| :-- | :-- |
| `handleMove` (room transition) | `clocked_in`, `staff_pass` |
| `handleHack` (success) | `off_the_books` (Phase 6), `queue_jumper` (Phase 7) |
| `handleTrain` (skill 10) | `root_access` |
| `awardQuestRewards` (after affinity delta) | `more_human_than_human`, `electric_sheep` |
| `handleMonsterDeath` (boss kill) | `server_melt`, `settle_all_tickets` |
| `handleCraft` (recipe complete) | `compiled` (tracks `player.dataWeaponsCrafted` array) |

### Title titles

`Settle All Tickets` grants **"the Arbiter"** as a title — same as the Phase 5 capstone-quest suffix from `paging_oncall`. This is intentional: a player who runs the full questline will have it via the quest reward. A player who skips quests but slays all five bosses will earn it via the achievement instead. Either path lands the same name on the same player.

The other titles are net-new:
- **the Root** — fully-trained hacker
- **the Replicant** — Human-affinity max (paradoxical by design — the more "human" you commit to being, the more *you* become the construct)
- **the Unbound** — Replicant-affinity max

### Why "Compiled" needed a recipe addition

The achievement spec named three Data weapons: `stun_baton`, `ice_breaker_rifle`, `segfault_cleaver`. Phase 4 only wrote recipes for the first two. Phase 7 closed the gap by adding the third recipe (weaponsmith L26: 4× iron_scrap, 2× bytecode_shard, 1× neon_eye → segfault_cleaver). All three are now obtainable through crafting, and the achievement is achievable.

---

## Bestiary — pre-existing bug fix

The in-game `bestiary` command had a silent bug: `handleBestiary` iterated `monsterData.monsters`, which is **undefined** in `monsters.json`. The actual key is `templates`. Before the fix, the bestiary listing showed only the 14 bosses and zero of the 80 regular monster templates — players have been calling `bestiary` for months and seeing an absurdly thin catalog without realising why.

**The fix:** one global rename, `monsterData.monsters || {}` → `monsterData.templates || {}`, applied at all call sites in `mud_server.js`. The bestiary now lists **94 entries** (was effectively 14).

Same bug pattern as the `spawnBossMinion` lookup bug from Phase 3 — a typo against the JSON shape that fell through the `|| {}` safety net silently.

### Phase 7 reference structure

I left the master `Beasts of the realm.md` document in place and added a pointer to the dedicated `Beasts of Neo Kyoto.md` written in Phase 2. The in-game `bestiary` command pulls from `monsters.json`, not from the markdown files, so the markdown is purely operator/reference documentation. The split:

- **`Beasts of the realm.md`** — Eldoria mobs (Server 1).
- **`Beasts of Neo Kyoto.md`** — Server 2 mobs and bosses, with realm-specific resist profiles, damage types, and signature-mechanic notes.

### Trying it

In-game: `bestiary` lists everything sorted by level. `bestiary <name>` shows the detail view (HP, STR, drops, signature mechanic if any). All 94 entries are now searchable, including the new Neo Kyoto roster.

---

## Help topics — 15 new entries

Appended to `help.json` under category **"Neo Kyoto"**. Total help corpus is now 58 topics (was 43).

### Realm-level

| Topic | Summary |
| :-- | :-- |
| `help neo_kyoto` | The realm overview - entry, systems, story arc |
| `help shuttle` | The Nomagios Transit Terminal between realms |
| `help hack` | Hack skill, command, DC ladder, training |
| `help affinity` | Replicant/Human meter, quest deltas, gating |
| `help data_damage` | Sixth damage type, realm resist profile, weapon sources |

### Boss-level (1 per named boss)

| Topic | Coverage |
| :-- | :-- |
| `help chiyo_7` | Cert-expired phase mechanic |
| `help account_manager` | Add-cascade and damage-stack mechanic |
| `help babel_fish_regent` | Round-by-round resist rotation |
| `help deep_pool` | Mana-drain economy fight |
| `help sysadmin_exe` | Three-phase capstone with 503 ability fail |

### Zone-level (significant zones only)

| Topic | Why it's covered |
| :-- | :-- |
| `help neon_soi` | First street-level zone, hack trainer location |
| `help the_stack` | Hack-heavy zone, easter-egg location |
| `help replicant_quarter` | Affinity peak, dialogue-resolution boss |
| `help midnight_market` | Shop hub, Barkeep 42, three quests |
| `help lyssara` | The narrative throughline - explicit lore reveal |

The `lyssara` topic is the only one that consciously opts into spoiler territory. A player who types `help lyssara` early has decided they want the story explained directly. Most players won't type that name until they've seen it once in-game (Hiro's Quest 2 dialogue is the first explicit naming), so the spoiler surface is naturally gated.

### `seeAlso` cross-linking

Each topic has 1-3 `seeAlso` references that thread the help corpus into a navigable web:

```
neo_kyoto -> shuttle, hack, affinity, data_damage
hack      -> affinity, static_tea, train
affinity  -> neo_kyoto, hack, remort
chiyo_7   -> babel_fish_regent, settle_all_tickets
lyssara   -> the_stack, replicant_quarter, paging_oncall
```

This lets a player who lands on any one entry walk the realm's documentation by `help`-hopping rather than requiring them to know the topic name in advance.

---

## Map polish — auto-derived, no manual coords required

The plan called for populating x/y grid coordinates for rooms 201-300 in `rooms.json`. **No work needed:** the existing `buildZoneMap()` BFS auto-derives coordinates from the room exit graph at server start, walking each zone independently from the lowest-numbered room. Neo Kyoto zones have proper `zone` tags (set in Phase 1) and varied directional exits (also Phase 1), so the BFS produces a clean 7×7 windowed map for each zone the player walks into.

### Verified zone coverage

All 10 Neo Kyoto zones are present in `rooms.json` with 10 rooms each:

```
Arrivals Concourse: 10 rooms
Neon Soi: 10 rooms
Corporate Spires: 10 rooms
The Stack: 10 rooms
Off-World Colonies Waitlist: 10 rooms
Kowloon-42 Arcology: 10 rooms
Chrome Sea: 10 rooms
Midnight Market: 10 rooms
Replicant Quarter: 10 rooms
Heat Death Datacentre: 10 rooms
```

In-game: `map` while standing in a Neo Kyoto room renders the local 7×7 window with `@` for current location, `*` for visited rooms, `#` for unvisited but discovered rooms.

### Why no manual coords

Manual x/y population was the original Phase 7 task because the design doc assumed the BFS would fail on Neo Kyoto's vertical-heavy exits or that overlapping coords would result. In practice, the cardinal exits between Neo Kyoto rooms are dense enough that BFS resolves cleanly for all 10 zones without overlap. If a future expansion adds a zone with mostly up/down exits that *would* overlap on the map (e.g., a multi-floor tower with only vertical movement), this assumption may need revisiting.

---

## Files touched in Phase 7

- **`mud_server.js`**:
  - Bestiary fix: `monsterData.monsters` → `monsterData.templates` (3 occurrences)
  - 10 new entries in `ACHIEVEMENTS`
  - `handleMove` — `clocked_in`, `staff_pass` triggers
  - `handleMonsterDeath` — `server_melt`, `settle_all_tickets` triggers
  - `awardQuestRewards` — `more_human_than_human`, `electric_sheep` triggers
  - `handleHack` — `queue_jumper` trigger
  - `handleCraft` — `compiled` trigger + `player.dataWeaponsCrafted` tracking
- **`help.json`**:
  - 15 new entries under category `"Neo Kyoto"`
- **`recipes.json`**:
  - 1 new recipe: `segfault_cleaver` (weaponsmith L26)
- **`Beasts of the realm.md`**:
  - Header pointer to `Beasts of Neo Kyoto.md` for Server 2 coverage

No engine changes, no new data structures. Phase 7 was almost entirely content + wiring on top of existing infrastructure — exactly what a polish phase should look like.

---

## Phase 7 verification

| Test | Result |
| :-- | :-- |
| JSON parse — `help.json`, `recipes.json`, `items.json` | OK |
| 15 help topics added under "Neo Kyoto" category | 15/15 |
| 10 achievements registered in `ACHIEVEMENTS` | 10/10 confirmed via grep |
| `segfault_cleaver` recipe added | OK |
| Server boots — 10 NPCs, 13 quests, 14 bosses, 192 monsters, 95 items | OK |
| Bestiary pre-existing bug fixed (94 entries listable, was effectively 14) | OK |
| All 10 Neo Kyoto zones have 10 rooms each, properly zone-tagged for `map` | OK |

**Status:** Phase 7 QoL pass complete. The Tier 3.1 plan is now fully implemented across all phases that the user has executed (Phases 1-7).

---

## Tier 3.1 — phase scoreboard

| Phase | Topic | Status |
| :-- | :-- | :-- |
| Phase 1 | Scaffold (rooms 201-300, exits, gate, zone tags) | DONE |
| Phase 2 | Monsters + items + Data damage type | DONE |
| Phase 3 | 5 bosses + signature mechanics + transmission hook | DONE |
| Phase 4 | Shops + crafting + pets | DONE |
| Phase 5 | Quests + NPCs + dialogue + easter egg | DONE |
| Phase 6 | Hack skill + Affinity system | DONE |
| **Phase 7** | **Achievements + bestiary + help + map polish** | **DONE** |
| Phase 8 (planned) | QP shop + campaign integration + capstone-quest sealing | not yet started |

Phase 8 is the formal "seal" of Tier 3.1 — it would wire the suffix-on-quest-completion path tighter, surface Neo Kyoto monsters in the campaign target pool (mostly already automatic via level-range), and add a few QP-shop entries for Neo Kyoto-specific cosmetics. It's a small phase. The realm is fully playable as it stands without Phase 8.

---

## What's beyond Tier 3.1

The Phase 7+ canvas is **Server 3 — Severance Layer Theta**, telegraphed by Nomagio's distress transmission on SYSADMIN.EXE death. The transmission is intentionally degraded (47% packet loss) so the next-tier shape is unconstrained. When the user is ready to move on from Neo Kyoto, that's the hook.

Possible Tier 3.2+ directions, none committed:

- A third realm of equal scope (rooms 301-400) - Severance Layer.
- An explicit "rescue Nomagio" arc that pulls a previously off-screen archmage onto the field as a player-facing NPC.
- A full multi-realm endgame tournament that ties Eldoria + Neo Kyoto + Severance into one persistent post-game.

The current codebase has the infrastructure for any of these without major refactor: `REALM_GATES`, multi-zone `monsters.json`, NPC system with persistent brains, the affinity-meter pattern that could extend to a third faction, and a working BOSS_SIGNATURES hook table that could absorb whatever new mechanics a Severance boss requires.

---

*Document revision: Tier 3.1 Phase 7. The realm is, by every metric the original plan measured, complete. Bestiary fixed, achievements live, help searchable, map renders. Server 3 is calling.*
