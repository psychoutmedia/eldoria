"""
Astra-MUD: Database Layer
SQLite persistence for world state
"""

import aiosqlite
import json
from pathlib import Path
from typing import Optional
from .models import World, Room, Item, NPC, Player, Position


DB_PATH = Path(__file__).parent.parent / "data" / "world.db"


async def init_db(db_path: str = str(DB_PATH)):
    """Initialize database schema."""
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    async with aiosqlite.connect(db_path) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS npcs (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
            
            CREATE TABLE IF NOT EXISTS players (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                data TEXT NOT NULL
            );
            
            CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
            CREATE INDEX IF NOT EXISTS idx_items_location ON items(data);
        """)
        await db.commit()


def _room_from_dict(data: dict) -> Room:
    pos = data.get("position", {})
    return Room(
        id=data["id"],
        name=data["name"],
        description=data["description"],
        position=Position(pos.get("x", 0), pos.get("y", 0), pos.get("z", 0)),
        exits=data.get("exits", {}),
        items=data.get("items", []),
        npcs=data.get("npcs", []),
        properties=data.get("properties", {}),
    )


def _npc_from_dict(data: dict) -> NPC:
    from datetime import datetime
    return NPC(
        id=data["id"],
        name=data["name"],
        description=data["description"],
        room_id=data["room_id"],
        personality=data.get("personality", {}),
        inventory=data.get("inventory", []),
        memory=data.get("memory", []),
        relationships=data.get("relationships", {}),
        ai_model=data.get("ai_model", "phi3"),
        is_alive=data.get("is_alive", True),
        properties=data.get("properties", {}),
    )


def _item_from_dict(data: dict) -> Item:
    return Item(
        id=data["id"],
        name=data["name"],
        description=data["description"],
        location=data["location"],
        item_type=data.get("item_type", "misc"),
        properties=data.get("properties", {}),
    )


def _player_from_dict(data: dict) -> Player:
    return Player(
        id=data["id"],
        name=data["name"],
        room_id=data["room_id"],
        inventory=data.get("inventory", []),
        hp=data.get("hp", 100),
        max_hp=data.get("max_hp", 100),
        properties=data.get("properties", {}),
    )


async def load_world(db_path: str = str(DB_PATH)) -> World:
    """Load entire world from database."""
    world = World()
    
    if not Path(db_path).exists():
        await init_db(db_path)
        return world
    
    async with aiosqlite.connect(db_path) as db:
        # Load rooms
        async with db.execute("SELECT data FROM rooms") as cursor:
            async for row in cursor:
                room = _room_from_dict(json.loads(row[0]))
                world.add_room(room)
        
        # Load items
        async with db.execute("SELECT data FROM items") as cursor:
            async for row in cursor:
                item = _item_from_dict(json.loads(row[0]))
                world.add_item(item)
        
        # Load NPCs
        async with db.execute("SELECT data FROM npcs") as cursor:
            async for row in cursor:
                npc = _npc_from_dict(json.loads(row[0]))
                world.add_npc(npc)
        
        # Load players
        async with db.execute("SELECT data FROM players") as cursor:
            async for row in cursor:
                player = _player_from_dict(json.loads(row[0]))
                world.add_player(player)
    
    return world


async def save_room(db_path: str, room: Room):
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT OR REPLACE INTO rooms (id, data) VALUES (?, ?)",
            (room.id, json.dumps(room.to_dict()))
        )
        await db.commit()


async def save_npc(db_path: str, npc: NPC):
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT OR REPLACE INTO npcs (id, data) VALUES (?, ?)",
            (npc.id, json.dumps(npc.to_dict()))
        )
        await db.commit()


async def save_player(db_path: str, player: Player):
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT OR REPLACE INTO players (id, name, data) VALUES (?, ?, ?)",
            (player.id, player.name, json.dumps(player.to_dict()))
        )
        await db.commit()


async def save_item(db_path: str, item: Item):
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT OR REPLACE INTO items (id, data) VALUES (?, ?)",
            (item.id, json.dumps(item.to_dict()))
        )
        await db.commit()


async def create_starter_world(db_path: str = str(DB_PATH)):
    """Create a starter world with expanded dungeon."""
    await init_db(db_path)
    world = World()
    
    # Create entrance
    entrance = Room(
        id="entrance",
        name="Dungeon Entrance",
        description="You stand at the mouth of an ancient dungeon. Cold air drifts from within. A moss-covered stone archway marks the entrance. To the west, an ancient stone well sits covered in ivy.",
        exits={"north": "hallway", "outside": "wild"},
    )
    
    # Create the Wishing Well
    well = Room(
        id="well",
        name="The Wishing Well",
        description="A crumbling stone well dominates this small alcove. Ivy and moss climb its ancient stones. The water below glimmers with an unnatural light. Coins glitter at the bottom. Something about this place makes you want to make a wish...",
        exits={"east": "entrance"},
    )
    
    # Create hallway
    hallway = Room(
        id="hallway",
        name="Torch-Lit Corridor",
        description="A narrow corridor stretches before you. Flickering torches cast dancing shadows on the stone walls. Strange symbols are carved into the rocks.",
        exits={"south": "entrance", "north": "chamber", "east": "armory"},
    )
    
    # Create chamber
    chamber = Room(
        id="chamber",
        name="Grand Chamber",
        description="A vast chamber opens before you. Ancient columns rise to a ceiling lost in darkness. Something glints in the shadows to the north. To the west, a heavy door is covered in dust and cobwebs. To the east, an archway is overgrown with thorny vines.",
        exits={"south": "hallway", "north": "treasury", "west": "library", "east": "garden"},
    )
    
    # Create armory
    armory = Room(
        id="armory",
        name="Ruined Armory",
        description="Weapon racks line the walls, most empty or rusted beyond use. A single sword gleams on a pedestal. A dark staircase descends into shadow to the south.",
        exits={"west": "hallway", "down": "crypt"},
    )
    
    # Create treasury
    treasury = Room(
        id="treasury",
        name="Dragon's Hoard",
        description="Mountains of gold coins and glittering gems fill this chamber. Atop the hoard sleeps an ancient gold dragon.",
        exits={"south": "chamber"},
    )
    
    # Create the Forgotten Library
    library = Room(
        id="library",
        name="The Forgotten Library",
        description="Towering bookshelves stretch into darkness above. Dust motes dance in the stale air. Most books have rotted away, but a few remain—tomes bound in strange leather, their pages yellowed with age. A scholar's skeleton sits at a reading desk, a quill still clutched in its bony fingers.",
        exits={"east": "chamber"},
    )
    
    # Create the Crypt
    crypt = Room(
        id="crypt",
        name="The Crypt",
        description="Stone sarcophagi line the walls, their lids carved with the faces of the dead. The air is thick and cold. Something moves in the shadows between the tombs. Bones rattle somewhere in the darkness. The dead do not rest easily here.",
        exits={"up": "armory"},
    )
    
    # Create the Garden of Thorns
    garden = Room(
        id="garden",
        name="The Garden of Thorns",
        description="Beautiful yet deadly. Black roses bloom amid razor-sharp thorns. A silver fountain sits in the center, long dry. Fireflies drift through the air, casting dancing lights. The thorns seem to part for you as you walk, as if the garden itself is watching.",
        exits={"west": "chamber"},
    )
    
    # Add rooms to world
    world.add_room(entrance)
    world.add_room(well)
    world.add_room(hallway)
    world.add_room(chamber)
    world.add_room(armory)
    world.add_room(treasury)
    world.add_room(library)
    world.add_room(crypt)
    world.add_room(garden)
    
    # Create items
    from .models import Item
    sword = Item(
        id="rusty_sword",
        name="Rusty Sword",
        description="An old but serviceable sword. Perfectly balanced for combat.",
        location="armory",
        item_type="weapon",
        properties={"damage": 15, "durability": 50},
    )
    
    potion = Item(
        id="health_potion",
        name="Health Potion",
        description="A red liquid swirls in a glass vial. It smells of herbs and honey.",
        location="hallway",
        item_type="consumable",
        properties={"heals": 30},
    )
    
    gold = Item(
        id="gold_coins",
        name="Gold Coins",
        description="A small pile of ancient gold coins, stamped with a dragon sigil.",
        location="treasury",
        item_type="misc",
        properties={"value": 100},
    )
    
    silver_bell = Item(
        id="silver_bell",
        name="Silver Bell",
        description="A delicate silver bell that chimes with an otherworldly tone. It feels wrong to be holding this.",
        location="entrance",  # Initially with wandering spirit (via event)
        item_type="quest",
        properties={"quest_id": "fairy_bell"},
    )
    
    ancient_tome = Item(
        id="ancient_tome",
        name="Tome of Shadows",
        description="A leather-bound book that seems to drink in the light around it. Pages filled with cramped handwriting.",
        location="crypt",
        item_type="quest",
        properties={"quest_id": "scholar_tome"},
    )
    
    silver_dagger = Item(
        id="silver_dagger",
        name="Silver Dagger",
        description="A gleaming dagger made of pure silver. The blade hums with faint magical energy.",
        location="library",
        item_type="weapon",
        properties={"damage": 12, "durability": 80},
    )
    
    fairy_dust = Item(
        id="fairy_dust",
        name="Fairy Dust",
        description="Glittering silver powder that shimmers in the light. Strong magical properties.",
        location="garden",
        item_type="consumable",
        properties={"heals": 50, "buff": "glow"},
    )
    
    dragon_scale = Item(
        id="dragon_scale",
        name="Gold Dragon Scale",
        description="A massive scale from the ancient dragon's hide. It glows with faint warmth.",
        location="treasury",
        item_type="quest",
        properties={"quest_id": "dragon_wisdom"},
    )
    
    world.add_item(sword)
    world.add_item(potion)
    world.add_item(gold)
    world.add_item(silver_bell)
    world.add_item(ancient_tome)
    world.add_item(silver_dagger)
    world.add_item(fairy_dust)
    world.add_item(dragon_scale)
    
    # Create NPCs
    from .models import NPC
    guard = NPC(
        id="skeleton_guard",
        name="Skeleton Guard",
        description="An undead warrior, still clad in ancient armor. Empty eye sockets glow with unholy light.",
        room_id="hallway",
        personality={
            "traits": ["hostile", "protective"],
            "goals": "Defend the dungeon from intruders",
            "mood": "eternal vigilance",
        },
        ai_model="phi3",
    )
    
    dragon = NPC(
        id="gold_dragon",
        name="Ancient Dragon",
        description="A massive gold dragon, scales glittering like treasure itself. Its eyes are closed in ancient slumber.",
        room_id="treasury",
        personality={
            "traits": ["sleeping", "powerful", "intelligent"],
            "goals": "Protect its hoard",
            "mood": "dormant",
        },
        ai_model="phi3",
    )
    
    # Scholar Ghost (library)
    scholar = NPC(
        id="scholar_ghost",
        name="Scholar's Spirit",
        description="The ghost of a long-dead scholar. Ancient robes hang from translucent shoulders. Spectral spectacles float before hollow eyes.",
        room_id="library",
        personality={
            "traits": ["wise", "melancholic", "haunted"],
            "goals": "Find the Codex Umbral",
            "mood": "yearning",
        },
        ai_model="phi3",
    )
    
    # Fairy Queen (garden)
    fairy = NPC(
        id="fairy_queen",
        name="Thornweaver",
        description="A willowy figure of unearthly beauty, skin like pale bark, hair like black rose petals. Crowned in thorns, she sits beside the dry fountain.",
        room_id="garden",
        personality={
            "traits": ["enchanting", "mysterious", "playful"],
            "goals": "Recover her silver bell",
            "mood": "sorrowful",
        },
        ai_model="phi3",
    )
    
    # Skeleton Knight (crypt)
    knight = NPC(
        id="skeleton_knight",
        name="Crypt Knight",
        description="A towering skeleton in rusted plate armor. A shattered sword is clutched in its grip. The heraldry on its shield has long since worn away.",
        room_id="crypt",
        personality={
            "traits": ["hostile", "eternal", "sentinel"],
            "goals": "Guard the crypt forever",
            "mood": "grim",
        },
        ai_model="phi3",
    )
    
    # Wandering Spirit (entrance - spawns via events)
    spirit = NPC(
        id="wandering_spirit",
        name="Wandering Spirit",
        description="A translucent figure drifts through the air, looking lost and sorrowful.",
        room_id="entrance",
        personality={
            "traits": ["ghostly", "peaceful", "trapped"],
            "goals": "Find peace",
            "mood": "sad",
        },
        ai_model="phi3",
    )
    
    world.add_npc(guard)
    world.add_npc(dragon)
    world.add_npc(scholar)
    world.add_npc(fairy)
    world.add_npc(knight)
    world.add_npc(spirit)
    
    # Save everything
    for room in world.rooms.values():
        await save_room(db_path, room)
    for item in world.items.values():
        await save_item(db_path, item)
    for npc in world.npcs.values():
        await save_npc(db_path, npc)
    
    return world


async def save_brain_state(db_path: str, npc_id: str, brain_state: dict):
    """Save NPC brain state (memory, relationships) to database."""
    db_path = Path(db_path)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT OR REPLACE INTO npc_brains (npc_id, data) VALUES (?, ?)",
            (npc_id, json.dumps(brain_state))
        )
        await db.commit()


async def load_brain_state(db_path: str, npc_id: str) -> Optional[dict]:
    """Load NPC brain state from database."""
    db_path = Path(db_path)
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT data FROM npc_brains WHERE npc_id = ?", (npc_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return json.loads(row[0])
    return None


async def init_brain_db(db_path: str = str(DB_PATH)):
    """Initialize brain state tables."""
    db_path = Path(db_path)
    async with aiosqlite.connect(db_path) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS npc_brains (
                npc_id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
        """)
        await db.commit()
