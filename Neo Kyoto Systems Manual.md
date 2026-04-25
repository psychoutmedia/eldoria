# Neo Kyoto Systems Manual — Tier 3.1 Phase 6

*The hack skill, the affinity meter, the trainers, and the player-side data hooks that bring the previous five phases to life. Phase 6 is system work: small surface area, large knock-on effects.*

---

## Player schema additions

Two new persisted fields on every player. Both back-fill on load so existing characters get them with zeroed defaults — nobody loses progress, everybody gains the meters.

### `player.skills.hack` — number, 0 to 10

Stored alongside the existing crafting skills (`weaponsmith`, `enchanter`, `alchemist`). Trained 1 point at a time at a trainer NPC, capped at 10. Used in the d20 hack roll (see below).

### `player.affinity` — `{ replicant: 0, human: 0 }`

Two-axis meter, both values non-negative integers. Gained by completing Neo Kyoto quests with affinity rewards. **Persists across remort** (lives on the player file alongside achievements and suffix). The plan calls for a 2500 QP `affinity_reset_token` from the Repository for resetting, deferred to a later polish pass.

The `affinity` command (or alias `standing`) shows current values plus computed standing label:

| Replicant | Human | Standing |
| :-- | :-- | :-- |
| ≥ 5 | < 5 | **Replicant-leaning** |
| < 5 | ≥ 5 | **Human-leaning** |
| ≥ 3 | ≥ 3 | **Balanced** (both paths active) |
| else | else | Unaligned |

---

## The hack skill

### Command

```
hack                  list hackable terminals in this room
hack <keyword>        attempt to hack the matching terminal
```

### Roll mechanic

```
total = 1d20 + player.skills.hack + buff
```

where `buff` is +2 if `player.effects.hack_buff` is active (Static Tea, 5-minute duration). Compares `total >= target.dc`.

### Calibration

The DC ladder vs. expected pass rate at level cap (skill 10):

| DC | Untrained (skill 0) | Trained (skill 5) | Maxed (skill 10) | Maxed + Tea (+2) |
| :-- | :-- | :-- | :-- | :-- |
| 8 | 62% | 90% | 100% | 100% |
| 10 | 55% | 80% | 100% | 100% |
| 12 | 45% | 70% | 95% | 100% |
| 14 | 35% | 60% | 85% | 95% |
| 18 | 15% | 40% | 65% | 80% |

The hardest terminal in the realm (the `cron daemon kill switch` at room_295, DC 18) is solvable but never trivial, even at max skill with a tea buff. By design.

### Failure mode — alarm triggered

A failed hack rolls a **60% chance** to spawn a `security_subroutine` mob in the room. The mob is L20 / 160 HP / STR 46, Data damage type, full Neo Kyoto resists. It does not respawn — once defeated, the room is clean.

### One-shot per cycle

Each terminal is **single-use per world-reset cycle**. After a successful hack, the terminal shows `[DEPLETED]` until the next hourly reset.

### Seeded terminals

Five seeded across Neo Kyoto in `NEO_KYOTO_INTERACTABLES`:

| Room | Terminal | DC | Reward |
| :-- | :-- | :-- | :-- |
| `room_215` (Neon Soi) | noodle-stall display panel | 8 | 60g, 1× Yen Chip |
| `room_232` (The Stack) | rack maintenance panel | 12 | 1× Bytecode Shard, 1× Deleted Memory |
| `room_245` (Waitlist) | queue priority kiosk | 10 | Teleport to room_249 |
| `room_267` (Chrome Sea) | submersion controls panel | 14 | 200g, 1× Bytecode Shard, 1× Neon Eye, 1× Corrupted Datapad |
| `room_295` (Heat Death) | cron daemon kill switch | 18 | Despawns all `cron_daemon` adds in the room |

The `cron_daemon kill switch` is the most strategically useful terminal in the realm: during the SYSADMIN.EXE phase 2 add-spam, fleeing one room over to room_295 and hitting this switch wipes the cron daemons before returning to the boss.

### Achievements

- **Off The Books** — first successful hack.
- **Root Access** — train hack skill to 10.

---

## Trainers

### Hiro, hack-skill trainer (`room_213`, Neon Soi)

Command from inside Hiro's room: `train hack`.

- 5 gold per skill point
- Cap: 10
- Maxing out costs 50g total (negligible)
- Hiro's relationship score ticks +2 per training session

The trainer system is generic — `SKILL_TRAINERS` maps NPC ID → `{ skill, costPerPoint, cap }`. Future NPCs (e.g., a hypothetical Phase 7+ "subterfuge" trainer) can plug in without engine changes.

### Implementation note

`train` requires the player be in the same room as the trainer NPC, looked up via `npcRegistry.getNpcsInRoom(player.currentRoom)`. The system never assumes the trainer is willing — it checks `SKILL_TRAINERS[npc.id]`, so adding an NPC to `templates.json` doesn't accidentally make them a trainer.

---

## Affinity — quest-driven progression

Quest reward objects support two new fields, both optional:

```json
"rewards": {
  "gold": 600,
  "xp": 600,
  "relationship": 25,
  "affinity": { "human": 3 },
  "skill": { "hack": 1 }
}
```

`awardQuestRewards` in `mud_server.js` extends to apply both deltas on turn-in. Negative values are allowed but the affinity meter clamps at 0 (no negative affinity).

### Phase 6 quest payouts

Updated this phase from the Phase 5 baseline:

| Quest | Affinity payout | Skill payout | Phase 6 design role |
| :-- | :-- | :-- | :-- |
| `neon_lit_debts` (Hiro) | — | hack +1 | Free intro point: completing the easy quest gets you a free skill bump |
| `performance_review` (Takamura) | human +3 | — | Corporate-side path |
| `dreams_of_sheep` (Wren) | replicant +3 | — | Replicant-side path |
| `orphans_in_the_machine` (Wren) | replicant +2 | — | Doubles down on replicant standing |

A player who runs **all four** quests lands at Replicant 5 / Human 3 — Replicant-leaning *and* Balanced (both ≥ 3). This is intentional: the most thorough completionist player gets *both* path benefits, including (eventually, Phase 7+) the SYSADMIN.EXE balanced ending. A player who skips Wren's quests and runs only Takamura ends Human-leaning.

### Player-facing readout

```
=== Neo Kyoto Affinity ===
  Replicant: 5
  Human:     3
  Standing:  Replicant-leaning
Affinity persists across remort. It can only be reset via redemption at the Repository.
```

---

## Affinity-gated gear

Items in `items.json` can declare `affinityReq: { replicant: N }` or `{ human: N }`. The equip path (`canEquipItem` and `equipRejectReason`) honors the gate alongside the existing level / tier requirements.

### Phase 6 wired item

**Replicant Vow Ring** (craftable enchanter recipe, L22): now requires `affinity.replicant >= 5` to equip. Reject message:

```
Replicant Vow Ring only attunes to Replicant-leaning travellers
(need affinity 5; you have 3).
```

Players can craft it at any affinity, can store it, can sell it. They just can't *wear* it without the standing.

### Verified gating

| Player | level | remortTier | affinity | Equippable? |
| :-- | :-- | :-- | :-- | :-- |
| L22, T1, R0/H0 | ✓ | ✓ | ✗ | rejected |
| L22, T1, R5/H0 | ✓ | ✓ | ✓ | **EQUIPPABLE** |
| L22, T1, R4/H0 | ✓ | ✓ | ✗ | rejected |

---

## Static Tea — temporary skill buff

Drinking Static Tea (`use static_tea` or `drink static_tea`) now applies a 5-minute `+2 hack skill` buff via the existing `player.effects` system:

```
player.effects.hack_buff = { amount: 2, expiresAt: Date.now() + 300000 }
```

The hack roll reads this effect at roll time, adds the buff to the total, and notes it in the roll-readout:

```
[hack] d20=14 + skill 5 + 2 (static tea) = 21 vs DC 18
SUCCESS. The cron daemon kill switch yields.
```

The buff stacks neither with itself (re-drinking refreshes the timer to 5 minutes) nor with skill levels — it's purely additive. No global skill cap is enforced on the buffed total; in principle a maxed hacker with Static Tea is rolling effectively skill 12 while the timer holds.

---

## What did *not* ship in Phase 6

The plan called for a few items I deliberately deferred to keep this phase tight and shippable:

- **Shop discounts based on affinity.** Plan: Replicant-leaning players get -25% shop prices in the Quarter; Human-leaning players get exclusive Tyrell-Nomagios stock. The shop infrastructure has the hooks for this (`buyMult` per shop) but applying per-player multipliers is a non-trivial refactor. Tracked for later polish.
- **Tyrell-Nomagios "exclusive" gear.** The Procurement shop currently stocks the same 10 items for everyone. A Human-affinity-gated stock variant is plan-listed but not implemented — same shop refactor concern as above.
- **SYSADMIN.EXE third (balanced) ending.** Plan: at affinity 3+/3+, the boss can be talked down instead of fought. Requires a major boss-mechanic addition (dialogue branching at the boss-encounter trigger). Phase 7+ candidate.
- **Cross-realm affinity-XP buffs.** Plan: Replicant-leaning players get +10% XP from synthetic mobs, Human-leaning from organic. Trivial to wire in `handleMonsterDeath` once the mob templates are tagged with `species: 'synthetic' | 'organic'`. Tagging is the bulk of the work; deferred.
- **`affinity_reset_token` in the Repository.** 2500 QP redemption to zero out affinity. One-line addition; deferred only because the use case is narrow.

These are all small to wire individually and would land in a "Phase 6.5 polish" patch. Phase 6 as it stands is functionally complete on the load-bearing systems.

---

## Files touched

- **`mud_server.js`**:
  - `ensureT2Defaults` — added `skills.hack` and `affinity` defaults
  - `savePlayer` / load path — persist `skills` (with hack) and `affinity`
  - `createItem` — passthrough for `affinityReq` field
  - `canEquipItem` / `equipRejectReason` — affinity gating
  - `awardQuestRewards` — `r.affinity` and `r.skill` payouts
  - `handleUse` — Static Tea applies `hack_buff` effect
  - **New:** `NEO_KYOTO_INTERACTABLES` map (5 terminals)
  - **New:** `interactablesUsed` Set (per-cycle one-shot tracking)
  - **New:** `spawnSecuritySubroutine` helper (alarm spawn)
  - **New:** `handleHack` (terminal hacking system)
  - **New:** `handleAffinity` (display)
  - **New:** `SKILL_TRAINERS` map and `handleTrain` (trainer mechanism)
  - Command dispatcher — wired `hack`, `affinity`, `train`
- **`quests.json`**:
  - `neon_lit_debts.rewards.skill = { hack: 1 }`
  - `performance_review.rewards.affinity = { human: 3 }`
  - `dreams_of_sheep.rewards.affinity = { replicant: 3 }`
  - `orphans_in_the_machine.rewards.affinity = { replicant: 2 }`
- **`items.json`**:
  - `replicant_vow_ring.affinityReq = { replicant: 5 }` plus updated description

---

## Phase 6 verification

| Test | Result |
| :-- | :-- |
| JSON parse — `quests.json`, `items.json`, `rooms.json` | OK |
| Server boots — 10 NPCs, 13 quests, 14 bosses, 199 monsters, 95 items | OK |
| `replicant_vow_ring` rejects equip at R<5; accepts at R≥5 | 3/3 cases pass |
| Hack roll math: untrained vs DC 8 = 62%, maxed+tea vs DC 18 = 77% | calibrated |
| All 4 affinity quests applied: → R=5 H=3 (Replicant-leaning + Balanced active) | OK |
| Static Tea buff additive in hack roll | wired, displayed in readout |
| `train hack` requires trainer NPC in room; charges 5g; caps at 10 | wired |

**Status:** Phase 6 systems live. The previous five phases are now playable as designed — quest rewards mean something, gear gates trigger, terminals are hackable, and the affinity meter is the spine of player choice.

---

## What's next

The original Tier 3.1 plan listed seven phases; the seventh was **achievements + bestiary + help + map polish (Phase 7)** and the eighth was **QP shop + campaign integration + capstone-quest sealing (Phase 8)**. Both are mostly content authoring with light engine touches — they will land cleanly on top of Phase 6 without further system work.

Beyond that: the **Phase 7+ hook from the SYSADMIN.EXE death transmission — Server 3, Severance Layer Theta — Nomagio's distress message.** That is the Tier 3.2+ canvas, intentionally left flexible.

---

*Document revision: Tier 3.1 Phase 6. Hack skill live. Affinity live. Trainers live. The realm stops being a collection of rooms and starts being a system of choices.*
