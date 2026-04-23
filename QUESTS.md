# The Shattered Realms — Quest System

Quests in The Shattered Realms are **cycle-scoped**: they are offered, tracked, and resolved within a single hourly world cycle. When the world resets, active quest progress is wiped, quest items respawn at their source rooms, and the slate is clean again — but **NPCs remember** who helped or hindered them. Relationship scores survive every reset and every server restart.

---

## How Quests Work

### The Cycle

- The world runs on a **1-hour cycle**. At the end of each cycle, the realm resets.
- On reset: all active quest progress is cleared, completed quests are forgiven, quest items respawn in their original rooms.
- NPC memory, relationship scores, and conversation history are **preserved** across resets and restarts.
- Check cycle timing with `time` or `reset_timer`.

### Getting Quests

Quests are offered by NPCs. To discover what a given NPC has available, find them and talk to them in their home room.

| NPC | Home Room | Quest Offered |
|---|---|---|
| Nomagio's Apprentice | `room_002` — The Obsidian Ledge | The Flickering Rune |
| The Obsidian Scribe | `room_058` — The Boundless Archive | Silence the Whisper |
| Thessarian's Clockwatcher | `room_088` — The Galactic Observatory | Wind Thessarian's Clock |
| The Void Merchant | `room_078` — The Vacant Chamber | Feed the Void |

### Player Commands

| Command | Purpose |
|---|---|
| `talk <npc> [message]` | Speak with an NPC. Mention the quest or ask about work to be offered one. |
| `quests` | List your active quests (title, objectives, progress, time remaining if timed). |
| `accept <questId>` | Accept a quest by its ID (see the **Quest ID** field below). |
| `abandon <questId>` | Give up on an active quest. Counts as a failure to the giver — expect a relationship hit. |
| `talk <giver>` (when ready) | Return to the quest giver once all objectives are complete. The turn-in is automatic once they detect you are ready. |
| `give <amount> gold <npc>` | Used by the **Feed the Void** quest to deposit tribute. |

### Objective Types

The quest engine tracks four kinds of objectives:

- **`monster_kill`** — progresses when you kill a monster matching the target template.
- **`item_pickup`** — progresses when you `get` or `take` a specific quest item.
- **`visit_rooms`** — progresses when you enter each listed room (order doesn't matter).
- **`give_gold`** — progresses when you `give <amount> gold <npc>` to the target NPC.

### Rewards & Consequences

Completing a quest awards **gold**, **XP**, and a **relationship boost** with the giver. Some quests also carry a **failure penalty** — abandoning or letting a timer expire will lower the giver's opinion of you. Attacking a quest giver instantly fails any active quest they gave you and drops their opinion hard.

---

## The Four Quests

### 1. The Flickering Rune

- **Quest ID:** `flickering_rune`
- **Giver:** Nomagio's Apprentice
- **Giver Location:** `room_002` — The Obsidian Ledge
- **Time Limit:** None
- **Description:** Nomagio's Apprentice is patching reality-leaks and needs a Flickering Rune Fragment from deep in the Crystal Caverns. Find it and bring it back before the cycle ends.
- **Hint:** *"The shard is said to glint among The Sparkling Depths."*

#### Objectives

| # | Type | Target | Required |
|---|---|---|---|
| 1 | `item_pickup` | `flickering_rune_fragment` | 1 |

#### Quest Item Location

| Item | Spawn Room |
|---|---|
| Flickering Rune Fragment | `room_015` — The Sparkling Depths (Crystal Caverns) |

#### Rewards

- 50 gold
- 30 XP
- +15 relationship with Nomagio's Apprentice

#### Walkthrough

1. Travel to `room_002` (The Obsidian Ledge) and `talk apprentice` to receive the quest.
2. `accept flickering_rune`.
3. Travel into the Crystal Caverns and reach `room_015` (The Sparkling Depths).
4. `get fragment` (or `get flickering rune fragment`).
5. Return to `room_002` and `talk apprentice` — the turn-in fires automatically.

---

### 2. Silence the Whisper

- **Quest ID:** `silenced_whisper`
- **Giver:** The Obsidian Scribe
- **Giver Location:** `room_058` — The Boundless Archive
- **Time Limit:** None
- **Description:** A Bookworm is chewing through forbidden pages in the Ethereal Library. The Scribe wants it silenced. Permanently.
- **Hint:** *"Hunt a Bookworm among the shelves of the Ethereal Library."*

#### Objectives

| # | Type | Target | Required |
|---|---|---|---|
| 1 | `monster_kill` | `bookworm` | 1 |

#### Monster Location

Bookworms spawn in the **Ethereal Library** zone — any of rooms `room_056` through `room_065`. You may need to wander the library until one spawns or wanders into view. Suggested hunting path:

- `room_056` → `room_057` → `room_058` (The Boundless Archive, where the Scribe waits) → `room_059` → `room_060` → `room_061` → `room_062` → `room_063` → `room_064` → `room_065`

#### Rewards

- 30 gold
- 75 XP
- +15 relationship with The Obsidian Scribe

#### Walkthrough

1. Travel to `room_058` and `talk scribe` to receive the quest.
2. `accept silenced_whisper`.
3. Patrol the Ethereal Library rooms (`room_056` – `room_065`) until a Bookworm appears.
4. `attack bookworm` and finish it off.
5. Return to `room_058` and `talk scribe` to turn in.

---

### 3. Wind Thessarian's Clock

- **Quest ID:** `wind_the_clock`
- **Giver:** Thessarian's Clockwatcher
- **Giver Location:** `room_088` — The Galactic Observatory
- **Time Limit:** **15 minutes** (real time) from acceptance
- **Description:** The cycle-clock is slowing. Touch three observatory waypoints in sequence and return to the Clockwatcher before time runs out.
- **Hint:** *"Visit room_088, room_091, and room_095 — in any order — then return."*

#### Objectives

| # | Type | Target | Required |
|---|---|---|---|
| 1 | `visit_rooms` | `room_088`, `room_091`, `room_095` | 3 |

#### Waypoint Locations

| Room | Name |
|---|---|
| `room_088` | The Galactic Observatory (also the giver's room) |
| `room_091` | The Celestial Observatory |
| `room_095` | The Starlight Observatory |

#### Rewards

- 40 gold
- 100 XP
- +20 relationship with Thessarian's Clockwatcher

#### Failure Penalty

- **−5 relationship** with the Clockwatcher if the 15-minute timer expires before you return.

#### Walkthrough

1. Travel to `room_088` and `talk clockwatcher`.
2. `accept wind_the_clock` — the 15-minute timer starts.
3. Move through the Celestial Observatory zone and step into each of `room_088`, `room_091`, and `room_095` at least once (any order).
4. Return to `room_088` and `talk clockwatcher` to turn in before the timer expires.

---

### 4. Feed the Void

- **Quest ID:** `feed_the_void`
- **Giver:** The Void Merchant
- **Giver Location:** `room_078` — The Vacant Chamber
- **Time Limit:** None
- **Description:** The Void Merchant requires a tribute of 200 gold. Hand it over and the Void will remember you — possibly fondly.
- **Hint:** *"Use `give 200 gold merchant` in the Vacant Chamber."*

#### Objectives

| # | Type | Target | Required |
|---|---|---|---|
| 1 | `give_gold` | `void_merchant` | 200 gold |

#### Rewards

- 0 gold (the tribute is the point)
- 60 XP
- +25 relationship with The Void Merchant (the single largest relationship reward of any quest)

#### Walkthrough

1. Ensure you have at least **200 gold**.
2. Travel to `room_078` (The Vacant Chamber) and `talk merchant`.
3. `accept feed_the_void`.
4. `give 200 gold merchant` — the objective completes immediately on payment.
5. `talk merchant` to receive the XP and relationship reward.

> **Note:** High standing with the Void Merchant may not translate to favor with other NPCs — he is, after all, amoral and transactional.

---

## Quest Failure & Abandonment

- **`abandon <questId>`** marks the quest as abandoned. Quest givers treat this as a minor betrayal.
- **Attacking a quest giver** instantly fails any active quest they gave you and damages the relationship significantly.
- **Timed quests** (currently only *Wind Thessarian's Clock*) fail automatically when the timer expires; the giver records the failure and their opinion of you drops.
- **A world reset** cancels active quests without a relationship penalty — the cycle simply ends.

---

## Reference: Quest Item Respawn

Quest items are respawned at the start of every cycle and after every `force_reset`. If a quest item has been picked up but not turned in when a reset fires, it disappears from your inventory (the world has changed) and reappears at its original room.

| Quest | Item | Room |
|---|---|---|
| The Flickering Rune | Flickering Rune Fragment | `room_015` |
| Silence the Whisper | *(no item — kill-based)* | — |
| Wind Thessarian's Clock | *(no item — waypoint-based)* | — |
| Feed the Void | *(no item — gold tribute)* | — |

---

## Admin Quest Commands

For testing and moderation:

| Command | Purpose |
|---|---|
| `quest_list` | List all quest definitions loaded from `quests.json`. |
| `quest_give <player> <questId>` | Force-grant a quest to a player (skips the NPC dialogue gate). |
| `force_reset` | Trigger a cycle reset immediately — clears all quest progress and respawns quest items. |
| `npc_forget <npc> <player>` | Wipe the quest giver's relationship and memory of a specific player. Use to reset a broken relationship. |
