# Admin Walkthrough — Neo Kyoto (Tier 3.1)

**The definitive admin guide for the Nomagios server-farm realm.** Every zone, every boss, every quest, every secret. Read end-to-end before going live; bookmark the boss compendium and admin command reference for live ops. Pairs with `ADMIN_GUIDE_TIER6.md` — Neo Kyoto is the gate to Severance Layer Theta, so admins running Tier 6 also need to know this layer cold.

---

## Table of Contents

1. [Admin onboarding](#1-admin-onboarding)
2. [Getting to Neo Kyoto](#2-getting-to-neo-kyoto)
3. [Map of Neo Kyoto](#3-map-of-neo-kyoto)
4. [Zone 1 — Arrivals Concourse (201-210)](#zone-1--arrivals-concourse-rooms-201-210)
5. [Zone 2 — Neon Soi (211-220)](#zone-2--neon-soi-rooms-211-220)
6. [Zone 3 — Corporate Spires (221-230)](#zone-3--corporate-spires-rooms-221-230)
7. [Zone 4 — The Stack (231-240)](#zone-4--the-stack-rooms-231-240)
8. [Zone 5 — Off-World Colonies Waitlist (241-250)](#zone-5--off-world-colonies-waitlist-rooms-241-250)
9. [Zone 6 — Kowloon-42 Arcology (251-260)](#zone-6--kowloon-42-arcology-rooms-251-260)
10. [Zone 7 — Chrome Sea (261-270)](#zone-7--chrome-sea-rooms-261-270)
11. [Zone 8 — Midnight Market (271-280)](#zone-8--midnight-market-rooms-271-280)
12. [Zone 9 — Replicant Quarter (281-290)](#zone-9--replicant-quarter-rooms-281-290)
13. [Zone 10 — Heat Death Datacentre (291-300)](#zone-10--heat-death-datacentre-rooms-291-300)
14. [Boss compendium](#14-boss-compendium)
15. [Quest list](#15-quest-list)
16. [Replicant / Human affinity axis](#16-replicant--human-affinity-axis)
17. [Admin command reference](#17-admin-command-reference)
18. [Save-priming for speedruns](#18-save-priming-for-speedruns)
19. [Secrets & gotchas](#19-secrets--gotchas)
20. [Troubleshooting](#20-troubleshooting)
21. [Going-live checklist](#21-going-live-checklist)

---

## 1. Admin onboarding

If you've already onboarded for Tier 6, skip to §2. The admin pathway is identical. Otherwise:

### 1.1 Add the user to `admins.json`

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

Names are case-sensitive and match against the **character name**, not the account username. Save the file.

### 1.2 Connect

Default port `8888`. Override with `MUD_PORT` env var.

```
telnet localhost 8888
```

### 1.3 Register a fresh admin character

```
Do you have an existing account? (Y/N): N
Choose a username (3-12 letters): YourAdminName
Choose a password (min 6 characters): yourpass123
Confirm password: yourpass123
```

Verify with `admin status` once at the `>` prompt.

---

## 2. Getting to Neo Kyoto

### 2.1 The intended path (canonical)

Neo Kyoto is a **separate server-farm realm**, accessible through Nomagio's shuttle terminal at the eastern edge of Eldoria. The realm gate at room_201 enforces:

```js
room_201: { minRemortTier: 1, label: 'Neo Kyoto (Nomagios Transit Terminal)' }
```

A real player needs to have **remorted at least once** (Tier 1) before the shuttle terminal will accept them. Without that, the move from room_100 (Eldoria capstone exit) → room_201 is refused with: *"A polite hand stops you at the service door. 'Staff only, traveller. Neo Kyoto (Nomagios Transit Terminal) is for returning travellers. Come back when you've rebooted at least once.'"*

**Achievement hooks:** the first room_100 → room_201 transition unlocks the `staff_pass` achievement. Every entry into rooms 201-300 unlocks `clocked_in`.

### 2.2 The admin path (fast)

```
transurf 201      # Nomagios Transit Terminal - Arrivals
```

`transurf` takes **just the room number**, no `room_` prefix. Three-digit padding is automatic. `transurf` bypasses the realm gate entirely.

### 2.3 Get a fresh admin combat-ready

Neo Kyoto's monsters scale L15-22; bosses scale L18-30. A bare admin character will get crushed in the Heat Death Datacentre. Recommended priming:

```
set_level YourName 25         # comfortable for everything up to SYSADMIN.EXE
give_exp YourName 30000       # rolling buffer
give_gold YourName 5000       # for chapel + market shops
god_mode                      # toggle invincibility for testing
heal YourName                 # full HP refill

# Useful weapons - Tuning Fork is the canonical Neo Kyoto starter:
give_item YourName tuning_fork
give_item YourName drum_stave        # boss drop from Morwyn (Eldoria); harmonic damage
give_item YourName segfault_cleaver  # mid-tier data weapon
```

There is **no `set_remort_tier` admin command**. To set a player's `remortTier` (relevant for Tier 6 progression but not Neo Kyoto entry), edit their save file directly — see §18.

---

## 3. Map of Neo Kyoto

Neo Kyoto is **rooms 201-300**, 100 rooms across 10 thematic zones. Aesthetic is Blade-Runner-meets-corporate-ops: rain, neon, server racks, queues, and replicants.

| Range | Zone | Bosses | Notes |
|---|---|---|---|
| 201-210 | Arrivals Concourse | — | Entry, customs, currency, lost & found |
| 211-220 | Neon Soi | Chiyo-7 (220) | Streets, noodle alley, chrome shop |
| 221-230 | Corporate Spires | Account Manager (230) | High-rise; lobby → boardroom |
| 231-240 | The Stack | — | Server-room mythology |
| 241-250 | Off-World Colonies Waitlist | — | Endless queue dystopia |
| 251-260 | Kowloon-42 Arcology | Babel Fish Regent (260) | Crashed satellite + shantytown |
| 261-270 | Chrome Sea | The Deep Pool (270) | Flooded datacenter coast |
| 271-280 | Midnight Market | — | Bazaar; quest hub at Barkeep 42's Tavern (276) |
| 281-290 | Replicant Quarter | — | Quiet, contemplative zone; affinity payoffs |
| 291-300 | Heat Death Datacentre | SYSADMIN.EXE (300) | Capstone arc |

**5 fixed-room bosses on the layer** — see §14.

### Sync terminals

There are **no Sync Terminals** in Neo Kyoto. The Sync-State system is Tier 6 (Severance Layer Theta) — Citizens and Logicians are a Theta concept. In Neo Kyoto every player is just themselves.

### Connection points to other realms

- **Eldoria → Neo Kyoto:** room_100 → room_201 (gated, see §2.1).
- **Neo Kyoto → Severance Layer Theta:** room_300 → room_301 (gated by `minRemortTier: 2` AND `requiresQuest: 'paging_oncall'`). Defeating SYSADMIN.EXE completes `paging_oncall`. The shuttle terminal "knows when you are ready."

---

## Zone 1 — Arrivals Concourse (rooms 201-210)

**Pitch:** A cyberpunk transit terminal. Rain on the glass. Customs declarations. Visitor orientations. The first thing every player sees off the shuttle.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 201 | Nomagios Transit Terminal — Neo Kyoto Arrivals | **Realm-gate entry** |
| 202 | Baggage Reclamation | `welcome_to_the_farm` quest target |
| 203 | Currency Exchange | |
| 204 | Customs & Decryption | |
| 205 | Language Acquisition Booth | `welcome_to_the_farm` quest target |
| 206 | Visitor Orientation Theatre | |
| 207 | Transit Plaza | Shopping district vibes |
| 208 | Lost & Found | |
| 209 | Corporate Welcome Lounge | |
| 210 | Concourse Exit Gate | `welcome_to_the_farm` quest target. Connects out to Neon Soi |

### Monsters

`patched_pedestrian` (L15, passive), `baggage_claim_beast` (L15, neutral), `expired_traveler` (L16, passive).

### NPC

- **Terminal Officer Koma** — quest giver for `welcome_to_the_farm`. Persistent LLM brain at `npcs/brains/terminal_officer_koma.json`.

### Quest

- **`welcome_to_the_farm`** (giver: Terminal Officer Koma) — visit room_202, room_205, room_210. Reward: 200g, 250 XP, +15 relationship with Koma.

### Admin shortcuts

```
transurf 201            # Neo Kyoto entry
transurf 210            # Concourse Exit (connects to Neon Soi)
spawn neon_yakuza 207   # spawn aggro monster for combat tests
```

---

## Zone 2 — Neon Soi (rooms 211-220)

**Pitch:** Wet streets. Steam. Noodles. Neon Buddhas. The Soi is where the layer's aesthetic crystallises — every player's first "yes, I'm in Neo Kyoto" moment.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 211 | The Rain Gate | Entry from Concourse |
| 212 | Noodle Alley | |
| 213 | Replicant Buskers Corner | |
| 214 | Rusty's Chromeshop | Shop |
| 215 | Street Hacker Bench | Hack-skill payoff |
| 216 | Soaked Overpass | |
| 217 | Steam Grate Junction | |
| 218 | The Umbrella Forest | |
| 219 | Neon Chapel | |
| 220 | The Certificate Graveyard | **Boss room: Chiyo-7** |

### Monsters

`patched_pedestrian`, `bazaar_cutpurse` (L16, aggressive), `flickering_janitor` (L17, passive), `noodle_vendor_aggro` (L15, aggressive — yes, the noodle vendor is hostile).

### NPC

- **Hiro** — quest giver for `neon_lit_debts`. Persistent LLM brain at `npcs/brains/hiro.json`.

### Boss: Chiyo-7 (room_220)

**L18 / 1300 HP / 60 STR / physical / `harmonic 75 / data -25`.**

A retired blade-runner whose certificate expired six firmware revisions ago. Drops **Chiyo-7's Expired Cert** (Legendary).

- **Mechanic — "Cert Expired" (50% HP):** Chiyo blinks a red badge light. From this point onward she **moves 1.5x faster but her hits deal 0 damage** (her authentications no longer land). Strict damage downgrade in the player's favor — keep her alive past 50% and you can't lose.

### Quest

- **`neon_lit_debts`** (giver: Hiro) — defeat 5 `bazaar_cutpurse`. Reward: 350g, 400 XP, +20 Hiro relationship, **+1 hack skill**.

### Admin shortcuts

```
transurf 220            # straight to Chiyo-7
spawn bazaar_cutpurse 211   # for kill-count quest tests
god_mode                # take no damage during Chiyo phase 1
```

---

## Zone 3 — Corporate Spires (rooms 221-230)

**Pitch:** A skyscraper. Lobby up to boardroom. Each floor is a small joke about corporate life. The Account Manager fight is at the top.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 221 | Lobby of Lobbies | Entry |
| 222 | Security Turnstile | |
| 223 | Middle Management Floor | |
| 224 | The Quarterly Review Pit | |
| 225 | Tyrell-Nomagios Procurement | |
| 226 | Conference Room 7B | |
| 227 | The Sky Bridge | |
| 228 | Executive Elevator | |
| 229 | Boardroom Antechamber | |
| 230 | The Account Manager's Office | **Boss room: Account Manager** |

### Monsters

`corporate_enforcer` (L19, aggressive — hits hard), `junior_associate` (L18, aggressive — also spawned by the boss), `flickering_janitor`.

### NPC

- **Ms. Takamura** — quest giver for `performance_review`. Persistent LLM brain at `npcs/brains/ms_takamura.json`.

### Boss: The Account Manager (room_230)

**L20 / 1600 HP / 70 STR / physical / `harmonic 75 / data -25`.**

A smiling middle-manager with an escalation queue. Drops **Managerial Letter of Recommendation** (Legendary).

- **Mechanic — "Escalation":** every 3 monster-attack rounds, the Account Manager spawns a **Junior Associate** add (`junior_associate` template, L18, 140 HP) in the same room. Adds are linked by `parentBossId`.
- **Damage scaling:** while any adds are alive, the boss's damage scales **+10% per live add**. Three live adds = 130% damage from the boss.
- **Strategy:** prioritize the adds, or kill the boss fast enough that escalation never accumulates.

### Quest

- **`performance_review`** (giver: Ms. Takamura) — recover 3 `escalation_token` (drops from Account Manager and Junior Associates). Reward: 600g, 600 XP, +25 Takamura relationship, **+3 human affinity**.

### Admin shortcuts

```
transurf 230            # Account Manager office
spawn junior_associate 230   # add another add to test damage scaling
despawn <id>            # kill an add to verify scaling drops
```

---

## Zone 4 — The Stack (rooms 231-240)

**Pitch:** A datacenter rendered as a temple. Cold aisles. Hot aisles. KVM cathedrals. No fixed-room boss — but the zone hosts the `the_cold_aisle` quest, the first thing Barkeep 42 sends new players to do.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 231 | The Cold Aisle | `the_cold_aisle` quest target |
| 232 | The Hot Aisle | |
| 233 | KVM Junction | |
| 234 | Rack 7: Deprecated | |
| 235 | The Coolant River | |
| 236 | The Patch Panel Cathedral | |
| 237 | Network Closet | |
| 238 | Backup Tape Archive | |
| 239 | Overhead Tray Crawl | |
| 240 | Emergency Power Cutoff | |

### Monsters

`data_ghost` (L21, aggressive), `security_subroutine` (L20, aggressive), `memory_leak_wraith` (L22, aggressive — hardest non-boss monster on the layer).

### Quest

- **`the_cold_aisle`** (giver: Barkeep 42) — recover a `deleted_memory` canister from room_231. Reward: 800g, 800 XP, +30 Barkeep 42 relationship.

The Barkeep is at room_276 (Midnight Market). Quest flow: visit Barkeep → walk to The Stack → loot canister → return.

### Admin shortcuts

```
transurf 231            # The Cold Aisle
create_item deleted_memory 231   # seed the canister manually
```

---

## Zone 5 — Off-World Colonies Waitlist (rooms 241-250)

**Pitch:** The most procedurally bleak zone on the layer. Pure queue-dystopia: ten rooms about waiting in line for a thing that may never arrive. Lore-rich; mechanically light.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 241 | Ticket Booth 1 | |
| 242 | Ticket Booth 2 | |
| 243 | Waiting Pew Hall | |
| 244 | Forms Bureau | |
| 245 | Orientation Film Loop | |
| 246 | Notary Station | |
| 247 | The Appeals Desk | |
| 248 | The Back Of The Line | |
| 249 | The Middle Of The Line | |
| 250 | The Queue Itself | |

### Monsters

`queue_fragment` (L18, neutral), `offworld_recruiter` (L19, passive — yes, even the recruiters are tired).

### Quest hooks

No quest givers in this zone, but `queue_fragment` is referenced by some general kill counters. Some flavor pickups; mostly walkthrough atmosphere.

### Admin shortcuts

Nothing special. `transurf 241` to set foot, `transurf 250` for the punchline of the zone.

---

## Zone 6 — Kowloon-42 Arcology (rooms 251-260)

**Pitch:** A Skylab-meets-Kowloon shantytown built around and inside a crashed satellite. The Babel Fish Regent — Neo Kyoto's mid-tier capstone — sits on a throne of translation nodes.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 251 | Crash Crater Base | |
| 252 | First Scaffold Level | |
| 253 | Satellite Dish Plaza | |
| 254 | Hanging Gardens of Cables | |
| 255 | Black Market Cistern | |
| 256 | Rooftop Refugee Camp | |
| 257 | Radio Tower Shantytown | |
| 258 | Orbital Debris Gallery | |
| 259 | Prayer Wheels of Static | |
| 260 | The Babel Fish Regent's Throne | **Boss room: Babel Fish Regent** |

### Monsters

`memory_leak_wraith` (L22), `data_ghost`, `security_subroutine`. Higher-tier mix.

### Boss: Babel Fish Regent (room_260)

**L24 / 2200 HP / 90 STR / data damage / `harmonic 75 / data -25` baseline.**

A universal translator gone feral. Drops **Babel Fish Crown** (Legendary).

- **Mechanic — "Schema Rotation":** every monster-attack round, the Regent randomly picks a new resist schema from `[physical, fire, harmonic, shadow, data]`. Resists reset to baseline (`harmonic 75, data -25`), then layer the new schema:
  - `harmonic` selected → `harmonic` boosted to 90
  - `data` selected → `data` boosted to 50
  - any other → that type boosted to 60
- The fight telegraphs: *"The Babel Fish Regent flickers into a new schema — now resisting `<type>`."*
- **Strategy:** carry multiple damage types. The Tuning Fork (harmonic) is wrong half the time; the Segfault Cleaver (data) is wrong half the time. Mixed-loadout is the meta.

### Quest

- **`babel_fish_problem`** (giver: Barkeep 42) — defeat the Babel Fish Regent. Reward: 1500g, 2000 XP, +40 Barkeep relationship.

### Admin shortcuts

```
transurf 260            # Babel Fish throne
# Mid-fight, dump current resists:
admin_score YourName    # see all relevant state
```

---

## Zone 7 — Chrome Sea (rooms 261-270)

**Pitch:** A literal mercury sea, with a flooded datacenter on the shore. The Deep Pool — a memory-eater coalesced from soft-deleted accounts — waits at the bottom.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 261 | Mercury Shore | Entry |
| 262 | Flooded Datacenter Entrance | |
| 263 | The Shallows | |
| 264 | Floating Barge Dock | |
| 265 | The Phosphor Depths | |
| 266 | Drowned Terminal Room | |
| 267 | The Undertow | |
| 268 | Coral Network | |
| 269 | Abyssal Cache | |
| 270 | The Deep Pool | **Boss room: The Deep Pool** |

### Boss: The Deep Pool (room_270)

**L26 / 2500 HP / 95 STR / data damage / `harmonic 75 / data -25`.**

A memory-eater. Drops **Deep-Pool Pearl** (Legendary).

- **Mechanic — "Mana Drain":** each monster-attack round drains **25-44 mana** from the player. While the player has mana to drain:
  - The drain absorbs the attack: damage = 0.
  - The pool says: *"The Deep Pool drinks N mana from you. (M/MAX)"*
- When mana hits 0, attacks bleed through at **+50% damage**.
- **Strategy:** mana-light builds (warriors, etc.) take less initial damage but face Phase 2 fast. Mana-heavy builds (mages, casters) starve the Pool of damage but watch their mana burn out. Either way it's a stamina contest. Bringing `admin_cola` (mana restore consumable) extends Phase 1 indefinitely.

### Quest hook

No fixed quest. The Pearl is a Legendary drop — sells for 5000+ at the Midnight Market pawn district (rooms 278-279).

### Admin shortcuts

```
transurf 270            # The Deep Pool
# Mid-fight, force phase 2 by zeroing mana:
# (no admin command; edit save or just spam spells until oom)
```

---

## Zone 8 — Midnight Market (rooms 271-280)

**Pitch:** The bazaar. A grey aisle. A blacker aisle. Lawyer's row. The food court of last resort. **Quest hub** for the layer — Barkeep 42's Tavern (room_276) is where most of the layer's main-line quests are given out.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 271 | Bazaar Gate | Entry |
| 272 | The Grey Aisle | |
| 273 | The Blacker Aisle | |
| 274 | Lawyer's Row | |
| 275 | Food Court of Last Resort | |
| 276 | Barkeep 42's Tavern | **Quest hub** |
| 277 | The Back Of The Bazaar | |
| 278 | Pawn District | Sell Legendaries here |
| 279 | Information Brokers Den | |
| 280 | Smuggler's Transit | |

### NPCs

- **Barkeep 42** — quest giver for `the_cold_aisle`, `babel_fish_problem`, and **`paging_oncall`** (the capstone). Persistent LLM brain at `npcs/brains/barkeep_42.json`. The single most important NPC on the layer.

### Quests given here

See §15. Three main-line quests + paging_oncall, all from Barkeep 42.

### Admin shortcuts

```
transurf 276            # Barkeep 42's Tavern
# Direct the player to do quests in order:
# the_cold_aisle -> babel_fish_problem -> paging_oncall
```

---

## Zone 9 — Replicant Quarter (rooms 281-290)

**Pitch:** The contemplative zone. Tea houses. A library of discarded drafts. Memorial fountains. **No combat-heavy intent** — this is the layer's emotional center, where the human/replicant axis pays off.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 281 | The Quiet Gate | Entry. `dreams_of_sheep` quest target |
| 282 | Tea House of Unremembered Voices | |
| 283 | The Library of Discarded Drafts | |
| 284 | Vow Ring Shrine | Source of `replicant_vow_ring` craft component |
| 285 | Philosopher's Walk | `dreams_of_sheep` quest target |
| 286 | Memorial Fountain | |
| 287 | The Third Eye Garden | |
| 288 | Unit Dormitory | `dreams_of_sheep` quest target |
| 289 | The Lantern Hall | |
| 290 | Mother of Orphans' Sanctum | `orphans_in_the_machine` target |

### NPCs

- **Wren** — quest giver for `dreams_of_sheep` and `orphans_in_the_machine`. Persistent LLM brain at `npcs/brains/wren.json`. Hand-tuned dialogue around the layer's central question (replicant memory, identity, dreams).
- **Lyssara Echo** — `npcs/brains/lyssara_echo.json`. Ambient replicant; lore weight, no quest.
- **Mother of Orphans** — at room_290. Tied to `orphans_in_the_machine`. Visits her chamber and walks out.

### Quests

- **`dreams_of_sheep`** (giver: Wren) — visit rooms 281, 285, 288. Reward: 700g, 750 XP, +25 Wren relationship, **+3 replicant affinity**.
- **`orphans_in_the_machine`** (giver: Wren) — visit room_290 (Mother's Sanctum). Reward: 1000g, 1200 XP, +35 Wren relationship, **+2 replicant affinity**.

### Admin shortcuts

```
transurf 290            # Mother of Orphans' Sanctum
# Test affinity payouts:
admin_score YourName    # see affinity.replicant counter
```

---

## Zone 10 — Heat Death Datacentre (rooms 291-300)

**Pitch:** The capstone arc. A datacenter that's been left running too long. Ghost racks. Failing UPS units. The Final Console. SYSADMIN.EXE — Nomagio's rogue auto-scaler — has paged itself awake at the heart of it.

### Rooms

| Room | Name | Notes |
|---|---|---|
| 291 | The Last Breaker | Entry |
| 292 | Service Tunnel Down | |
| 293 | Ghost Rack Alley | |
| 294 | The Dying UPS Hall | |
| 295 | The Graveyard Of Hard Drives | |
| 296 | Emergency Lighting Grid | |
| 297 | Cold Storage | |
| 298 | Administrator's Terminal Room | |
| 299 | The Final Console | |
| 300 | SYSADMIN.EXE's Core | **Capstone boss room** |

### Monsters

`memory_leak_wraith`, `data_ghost`, `security_subroutine`, `cron_daemon` (L27, spawned only by SYSADMIN.EXE).

### Boss: SYSADMIN.EXE (room_300)

**L30 / 3500 HP / 120 STR / data damage / `harmonic 75 / data -25`. The Neo Kyoto capstone.**

Nomagio's rogue auto-scaler. Drops **SYSADMIN.EXE's Root Key** (Legendary).

#### Three-phase fight

- **Phase 1 (HP > 66%):** straight fight. Hits hard but no special mechanics.
- **Phase 2 (HP ≤ 66%):** **AUTOSCALER ENGAGED.** A `cron_daemon` (L27, 300 HP, 72 STR) forks into the room. Then **every 10 seconds** (real-time, via `setInterval`), another cron_daemon spawns. The interval timer is keyed to the boss; when SYSADMIN dies, the timer clears.
- **Phase 3 (HP ≤ 33%):** **PAGING ONCALL.** Applies `effects.paged_oncall` to the player for 120 seconds. The next 2 spell casts have a **50% chance of returning a 503 error** (the cast fails, mana refunded, no effect).

#### Strategy notes

- **Don't let cron_daemons accumulate.** Phase 2 will swarm a slow player. AOE damage is the meta.
- **Phase 3 is mana-attrition.** Save mana potions for this phase. 503 errors don't consume mana but waste time.
- The boss is **physically resistant to harmonic** (the Tuning Fork meta) at 75. Bring data weapons or accept slow damage.
- The `cron_daemon`s themselves are also resistant to harmonic. Same problem.

### Quest

- **`paging_oncall`** (giver: Barkeep 42) — defeat SYSADMIN.EXE. Reward: 5000g, 8000 XP, **+50 Barkeep relationship**, **suffix "the Arbiter"**, **+250 quest points**.

### Why this matters

Defeating SYSADMIN.EXE completes `paging_oncall`. Completing `paging_oncall` is **half** the gate to Severance Layer Theta (the other half is `minRemortTier: 2`). Players who clear Neo Kyoto are 50% of the way to Tier 6.

The room_300 → room_301 transition also broadcasts a 47%-corrupted distress transmission from "Nomagio" on "Server 3 / Severance Layer Theta" — *"the shuttle terminal will know when you are ready"*. This is the in-game hook into Tier 6.

### Admin shortcuts

```
transurf 300            # SYSADMIN.EXE's Core
# Spawn extra cron_daemons to test multi-add fights:
spawn cron_daemon 300

# To run paging_oncall completion without grinding through the fight:
god_mode                # take no damage
# Then attack normally; god_mode keeps you alive while the boss dies.

# To re-kill SYSADMIN for the Tier 6 gate:
despawn <sysadmin_id>   # find via `monsters`
spawn sysadmin_exe 300  # respawn
```

---

## 14. Boss compendium

Sorted by encounter order on the canonical journey.

| Order | Boss | Room | L | HP | STR | Damage type | Drop | Mechanic |
|---|---|---|---|---|---|---|---|---|
| 1 | Chiyo-7 | 220 | 18 | 1300 | 60 | physical | Chiyo-7's Expired Cert | **50% HP → cert expires; 1.5x speed but 0 damage.** |
| 2 | The Account Manager | 230 | 20 | 1600 | 70 | physical | Managerial Letter of Recommendation | **Spawns Junior Associate adds every 3 rounds; +10% damage per live add.** |
| 3 | Babel Fish Regent | 260 | 24 | 2200 | 90 | data | Babel Fish Crown | **Rotates resist schema each round** (random of 5 types). |
| 4 | The Deep Pool | 270 | 26 | 2500 | 95 | data | Deep-Pool Pearl | **Drains 25-44 mana per round; 0 damage while mana > 0; +50% damage when mana = 0.** |
| 5 | SYSADMIN.EXE | 300 | 30 | 3500 | 120 | data | SYSADMIN.EXE's Root Key | **3-phase capstone:** Phase 2 (66% HP) — cron_daemons spawn every 10s. Phase 3 (33% HP) — `paged_oncall`, 50% spell-fail on next 2 casts. |

**All 5 Neo Kyoto bosses share resists:** `harmonic +75, data -25`. Harmonic-damage builds (Tuning Fork, Drum-Stave) struggle here. Data-damage weapons (Segfault Cleaver, Server-Cleaved Blade) shine. Mixed-loadout is optimal.

**Boss signatures live in `mud_server.js::BOSS_SIGNATURES`** — search for the templateId to see the exact mechanic code.

---

## 15. Quest list

All Neo Kyoto quests, grouped by giver. Givers are NPCs with persistent LLM brains in `npcs/brains/`.

### Barkeep 42 (room_276 — Midnight Market)

| Quest | Objective | Reward |
|---|---|---|
| `the_cold_aisle` | Recover `deleted_memory` from room_231 | 800g, 800 XP, +30 rel |
| `babel_fish_problem` | Defeat Babel Fish Regent | 1500g, 2000 XP, +40 rel |
| `paging_oncall` | Defeat SYSADMIN.EXE | 5000g, 8000 XP, +50 rel, **suffix "the Arbiter"**, +250 QP |

### Hiro (room ~213 — Replicant Buskers Corner)

| Quest | Objective | Reward |
|---|---|---|
| `neon_lit_debts` | Defeat 5 `bazaar_cutpurse` | 350g, 400 XP, +20 rel, **+1 hack skill** |

### Ms. Takamura (Corporate Spires NPC)

| Quest | Objective | Reward |
|---|---|---|
| `performance_review` | Recover 3 `escalation_token` | 600g, 600 XP, +25 rel, **+3 human affinity** |

### Terminal Officer Koma (room_201 area)

| Quest | Objective | Reward |
|---|---|---|
| `welcome_to_the_farm` | Visit rooms 202, 205, 210 | 200g, 250 XP, +15 rel |

### Wren (Replicant Quarter)

| Quest | Objective | Reward |
|---|---|---|
| `dreams_of_sheep` | Visit rooms 281, 285, 288 | 700g, 750 XP, +25 rel, **+3 replicant affinity** |
| `orphans_in_the_machine` | Visit room_290 | 1000g, 1200 XP, +35 rel, **+2 replicant affinity** |

### Nomagio's Apprentice (cross-realm; Eldoria-side initially)

| Quest | Objective | Reward |
|---|---|---|
| `flickering_rune` | Retrieve `flickering_rune_fragment` | 50g, 30 XP, +15 rel |
| `collect_five_instruments` | Five Eldoria instrument boss drops (drum, harp, trumpet, lute, flute) | 2000g, 5000 XP, +50 rel, **suffix "the Symphonist"** |

### Quest progression order (recommended)

1. `welcome_to_the_farm` (Koma) — orientation
2. `the_cold_aisle` (Barkeep 42) — first dungeon visit
3. `neon_lit_debts` + `performance_review` — gain affinity, hack skill
4. `dreams_of_sheep` + `orphans_in_the_machine` — Replicant Quarter
5. `babel_fish_problem` (Barkeep 42) — first capstone-tier boss
6. `paging_oncall` (Barkeep 42) — final boss, gate to Tier 6

---

## 16. Replicant / Human affinity axis

Neo Kyoto introduces a **two-axis affinity system** that other realms don't use:

```js
player.affinity = { replicant: 0, human: 0 }
```

Affinity is awarded by quest rewards (see §15) and is **purely additive** — there's no opposing pull. A player can max both axes if they grind every quest.

### Achievement thresholds

- **`electric_sheep`** — `affinity.replicant >= 10`
- **`more_human_than_human`** — `affinity.human >= 10`

### Where it's read

`player.affinity.replicant` and `player.affinity.human` are stored on the save file (`Object.assign({ replicant: 0, human: 0 }, data.affinity || {})`). They feed achievement unlocks and a few flavor checks. **Tier 4 onwards uses these counters in NPC dialogue gating** (LLM brains see them in their context).

### Admin shortcuts

```
# No direct admin command; edit save file.
# In players/<name>.json:
{
  "affinity": { "replicant": 12, "human": 12 }
}
# Reload character (quit + login) to refresh.
```

---

## 17. Admin command reference

Same set as Tier 6 (see `ADMIN_GUIDE_TIER6.md` §14 for the canonical list). Neo-Kyoto-relevant subset:

### World shortcuts (Neo Kyoto specific)

| Command | Purpose |
|---|---|
| `transurf 201` | Arrivals Concourse |
| `transurf 220` | Chiyo-7 (Certificate Graveyard) |
| `transurf 230` | Account Manager's Office |
| `transurf 260` | Babel Fish Regent's Throne |
| `transurf 270` | The Deep Pool |
| `transurf 276` | Barkeep 42's Tavern (quest hub) |
| `transurf 300` | SYSADMIN.EXE's Core (capstone) |

### Spawn shortcuts

```
spawn chiyo_7 220               # respawn capstone bosses
spawn account_manager 230
spawn babel_fish_regent 260
spawn deep_pool 270
spawn sysadmin_exe 300

spawn corporate_enforcer 222    # mid-tier mob in any room
spawn data_ghost 234
spawn memory_leak_wraith 240    # toughest L22 mob

spawn cron_daemon 300           # add-trigger for SYSADMIN test
spawn junior_associate 230      # add for Account Manager test
```

### Item creation

```
create_item tuning_fork 201           # canonical NK starter weapon
create_item drum_stave 211
create_item segfault_cleaver 240      # mid-tier data weapon
create_item admin_cola 275            # mana-restore consumable
create_item chrome_plating 214        # L22 armor
create_item replicant_vow_ring 284    # crafting component
```

---

## 18. Save-priming for speedruns

Saves live at `players/<lowercase-name>.json`. Edit while server is running; reload via player quit+login.

### Skip realm gate (for testing pre-remort entry)

There is no admin command, but you can edit the save file:

```json
"remortTier": 1
```

Then `room_100 → room_201` works for that character without `transurf`.

### Pre-complete the Tier 6 gate

To make a player ready for `transurf 301` to work as a non-admin (without grinding paging_oncall):

```json
"remortTier": 2,
"questsCompleted": ["paging_oncall"]
```

**BUT — questsCompleted is NOT in the save file.** Quest state is in-memory in `questManager`. To pre-complete a quest, the cleanest path is to actually run the kill (use `god_mode` + `transurf 300` + attack normally) or hand-edit the questManager's in-memory state from the running server (no admin command for this; restart loses it).

For pure speedrun testing, the playthrough harness `_playthrough_tier6.js` shows the full priming pattern.

### Pre-set affinity

```json
"affinity": { "replicant": 12, "human": 12 }
```

Unlocks both achievements (`electric_sheep`, `more_human_than_human`) on next achievement check.

### Pre-set hack skill

```json
"skills": { "weaponsmith": 0, "enchanter": 0, "alchemist": 0, "hack": 5 }
```

Hack skill comes from `neon_lit_debts` (+1 per completion). Caps at... whatever you set it to in JSON; the game doesn't strictly cap it.

---

## 19. Secrets & gotchas

### Chiyo-7's mercy

Past 50% HP, Chiyo-7's hits literally do **0 damage** by design (`damageMultiplier: () => 0`). This is intentional — narratively she's authenticating with an expired certificate. **Don't tell players.** Let them realize they're invulnerable themselves and roleplay accordingly.

### The Account Manager is a DPS race

If your DPS is high enough to drop her below 50% before round 3 hits, **she never spawns adds**. Burst-DPS builds completely trivialise this fight. Slow steady builds get punished.

### Babel Fish schema RNG

The schema rotation uses `Math.random()` — there's no seed control. A player can get unlucky and roll the same schema three rounds in a row. Admins observing an "unfair" fight should check if it's just RNG.

### The Deep Pool can soft-lock low-mana classes

A character who enters the Deep Pool fight with 0 mana (or no mana stat at all in some legacy builds) skips Phase 1 entirely and gets +50% damage from round 1. **This is harder than the fight is supposed to be.** If a Tier-1 player complains the Pool is impossible, it's because they're a warrior. Tell them to bring mana potions.

### SYSADMIN.EXE's cron timer

Phase 2's `setInterval(spawnAdds, 10000)` is keyed to the boss's monster ID. **If the boss is despawned via admin, the interval is NOT cleared automatically.** You'll see `cron_daemon`s spawn into an empty room every 10 seconds until the next world reset. Workaround: kill the boss (despawn doesn't clear, but kill via `handleMonsterDeath` does).

### Paging Oncall completion must be on the killing-blow player

The quest objective is `monster_kill: sysadmin_exe`. If multiple players are in the room and one lands the killing blow, **only that player** gets credit. The rest finish at "1/1 ... almost." For group runs, decide upfront who's getting the kill credit.

### The Tier 6 hook fires at room_300

Walking room_300 → room_301 (the shuttle) triggers the corrupted-Nomagio distress transmission. This fires **regardless** of whether the player has the prerequisites — but the realm gate refuses entry. Result: a player with neither remortTier 2 nor paging_oncall sees the transmission, then gets stopped at the door. Intentional teaser.

### "the Arbiter" suffix

Completing `paging_oncall` grants the **suffix "the Arbiter"**. Suffixes show in `who`, `look`, combat broadcasts, and chat. Player can override their suffix later via the `suffix` admin command if you want to clear it for testing.

### Resistance recap (don't forget)

Every Neo Kyoto monster and boss has `resists: { harmonic: 75, data: -25 }`. Harmonic damage is the WRONG meta on this layer. **Tell new admins this once and for all.** Eldoria's harmonic-spike builds (Tuning Fork, Drum-Stave) drop to ~25% effectiveness here. Switch to data weapons.

### `tier3_data_blade` and `tier3_quarter_walker_boots` are QP rewards

These are post-cycle rewards: completing Neo Kyoto in a previous cycle and remorting unlocks them at Nomagio's Repository (Eldoria-side) for QP redemption. They're tier-gated (`tierReq: 1`) so non-remorted characters can't equip them even with admin gifting.

### The hack skill matters at the Street Hacker Bench

Room_215 has a flavor interaction that gates on `player.skills.hack`. High enough hack score unlocks a small narrative payoff. Mostly cosmetic, but the `neon_lit_debts` quest exists to bootstrap this.

### Replicant Quarter monsters are sparse

By design — the zone is meant to feel quiet. Don't `spawn` heavy mobs in there for testing combat; you'll break the atmosphere. Use Stack rooms (231-240) instead.

---

## 20. Troubleshooting

### *"A polite hand stops you at the service door."*

- Player has `remortTier < 1`. They need to remort first, OR you need to admin-bypass via `transurf 201`.

### *"That location does not exist in the Shattered Realms."*

- Bad room number for `transurf`. Neo Kyoto is rooms 201-300; Tier 6 is 301-400. Don't transurf above 400.

### Boss doesn't respawn after kill

- Bosses respawn on **world reset** (cycle reset). Check timer with `time` (player command) or `admin status`.
- To force respawn manually: `spawn <bossTemplateId> <room#>`.

### Cron_daemon spawns won't stop

- SYSADMIN.EXE's Phase 2 timer is still running. Find the boss via `monsters`, then either:
  - Kill the boss (proper way; `handleMonsterDeath` clears the timer).
  - Restart the server (nukes all timers).
- `despawn` does NOT clear the cron interval — known issue.

### Player completes `paging_oncall` but room_300 → room_301 still refused

- They also need `remortTier >= 2`. The Tier 6 gate has BOTH conditions. Admin-prime via save edit (`"remortTier": 2`).

### "Performance review" quest reward says +3 human affinity but the counter doesn't move

- Confirm `player.affinity.human` exists on the save (back-compat default is 0). Old saves missing the field get it back-filled at load time.
- `admin_score <player>` shows the current counter.

### Babel Fish Regent feels too easy / too hard

- Schema rotation is RNG. There's no balance lever per-fight. If a player consistently rolls bad schemas, they either get lucky next round or they grind it out.

### Player's `paging_oncall` is stuck at 0/1 even though they killed SYSADMIN

- Confirm THEY landed the killing blow. Group fights credit only the KB player.
- If they did, check `admin_score` for active quest state. If the quest isn't listed as active, they may have abandoned it; have them re-talk to Barkeep 42 (room_276).

---

## 21. Going-live checklist

Before opening Neo Kyoto to live players:

- [ ] `node -c mud_server.js` passes.
- [ ] Boss fixed-rooms are populated: `monsters` should show chiyo_7, account_manager, babel_fish_regent, deep_pool, sysadmin_exe at 220/230/260/270/300 respectively after `initializeMonsters`.
- [ ] All 5 NK NPCs have brain files: `barkeep_42.json`, `hiro.json`, `ms_takamura.json`, `terminal_officer_koma.json`, `wren.json` (plus `lyssara_echo.json`, `nomagio_apprentice.json`).
- [ ] Realm gate at room_201 is operative (`isRealmGateOpen` test or admin walks room_100 → room_201 as a non-remorted character to confirm refusal).
- [ ] Cycle timer is enabled (or disabled, per your preference; `disable_reset` for stable launch night).
- [ ] At least one admin online during launch in case of `kick`/`shutdown`/`force_reset` need.
- [ ] Tail `admin_log.txt` and the server stdout in your live ops window.

Live-ops cadence:

- Boss respawns on cycle reset. Default cycle is 1 hour. Players who want a re-run should wait or ask an admin.
- The Heat Death Datacentre (291-300) is **the busiest zone** during a populated cycle — many players converge on the capstone. Watch for player griefing of SYSADMIN's cron_daemons.
- The Replicant Quarter (281-290) is the **quietest zone** by design. Don't be alarmed if it's empty.

If something breaks: take notes, don't restart immediately. The state is recoverable via save backups (each save creates `<name>.json.bak` first). When in doubt, `save_all`, then `shutdown` cleanly.

Welcome to Neo Kyoto. Page oncall responsibly.
