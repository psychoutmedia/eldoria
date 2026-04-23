# Astra-MUD — Complete Technical Documentation

**Project:** Astra-MUD: LLM-Powered Multi-User Dungeon  
**Built by:** Astra (Mark's AI assistant)  
**Date:** April 16-19, 2026  
**Stack:** Python 3.14 + Starlette + uvicorn + aiosqlite + aiohttp + Ollama (phi3)  
**Architecture:** Multi-player WebSocket server, SQLite persistence, LLM-driven NPCs  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Project Structure](#2-project-structure)
3. [Core Models (`world/models.py`)](#3-core-models-worldmodelspy)
4. [Database Layer (`world/database.py`)](#4-database-layer-worlddatabasepy)
5. [World Generator (`world/generator.py`)](#5-world-generator-worldgeneratorpy)
6. [NPC Brain (`npcs/brain.py`)](#6-npc-brain-npcsbrainpy)
7. [NPC Personality (`npcs/personality.py`)](#7-npc-personality-npcspersonalitypy)
8. [NPC Memory (`npcs/memory.py`)](#8-npc-memory-npcsmemorypy)
9. [NPC Behaviors (`npcs/behaviors.py`)](#9-npc-behaviors-npcsbehaviorspy)
10. [Quest System (`world/quests.py`)](#10-quest-system-worldquestspy)
11. [World Events (`world/events.py`)](#11-world-events-worldeventspy)
12. [Web Server (`web/server.py`)](#12-web-server-webserverpy)
13. [HTML Game Client (`web/templates/game.html`)](#13-html-game-client-webtemplatesgamehtml)
14. [Main Entry Point (`main.py`)](#14-main-entry-point-mainpy)
15. [Regeneration Script (`regenerate_world.py`)](#15-regeneration-script-regenerate_worldpy)
16. [Command Reference](#16-command-reference)
17. [How to Run](#17-how-to-run)
18. [Architecture Decisions](#18-architecture-decisions)

---

## 1. System Overview

Astra-MUD is a multiplayer text adventure (MUD) where every NPC is powered by a local LLM (Ollama with phi3). Players connect via browser/WebSocket and interact with the world through text commands. NPCs have persistent episodic memory, track relationships with each player, and respond dynamically based on personality, mood, and conversation history.

**Key differentiators:**
- NPCs don't follow scripted dialogue — they *think* using LLMs
- NPC memory persists across sessions (SQLite)
- Relationships between players and NPCs evolve over time
- Procedural world generation can create 300+ room dungeons
- Quest system with dynamic objectives and prerequisites
- Random encounters with rarity/level scaling
- Multi-player with room broadcasts and private messaging

---

## 2. Project Structure

```
projects/astra-mud/
├── main.py                      # Entry point — starts uvicorn server
├── requirements.txt            # starlette, uvicorn, aiosqlite, aiohttp
├── regenerate_world.py          # Procedural world generation CLI
├── data/
│   └── world.db                # SQLite persistence (created on first run)
├── world/
│   ├── __init__.py
│   ├── models.py               # Room, Item, NPC, Player, World dataclasses
│   ├── database.py             # SQLite load/save + starter world creation
│   ├── quests.py               # QuestManager + 6 pre-defined quests
│   ├── events.py               # WorldEventManager + 14 random encounters
│   └── generator.py           # DungeonGenerator — procedural room generation
├── npcs/
│   ├── __init__.py
│   ├── brain.py               # NPCBrain — LLM calls to Ollama
│   ├── personality.py         # System prompt builder + 5 templates
│   ├── memory.py              # NPCMemory (episodes) + RelationshipTracker
│   └── behaviors.py           # NPCBehaviors — behavior trees + reactions
└── web/
    ├── __init__.py
    ├── server.py              # Starlette WS server, GameSession, PlayerRegistry
    └── templates/
        └── game.html         # Browser WebSocket client (vanilla JS)
```

**Total: ~3,500 lines of Python + ~150 lines of HTML/JS**

---

## 3. Core Models (`world/models.py`)

Four dataclasses plus a container class:

### Position
```python
@dataclass
class Position:
    x: int = 0
    y: int = 0
    z: int = 0  # z for multi-floor dungeons (depth level)
```
Used to place rooms in 3D space for procedural generation. The z-axis represents dungeon depth (surface = 0, deeper floors = higher z).

### Room
```python
@dataclass
class Room:
    id: str
    name: str
    description: str
    position: Position = field(default_factory=Position)
    exits: dict[str, str] = field(default_factory=dict)  # direction -> room_id
    items: list[str] = field(default_factory=list)      # item_ids in room
    npcs: list[str] = field(default_factory=list)       # npc_ids in room
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
```
The fundamental unit of the game world. Each room has a name, description, exits to other rooms (N/S/E/W/Up/Down), items players can pick up, and NPCs present.

### Item
```python
@dataclass
class Item:
    id: str
    name: str
    description: str
    location: str  # room_id or player_id (where the item currently is)
    item_type: str = "misc"  # weapon, armor, consumable, quest, misc
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
```
Items have a type and properties dict for game logic (e.g., `"damage": 15`, `"heals": 30`, `"value": 100`).

### NPC
```python
@dataclass
class NPC:
    id: str
    name: str
    description: str
    room_id: str
    personality: dict = field(default_factory=dict)  # traits, goals, mood
    inventory: list[str] = field(default_factory=list)
    memory: list[dict] = field(default_factory=list)  # basic episodic memory
    relationships: dict = field(default_factory=dict)  # player_id -> score
    ai_model: str = "phi3"
    is_alive: bool = True
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_interaction: Optional[datetime] = None
```
NPCs hold basic memory and relationships natively (for SQLite persistence), while the `NPCBrain` class provides the LLM-powered layer with more sophisticated tracking.

### Player
```python
@dataclass
class Player:
    id: str
    name: str
    room_id: str
    inventory: list[str] = field(default_factory=list)
    hp: int = 100
    max_hp: int = 100
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_seen: datetime = field(default_factory=datetime.utcnow)
```
Simple player model — HP-based health system, inventory of item IDs.

### World Container
```python
class World:
    """Container for the entire game world state."""
    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self.items: dict[str, Item] = {}
        self.npcs: dict[str, NPC] = {}
        self.players: dict[str, Player] = {}
    
    # get_room, get_item, get_npc, get_player, get_player_by_name
    # get_npc_by_name (lookup by name within a specific room)
    # add_room, add_item, add_npc, add_player
```
In-memory cache of the entire world state, loaded from SQLite at startup.

---

## 4. Database Layer (`world/database.py`)

**Technology:** SQLite via `aiosqlite` (async)

### Schema
```sql
CREATE TABLE rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE items (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE npcs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
CREATE INDEX idx_players_name ON players(name);
CREATE TABLE npc_brains (npc_id TEXT PRIMARY KEY, data TEXT NOT NULL); -- brain state
```

All entities are serialized as JSON and stored in a single `data` TEXT column. This keeps the schema dead simple while allowing the dataclass models to evolve without migrations.

### Key Functions

| Function | Purpose |
|----------|---------|
| `init_db()` | Creates tables if they don't exist |
| `load_world()` | Loads entire world from SQLite into a `World` object |
| `save_room()`, `save_item()`, `save_npc()`, `save_player()` | Per-entity saves |
| `create_starter_world()` | Creates the hand-crafted 9-room starter dungeon |
| `save_brain_state()`, `load_brain_state()` | NPC brain state (memory + relationships) persistence |

### Starter World (9 rooms)
The initial handcrafted dungeon consists of:

| Room ID | Name | Description |
|---------|------|-------------|
| `entrance` | Dungeon Entrance | Moss-covered archway, cold air, ancient stone well to the west |
| `well` | The Wishing Well | Crumbling well with unnatural light, coins at bottom, wish ability |
| `hallway` | Torch-Lit Corridor | Narrow corridor, flickering torches, strange symbols |
| `chamber` | Grand Chamber | Vast chamber, ancient columns, connections to 4 areas |
| `armory` | Ruined Armory | Rusted weapons, gleaming sword on pedestal, stairs to crypt |
| `treasury` | Dragon's Hoard | Mountains of gold, ancient gold dragon sleeping |
| `library` | The Forgotten Library | Towering bookshelves, rotted books, scholar's skeleton |
| `crypt` | The Crypt | Stone sarcophagi, cold air, rattling bones |
| `garden` | The Garden of Thorns | Black roses, dry fountain, fireflies, razor thorns |

**Starter NPCs:**
- `skeleton_guard` (hallway) — hostile, protective
- `gold_dragon` (treasury) — sleeping, powerful
- `scholar_ghost` (library) — wise, melancholic
- `fairy_queen` / `thornweaver` (garden) — enchanting, sorrowful
- `skeleton_knight` / `crypt_knight` (crypt) — hostile, sentinel
- `wandering_spirit` (entrance) — peaceful, trapped

**Starter Items:** rusty_sword, health_potion, gold_coins, silver_bell (quest), ancient_tome (quest), silver_dagger, fairy_dust, dragon_scale (quest)

---

## 5. World Generator (`world/generator.py`)

**Purpose:** Procedural dungeon generation for scaling from 9 rooms to 1,000+

### Architecture

The `DungeonGenerator` class uses **zone-based generation**. Each zone has a theme (dungeon/catacomb/wilderness/town/special), a target room count, a hostility level, and a list of zone types it connects to.

### Zone Configurations

| Zone | Theme | Rooms | Connections | Hostility |
|------|-------|-------|-------------|----------|
| `surface_entrance` | wilderness | 15 | wilderness, town | 0.1 |
| `surface_wilderness` | wilderness | 40 | wilderness, ruins | 0.3 |
| `town_center` | town | 20 | town, wilderness | 0.0 (safe) |
| `dungeon_upper` | dungeon | 60 | dungeon, catacomb | 0.4 |
| `dungeon_lower` | dungeon | 80 | dungeon, catacomb, special | 0.6 |
| `catacomb_upper` | catacomb | 40 | catacomb, dungeon | 0.5 |
| `catacomb_deep` | catacomb | 40 | catacomb, dungeon_lower, special | 0.7 |
| `special_portal` | special | 15 | special | 0.5 |
| `special_elemental` | special | 10 | special, dungeon_lower | 0.8 |
| `boss_final` | special | 5 | — | 1.0 (boss) |

**Total target: 325 rooms** (configurable to 1,000+)

### Room Templates

25+ room templates organized by **theme + room type** combinations. Each template has:
- Multiple possible names (randomly selected)
- Multiple possible descriptions (atmospheric, varied)
- Exit directions allowed
- Item drop chance
- NPC spawn chance
- Hostility multiplier

**Examples by theme:**

**Catacomb:** bone_pit, crypt_royal, prison  
**Dungeon:** corridor, chamber, trap_room, treasury, armory, library, shrine, prison_dungeon, sewer  
**Wilderness:** forest, ruins, cave, swamp, encampment  
**Town:** inn, shop, square  
**Special:** portal, elemental, boss

### Item Templates (by category)

| Category | Example Items |
|----------|---------------|
| weapon | Rusty Shortsword, Iron Spear, Silver Dagger, Battle Axe |
| consumable | Health Potion, Mana Crystal, Antidote, Smoke Bomb, Torch, Rations |
| treasure | Gold Coins, Silver Ring, Gemstone, Ancient Coin, Jeweled Cup |
| quest | Torn Note, Rusted Key, Sealed Letter, Spectral Chain, Mysterious Idol |

### NPC Templates (by pool)

| Pool | Examples |
|------|----------|
| dungeon_hostile | Skeleton Warrior, Goblin Scout, Orc Brute, Zombie Laborer, Giant Spider, Dark Cultist |
| dungeon_neutral | Scholar's Spirit, Wandering Merchant, Cursed Knight, Lost Adventurer |
| wilderness_hostile | Dire Wolf, Bandit Chief, Otyugh, Harpy, Ogre |
| wilderness_neutral | Hermit Sage, Traveling Merchant, Hunter, Pilgrim |
| town_neutral | Innkeeper, Shopkeeper, Town Guard, Beggar, Street Urchin |
| boss | Ancient Dragon, Lich King, Demon Prince, The Dungeon Heart |

### Generation Algorithm

**Two-pass approach:**

1. **First pass:** Create all rooms with `exits[direction] = "pending"` (placeholder)
2. **Second pass:** Resolve pending exits by finding nearby rooms that don't have that exit direction yet. Creates organic, interconnected dungeon structure.

After room generation:
- Items assigned based on 35% chance per room + random category
- NPCs assigned based on hostility × 40% chance, using theme-appropriate pool
- Boss zone gets a special "Dungeon Heart" NPC

### Regeneration CLI
```bash
python3 regenerate_world.py --rooms 1000 --seed 42
python3 regenerate_world.py --expand  # expand existing world
```

---

## 6. NPC Brain (`npcs/brain.py`)

**Purpose:** LLM-powered NPC cognition — the core AI innovation of Astra-MUD.

### NPCBrain Class

```python
class NPCBrain:
    def __init__(self, npc_id, name, personality, ai_model="phi3", base_url="http://localhost:11434"):
        self.npc_id = npc_id
        self.name = name
        self.personality = personality
        self.ai_model = ai_model
        self.base_url = base_url  # Ollama endpoint
        self.conversation_history: list[dict] = []  # rolling 20 exchanges
        self.max_history = 20
        self.memory: NPCMemory  # episodic memory
        self.relationships: RelationshipTracker  # per-player relationships
        self.mood = personality.get("mood", "neutral")
        self.goals = personality.get("goals", "survive")
        self.traits = personality.get("traits", [])
```

### `think()` — Non-streaming Response

```
Player input → Build system prompt → Ollama /api/chat → Return response
```

**System prompt construction** (via `build_system_prompt` from `personality.py`):
1. NPC name + personality traits + current mood + goals + backstory
2. World context (current room description)
3. Memory context (formatted episodic memories)
4. Relationship context (status with this player)
5. Last 6 messages of conversation history
6. Instructions about staying in character

**Ollama call:**
```python
url = f"{self.base_url}/api/chat"
payload = {
    "model": self.ai_model,
    "messages": messages,
    "stream": False,
    "options": {"temperature": 0.8, "top_p": 0.9}
}
```

Temperature 0.8 + top_p 0.9 gives creative but coherent responses.

### `think_stream()` — Streaming Response

Same as `think()` but with `stream: True`. Yields tokens as they arrive from Ollama's SSE endpoint. Used for longer, more dramatic NPC speeches.

### `record_interaction()` — Relationship + Memory

When an NPC has a notable interaction with a player:
```python
brain.record_interaction(
    player_id,
    action="Player said 'hello'",
    outcome="NPC responded warmly",
    delta=+5  # relationship score adjustment
)
```
This simultaneously:
1. Adds an episodic memory with importance = abs(delta)
2. Updates the relationship score (-100 to +100)

### State Persistence

`get_state()` / `load_state()` serialize the brain for SQLite storage, including conversation history, memory episodes, and all relationship data. Loaded at startup so NPCs "remember" previous sessions.

---

## 7. NPC Personality (`npcs/personality.py`)

**Purpose:** Build system prompts that constrain LLM output to stay in character.

### `build_system_prompt()` Function

Takes:
- NPC name
- Personality dict (traits, goals, mood, backstory)
- Conversation history (last 6 messages)
- World context (room description)
- Memory context (optional)
- Relationship context (optional)

Returns a detailed system prompt with:
- Character identity ("You are Skeleton Guard...")
- Personality descriptors
- World knowledge
- Memory/relationship awareness
- **Behavior rules** (stay in character, keep responses concise, react to mood/hostility)
- Conversation history for context
- Hard rules: never break character, never mention being an AI

### 5 Pre-built Personality Templates

| Template | Traits | Goals | Mood | Backstory |
|----------|--------|-------|------|----------|
| `skeleton_warrior` | hostile, eternal, protector, undead | Defend dungeon forever | eternal vigilance | "Once a proud knight, now bound to guard these halls for eternity." |
| `gold_dragon` | ancient, powerful, intelligent, sleeping | Protect hoard | dormant | "Born in the First Age, I've slept on this gold for a thousand years." |
| `friendly_merchant` | friendly, greedy, talkative, wise | Make profit + share tales | jovial | "I've traveled every road in the realm, trading in wonders and stories." |
| `mysterious_sage` | cryptic, wise, patient, knowing | Guide the worthy | contemplative | "I have studied the ancient texts since before the kingdom fell." |
| `cowardly_goblin` | cowardly, sneaky, hungry, opportunist | Survive another day | nervous | "I fled the goblin wars and hid here. Please don't hurt me!" |

These templates are referenced by `get_template()` and used when instantiating NPCs.

---

## 8. NPC Memory (`npcs/memory.py`)

**Purpose:** Persistent episodic memory for NPCs — they remember past events.

### NPCMemory Class

Tracks events as **episodes** — each with:
- `event`: string description of what happened
- `importance`: 1 (trivial) to 5 (critical)
- `timestamp`: ISO datetime
- `player_id`: which player was involved (optional)

**Key methods:**
- `add_memory(event, player_id, importance)` — add an episode
- `get_recent_memories(count)` — last N memories
- `get_memories_about_player(player_id)` — memories involving specific player
- `get_important_memories(min_importance)` — above threshold
- `get_memories_since(hours)` — time-filtered
- `format_memories_for_prompt(count)` — renders as timestamped prompt text with relative times ("2h ago", "just now")
- `get_state()` / `from_state()` — serialization for persistence

### RelationshipTracker Class

Per-player relationship tracking with:
- **Score:** -100 (hostile) to +100 (allied)
- **Status:** hostile / unfriendly / neutral / friendly / allied (derived from score)
- **Trust level:** 0-100
- **Notes:** last 20 interactions with timestamp + delta

**Key methods:**
- `adjust_relationship(player_id, delta, reason)` — update score, trim notes
- `_score_to_status()` — converts numeric score to categorical status
- `get_status_for_prompt()` — human-readable status for LLM ("hostile (wants to harm you)")
- `format_all_relationships()` — overview of all players

### Helper Functions

- `get_memory_context(memory, player_id)` — builds memory string, player-specific if player_id given
- `get_relationship_context(tracker, player_id, npc_name)` — builds relationship string with recent notes

These helpers are called by `NPCBrain.think()` to inject context into the LLM prompt.

---

## 9. NPC Behaviors (`npcs/behaviors.py`)

**Purpose:** Personality-driven **behavior trees** — deterministic NPC reactions that don't require LLM calls.

### BehaviorState Enum
```
IDLE → ALERT → AGGRESSIVE
   ↓       ↓
FRIENDLY  SCARED
```

### NPCBehaviors Class

Initialized with personality dict + room_id. Tracks current `BehaviorState` derived from personality traits.

**Event handlers (return `BehaviorResult`):**

| Handler | Trigger | Reaction based on state |
|---------|---------|----------------------|
| `on_player_enter()` | Player enters room | IDLE: wake slowly / ALERT: threaten / FRIENDLY: greet / SCARED: hide |
| `on_player_attack()` | Player attacks NPC | Cowardly: flee / Hostile: counter-attack / Default: defend |
| `on_player_give()` | Player gives item | Greedy: accept greedily / Friendly: appreciate sincerely |
| `on_player_leave()` | Player leaves room | FRIENDLY: farewell / AGGRESSIVE: taunt |
| `on_world_event()` | World event triggers | Cowardly: panic / Protective: defensive stance |

### Behavior Result

```python
@dataclass
class BehaviorResult:
    action: str       # "wake", "threaten", "flee", etc.
    message: str      # The *asterisk* message to show
    should_remember: bool  # Whether to log this to memory
    importance: int   # Memory importance level
```

### Relationship-based Helpers

- `get_aggression_modifier(score)` — returns -1 to +1 multiplier based on relationship score
- `get_greeting_based_on_relationship(score, name)` — returns appropriate greeting message

These allow NPCs to greet familiar players differently from strangers, and adjust aggression based on accumulated trust/hostility.

---

## 10. Quest System (`world/quests.py`)

**Purpose:** Structured player goals with objectives, rewards, and prerequisites.

### Data Model

```python
@dataclass
class Quest:
    id: str
    title: str
    description: str
    giver_id: str  # NPC who gives the quest
    objectives: list[QuestObjective]
    reward_xp: int = 100
    reward_gold: int = 50
    reward_items: list[str] = field(default_factory=list)
    difficulty: QuestDifficulty = MEDIUM  # TRIVIAL/EASY/MEDIUM/HARD/EPIC
    time_limit: Optional[int] = None  # minutes
    status: QuestStatus = AVAILABLE  # AVAILABLE/ACTIVE/COMPLETED/FAILED/ABANDONED
    prerequisites: list[str] = []  # quest IDs that must be completed first
    repeatable: bool = False
```

### QuestObjective
```python
@dataclass
class QuestObjective:
    id: str
    description: str
    target_type: str   # "kill", "collect", "talk", "visit", "escort", "interact"
    target_id: str    # specific NPC/item/room ID
    target_count: int = 1
    current_count: int = 0
    completed: bool = False
```

### QuestManager Class

Manages all quests for all players. Key methods:
- `register_quest()` — make a quest available globally
- `offer_quest()` — create a player-specific copy (respects prerequisites)
- `accept_quest()` / `abandon_quest()` / `complete_quest()`
- `update_objective()` — progress tracking (returns True when objective completed)
- `is_complete()` — all objectives done?
- `get_available_quests()` / `get_active_quests()`
- `get_quest_progress()`

### 6 Pre-defined Quests

| Quest ID | Title | Giver | Difficulty | Prerequisites |
|----------|-------|-------|------------|--------------|
| `skeleton_rats` | The Rat Problem | skeleton_guard | EASY | — |
| `dragon_wisdom` | The Sleeping Dragon | gold_dragon | HARD | skeleton_rats |
| `deliver_message` | A Message for the Guard | — | TRIVIAL | — |
| `scholar_tome` | The Lost Knowledge | scholar_ghost | MEDIUM | — |
| `fairy_bell` | The Fairy's Bell | fairy_queen | MEDIUM | — |
| `dragon_riddle` | The Dragon's Riddle | gold_dragon | HARD | scholar_tome |

---

## 11. World Events (`world/events.py`)

**Purpose:** Dynamic world simulation — random encounters, timed events, world state changes.

### Event Types
- `RANDOM_ENCOUNTER` — triggered by player actions
- `TIMED_EVENT` — scheduled with duration
- `WORLD_CHANGE` — persistent or temporary world state changes
- `NPC_ARRIVAL` — wandering NPC appears
- `ITEM_SPAWN` — item appears in world
- `WEATHER_CHANGE` — environmental effects

### Severity Levels
- `MINOR` (1) — flavor text only
- `NOTABLE` (2) — small effect, NPC reaction
- `MAJOR` (3) — affects gameplay, combat possible
- `CRITICAL` (4) — dangerous, world state change

### 14 Random Encounters

Organized by room theme/location:

| Encounter | Rooms | Rarity | Hostile | Description |
|-----------|-------|--------|---------|-------------|
| Rat Swarm | entrance, hallway, armory | 0.30 | Yes | Swarm of rats with red eyes |
| Skeleton Rogue | hallway, chamber | 0.15 | Yes | Skeletal figure with rusty dagger |
| Wandering Spirit | entrance, hallway, chamber, treasury | 0.20 | No | Translucent sorrowful figure |
| Treasure Chest | hallway, chamber, armory | 0.05 | No | Ornate chest in shadowy alcove |
| Falling Tome | library | 0.25 | No | Heavy book crashes from shelf |
| Ghostly Whisper | library, crypt | 0.30 | No | Cold whisper: "The Codex..." |
| Grasping Bones | crypt | 0.35 | Yes | Skeletal hand erupts from floor |
| Cursed Stone | crypt | 0.20 | No | Green mist seeps from tomb |
| Fairy Ring | garden | 0.30 | No | Glowing mushroom circle |
| Thorn Ambush | garden | 0.20 | Yes | Roses reach with razor thorns |
| Whispers from Well | well | 0.40 | No | Voices ripple from the deep |
| Glinting Coin | well | 0.15 | No | Gold coin half-buried in moss |

Plus: Earthquake, Magical Darkness, Dragon Awakens, Merchant Arrival as pre-defined world events.

### WorldEventManager Class

- `check_random_encounter()` — cooldown-aware encounter rolling based on room + player level
- `trigger_event()` — activates event, schedules expiration if timed
- `get_active_events()` / `get_events_for_room()` — query active events
- `format_events_message()` — renders active events as player-facing text with severity icons (⚠️/⚡/✨)

---

## 12. Web Server (`web/server.py`)

**Purpose:** Multi-player WebSocket game server using Starlette.

### Architecture

- **Starlette** ASGI app with lifespan context manager for startup
- **WebSocket** endpoint at `/ws` for game connections
- **HTTP** endpoint at `/` serving the HTML client
- **PlayerRegistry** — global singleton tracking all connected sessions
- **GameSession** — per-player connection handler

### PlayerRegistry

```python
class PlayerRegistry:
    sessions: dict[str, GameSession]  # player_id -> session
    
    def register(session)
    def unregister(player_id)
    def get_player_ids() / get_player_names()
    def get_session(player_id) / get_session_by_name(name)
    def broadcast(message, exclude_id)        # all players
    def broadcast_room(room_id, message, exclude_id)  # same room only
```

### GameSession — Command Router

Every player message is routed through `handle_command()`:

**Movement:** `n/s/e/w/u/d` → `do_move(direction)`  
**Look:** `look/l` → `send_room()`  
**Say:** `say [msg]` → `handle_say()` (broadcasts to room + NPCs react)  
**Tell:** `tell [player] [msg]` → private message via `PlayerRegistry`  
**Who:** `who/players` → lists online players  
**Talk:** `talk to [npc]` → `NPCBrain.think()` call → LLM response  
**Take/Drop/Use:** item management → updates DB  
**Examine:** `examine [target]` → look up item/NPC  
**Attack:** `attack [npc]` → behavior + brain response  
**Inventory:** `inv/i` → shows HP + items  
**Lore:** `lore` → rich backstory text about Astramere  
**Wish:** `wish [msg]` (well room only) → buff/curse random effects  
**Quests:** `quests/q` → available quests  
**Quest:** `quest [id]` → accept quest  
**Status:** `status` → active quest progress  
**Help:** `h/?` → command list  

### Room Description Builder

`get_room_description()` builds rich descriptions including:
- Room name + description
- Available exits
- Items on the ground (with names)
- NPCs present (with names)

### Lore System

A large multi-paragraph backstory about:
- Archmage Valdris the Eternal and the founding of Astramere
- The dragon Velathor bound by blood-magic
- Student Mira Nightwhisper's failed ritual (Year 703)
- The shattered eastern tower and broken reality
- The Codex Umbral hidden somewhere
- The question of why no successor was named

### Startup Sequence

```
startup():
  1. Check if world.db exists
  2. If yes: load_world() from SQLite
  3. If no: create_starter_world() + save all entities
  4. Initialize QuestManager + register 6 starter quests
  5. Initialize WorldEventManager + register 14 encounters
  6. Create NPCBrain for every NPC in world
  7. Ready!
```

---

## 13. HTML Game Client (`web/templates/game.html`)

**Purpose:** Browser-based WebSocket client — no dependencies, ~150 lines of vanilla JS.

### Features

- Dark theme (background: #1a1a2e, panels: #16213e, accent: #e94560)
- WebSocket connection to `/ws`
- JSON message parsing (type: welcome/message/error)
- Basic markdown rendering (`**bold**` → `<strong>`, `*italic*` → `<em>`)
- Auto-scroll to bottom on new messages
- Enter key + button click to send commands
- Connection status indicator (green/red)
- Name prompt via welcome message flow

### Connection Flow

```
1. connect() → WebSocket to /ws
2. Server sends welcome message
3. Server asks "What is your name?"
4. Player types name → sent as plain text
5. Server creates player → sends room description
6. Game loop: player sends commands → receives responses
```

---

## 14. Main Entry Point (`main.py`)

```python
def main():
    print("🏰 Astra-MUD - LLM-Powered Text Adventure")
    print("Starting server on http://localhost:8765")
    print("Make sure Ollama is running with: ollama pull phi3")
    
    from web.server import app
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="info")
```

Imports the Starlette app and runs it with uvicorn on port 8765.

---

## 15. Regeneration Script (`regenerate_world.py`)

CLI for regenerating the world from scratch:

```bash
# Regenerate with default (300 rooms, seed 42)
python3 regenerate_world.py

# Custom room count
python3 regenerate_world.py --rooms 1000

# Custom seed (for reproducible worlds)
python3 regenerate_world.py --rooms 500 --seed 123

# Expand existing world (load + merge new zones)
python3 regenerate_world.py --rooms 600 --expand
```

**Process:**
1. Delete existing `world.db`
2. `init_db()` fresh
3. `DungeonGenerator.generate_world()` — creates all rooms/items/NPCs
4. Save everything to SQLite
5. Report statistics

---

## 16. Command Reference

| Command | Aliases | Description |
|---------|---------|-------------|
| `n` / `north` | | Move north |
| `s` / `south` | | Move south |
| `e` / `east` | | Move east |
| `w` / `west` | | Move west |
| `u` / `up` | | Move up |
| `d` / `down` | | Move down |
| `look` | `l` | Re-examine current room |
| `say [msg]` | | Speak to everyone in room |
| `tell [player] [msg]` | | Private message |
| `who` | `players`, `online` | List online players |
| `talk to [npc]` | `talk [npc]` | Start conversation with NPC |
| `take [item]` | `get [item]`, `pick up [item]` | Pick up item |
| `drop [item]` | | Drop item from inventory |
| `use [item]` | | Use consumable item |
| `examine [target]` | `x [target]` | Inspect item or NPC |
| `attack [npc]` | `kill [npc]`, `fight [npc]` | Attack NPC |
| `inventory` | `inv`, `i` | Show inventory + HP |
| `lore` | `history` | Read dungeon backstory |
| `wish [msg]` | `throw coin`, `toss coin` | Make a wish (at well only) |
| `quests` | `q` | List available quests |
| `quest [id]` | | Accept a quest |
| `status` | | Show active quest progress |
| `help` | `h`, `?` | Show command list |

---

## 17. How to Run

### Prerequisites

```bash
# Install Ollama
brew install ollama        # macOS

# Pull the phi3 model (small, runs locally)
ollama pull phi3

# Start Ollama daemon
ollama serve  # runs in background

# Create virtual environment + install deps
cd projects/astra-mud
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### Run the MUD

```bash
# Standard run (9-room starter dungeon)
.venv/bin/python3 main.py

# Or regenerate with procedural world first
.venv/bin/python3 regenerate_world.py --rooms 500
.venv/bin/python3 main.py
```

### Connect

Open `http://localhost:8765` in any browser. Multiple players can connect simultaneously.

### Run Tests

```bash
cd projects/astra-mud
.venv/bin/python3 -c "
import asyncio
from world.database import create_starter_world, load_world
from world.models import World

async def test():
    world = await create_starter_world()
    print(f'Created: {len(world.rooms)} rooms, {len(world.npcs)} NPCs')
    w2 = await load_world()
    print(f'Loaded: {len(w2.rooms)} rooms')
    print('✅ Database works!')

asyncio.run(test())
"
```

---

## 18. Architecture Decisions

### Why Ollama + phi3?

Ollama provides a local LLM server with zero API costs and no privacy concerns. phi3 is small enough (2.7B params) to run on consumer hardware while being capable enough for NPC dialogue. The `ai_model` field on NPCs allows swapping models per-NPC if desired.

### Why SQLite over PostgreSQL?

The game state is not relational — it's a document-style store (entities with JSON blobs). SQLite is zero-config, single-file, and perfectly adequate for MUD-scale write volume. The async `aiosqlite` driver ensures non-blocking I/O.

### Why dataclasses?

Minimal boilerplate with `field(default_factory=...)` for mutable defaults. `to_dict()` serialization is straightforward. No ORM needed.

### Why two memory systems?

The `NPC` dataclass has a simple `memory: list[dict]` for basic SQLite persistence (timestamps, events, importance). The `NPCMemory` class in `npcs/memory.py` provides the full query API (time filtering, player filtering, importance thresholds). The brain uses `NPCMemory`; the dataclass stores the serialized output.

### Why behavior trees + LLM?

`NPCBehaviors` handles deterministic, personality-driven reactions (cowardly NPCs flee, aggressive NPCs counter-attack) without requiring LLM calls. The LLM (`NPCBrain`) handles open-ended conversation and creative responses. This hybrid approach balances cost/speed (deterministic) with flexibility (LLM).

### Why zone-based generation?

Pure random room generation creates disconnected graphs. Zone-based with connection rules ensures the dungeon is traversable. Each zone specifies what other zones it connects to, creating a natural depth gradient (wilderness → upper dungeon → lower dungeon → catacombs → boss).

### Why WebSocket over HTTP?

Real-time multiplayer requires low-latency bidirectional communication. WebSockets maintain persistent connections per player. The browser client is pure vanilla JS — no React/Vue overhead, no build step.

---

*Document compiled: April 20, 2026*  
*Built with: Starlette, uvicorn, aiosqlite, aiohttp, Ollama phi3*  
*Lines of code: ~3,500 Python + ~150 HTML/JS*
