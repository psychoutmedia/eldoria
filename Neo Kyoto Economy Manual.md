# Neo Kyoto Economy Manual — Tier 3.1 Phase 4

*Operator and player notes covering the three Neo Kyoto shops, the six new crafting recipes, and the three new pet eggs in Nomagio's Repository. Phase 4 makes the realm self-sufficient: you can gear up locally without making the Eldoria run for supplies.*

---

## Shops

The MUD's shop system (Tier 1.6) keys shops by `roomId`. Each shop has:

- **`keeper`** — a name displayed in the header.
- **`buyMult`** — multiplier on item base value when you `buy`. 1.0 = base, 1.5 = premium, 0.9 = discount.
- **`sellMult`** — multiplier on item base value when you `sell` (always less than buyMult).
- **`stock`** — array of itemIds. The shop won't sell what's not listed. It will buy anything from your inventory.

Commands: `list`, `buy <item>`, `sell <item>`, `value <item>`.

### 1. Rusty's Chromeshop  (`room_214`, Neon Soi)

**Keeper:** Rusty.
**Pricing:** 1.0× buy, 0.4× sell — fair-prices-no-negotiation tier. The Neon Soi entry shop. Same Rusty energy as the original Eldoria armory; different stock.

| Item | Slot / Type | Lv | Base | Buy price |
| :-- | :-- | :-- | :-- | :-- |
| Stun Baton | weapon (Data) | 16 | 120g | 120g |
| Null-Pointer Dagger | weapon (Data) | 16 | 100g | 100g |
| Packet Sniffer Pistol | weapon (Data) | 17 | 180g | 180g |
| Mesh Jacket | armor (body, +data resist) | 16 | 100g | 100g |
| Faraday Hood | armor (head, +data resist) | 17 | 120g | 120g |
| Synth Boots | armor (feet) | 16 | 80g | 80g |
| Static Buckler | shield | 16 | 90g | 90g |
| Stim-Pak | consumable (+75 HP) | — | 45g | 45g |
| Root Beer | consumable (+50 HP +25 mana) | — | 60g | 60g |

**Use case.** First-stop for a fresh Neo Kyoto arrival. Drops you a complete L16 Data-loadout and starter consumables for under 800 gold. Sells your Eldoria leftovers at half value (40%) so don't cash out anything irreplaceable here.

### 2. Tyrell-Nomagios Procurement  (`room_225`, Corporate Spires)

**Keeper:** Ms. Voss (HR-grade smile, takes credit cards she invents on the spot).
**Pricing:** 1.5× buy, 0.5× sell — premium tier. Worst sell-back in Neo Kyoto, but the only place that stocks the high-end gear.

| Item | Slot / Type | Lv | Base | Buy price |
| :-- | :-- | :-- | :-- | :-- |
| Shock Prod | weapon (Data) | 18 | 240g | 360g |
| Root-Kit Blade | weapon (Data) | 20 | 360g | 540g |
| Kill-Switch Pistol | weapon (Data) | 22 | 480g | 720g |
| ICE-Breaker Rifle | weapon (Data, two-handed) | 25 | 700g | 1050g |
| Chrome Plating | armor (body, +data 15) | 22 | 300g | 450g |
| VR Goggles | armor (head, +mana 15) | 20 | 180g | 270g |
| Encrypted Gloves | armor (hands) | 18 | 140g | 210g |
| Riot Shield | shield | 18 | 200g | 300g |
| ICE Deflector | shield (+data 15) | 24 | 450g | 675g |
| Rollback Ring | armor (finger, +data 10) | 20 | 220g | 330g |

**Use case.** Late-game Neo Kyoto outfitting before the Heat Death Datacentre run. The 50% mark-up stings, but ICE-Breaker Rifle and ICE Deflector are difficult to source from drops alone. Tyrell-Nomagios is also where you take your hard-earned gold to convert into raw stat sticks.

**Stock-wise pre-SYSADMIN.EXE check:**
- ICE-Breaker Rifle (1050g) for the Data damage you need on the boss.
- Chrome Plating + ICE Deflector for the +30% data resist stack.
- Rollback Ring for the +10% data resist top-off.

### 3. The Back Of The Bazaar  (`room_277`, Midnight Market)

**Keeper:** 42 (bartender, fence, footnote enthusiast).
**Pricing:** 0.9× buy, 0.6× sell — discount-buys, generous-resale. Best place to offload Eldoria gear you don't want to drag back home.

| Item | Slot / Type | Lv | Base | Buy price |
| :-- | :-- | :-- | :-- | :-- |
| Compile-Error Rod | weapon (Data, +mana focus) | 23 | 560g | 504g |
| Fork-Bomb Axe | weapon (Data) | 24 | 620g | 558g |
| Segfault Cleaver | weapon (Data, two-handed) | 26 | 780g | 702g |
| Holo-Projector | shield (+data 10) | 20 | 300g | 270g |
| Gecko Grips | armor (feet) | 22 | 200g | 180g |
| Cold Brew | consumable (+120 HP) | — | 80g | 72g |
| Patch Notes Scroll | consumable (+80/+40) | — | 90g | 81g |
| Admin Cola | consumable (+200/+100) | — | 150g | 135g |
| Static Tea | consumable (+40 mana) | — | 35g | 32g |
| **Crafting reagents** | | | | |
| Iron Scrap | crafting | — | 4g | 4g |
| Harmonic Shard | crafting | — | 40g | 36g |
| Mana Petal | crafting | — | 20g | 18g |
| Spring Water | crafting | — | 3g | 3g |
| Herb Bundle | crafting | — | 6g | 6g |
| Ember Core | crafting | — | 25g | 23g |

**Use case.** Three roles in one shop:

1. **Last-stop weapon procurement** — the three top-end Data weapons (Compile-Error Rod, Fork-Bomb Axe, Segfault Cleaver) are 10% off list. If you can grind to L23-26 doing campaigns, this is the cheapest route to BiS.
2. **Crafting reagent counter** — single source for all six common alchemy/smithing reagents at near-base price. Saves you the run back to Eldoria's Singing Merchant for spring water.
3. **Cash-out point** — 0.6× sell mult is the highest in the game. If you want to ditch low-value Eldoria treasure for working capital, do it here.

> *The bazaar's "stock rotates per cycle" line in the original spec is deferred polish — the stock above is static for now. Cycle rotation can be wired later by re-keying `stock` based on cycle ID.*

---

## Crafting recipes

Six new entries in `recipes.json`, slotting into the existing Tier 2.4 crafting system. The skill names (`weaponsmith`, `enchanter`, `alchemist`) match Eldoria recipes; train at the existing skill trainers.

Recipe format: `craft <recipe>` consumes the inputs and produces the output. `recipes` lists what's available at your skill level.

### Weaponsmith

#### `stun_baton` (L16)

| | |
| :-- | :-- |
| Inputs | 2× Iron Scrap, 1× Bytecode Shard |
| Output | Stun Baton (weapon, Data, dmg+18, lv16) |
| Source | iron_scrap from Crystal Caverns; bytecode_shard from Memory Leak Wraith / Chrome Wolf |
| Compared to shop | Shop: 120g. Craft: ~32g of inputs, but Bytecode Shard requires Stack/Kowloon farming |

**Verdict:** craft when you have Bytecode Shards stockpiled; otherwise buy.

#### `ice_breaker_rifle` (L25)

| | |
| :-- | :-- |
| Inputs | 3× Iron Scrap, 2× Neon Eye, 1× Ember Core |
| Output | ICE-Breaker Rifle (weapon, Data, two-handed, dmg+50, lv25) |
| Source | neon_eye from Mercury Kelpie / Black-ICE Basilisk; ember_core from Molten Forges |
| Compared to shop | Shop: 1050g (Tyrell-Nomagios premium). Craft: ~437g of inputs at base value |

**Verdict:** crafting saves 600g but requires Chrome Sea farming. Quest 6 ("The Cold Aisle") supplies the schematic narratively.

### Enchanter

#### `data_ward_amulet` (L20)

| | |
| :-- | :-- |
| Inputs | 1× Traveler's Amulet, 2× Bytecode Shard, 1× Deleted Memory |
| Output | Data-Ward Amulet (neck, +5 armor, +20 data resist, lv20) |
| Source | traveler_amulet starter / Knowledge Seeker drop; bytecode_shard from Stack zones; deleted_memory from Stack/Chrome Sea/Kowloon |
| Notes | No shop sells this; crafting is the only path. |

**Verdict:** mandatory item if you're running Data-heavy content (SYSADMIN.EXE phase 2 cron daemons). Stack with ICE Deflector + Rollback Ring + Chrome Plating for ~60% data resist.

#### `replicant_vow_ring` (L22)

| | |
| :-- | :-- |
| Inputs | 1× Silver Band, 1× Orphan Locket, 1× Dream of Sheep |
| Output | Replicant Vow Ring (finger, +4 armor, +25 max mana, lv22) |
| Source | silver_band starter; orphan_locket and dream_of_sheep from Replicant Quarter / Midnight Market mobs |
| Notes | Currently no affinity gating (the affinity system arrives Phase 6). Anyone meeting the level cap can craft. |

**Verdict:** best ring for caster builds in Neo Kyoto. The +25 max mana is irreplaceable for the Deep Pool fight.

### Alchemist

#### `stim_pak` (L16)

| | |
| :-- | :-- |
| Inputs | 2× Herb Bundle, 1× Spring Water, 1× Ember Core |
| Output | Stim-Pak (consumable, +75 HP) |
| Compared to shop | Shop: 45g. Craft: ~37g inputs |

**Verdict:** marginal — craft when you've got reagent surplus. The shop is fine for the casual case.

#### `static_tea` (L18)

| | |
| :-- | :-- |
| Inputs | 1× Mana Petal, 1× Spring Water, 1× Harmonic Shard |
| Output | Static Tea (consumable, +40 mana) |
| Compared to shop | Shop: 35g. Craft: ~63g inputs |

**Verdict:** **don't craft this.** The shop is straight-up cheaper. The recipe exists for completeness and so that off-realm players (or recipe-hunters) have parity. Static Tea is also flagged in the design doc to grant a "+hack-skill-for-5min" buff in Phase 6 — unimplemented for now.

### Recipe summary table

| Recipe | Skill | Lv | Inputs (cost) | Output value | Net |
| :-- | :-- | :-- | :-- | :-- | :-- |
| stun_baton | weaponsmith | 16 | 32g + bytecode | 120g | +88g |
| ice_breaker_rifle | weaponsmith | 25 | 437g + farm | 700g | +263g |
| data_ward_amulet | enchanter | 20 | 412g + farm | 600g | +188g |
| replicant_vow_ring | enchanter | 22 | 195g + farm | 800g | +605g |
| stim_pak | alchemist | 16 | 37g | 45g | +8g |
| static_tea | alchemist | 18 | 63g | 35g | -28g |

The high-margin recipes (Replicant Vow Ring, ICE-Breaker, Data-Ward Amulet) are the ones designed to be crafted. The others are filler / parity / alternate path.

---

## Pet eggs

Three new entries in Nomagio's Repository (`room_001` Eldoria-side; redeem there with Quest Points). All three at **1500 QP**.

The pet system (Tier 2.3) is realm-agnostic — Neo Kyoto pets work in Eldoria combat and vice-versa. Stats are derived from `level` at hatch via `grantPetFromEgg`:

```
maxHp = 40 + level × 12
str = 6 + level × 2
```

You can keep up to 3 pets total. Only one can be `active` at a time. `pets` lists; `release <name>` discards.

### Pet eggs available

| Egg | Hatch level | maxHP | STR | Cost | Default name |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Street Drone | 8 | 136 | 22 | 1500 QP | Drone |
| Chrome Salamander | 12 | 184 | 30 | 1500 QP | Salamander |
| Pocket AI | 15 | 220 | 36 | 1500 QP | PocketAI |

### Lore notes

#### Street Drone (`templateId: street_drone`)

A boxy quadcopter the size of a cat, salvaged from a delivery service that went under in Q2. It has a single working LED, a half-charged speaker, and a fierce sense of mission. Likes: chases. Dislikes: weather. The cheapest of the three Neo Kyoto pets in stat density, but the most replaceable in spirit — Rusty has a parts bin if it gets shot down.

#### Chrome Salamander (`templateId: chrome_salamander`)

A liquid-metal salamander forged from the runoff of the Chrome Sea. Slow-blinking, surprisingly affectionate, slips between solid and slick depending on mood. Resists fire. Confuses cleaning robots. The mid-tier balanced pet — workable HP and damage; fits most builds.

#### Pocket AI (`templateId: pocket_ai`)

A small black slab of plastic with an LED grid where its face would be. It does not speak. It hums when you do well. Top-of-class stats — L15 hatch is the highest in the QP catalog — and it's the choice for players gearing toward the SYSADMIN.EXE fight where add-control matters most.

### Compared to existing eggs

| Egg | Cost | Hatch level | Notes |
| :-- | :-- | :-- | :-- |
| **Loyal Spirit** (existing) | 1000 QP | 5 | Cheapest pet, low ceiling |
| **Singing Hound** (existing) | 1500 QP | 8 | Equal in cost/level to Street Drone |
| **Street Drone** (new) | 1500 QP | 8 | Side-grade for Singing Hound |
| **Chrome Salamander** (new) | 1500 QP | 12 | Best level-per-QP ratio in catalog |
| **Pocket AI** (new) | 1500 QP | 15 | Highest hatch level available |

> *Chrome Salamander and Pocket AI are objectively better stat-per-QP than the existing eggs. This is intentional: the QP grind for tier-3 players is longer (post-remort), so the Repository scales rewards accordingly. Pre-remort players don't have the QP budget to redeem these in early rotation, so the curve is self-balancing.*

---

## Files touched in Phase 4

- **`mud_server.js`** — 3 new entries in the `SHOPS` object (rooms 214/225/277); 3 new pet-egg entries in `NOMAGIO_REPOSITORY`.
- **`recipes.json`** — 6 new recipe entries.
- **`items.json`** — 2 new craft-only items in `crafting{}`: `data_ward_amulet`, `replicant_vow_ring`.

No engine changes were required — the existing shop/crafting/pet infrastructure absorbed the new content cleanly.

---

## Phase 4 verification (run on commit)

| Test | Result |
| :-- | :-- |
| JSON parse — `monsters.json`, `items.json`, `rooms.json`, `recipes.json` | OK |
| All 14 recipe input/output `itemId`s reference real items | 0 errors |
| All 3 new shop stock arrays reference real items | 0 errors |
| New craft outputs (data_ward_amulet, replicant_vow_ring) registered in items.json | OK |
| All 6 NK recipe IDs present in `recipes.recipes` | OK |
| Server boots clean — 14 bosses, 206 monsters, 5 NPCs, 5 quests, 301 rooms | OK |
| Spawn skip-list still excludes the 5 boss rooms (220/230/260/270/300) | OK |
| 4 pre-existing Eldoria shop stock errors (`iron_shortsword`, `torch`, `chainmail`, `steel_longsword`) | Out of scope — predates Phase 4 |

**Status:** all Phase 4 wiring verified. Economy online.

---

## What's next

**Phase 5: Quests + NPCs + dialogue** — 8 new quests, 5 NPC brain files (Hiro, Ms. Takamura, Wren, 42 — Koma already stubbed in Phase 1), full dialogue authoring. Voice-heavy phase. The Blade Runner / Hitchhiker's tone gets delivered properly via NPC patter.

**Phase 6: Hack skill + affinity system** — system work. Will unlock the dormant Replicant Vow Ring affinity gate, the Static Tea +hack buff, the discounted-shop-prices effect for Replicant-leaning players, and the dialogue-resolution path on Mother of Orphans.

---

*Document revision: Tier 3.1 Phase 4. Shops standing, crafting paths live, pets in stock. Phase 5 (quests + dialogue) up next.*
