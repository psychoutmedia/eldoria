# Tier 6 Manual — The Shattered Realms MUD

_Reference documentation for Severance Layer Theta — the dual-persona expansion._

Tier 6 takes a finished L1–L30 character through the Nomagio distress
transmission shipped at `mud_server.js:3651` and onto a second axis of
play: a work-side persona (the **Logician**) who clocks in to refine
data at the Saint-Reed Institute, and a home-side persona (the
**Citizen**) who lives in **Theta Township**, paid in **Theta-credits**
that the Logician earns but cannot remember earning. The two share a
single character file but isolate their location, HP/mana, inventory,
gold, equipped gear, and effects. The split is enforced at the **Sync
Terminal** rooms; outside those rooms `swap` is illegal.

> **Scope of this pass.** Tier 6 ships in incremental phases. As of this
> document, **6.1, 6.2, 6.3, 6.4, and 6.5** are live. **6.6** (the
> Macrodata Vault capstone) is stubbed but not implemented — see §10.

Target audience: maintainers who need to understand the dual-persona
schema and its hooks, and players who want to know what the new verbs
do.

---

## Contents

1. [At a glance — commands & keys](#1-at-a-glance--commands--keys)
2. [6.1 Sync-State foundation](#2-61-sync-state-foundation)
3. [6.2 Logic-State Refinement Floors & Coherence combat](#3-62-logic-state-refinement-floors--coherence-combat)
4. [6.3 Life-State Theta Township & Echoes](#4-63-life-state-theta-township--echoes)
5. [6.4 Chord Labor (the work loop)](#5-64-chord-labor-the-work-loop)
6. [6.5 Muscle Memory (cross-persona one-shot abilities)](#6-65-muscle-memory-cross-persona-one-shot-abilities)
7. [Save-file schema & migration](#7-save-file-schema--migration)
8. [Hooks the Tier 6 modules install](#8-hooks-the-tier-6-modules-install)
9. [Smoke / verify suites](#9-smoke--verify-suites)
10. [Tuning constants reference](#10-tuning-constants-reference)
11. [Known limitations & deferred work](#11-known-limitations--deferred-work)
12. [Severance naming policy](#12-severance-naming-policy)

---

## 1. At a glance — commands & keys

All Tier 6 verbs are dispatched in `mud_server.js` before the legacy
command router so they don't collide with Tier 0–4 verbs.

| Verb                          | What it does                                                            |
|-------------------------------|-------------------------------------------------------------------------|
| `swap`                        | Toggle Logician ⇄ Citizen at a Sync Terminal                            |
| `arrange <text>`              | Leave a non-linguistic "arrange" Echo at the current room               |
| `stack <text>`                | Leave a "stack" Echo at the current room                                |
| `task`                        | Show your current Chord Labor batch (or "(none)")                       |
| `task pull`                   | Pull a fresh batch at a Chord Terminal                                  |
| `task abandon`                | Drop the current batch (no rewards, no penalty)                         |
| `sort <row#>`                 | Apply *sort* to a row in the current batch                              |
| `bind <row#>`                 | Apply *bind* to a row                                                   |
| `refine <row#>`               | Apply *refine* to a row                                                 |
| `quota`                       | Show current shift's batch count + the floor's quota target             |
| `memory` / `memories`         | List your earned Muscle Memory charges                                  |
| `memory <id>`                 | Spend one charge of a Muscle Memory (Citizen only)                      |
| (Citizen-side) `look`         | Renders any active Echoes at the room                                   |

**Room flags introduced by Tier 6** (in `rooms.json`):

| Flag                | Meaning                                                                  |
|---------------------|--------------------------------------------------------------------------|
| `isSyncTerminal`    | `swap` is legal in this room                                             |
| `isLogicState`      | Room is part of the work-side; only legal while active persona is Logic  |
| `isLifeState`       | Room is part of the home-side; only legal while active persona is Life   |
| `isChordTerminal`   | A Refinement Console here. Legal location for `task pull`                |

**Item fields introduced by Tier 6**:

| Field             | Meaning                                                                     |
|-------------------|-----------------------------------------------------------------------------|
| `coherenceRestore`| Restore N Coherence when used (only effective in Logic-State)               |
| `personaTag`      | `'logic'` or `'life'` — narrative tag, not yet hard-gated                   |
| `damageType`      | New: 'coherence' for refinement weapons; routes to coherence-damage path    |

---

## 2. 6.1 Sync-State foundation

The schema, the `swap` verb, the Partition Procedure quest, and ten
new rooms (301–310) that get the player from room_300 (the existing
Crystal Caverns terminus) up into Severance Layer Theta.

### Story beats

- `room_300` gains an **up** exit to room_301, the **Theta Shuttle Dock**.
- Concourse rooms 301–310 introduce the Saint-Reed Institute through
  posters, brochures, monitors, and two NPCs:
  - **Dr. Caldera** at room_303, a procedural physician. Delivers the
    line "feel right as rain" verbatim. Issues the `partition_intake`
    quest.
  - **Concourse Greeter** at room_310, who issues `first_swap` (the
    quest that "unlocks" the Logician persona).
- Three of the ten rooms are flagged `isSyncTerminal`: 301, 303, 309.

### `swap` mechanics

| Guard                                     | Reject reason                                                       |
|-------------------------------------------|---------------------------------------------------------------------|
| `!player.personas`                        | "Your Logician persona has not been initialised yet."               |
| `!isSyncTerminal(room)`                   | "There is no Sync Terminal here."                                   |
| `player.inCombat`                         | "You can't swap during combat."                                     |
| `effects.quota_lock` active               | "Sync access denied: a quota period is in effect."                  |
| `first_swap` quest not completed          | "Complete the Partition Procedure first."                           |

On success: live persona-fields are mirrored into the outgoing block,
the incoming block is lifted onto the live player object,
`activePersona` flips, the shift clock starts/stops (see 6.3 / 6.4),
pocket artifacts surface (see 6.3), and `savePlayer` runs immediately.

### `world/sync_state.js` exports

| Symbol                                        | Purpose                                                                 |
|-----------------------------------------------|-------------------------------------------------------------------------|
| `SCHEMA_VERSION = 6`                          | Save-file schema bump                                                   |
| `PERSONA_FIELDS`                              | Frozen tuple of fields that mirror on swap                              |
| `LOGIC_EXTRAS`, `LIFE_EXTRAS`                 | Default values for persona-specific extras                              |
| `migrateLegacySave(player)`                   | Idempotent upgrade from any pre-Tier-6 save                             |
| `initializePersonas(player)`                  | Same code path; called from `createPlayer`                              |
| `swapPersona(player, opts)`                   | The mutator (validates, mirrors, lifts, flips)                          |
| `syncLiveToActivePersona(player)`             | Called from `savePlayer` so a crash never desyncs                       |
| `ejectToLifeState(player)`                    | Forced eject path (Coherence ≤ 0)                                       |
| `recoverFromCrashIfNeeded(player)`            | Snap to Life-State if the server died mid-shift                         |
| `pushPocketArtifact / drainPocketArtifacts`   | The cross-persona artifact queue (6.3)                                  |
| `isSyncTerminal(roomData)`                    | Flag check, used by `handleSwap`                                        |

The architecture comment at the top of `sync_state.js` is canonical;
read it before changing anything in this module.

---

## 3. 6.2 Logic-State Refinement Floors & Coherence combat

The work plane: 20 rooms, 8 monsters on a new combat branch, and a
boss with a signature that locks `swap`.

### World content (rooms 311–330)

| Zone                       | Rooms     | Notes                                                          |
|----------------------------|-----------|----------------------------------------------------------------|
| Refinement Floor 1         | 311–316   | Antechamber, Intake, two console clusters, Quota Board, Stair  |
| Refinement Floor 2         | 317–322   | Inner Hall, Long Hall, Cluster C, Supervisor's Office, Quiet Aisle, Vault Antechamber (locked - 6.6) |
| Break Room                 | 323–325   | The only Logic-State refuge that **does not** carry `isLogicState` |
| Optics & Drafting          | 326–330   | Foyer, Layout, Light Box, Closed Stack, Editor's Desk          |

room_308 (Concourse east panel) opens to room_311. Room_311 carries
both `isSyncTerminal` and `isLogicState` so a Logician can swap back
out at the floor entrance. Floor Supervisor Alterio's office is
room_320.

### Coherence combat — the second damage pool

Logic-State enemies declare `combatType: "coherence"` in
`monsters.json`. When a Logician fights one, the damage path in
`mud_server.js:3603` *bypasses HP* and drains
`player.personas.logic.coherence` instead. At Coherence ≤ 0 the
player is force-ejected to Life-State (see `ejectToLifeState`),
takes a 5-minute **Neural Hangover** debuff (`effects.neural_hangover`,
severity 0.20), and Coherence resets to full so the next shift starts
clean.

#### The 8 Corrupted Queries

`dangling_pointer`, `null_referent`, `recursive_loop`, `off_by_one`,
`race_condition`, `cache_miss`, `segfault_phantom`, `orphaned_handle`.
All `combatType=coherence`, all level 30–35.

#### Boss: Floor Supervisor Alterio (room_320)

- Level 35, `combatType=coherence`.
- Signature in `BOSS_SIGNATURES.floor_supervisor_alterio` (`mud_server.js:2508`).
- At ≤ 50% Coherence-HP, applies `effects.quota_lock` for 60 s. While
  active, `swap` is rejected with "you cannot leave during a quota
  period" — even at a Sync Terminal. The lock survives the boss's
  death; you wait it out.

### Logic-State equipment & consumables

- 6 **Logical Retorts** (`*_retort` ids): `socratic`, `reductio`,
  `modus_ponens`, `ad_absurdum`, `occams_razor`, `godel_strike` —
  restore 25/30/35/40/50/60 Coherence respectively. `coherenceRestore`
  field. No effect outside Logic-State.
- 2 **Refinement Tools**: `refinement_stylus`, `refinement_chalk_block` —
  weapons with `personaTag='logic'` and `damageType='coherence'`.

---

## 4. 6.3 Life-State Theta Township & Echoes

The home-side: 20 rooms, six ambient locals, a 24-hour-TTL
non-linguistic sign system, and the swap-side glue (pocket artifacts,
credit accrual).

### World content (rooms 331–350)

| Zone               | Rooms     | Highlights                                                  |
|--------------------|-----------|-------------------------------------------------------------|
| Theta Township     | 331–336   | High street, bus stop, town edges                           |
| Dormitory Block    | 337–340   | Lane, Townhouse #4 (the player's anchor), maintenance shed  |
| Town Green         | 341–344   | Plaza, reading bench, south pasture (with disquiet goat)    |
| Wax Lily Tavern    | 345–350   | Door, bar, booths, kitchen, back office                     |

Room_330 (Optics) does **not** connect into the Township; the
Township is reached via the Concourse's north panel (room_308 → room
_309 → north, etc., per the rooms.json exits). All Township rooms
carry `isLifeState`.

### Six ambient creatures

`hollow_neighbor`, `townie_drunk`, `town_dog_wrong`, `manager_off_duty`,
`wellness_counselor`, `goat_disquiet`. **All physical combat.** None
carry `combatType=coherence`. The Township is primarily social
content; spawn chances are low (10–20%).

### NPCs

- **Barkeep Oslo** (room_348). Issues `the_local_who_drinks_alone`.
  Brain stub at `npcs/brains/barkeep_oslo.json`.
- **Greeter** (room_337). Issues `townhouse_assignment`, walks the
  player to Townhouse #4 (room_338), and stamps
  `personas.life.lifeAnchorRoom = 'room_338'`. The anchor is what
  `recoverFromCrashIfNeeded` snaps the player to.
- **Donovan** (referenced by Oslo's quest). Brain stub at
  `npcs/brains/donovan_life.json`.

### Echoes — non-linguistic signs (`world/echoes.js`)

Citizens and Logicians cannot speak across personas. `arrange <text>`
and `stack <text>` leave a structured sign at the current room that
*every other player* discovers when they enter, until it expires.

| Knob               | Value     |
|--------------------|-----------|
| TTL                | 24 hours  |
| Per-room cap       | 5 signs   |
| Payload max length | 80 chars  |
| Valid kinds        | `arrange`, `stack` |

Validation rejects payloads that "look like dialogue":
`/["']|\bsay\b|\btell\b|\bshout\b/i`. Empty trimmed payloads are
rejected with "Sign cannot be empty."

Persistence: `world/echoes.json` (atomic tmp + rename, .bak before
each write). The whole state is loaded once at startup into
`echoesState` and saved through `persistEchoes()` after each `addSign`.

When at-cap, the **oldest** sign in the room (lowest `createdAt`) is
evicted to make room for the new one.

### Pocket artifacts & credit accrual

- **Pocket queue** (`player.pocketArtifacts`): items pushed by one
  persona that surface to the *other* on swap. Capped at 50 entries;
  drained 3 at a time.
- **Theta-credits** (`player.personas.life.credits`): when a Logician
  swaps back to Life-State, `floor((Date.now() - shiftStartedAt)/60000) * 5`
  credits are added to the Citizen. The Logician sees the total in
  the swap report ("Logician shift earnings credited: N Theta credits.").

The first surface of an artifact is narrative-only by default (string
form). If the artifact is an **object with an `id`**, it goes straight
into the Citizen's inventory (subject to inventory cap).

---

## 5. 6.4 Chord Labor (the work loop)

What a Logician *does* during a shift. Tier 6.2 gave us Coherence
combat against drift-into-room Corrupted Queries; Tier 6.4 is the
deliberate work, performed at a console.

### Where it happens

Four rooms are flagged `isChordTerminal: true` in `rooms.json`:

| Room      | Cluster                                  | Quota / batch size          |
|-----------|------------------------------------------|------------------------------|
| room_313  | Refinement Floor 1, Console Cluster A    | 4 rows, easier mix           |
| room_315  | Refinement Floor 1, Console Cluster B    | 4 rows, easier mix           |
| room_319  | Refinement Floor 2, Console Cluster C    | 5 rows                       |
| room_327  | Optics & Drafting, Layout Room           | 6 rows, pattern-heavy        |

A Chord Terminal is also implicitly an `isLogicState` room (the
Refinement Floors), so a Citizen cannot pull a batch there — `swap`
into Logic first.

### The batch grammar

A **batch** is an array of typed **rows**, each row carrying a `type`
that determines the correct verb to apply:

| Row type   | Correct verb | Wrong verbs                                                       |
|------------|--------------|-------------------------------------------------------------------|
| `signal`   | `sort`       | `bind`, `refine` → row stays, lose 5 Coherence                    |
| `noise`    | `bind`       | `sort`, `refine` → row stays, lose 5 Coherence                    |
| `pattern`  | `refine`     | `sort`, `bind` → row stays, lose 5 Coherence                      |

Apply the **right verb** and the row is cleared; advance to the next.
Apply the **wrong verb** and you lose Coherence (≤ 0 → forced eject,
exactly as in 6.2 combat).

When all rows are cleared the batch **completes** and rewards fire.

### Verbs

| Verb                  | Behaviour                                                                       |
|-----------------------|---------------------------------------------------------------------------------|
| `task`                | Show the current batch (rows + indices). "(no active task)" if none.            |
| `task pull`           | At a Chord Terminal, generate a fresh batch sized to the terminal.              |
| `task abandon`        | Drop the current batch. No rewards, no Coherence penalty. (Resets `activeTask`.)|
| `sort <row#>`         | Apply `sort` to row `<row#>` (1-indexed) of the current batch.                  |
| `bind <row#>`         | Apply `bind` to row `<row#>`.                                                   |
| `refine <row#>`       | Apply `refine` to row `<row#>`.                                                 |
| `quota`               | Show `shiftBatchesCompleted` and the floor's quota target (3).                  |

`task pull` rejects (with the appropriate message) when:

- The player is not in Logic-State.
- The current room is not a Chord Terminal.
- An `activeTask` already exists (must abandon or finish first).
- `effects.quota_lock` is in effect (Alterio's signature also locks
  the consoles).

`sort` / `bind` / `refine` reject with the appropriate message when:

- No `activeTask`.
- The row index is out of range for the current batch.
- The row at that index is already cleared.
- The player is not in Logic-State (they may have been ejected).

### Rewards

On batch completion (all rows cleared):

| Reward                                                       | Where it lands                                |
|--------------------------------------------------------------|-----------------------------------------------|
| `30 + (level × 2)` XP                                        | Standard XP path (also updates cycle XP)      |
| `8` Theta-credits                                            | `personas.life.credits`                       |
| `1` practice point (Tier 1.9)                                | `practicePoints`                              |
| Increment `personas.logic.shiftBatchesCompleted` and `lifetimeBatches` | persona block                                 |
| Increment `cycleBatchesCompleted` (player) + leaderboard     | Cycle stats                                   |

If the player completes a batch in **under 60 seconds** (`startedAt`
to completion), credits are paid at **×1.5** ("rapid refinement"
bonus). The XP and practice point do not multiply — the bonus is
purely on the home-side income.

### Quota & shift end

Per-floor quota target is **3 batches per shift**. `quota` shows the
counter and the target. Hitting the target plays a one-time
celebratory line ("the floor monitor pulses softly: QUOTA MET")
and continues to count batches above the threshold.

When the player swaps **out** of Logic-State:

- `activeTask` is dropped (any in-progress batch is forfeited; no
  Coherence penalty).
- `shiftBatchesCompleted` is reset to 0.
- The shift-credits accrual in 6.3 still runs (per-minute clock).

### Cycle leaderboard

A new category — **Refinement Champion** — tracks the highest
`cycleBatchesCompleted` value per cycle. Displayed by the
`leaderboard` command alongside XP / Monsters / Gold / Bosses, and
reset by `executeWorldReset`.

---

## 6. 6.5 Muscle Memory (cross-persona one-shot abilities)

The mechanical payoff for the dual-persona "amnesia." A Logician on
shift accumulates muscle memory the Citizen later spends as one-shot
abilities. The two personas can't talk, but the body remembers — and
the better the shift, the more it remembers.

### How charges are earned

When the player swaps **out** of Logic-State (deliberately or via a
forced eject), the Logician's `shiftBatchesCompleted` is consumed by
`muscleMemory.creditShiftMemories(player, batchesThisShift)`. Each
memory has its own `earnEvery` rate — every N batches in that single
shift earns +1 charge of that memory. Charges are added on top of any
the Citizen already had; nothing decays.

| Memory id           | Label              | Earn rate (per shift) | Effect                                                        |
|---------------------|--------------------|------------------------|---------------------------------------------------------------|
| `refinement_reflex` | Refinement Reflex  | every 3 batches        | One-shot: cancel the next monster attack against you          |
| `quota_grit`        | Quota Grit         | every 5 batches        | One-shot: your next melee attack deals +25% damage            |
| `console_calm`      | Console Calm       | every 8 batches        | Instant: restore 50 HP (capped at maxHP)                      |
| `floor_finesse`     | Floor Finesse      | every 12 batches       | One-shot: your next flee attempt automatically succeeds       |

Example — a 12-batch shift credits **4× Reflex, 2× Grit, 1× Calm,
1× Finesse**. A 7-batch shift credits **2× Reflex, 1× Grit**.

### How charges are spent

The `memory` verb (or `memories`) lists charges; `memory <id>` (or
any unique prefix, or the labelled form) consumes one. Charges are
stored on `personas.life.muscleMemory[id]` and only the Citizen can
spend them — the Logician sees the same list with a "swap to
Life-State to spend them" hint.

| Spend guard                                              | Reject reason                                            |
|----------------------------------------------------------|----------------------------------------------------------|
| `activePersona !== 'life'`                               | "Muscle memory belongs to the Citizen."                  |
| Charges = 0                                              | "You have no <Label> charges."                           |
| Unknown id (no prefix match)                             | "Unknown memory: <token>."                               |
| Refinement Reflex / Quota Grit / Floor Finesse outside combat | "No incoming attack / swing / flight to ___. Save it." |

The "outside combat" guard is deliberate — these three memories arm
a one-shot effect (`effects.muscle_<key> = { armed: true }`), and an
armed effect that never fires would silently waste a charge. Console
Calm has no such guard because it's an instant heal.

### Where the effects hook into combat

| Memory              | Hook                                              | What it does                                                                |
|---------------------|---------------------------------------------------|-----------------------------------------------------------------------------|
| `refinement_reflex` | `monsterAttackPlayer` (after divine_protection)   | If `effects.muscle_refinement_reflex` set: clear it, narrate the dodge, **return false** (no damage)|
| `quota_grit`        | `playerAttackMonster` (after spell bonus, before resist) | If `effects.muscle_quota_grit` set: clear it, multiply damage ×1.25 |
| `floor_finesse`     | `handleFlee` and `handleMonsterCombatFlee`        | If `effects.muscle_floor_finesse` set: clear it, force flee success         |
| `console_calm`      | `handleMemory` directly                           | Instant heal: `currentHP = min(maxHP, currentHP + 50)`                      |

All four effects clear themselves on use (`delete player.effects[key]`)
so a primed memory can't double-fire on a subsequent action.

### Forced-eject hand-off

The same credit hook fires when the player is force-ejected from
Logic-State by a Coherence collapse — both via the combat path
(`monsterAttackPlayer` Coherence ≤ 0) and the work-path wrong-verb
chain (`handleApplyVerb`). In both cases, `shiftBatchesCompleted` is
captured **before** the eject resets it, the credit is applied, and
the swap report renders an "Even from collapse, your hands remember:"
line listing the earned charges. This means a Logician who eats
their last 5 Coherence on a wrong refine doesn't lose the labour —
it's already in the Citizen's body.

---

## 7. Save-file schema & migration

### Persona block layout

```
player = {
  // ... legacy flat fields (level, xp, name, etc.) ...
  schemaVersion: 6,
  activePersona: 'life' | 'logic' | 'hybrid',
  personas: {
    life: {
      currentRoom, currentHP, maxHP, currentMana, maxMana,
      inventory, equipped, gold, effects, affects, spellCooldowns,
      credits: 0,                       // 6.3 — Theta-credits
      lifeAnchorRoom: 'room_338',       // 6.3 — set by townhouse_assignment
      muscleMemory: {}                  // 6.5 stub
    },
    logic: {
      currentRoom, currentHP, maxHP, currentMana, maxMana,
      inventory, equipped, gold, effects, affects, spellCooldowns,
      coherence: 100,                   // 6.2
      maxCoherence: 100,                // 6.2
      muscleUnlocks: [],                // 6.5 (still scaffolded; reverse channel)
      activeTask: null,                 // 6.4
      shiftBatchesCompleted: 0,         // 6.4
      lifetimeBatches: 0,               // 6.4
      shiftStartedAt: null,             // 6.3 / 6.4
      lastActiveAt: null                // 6.1 — keeps `swap` unlocked
    },
    hybrid: null                        // 6.6 reserved
  },
  pocketArtifacts: [],                  // 6.3
  subliminalBuffs: { fromLogic: {}, fromLife: {} },  // reserved (no live writers yet)
  cycleBatchesCompleted: 0              // 6.4 (resets on world reset)
}

// personas.life.muscleMemory shape (Tier 6.5):
//   { refinement_reflex: 0, quota_grit: 0, console_calm: 0, floor_finesse: 0 }
// Empty object initially; ids are written lazily as charges are credited.
// Effects on the live player object while a memory is primed (Tier 6.5):
//   player.effects.muscle_refinement_reflex = { armed: true, armedAt: ms }
//   player.effects.muscle_quota_grit        = { armed: true, armedAt: ms }
//   player.effects.muscle_floor_finesse     = { armed: true, armedAt: ms }
// All three clear themselves on first fire.
```

### Migration

`migrateLegacySave(player)` runs from `loadPlayer` *and* from
`createPlayer` (via `initializePersonas`). Both paths converge on the
same code. The migration:

1. Snapshots flat fields → Citizen block (Citizen is the default —
   the legacy player never visited Theta).
2. Snapshots a parallel block for the Logician with **emptied**
   inventory, equipped, gold, effects, affects, spellCooldowns. The
   Logician inherits HP/mana so a first swap is mechanically safe.
3. Stamps `schemaVersion = 6`, `activePersona = 'life'`,
   `pocketArtifacts = []`, `subliminalBuffs = { fromLogic, fromLife }`.

It is **idempotent**: once `schemaVersion === 6` is set and
`personas.life` exists, the function returns the same object
unchanged.

### Shift-end persistence

`syncLiveToActivePersona(player)` mirrors the live flat fields back
into the active persona block. It runs from `savePlayer` (the 2-min
auto-save tick + the swap-immediate save + the disconnect save) so a
crash never leaves the on-disk save desynced from the live in-memory
state.

### Crash recovery

On login, `recoverFromCrashIfNeeded(player)` checks: was the player
mid-Logic-State at logout, with no live combat? If so, it snaps them
to `personas.life.lifeAnchorRoom` (or `personas.life.currentRoom` as
a fallback) and applies a 5-minute Neural Hangover. This means a
Logician who crashes mid-shift wakes up in their townhouse with a
headache, never stranded mid-floor.

---

## 8. Hooks the Tier 6 modules install

### `world/sync_state.js`

| Hook point in `mud_server.js`             | What runs                                           |
|-------------------------------------------|-----------------------------------------------------|
| `loadPlayer`                              | `migrateLegacySave` (idempotent)                    |
| `createPlayer`                            | `initializePersonas` (same code path)               |
| `savePlayer`                              | `syncLiveToActivePersona` before write              |
| `handleSwap`                              | `swapPersona` after guard checks                    |
| Coherence ≤ 0 in Logic-State combat       | `ejectToLifeState` (forced swap + Hangover)         |
| Player connect, post-load                 | `recoverFromCrashIfNeeded`                          |

### `world/echoes.js`

| Hook point                                | What runs                                           |
|-------------------------------------------|-----------------------------------------------------|
| Server boot                               | `loadState` → `echoesState`                         |
| `arrange` / `stack` verb                  | `addSign` + `persistEchoes`                         |
| `showRoom`                                | `renderEchoesForRoom` after the exits line          |

### `world/chord_labor.js` (6.4)

| Hook point                                | What runs                                           |
|-------------------------------------------|-----------------------------------------------------|
| `task pull` verb                          | `pullBatch` (terminal-room-aware, reads cluster)    |
| `sort` / `bind` / `refine` verbs          | `applyVerb` against `activeTask`                    |
| Batch completion                          | `awardBatch` → XP + credits + practice + leaderboard|
| `swap` out of Logic-State                 | Drop `activeTask`, reset `shiftBatchesCompleted`    |
| Coherence ≤ 0 (forced eject)              | Same shift-end cleanup as deliberate swap           |
| `executeWorldReset`                       | Reset `cycleBatchesCompleted` per player + clear    |
|                                           | `cycleLeaderboard.batchesCompleted`                 |

### `world/muscle_memory.js` (6.5)

| Hook point                                | What runs                                                   |
|-------------------------------------------|-------------------------------------------------------------|
| `swap` out of Logic-State (deliberate)    | `creditShiftMemories(player, batchesThisShift)` before reset|
| Coherence ≤ 0 in `monsterAttackPlayer`    | Same credit, captured **before** ejectToLifeState           |
| Coherence ≤ 0 in `handleApplyVerb`        | Same credit, captured **before** eject                      |
| `memory` / `memory <id>` verb             | `listMemories` / `consumeMemory` + effect application       |
| `playerAttackMonster` (after spell bonus) | Quota Grit ×1.25 multiplier consumes `muscle_quota_grit`    |
| `monsterAttackPlayer` (after divine)      | Refinement Reflex consumes `muscle_refinement_reflex`, returns false |
| `handleFlee` / `handleMonsterCombatFlee`  | Floor Finesse consumes `muscle_floor_finesse`, forces success|

---

## 9. Smoke / verify suites

Every Tier 6 phase ships two test files at the repo root, following
the convention established in earlier tiers.

| Suite                          | Type                          | What it covers                                |
|--------------------------------|-------------------------------|-----------------------------------------------|
| `_verify_sync_state.js`        | Unit (no telnet, no fs writes outside tmp) | Migration idempotence, swap mirror, eject, pocket queue, crash recovery |
| `_verify_logic_combat.js`      | Unit                          | Coherence damage path, retort restoration, eject ≤ 0, Alterio quota_lock effect |
| `_verify_echoes.js`            | Unit                          | Add/cap/expire/reject-dialogue, persistence round-trip, listForRoom ordering |
| `_smoke_partition_intake.js`   | Live (spawned server)         | Walkthrough of the 6.1 entry quest            |
| `_smoke_logic_state.js`        | Live                          | Logician-side combat smoke                    |
| `_smoke_life_state.js`         | Live                          | Township + Echoes (`arrange`/`stack` happy path, dialogue rejection, persisted echoes round-trip) |
| `_verify_chord_labor.js`       | Unit (6.4)                    | Batch generation per terminal, apply-verb correctness, completion rewards, abandon, quota counters, rapid bonus |
| `_smoke_chord_labor.js`        | Live (6.4)                    | Pull → sort/bind/refine → complete → quota update, then swap-out clears `activeTask`, then verify cycleLeaderboard |
| `_verify_muscle_memory.js`     | Unit (6.5)                    | Defs, `chargesForShift` math at all thresholds, credit/consume guards, listMemories shape, name resolution (id/prefix/label), and server-side wiring greps for every effect hook + the swap announcement |
| `_smoke_muscle_memory.js`      | Live (6.5)                    | Run a 12-batch shift end-to-end, swap out, parse the announcement (4× Reflex, 2× Grit, 1× Calm, 1× Finesse), spend Console Calm, confirm Refinement Reflex is rejected outside combat, and confirm Logician-side spend is blocked |

The cumulative count line at the bottom of each Tier 6 commit
message is the running total. As of Tier 6.5 the unit total is **779**
checks (Tier 6.5 contributes 57); the live total includes
**24 muscle-memory** checks on top of all earlier suites.

---

## 10. Tuning constants reference

### Sync-State (`world/sync_state.js`)

| Constant                       | Value                                                 |
|--------------------------------|-------------------------------------------------------|
| `SCHEMA_VERSION`               | `6`                                                   |
| Pocket artifact queue cap      | 50 entries (auto-shift on overflow)                   |
| Pocket artifact drain default  | 3 per swap                                            |
| Neural Hangover duration       | 5 minutes (`5 * 60 * 1000` ms)                        |
| Neural Hangover severity       | `0.20` (placeholder for future stat-debuff math)      |

### Logic combat (`mud_server.js`)

| Constant                       | Value                                                 |
|--------------------------------|-------------------------------------------------------|
| Default `maxCoherence`         | 100                                                   |
| Quota-lock duration            | 60 seconds                                            |
| Floor Supervisor Alterio HP    | tunable in `monsters.json` (level 35)                 |

### Echoes (`world/echoes.js`)

| Constant                       | Value                                                 |
|--------------------------------|-------------------------------------------------------|
| `TTL_MS`                       | 24 h (`24 * 60 * 60 * 1000`)                          |
| `MAX_PER_ROOM`                 | 5                                                     |
| `MAX_PAYLOAD_LEN`              | 80 chars                                              |
| `VALID_KINDS`                  | `Set('arrange', 'stack')`                             |

### Chord Labor (`world/chord_labor.js`)

| Constant                       | Value                                                 |
|--------------------------------|-------------------------------------------------------|
| `BATCH_TIMEOUT_MS`             | 5 minutes (auto-abandon if untouched)                 |
| `COHERENCE_COST_WRONG_VERB`    | 5                                                     |
| `BASE_BATCH_XP`                | 30                                                    |
| `XP_PER_LEVEL`                 | 2                                                     |
| `BATCH_CREDITS`                | 8                                                     |
| `RAPID_BONUS_THRESHOLD_MS`     | 60_000                                                |
| `RAPID_BONUS_MULTIPLIER`       | 1.5                                                   |
| `FLOOR_QUOTA_TARGET`           | 3 batches per shift                                   |
| Terminal-to-batch-size map     | 313→4, 315→4, 319→5, 327→6                            |

### Theta-credit accrual (`mud_server.js:7773`)

| Knob                            | Value                                                 |
|---------------------------------|-------------------------------------------------------|
| Credits per minute of shift     | 5                                                     |

### Muscle Memory (`world/muscle_memory.js`)

| Memory id           | `earnEvery` | Effect key                       | Instant heal |
|---------------------|-------------|----------------------------------|--------------|
| `refinement_reflex` | 3           | `muscle_refinement_reflex`       | 0            |
| `quota_grit`        | 5           | `muscle_quota_grit`              | 0            |
| `console_calm`      | 8           | (none — instant)                 | 50 HP        |
| `floor_finesse`     | 12          | `muscle_floor_finesse`           | 0            |

| Combat hook constant            | Value                                                 |
|---------------------------------|-------------------------------------------------------|
| Quota Grit damage multiplier    | ×1.25 (`Math.floor(totalDamage * 1.25)`)              |
| Console Calm heal               | +50 HP, capped at `maxHP`                             |
| Floor Finesse flee success      | 1.0 (forced)                                          |
| Refinement Reflex attack cancel | 100% (the monster turn returns false; no damage rolls)|

---

## 11. Known limitations & deferred work

### Deferred to 6.6 — Macrodata Vault

room_322 (Vault Antechamber) is intentionally a dead-end with a locked
door. Tier 6.6 opens it: a Logic-State capstone instance with phase
mechanics, gated by completing 6.4's quota run and likely consuming
specific 6.5 muscle-memory charges to defuse phases. The reward
closes the Tier 6 arc and feeds into the Tier 3 north-star content.

### Other known gaps

- `subliminalBuffs.fromLogic / fromLife` are seeded empty and never
  written. The Tier 6.5 ship intentionally scoped only to one-shot
  charges; passive stat trickle (e.g. "the Logician's gym habit gives
  the Citizen +5 max HP") was deferred to keep the 6.5 diff focused.
- `personas.logic.muscleUnlocks` is still a stub. It's the reserved
  reverse channel — Citizen achievements that grant the Logician
  passive perks. Same deferral reasoning as the subliminal buffs.
- The Wax Lily Tavern back office (room_350) is currently scenery
  only; intended as a quest hub for a future Donovan continuation.
- Hybrid persona slot (`personas.hybrid: null`) is reserved for a
  late-game "reintegration" path. Not implemented.
- The `pocketArtifacts` first-class id-tagged objects route into the
  Citizen's inventory directly. There is currently no equivalent on
  the Logician side — only the Logician → Citizen direction is
  populated by 6.3.

---

## 12. Severance naming policy

Tier 6 draws on the *Severance* (Apple TV+) corporate-horror register
without using any character names from the show. The Saint-Reed
Institute is not Lumon. **Gia Saint-Reed**, the founder, is an
anagram of "AI Generated" and is the canonical name for the founder
in all dialogue, posters, and plaques. Any Tier 6 content that wants
to gesture at the show should do so through *register* (the laminated
slogans, the suspiciously soothing institutional language) rather
than direct quotation.

The one verbatim Oracle/Matrix line — Dr. Caldera's "feel right as
rain" — is canonical and not show-exclusive. It stays.

See also: `memory/project_severance_naming_policy.md`.

---

_Last updated: Tier 6.5 ship. Reviewed against `world/sync_state.js`,
`world/echoes.js`, `world/chord_labor.js`, `world/muscle_memory.js`,
and `rooms.json` rooms 301–350._
