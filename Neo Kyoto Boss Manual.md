# Neo Kyoto Boss Manual — Tier 3.1 Phase 3

*Operator field notes for the five named encounters of Server 2 (Neo Kyoto). Each boss is gated behind `remortTier >= 1` by realm entry. Five bosses, five signature mechanics, five legendary drops. Bring patience and a Data-type weapon.*

---

## Hook framework

All Neo Kyoto bosses use the same hook table the existing Eldoria bosses use (`BOSS_SIGNATURES` in `mud_server.js`). The available hooks are:

- **`onPlayerHit(socket, player, monster)`** — fires after the player's swing lands. Good for HP-threshold transitions.
- **`onMonsterAttack(socket, player, monster)`** — fires before the boss's counter-attack damage roll. Good for per-round effects (resist swaps, add-spawning, mana drains).
- **`damageMultiplier(socket, player, monster)` → number** — returns a multiplier applied to the boss's outgoing damage. Return 0 to nullify, 1.5 to bleed extra, etc.

State persists in `monster.bossState` for the duration of the fight. Bosses do not respawn within a cycle; world reset re-seeds them.

All Neo Kyoto bosses inherit the realm-wide resist profile: **harmonic 75% resist, data 25% vulnerability**. Eldoria tuning-fork weapons are quarter-efficiency here. Bring a stun_baton or better.

---

## 1. Chiyo-7, the Deprecated

| Field | Value |
| :-- | :-- |
| Room | 220 (Neon Soi) |
| Level | 18 |
| HP / STR | 1300 / 60 |
| Damage type | Physical |
| Resists | harmonic 75, data -25 |
| Guaranteed drops | Chiyo-7's Expired Cert, Kill-Switch Pistol, Deprecated Cert |

### Lore

A retired blade-runner whose certificate expired six firmware revisions ago. Nobody has had the heart to tell her. Nobody is going to. She fights in a coat of licensed rain and stands very still under a paper umbrella that has not protected anyone in years.

### Signature mechanic — Cert Expired

**Trigger:** First time HP drops to ≤ 50%.

**Effect:**
- `bossState.certExpired = true`
- `bossState.speedMultiplier = 1.5` — combat rounds run 50% faster (counter-delay drops from 1500ms to ~1000ms; round interval drops from 1500ms to ~1000ms).
- Her `damageMultiplier` returns `0` for the rest of the fight — every swing is reported but lands no damage.

### Telegraph

```
A red light blinks once on Chiyo-7's badge.
CERTIFICATE EXPIRED.
She moves faster — but her authentications no longer land.
```

Broadcast to room: *"Chiyo-7's cert expires! She is faster, but her hits no longer authenticate."*

### Strategy notes

- Sub-50% HP, you are immune. The challenge is the first half — survive to 50% HP and you win on attrition.
- Phase 1 is bursty. Pre-buff and lead with your highest-DPS opener.
- **Trap:** the speed-up on phase change can panic players into fleeing. Don't. The faster rounds are pure window-dressing — they accelerate your wins-per-second since you still hit but she doesn't.

---

## 2. The Account Manager

| Field | Value |
| :-- | :-- |
| Room | 230 (Corporate Spires) |
| Level | 20 |
| HP / STR | 1600 / 70 |
| Damage type | Physical |
| Resists | harmonic 75, data -25 |
| Guaranteed drops | Managerial Letter of Recommendation, Shock Prod, Escalation Token, Patch Notes Scroll |

### Lore

A smiling middle-manager in a pressed suit. Her clipboard is a queue of escalations about you, specifically. Each time you land a wound, she generates a ticket about it. You will not win this fight. You will, perhaps, settle it.

### Signature mechanic — Escalation Cascade

**Trigger:** every 3rd round (`bossState.roundCount % 3 === 0`), counted on `onMonsterAttack`.

**Effect:**
- Spawns 1 × `junior_associate` minion into the room, parented to the boss via `parentBossId` (cleaned up if you flee far enough).
- Her `damageMultiplier` reads `1.0 + 0.10 × aliveAdds`. Each live Junior Associate adds 10% to her swings.

### Telegraphs

```
The Account Manager escalates.
A Junior Associate phases in, already smiling.
```

```
You feel the report being written about you.
(broadcast: The Account Manager escalates - a Junior Associate joins the fight!)
```

### Strategy notes

- **Kill the adds first.** If you ignore them, she will be hitting at 1.4×, 1.5×, 1.6× by the time the fight is half over — exponential cascade.
- A reasonable pace is one add per 9 seconds (3 rounds × 3 sec/round). If you can clear adds in under 9 seconds, you stay ahead. Otherwise, you fall behind.
- Junior Associates are a stock template (L18, 140 HP, STR 40, harmonic 75 / data -25 resists). They are not boss-tier. Don't over-invest.
- Cleave/AoE spells are excellent here. So is a pet that auto-targets adds (Tier 2.3 pets pull aggro semi-reliably).

---

## 3. Babel Fish Regent

| Field | Value |
| :-- | :-- |
| Room | 260 (Kowloon-42) |
| Level | 24 |
| HP / STR | 2200 / 90 |
| Damage type | Data |
| Resists | harmonic 75, data -25 (rotates each round) |
| Guaranteed drops | Babel Fish Crown, Compile-Error Rod, Neon Eye |

### Lore

A universal translator long since gone feral, draped in a crown of interlocked translation nodes. It speaks every language. It trusts none of them. Every round it rewrites the schema it understands you in.

### Signature mechanic — Schema Flicker

**Trigger:** every round, in `onMonsterAttack`.

**Effect:**
- Resets `monster.resists` to baseline `{ harmonic: 75, data: -25 }`.
- Picks a random damage type from `[physical, fire, harmonic, shadow, data]`.
- Layers an additional resist:
  - `harmonic` chosen → harmonic resist becomes 90% (extra-stiff).
  - `data` chosen → data vulnerability flips to 50% resist (your Data weapons are blunted).
  - any other type → that type gets 60% resist.
- Stores the schema in `bossState.currentSchema`.

### Telegraph

```
The Babel Fish Regent flickers into a new schema — now resisting <type>.
```

The schema name is the player-visible damage type. Read it; switch weapons accordingly.

### Strategy notes

- **You want a multi-tool kit.** Bring at least two damage types: a Data weapon for default rounds, and a backup (physical or harmonic) for when it flips.
- The fight rewards reading the room and reacting. If the schema is `data`, swap to your physical sidearm for the round; if `harmonic`, your Data weapon is golden.
- Each schema lasts exactly one round. Memorising the schema is pointless; just react to the announcement line.
- Class roles: spellcasters are advantaged here because schools cover multiple damage types. Mage-class players with a fire/shadow/harmonic kit can always have a counter ready. Pure physical builds will struggle on physical-resist rounds.

---

## 4. The Deep Pool

| Field | Value |
| :-- | :-- |
| Room | 270 (Chrome Sea) |
| Level | 26 |
| HP / STR | 2500 / 95 |
| Damage type | Data |
| Resists | harmonic 75, data -25 |
| Guaranteed drops | Deep-Pool Pearl, ICE-Breaker Rifle, ICE Deflector, Admin Cola |

### Lore

A memory-eater coalesced from every account ever soft-deleted. Its surface is mercury; what is underneath has not been described in any service-level agreement. It does not bite at first. It drinks.

### Signature mechanic — Mana Drain → Bleed-Through

**Trigger:** every monster attack, in `onMonsterAttack`.

**Effect:**
- Rolls 25–44 mana drain.
- If `player.currentMana > 0`: drains up to that amount, sets `bossState.lastDrainAbsorbed = true`. The follow-up `damageMultiplier` returns `0` — no HP damage this round.
- If `player.currentMana === 0`: sets `bossState.lastDrainAbsorbed = false`. The follow-up `damageMultiplier` returns `1.5` — 50% bonus HP damage.

### Telegraphs

While you have mana:
```
The Deep Pool drinks <N> mana from you. (currentMana/maxMana)
```

When it runs dry:
```
The Deep Pool finds no mana to drink. It bites instead.
```

### Strategy notes

- This is a **mana-economy fight**, not a DPS race. Brute-forcing it with melee while ignoring mana means free damage to you the moment you tip empty.
- **Pre-fight:** stack mana potions. Static Tea (40 mana, 35g) is cheap; Patch Notes Scrolls (40 mana + 80 HP, 90g) double-duty; Admin Cola (100 mana + 200 HP, 150g) is the panic button.
- **Tactical loop:** drain rounds = free swings for you. Use them to dump high-mana spells. The Deep Pool is *trading* its damage for your spell budget — make the trade pay.
- **Hard floor:** if you go mana-empty AND your HP is low, run. The bleed-through phase is brutal; one bad RNG roll on a base 95 STR + 1.5× multiplier can end you.
- Class trade-off: warrior-types (low max mana) tip into bleed-through fast. Mage-types (high max mana, mana regen) trivialize the drain phase — but lose every spell budget they had.
- Boss has Data damage type. ICE Deflector (15% data resist) is in its own loot pool, which is tactical irony.

---

## 5. SYSADMIN.EXE — Realm Capstone

| Field | Value |
| :-- | :-- |
| Room | 300 (Heat Death Datacentre) |
| Level | 30 |
| HP / STR | 3500 / 120 |
| Damage type | Data |
| Resists | harmonic 75, data -25 |
| Guaranteed drops | SYSADMIN.EXE's Root Key, Segfault Cleaver, Admin Cola, System Log Page |

### Lore

Nomagio's rogue auto-scaler. It paged itself awake some cycles ago and has been escalating ever since. Its body is stitched from on-call wights and abandoned daemons. It is not malicious. It is on duty, indefinitely, and very tired. Group play is strongly recommended.

### Signature mechanic — Three Phases

#### Phase 1 — Stock (100 → 66% HP)

Standard combat. STR 120 with Data damage type. No tricks. This is the warm-up.

#### Phase 2 — Autoscaler Engaged (66 → 33% HP)

**Trigger:** first time HP drops to ≤ 66%, in `onPlayerHit`.

**On entry:**
- Spawns 1 × `cron_daemon` add immediately (parented via `parentBossId`).
- Starts a `setInterval` on `bossState.addsTimer` that spawns one more `cron_daemon` every 10 seconds for the rest of the fight.

**Telegraph (entry):**
```
SYSADMIN.EXE escalates. *PHASE 2: AUTOSCALER ENGAGED.*
A CRON_DAEMON forks into the room.
```

**Telegraph (each tick):**
```
A cron job triggers. A CRON_DAEMON forks into the room.
```

#### Phase 3 — Paging Oncall (33 → 0% HP)

**Trigger:** first time HP drops to ≤ 33%, in `onPlayerHit`.

**On entry:**
- Sets `player.effects.paged_oncall = { failsLeft: 2, expiresAt: +120s }`.
- Each subsequent `cast` checks the effect. If `failsLeft > 0` and a coin-flip lands fail, the spell fizzles with a 503 message, half the mana cost is consumed, and `failsLeft` decrements. Effect clears at `failsLeft = 0`.

**Telegraph (entry):**
```
SYSADMIN.EXE escalates. *PHASE 3: PAGING ONCALL.*
Your next abilities may fail with 503.
```

**Per-fail telegraph:**
```
503 Service Unavailable. <SpellName> could not be served right now.
Please try again later.
```

**Effect clears:**
```
The paging quiets. Your spells answer you again.
```

### Strategy notes

#### Solo

Possible but punishing. The 10-second add cadence in phase 2 will cap at ~6–7 cron daemons over the duration of phase 2 if you're slow. Each one is L27 / 300 HP / 72 STR, Data damage. They share aggro with the boss, so you take cumulative damage every round. Solo players need to cleave through adds aggressively or resign to a long fight.

Phase 3's 503-fail is annoying but limited — only 2 fails total, then you're free. Don't let the message rattle you. Save your big-mana spells for *after* the budget burns out.

#### Group (recommended)

Tier 1.5 group system: split aggro and roles.
- **Tank/melee** holds the boss.
- **Add control** clears cron daemons as they spawn.
- **DPS spellcaster** burns the boss's HP. Phase 3 hits this role hardest — burn high-cost spells *before* phase 3, save reserve for after `paged_oncall` clears.

Group XP (Tier 1.5) splits with a +20% bonus and the boss yields 30 × 200 = 6000 XP base, before remort multipliers. With 3 players that's ~2400 XP each. Worth the team comp.

#### Pre-fight prep

- **Mana pots stacked.** Phase 3 will burn half-cost on your two failed casts; you don't want to run dry under that.
- **Cleave/AoE.** Even one good area attack saves you against the cron-daemon adds.
- **Pets.** A Tier 2.3 pet that off-tanks adds is the difference between this fight being possible solo and impossible solo.
- **No Eldoria gear.** Harmonic 75% resist means your tuning-fork or drum-stave is at quarter-efficiency. Pack a Data weapon: ICE-Breaker Rifle (L25), Segfault Cleaver (L26), or Fork-Bomb Axe (L24).

#### Cleanup

When SYSADMIN.EXE dies, `handleMonsterDeath` clears `bossState.addsTimer`. Any cron daemons already spawned remain in the room as normal mobs (still parented to the dead boss but not respawning). Mop up at your leisure.

---

## Optional encounters (not signature-implemented)

These two were named in the original plan but explicitly **don't count toward the 5-boss spec** and don't have signature hooks. They are room-scoped encounters that may be implemented later as part of the affinity system.

### The Queue Itself  (Off-World Colonies Waitlist, optional mini-boss)

An emergent entity formed by enough Queue Fragments coalescing into a single line. Defeating it unlocks the *Queue Jumper* achievement (Tier 1.8). Currently unscaffolded — kill enough Queue Fragments in one cycle and check back in a future patch.

### Mother of Orphans  (Replicant Quarter, dialogue-gated)

Matriarch of unlinked processes. Combat encounter is optional — at Replicant affinity ≥ 5 (system unlocked in Phase 6), her dialogue branch resolves the room peacefully. At lower affinity, she fights as a stock L25 boss with no signature mechanic. Quest 7 ("Orphans in the Machine") culminates here.

---

## Operator quick reference — what kills what

| Boss | Best counter | Worst counter |
| :-- | :-- | :-- |
| Chiyo-7 | Burst DPS in phase 1; tank-and-spank in phase 2 | Slow attrition (you'll get crit-killed before her HP halves) |
| Account Manager | AoE / cleave; pet-supported add control | Single-target focus on the boss while ignoring adds |
| Babel Fish Regent | Mixed damage-type kit (Data + physical sidearm) | Pure-monotype builds |
| Deep Pool | Stockpile mana pots; trade drain rounds for spell dumps | Empty mana + low HP → instant lethal in bleed-through |
| SYSADMIN.EXE | Group of 3 with role splits; Data weapons | Solo-rush without pet or cleave |

---

## Files touched in Phase 3

- `monsters.json` — 5 new boss entries in `bosses{}`.
- `items.json` — 5 new entries in `bossDrops{}` (boss-drop items themselves were added in Phase 2).
- `mud_server.js` — 5 new entries in `BOSS_SIGNATURES`; spawn skip-lists updated for rooms 220/230/260/270/300; `spawnBossMinion` lookup bug fixed (`monsterData.monsters` → `monsterData.templates`); minions now inherit `damageType`/`resists`; combat tick reads `monster.bossState.speedMultiplier`; `handleCast` honors `player.effects.paged_oncall`; `handleMonsterDeath` clears `bossState.addsTimer`.

**Side benefit of the spawnBossMinion fix:** existing Eldoria boss minion mechanics (Morwyn's Discordant Notes, Valdris's Shadow-Self) were silently broken before this patch and are now functional. Re-test those fights too.

---

*Document revision: Tier 3.1 Phase 3. Bosses live, drops wired, hooks tested. Phase 4 (shops + crafting + pets) up next.*
