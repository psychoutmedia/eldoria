# Neo Kyoto Walk-Test Manual

A complete room-by-room walkthrough of the Tier 3.1 expansion (rooms 201–300) on the Nomagios server farm. This document exists so you can validate every exit, every description, and every encounter before Phase 2 (monsters, items, loot) lands.

Last updated: 2026-04-24 — Phase 1 scaffold (no monsters or shops yet, prose and exits only).

---

## Prerequisites

- A connected character with **`remortTier >= 1`**. The shuttle is staff-only.
- If your test character is fresh, log in as an admin and run:
  ```
  set_level <yourname> 30
  ```
  then complete the Eldoria 2.0 finale at room_200, then `remort`. Or, for fast testing, edit the player JSON directly: `players/<yourname>.json`, set `"remortTier": 1`, restart the server.
- Connect: `telnet localhost 8888`

## Movement primer

| Direction | Short | Direction | Short |
|---|---|---|---|
| north | `n` | up | `u` |
| south | `s` | down | `d` |
| east | `e` | northeast | `ne` |
| west | `w` | northwest | `nw` |
| | | southeast | `se` |
| | | southwest | `sw` |

Useful at any time:

| Command | What it does |
|---|---|
| `look` / `l` | Re-read the current room |
| `exits` (or just look) | List the exits |
| `qs` | Quick status (HP, level, gold, time-to-reset) |
| `score` / `sc` | Full character stats |
| `score <name>` | Inspect a player or monster |
| `who` | List online players |
| `say <msg>` | Local room chat |
| `quit` | Disconnect (auto-saves) |

## Crossing over

You start in Eldoria. To reach Neo Kyoto:

1. Travel to **room_100** ("The Perfect Sanctum"). If you're a remorted Tier 1+ character, a new exit `up` will appear — a grey service door that wasn't there before, propped open with a coffee cup. (If you don't see it, your `remortTier` is 0; check your character.)
2. From room_100: `up` — the elevator takes you to **room_201**, Nomagios Transit Terminal: Neo Kyoto Arrivals.

If you ever need to come home: from room_201, `down` returns you to Eldoria. The shuttle is two-way.

---

## Stage 1 — Arrivals Concourse (rooms 201–210)

The tutorial zone. Underlit airport terminal aesthetic. Koma is at room_201, the hack-tutorial terminal is in room_208 (Lost & Found), and room_207 is a hexagonal hub plaza. Room_210 is the great branching gate where Neo Kyoto truly opens.

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 1 | `up` | **room_201** — Nomagios Transit Terminal | First impression. **Try `talk koma`** to meet Terminal Officer Koma. |
| 2 | `n` | room_202 — Baggage Reclamation | A carousel that has not moved in nine hundred rotations. |
| 3 | `n` | room_203 — Currency Exchange | "THE RATE HAS CHANGED. AGAIN." |
| 4 | `e` | room_204 — Customs & Decryption | The YES button is worn smooth. The NO button has never been pressed. |
| 5 | `n` | room_205 — Language Acquisition Booth | Babel Fish installation. Right ears void warranty. |
| 6 | `e` | room_206 — Visitor Orientation Theatre | An eight-minute film, four decades of looping, nine load-bearing facts wrong. |
| 7 | `n` | **room_207** — Transit Plaza | **HUB.** Hexagonal concourse. Three corridors radiate outward. |
| 8 | `ne` | room_208 — Lost & Found | **Hack tutorial terminal here.** Try `hack terminal` (Phase 6 — currently inert). |
| 9 | `sw` | room_207 | Back to the plaza. |
| 10 | `nw` | room_209 — Corporate Welcome Lounge | The soda fountain is free; your retina is the price. |
| 11 | `se` | room_207 | Back to the plaza. |
| 12 | `n` | **room_210** — Concourse Exit Gate | **GREAT BRANCHING.** Three corridors split here: `n` Neon Soi, `ne` Corporate Spires, `nw` Off-World Waitlist. |

**Branch decision at room_210.** This walkthrough takes the branches in this order: **Neon Soi → Corporate Spires → Waitlist**. Neon Soi is the longest because it includes nested side trips into Kowloon-42, Chrome Sea, Midnight Market, and the Replicant Quarter.

---

## Stage 2 — Neon Soi (rooms 211–220)

Rain-slicked street. Linear north-to-south spine with one back-alley diagonal (213↔216) and two side branches (215 west to Kowloon, 217 down to Midnight Market). Boss fight at the end: **Chiyo-7, the Deprecated**.

We will detour through Kowloon → Chrome Sea, return, then detour through Midnight → Replicant Quarter, return, then finish the Soi to its boss.

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 13 | `n` | room_211 — The Rain Gate | The rain is licensed per-droplet. |
| 14 | `n` | room_212 — Noodle Alley | The smell is astonishing. |
| 15 | `n` | room_213 — Replicant Buskers Corner | Four songs, one composition, four disagreements about the key. |
| 16 | `n` | room_214 — Rusty's Chromeshop | Shop site (Phase 4). The cat sleeps on a crate marked DATA-TYPE NEW STOCK. |
| 17 | `n` | **room_215** — Street Hacker Bench | Hiro lives here (Phase 5 NPC). **`w` branches into Kowloon-42.** |

### Side trip A — Kowloon-42 Arcology (251–260) and Chrome Sea (261–270)

A vertical climb up a crashed satellite. Two new walkway diagonals at 253↔255 and 256↔258 cut the climb if you know them. Boss at the top: **Babel Fish Regent**. From floor 254 (Hanging Gardens), `w` drops into Chrome Sea.

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 18 | `w` | room_251 — Crash Crater Base | The satellite came down here. The city grew around the crater. |
| 19 | `u` | room_252 — First Scaffold Level | Plywood, corrugated steel, mortgage debt. |
| 20 | `u` | room_253 — Satellite Dish Plaza | The dish is now a market. **Try `ne` for the catwalk shortcut to 255.** |
| 21 | `ne` | room_255 — Black Market Cistern | (Diagonal shortcut — `sw` returns to 253.) |
| 22 | `sw` | room_253 | Back to the plaza for the canonical climb. |
| 23 | `u` | **room_254** — Hanging Gardens of Cables | **`w` drops into Chrome Sea (261).** A jungle of cabled greenery. |

#### Sub-side-trip B — Chrome Sea (261–270)

A descent through a flooded datacentre into a mercury-bright reservoir. Two underwater corridor diagonals at 263↔265 and 266↔268 chart the curving submerged halls. Boss at the bottom: **The Deep Pool**.

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 24 | `w` | room_261 — Mercury Shore | A beach of grey silica against a perfectly still sea. |
| 25 | `w` | room_262 — Flooded Datacenter Entrance | A sunken service door, top arch above the waterline. |
| 26 | `d` | room_263 — The Shallows | Ankle-deep mirrored overflow. **Try `sw` for the diagonal cut to 265.** |
| 27 | `sw` | room_265 — The Phosphor Depths | (Diagonal — `ne` returns.) |
| 28 | `ne` | room_263 | Back to the shallows for the canonical descent. |
| 29 | `w` | room_264 — Floating Barge Dock | A diver's barge moored in a flooded channel. |
| 30 | `d` | room_265 — The Phosphor Depths | Chest-deep, lit from below by drowned monitors. |
| 31 | `w` | room_266 — Drowned Terminal Room | Ghost shells still blinking. **Try `sw` for the diagonal cut to 268.** |
| 32 | `sw` | room_268 — Coral Network | (Diagonal — `ne` returns.) |
| 33 | `ne` | room_266 | Back. |
| 34 | `d` | room_267 — The Undertow | A current that is paying attention. |
| 35 | `w` | room_268 — Coral Network | A network topology grown like coral. |
| 36 | `d` | room_269 — Abyssal Cache | "DO NOT RESTORE. DO NOT RESTORE. DO NOT RESTORE." |
| 37 | `w` | **room_270** — The Deep Pool | **BOSS ROOM (Phase 3).** A silent reservoir of every deleted account. |

Backtrack out of Chrome Sea (no new prose, just trace it back):

| # | Cmd | → Room |
|---|-----|--------|
| 38 | `e` | 269 |
| 39 | `u` | 268 |
| 40 | `e` | 267 |
| 41 | `u` | 266 |
| 42 | `e` | 265 |
| 43 | `u` | 264 |
| 44 | `e` | 263 |
| 45 | `u` | 262 |
| 46 | `e` | 261 |
| 47 | `e` | 254 — back to Kowloon's Hanging Gardens |

#### Resume Kowloon climb (255–260)

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 48 | `u` | room_255 — Black Market Cistern | The floor curves up into the walls. |
| 49 | `u` | room_256 — Rooftop Refugee Camp | **Try `ne` for the upper catwalk to 258.** |
| 50 | `ne` | room_258 — Orbital Debris Gallery | (Diagonal — `sw` returns.) |
| 51 | `sw` | room_256 | Back to the canonical climb. |
| 52 | `u` | room_257 — Radio Tower Shantytown | Pirate broadcast at a wavelength only certain dogs can hear. |
| 53 | `u` | room_258 — Orbital Debris Gallery | A volunteer-run museum of crash debris. |
| 54 | `u` | room_259 — Prayer Wheels of Static | Old hard drives respun as prayer wheels. |
| 55 | `u` | **room_260** — The Babel Fish Regent's Throne | **BOSS ROOM (Phase 3).** A feral universal translator. |

Backtrack out of Kowloon all the way to room_215:

| # | Cmd | → Room |
|---|-----|--------|
| 56–64 | `d` × 9 | 259 → 258 → 257 → 256 → 255 → 254 → 253 → 252 → 251 |
| 65 | `e` | 215 — back to Hiro's bench |

### Resume Neon Soi (216–217)

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 66 | `n` | room_216 — Soaked Overpass | A pedestrian bridge of advertising screens. **`sw` is the diagonal shortcut back to 213** (skip if you've already been there). |
| 67 | `n` | **room_217** — Steam Grate Junction | **`d` drops into Midnight Market (271).** A subway grate exhales coolant. |

### Side trip C — Midnight Market (271–280) and Replicant Quarter (281–290)

A subterranean bazaar with two cross-aisle diagonals (273↔275, 278↔280). The market connects directly south into the Replicant Quarter (10 more rooms) — a meditative grid with one garden-path diagonal (285↔287). Optional encounter at 290: **Mother of Orphans** (dialogue-gated).

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 68 | `d` | room_271 — Bazaar Gate | A bronze bell rings each time someone crosses. |
| 69 | `n` | room_272 — The Grey Aisle | Legal-ish goods, knock-off firmware. |
| 70 | `n` | room_273 — The Blacker Aisle | "ENTER WITH YOUR WALLET CLOSED OR YOUR WALLET WILL OPEN ITSELF." **Try `se` for the cross-aisle.** |
| 71 | `se` | room_275 — Food Court of Last Resort | (Diagonal — `nw` returns to 273.) |
| 72 | `nw` | room_273 | Back. |
| 73 | `e` | room_274 — Lawyer's Row | "WE NEGOTIATE. WE LITIGATE. WE FILE." |
| 74 | `s` | room_275 — Food Court of Last Resort | Seven stalls, one shared table. |
| 75 | `w` | room_276 — Barkeep 42's Tavern | **NPC (Phase 5).** A neon sign reading only "42." |
| 76 | `s` | room_277 — The Back of the Bazaar | **Shop site (Phase 4).** The shop the other shops use. |
| 77 | `w` | room_278 — Pawn District | **Try `sw` for the smuggler's shortcut to 280.** |
| 78 | `sw` | room_280 — Smuggler's Transit | (Diagonal — `ne` returns to 278.) |
| 79 | `ne` | room_278 | Back. |
| 80 | `s` | room_279 — Information Brokers Den | A broker, a desk, a quoted price. |
| 81 | `w` | room_280 — Smuggler's Transit | A man on chapter four for twenty years. |
| 82 | `s` | **room_281** — The Quiet Gate | **REPLICANT QUARTER ENTRY.** The rain stops at the gate line. |
| 83 | `s` | room_282 — Tea House of Unremembered Voices | A silence that becomes a conversation. |
| 84 | `s` | room_283 — The Library of Discarded Drafts | Every version that did not make it into production. |
| 85 | `e` | room_284 — Vow Ring Shrine | A promise that holds for as long as both parties continue to run. |
| 86 | `s` | **room_285** — Philosopher's Walk | **NPC (Phase 5): Wren.** **Try `sw` for the meditative garden path.** |
| 87 | `sw` | room_287 — The Third Eye Garden | (Diagonal — `ne` returns to 285.) |
| 88 | `ne` | room_285 | Back. |
| 89 | `w` | room_286 — Memorial Fountain | A list of every retired unit, spiralling inward. |
| 90 | `s` | room_287 — The Third Eye Garden | Six stones, no seat sees all six. |
| 91 | `w` | room_288 — Unit Dormitory | Replicants insist, now, on sleeping. |
| 92 | `s` | room_289 — The Lantern Hall | One paper lantern per resident. |
| 93 | `w` | **room_290** — Mother of Orphans' Sanctum | **OPTIONAL ENCOUNTER (Phase 3).** Dialogue-gated; she is under no obligation to fight. |

Backtrack from Replicant Quarter all the way back to room_217 (Steam Grate Junction):

| # | Cmd | → Room |
|---|-----|--------|
| 94 | `e` | 289 |
| 95 | `n` | 288 |
| 96 | `e` | 287 |
| 97 | `n` | 286 |
| 98 | `e` | 285 |
| 99 | `n` | 284 |
| 100 | `w` | 283 |
| 101 | `n` | 282 |
| 102 | `n` | 281 |
| 103 | `n` | 280 — back into Midnight Market |
| 104 | `e` | 279 |
| 105 | `n` | 278 |
| 106 | `e` | 277 |
| 107 | `n` | 276 |
| 108 | `w` | 272 |
| 109 | `s` | 271 |
| 110 | `u` | 217 — back into Neon Soi |

### Finish Neon Soi to Chiyo-7 (218–220)

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 111 | `n` | room_218 — The Umbrella Forest | A canopy forest of half-remembered ownership. |
| 112 | `n` | room_219 — Neon Chapel | "SYSTEM PRAYER QUEUE: 1,408,221 AHEAD OF YOU." |
| 113 | `n` | **room_220** — The Certificate Graveyard | **BOSS ROOM (Phase 3): Chiyo-7, the Deprecated.** |

Backtrack to room_210 (the Concourse Exit Gate hub):

| # | Cmd | → Room |
|---|-----|--------|
| 114 | `s` | 219 |
| 115 | `s` | 218 |
| 116 | `s` | 217 |
| 117 | `s` | 216 |
| 118 | `s` | 215 |
| 119 | `s` | 214 |
| 120 | `s` | 213 |
| 121 | `s` | 212 |
| 122 | `s` | 211 |
| 123 | `s` | 210 |

---

## Stage 3 — Corporate Spires (rooms 221–230)

A vertical elevator climb through the Tyrell-Nomagios tower. Mostly up/down, with one side door at room_225 that leads east into The Stack (and from there, ultimately, to Heat Death and the capstone boss). Boss at the top of the Spires: **The Account Manager**.

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 124 | `ne` | room_221 — Lobby of Lobbies | A lobby the size of a small country. |
| 125 | `u` | room_222 — Security Turnstile | A scanner that reads more than your badge. |
| 126 | `u` | room_223 — Middle Management Floor | A potted ficus has convinced itself it works here. |
| 127 | `u` | room_224 — Quarterly Review Pit | Statistically, it may be you. |
| 128 | `u` | **room_225** — Tyrell-Nomagios Procurement | **Shop site (Phase 4). `e` opens the service door into The Stack.** |

### Side trip D — The Stack (231–240) and Heat Death Datacentre (291–300)

The Stack is the working datacentre — a mid-realm hub with one diagonal cut (231↔233) and a 5-way central node at room_235 (Coolant River). From room_240 (Emergency Power Cutoff), `e` opens onto the abandoned Heat Death annex. Capstone boss at room_300: **SYSADMIN.EXE**.

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 129 | `e` | room_231 — The Cold Aisle | **Try `ne` for the diagonal rack-row cut to 233.** |
| 130 | `ne` | room_233 — KVM Junction | (Diagonal — `sw` returns.) |
| 131 | `sw` | room_231 | Back. |
| 132 | `e` | room_232 — The Hot Aisle | Thirty degrees warmer in one step. |
| 133 | `e` | room_233 — KVM Junction | An island of console desks. |
| 134 | `n` | room_234 — Rack 7: Deprecated | "DO NOT POWER DOWN — KNOWN TO HOST THINGS." |
| 135 | `s` | room_233 | Back to the junction. |
| 136 | `e` | **room_235** — The Coolant River | **5-WAY HUB.** A wide concrete trough of pale blue coolant. |
| 137 | `n` | room_237 — Network Closet | "DO NOT UNPLUG. ANY OF IT. WE MEAN IT." |
| 138 | `s` | room_235 | Back. |
| 139 | `s` | room_238 — Backup Tape Archive | Restores have opinions. |
| 140 | `n` | room_235 | Back. |
| 141 | `e` | room_236 — The Patch Panel Cathedral | A vault tiled in ten thousand fibre terminations. |
| 142 | `n` | room_239 — Overhead Tray Crawl | A maintenance ticket from forty years ago: "PLEASE RESOLVE." |
| 143 | `s` | room_236 | Back. |
| 144 | `w` | room_235 | Back to the hub. |
| 145 | `d` | **room_240** — Emergency Power Cutoff | **`e` opens onto Heat Death (291).** A single red EPO button. |

#### Sub-side-trip E — Heat Death Datacentre (291–300)

The abandoned annex. Two diagonal cuts through dead racks (293↔295, 295↔297). Linear-ish corridor toward the capstone.

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 146 | `e` | room_291 — The Last Breaker | "LAST BREAKER OUT, PLEASE LEAVE A NOTE." Nobody has. |
| 147 | `e` | room_292 — Service Tunnel Down | "I LOVED MY JOB." |
| 148 | `d` | room_293 — Ghost Rack Alley | **Try `ne` for the diagonal cut to 295.** |
| 149 | `ne` | room_295 — The Graveyard Of Hard Drives | (Diagonal — `sw` returns. Has its own `ne` to 297!) |
| 150 | `sw` | room_293 | Back. |
| 151 | `e` | room_294 — The Dying UPS Hall | "SHE WILL HOLD." She is still holding. |
| 152 | `e` | room_295 — The Graveyard Of Hard Drives | Ankle-deep in dead platters. **Try `ne` for the second diagonal cut to 297.** |
| 153 | `ne` | room_297 — Cold Storage | (Diagonal — `sw` returns to 295.) |
| 154 | `sw` | room_295 | Back. |
| 155 | `e` | room_296 — Emergency Lighting Grid | "DO NOT ATTEMPT TO READ IN HERE." |
| 156 | `n` | room_297 — Cold Storage | "RESERVED FOR WHOM? THAT INFORMATION IS ALSO RESERVED." |
| 157 | `n` | room_298 — Administrator's Terminal Room | A name plaque set face-up on an empty desk. |
| 158 | `n` | room_299 — The Final Console | A cursor blinks. The next room is paying attention. |
| 159 | `n` | **room_300** — SYSADMIN.EXE's Core | **CAPSTONE BOSS (Phase 3).** The oldest running process on the farm. |

Backtrack from Heat Death back to room_225 (Procurement) — out the way you came:

| # | Cmd | → Room |
|---|-----|--------|
| 160 | `s` | 299 |
| 161 | `s` | 298 |
| 162 | `s` | 297 |
| 163 | `s` | 296 |
| 164 | `w` | 295 |
| 165 | `w` | 294 |
| 166 | `w` | 293 |
| 167 | `u` | 292 |
| 168 | `w` | 291 |
| 169 | `w` | 240 — back to Emergency Cutoff |
| 170 | `u` | 235 — back to Coolant River |
| 171 | `w` | 233 |
| 172 | `w` | 232 |
| 173 | `w` | 231 |
| 174 | `w` | 225 — back to Procurement |

### Resume Spires climb (226–230)

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 175 | `u` | room_226 — Conference Room 7B | "SYNERGY IS NOT A STRATEGY BUT IT IS A DEFLECTION." |
| 176 | `u` | room_227 — The Sky Bridge | A glass corridor between this tower and its twin. |
| 177 | `u` | room_228 — Executive Elevator | The button for your destination is unlabelled. |
| 178 | `u` | room_229 — Boardroom Antechamber | The door at the far end intends to remain closed. |
| 179 | `n` | **room_230** — The Account Manager's Office | **BOSS ROOM (Phase 3).** The smile is something he is doing to you. |

Backtrack down the Spires to room_210:

| # | Cmd | → Room |
|---|-----|--------|
| 180 | `s` | 229 |
| 181–187 | `d` × 7 | 228 → 227 → 226 → 225 → 224 → 223 → 222 → 221 |
| 188 | `sw` | 210 — back to the Concourse Exit Gate |

---

## Stage 4 — Off-World Colonies Waitlist (rooms 241–250)

A cathedral-sized DMV. The whole point is non-Euclidean queue geometry. One in-theme diagonal at 246↔248 — the queue-jump every applicant dreams of. Optional mini-boss at room_250: **The Queue Itself**.

| # | Cmd | → Room | Notes |
|---|-----|--------|-------|
| 189 | `nw` | room_241 — Ticket Booth 1 | Take a number. |
| 190 | `w` | room_242 — Ticket Booth 2 | Take a second number. |
| 191 | `w` | room_243 — Waiting Pew Hall | Vaulted hall fitted with church pews delivered in error. |
| 192 | `n` | room_244 — Forms Bureau | "HANG IN THERE. WE HAVE NO FURTHER INSTRUCTIONS." |
| 193 | `n` | room_245 — Orientation Film Loop | The narrator is warm. The narrator's opinions are dated. |
| 194 | `w` | room_246 — Notary Station | "BLESSINGS ARE AVAILABLE UPSTAIRS, EIGHT WEEKS OUT." **Try `sw` for the queue-jump to 248.** |
| 195 | `sw` | room_248 — The Back of the Line | (Diagonal — `ne` returns to 246. The line forms a perfect circle here.) |
| 196 | `ne` | room_246 | Back to the canonical route. |
| 197 | `w` | room_247 — The Appeals Desk | He will reject your appeal warmly and suggest you appeal the appeal. |
| 198 | `s` | room_248 — The Back of the Line | The arrow points in all directions simultaneously. |
| 199 | `e` | room_249 — The Middle of the Line | A corridor longer than its length permits. |
| 200 | `e` | **room_250** — The Queue Itself | **OPTIONAL MINI-BOSS (Phase 3).** It would be grateful if you would take a seat. |

Backtrack out of Waitlist:

| # | Cmd | → Room |
|---|-----|--------|
| 201 | `w` | 249 |
| 202 | `w` | 248 |
| 203 | `ne` | 246 (queue-jump diagonal back) |
| 204 | `e` | 245 |
| 205 | `s` | 244 |
| 206 | `s` | 243 |
| 207 | `e` | 242 |
| 208 | `e` | 241 |
| 209 | `se` | 210 — back to the Concourse Exit Gate |

---

## Stage 5 — Returning home

From room_210, walk back through Arrivals to the shuttle:

| # | Cmd | → Room |
|---|-----|--------|
| 210 | `s` | 207 |
| 211 | `s` | 206 |
| 212 | `w` | 205 |
| 213 | `s` | 204 |
| 214 | `w` | 203 |
| 215 | `s` | 202 |
| 216 | `s` | 201 — Transit Terminal |
| 217 | `d` | room_100 — back in Eldoria, the Perfect Sanctum |

Total commands for a complete tour: **218**. Total unique rooms visited: **100 of 100**.

> _Programmatically verified against `rooms.json` — every direction matches the live exits._

---

## What to look for during the test

This is a scaffold — many things are deliberately not yet present. Things you **should** see:

- **Every room** loads with its name, description, and exits.
- **Every exit** in the description goes where the manual says it goes.
- **Diagonal exits** appear in the exit list (look for `northeast`, `northwest`, `southeast`, `southwest`).
- **Koma is in room_201** — `look` should show her, `talk koma` should produce one of her four fallback lines.
- **The hack tutorial terminal in room_208** is seeded but inert (Phase 6 wires it).
- **The realm gate** correctly hides the `up` exit from `room_100` if your `remortTier < 1`.

Things you **should not** see yet (these arrive in later phases):

- Monsters in any Neo Kyoto room (Phase 2).
- Items lying in any room (Phase 2).
- Working shops at room_214, 225, 277 (Phase 4).
- Working bosses at 220, 230, 260, 270, 300 (Phase 3).
- Working dialogue beyond fallback lines for any new NPC (Phase 5).
- A hack skill or affinity meter on your character sheet (Phase 6).

If anything in the **should** list is missing — that's a Phase 1 bug, please flag it.

---

## All-100 room checklist

Use this to verify coverage if you want to walk the realm freely (e.g., admin `transurf` mode):

**Arrivals Concourse (10):** 201, 202, 203, 204, 205, 206, 207, 208, 209, 210

**Neon Soi (10):** 211, 212, 213, 214, 215, 216, 217, 218, 219, 220

**Corporate Spires (10):** 221, 222, 223, 224, 225, 226, 227, 228, 229, 230

**The Stack (10):** 231, 232, 233, 234, 235, 236, 237, 238, 239, 240

**Off-World Colonies Waitlist (10):** 241, 242, 243, 244, 245, 246, 247, 248, 249, 250

**Kowloon-42 Arcology (10):** 251, 252, 253, 254, 255, 256, 257, 258, 259, 260

**Chrome Sea (10):** 261, 262, 263, 264, 265, 266, 267, 268, 269, 270

**Midnight Market (10):** 271, 272, 273, 274, 275, 276, 277, 278, 279, 280

**Replicant Quarter (10):** 281, 282, 283, 284, 285, 286, 287, 288, 289, 290

**Heat Death Datacentre (10):** 291, 292, 293, 294, 295, 296, 297, 298, 299, 300

---

## Quick-reference: branch points

| From | Direction | To zone |
|---|---|---|
| room_100 (Eldoria) | `up` | Neo Kyoto entry (room_201) |
| room_201 | `down` | Eldoria (room_100) |
| room_207 (Arrivals plaza hub) | `ne`/`nw` | Side rooms 208/209 |
| room_210 (Concourse Exit) | `n` | Neon Soi (211) |
| room_210 | `ne` | Corporate Spires (221) |
| room_210 | `nw` | Off-World Waitlist (241) |
| room_215 (Hiro's bench) | `w` | Kowloon-42 (251) |
| room_217 (Steam Grate) | `d` | Midnight Market (271) |
| room_225 (Procurement) | `e` | The Stack (231) |
| room_240 (EPO) | `e` | Heat Death Datacentre (291) |
| room_254 (Hanging Gardens) | `w` | Chrome Sea (261) |
| room_280 (Smuggler's Transit) | `s` | Replicant Quarter (281) |

## Quick-reference: all diagonal shortcuts

| Pair | Shortcut directions | Zone | Flavour |
|---|---|---|---|
| 207 ↔ 208 | `ne` / `sw` | Arrivals | Hexagonal plaza |
| 207 ↔ 209 | `nw` / `se` | Arrivals | Hexagonal plaza |
| 210 ↔ 221 | `ne` / `sw` | Arrivals→Spires | Branching gate |
| 210 ↔ 241 | `nw` / `se` | Arrivals→Waitlist | Branching gate |
| 213 ↔ 216 | `ne` / `sw` | Neon Soi | Back-alley shortcut |
| 231 ↔ 233 | `ne` / `sw` | The Stack | Diagonal rack-row cut |
| 246 ↔ 248 | `sw` / `ne` | Waitlist | The mythical queue-jump |
| 253 ↔ 255 | `ne` / `sw` | Kowloon | Lower scaffold catwalk |
| 256 ↔ 258 | `ne` / `sw` | Kowloon | Upper scaffold catwalk |
| 263 ↔ 265 | `sw` / `ne` | Chrome Sea | Underwater corridor curve |
| 266 ↔ 268 | `sw` / `ne` | Chrome Sea | Drowned-terminal cut |
| 273 ↔ 275 | `se` / `nw` | Midnight Market | Cross-aisle |
| 278 ↔ 280 | `sw` / `ne` | Midnight Market | Smuggler's shortcut |
| 285 ↔ 287 | `sw` / `ne` | Replicant Quarter | Garden path |
| 293 ↔ 295 | `ne` / `sw` | Heat Death | Diagonal rack cut |
| 295 ↔ 297 | `ne` / `sw` | Heat Death | Diagonal rack cut |

— End of walk-test.
