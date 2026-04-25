# Neo Kyoto Capstone Manual — Tier 3.1 Phase 8

*The seal. QP shop additions, themed campaign mode, capstone-quest QP bonus, and a single new dialogue beat that opens a bottle that has been waiting eight years. Phase 8 is small surface area on purpose — it ties together what Phases 1-7 already built into a closed meta-progression loop.*

---

## What Phase 8 actually closes

The original plan said: *"Seal in the meta-progression loop."* The loop, in practice, is this:

```
Eldoria → remort → Neo Kyoto → kill SYSADMIN.EXE → earn QP →
spend at Repository → return to either realm with new gear/cosmetics →
remort again or run another cycle
```

Before Phase 8, this loop existed but didn't *complete*. The QP store had no Neo Kyoto-specific cosmetics, themed campaigns weren't a thing, and the capstone quest paid out level-appropriate XP/gold but not enough QP to feel like a meta-progression beat. After Phase 8, all four of those gaps close.

---

## QP shop — 4 new entries in Nomagio's Repository

`redeem` at `room_001` (Eldoria-side) shows the full Repository. Phase 8 adds:

| ID | Cost | Kind | What it does |
| :-- | :-- | :-- | :-- |
| `boarding_pass_keepsake` | 500 QP | aura | Suffix: *"of the Two Servers"* — cosmetic confirmation that you've crossed |
| `tier3_data_blade` | 3000 QP | gear | Server-Cleaved Blade (weapon, Data, dmg+55, lvl 25, **tierReq 1**) |
| `tier3_quarter_walker_boots` | 3500 QP | gear | Quarter-Walker Boots (feet, +6 armor, +data 15, lvl 22, **tierReq 1**) |
| `affinity_reset_token` | 2500 QP | affinity_reset | Zeroes out your Replicant/Human meter, **once per cycle** |

### Cost philosophy

Pricing assumes **a single SYSADMIN.EXE kill yields ~300 QP** (capstone bonus + first-boss QP + quest reward). Two-three Neo Kyoto runs gets you boots. A full clear of the realm in a cycle gets you both gear pieces. The cosmetic aura is one short campaign away. The reset token is gated more by the per-cycle cap than by cost — if you blow a path and want to switch, the cycle wait is the real friction, not the QP.

### The cosmetic — Aura: of the Two Servers

A pure flex item. Applies the suffix `of the Two Servers` to the player's display name. Visible in `who`, room listings, combat broadcasts, the works. Mechanically does nothing. Narratively confirms you've walked both realms — a bragging right that costs less than a Loyal Spirit pet egg.

### Tier-3 gear — what you actually want

Two pieces, both `tierReq: 1` so they only equip post-remort (which is the only audience Neo Kyoto serves anyway).

#### Server-Cleaved Blade — `tier3_data_blade` (3000 QP)

A two-handed Data weapon at lvl 25, dmg+55. Identical raw damage to Segfault Cleaver (the L26 craftable) but available without farming the bytecode shards and without rolling crafting RNG. The QP path is the convenience path; the craft path is the cheap path. Both lead to the same number on the damage line.

> *"Reforged from a fragment of SYSADMIN.EXE's outer casing. Hums faintly with the tone of a cooling rack."*

#### Quarter-Walker Boots — `tier3_quarter_walker_boots` (3500 QP)

Feet slot, +6 armor, +15 data resist. The **only feet item with data resist** in the realm. Stacks with mesh_jacket / chrome_plating / faraday_hood / ICE deflector / data-ward amulet for a total ~85% data resist build — required tuning for the SYSADMIN.EXE phase 3 bleed.

> *"They have walked the realm so often that the realm now politely steps aside for them."*

### The affinity reset token

Zeroes your Replicant/Human meter back to 0/0 instantly. Costs 2500 QP and the token can only be redeemed **once per world-reset cycle** (1 hour). The cap exists so a player can't oscillate within a single play session — if you commit to a path, you have to commit at least until the next cycle wraps.

**Implementation note:** uses a new `kind: 'affinity_reset'` in `NOMAGIO_REPOSITORY` and a `Map<playerName, lastResetTimestamp>` to track per-cycle usage. The cap resets implicitly when `cycleStartTime` advances (handled by the existing world-reset machinery).

```
You have already redeemed an Affinity Reset Token this cycle.
Wait until the next world reset.
```

If you somehow have R=0 H=0 already (un-affined character), the token refuses to charge:

```
Your affinity is already at zero. The token would do nothing.
```

---

## Themed campaign — `campaign neo_kyoto`

The existing campaign system (Tier 2.1) randomly selects level-appropriate monster targets. Phase 8 adds a `theme` parameter so a player can request a Neo Kyoto-only campaign roster.

### Command

```
campaign start              random level-range targets (existing behavior)
campaign neo_kyoto          NK-only targets (new)
campaign start neo_kyoto    same as above (alias)
```

### Mechanics

- **Gate:** requires `remortTier >= 1`. Pre-remort players can't start a NK-themed campaign even if their level is in range, because they can't enter Neo Kyoto to fulfill it.
- **Target pool:** drawn exclusively from a fixed set of 26 Neo Kyoto template IDs (`NEO_KYOTO_TEMPLATE_IDS` in `mud_server.js`). Same level-range filtering as standard campaigns.
- **Reward bonus:** themed campaign completion grants **+50% QP, XP, and gold** vs. standard. So a level-25 character standard-completes for ~300 QP / 6250 XP / 1250g, and NK-themed-completes for ~450 QP / 9375 XP / 1875g.

### Why themed at all

Two reasons:
1. **Player choice in farming.** A standard campaign at L25 might pull mostly Eldoria 2.0 mobs (which the player can no longer be in the same room as without a long walk back through the realm). A themed campaign keeps the run inside whichever realm the player is currently in.
2. **Reward gradient for the harder content.** Neo Kyoto mobs have realm resists (harmonic 75% / data -25%). They're harder to hit with non-Data weapons. The +50% bonus pays for the friction.

### Narrative flavor

Standard campaign trigger: *"A voice whispers: slay these foes for Nomagio's favour."*

NK-themed campaign trigger:
```
=== New Campaign: Neo Kyoto Specialist ===
42 wipes a glass and pushes a list across the bar. Every face on it is in Server 2.
```

Completion broadcast: `*** NEO KYOTO CAMPAIGN COMPLETE ***` plus the bonus tag `(+50% theme bonus)`.

---

## The Capstone Seal — `paging_oncall` quest reward

The capstone quest already granted: `gold 5000, xp 8000, relationship 50, suffix "the Arbiter"`. Phase 8 adds **`questPoints: 250`** to that reward block and surfaces the QP gain in the post-completion display.

This puts SYSADMIN.EXE on parity with — and slightly above — a major Eldoria boss for QP yield:

| Source | QP yield |
| :-- | :-- |
| Standard boss kill (first time) | +5 QP |
| Standard campaign (L25) | +300 QP |
| **Neo Kyoto themed campaign (L25)** | **+450 QP** |
| **`paging_oncall` capstone reward** | **+250 QP** |

Combined: a single cycle that runs the full questline + a NK campaign nets ~700 QP. Two cycles gets you Quarter-Walker Boots. Three cycles affords the Server-Cleaved Blade. The intentional pacing keeps the QP economy meaningful without making any single cosmetic feel out of reach.

Generic `r.questPoints` field added to `awardQuestRewards` — any quest can now declare a QP payout. `paging_oncall` is the first to use it; future quests can plug in without engine changes.

---

## The Bottle Beat — 42's post-capstone dialogue

A new `fallbackLine` added to Barkeep 42's NPC template. It will surface naturally in conversations after the capstone (the LLM has the full context — *"audit is closed, bottle is open"* — and will weight it heavily once the player's relationship score with 42 reflects the capstone turn-in):

```
*reaches under the bar without looking, slides out the bottle marked
'L.P. — ENJOY WHEN SHE GETS BACK.'*
I owe you for what happened in the datacentre, traveller.
The audit is closed. The bottle is open.
*pours two glasses, slides one across*
This one's been waiting eight years.
I'm not going to make it wait any longer.
```

This is the realm's emotional close. The Eldoria capstone was a triumphant chord struck by five instruments at once. The Neo Kyoto capstone is one tired bartender pouring two glasses. Different register, same weight.

---

## Files touched in Phase 8

- **`items.json`**:
  - 2 new entries in `qp_gear`: `tier3_data_blade`, `tier3_quarter_walker_boots`
- **`mud_server.js`**:
  - 4 new entries in `NOMAGIO_REPOSITORY`: aura, two gear, affinity-reset
  - New `kind: 'affinity_reset'` handler in `handleRedeem`, with per-cycle cap via `affinityResetUses` Map
  - `pickCampaignTargets(playerLevel, theme)` accepts an optional theme filter
  - `NEO_KYOTO_TEMPLATE_IDS` Set (26 IDs) for the NK theme
  - `handleCampaign` accepts `neo_kyoto` / `start neo_kyoto`, gates on remortTier, sets `player.campaign.theme`
  - `completeCampaign` reads the theme, applies +50% multiplier, switches header text
  - `awardQuestRewards` honors `r.questPoints` and surfaces it in the readout
- **`quests.json`**:
  - `paging_oncall.rewards.questPoints = 250`
- **`npcs/templates.json`**:
  - 4th `fallbackLine` added to Barkeep 42 — the bottle-opening beat

No new commands, no engine refactors. Phase 8 was almost entirely additive content + one `theme` parameter — the smallest phase by code volume, but it closes the meta-progression loop that the prior seven phases were building toward.

---

## Phase 8 verification

| Test | Result |
| :-- | :-- |
| JSON parse — `items.json`, `quests.json`, `npcs/templates.json` | OK |
| 2 tier-3 gear items registered | OK |
| 4 new `NOMAGIO_REPOSITORY` entries (aura, 2 gear, reset token) | OK |
| `affinity_reset` handler, per-cycle cap via `affinityResetUses` | wired |
| `NEO_KYOTO_TEMPLATE_IDS` Set with 26 IDs | OK |
| `themeMult` applied in `completeCampaign` | OK |
| `r.questPoints` payout wired in `awardQuestRewards` | OK |
| `paging_oncall.rewards.questPoints = 250` | OK |
| Barkeep 42's bottle-opening fallback line added | OK |
| Server boots — 10 NPCs, 13 quests, 14 bosses, ~200 monsters, 95 items, 301 rooms | OK |

**Status:** Phase 8 sealed. Tier 3.1 plan complete.

---

## Tier 3.1 — final scoreboard

| Phase | Topic | Status |
| :-- | :-- | :-- |
| Phase 1 | Scaffold (rooms, exits, gate, zone tags) | DONE |
| Phase 2 | Monsters + items + Data damage type | DONE |
| Phase 3 | 5 bosses + signature mechanics + transmission hook | DONE |
| Phase 4 | Shops + crafting + pets | DONE |
| Phase 5 | Quests + NPCs + dialogue + easter egg | DONE |
| Phase 6 | Hack skill + Affinity system | DONE |
| Phase 7 | Achievements + bestiary + help + map polish | DONE |
| **Phase 8** | **QP shop + campaign integration + capstone seal** | **DONE** |

**Tier 3.1 — Neo Kyoto: COMPLETE.**

---

## What Neo Kyoto looks like, finished

By the numbers:

- **100 rooms** (201-300) across **10 zones**
- **26 monster templates** + **5 named bosses** with signature mechanics
- **40+ items** including 10 Data weapons, 8 armor pieces, 4 shields, 6 consumables, 18 treasure/quest items, 5 boss drops
- **3 shops** with 34 stocked items between them
- **6 craftable recipes** (now 7 with `segfault_cleaver` from Phase 7)
- **3 pet eggs** in the Repository (1500 QP each)
- **8 quests** in a structured 4-arc narrative — *the Echo of Lyssara*
- **6 NPCs** with full backstories and LLM-driven dialogue
- **1 easter egg** (Apprentice's Tuning Fork, signed L.P.)
- **5 hackable terminals** at DCs 8-18
- **2-axis affinity system** (Replicant / Human) gating dialogue, gear, and three quest paths
- **10 Phase-7 achievements** plus title rewards
- **15 in-game help topics** under "Neo Kyoto" category
- **4 Phase-8 QP redemptions** including the capstone gear set
- **1 themed campaign mode** with +50% reward multiplier
- **1 final transmission** from Server 3 (Phase 7+ hook) when SYSADMIN.EXE dies

By the document trail (this folder):

- `Beasts of Neo Kyoto.md` — bestiary
- `Neo Kyoto Boss Manual.md` — boss mechanics
- `Neo Kyoto Economy Manual.md` — shops, recipes, pets
- `Neo Kyoto Narrative Manual.md` — story arc, NPCs, easter egg
- `Neo Kyoto Systems Manual.md` — hack and affinity systems
- `Neo Kyoto QoL Manual.md` — achievements, bestiary fix, help, map
- **`Neo Kyoto Capstone Manual.md`** *(this document)* — QP, campaigns, the seal

---

## What's next (genuinely)

The Tier 3.1 plan is complete. **Server 3 — Severance Layer Theta** is the open canvas, telegraphed by Nomagio's distress transmission on SYSADMIN.EXE death. The transmission is intentionally at 47% packet integrity:

> *"I am writing from Server 3. The Severance Layer. I came here some cycles ago to ----- [REDACTED] ----- and what I found is worse than the Sundering ever was. The hardware is failing. The processes are not. They are screaming, in a language I taught them, and I cannot turn it off. I need ---- [PACKET LOSS] ----."*

The infrastructure is in place: `REALM_GATES`, multi-zone monsters.json, a proven NPC LLM system with persistent brains, the affinity meter as a template for any new factional split, a `BOSS_SIGNATURES` hook table that absorbs whatever new mechanics a Severance boss needs, and a closed meta-progression loop that lets a third realm hang off the same QP economy.

When you're ready to build Server 3, the doors are unlocked.

---

*Document revision: Tier 3.1 Phase 8 — final. The audit is closed. The bottle is open. The transmission is waiting.*
