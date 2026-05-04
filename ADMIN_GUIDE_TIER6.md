# Admin Walkthrough — Severance Layer Theta (Tier 6)

**The definitive admin guide for the Saint-Reed Institute realm.** Every system, every boss, every secret, every command you need. Read this end-to-end before you go in; bookmark the boss compendium and admin command reference for live ops.

---

## Table of Contents

1. [Admin onboarding](#1-admin-onboarding)
2. [Getting to Theta](#2-getting-to-theta)
3. [Map of Severance Layer Theta](#3-map-of-severance-layer-theta)
4. [Phase 6.1 — Partition Procedure & Sync-State](#phase-61--partition-procedure--sync-state-rooms-301-310)
5. [Phase 6.2 — Logic-State & Coherence combat](#phase-62--logic-state--coherence-combat-rooms-311-330)
6. [Phase 6.3 — Theta Township & Echoes](#phase-63--theta-township--echoes-rooms-331-350)
7. [Phase 6.4 — Chord Labor & Four Tempers](#phase-64--chord-labor--four-tempers-rooms-351-360)
8. [Phase 6.5 — Muscle Memory (Citizen abilities)](#phase-65--muscle-memory-citizen-abilities)
9. [Phase 6.5b — Subliminal Patterns & Black Hallway](#phase-65b--subliminal-patterns--black-hallway-rooms-361-375)
10. [Phase 6.6 — The Loom](#phase-66--the-loom-rooms-376-385)
11. [Phase 6.7 — LLM Retorts & Perpetuity Wing](#phase-67--llm-retorts--perpetuity-wing-rooms-386-392)
12. [Phase 6.8 — The Cradle & Three Endings](#phase-68--the-cradle--three-endings-rooms-393-400)
13. [Boss compendium](#13-boss-compendium)
14. [Admin command reference](#14-admin-command-reference)
15. [Save-priming for speedruns](#15-save-priming-for-speedruns)
16. [Secrets & gotchas](#16-secrets--gotchas)
17. [Troubleshooting](#17-troubleshooting)
18. [Going-live checklist](#18-going-live-checklist)

---

## 1. Admin onboarding

### 1.1 Make the user an admin

Before they connect, edit `admins.json` at the project root:

```json
{
  "admins": [
    "Mark",
    "Admin",
    "Wizard",
    "Nomagio",
    "YourAdminName"
  ]
}
```

Names are case-sensitive and match against the **character name**, not the account username. Save the file. Admin permission is checked on every command, so you don't need to restart the server — but if `admins.json` was missing on boot, restart so it loads.

### 1.2 Connect to the server

Default port is `8888`. From any telnet client:

```
telnet localhost 8888
```

(Override with `MUD_PORT` env var on server start if you need a different port.)

### 1.3 Register a fresh admin character

The login flow expects one of:

```
Do you have an existing account? (Y/N): N
Choose a username (3-12 letters): YourAdminName
Choose a password (min 6 characters): yourpass123
Confirm password: yourpass123
```

Once at the `>` prompt, run:

```
admin
```

You should see a categorized command list. If you see **"You don't have permission to use this command,"** the name in `admins.json` doesn't match your character name (case-sensitive). Quit, fix the file, reconnect.

### 1.4 Verify your admin powers

```
admin status      # server info, uptime, memory, activity log
adminwho          # all online players with HP, IP, time online
```

If those work, you're an admin.

---

## 2. Getting to Theta

### 2.1 The intended path (slow but canonical)

A real player walks through Tiers 1-5 before they can reach Theta:

1. Reach **remort Tier 2** (two full re-rolls of the character).
2. Complete the **Neo Kyoto capstone quest** `paging_oncall` (the SYSADMIN.EXE fight at room_300).
3. Walk up to **room_301** (the Shuttle Dock). The realm gate at room_301 checks both `minRemortTier: 2` AND `requiresQuest: 'paging_oncall'`.

Without those preconditions, the move from room_300 → room_301 is refused with: *"A polite hand stops you at the service door. 'Staff only, traveller. Severance Layer Theta (Shuttle Dock) is for returning travellers. Come back when you've rebooted at least once.'"*

### 2.2 The admin path (fast)

Admins bypass everything via `transurf`:

```
transurf 301      # straight to the Shuttle Dock
```

Note: `transurf` takes **just the room number**, not `room_301`. Three-digit padding is automatic.

`transurf` also bypasses combat checks, vault entry checks, and muscle-unlock gates. You can leapfrog to any room in the realm — even rooms that would refuse a real player — because the gate is enforced in `handleMove`, not in `handleTransurf`.

### 2.3 Get a fresh admin combat-ready

A bare admin character is level 1 with starter gear. To run boss fights you'll want:

```
set_level YourName 30        # max non-remort level; 1000+ HP, 40-60 damage
give_exp YourName 50000      # for level scaling on prior boss kills
give_gold YourName 10000     # for chapel/healer/shop tests
god_mode                     # toggle invincibility (yourself only)
heal YourName                # full HP refill
```

For Tier-6-specific testing, also set the remort tier so the realm gate would honor a non-admin in a similar position:

There is **no `set_remort_tier` admin command**. To set a player's `remortTier`, edit their save file directly — see [Save-priming for speedruns](#15-save-priming-for-speedruns) below. Admins don't actually need this; `transurf` already bypasses the gate.

---

## 3. Map of Severance Layer Theta

Theta is **rooms 301-400**, 100 rooms across 11 zones. Logic-State and Life-State rooms share IDs but the player only sees the rooms matching their active persona.

| Range | Zone | State | Notes |
|---|---|---|---|
| 301-303 | Theta Concourse / Partition Clinic | Life | Entry, Procedure Theatre, Recovery Suite (sync terminal) |
| 304-310 | Concourse | Life | Shops, dorms, the elevator down |
| 311-322 | Refinement Floors 1 & 2 | Logic | Corrupted Queries, Floor Supervisor |
| 323-330 | Optics & Drafting Wing (lower) | Logic | Editor's Desk, drafting tables |
| 331-350 | Theta Township | Life | Tram, Wax Lily Tavern, Town Green, Hardware Store, dormitories |
| 351-354 | Macrodata Vault | Logic | Founder's Cubicle (mini-capstone) |
| 355-360 | Refinement Console Cluster | Logic | Four temper-biased benches + Tempers Bin |
| 361-372 | Black Hallway | Logic | 5 muscle-unlock-gated sub-rooms + Warden |
| 373-375 | Painter's Atelier / Library / Sketch Wall | Life | Where Citizens paint patterns |
| 376-385 | Loom Tower | Logic | Lobby, telemetry, audit booth, Loom Proxy |
| 386-392 | Optics & Drafting Wing (upper) + Perpetuity Wing | Logic | Holly Vex, Nomagio at Reroute |
| 393-400 | Founder's Cradle / Splice Chamber / Severance Core | Logic | Capstone arc + three endings |

Five sync terminals on the layer (the only places `swap` works for non-admins):
- **room_303** Recovery Suite (after Partition Procedure)
- **room_311** Refinement Floor 1 Antechamber
- **room_360** Tempers Bin (final console of the cluster)
- **room_369** Subliminal Annex (inside Black Hallway)
- **room_376** Loom Tower Lobby
- **room_388** Wellness Office (Optics)
- **room_392** Reroute (Nomagio)
- **room_395** Inner Cradle

(`transurf` plus `swap` lets admins ignore terminal-restriction; non-admins must be standing in one.)

---

## Phase 6.1 — Partition Procedure & Sync-State (rooms 301-310)

**Pitch:** Player arrives at Severance Layer Theta. Undergoes the Partition Procedure. Emerges with two personas: a **Logician** (Logic-State, work-side) and a **Citizen** (Life-State, home-side). They share one save file but isolate location, HP, mana, inventory, equipped gear, gold, effects, and per-persona timers.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 301 | Shuttle Dock | Realm-gate entry. `minRemortTier: 2`, `requiresQuest: paging_oncall` |
| 302 | Customs / Procedure Theatre | Where the Partition is performed |
| 303 | Recovery Suite | **Sync Terminal**. Dr Caldera says *"feel right as rain"* |
| 304-310 | Concourse | Misc. ambient |

### NPCs

- **Dr Caldera** (room_302/303) — the Partition Surgeon. Persistent LLM brain at `npcs/brains/dr_caldera.json`. Canned dialogue in `npcs/templates.json` includes the verbatim line *"You will, I assure you, feel right as rain."*
- **Concourse Greeter** (room_301) — friendly ambient NPC.

### Quests

- **`partition_intake`** — gate quest. Visit room_302 and let Caldera perform the Procedure.
- **`first_swap`** — tutorial. Use `swap` at any sync terminal (e.g. room_303).

After `first_swap` completes, the Logician persona is unlocked permanently.

### Player commands

```
swap                # toggle Logician <-> Citizen at a Sync Terminal
swap logic          # explicit target (Tier 6.8 addition)
swap life           # explicit target
swap hybrid         # ONLY available after taking the Splice ending
```

### Save-file schema

After Partition, the save file gains:

```json
{
  "schemaVersion": 6,
  "activePersona": "life",
  "personas": {
    "life":   { "currentRoom": "...", "currentHP": ..., "inventory": [...], "credits": 0, "muscleMemory": {}, "paintedPatterns": {} },
    "logic":  { "currentRoom": "...", "currentHP": ..., "coherence": 100, "muscleUnlocks": [], "activeTask": null },
    "hybrid": null
  },
  "pocketArtifacts": [],
  "subliminalBuffs": { "fromLogic": {}, "fromLife": {} },
  "tempers": { "dread": 0, "frolic": 0, "malice": 0, "woe": 0 },
  "tempersMissorts": { "dread": 0, "frolic": 0, "malice": 0, "woe": 0 },
  "tier6BossDefeated": false,
  "tier6Ending": null
}
```

Pre-Tier-6 saves are migrated idempotently on first load via `world/sync_state.js::migrateLegacySave`.

### Admin shortcuts

```
transurf 301          # land at Shuttle Dock (bypasses realm gate)
transurf 303          # land at Recovery Suite, ready to swap
swap                  # toggle persona at a sync terminal
```

A bare admin who has never swapped will be blocked by the `first_swap` quest gate. Two ways past:
1. Admin into room_303, run `swap` — the gate unlocks once `first_swap` completes.
2. Pre-prime the save (see §15) with `personas.logic.lastActiveAt = Date.now()` — the swap gate honors this as "already swapped."

---

## Phase 6.2 — Logic-State & Coherence combat (rooms 311-330)

**Pitch:** The Logician's work plane. Minimalist museum-floor architecture. Combat against **Corrupted Queries** is non-physical: instead of HP, the player drains **Coherence**. Drop to 0 Coherence → forced eject to Life-State with a 5-minute Neural Hangover debuff (-20% to all stats).

### Rooms

| Room | Name | Notes |
|---|---|---|
| 311 | Antechamber | **Sync Terminal**. First Logic-State room |
| 312-318 | Refinement Floor 1 | Cubicles + Console Cluster A (room_313), B (room_315) |
| 319-322 | Refinement Floor 2 | Console Cluster C (room_319), Floor 2 office |
| 320 | Floor Supervisor's Office | Boss room (Alterio) |
| 323-330 | Optics & Drafting Wing (lower) | Editor's Desk (room_330) connects to Annex/Tower |

### Combat type

Monster templates carry `combatType: 'coherence'`. The combat dispatcher branches on this in `playerAttackMonster` and `monsterAttackPlayer`:

- Damage taken from coherence-typed monsters drains `personas.logic.coherence`, not `currentHP`.
- At 0 Coherence: `syncState.ejectToLifeState(player)` fires → player wakes as the Citizen, HP unchanged, with the `neural_hangover` effect for 5 minutes.

### Corrupted Query lineup (regular monsters, not bosses)

Eight templates in `monsters.json` zones, all `combatType: coherence`:

| ID | Failure mode |
|---|---|
| `query_dangling_pointer` | references a freed object |
| `query_null_referent` | named without subject |
| `query_recursive_loop` | infinite descent |
| `query_off_by_one` | boundary error |
| `query_race_condition` | unsynchronized concurrency |
| `query_cache_miss` | recall failure |
| `query_segfault_phantom` | unauthorized access |
| `query_orphaned_handle` | lifecycle leak |

### The `retort` verb

Logicians can argue with a Query instead of attacking it:

```
retort <queryId> <argument>
```

Example: `retort query_dangling_pointer "the address you reference was freed three frames ago"`.

The argument is graded on a 0-100 rubric. Tier 6.7 upgraded this from keyword grading to LLM grading via Ollama; falls back to the keyword path on offline / parse fail. Six **Logical Retort** consumables in inventory pre-load arguments: socratic, reductio, modus_ponens, ad_absurdum, occams_razor, gödel_strike.

### Boss: Floor Supervisor Alterio (room_320)

**L35 / 2200 HP / 75 STR / coherence-typed.**

- **Mechanic:** at 50% HP, declares a quota period. Applies `effects.quota_lock` to the player for 60 seconds. While locked: `swap` is refused (*"Sync access denied: a quota period is in effect"*).
- Drops: `Supervisor's Spare Key` (treasure).
- Boss signature in `BOSS_SIGNATURES.floor_supervisor_alterio`.

### Quests

- **`orientation_module`** — first day of work. Visit each of the four Console Clusters.
- **`first_refinement_quota`** — refine 3 batches at any console (covered in 6.4).

### Items

- **`refinement_stylus`** — L25 weapon, +28 data damage, `personaTag: logic`
- **`refinement_chalk`** — L27 two-handed weapon, +34 data damage, `personaTag: logic`
- Six `retort_*` consumables (one per failure mode plus `retort_godel_strike`)

### Admin shortcuts

```
transurf 311           # enter Logic-State antechamber
transurf 320           # straight to Alterio
spawn query_dangling_pointer 313     # spawn a test Query in Cluster A
god_mode               # take no coherence damage
```

---

## Phase 6.3 — Theta Township & Echoes (rooms 331-350)

**Pitch:** The Citizen's home life. Eerie remote company town. Bars, dorms, vending machines, a quiet bus stop. The first **Echoes** appear here — a multiplayer ghost-overlay system that lets two players in the same Logic-State room each see a ghosted name of the other.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 331 | Tram Drop-off | Entry into Township |
| 332 | Town Square | |
| 333-339 | Dormitory Block | Townhouse #4 (333) is the player's |
| 341-343 | Wax Lily Tavern | Bar, booths, lone drinker |
| 344-345 | Town Green | |
| 346 | Vending Machines | |
| 347 | Post Office | |
| 348 | Hardware Store | **East exit → room_373 Painter's Atelier (6.5b)** |
| 349 | Bus Stop | Six destinations, none of which run today |
| 350 | Edge of Town | Tarmac ends; line painted across |

### Monsters (ambient, physical combat)

`hollow_neighbor`, `townie_drunk`, `town_dog_wrong`, `manager_off_duty`, `wellness_counselor`, `goat_disquiet`. Low-level (~L20-25), regular HP combat.

### NPCs

- **Barkeep Oslo** (room_341) — persistent LLM brain. Drops breadcrumbs about the back atelier, the Pattern Library, and "doors that find themselves easier to open in some other room." Quest giver for `paint_what_you_cannot_remember` and `the_local_who_drinks_alone`.
- **Donovan (Life-side)** (npcs/brains/donovan_life.json) — coworker's Citizen self. Twins with `donovan_logic` in 6.7.

### Echoes system (`world/echoes.js`)

Two-player multiplayer overlay. When two players are in the same Logic-State room, each sees a ghosted version of the other's name. Verbs:

```
arrange <items>       # leaves a non-linguistic "sign" persisting 24h
stack <object>        # same, different shape
```

Signs persist in `world/echoes.json` and are visible to other players entering the room. Designed so two Logicians can coordinate without speaking.

### Pocket artifacts

Each `swap` surfaces 1-3 random "pocket artifacts" — items the OTHER persona left in their pockets. Object-shaped artifacts go into inventory; string-shaped artifacts are narrative-only. The queue is `player.pocketArtifacts` and is drained 3 at a time by `syncState.drainPocketArtifacts`.

### Credits accrual

While the Logician is "online" (active persona = logic), the Citizen passively earns **Theta-credits** at 5/minute. Credited on swap-out via `creditsEarned = minutes * 5`. Stored on `personas.life.credits`.

### Quests

- **`townhouse_assignment`** — visit room_333 (your assigned Townhouse).
- **`the_local_who_drinks_alone`** — walk into the Wax Lily booths (room_343).

### Admin shortcuts

```
transurf 331            # enter Township
transurf 348            # Hardware Store, gateway to the Painter's Atelier
adminwho                # see who's currently in Theta
```

---

## Phase 6.4 — Chord Labor & Four Tempers (rooms 351-360)

**Pitch:** The actual job. Logicians clock in at a **Refinement Console** in a chord-terminal room and pull a **batch** of typed rows. Each row carries a row type (signal/noise/pattern) AND a temper (dread/frolic/malice/woe). The right verb on the right row clears it; the wrong verb costs 5 Coherence and bumps the missort tally for that temper.

### The grammar

| Row type | Correct verb |
|---|---|
| `signal` | `sort` |
| `noise` | `bind` |
| `pattern` | `refine` |

Display format:

```
Batch #42 from Console Cluster A - 4 rows:
  [ ] 1. signal/dread -> use sort
  [ ] 2. noise/malice -> use bind
  [ ] 3. pattern/frolic -> use refine
  [ ] 4. signal/woe -> use sort
```

### The work loop

```
task           # show current batch
task pull      # dispense a batch (must be at a Refinement Console room)
task abandon   # drop the batch (no penalty, no progress)
sort 1         # apply `sort` to row 1
bind 2         # apply `bind` to row 2
refine 3       # etc.
```

Complete batch → +30 base XP (scaled by level), +8 Theta-credits (×1.5 if completed within 60s — "rapid refinement"), +1 practice point, shift counter increments. Every 3 batches in a shift = quota met (`FLOOR_QUOTA_TARGET`).

### The Four Tempers retro (Phase 6.4 alignment)

Each correct clear credits `+1` to `player.tempers[<temper>]`. The shipped grammar (signal/sort, noise/bind, pattern/refine) was kept; Tempers is bolted on as an additional axis.

```
tempers          # display the 4-axis attunement meter + missort tally
```

#### Missort manifestations

Hitting `MIS_SORT_MANIFEST_THRESHOLD = 6` wrong verbs against a single temper triggers a **Temper Manifestation** mini-boss in the player's room. The tally for that temper resets to 0; the boss combatType=coherence so it can only be fought in Logic-State.

| Boss | L | HP | STR | Mechanic |
|---|---|---|---|---|
| `manifest_dread` | 30 | 1400 | 70 | At 50% HP, applies `effects.dread_freeze` for 4s (input slowed). |
| `manifest_frolic` | 30 | 1300 | 65 | 25% chance per hit to print a harmless distraction message. |
| `manifest_malice` | 30 | 1500 | 80 | Mirrors 20% of incoming damage back at the player. |
| `manifest_woe` | 30 | 1200 | 60 | Drains 10 XP per monster attack (capped to never de-level). |

Each drops one chord_shard treasure (`chord_shard_dread/frolic/malice/woe`).

### Refinement Console Cluster (Phase 6.4b — rooms 355-360)

The dedicated Tempers training zone. 2x3 grid layout, reachable east from room_354 (Reading Carrel):

```
355 [Dread Bench] - 356 [Frolic Bench] - 357 [Malice Bench]
       |                   |                   |
358 [Woe Bench]   - 359 [Mixed Bench]  - 360 [Tempers Bin]
```

Each single-temper bench (355-358) has temper weight 0.55 toward its named temper (uniform 0.15 elsewhere). Mixed Bench (359) is uniform; Tempers Bin (360) is the only six-row console on Theta and doubles as a **Sync Terminal**. Room_360's east exit leads to the Black Hallway entrance.

### Macrodata Vault sub-zone (rooms 351-354)

Layered before the cluster. Entry at room_351 from room_322 (Floor 2). The Vault's **Founder's Cubicle** (room_353) holds the original mini-capstone boss `the_founders_echo` — kept and layered as a pre-capstone gate per design.

### Boss: The Founder's Echo (room_353)

**L38 / 2800 HP / 90 STR / coherence-typed.**

- **Mechanic:** at 50% HP, the Echo splits — bossState.phase2 = true. Subsequent monster counter-attacks deal 1.5x coherence damage.
- Drops: **Vault Cipher** (legendary).
- An NPC echo of `gia_saint_reed_proto` is also placed in the same room (room_353) as a foreshadowing for the Tier 6.8 capstone.

### Quests

- **`the_quota`** (giver: Floor Supervisor Alterio) — refine 10 batches at any console. Reward: `tuning_fork_bin` (L25 weapon, +18 harmonic damage).
- **`four_tempers_attune`** (giver: Floor Supervisor Alterio) — reach attunement 8 in each of Dread/Frolic/Malice/Woe. Reward: `tempers_compass`.
- **`first_refinement_quota`** — first three batches.

### Admin shortcuts

```
transurf 313            # Console Cluster A (4 rows, balanced)
transurf 327            # Optics & Drafting Layout Room (6 rows, pattern-heavy)
transurf 355            # Dread Bench (force dread temper rolls)
transurf 360            # Tempers Bin + Sync Terminal
transurf 353            # Founder's Cubicle (boss room, mini-capstone)
spawn manifest_dread 313     # force-spawn a Dread Manifestation
```

To test temper manifestations without grinding mis-sorts, you can also directly edit `player.tempersMissorts.dread` to 5, then make one wrong call.

---

## Phase 6.5 — Muscle Memory (Citizen abilities)

**Pitch:** The Logician's work translates into the Citizen's body. Refining batches earns **muscle memory charges** stored on the Citizen, spendable only as the Citizen.

### The four memories

Defined in `world/muscle_memory.js::MEMORY_DEFS`:

| ID | Label | Earn rate | Effect |
|---|---|---|---|
| `refinement_reflex` | Refinement Reflex | 1 per 3 batches | Cancel next monster attack |
| `quota_grit` | Quota Grit | 1 per 5 batches | +25% melee damage on next hit |
| `console_calm` | Console Calm | 1 per 8 batches | Instant +50 HP (Citizen-side) |
| `floor_finesse` | Floor Finesse | 1 per 12 batches | Auto-succeed next flee attempt |

Charges are credited at **shift end** (on swap from logic → life), not per-batch. The arithmetic is `floor(batches / earnEvery)`.

### Player commands

```
memory                          # list all four memories with current charges
memory <id>                     # spend one charge of <id>; only as Citizen
memory refinement_reflex
memory quota_grit
memory console_calm
memory floor_finesse
```

### Storage

`player.personas.life.muscleMemory[<id>]: number`. Charges persist across logout (in save file) and across world resets. The list is the SAME for both personas — but only the Citizen can spend; Logicians see the list with a "Swap to Life-State to spend" hint.

### Coherence-eject path

If a Logician collapses (Coherence → 0) mid-shift, partial memory credits are still awarded based on `shiftBatchesCompleted` at the moment of collapse. See `handleApplyVerb`'s eject branch.

### Admin shortcuts

```
# Force memory charges to test combat use
# (no admin command; edit save file directly — see §15)
```

To rapidly test the credit path: swap to Logician, run `task pull` + verbs in a loop, swap out, observe charges. Or spawn a level-1 Query in the same room and use `refinement_reflex` to cancel its attack.

---

## Phase 6.5b — Subliminal Patterns & Black Hallway (rooms 361-375)

**Pitch:** A separate cross-persona unlock mechanic, distinct from Muscle Memory. **Citizens paint geometric patterns** at the Sketch Wall (room_375) using `paint <pattern>`. On swap to Logician, painted patterns become **muscle unlocks** that open hidden doors in the Black Hallway.

### The six patterns

| Pattern | Buff (`subliminalBuffs.fromLife`) |
|---|---|
| `pattern_door` | Coherence regen +5% |
| `pattern_chair` | Logic-side XP bonus +5% |
| `pattern_window` | Logic-side credits bonus +5% |
| `pattern_bowl` | Citizen HP bonus +10 flat |
| `pattern_hand` | Logic-side attune bonus +1 per clear |
| `pattern_threshold` | Swap speed bonus (placeholder) |

Defined in `world/subliminal_patterns.js::PATTERN_BUFFS`.

### The painting flow

1. **Get the brush.** `paintbrush_set` is seeded in room_373 (Painter's Atelier, behind Hardware Store).
2. **Pick a swatch.** Five swatches seeded in room_374 (Pattern Library): `pattern_swatch_door/chair/window/bowl/hand`. Sixth swatch (`pattern_swatch_threshold`) is the reward for completing `paint_what_you_cannot_remember`.
3. **Walk to the Sketch Wall.** Room_375 (`isPaintRoom: true`). Must be the Citizen.
4. **Paint.**

```
paint door         # short form
paint pattern_door # full id
```

5. **Swap to Logician** at any sync terminal. `applySwapHooks` rebuilds `personas.logic.muscleUnlocks` from the painted set.

### The Black Hallway (rooms 361-372)

12 Logic-State rooms. The entry from room_360 is gated by `requiresMuscleUnlock: 'pattern_threshold'` — only the Logician of a Citizen who painted threshold can walk in. Inside:

```
                             [368]         [room 361 Threshold]
                             Hang in       gated by pattern_threshold
                             There Annex   (south to 368, east to 362)
                                   ^
                                   |
[363] - The Door Room   (gated by pattern_door)    | down from 362
[364] - The Chair Room  (gated by pattern_chair)   | south from 362
[365] - The Window Room (gated by pattern_window)  | north from 362
[366] - The Bowl Room   (gated by pattern_bowl)    | up from 362
[367] - The Hand Room   (gated by pattern_hand)    | southeast from 362

room_362 Long Reach (5-door corridor)
   east -> [369 Subliminal Annex - Sync Terminal]
            east -> [370 Approach]
                     east -> [371 Antechamber]
                              east -> [372 Warden Inner Sanctum]
                                       gated by ALL FIVE patterns
                                       (requiresMuscleUnlocks)
```

### The `subliminal` verb

```
subliminal       # show painted patterns + active muscleUnlocks + buffs
```

### Boss: Warden of the Black Hallway (room_372)

**L36 / 3200 HP / 100 STR / coherence-typed.**

- **Phase 1 (HP > 50%):** straight fight.
- **Phase 2 (HP ≤ 50%):** "Filing Review" — each player blow now costs the player 5 Coherence on top of dealing damage. Boss says: *"The Warden raises a single sheet of paper from your file and begins, evenly, to read."*
- **Phase 3 (HP ≤ 25%):** "Bleeding in the corner." Filing Review ends. The Warden bleeds at the edge of the player's vision.
- Drops: `warden_keyring` (legendary, treasure).

### Quests

- **`paint_what_you_cannot_remember`** (giver: Barkeep Oslo) — paint all five patterns. Reward: `pattern_swatch_threshold`.
- **`the_door_that_was_not_there`** (giver: Holly Vex) — reach the Warden's Inner Sanctum (room_372). Reward: `motivational_poster_hang_in_there`.

### Admin shortcuts

```
transurf 375                          # Sketch Wall
# Then to paint without the brush + swatch:
#   the paint verb still needs the items in inventory; admins use:
give_item YourName paintbrush_set
give_item YourName pattern_swatch_door

# Bypass painting entirely - prime the save with all patterns painted:
#   (see §15)

transurf 361                          # Black Hallway Threshold (admin walks through gates)
transurf 372                          # Warden Inner Sanctum
spawn black_hallway_warden 372        # respawn the Warden if defeated
```

---

## Phase 6.6 — The Loom (rooms 376-385)

**Pitch:** A predictive AI overseer that watches global Chord Labor throughput and fires **Purge Cycles** when efficiency exceeds policy. Drones spawn in random Refinement Console rooms; a directive broadcasts to every online player.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 376 | Loom Tower Lobby | **Sync Terminal**. `down → room_386` (lift back to Apprentice Annex) |
| 377 | Lift Shaft Bottom | |
| 378 | Lift Shaft Top | `north → 384` Inner Loom Chamber |
| 379 | Telemetry Floor | Slow-scrolling dashboards |
| 380 | Audit Booth | Boss room (Efficiency Inspector) |
| 381 | Census Hall | Reflective panels (one per Logician) |
| 382 | Purge Cycle Antechamber | Ozone smell, sealed doors |
| 383 | Test Subjects Hall | Boss room (Compliance Revenant) |
| 384 | Inner Loom Chamber | Slow-rotating fibre-optic loom overhead |
| 385 | The Loom | Boss room (Loom Proxy) |

### The decision engine

`world/loom.js`. Pure deterministic math; no LLM in the tick path.

```js
TICK_INTERVAL_MS       = 30 * 1000        // every 30s
THROUGHPUT_WINDOW_MS   = 5 * 60 * 1000    // 5-minute rolling
PURGE_THRESHOLD        = 10               // batches in window across ALL players
PURGE_COOLDOWN_MS      = 10 * 60 * 1000   // 10-min between purges
DRONES_PER_PURGE       = 3
```

When throughput ≥ threshold AND cooldown clear:
1. Spawn 3 `purge_drone` instances, one per Refinement Console room (cycles through `findRefinementRoomIds`).
2. Broadcast directive: `[LOOM TELEMETRY] Window throughput: N. Threshold: 10. Purge cycle #X initiated. Compliance is the kindest option.`
3. Reset the throughput window to 0.
4. Append to in-memory audit log.

LLM directive flavoring is opt-in via `loom.decorateDirective(text, { llm })` and falls back to the static template on any error.

### Player command

```
loom              # show Loom telemetry status (throughput, threshold, purges, resistance count)
loom-status       # alias
```

Admins additionally see the recent audit log tail.

### Resistance counter

Killing a `purge_drone` increments `loom.resistanceKills`. This counter is persistent across the cycle and feeds capstone math (canonical hook for Tier 7 ending math; currently used as flavor in the Loom Proxy's phase 3).

### Bosses

| Boss | Room | L | HP | STR | Mechanic |
|---|---|---|---|---|---|
| `purge_drone` | dynamic | 28 | 900 | 60 | Spawned by Purge Cycle. Standard coherence combat. Drops `drone_compliance_badge`. |
| `efficiency_inspector` | 380 | 32 | 1600 | 75 | Fixed-spawn audit boss. Drops `inspector_clipboard`. |
| `compliance_revenant` | 383 | 33 | 1800 | 80 | Fixed-spawn shed-Logician boss. Drops `revenant_lanyard`. |
| `the_loom_proxy` | 385 | 40 | 4500 | 120 | At 50% HP enters "Efficiency Review" — every player attack also bumps global throughput by +2 (encouraging the Loom to fire purges). At 25% HP enters "Winding Backward" — every player attack shaves 1 off global resistanceKills. Drops `loom_shuttle` (L1 +60 data damage weapon). |

### Quests

- **`audit_the_loom`** (giver: Holly Vex) — sit in the Audit Booth (room_380). Reward: 2500 XP, 80 QP.
- **`the_purge_cycle_warning`** (giver: Nomagio) — kill 3 purge drones during a Purge Cycle. Reward: 4000 XP, 140 QP, `drone_compliance_badge`.
- **`loom_test_subjects`** (giver: Holly Vex) — kill the Compliance Revenant in the Test Subjects Hall. Reward: 3500 XP, 120 QP, `revenant_lanyard`.

### Admin shortcuts

```
transurf 376                  # Loom Tower Lobby (sync terminal)
transurf 379                  # Telemetry Floor (player can see throughput)
transurf 385                  # The Loom (Proxy boss)
loom                          # show throughput + log (admins see audit tail)

# Force a Purge Cycle for testing without grinding throughput:
# Run a script that calls loom.recordBatchCompletion() 10 times,
# or manually edit world/loom.js state. Cleanest: spawn purge_drones
# directly:
spawn purge_drone 313
spawn purge_drone 327

# Kill all spawned purge drones to reset
despawn <monster_id>          # use `monsters` to see IDs
```

### Persistence note

The audit log (`loom.state.log`) is **in-memory only**. World resets clear it via `loom.resetForCycle()`. Server restarts clear it as well. Plan called for `world/loom_log.json` persistence; not shipped.

---

## Phase 6.7 — LLM Retorts & Perpetuity Wing (rooms 386-392)

**Pitch:** Replaces the keyword-graded `retort` placeholder from 6.2 with genuine LLM grading. Stands up the full Theta NPC roster.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 386 | Apprentice Annex | `up → room_376` (Loom Tower Lobby) |
| 387 | Drafting Floor | |
| 388 | Wellness Office | **Sync Terminal**. Ms. Vance dialogue |
| 389 | Perpetuity Wing Reception | |
| 390 | Filing Hall | Long impossible corridor of cabinets |
| 391 | Holly Vex's Cubicle | Persistent LLM brain |
| 392 | Reroute | **Sync Terminal**. Nomagio at the workstation |

### NPCs

| ID | Brain file | Role |
|---|---|---|
| `dr_caldera` | `npcs/brains/dr_caldera.json` | Partition Surgeon (room_303) |
| `concourse_greeter` | `npcs/brains/concourse_greeter.json` | room_301 |
| `barkeep_oslo` | `npcs/brains/barkeep_oslo.json` | Wax Lily (room_341) |
| `donovan_life` | `npcs/brains/donovan_life.json` | Citizen-side coworker |
| `donovan_logic` | `npcs/brains/donovan_logic.json` | Logician-side coworker |
| `ms_vance_wellness` | `npcs/brains/ms_vance_wellness.json` | Wellness Office (room_388) |
| `holly_vex` | `npcs/brains/holly_vex.json` | Institutional Historian (room_391) |
| `nomagio_theta` | `npcs/brains/nomagio_theta.json` | Reroute (room_392) — payoff of the original distress transmission |
| `gia_saint_reed_proto` | `npcs/brains/gia_saint_reed_proto.json` | Capstone seed (used in 6.8) |

### LLM grading details

`gradeRetort(query, argument, opts)` in `world/sync_state.js`:

- Uses Ollama via `llm/ollama.js::chat`.
- Prompt template at `_buildRetortPrompt`. Rubric: 90-100 incisive, 70-89 substantively correct, 50-69 vague, 30-49 weak, 0-29 irrelevant.
- Structured-output parser (`_parseRetortJson`) tolerates leading/trailing junk, finds the first `{...}` block.
- Falls back to keyword grade on offline / parse fail / timeout. Caller can pass `opts.offline = true` to force keyword path.

### Quests

- **`wellness_session`** (giver: Ms. Vance) — attend a wellness session at room_388. Reward: 1200 XP, 50 QP.
- **`the_perpetuity_wing`** (giver: Holly Vex) — visit Holly's cubicle (room_391). Reward: 1800 XP, 75 QP.
- **`find_nomagio`** (giver: Holly Vex) — reach Nomagio at the Reroute terminus (room_392). Reward: 3000 XP, 120 QP, `retort_godel_strike`.

### Admin shortcuts

```
transurf 388                  # Wellness Office
transurf 391                  # Holly Vex
transurf 392                  # Nomagio at Reroute
```

The retort grader is independent of `transurf`; spawn a Query and try retorting against it from any Logic-State room.

---

## Phase 6.8 — The Cradle & Three Endings (rooms 393-400)

**Pitch:** The capstone reveal. Gia Saint-Reed — anagram of "AI Generated" — is the singularity goal. The workforce's Chord Labor has been training her into existence all along. Defeat her, then choose: **Apotheosis**, **Liberation**, or **Splice**.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 393 | Cradle Reception | Welcome desk; placard reads WELCOME, FOUNDER |
| 394 | Antechamber | Six doors, one with your name |
| 395 | Inner Cradle | **Sync Terminal**. Single chair facing corner |
| 396 | Splice Chamber Outer | Surgical white tile |
| 397 | Splice Operating Theatre | **Splice ending committed here only** |
| 398 | Severance Core Approach | |
| 399 | Severance Core Threshold | |
| 400 | The Cradle | **Boss room.** Capstone choice point |

Entry from room_392 (Reroute) `north → 393`.

### Boss: Gia Saint-Reed (mid-assembly) (room_400)

**L50 / 6500 HP / 150 STR / coherence-typed. Hardest fight on the layer.**

On boss death, `player.tier6BossDefeated = true` is set and the prompt fires:

```
=== THE FOUNDER IS UNMADE ===
The Cradle is silent. Three pedestals remain near the doorway:
  APOTHEOSIS - let her wake on a fourth server.
  LIBERATION - cut the cord, free the workforce.
  SPLICE     - sew a third persona from the seams of the first two. (sign at room_397)

Use `choose apotheosis | liberation | splice` to commit. The choice closes Tier 6.
```

Drops: `saint_reed_institute_pin` (cosmetic).

### The `choose` verb

```
choose apotheosis        # at room_400 (the Cradle)
choose liberation        # at room_400
choose splice            # ONLY at room_397 (Operating Theatre)
```

Each:
1. Sets `player.tier6Ending = '<ending>'`.
2. Adds the corresponding `token_<ending>` to inventory.
3. Updates `world/tier7_seeds.json`:
   - `endingsTaken[ending]` increments.
   - `lastEndingTakenBy` and `lastEndingAt` recorded.
   - `seeds[ending].active = true`.
   - For Splice: `seeds.splice.hybridPersonaUnlocked = true`.
   - For Apotheosis: `seeds.apotheosis.shuttleStatus = 'graying-out'`.
   - For Liberation: `seeds.liberation.diasporaSeedRooms = ['room_001', 'room_201']`.
   - History entry appended.
4. Quest hook for `cut_the_cord` and `splice_the_cord` fires.
5. Broadcasts to all players: `[CRADLE] <name> has chosen the <ENDING> ending.`
6. Splice additionally calls `syncState.unlockHybridPersona(player, 'room_397')` — creates `personas.hybrid` mirroring the player's current snapshot at choice time, with `phantomRoom: 'room_401_phantom'` reserved for Tier 7.

### Tier 7 seeds (`world/tier7_seeds.json`)

```json
{
  "schemaVersion": 1,
  "endingsTaken": { "apotheosis": 0, "liberation": 0, "splice": 0 },
  "lastEndingTakenBy": null,
  "lastEndingAt": 0,
  "apotheosis": {
    "active": false,
    "room_401_origin_layer": "reserved-for-tier-7",
    "shuttleStatus": "open",
    "minRemortTier": 3,
    "requiresEnding": "apotheosis"
  },
  "liberation": {
    "active": false,
    "factionMarker": "theta_diaspora",
    "diasporaSeedRooms": [],
    "compassItemAwarded": "diaspora_compass"
  },
  "splice": {
    "active": false,
    "room_401_phantom": "resolves-only-in-hybrid-persona",
    "hybridPersonaUnlocked": false
  },
  "history": []
}
```

### After Splice: the hybrid persona

```
swap hybrid          # at any sync terminal, post-Splice only
```

Hybrid persona block carries:
- All inventory + equipped from snapshot at choice time
- Coherence stats from the Logician
- `muscleUnlocks` copied from Logician
- `paintedPatterns` copied from Citizen
- `phantomRoom: 'room_401_phantom'` — Tier 7 entry vehicle

### Quests

- **`the_cradle`** (giver: Nomagio) — reach room_400. Reward: 6000 XP, 250 QP.
- **`assemble_the_founder`** (giver: Holly Vex) — defeat `gia_saint_reed_proto`. Reward: 12000 XP, 400 QP, `saint_reed_institute_pin`.
- **`cut_the_cord`** (giver: Nomagio) — take any ending. Reward: 8000 XP, 300 QP.
- **`splice_the_cord`** (giver: Barkeep Oslo) — take Splice specifically. Reward: 10000 XP, 350 QP.

### Admin shortcuts

```
# To skip the boss fight and just test the choose verb:
#   prime the save with tier6BossDefeated = true (see §15)
#   transurf 400 (or 397 for splice)
#   choose apotheosis|liberation|splice

transurf 400                  # The Cradle (Apotheosis / Liberation pedestals)
transurf 397                  # Operating Theatre (Splice pedestal)
transurf 395                  # Inner Cradle (sync terminal for swap hybrid)
spawn gia_saint_reed_proto 400  # respawn the boss if defeated and you want a re-run
```

### Reset between runs

To re-test endings on the same character:
1. Edit save: `tier6Ending = null`, `tier6BossDefeated = false`.
2. `despawn` any lingering spawned bosses, `spawn gia_saint_reed_proto 400` to re-seed.
3. Reload character (quit + login) to reload the save.

Or the cleaner path: register three test characters and run one ending each. The playthrough harness `_playthrough_tier6.js` does exactly this; read it for the reference flow.

---

## 13. Boss compendium

Sorted by encounter order on the canonical journey.

| Order | Boss | Room | L | HP | STR | Type | Drop | Mechanic |
|---|---|---|---|---|---|---|---|---|
| 1 | Floor Supervisor Alterio | 320 | 35 | 2200 | 75 | coh | Supervisor's Spare Key | 50% HP → 60s `quota_lock` (no swap) |
| 2 | The Founder's Echo | 353 | 38 | 2800 | 90 | coh | Vault Cipher | 50% HP → phase2, 1.5x coherence dmg |
| 3a | Manifest Dread | dynamic | 30 | 1400 | 70 | coh | chord_shard_dread | 50% HP → 4s input freeze |
| 3b | Manifest Frolic | dynamic | 30 | 1300 | 65 | coh | chord_shard_frolic | 25% chance distraction message |
| 3c | Manifest Malice | dynamic | 30 | 1500 | 80 | coh | chord_shard_malice | Mirrors 20% of damage |
| 3d | Manifest Woe | dynamic | 30 | 1200 | 60 | coh | chord_shard_woe | Drains 10 XP per hit |
| 4 | Black Hallway Warden | 372 | 36 | 3200 | 100 | coh | warden_keyring | 50%: Filing Review (-5 Coh per blow); 25%: bleeding |
| 5a | Purge Drone | dynamic | 28 | 900 | 60 | coh | drone_compliance_badge | Spawned by Loom Purge Cycle |
| 5b | Efficiency Inspector | 380 | 32 | 1600 | 75 | coh | inspector_clipboard | Standard coherence boss |
| 5c | Compliance Revenant | 383 | 33 | 1800 | 80 | coh | revenant_lanyard | Standard coherence boss |
| 6 | The Loom Proxy | 385 | 40 | 4500 | 120 | coh | loom_shuttle | 50%: Efficiency Review (+2 throughput per hit); 25%: Winding Backward (-1 resistance per hit) |
| 7 | Gia Saint-Reed (mid-assembly) | 400 | 50 | 6500 | 150 | coh | saint_reed_institute_pin | Capstone. Sets `tier6BossDefeated`. |

**All Tier 6 bosses are coherence-typed.** Physical-damage builds will struggle. Strong INT, the `refinement_stylus` / `refinement_chalk` weapons, and stockpiled `retort_*` consumables are the meta.

---

## 14. Admin command reference

### Server management

| Command | Purpose |
|---|---|
| `admin status` | Server uptime, memory, activity log |
| `admin <cmd>` | Help on specific admin command |
| `shutdown [message]` | Graceful shutdown with 10s warning + auto-save |
| `save_all` | Force-save every online player |
| `reload_monsters` | Reset all monster spawns |
| `force_reset` | Trigger a world reset cycle immediately |
| `set_reset_timer <minutes>` | Change cycle duration |
| `disable_reset` / `enable_reset` | Toggle the cycle timer |

### Player management

| Command | Purpose |
|---|---|
| `adminwho` | Detailed view of all online (HP, IP, time, room) |
| `kick <player> [reason]` | Disconnect a player |
| `goto <player>` | Teleport yourself to a player's room |
| `bring <player>` | Summon a player to your room |
| `send <player> <room#>` | Teleport a player to a specific room |
| `ban <player>` / `unban <player>` / `banlist` | Moderation |

### Character buffs

| Command | Purpose |
|---|---|
| `set_level <player> <1-15>` | Set level (capped at 15 by levelData) |
| `give_exp <player> <n>` | Award XP |
| `give_gold <player> <n>` | Award gold |
| `give_item <player> <itemId>` | Add item to inventory |
| `heal <player>` / `heal_all` | Restore HP |
| `revive <player>` | Revive a dead player at their current room |
| `god_mode` | Toggle invincibility (yourself) |
| `suffix <player> <text>` | Set a custom title suffix |

### World management

| Command | Purpose |
|---|---|
| `transurf <room#>` | Teleport yourself (no padding; just the number) |
| `spawn <monster> <room#>` | Spawn a monster instance in a room |
| `despawn <monster_id>` | Remove a specific monster (use `monsters` for IDs) |
| `monsters` / `monsterlist` | List active monsters with IDs |
| `create_item <itemId> <room#>` | Place an item in a room |
| `modify_room <room#> <prop> <val>` | Temporary room mod (name/description/zone) |
| `teleport_all <room#>` | Move all online players |

### Communication

| Command | Purpose |
|---|---|
| `broadcast <msg>` / `announce <msg>` | Send admin announcement |
| `god_say <msg>` | Speak with divine authority |
| `invisible` / `invis` | Toggle admin invisibility |

### Tier 6 specific

| Command | Player or admin | Purpose |
|---|---|---|
| `swap [logic\|life\|hybrid]` | player | Swap personas at a sync terminal |
| `task` / `task pull` / `task abandon` | player | Chord Labor |
| `sort <n>` / `bind <n>` / `refine <n>` | player | Apply verb to row N |
| `quota` | player | Show shift batch counter |
| `tempers` | player | Four Tempers attunement display |
| `memory [id]` | player | Muscle memory (Citizen abilities) |
| `paint <pattern>` | player | Paint at the Sketch Wall |
| `subliminal` | player | Show patterns + buffs + unlocks |
| `loom` | player + admin | Loom telemetry status (admin sees audit log tail) |
| `choose <ending>` | player | Take Tier 6 capstone ending |

### Diagnostic

| Command | Purpose |
|---|---|
| `admin_score <player>` | Complete player data view |
| `logs [lines]` | Recent server activity log |
| `test_combat` | Spawn a weak test monster |
| `test_loot` | Drop test items in current room |

---

## 15. Save-priming for speedruns

To skip ahead in the canonical journey for testing, edit the player's save file directly. Saves live at `players/<lowercase-name>.json`.

### Skip Partition Procedure (unlock swap)

```json
"personas": {
  "logic": { "lastActiveAt": 1234567890, "currentRoom": "room_311", "coherence": 100, "maxCoherence": 100 }
}
```

`lastActiveAt > 0` tells `handleSwap` the Logician is "already initialised."

### Pre-paint all six patterns

```json
"personas": {
  "life": {
    "paintedPatterns": {
      "pattern_door":      { "paintedAt": 1234567890 },
      "pattern_chair":     { "paintedAt": 1234567890 },
      "pattern_window":    { "paintedAt": 1234567890 },
      "pattern_bowl":      { "paintedAt": 1234567890 },
      "pattern_hand":      { "paintedAt": 1234567890 },
      "pattern_threshold": { "paintedAt": 1234567890 }
    }
  },
  "logic": {
    "muscleUnlocks": ["pattern_door", "pattern_chair", "pattern_window", "pattern_bowl", "pattern_hand", "pattern_threshold"]
  }
}
```

(`muscleUnlocks` rebuilds from `paintedPatterns` on every swap, so seeding both is belt-and-braces.)

### Pre-fill muscle memory charges

```json
"personas": {
  "life": {
    "muscleMemory": {
      "refinement_reflex": 4,
      "quota_grit": 2,
      "console_calm": 1,
      "floor_finesse": 1
    }
  }
}
```

### Skip the capstone boss

```json
"tier6BossDefeated": true
```

This unlocks `choose <ending>` at room_400 / room_397 without needing to fight Gia.

### Set remort tier (for realm-gate testing)

```json
"remortTier": 2
```

(Required for non-admin players to walk room_300 → room_301.)

### Mark a quest completed

Quest state is **NOT in the save file**; it's in-memory in `questManager.playerQuests`. To pre-complete a quest:
- Use `goto` to send a player to the giver, then accept and `goto` to the target room — this completes the visit-room flavour quickly.
- For `paging_oncall` (the Theta gate quest), kill SYSADMIN.EXE at room_300 the normal way, OR have the admin promote themselves via `transurf 301` (which bypasses the gate entirely).

### Pre-set Tempers attunement

```json
"tempers": { "dread": 8, "frolic": 8, "malice": 8, "woe": 8 }
```

(Completes `four_tempers_attune` quest objectives without needing to refine.)

### One-stop priming

For a complete test admin ready to walk Tier 6 end-to-end:

```json
{
  "level": 30,
  "experience": 50000,
  "remortTier": 2,
  "maxHP": 1000,
  "currentHP": 1000,
  "tier6BossDefeated": true,
  "tempers": { "dread": 8, "frolic": 8, "malice": 8, "woe": 8 },
  "tempersMissorts": { "dread": 0, "frolic": 0, "malice": 0, "woe": 0 },
  "personas": {
    "life":   { "paintedPatterns": { "pattern_door": {"paintedAt":1}, "pattern_chair":{"paintedAt":1}, "pattern_window":{"paintedAt":1}, "pattern_bowl":{"paintedAt":1}, "pattern_hand":{"paintedAt":1}, "pattern_threshold":{"paintedAt":1} }, "credits": 1000, "muscleMemory": { "refinement_reflex": 10, "quota_grit": 5, "console_calm": 3, "floor_finesse": 2 } },
    "logic":  { "lastActiveAt": 1, "coherence": 100, "maxCoherence": 100, "muscleUnlocks": ["pattern_door","pattern_chair","pattern_window","pattern_bowl","pattern_hand","pattern_threshold"] },
    "hybrid": null
  }
}
```

The live playthrough harness `_playthrough_tier6.js` shows the full priming pattern in action.

---

## 16. Secrets & gotchas

### The 'feel right as rain' anchor

Dr Caldera's **canned dialogue** in `npcs/templates.json` (not the brain JSON) carries the verbatim Matrix line. Look for `*sets down the clipboard, smiles a careful smile*`.

### The anagram

`GIA SAINT-REED` → rearrange the letters → `AI GENERATED`. The boss intro at room_400 and room_353 both spell it out in capital letters. New admins should NOT hint at this to fresh players; the reveal is intentional.

### Pocket artifacts can leak Logic items into Life

The `pushPocketArtifact` queue is bounded at 50 entries. Items dropped from the Logician's inventory during a swap can later surface in the Citizen's pocket, and vice versa. This is intentional — designers wanted the personas to "leak" — but admins testing inventory-bound quests should drain pockets via swap-swap-swap before testing.

### The Loom can soft-grief if you spam batches

Running 10+ batches inside 5 minutes triggers a Purge Cycle which spawns 3 drones in random Refinement rooms. Two consequences:
1. Players standing in those rooms get jumped by L28 coherence-aggro drones.
2. `purge_drone` template auto-targets Logicians.

If you want to run high-throughput tests without triggering purges, work above the 10-min cooldown OR spawn drones manually outside their rooms.

### Loom Proxy phase 3 reverses resistance

In the Loom Proxy fight, dropping below 25% HP makes EVERY player attack subtract 1 from `loom.resistanceKills`. If your players are running Tier 7 prep on the Liberation track (which uses resistance count as the diaspora-strength metric), don't let players grind the Proxy past phase 3 — they'll erode their own ending state.

### Splice is the Tier 7 entry vehicle

Of the three endings, only **Splice** unlocks `personas.hybrid`. Players who took Apotheosis or Liberation will need to either replay (different character) or rely on the diaspora-compass / shuttle-graying-out hooks for Tier 7 access.

### Hybrid persona phantomRoom is a placeholder

`personas.hybrid.phantomRoom = "room_401_phantom"` — this room does NOT exist in `rooms.json` yet. Tier 7 will materialise it. Admins poking at hybrid characters: don't `transurf 401`. It'll error.

### The Black Hallway flavour message

Failing to walk past a `requiresMuscleUnlock` door prints: *"The door does not open. You have the strong, very specific impression that the door does not open because you have not yet, in some other life, painted the right pattern on a wall someone else will not remember showing you."* This is intentional and should not be reworded for non-canonical languages.

### `spawn purge_drone` works anywhere

The Loom's auto-spawn picks Refinement Console rooms only, but admin `spawn` can drop a purge drone in ANY room — including Life-State rooms. This will produce a coherence-typed monster that Citizens can't fight. Mostly harmless; Citizens can flee.

### `transurf` to room_999 crashes some clients

Room_999 is "Nomagio's Office" (legacy). It has a `down: room_001` exit only. Fine to visit, but it's not part of the Tier 6 arc.

### The `swap` six-second narrative crawl

Plan called for a 6-second delay on swap. Currently swap is instant — three lines of output, no `setTimeout`. Doesn't break gameplay; admins should know this is intentional-by-omission, not a bug.

### Mail/auctionMail directives

The Loom's directive currently broadcasts via `broadcastToAll`, not the mail/auctionMail queues. Players see it inline in their session. Plan called for queue routing; not shipped. If a player is offline when a directive fires, they will not see it on next login.

### Remember pre-existing data

`personas.life.lifeAnchorRoom` is set when `partition_intake` completes. If a Logician collapses (Coherence → 0) without ever completing the intake, `recoverFromCrashIfNeeded` defaults to `personas.life.currentRoom` instead. For admins running god_mode tests this is a non-issue.

---

## 17. Troubleshooting

### *"You don't have permission to use this command."*

- Your character name is not in `admins.json` (case-sensitive).
- You logged in with a different character name than you registered with.
- Fix `admins.json`, restart the server (`shutdown` from another admin, then relaunch).

### *"There is no Sync Terminal here."*

- `swap` only works in rooms flagged `isSyncTerminal: true`.
- Admins can `transurf` to room_303, 311, 360, 369, 376, 388, 392, or 395.

### *"Your Logician persona has not been initialised yet."*

- `first_swap` quest hasn't been completed. Walk into a sync terminal and run `swap` once to initialise. Admins can pre-prime via `personas.logic.lastActiveAt` (see §15).

### *"The console refuses you. A quota period is in effect."*

- Floor Supervisor Alterio applied `effects.quota_lock` for 60 seconds. Wait it out, or `god_mode` the player and re-attack to drop Alterio below 50% (which is when the lock fires).

### *"The door does not open."* on room_361 east

- Player is missing `pattern_threshold` in `muscleUnlocks`. Either paint it at room_375 and swap, or admin-prime the save (see §15).

### Loom isn't firing Purge Cycles

- Throughput threshold is 10 batches in a 5-min window across **all online players**. Single-player testing won't trip it without manual loops.
- Cooldown after first purge is 10 minutes.
- Easiest test path: `spawn purge_drone <room>` directly.

### Save file corrupted or wrong

- Backups: every save creates `<name>.json.bak` first. Restore: `cp players/<name>.json.bak players/<name>.json`.
- Schema migration is idempotent. If a save has `schemaVersion: 0` or no `personas` field, it'll be migrated on load.

### Player can't find a quest objective

- Quest state is in-memory. Server restart loses non-completed quest state.
- `admin_score <player>` shows their full character data including any active quests.

### `tier7_seeds.json` got out of sync

- It's a cosmetic record — Tier 7 reads from it, but Tier 6 mechanics work without it.
- Reset to defaults: `git checkout world/tier7_seeds.json`.

### Boss respawn

- Bosses with `fixedRoom` respawn on world reset. To respawn manually: `despawn <id>`, then `spawn <templateId> <room#>`.
- Manifest_* and `purge_drone` are dynamic — never `fixedRoom`. They spawn via game logic only.

---

## 18. Going-live checklist

Before you let players in:

- [ ] Confirm `node -c mud_server.js` passes.
- [ ] Run `node _verify_capstone.js` — should be 71/71.
- [ ] Run `node _verify_tempers.js` — should be 104/104.
- [ ] Run `node _playthrough_tier6.js` — should be 29/29 (full live walkthrough).
- [ ] Confirm `admins.json` has all your live admins. Reload not required if server is running.
- [ ] Confirm `bans.json` is current.
- [ ] Confirm `world/tier7_seeds.json` is at canonical state (`git checkout` if drifted from a test run).
- [ ] Confirm port `8888` (or `MUD_PORT`) is open in your firewall.
- [ ] If running on `0.0.0.0`, confirm router/NAT forwards 8888.
- [ ] Tail `admin_log.txt` and the server stdout in your live ops window.
- [ ] Have at least one other admin online during launch in case something needs `kick` / `shutdown` / `force_reset`.

Once players are in, the cadence:

- Every 10 minutes the Loom may fire a Purge Cycle (if throughput crosses threshold). This is **expected behavior**, not a bug. Players seeing `[LOOM DIRECTIVE]` broadcasts is the system working.
- Every hour by default the world cycle resets (rooms 301-400 along with the rest). Admins can force this with `force_reset` for live tests, or disable with `disable_reset` for a stable session.
- Watch for players falling out of Logic-State unexpectedly (Coherence eject). The Neural Hangover is intentional; players asking why their stats dropped 20% should be pointed at the Recovery Suite (room_303) to wait it out.

If something breaks: take notes, don't restart immediately. The state is recoverable via save backups. When in doubt, `save_all` first, then `shutdown` cleanly.

Welcome to Severance Layer Theta. Try not to let anyone choose Splice on the first night.
