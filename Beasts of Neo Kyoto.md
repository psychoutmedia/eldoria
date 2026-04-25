# Neo Kyoto - Field Bestiary

*A staff-internal catalogue compiled from intake logs, incident reports, and the occasional coroner's footnote. Nomagios Server Farm: Instance 2 (Neo Kyoto). Circulation limited to registered operators with `remortTier >= 1`.*

---

## Realm notes

Neo Kyoto runs on a different rule-set than Eldoria. Every entity native to this realm has been fabricated, deployed, or forgotten on hardware that does not care about sound-magic. The consequences are consistent across all 26 templates:

- **Harmonic resist: 75%.** Your Eldoria tuning-fork weapons, drum-staves, and resonant edges register at a quarter of their usual efficiency. The architecture does not compile them.
- **Data vulnerability: -25%.** Weapons of the Data damage type land harder here. See the Neon Soi pawn-shops and the Nomagios staff fridge for your procurement options.
- **Grace periods still apply.** Aggressive mobs in Neo Kyoto give you the standard 3-second window to walk back out before they commit to the encounter.

Eldoria mobs are not vulnerable to Data in the same way, so Data gear is not a free cross-realm upgrade. Each realm has its preferred damage language. Pack accordingly.

---

## Aggro legend

- **[!] Aggressive** — will open on you inside the grace period.
- **[~] Neutral** — provoked only. Sturdier than they look.
- **[·] Passive** — will not fight unless you start it. Often carry narrative items.

---

## Zone 1 — Arrivals Concourse  (rooms 201-210)

*Spawn chance: 40% per room. Tutorial tier.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Patched Pedestrian | [·] Passive | 15 | 80 | 25 | physical | A commuter in a raincoat that renders at half resolution. Their face buffers when you look directly at it. |
| Baggage-Claim Beast | [~] Neutral | 15 | 100 | 28 | physical | A suitcase that has been waiting on the carousel long enough to develop opinions. It has grown legs; two of them are handles. |
| Expired Traveler | [·] Passive | 16 | 85 | 26 | physical | A ghost in airport business-casual, still holding a boarding pass for a flight that was cancelled before the realm was spun up. |

**Typical drops:** Yen Chip, Expired EULA, Waitlist Ticket, Stim-Pak, Corrupted Datapad.

---

## Zone 2 — Neon Soi  (rooms 211-220)

*Spawn chance: 70% per room. Street-level threat tier.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Neon Yakuza | [!] Aggressive | 17 | 130 | 38 | physical | A figure in a coat of licensed rain, lit by a sign advertising a noodle bar that closed in Q3. The tattoos on their arms are under non-disclosure agreements. |
| Rogue Replicant | [~] Neutral | 17 | 140 | 36 | **data** | An off-the-books synthetic, past their retirement certificate by a cruel margin. Fights like someone who has read the manual and disagreed with it. |
| Bazaar Cutpurse | [!] Aggressive | 16 | 100 | 34 | physical | A narrow figure in a coat of pockets. Their fingers move faster than their rendering can keep up with. |
| Disgruntled Noodle Vendor | [!] Aggressive | 15 | 90 | 30 | physical | A stallkeeper whose soup has been stolen one too many times. The cleaver is for the noodles, technically. |

**Zone boss (future encounter, room 220):** *Chiyo-7, the Deprecated* — a retired blade-runner running on expired certs.

**Typical drops:** Yen Chip, Neon Eye, Deprecated Cert, Stun Baton, Null-Pointer Dagger, Mesh Jacket, Static Buckler, Root Beer.

---

## Zone 3 — Corporate Spires  (rooms 221-230)

*Spawn chance: 65% per room. Tyrell-Nomagios Tower interior. HR grade hazards.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Corporate Enforcer | [!] Aggressive | 19 | 170 | 44 | physical | Six feet of compliance in a pressed suit, with a lanyard that gets you fired just by looking at it. Their badge has more permissions than you do. |
| Flickering Janitor | [·] Passive | 17 | 110 | 32 | physical | A cleaner whose shift ended some years ago; nobody told his texture pack. Mops floors that are already clean, in rooms that are already dark. |
| Junior Associate | [!] Aggressive | 18 | 140 | 40 | physical | A suit three sizes too eager, armed with a clipboard of escalations and a smile that has never worked from home. Bills in six-minute increments. |

**Zone boss (future encounter, room 230):** *The Account Manager* — smiling middle-manager demon with an escalation queue.

**Typical drops:** Escalation Token, Shock Prod, Riot Shield, Encrypted Gloves, Faraday Hood, Corrupted Datapad, Static Tea, Synth Boots.

---

## Zone 4 — The Stack  (rooms 231-240)

*Spawn chance: 75% per room. Literal datacentre interior. Hack skill shines here.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Data Ghost | [!] Aggressive | 21 | 180 | 48 | **data** | The silhouette of a user who was soft-deleted but never unlinked. Attacks carry the weight of every outstanding ticket they ever opened. |
| Security Subroutine | [!] Aggressive | 20 | 160 | 46 | **data** | An on-call daemon shaped like a man shaped like a sentence. Scans the room on a tight loop. Summoned by failed hack attempts. |
| Memory Leak Wraith | [!] Aggressive | 22 | 200 | 50 | physical | A fog of unreleased allocations wearing the outline of the engineer who shipped it. Every second you observe it, it grows. The docs say this is intended behaviour. |

**Designer note:** The Stack is a mid-realm mini-hub with no boss. Expect dense mob density and hack-terminal interactables seeded in later phases.

**Typical drops:** Deleted Memory, Bytecode Shard, Access Keycard, Root-Kit Blade, Packet Sniffer Pistol, Compile-Error Rod, VR Goggles.

---

## Zone 5 — Off-World Colonies Waitlist  (rooms 241-250)

*Spawn chance: 55% per room. Cathedral-sized DMV. Low aggression, high despair.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Queue Fragment | [~] Neutral | 18 | 150 | 38 | physical | A detached segment of The Queue, flopping around the concourse looking for a line to rejoin. It has a number. The number has never been called. |
| Off-World Recruiter | [·] Passive | 19 | 130 | 36 | physical | A polite entity with an armful of brochures for a colony that may or may not have broken ground. Only turns hostile if you refuse the brochure. |
| Flickering Janitor | [·] Passive | 17 | 110 | 32 | physical | (See Corporate Spires.) Migrates between zones on a broken shift rotation. |

**Zone mini-boss (future encounter):** *The Queue Itself* — optional emergent entity of bureaucratic despair.

**Typical drops:** Waitlist Ticket, Escalation Token, Expired EULA, Patch Notes Scroll, Cold Brew.

---

## Zone 6 — Kowloon-42 Arcology  (rooms 251-260)

*Spawn chance: 75% per room. Vertical slum. Parkour-heavy. Many vertical exits.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Kowloon Parkourist | [!] Aggressive | 22 | 190 | 52 | physical | A teenager who has never paid rent and never fallen off anything. Fights with elbows, knees, and a moral certainty that the building is on their side. |
| Chrome Wolf | [!] Aggressive | 23 | 220 | 56 | physical | A feral hunter in plated brushed-nickel, teeth clean as a spec sheet. Bred in a lab whose funding has since been cut. |
| Mantis Debugger | [!] Aggressive | 24 | 230 | 58 | **data** | An insectile construct whose arms end in finely-calibrated breakpoints. Debugs you by catching every part of you that isn't where it should be. |

**Zone boss (future encounter, room 260):** *Babel Fish Regent* — a universal translator gone feral.

**Typical drops:** Yen Chip, Bytecode Shard, Gecko Grips, Chrome Plating, Rollback Ring, Kill-Switch Pistol, Fork-Bomb Axe, Holo-Projector.

---

## Zone 7 — Chrome Sea  (rooms 261-270)

*Spawn chance: 70% per room. Mercury-lake biome under a neon sky. Flooded tunnels.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Mercury Kelpie | [!] Aggressive | 24 | 240 | 60 | physical | A horse shaped from liquid metal, slipping between puddles of itself. Drinking from the Chrome Sea has made it what it is; nobody has asked what it was before. |
| Black-ICE Basilisk | [!] Aggressive | 25 | 260 | 64 | **data** | An intrusion-countermeasure serpent in countershaded plating, sold commercially as 'a deterrent.' Its gaze compiles you into a halt. |
| Backup Spirit | [~] Neutral | 23 | 210 | 54 | physical | A ghost made of everything this realm ever saved at 3am on a Tuesday. Quiet and pleasant if you are kind to it. Restores itself when damaged, slightly. |

**Zone boss (future encounter, room 270):** *The Deep Pool* — memory-eater from deleted accounts. Drains mana before HP.

**Typical drops:** Neon Eye, Chrome Plating, ICE Deflector, ICE-Breaker Rifle, Deleted Memory, Patch Notes Scroll, Rollback Ring, Cold Brew.

---

## Zone 8 — Midnight Market  (rooms 271-280)

*Spawn chance: 55% per room. Grey-market and black-market stalls. Shop hub zone.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Deprecated Bladerunner | [~] Neutral | 25 | 240 | 62 | physical | A retired killer with a patchy badge and a longer record. Their cert expired six patches ago; nobody has told them, and nobody is going to. |
| Philosopher-Model Replicant | [·] Passive | 22 | 180 | 48 | physical | A synthetic designed to debate dinner parties, now unemployed. Only fights if you insist, and will keep apologising while they do. |
| Bazaar Cutpurse | [!] Aggressive | 16 | 100 | 34 | physical | (See Neon Soi.) Cross-zone spawn - the trade routes run through here. |

**Designer note:** No boss. This is the commercial spine of the realm: three shops, a pet-egg fence, a crafting-materials broker. Expect the ambient mob density to stay low.

**Typical drops:** Deprecated Cert, Kill-Switch Pistol, Encrypted Gloves, Orphan Locket, Dream of Sheep, Static Tea.

---

## Zone 9 — Replicant Quarter  (rooms 281-290)

*Spawn chance: 60% per room. Sanctuary district. Philosophical. Affinity choices peak here.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Synthetic Orphan | [·] Passive | 23 | 200 | 50 | physical | A child-model replicant whose parent-processes were killed in a routine cleanup. They do not understand why. Nobody wants to explain. |
| Philosopher-Model Replicant | [·] Passive | 22 | 180 | 48 | physical | (See Midnight Market.) Heavier population density in this district. |
| Rogue Replicant | [~] Neutral | 17 | 140 | 36 | **data** | (See Neon Soi.) Some have drifted here from the Soi to find sanctuary. |

**Zone boss (future encounter, room 290, dialogue-gated):** *Mother of Orphans* — matriarch of unlinked processes. Peaceful path unlocked at Replicant affinity 5+.

**Typical drops:** Orphan Locket, Dream of Sheep, Deprecated Cert, Root Beer, Static Tea.

---

## Zone 10 — Heat Death Datacentre  (rooms 291-300)

*Spawn chance: 80% per room. Final zone. Abandoned server hall. Power failing.*

| Monster | Type | Level | HP | STR | Dmg type | Description |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Cron Daemon | [!] Aggressive | 27 | 300 | 72 | **data** | A clockwork spirit in the shape of a man in a lab coat, triggered on a ten-second interval. Carries out the same attack every cycle. It will not stop being on time. |
| On-Call Wight | [!] Aggressive | 26 | 280 | 68 | physical | A silhouette in a dressing-gown clutching a phone that never stops vibrating. Has been on call for seven years and has opinions about runbook quality. |
| Memory Leak Wraith | [!] Aggressive | 22 | 200 | 50 | physical | (See The Stack.) Ambient infection - the datacentre is where they originated. |
| Security Subroutine | [!] Aggressive | 20 | 160 | 46 | **data** | (See The Stack.) Elevated spawn rate due to failing containment. |

**Realm capstone (future encounter, room 300):** *SYSADMIN.EXE* — Nomagio's rogue auto-scaler. Three-phase fight. Phase 2 summons cron-daemon adds on a 10s cycle. Phase 3 is 'paging oncall' - player's next 2 abilities randomly fail with a 503. Group play strongly recommended.

**Typical drops:** System Log Page, Access Keycard, Segfault Cleaver, Admin Cola, Cold Brew.

---

## Boss roster (Phase 3 preview)

The following named encounters are scaffolded but not yet implemented with full signature mechanics. Drops are already defined in the item tables.

| Boss | Room | Zone | Signature hook | Guaranteed drop |
| :-- | :-- | :-- | :-- | :-- |
| Chiyo-7, the Deprecated | 220 | Neon Soi | At 50% HP: `cert_expired` debuff - her attacks no longer apply, but she gains +40% speed. | Chiyo-7's Expired Cert |
| The Account Manager | 230 | Corporate Spires | Every 3 rounds: 'escalates' - spawns a Junior Associate add. Kill adds or he stacks +10% damage per live add. | Managerial Letter of Recommendation |
| Babel Fish Regent | 260 | Kowloon-42 | Randomly swaps resisted damage type each round, telegraphed. Reads affect/resist system. | Babel Fish Crown |
| The Deep Pool | 270 | Chrome Sea | Drains mana instead of HP. Mana-0 players start bleeding HP. Forces potion prep. | Deep-Pool Pearl |
| SYSADMIN.EXE | 300 | Heat Death Datacentre | Three-phase capstone. Summons CRON_DAEMON adds. Phase 3 randomly fails player abilities. | SYSADMIN.EXE's Root Key |

**Optional / dialogue-gated encounters (do not count toward the 5-boss spec):**

- *The Queue Itself* — Off-World Colonies Waitlist. Emergent mini-boss.
- *Mother of Orphans* — Replicant Quarter. Combat optional; dialogue resolution unlocks at affinity thresholds.

---

## Loot-table quick reference

Materials you will only find in Neo Kyoto:

| Item | Category | Source |
| :-- | :-- | :-- |
| Yen Chip | treasure (75g) | low-level Neo Kyoto mobs, ambient |
| Expired EULA | treasure (90g) | Arrivals Concourse, Off-World Waitlist |
| Deprecated Cert | treasure (150g) | replicants, bladerunners |
| Corrupted Datapad | treasure (130g) | janitors, arrivals mobs |
| Neon Eye | treasure (200g) | Chrome Sea, Neon Soi aggressors |
| Bytecode Shard | treasure (220g) | The Stack, Kowloon-42 |
| Orphan Locket | quest | Replicant Quarter, philosopher models |
| Deleted Memory | quest | The Stack, Chrome Sea |
| Dream of Sheep | quest | Replicant Quarter |
| Escalation Token | quest | Corporate Spires |
| Waitlist Ticket | quest | Off-World Waitlist |
| Access Keycard | quest | Security Subroutines, On-Call Wights |
| System Log Page | quest | Heat Death Datacentre |

---

*Bestiary revision: Tier 3.1 Phase 2. Bosses scaffolded but not fully implemented - see Phase 3 roadmap. Hack skill, affinity effects, and shop integration tracked under Phases 4-6.*
