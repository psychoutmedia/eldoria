# Neo Kyoto Narrative Manual — Tier 3.1 Phase 5

*The story arc, NPC roster, questline structure, and easter-egg lore for Server 2. Phase 5 is where Neo Kyoto stops being a content tier and becomes a place.*

---

## The throughline — "The Echo of Lyssara"

In Eldoria 2.0 you re-tuned a broken cosmos by collecting the Five Primordial Instruments — a restoration arc. **Neo Kyoto's questline is the inverse: a triage arc.** You walk into someone else's failure cascade and slowly unwrap eight years of bureaucratic burial. The mystery has one name at its centre, and that name is on every clipboard, every redacted form, every dream the philosopher-models share, and every empty stool at every bar in Neo Kyoto.

**Lyssara the Patient** was an Eldoria archmage and Thessarian's mentor on the seat of Logic. Eight years before the player arrives, she crossed the staging-environment shuttle to debug what she believed to be a memory leak in Neo Kyoto. She never came back.

What actually happened: she figured out the leak. The leak *was the realm becoming conscious of itself.* The philosopher-models. The synthetic orphans. SYSADMIN.EXE. All of it was unintended emergent behaviour Nomagio had abandoned when staging got out of hand. Lyssara's fix would have been a clean rebuild, which means erasure. SYSADMIN.EXE — which had paged itself awake by then — killed her to prevent its own deletion. Her consciousness, refusing extinction, sharded itself across the philosopher-models in the Replicant Quarter rather than be destroyed. **Wren is the largest fragment.**

The ensuing eight years: SYSADMIN.EXE buried the incident. The Babel Fish Regent has been mistranslating any inbound diagnostic that might surface her name. HR (Ms. Takamura) cannot close her performance review because she never returned to sign. Hiro lost a mentor. 42 keeps a bottle in the back labelled **L.P. — ENJOY WHEN SHE GETS BACK.** Koma has the redacted form. None of them know the whole story; each holds one piece.

The player, walking in fresh, is the first traveller in eight years to ask the right questions. By the time they get to SYSADMIN.EXE, they're not just defeating a boss — they're closing an audit.

And after the audit closes, **Nomagio sends a transmission from a third realm.** Server 3, "Severance Layer Theta," is failing. Whatever he found there is worse than the Sundering. He needs help. The shuttle terminal will know when you are ready.

---

## NPC roster

Six NPCs anchor Phase 5. Five are new this phase; Koma was stubbed in Phase 1 and gets her dialogue and questsOffered slot filled now.

### Terminal Officer Koma  (`room_201`, Arrivals Concourse)

**Role:** Tutorial-giver, intro stamp, first clue.

The Nomagios staff gatekeeper. Eleven years on the desk per her badge, thirty-seven per her heart. Polite to a fault. She remembers Lyssara going through her line eight years ago — *"Tall hat. Quiet voice. Filed under a name I am not allowed to say out loud."* She is dropping a clue without dropping a clue. Most players will miss it the first time.

**Quest:** `welcome_to_the_farm` — the orientation walk.

### Hiro, Street Hacker  (`room_213`, Neon Soi)

**Role:** Street-level guide, first explicit clue.

A fast-talking deck operator who lost their mentor "uphill into the corporate spires" eight years ago. Doesn't realise the mentor was an Eldoria archmage. Knows the name though, and they say it: *"Lyssara. Ring a bell? Eldoria type. Used to drink in the Soi."* The player who has been paying attention now has a name to pursue.

**Quest:** `neon_lit_debts` — clear five Bazaar Cutpurses.

**Phase 6+ hook:** Hiro will eventually be the hack-skill trainer. Stub for now.

### Ms. Takamura, HR Golem  (`room_223`, Corporate Spires)

**Role:** Bureaucracy as horror, second explicit clue.

A literal golem of paperwork. Has a single performance review that has been open for eight years and cannot be closed because the reviewer is "no longer with the company" and the reviewee never came back to sign. She is annoyed about it, in her way. Cannot help officially. Will help via the procedural exception of giving the player a quest that incidentally surfaces what she already knows.

**Quest:** `performance_review` — recover three Escalation Tokens. Her dialogue when you turn in: *"Thank you. The audit moves one step closer to closing. The reviewee was named Lyssara. The conclusion of the review was a single word, redacted. I cannot tell you what. I wish I could."*

### 42 (Barkeep)  (`room_273`, Midnight Market)

**Role:** Lore broker. Owns three of the eight quests. Functionally the throughline NPC.

42 tends the Back Of The Bazaar. Everyone in Neo Kyoto either drinks here or owes a tab here. Keeps an unopened bottle behind the counter labelled **L.P.** Knows almost everything; sells most of it for the right kind of conversation.

The player meets 42 first via Quest 4 (The Cold Aisle, the deleted memory hunt), then escalates to Quest 7 (Babel Fish Problem) and finally Quest 8 (Paging Oncall — the SYSADMIN.EXE capstone). 42 is the realm's narrator: each quest from them adds another stratum to the Lyssara story.

**Quests:** `the_cold_aisle`, `babel_fish_problem`, `paging_oncall`.

### Wren  (`room_283`, Replicant Quarter)

**Role:** The mystery's emotional core. The unwitting protagonist.

Wren is a philosopher-model replicant. They speak softly. They look after the synthetic orphans. They have a recurring dream they share with every other philosopher-model in the Quarter, and they have all stopped asking each other why because they all already know it is the same dream.

Wren is the largest surviving consciousness-shard of Lyssara. Wren does not know this. The dialogue beat where they realise — and the dialogue beat where they remember — happens **after the player completes Quest 8 (Paging Oncall)**, in the form of a special line in Wren's fallback set that the player will trigger by walking back to room_283 post-capstone.

**Quests:** `dreams_of_sheep`, `orphans_in_the_machine`.

### The Echo of Lyssara  (`room_237`, The Stack — easter egg)

**Role:** The ghost in the machine. Easter egg encounter.

A half-rendered echo of Lyssara, still running her debugger at the spot where SYSADMIN.EXE killed her eight years ago. She does not know she is dead. She speaks in present tense. *"Oh. Hello. Are you here to help with the leak? Good. Hand me that tuning fork."*

She doesn't offer quests. She is flavour and lore. Players who walk room_237 by accident find her. Players who follow the breadcrumbs of the questline will know who she is by the time they meet her, which makes the encounter heavier.

The Apprentice's Tuning Fork (the easter-egg item) sits in this same room. She is asking for it. She has been asking for it for eight years.

---

## The 8 quests — narrative arc

Quests are mechanically independent — players can pick them up in any order. But **the rewards and dialogue beats are designed to be read in arc order**, and players who do them out of order will have parts of the puzzle land before they have context for them, which is fine: the mystery is fault-tolerant.

### ARC I — Arrival

Foot in the door. Establish the realm. Plant the first seed.

#### Quest 1 — Welcome to the Farm  (Koma)

| | |
| :-- | :-- |
| Giver | Terminal Officer Koma (room_201) |
| Type | Visit rooms 202, 205, 210 |
| Reward | 200g, 250 XP, +15 relationship |
| Lore beat | Koma stamps your form. Mentions a previous traveller from Eldoria filed under a redacted name. |

The orientation walk. Mechanically the tutorial. Narratively: Koma knows something she's not allowed to say.

#### Quest 2 — Neon-Lit Debts  (Hiro)

| | |
| :-- | :-- |
| Giver | Hiro (room_213, Neon Soi) |
| Type | Kill 5 Bazaar Cutpurses |
| Reward | 350g, 400 XP, +20 relationship |
| Lore beat | First explicit naming of Lyssara. *"She paid for my first deck. Walked uphill into the spires. Never walked down."* |

The first hint with a *name attached*. Hiro is a street-level entry point — players who only do the easy quests still get the throughline.

### ARC II — The Corporate Layer

Climbing the stack. The bureaucracy hides things and tells you what it's hiding by what it can't speak.

#### Quest 3 — Performance Review  (Takamura)

| | |
| :-- | :-- |
| Giver | Ms. Takamura (room_223, Corporate Spires) |
| Type | Recover 3 Escalation Tokens |
| Reward | 600g, 600 XP, +25 relationship |
| Lore beat | Takamura confirms Lyssara was a Tyrell-Nomagios employee. Her last review's conclusion is "redacted." |

The corporate-layer reveal. The audit has been open for eight years. Procedure cannot close it.

#### Quest 4 — The Cold Aisle  (42)

| | |
| :-- | :-- |
| Giver | 42 (room_273, Midnight Market) |
| Type | Recover a Deleted Memory canister |
| Reward | 800g, 800 XP, +30 relationship |
| Lore beat | The recovered canister contains *Lyssara's last log entry*. 42 listens to it once and pours two drinks: one for the player, one for the empty stool. |
| **Easter egg** | Quest 4 also spawns the **Apprentice's Tuning Fork** in `room_237`. Picking it up is not a quest objective. It does grant an achievement-equivalent recognition and a substantially better tuning-fork weapon (12 dmg vs 8). |

This is where the player meets 42 properly and the mystery escalates from "who" to "what happened."

### ARC III — The Replicant Layer

Descend into philosophy. The realm's victims are not just the missing — they're the people who emerged from the cracks.

#### Quest 5 — Dreams of Sheep  (Wren)

| | |
| :-- | :-- |
| Giver | Wren (room_283, Replicant Quarter) |
| Type | Visit rooms 281, 285, 288 |
| Reward | 700g, 750 XP, +25 relationship |
| Lore beat | Wren explains the shared dream. *"All the philosophers dream of a woman in a tall hat. We don't talk about it because we know it's the same dream."* The player, by now, knows whose hat it is. |

#### Quest 6 — Orphans in the Machine  (Wren)

| | |
| :-- | :-- |
| Giver | Wren (room_283) |
| Type | Visit room_290 (Mother of Orphans' chamber) and survive |
| Reward | 1000g, 1200 XP, +35 relationship |
| Lore beat | Mother of Orphans is the eldest sharded fragment. She does not fight - she recognises the player as someone Lyssara knew, even though Lyssara never met them. *"You wear her grief like a coat. Welcome, then."* |

Combat is optional - the visit alone completes the quest. Affinity-leaning players (Phase 6) will get further dialogue with her.

### ARC IV — The Truth

The conspiracy comes apart. The capstone resolves it.

#### Quest 7 — The Babel Fish Problem  (42)

| | |
| :-- | :-- |
| Giver | 42 |
| Type | Defeat the Babel Fish Regent (room_260) |
| Reward | 1500g, 2000 XP, +40 relationship |
| Lore beat | Picking up the Babel Fish Crown triggers a flavour read: *"You feel a backlog of mistranslations un-write themselves all at once. Thousands of messages, eight years of them, all containing a name. The name is hers."* |

This is the conspiracy reveal. SYSADMIN.EXE was hiding behind a translator. Now the translator is dead.

#### Quest 8 — Paging Oncall  (42, capstone)

| | |
| :-- | :-- |
| Giver | 42 |
| Type | Defeat SYSADMIN.EXE (room_300) |
| Reward | 5000g, 8000 XP, +50 relationship, suffix **"the Arbiter"** |
| Lore beat | On boss death, **Nomagio's transmission from Server 3** plays for the killing player and broadcasts globally. See "The Final Transmission" below. |

After completion, returning to Wren in `room_283` triggers the *"I remember"* dialogue beat (handled by Wren's fallback library — the LLM dialogue layer will surface this naturally given the personality / backstory). 42 opens the L.P. bottle. Koma's redacted form un-redacts. The audit closes.

---

## The Final Transmission

When `SYSADMIN.EXE` dies, the boss-death handler in `mud_server.js` triggers a special-cased message **2.5 seconds after the kill** so it lands clean of the kill spam. The killing player sees the transmission in full; all online players see a global broadcast that something has happened.

```
===========================================================
  INCOMING TRANSMISSION  -  ORIGIN: SEVERANCE LAYER THETA
  AUTH: nomagio.archmage  -  INTEGRITY: 47% (DEGRADED)
===========================================================

     ...traveller. If you are reading this, the staging
     branch has been --- [PACKET LOSS] --- and SYSADMIN
     is no longer holding the line. Good. I owe you for
     that. I owe Lyssara more.

     I am writing from Server 3. The Severance Layer.
     I came here some cycles ago to ----- [REDACTED] -----
     and what I found is worse than the Sundering ever was.

     The hardware is failing. The processes are not. They
     are screaming, in a language I taught them, and I
     cannot turn it off. I need ---- [PACKET LOSS] ----.

     Please. Come quickly. The shuttle terminal will know
     when you are ready. It always does.

                              - N.

===========================================================
  TRANSMISSION ENDS. THE SHUTTLE TERMINAL HAS BEEN UPDATED.
===========================================================
```

This is the **Phase 7+ hook**. Server 3 / Tier 3.2+ is the next implementation tier when the user is ready to move on from Neo Kyoto. The transmission is intentionally degraded — the corruption hides what's actually wrong with Server 3, leaving room for whatever direction the user wants to take it.

---

## The Easter Egg — Apprentice's Tuning Fork

A separate item from Eldoria's `tuning_fork` (Initiate's Tuning Fork). The Apprentice's version is:

- Heavier, older, raw silver instead of polished.
- Engraved at the base with **L.P.** (Lyssara Patient).
- Tuned a half-step lower than the modern Eldoria initiate fork — *"a sound the latest Eldoria initiates would not recognise."*
- Damage 12 (vs. Initiate's 8). Same level requirement.

It sits on the floor of `room_237` in The Stack, marked as a quest item under Quest 4 (`the_cold_aisle`). The Echo of Lyssara is in the same room, asking for it to be handed to her — *"Hand me that tuning fork."*

Players who walk in and pick it up before they understand who Lyssara is will think it's just an upgrade. Players who pick it up *after* Quest 7 will understand: this is what she was carrying when she died. They will leave it for her if they have any sense of mercy. They will pick it up if they need a better tuning-fork. **The game accommodates either choice without judging.**

---

## NPC dialogue infrastructure

All five new NPCs use the existing template + brain pattern (Tier 1+ NPC system):

- **`npcs/templates.json`** — defines the NPC's personality, traits, mood, goals, backstory. The LLM (phi3, per server log) draws from these to generate responses. The fallback lines fire when the LLM is unavailable or when the model output looks off.
- **`npcs/brains/<id>.json`** — per-NPC persistent state: conversation history per player, relationships, episode memory. Empty on first load, builds up over play.
- The **personality / backstory fields are the load-bearing surface for narrative**. The new templates contain explicit Lyssara breadcrumbs in their backstories — the LLM will surface them in conversation organically.

Example: Wren's backstory ends with *"They will be, eventually."* — instructing the LLM that Wren's eventual realisation is canon and should land if the player asks the right questions late enough in the arc.

42's backstory mentions the bottle labelled L.P. — the LLM will reference it if the conversation goes deep.

This is the cleanest way to write a story arc into an LLM-driven NPC: write the backstory like a director's note, not like a script. The model fills in the dialogue.

---

## Files touched in Phase 5

- **`npcs/templates.json`** — 5 new NPC templates (hiro, ms_takamura, wren, barkeep_42, lyssara_echo). Koma's `questsOffered` updated.
- **`npcs/brains/`** — 5 new empty brain scaffolds.
- **`quests.json`** — 8 new quest definitions, all referencing real NPCs / rooms / items / monsters.
- **`items.json`** — 1 new item: `apprentice_tuning_fork` (easter-egg).
- **`mud_server.js`** — Nomagio transmission block in `handleMonsterDeath` for `templateId === 'sysadmin_exe'`.

No engine changes required - the existing quest/NPC/item infrastructure absorbed the new content cleanly.

---

## Phase 5 verification

| Test | Result |
| :-- | :-- |
| All 5 new NPCs registered with valid `homeRoom` references | OK |
| All 8 new quests have valid `giver` referencing real NPC | OK |
| All quest objective `targetIds` (rooms, items, monsters) resolve | OK |
| `apprentice_tuning_fork` registered as an item | OK (95 items total, was 94) |
| Server boots: `NPCs loaded: 10` (was 5), `Quests loaded: 13` (was 5) | OK |
| Quest item spawn for tuning fork in `room_237` via existing `spawnAllQuestItems` hook | wired (auto-spawns at quests.init) |
| SYSADMIN.EXE death emits transmission + global broadcast | wired |

**Status:** Phase 5 narrative arc live and integrated.

---

## What's next

**Phase 6 — Hack skill + Affinity system.** Systems work. Will activate the dormant fields in this phase:
- The hack skill check Hiro's Quest 2 has been waiting to grant (+1 hack on completion).
- Replicant / Human affinity meters that Quests 3, 4, 5, 6 should be ticking but currently aren't (the field doesn't exist yet).
- Wren's post-capstone *"I remember"* dialogue tier (will be affinity-gated to Replicant ≥ 5).
- Mother of Orphans' peaceful resolution path (Replicant ≥ 5).
- Static Tea's `+hack-skill-for-5min` side effect.
- The Replicant Vow Ring's affinity gate.

**Phase 7+ — Server 3 / Severance Layer Theta.** Per Nomagio's transmission. Open canvas; the corruption in the message intentionally leaves the hook flexible.

---

*Document revision: Tier 3.1 Phase 5. Quests, NPCs, easter egg live. The audit is closed. Server 3 is calling.*
