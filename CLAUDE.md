# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Development Phase: PHASE 1.75 - Quality of Life ✅ COMPLETE!

### Phase 1: Combat Foundation ✅ COMPLETE!

Successfully implemented full turn-based combat system:
- ✅ Player HP system (starts at 50 HP)
- ✅ "attack [monster]" command with partial name matching
- ✅ Turn-based combat loop (player attacks → monster attacks → repeat)
- ✅ Damage calculation (base damage + random variation)
- ✅ Death mechanics: respawn at room 001 with full HP
- ✅ Victory rewards: XP messages and loot drops
- ✅ Strategic flee system with meaningful risk/reward decisions
- ✅ Color-coded combat messages for clarity

### Phase 2: Experience & Leveling ✅ COMPLETE!

Full 15-level progression system:
- ✅ XP accumulation from monster kills
- ✅ 15 levels with unique titles (Novice Seeker → Immortal Wizard)
- ✅ XP thresholds (100 XP → 12500 XP)
- ✅ HP scaling: 50 HP (Level 1) → 450 HP (Level 15)
- ✅ Damage scaling: 5-10 (Level 1) → 40-60 (Level 15)
- ✅ Level-up celebrations with full HP restore
- ✅ "levels" command to view progression table
- ✅ Death XP penalty (10% loss, no de-leveling)

### Phase 3: Inventory System ✅ COMPLETE!

Full item and equipment system:
- ✅ items.json with 50+ items (weapons, armor, shields, consumables, treasure)
- ✅ Player inventory (max 20 items) with gold tracking
- ✅ Equipment slots: weapon, armor, shield
- ✅ Loot drops spawn actual items in rooms (50% regular, 100% boss)
- ✅ Boss guaranteed drops (unique items)
- ✅ Gold drops from all monster kills
- ✅ Starting gear: Rusty Dagger, Leather Vest, 2x Minor Healing Potions
- ✅ Level requirements for equipment
- ✅ Combat integration: weapon damage bonus, armor damage reduction
- ✅ Commands: get/take, drop, inventory (i), equipment (eq)
- ✅ Commands: equip/wear/wield, unequip/remove, use/drink/eat, examine/inspect
- ✅ Items displayed in room view and score display

### Phase 4: Player Persistence ✅ COMPLETE!

Full save/load system with statistics tracking:
- ✅ players/ directory for character file storage
- ✅ Character name registration on connect (3-12 letters)
- ✅ Existing character detection and loading
- ✅ Auto-save system (every 2 minutes, on level-up, boss defeat, death, disconnect)
- ✅ Manual "save" command with progress display
- ✅ Backup file creation (.bak) before each save
- ✅ Extended statistics tracking:
  - Monsters killed (total and session)
  - Deaths count
  - Bosses defeated (named list)
  - Total damage dealt/taken
  - Rooms explored (unique count)
  - Items collected
- ✅ Gold system: 10% gold loss on death (in addition to 10% XP)
- ✅ Enhanced "score" command with full statistics display
- ✅ Session summary on quit (time played, XP gained, monsters killed, items, gold)
- ✅ Save triggers: disconnect, 2-min interval, level-up, boss defeat, death

### Phase 5: Multiplayer Features ✅ COMPLETE!

Full multiplayer communication and visibility system:
- ✅ Player visibility in rooms (see other players when looking)
- ✅ Movement broadcasts (arrival/departure messages to other players)
- ✅ Combat visibility (other players see combat actions)
- ✅ Connection/disconnection announcements (global + room)
- ✅ Communication commands:
  - say [message] / ' [message] - Local room chat
  - shout [message] / ! [message] - Global chat to all players
  - tell [player] [message] / whisper - Private messages
  - emote [action] / : [action] - Roleplay actions
- ✅ Player information commands:
  - who / players / online - List all online players
  - whois [player] / finger - Detailed player info
- ✅ AFK system:
  - afk [message] - Set away status with optional message
  - back - Return from AFK
  - AFK auto-reply on tell
  - AFK shown in who list and room display
- ✅ Ignore system:
  - ignore [player] - Block messages from player
  - unignore [player] - Remove block
  - ignore - View ignore list
- ✅ AFK auto-clear on movement

### Phase 6: Admin Commands ✅ COMPLETE!

Full server management and moderation system:
- ✅ admins.json configuration file for admin player names
- ✅ bans.json for banned player names
- ✅ isAdmin() permission checking for all admin commands
- ✅ Server management commands:
  - admin status / serverstatus - Server info, uptime, memory, activity log
  - shutdown [message] - Graceful shutdown with 10s warning and auto-save
  - save_all - Force save all online players
  - reload_monsters - Reset all monster spawns
- ✅ Player management commands:
  - kick <player> [reason] - Disconnect player with reason
  - goto <player> - Teleport to player's location
  - bring <player> - Summon player to your location
  - send <player> <room#> - Teleport player to specific room
  - list_players / adminwho - Detailed admin view of all players (HP, IP, time online)
- ✅ Character management commands:
  - set_level <player> <level> - Set player to specific level (1-15)
  - give_exp <player> <amount> - Award experience points
  - give_item <player> <item> - Add item to player's inventory
  - give_gold <player> <amount> - Add gold to player
  - heal <player> - Restore player to full HP
  - heal_all - Restore all online players to full HP
  - revive <player> - Revive dead player at current location
- ✅ Communication commands:
  - broadcast / announce <message> - Send admin announcement to all
  - god_say <message> - Speak with divine authority to all players
  - invisible / invis - Toggle admin invisibility
- ✅ World management commands:
  - spawn <monster> <room#> - Spawn monster in room
  - despawn <monster_id> - Remove monster by ID
  - create_item <item> <room#> - Place item in room
  - modify_room <room#> <property> <value> - Temporary room modifications
- ✅ Information commands:
  - monsters / monsterlist - Show all monsters with IDs (admin sees IDs)
  - admin_score <player> - Complete player data view
  - logs [lines] - Show recent server activity log
- ✅ Testing & debugging commands:
  - test_combat - Spawn weak test monster
  - test_loot - Drop test items in current room
  - god_mode - Toggle invincibility
  - teleport_all <room#> - Move all players to room
- ✅ Ban system:
  - ban <player> - Ban player (kicks if online)
  - unban <player> - Remove from ban list
  - banlist - Show all banned players
  - Ban check on connection
- ✅ Admin help:
  - admin / admin_help - Categorized command list
  - admin <command> - Help for specific command
- ✅ Invisibility system:
  - Invisible admins hidden from "who" list (except to other admins)
  - Invisible admins hidden from room player lists
  - Movement messages hidden when invisible
  - Admins see [INVIS] tag on invisible players
- ✅ Command logging to admin_log.txt
- ✅ Activity logging for admin dashboard (boss kills, level-ups, admin actions)

### Phase 1.5: Competitive Gameplay Features ✅ COMPLETE!

Full competitive multiplayer systems:
- ✅ **Hourly World Reset System**
  - 1-hour cycle duration with warnings at 10min, 5min, 1min
  - Cycle leaderboard tracking (XP Champion, Monster Slayer, Gold Hunter, Boss Slayers)
  - All monsters respawn, players teleport to room 001, full HP restore
  - Commands: `time`, `cycle_stats`, `leaderboard`
  - Admin: `force_reset`, `set_reset_timer`, `disable_reset`, `enable_reset`
- ✅ **Healing Chapel System**
  - 5 chapel rooms: room_001, room_020, room_050, room_062, room_090
  - `pray` command for full HP restore (5-minute cooldown)
  - Cannot pray during combat
  - Visual indicator in room description
- ✅ **Wandering Healer NPC**
  - Mystic Healer wanders every 2 minutes
  - `ask healer` command for healing (50 gold cost)
  - Free healing if HP below 25%
  - Cannot heal during combat
  - Departure/arrival broadcasts when moving
- ✅ **Aggressive Monster System**
  - Monster types: Passive, Neutral, Aggressive, Boss
  - Aggressive monsters auto-attack with 3-second grace period
  - Room display shows aggro indicators: [!] Aggressive, [~] Neutral, [·] Passive
  - Grace period cancelled by fleeing
- ✅ **PVP Combat System (Automatic Real-Time)**
  - `pvp on/off/status` to toggle PVP mode
  - 5-minute cooldown to disable PVP after enabling
  - Automatic combat rounds (2 seconds per round)
  - Commands during PVP: `flee`, `use [potion]`, `surrender`
  - Victory rewards: 10% of loser's XP and gold
  - Defeat penalties: 10% XP/gold loss, respawn at room_001
  - Level difference limit (can't attack 5+ levels below)
  - No PVP in chapel rooms
  - AFK timeout (30 seconds = auto-surrender)
  - Disconnect during PVP = forfeit loss
  - PVP stats tracked (kills/deaths)

### Phase 1.75: Quality of Life Features ✅ COMPLETE!

Enhanced gameplay experience:
- ✅ **Target Scoring System**
  - `score [target]` command for detailed player/monster analysis
  - Checks for players first (priority), then monsters
  - Player analysis: Level, title, status, PVP record, equipment
  - Monster analysis: Type, Level, HP, XP reward, loot table
  - Partial name matching works for both
  - Special formatting for bosses with guaranteed drops
- ✅ **Real-Time Monster Combat**
  - Automatic combat rounds (3 seconds per full round)
  - 1.5 second delay before monster counter-attack
  - Commands during combat: `flee`, `use [potion]`, `qs`
  - 60% flee success chance with XP/gold penalty
  - Broadcast messages to room spectators
  - Combat cleanup on disconnect
- ✅ **Quick Score Command**
  - `qs` command for compact status display
  - Shows: Name, Title, Level, XP, HP, Gold, Equipment damage, PVP status, Cycle time
  - Available during combat
- ✅ **Player Suffix/Title System**
  - Admin command: `suffix [player] [suffix]` (max 30 chars)
  - Admin command: `suffix [player] clear` to remove
  - Player command: `mysuffix` / `title` to view own suffix
  - `getDisplayName()` function used throughout codebase
  - Suffixes appear in all broadcasts (combat, movement, chat, etc.)

### Implementation Roadmap Status
- ✅ Phase 0: World & Wandering Monsters (COMPLETE)
- ✅ Phase 1: Combat Foundation (COMPLETE)
- ✅ Phase 2: Experience & Leveling (COMPLETE)
- ✅ Phase 3: Inventory System (COMPLETE)
- ✅ Phase 4: Player Persistence (COMPLETE)
- ✅ Phase 5: Multiplayer Features (COMPLETE)
- ✅ Phase 6: Admin Commands (COMPLETE)
- ✅ Phase 1.5: Competitive Gameplay (COMPLETE)
- ✅ Phase 1.75: Quality of Life (COMPLETE)
- ❓ Phase 7-10: Optional Extensions (shops, quests, crafting)

### Technical Notes
- Combat state tracked per player (inCombat, combatTarget, monsterCombatId, pvpCombatId)
- Real-time combat uses setTimeout() chains for automatic rounds
- activeMonsterCombats Map tracks monster combat sessions
- activePvpCombats Map tracks PVP combat sessions
- Flee calculates random valid exit from current room
- Equipment bonuses calculated dynamically
- Room items stored in separate roomItems object
- Monster loot tables defined in items.json
- Player files stored as JSON in players/ directory (lowercase names)
- Auto-save interval: 2 minutes via setInterval
- Input mode state machine: 'name' during registration → 'command' after
- Session stats tracked separately from persistent stats
- Cycle stats reset on world reset (hourly)
- getDisplayName() provides consistent player name + suffix display
- Wandering Healer NPC uses setInterval for movement

---

## Project: The Shattered Realms MUD

### Overview
A telnet-based Multi-User Dungeon (MUD) game built with Node.js, featuring 100 interconnected rooms across 10 thematic zones.

### Completed Features

#### Core Infrastructure
- ✅ TCP/Telnet server on port 8888
- ✅ Multi-player connection handling
- ✅ Line-buffered input (fixed character-by-character issue)
- ✅ Graceful disconnection with "quit" command
- ✅ Player state management (currentRoom, displayMode)

#### World & Navigation
- ✅ 100-room world system loaded from rooms.json
- ✅ 10 distinct zones:
  - Starting Chamber (rooms 1-5)
  - Crystal Caverns (rooms 6-15)
  - Floating Gardens (rooms 16-25)
  - Shadow Marshes (rooms 26-35)
  - Tower of Winds (rooms 36-45)
  - Molten Forges (rooms 46-55)
  - Ethereal Library (rooms 56-65)
  - Storm Peaks (rooms 66-75)
  - Void Nexus (rooms 76-85)
  - Celestial Observatory (rooms 86-95)
  - Archmage Sanctum (rooms 96-100)
- ✅ 10-directional movement: north, south, east, west, northeast, northwest, southeast, southwest, up, down
- ✅ Three command formats: "go north", "north", "n"
- ✅ Exit validation (prevents invalid movement)
- ✅ Circular world connection (room 90 connects back to room 1)

#### Display System
- ✅ BRIEF mode: Shows room name and exits only
- ✅ VERBOSE mode: Shows room name, full description, and exits
- ✅ Per-player display mode preferences
- ✅ "look" command respects display mode
- ✅ Custom detailed descriptions for all 100 rooms

#### Monster System
- ✅ 33 monster templates across 11 zones
- ✅ 3 legendary bosses at fixed locations (rooms 15, 35, 100)
- ✅ Zone-based spawning with configurable spawn chances
- ✅ Monster wandering behavior (45-second interval, 50% move chance)
- ✅ Thematic movement verbs per monster type
- ✅ Broadcast messages for monster arrivals/departures
- ✅ Monsters displayed in room with type indicators ([!] Aggressive, [BOSS])

#### Combat System (Phase 1 Complete)
- ✅ Player stats: HP, level, baseDamage, experience
- ✅ Turn-based combat loop (player → monster → repeat)
- ✅ Attack command with partial monster name matching
- ✅ Damage calculation with random variation + equipment bonuses
- ✅ Armor damage reduction system
- ✅ Strategic flee system (60% success, XP penalties, room escape)
- ✅ Death respawn at room 001 with full HP restore
- ✅ Victory rewards: XP gain, gold drops, and item loot
- ✅ Monster respawn after 2 minutes
- ✅ Color-coded combat messages (ANSI colors)
- ✅ Combat state blocks movement/teleport/item management

#### Leveling System (Phase 2 Complete)
- ✅ 15 levels with unique titles
- ✅ XP accumulation and level-up mechanics
- ✅ HP and damage scaling per level
- ✅ Death XP penalty without de-leveling
- ✅ "levels" command to view progression

#### Inventory System (Phase 3 Complete)
- ✅ 50+ items across categories (weapons, armor, shields, consumables, treasure)
- ✅ Player inventory (max 20 items) with gold
- ✅ Equipment slots (weapon, armor, shield)
- ✅ Level requirements for equipment
- ✅ Item loot drops from monsters and bosses
- ✅ Starting gear for new players

#### Player Persistence (Phase 4 Complete)
- ✅ Character name registration on connect
- ✅ Save/load system with JSON files
- ✅ Auto-save (2 min interval, events)
- ✅ Statistics tracking (kills, deaths, damage, exploration)
- ✅ Session summaries on disconnect
- ✅ 10% gold loss on death

#### Multiplayer Features (Phase 5 Complete)
- ✅ Player visibility in rooms
- ✅ Movement broadcasts to other players
- ✅ Combat visibility to room players
- ✅ Connection/disconnection announcements
- ✅ Communication: say, shout, tell, emote
- ✅ Player info: who, whois
- ✅ AFK system with auto-reply
- ✅ Ignore/unignore system

#### Admin Commands (Phase 6 Complete)
- ✅ admins.json and bans.json configuration files
- ✅ Server: status, shutdown, save_all, reload_monsters
- ✅ Players: kick, goto, bring, send, adminwho
- ✅ Characters: set_level, give_exp, give_item, give_gold, heal, heal_all, revive
- ✅ Communication: broadcast, god_say, invisible
- ✅ World: spawn, despawn, create_item, modify_room
- ✅ Info: monsters (with IDs for admin), admin_score, logs
- ✅ Testing: test_combat, test_loot, god_mode, teleport_all
- ✅ Ban system: ban, unban, banlist + connection check
- ✅ Admin help with categorized commands
- ✅ Command logging to admin_log.txt

#### Commands Implemented
- look (l) - View current room
- attack [monster] / kill / k - Initiate combat (now automatic real-time)
- flee / run / escape - Attempt to escape combat (60% success)
- stats / score / st - View player statistics
- qs - Quick score (compact status display, works in combat)
- score [target] - Analyze player (priority) or monster in room
- levels / lvls - View level progression table
- inventory / inv / i - View inventory
- equipment / eq / gear - View equipped items
- get [item] / take [item] - Pick up item from room
- drop [item] - Drop item from inventory
- equip [item] / wear / wield - Equip an item
- unequip [slot] / remove - Remove equipped item
- use [item] / drink / eat - Use a consumable
- examine [item] / inspect - View item details
- save - Manually save character progress
- say [msg] / ' [msg] - Local room chat
- shout [msg] / ! [msg] - Global chat to all players
- tell [player] [msg] / whisper - Private message
- emote [action] / : [action] - Roleplay action
- who / players / online - List online players
- whois [player] / finger - View player details
- afk [message] - Set away status
- back - Return from AFK
- ignore [player] - Block messages from player
- unignore [player] - Remove block
- mysuffix / title - View your custom suffix
- pray - Heal at chapel (5-min cooldown)
- ask healer - Request healing from Mystic Healer (50g or free if critical)
- pvp on/off/status - Toggle PVP combat mode
- surrender - Forfeit PVP combat
- time / reset_timer - Time until world reset
- cycle_stats - Your performance this cycle
- leaderboard - View cycle champions
- brief - Switch to brief display mode
- verbose - Switch to verbose display mode
- monsters - List all active monsters in the world
- spawns - Show spawn statistics by zone
- transurf [room#] - Teleport to room (requires spell or admin)
- Movement: n/s/e/w/ne/nw/se/sw/u/d (with full word and "go" variants)
- quit - Disconnect from server

**Admin Commands (requires admin status in admins.json):**
*Server:* admin status, shutdown, save_all, reload_monsters
*Players:* kick, goto, bring, send, list_players/adminwho
*Characters:* set_level, give_exp, give_item, give_gold, heal, heal_all, revive, suffix
*Communication:* broadcast/announce, god_say, invisible/invis
*World:* spawn, despawn, create_item, modify_room
*Reset:* force_reset, set_reset_timer, disable_reset, enable_reset, chapel_list
*Info:* monsters/monsterlist, admin_score, logs
*Testing:* test_combat, test_loot, god_mode, teleport_all
*Moderation:* ban, unban, banlist
*Help:* admin, admin <command>

### Learning Milestones Achieved

#### Mini-Project 1: Mood & Weather Logger (Python)
- File I/O operations
- User input handling
- Timestamp formatting
- Data persistence

#### Mini-Project 2: Task Manager CLI (Node.js)
- JSON data structures
- CRUD operations
- Command-line argument parsing
- Priority system with visual indicators

#### Claude Code Skills Mastered
- Natural language commands
- File references with @ symbol
- Bash mode with ! prefix
- Two-terminal workflow (Claude Code + execution terminal)
- Project memory with CLAUDE.md
- Iterative code development

### Technical Stack
- **Runtime:** Node.js
- **Protocol:** TCP/Telnet (net module)
- **Data Storage:** JSON (rooms.json, monsters.json, items.json)
- **Network:** Binds to 0.0.0.0:8888 (accessible from LAN)
- **Platform:** Windows 11

### Files in Project
- mud_server.js - Main game server (~7000 lines with competitive gameplay)
- rooms.json - 100-room world data with descriptions
- monsters.json - Monster templates, zone spawns, and boss data
- items.json - Item database (weapons, armor, consumables, treasure, loot tables)
- admins.json - Admin player names configuration
- bans.json - Banned player names list
- admin_log.txt - Admin command log (created on first admin command)
- players/ - Directory for player save files (created on startup)
- CLAUDE.md - Project documentation
- Beasts of the realm.md - Bestiary documentation
- task_manager.js - Task CLI (learning project)
- mood_logger.py - Mood logger (learning project)
- hello.txt - First test file

### Next Steps (Optional Extensions)
- Phase 7: Shops & Economy (NPC merchants, buy/sell commands)
- Phase 8: Quest System (NPC quests, objectives, quest rewards)
- Phase 9: Crafting System (combine items, recipes)
- Phase 10: Guild System (player organizations, guild halls)

### Future Phases
- Phase 7+: All core functionality complete! Optional extensions available above.

### Session Notes
- 2026-01-15: Built complete MUD foundation from zero to 100-room playable world
- Successfully transitioned from learning exercises to real game development
- Mastered Claude Code workflow and agentic AI development
- 2026-01-16: Implemented monster system (Phase 0 complete)
  - 33 monster templates + 3 bosses
  - Zone-based spawning and wandering AI
  - Admin teleport command (transurf)
- 2026-01-16: Implemented full combat system (Phase 1 complete)
  - Turn-based combat with attack/flee commands
  - Strategic flee mechanics with XP penalties
  - Death/respawn system
  - Color-coded combat messages
- 2026-01-16: Implemented experience & leveling (Phase 2 complete)
  - 15-level progression system
  - XP accumulation and level-up mechanics
  - Stat scaling per level
- 2026-01-16: Implemented inventory system (Phase 3 complete)
  - 50+ items in items.json
  - Full equipment system (weapon, armor, shield)
  - Combat bonuses from equipment
  - Loot drops with actual items
  - All inventory commands working
- 2026-01-16: Implemented player persistence (Phase 4 complete)
  - Character name registration on connect
  - Save/load system with players/ directory
  - Auto-save (2 min, level-up, boss defeat, death, disconnect)
  - Extended statistics tracking
  - Session summaries on quit
  - 10% gold loss on death penalty
- 2026-01-17: Implemented multiplayer features (Phase 5 complete)
  - Player visibility in rooms
  - Movement/combat broadcasts to other players
  - Connection/disconnection announcements
  - Communication: say, shout, tell, emote
  - Player info: who, whois
  - AFK system with auto-reply
  - Ignore/unignore system
- 2026-01-17: Implemented admin commands (Phase 6 complete)
  - admins.json configuration for admin players
  - Server management: status, shutdown, save_all, reload_monsters
  - Player management: kick, goto, bring, send, adminwho
  - Activity logging for admin dashboard
- 2026-01-17: Extended admin commands (Phase 6 expansion)
  - Character management: set_level, give_exp, give_item, give_gold
  - Healing commands: heal, heal_all, revive
  - Communication: broadcast, god_say
  - Invisibility system with proper filtering in who/room displays
- 2026-01-17: Complete admin toolkit (Phase 6 final)
  - World management: spawn, despawn, create_item, modify_room
  - Info commands: monsters with IDs, admin_score, logs
  - Testing: test_combat, test_loot, god_mode, teleport_all
  - Ban system: bans.json, ban/unban/banlist, connection check
  - Admin help with categorized commands
  - Command logging to admin_log.txt
  - All 6 core phases complete with 50+ admin commands!
- 2026-01-18: Competitive Gameplay Features (Phase 1.5)
  - Hourly world reset system with cycle leaderboard
  - Healing chapel system (5 locations, 5-min cooldown)
  - Wandering Healer NPC (2-min wander, 50g or free if critical)
  - Aggressive monster system with 3-second grace period
  - Full PVP combat system (automatic real-time, flee/surrender)
  - Server now binds to 0.0.0.0 for network access
- 2026-01-18: Quality of Life Features (Phase 1.75)
  - Monster scoring system (`score [monster]` command)
  - Real-time automatic monster combat (3-second rounds)
  - Quick score command (`qs`) - compact status, works in combat
  - Player suffix/title system (admin `suffix` command)
  - `getDisplayName()` function for consistent name display
  - All player broadcasts updated to show suffixes

## Teaching Approach

When assisting in this repository:
- Explain concepts as they're introduced
- Start with simple implementations before adding complexity
- Suggest incremental features that build on existing code
- Help debug issues in an educational way that builds understanding
