# The Shattered Realms — Level 16-30 Progression Guide

The progression system now runs from **Level 1 (Novice Seeker)** to **Level 30 (The First Admin)**. Levels 1-15 are unchanged. Levels 16-30 represent the transition from *mage* to *Coder/Admin* — the lore tier above the Archmages, where spells give way to raw manipulation of the world's source.

---

## Level Table (Levels 16-30)

| Lvl | Title | XP Threshold | HP | Damage | Mana |
|---:|---|---:|---:|---|---:|
| 16 | Code-Reader | 15,000 | 490 | 43-64 | 240 |
| 17 | Glitch-Walker | 18,000 | 535 | 46-68 | 255 |
| 18 | Syntax Adept | 21,500 | 585 | 50-73 | 270 |
| 19 | Reality-Patcher | 25,500 | 640 | 54-78 | 285 |
| 20 | Resonance Binder | 30,000 | 700 | 58-84 | 300 |
| 21 | Variable Shaper | 35,500 | 760 | 62-90 | 315 |
| 22 | Memory Warden | 42,000 | 820 | 66-96 | 330 |
| 23 | Paradox Master | 50,000 | 880 | 70-102 | 345 |
| 24 | Null-Speaker | 60,000 | 940 | 74-108 | 360 |
| 25 | Echo of Nyxara | 72,000 | 1,000 | 78-114 | 375 |
| 26 | Unwritten Sage | 86,000 | 1,060 | 82-120 | 390 |
| 27 | Keeper of the Symphony | 102,000 | 1,120 | 86-126 | 405 |
| 28 | Cursor-Bearer | 122,000 | 1,180 | 90-134 | 420 |
| 29 | Peer of Nomagio | 145,000 | 1,240 | 95-142 | 435 |
| 30 | The First Admin | 175,000 | 1,350 | 100-150 | 450 |

Mana = `level × 15` and auto-regenerates 5 + floor(level/3) per 30-second tick.

---

## New Spells (Cast via `cast <spell> [target]`)

All new spells are listed by the `spells` command once you meet the level requirement.

### Read Code — L16
- **School:** Divination
- **Mana:** 20
- **Cooldown:** 10 s
- **Type:** Info
- **Usage:** `cast read_code <target>`
- Reveals the raw source of a target — monster HP and hidden flags.
- *"You squint at the world and the green text bleeds through!"*

### Patch — L18
- **School:** Utility
- **Mana:** 35
- **Cooldown:** 30 s
- **Type:** Heal (self)
- **Usage:** `cast patch`
- Patches the leaks in your own frame. Heals 140-200 HP.
- *"You run a quick hotfix on your own body!"*

### Resonance Strike — L20
- **School:** Combat
- **Mana:** 50
- **Cooldown:** 60 s
- **Type:** Buff (self)
- **Usage:** `cast resonance_strike`
- Attunes your strike to the Shattered Symphony. **+60% damage for 30 seconds.**
- *"You hum a fragment of the Shattered Symphony!"*

### Shape Variable — L21
- **School:** Combat
- **Mana:** 60
- **Cooldown:** 45 s
- **Type:** Buff (self)
- **Usage:** `cast shape_variable`
- Rewrites one of your own stats mid-fight. **+35% damage for 20 seconds.**
- *"You rewrite one of your own variables on the fly!"*

### Paradox Step — L23
- **School:** Utility
- **Mana:** 40
- **Cooldown:** 300 s (5 min)
- **Type:** Teleport
- **Usage:** `cast paradox_step`
- Step sideways into a contradiction and reappear at the Starting Chamber (`room_001`).
- *"You step sideways into a paradox!"*

### Null Speak — L24
- **School:** Divination
- **Mana:** 30
- **Cooldown:** 15 s
- **Type:** Info
- **Usage:** `cast null_speak <target>`
- Reach past physical distance and probe the null state of a target.
- *"You speak into the null and the null speaks back!"*

### Summon Asset — L27
- **School:** Utility
- **Mana:** 80
- **Cooldown:** 180 s
- **Type:** Summon
- **Usage:** `cast summon_asset <player>`
- Draft a tamed T-Pose NPC from the Graveyard to your side.
- *"You reach into the Asset Graveyard and pull a model free!"*

---

## New Slash Commands (Endgame Abilities)

These are not spells — they are direct commands gated by level. Admin players bypass the level gate.

### `zap <target>` — L25 Echo of Nyxara
Instant-kill a monster or PvP target from anywhere in the realms. A bolt of divine lightning strikes from the heavens. Previously available at L15, now re-gated to L25 as the Echo of Nyxara capstone. Level-locked for non-admin players below L25.

- **Usage:** `zap goblin` or `zap <playername>`
- Works across the whole world (no proximity required).
- Admin use is tracked in `admin_log.txt`.

### `cursor_jump <room_number>` — L28 Cursor-Bearer
Teleport to any room by ID — Cursor-Bearers edit their own position in the world.

- **Usage:** `cursor_jump 58` (jumps to `room_058`)
- **Cooldown:** 10 minutes between jumps.
- **Cycle limit:** 1 use per hourly cycle.
- Blocked during combat.
- Admins bypass both the level gate and the cycle/cooldown restrictions.

### `global_variable_reset [confirm]` — L30 The First Admin
Trigger the hourly world reset **immediately** — the ultimate spell. Only The First Admin holds the root credentials.

- **Step 1:** `global_variable_reset` — prompts for confirmation.
- **Step 2:** `global_variable_reset confirm` — commits the reset. Cycle leaderboard fires, all monsters respawn, all players teleport to the starting chamber at full HP, ground items clear, and cycle stats reset.
- **Cycle limit:** 1 use per cycle (admin-bypassable).
- The purge is announced realm-wide with the caster's name.

---

## New Passive Abilities

Passives unlock automatically on level-up. No command needed.

| Lvl | Passive | Effect |
|---:|---|---|
| 19 | **Extra Inventory** | Inventory capacity rises from 20 → 25 slots. Visible in `inventory` as `Capacity: N/25`. |
| 22 | **Faster Prayer** | Chapel `pray` cooldown shortens from 5 minutes to 3 minutes. |
| 26 | **Forgiven Death** | Death XP penalty halved (10% → 5%). Gold loss unchanged. |
| 29 | **Aggro-Immunity** | Aggressive monsters no longer auto-engage you. The 3-second `DANGER` grace period never fires — you can walk into an aggressive room unchallenged. You can still attack monsters yourself. |

---

## Reference: Cycle-Scoped State

These flags reset at the start of every world cycle (hourly, or when `force_reset` / `global_variable_reset` fires):

- `cursorJumpUsedThisCycle` — re-armed so you can cursor-jump again
- `globalResetUsedThisCycle` — re-armed so you can reset again
- Normal cycle stats: XP/monster/gold tallies, boss defeats, PVP records

Relationship scores, conversation history, and NPC memory **persist** across resets — this is unchanged from the pre-expansion system.

---

## Admin Notes

- `set_level <player> <1-30>` now accepts levels up to 30.
- The welcome banner and admin help reflect the new cap.
- `PORT` respects the `MUD_PORT` environment variable, so multiple server instances can run side-by-side for testing: `MUD_PORT=8889 node mud_server.js`.

---

## Testing Coverage

Verified via scripted TCP clients:

- All 15 new level rows render in `levels` with correct XP/HP/damage.
- `set_level Tester 30` correctly sets title, HP, mana, damage, and XP floor.
- Every new spell fires for qualified players and rejects below `levelRequired` with a clear message.
- `zap`, `cursor_jump`, and `global_variable_reset` all reject non-admin players below their level gates.
- `global_variable_reset` requires `confirm` before executing.
- L19 inventory cap renders as `/25`.
- L22 prayer cooldown shows `Wait 3 more minute(s)` instead of 5.
- L29 aggro-immunity: Crystal Spider fires DANGER at L15, silent at L29.
