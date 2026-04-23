# THE SHATTERED REALMS MUD - ADMIN GUIDE v2.0
## Realistic Implementation Edition

---

## Table of Contents
1. [Implementation Roadmap](#implementation-roadmap)
2. [Complete Game Map](#complete-game-map)
3. [Combat & Progression System](#combat--progression-system)
4. [Monster Bestiary Reference](#monster-bestiary-reference)
5. [Item & Loot System](#item--loot-system)
6. [Admin Commands Reference](#admin-commands-reference)
7. [Multiplayer Features](#multiplayer-features)
8. [Future Extensions (Optional)](#future-extensions-optional)

---

## Implementation Roadmap

### **PHASE 1: Combat Foundation** ✅ PRIORITY
**Goal:** Create a functional turn-based combat system

**Features:**
- Player health points (HP)
- `attack [monster]` command
- Turn-based combat loop (player attacks → monster attacks → repeat)
- Damage calculation based on stats
- Death and respawn mechanics
- Victory rewards (experience points)

**Testing Checklist:**
- [ ] Can attack wandering monsters
- [ ] Combat is turn-based and fair
- [ ] Death returns player to room 001
- [ ] XP is awarded for victories

---

### **PHASE 2: Experience & Leveling** ✅ PRIORITY
**Goal:** Create meaningful character progression

**Features:**
- 15 levels of progression (Novice → Immortal Wizard)
- XP requirements per level
- Level-up increases HP and damage
- Title changes with level
- Boss monsters at fixed locations (3 legendary bosses)

**Level Progression Table:**

| Level | Title | XP Required | HP | Base Damage |
|-------|-------|-------------|-----|-------------|
| 1 | Novice Seeker | 0 | 50 | 5-10 |
| 2 | Initiate of the Arcane | 100 | 60 | 6-12 |
| 3 | Apprentice Mage | 250 | 70 | 7-14 |
| 4 | Adept Spellcaster | 500 | 85 | 9-16 |
| 5 | Journeyman Wizard | 850 | 100 | 10-18 |
| 6 | Adept of Elements | 1300 | 120 | 12-20 |
| 7 | Master of Mysteries | 1900 | 140 | 14-22 |
| 8 | Keeper of Secrets | 2600 | 165 | 16-24 |
| 9 | High Sorcerer | 3400 | 190 | 18-28 |
| 10 | Arcane Lord/Lady | 4400 | 220 | 20-32 |
| 11 | Grand Wizard | 5600 | 250 | 23-36 |
| 12 | Supreme Mage | 7000 | 285 | 26-40 |
| 13 | Archmage | 8600 | 325 | 30-45 |
| 14 | Archmage Supreme | 10400 | 370 | 34-50 |
| 15 | Immortal Wizard | 12500 | 450 | 40-60 |

**Testing Checklist:**
- [ ] XP accumulates correctly
- [ ] Level-ups happen at right thresholds
- [ ] HP increases with each level
- [ ] Title changes display correctly
- [ ] Can view current stats with `score` command

---

### **PHASE 3: Inventory System** ✅ PRIORITY
**Goal:** Items, loot, and equipment

**Features:**
- Inventory array (max 20 items)
- `get [item]` - pick up items from room
- `drop [item]` - drop items in current room
- `inventory` (or `i`) - list your items
- `examine [item]` - detailed item description
- Loot drops when monsters die
- Equipment slots: weapon, armor, shield

**Item Categories:**

1. **Weapons** (increase damage)
   - Rusty Dagger (Level 1) - +2 damage
   - Crystal Blade (Level 4) - +6 damage
   - Forge Hammer (Level 7) - +10 damage
   - Storm Feather Blade (Level 10) - +15 damage
   - Void Shard Sword (Level 13) - +20 damage

2. **Armor** (reduces damage taken)
   - Leather Vest (Level 1) - -2 damage taken
   - Thorn Armor (Level 4) - -5 damage taken
   - Crystal Plate (Level 7) - -8 damage taken
   - Shade Robe (Level 10) - -12 damage taken
   - Arcane Crystal Armor (Level 13) - -18 damage taken

3. **Consumables** (one-time use)
   - Minor Healing Potion - Restores 30 HP
   - Greater Healing Potion - Restores 75 HP
   - Superior Healing Potion - Restores 150 HP

4. **Treasure** (valuable collectibles)
   - Memory Fragment
   - Crystal Silk
   - Golem Core
   - Star Fragment
   - Void Shard

**Equipment Commands:**
- `equip [weapon/armor]` - wear equipment
- `unequip [weapon/armor]` - remove equipment
- `equipment` - show currently equipped items

**Testing Checklist:**
- [ ] Can pick up and drop items
- [ ] Inventory displays correctly
- [ ] Equipment affects combat stats
- [ ] Loot appears when monsters die
- [ ] Consumables work and disappear after use

---

### **PHASE 4: Player Persistence** ✅ PRIORITY
**Goal:** Save character progress between sessions

**Features:**
- Automatic save on disconnect
- Load character data on reconnect
- Save file: `players/[name].json`

**Saved Data:**
- Character name
- Current level and XP
- Current HP (and max HP)
- Current location (room ID)
- Inventory contents
- Equipped items
- Respawn count (deaths)

**Commands:**
- `save` - manual save (auto-saves anyway)
- `score` - display all character stats
- `quit` - save and disconnect

**Testing Checklist:**
- [ ] Character saves on disconnect
- [ ] Character loads on reconnect
- [ ] All stats persist correctly
- [ ] Inventory and equipment restore
- [ ] Location is remembered

---

### **PHASE 5: Multiplayer Features** ✅ PRIORITY
**Goal:** Player interaction and communication

**Features:**
- See other players in rooms
- Local and global chat
- Social commands
- Player list

**Commands:**

1. **Communication:**
   - `say [message]` - talk to players in same room
   - `shout [message]` - talk to all players worldwide
   - `tell [player] [message]` - private message
   - `emote [action]` - express actions (e.g., "Mark smiles")

2. **Information:**
   - `who` - list all online players
   - `score` - your character stats
   - `whois [player]` - view another player's level/title

**Player Visibility:**
When you `look` in a room with other players:
```
=== The Crystal Grotto ===
[Room description]
Exits: north, east, south

A Crystal Spider skitters nervously.
Alice the Apprentice Mage is here.
Bob the Novice Seeker is here.
```

**Testing Checklist:**
- [ ] Can see other players in rooms
- [ ] `say` command works locally
- [ ] `shout` reaches all players
- [ ] `who` lists online players
- [ ] `emote` displays properly

---

### **PHASE 6: Admin Commands** ✅ PRIORITY
**Goal:** Server management and player moderation

**Server Management:**
```
admin status              - Comprehensive server status
shutdown [message]        - Graceful shutdown with warning
save_all                 - Force save all player data
list_players             - Detailed player information
server_stats             - Active monsters, players, uptime
```

**Player Management:**
```
kick <player>            - Disconnect player from server
goto <player>            - Teleport to player's location
bring <player>           - Teleport player to your location
send <player> <room>     - Send player to specific room
transurf <room>          - Admin teleport (already implemented)
```

**Character Management:**
```
set_level <player> <level>     - Set player's level
give_exp <player> <amount>     - Award experience points
give_item <player> <item>      - Give item to player
heal <player>                  - Restore player to full HP
heal_all                       - Heal all online players
```

**Communication:**
```
broadcast <message>      - Send system message to all players
god_say <message>        - Speak with divine authority
```

**World Management:**
```
spawn <monster> <room>   - Create monster in specific room
despawn <monster_id>     - Remove specific monster
reset_monsters           - Reset all monster spawns
```

**Testing Checklist:**
- [ ] All admin commands work
- [ ] Only admins can use commands
- [ ] `broadcast` reaches all players
- [ ] Teleport commands function correctly
- [ ] Character modification works

---

## Complete Game Map

### Zone Layout (100 Rooms Total)

**Starting Chamber** (Rooms 001-005)
- 001: The Awakening Chamber [SPAWN POINT]
- 002: Hall of Echoing Memories
- 003: The Nexus Antechamber
- 004: Garden of First Steps
- 005: The Threshold of Departure

**Crystal Caverns** (Rooms 006-015)
- Zone Theme: Glittering crystals, magical light
- Wandering Monsters: Crystal Spiders, Gem Golems, Prismatic Bats
- Boss: Crystal Dragon (Room 015) - Level 5+ recommended

**Floating Gardens** (Rooms 016-025)
- Zone Theme: Aerial platforms, magical plants
- Wandering Monsters: Garden Sprites, Thorn Guardians, Floating Jellyfish
- Mini-Boss: Ancient Treant (Room 020) - Level 6+ recommended

**Shadow Marshes** (Rooms 026-035)
- Zone Theme: Dark, foggy, dangerous
- Wandering Monsters: Marsh Wraiths, Shadow Frogs, Will-o-Wisps
- Boss: Shadow Lord (Room 035) - Level 8+ recommended

**Tower of Winds** (Rooms 036-045)
- Zone Theme: Ascending tower, increasing wind
- Wandering Monsters: Wind Elementals, Storm Hawks, Cloud Sheep
- Mini-Boss: Wind Elemental (Room 040) - Level 9+ recommended

**Molten Forges** (Rooms 046-055)
- Zone Theme: Heat, fire, smithing
- Wandering Monsters: Fire Salamanders, Forge Golems, Ember Sprites
- Mini-Boss: Forge Master (Room 050) - Level 10+ recommended

**Ethereal Library** (Rooms 056-065)
- Zone Theme: Knowledge, books, silence
- Wandering Monsters: Knowledge Seekers, Paper Dragons, Bookworms
- Mini-Boss: The Librarian (Room 062) - Level 11+ recommended

**Storm Peaks** (Rooms 066-075)
- Zone Theme: Mountains, lightning, storms
- Wandering Monsters: Lightning Elementals, Thunder Birds, Storm Clouds
- Boss: Storm Lord (Room 072) - Level 12+ recommended

**Void Nexus** (Rooms 076-085)
- Zone Theme: Reality distortion, emptiness
- Wandering Monsters: Void Walkers, Reality Worms, Null Entities
- Mini-Boss: Void Heart (Room 080) - Level 13+ recommended

**Celestial Observatory** (Rooms 086-095)
- Zone Theme: Stars, cosmos, wonder
- Wandering Monsters: Star Guardians, Cosmic Horrors, Nebula Wisps
- Mini-Boss: Star Sage (Room 090) - Level 14+ recommended

**Archmage Sanctum** (Rooms 096-100)
- Zone Theme: Ultimate power, final challenge
- Wandering Monsters: Arcane Sentinels, Mage Shades, Living Spells
- FINAL BOSS: The Archmage Supreme (Room 100) - Level 15 required

---

## Combat & Progression System

### Combat Mechanics

**Turn-Based Combat Flow:**
1. Player enters combat: `attack [monster]`
2. Player attacks (roll damage)
3. Monster attacks back (roll damage)
4. Repeat until victory or death

**Damage Calculation:**
```
Player Damage = Base Damage (level-based) + Weapon Bonus + Random(1-5)
Monster Damage = Monster STR + Random(1-10)
Damage Taken = Monster Damage - Armor Reduction
```

**Combat Commands:**
```
attack [monster]     - Initiate combat
flee                - 50% chance to escape (lose 10% current HP)
use [potion]        - Use consumable during combat
```

**Death Mechanics:**
- Player respawns at Room 001 (The Awakening Chamber)
- Lose 10% of current XP (doesn't de-level)
- Keep inventory and equipment
- Full HP restored on respawn

**Victory Rewards:**
- Experience points based on monster level
- Loot drops (50-80% chance depending on monster)
- Optional treasure items

---

### Monster Reference (Legendary Bosses)

**Crystal Dragon** (Room 015 - The Sparkling Depths)
- Level: 5
- HP: 200
- Damage: 20-35
- Special: Crystal Beam (30 damage, 25% chance)
- Loot: Crystal Dragon Scale, 500 XP
- Recommended: Level 5+, healing potions

**Shadow Lord** (Room 035 - The Mysterious Marsh)
- Level: 8
- HP: 350
- Damage: 25-45
- Special: Shadow Strike (40 damage, 20% chance)
- Loot: Shadow Crown, 1000 XP
- Recommended: Level 8+, strong armor

**The Archmage Supreme** (Room 100 - The Perfect Sanctum)
- Level: 15
- HP: 800
- Damage: 40-70
- Special: Reality Warp (60 damage + stun, 15% chance)
- Loot: Crown of the Realms, 3000 XP
- Recommended: Level 15, best equipment, multiple healing potions
- Victory: Game completion achievement!

---

## Item & Loot System

### Loot Tables by Zone

**Starting Chamber** (Low-value loot)
- Memory Fragment (Treasure) - 10 gold
- Guardian Essence (Consumable) - Minor heal
- Rusty Dagger (Weapon) - +2 damage

**Crystal Caverns**
- Crystal Silk (Treasure) - 50 gold
- Golem Core (Treasure) - 100 gold
- Crystal Blade (Weapon) - +6 damage
- Crystal Shard Armor (Armor) - -5 damage taken

**Shadow Marshes**
- Wraith Essence (Treasure) - 75 gold
- Shadow Tongue (Treasure) - 60 gold
- Shadow Dagger (Weapon) - +8 damage
- Shade Cloak (Armor) - -7 damage taken

**Molten Forges**
- Salamander Scale (Treasure) - 150 gold
- Forge Hammer (Weapon) - +10 damage
- Ember Heart (Consumable) - Greater heal

**Celestial Observatory**
- Star Fragment (Treasure) - 300 gold
- Nebula Dust (Consumable) - Superior heal
- Cosmic Blade (Weapon) - +18 damage

**Archmage Sanctum**
- Arcane Crystal (Treasure) - 500 gold
- Shade Robe (Armor) - -12 damage taken
- Spell Essence (Consumable) - Full heal

### Item Commands
```
get [item]           - Pick up item from room
drop [item]          - Drop item in current room
inventory (i)        - List your items
examine [item]       - View item details
equip [item]         - Wear weapon/armor
unequip [item]       - Remove equipment
use [item]           - Use consumable
give [item] [player] - Trade with another player
```

---

## Future Extensions (Optional)

These features can be added after core gameplay is solid:

### **Phase 7: NPCs & Dialogue** (Optional)
**5 Key NPCs:**
1. Memory Guide (Room 002) - Tutorial and starting quests
2. Crystal Sage (Room 012) - Crystal lore and hints
3. Garden Keeper (Room 020) - Sells healing potions
4. Forge Master (Room 050) - Weapon upgrades
5. Star Sage (Room 090) - Late-game lore

**Simple Dialogue System:**
```
talk [npc]               - Initiate conversation
ask [npc] about [topic]  - Learn specific information
buy [item] from [npc]    - Purchase from shop NPCs
```

### **Phase 8: Simple Quests** (Optional)
**5 Starter Quests:**
1. "The Awakening" - Explore first 5 rooms
2. "Crystal Hunter" - Collect 5 crystal items
3. "Shadow Survivor" - Survive Shadow Marshes
4. "Master Smith" - Bring ore to Forge Master
5. "Star Seeker" - Reach Celestial Observatory

**Quest Commands:**
```
quests               - List active quests
quest [name]         - View quest details
```

### **Phase 9: Basic Puzzles** (Optional)
**5 Key Puzzles:**
1. Room 003 - "Which path leads to wisdom?" Answer: "all paths"
2. Room 010 - Fire riddle. Answer: "fire"
3. Room 020 - Mountain riddle. Answer: "mountain"
4. Room 040 - Directional puzzle. Answer: "east south west north"
5. Room 080 - Reality puzzle. Answer: "void"

**Puzzle Commands:**
```
answer [solution]    - Attempt puzzle solution
hint                - Get a hint (if available)
```

### **Phase 10: Basic Spells** (Optional)
**10 Essential Spells:**

**Tier 1 (Level 1-3):**
1. Light - Illuminate dark rooms
2. Detect Magic - Sense magical items
3. Magic Missile - 15 damage attack

**Tier 2 (Level 4-7):**
4. Heal - Restore 40 HP
5. Fireball - 30 damage attack
6. Shield - Reduce damage by 10 for 3 turns

**Tier 3 (Level 8-11):**
7. Teleport - Return to town
8. Ice Storm - 50 damage attack
9. Greater Heal - Restore 100 HP

**Tier 4 (Level 12+):**
10. Meteor - 80 damage attack

**Spell Commands:**
```
cast [spell]         - Use magic spell
spells               - List known spells
```

**Mana System:**
- Mana = Level × 10
- Spells cost 10-30 mana
- Mana regenerates 5 per combat turn

---

## Quick Reference

### Essential Commands

**Movement:**
- n/s/e/w/ne/nw/se/sw/u/d (shortcuts)
- north/south/east/west/etc (full words)
- go [direction]

**Combat:**
- attack [monster]
- flee
- use [potion]

**Items:**
- get [item] / drop [item]
- inventory / i
- equip [item] / unequip [item]
- examine [item]

**Social:**
- say [message]
- shout [message]
- emote [action]
- who

**Information:**
- look / l
- score
- verbose / brief
- help [command]

**System:**
- save
- quit
- transurf [room] (admin only)

---

## Implementation Priority

✅ **MUST HAVE (Weeks 1-4):**
- Phases 1-4: Combat, Leveling, Inventory, Persistence
- Phase 5: Multiplayer features
- Phase 6: Admin commands

⚠️ **NICE TO HAVE (Weeks 5-8):**
- Phase 7: 5 NPCs with basic dialogue
- Phase 8: 5 simple quests
- Phase 9: 5 puzzles

❓ **OPTIONAL (Future):**
- Phase 10: 10 spells with mana system

---

**This guide represents a realistic, achievable implementation of The Shattered Realms MUD. Focus on building the core gameplay loop first, then extend with optional features as desired.**

**Current Status:** ✅ Phase 0 Complete (World, Rooms, Wandering Monsters)
**Next Up:** Phase 1 - Combat Foundation

---

*Last Updated: January 2026*
*Version: 2.0 - Realistic Implementation Edition*
