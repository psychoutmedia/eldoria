"""
Astra-MUD: World Models
Core entities: Room, Item, NPC, Player
"""

from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
import uuid


@dataclass
class Position:
    x: int = 0
    y: int = 0
    z: int = 0  # z for multi-floor dungeons


@dataclass
class Room:
    id: str
    name: str
    description: str
    position: Position = field(default_factory=Position)
    exits: dict[str, str] = field(default_factory=dict)  # direction -> room_id
    items: list[str] = field(default_factory=list)  # item_ids
    npcs: list[str] = field(default_factory=list)  # npc_ids
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "position": {"x": self.position.x, "y": self.position.y, "z": self.position.z},
            "exits": self.exits,
            "items": self.items,
            "npcs": self.npcs,
            "properties": self.properties,
        }


@dataclass
class Item:
    id: str
    name: str
    description: str
    location: str  # room_id or player_id
    item_type: str = "misc"  # weapon, armor, consumable, quest, misc
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "location": self.location,
            "item_type": self.item_type,
            "properties": self.properties,
        }


@dataclass 
class NPC:
    id: str
    name: str
    description: str
    room_id: str
    personality: dict = field(default_factory=dict)  # traits, goals, mood
    inventory: list[str] = field(default_factory=list)
    memory: list[dict] = field(default_factory=list)  # episodic memory
    relationships: dict = field(default_factory=dict)  # player_id -> relationship_score
    ai_model: str = "phi3"  # Ollama model to use
    is_alive: bool = True
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_interaction: Optional[datetime] = None
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "room_id": self.room_id,
            "personality": self.personality,
            "inventory": self.inventory,
            "memory": self.memory,
            "relationships": self.relationships,
            "ai_model": self.ai_model,
            "is_alive": self.is_alive,
            "properties": self.properties,
        }
    
    def add_memory(self, event: str, importance: int = 1):
        """Add an episodic memory with timestamp."""
        self.memory.append({
            "event": event,
            "importance": importance,
            "timestamp": datetime.utcnow().isoformat(),
        })
        # Keep last 100 memories
        if len(self.memory) > 100:
            self.memory = self.memory[-100:]


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
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "room_id": self.room_id,
            "inventory": self.inventory,
            "hp": self.hp,
            "max_hp": self.max_hp,
            "properties": self.properties,
        }


class World:
    """Container for the entire game world state."""
    
    def __init__(self):
        self.rooms: dict[str, Room] = {}
        self.items: dict[str, Item] = {}
        self.npcs: dict[str, NPC] = {}
        self.players: dict[str, Player] = {}
        
    def get_room(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id)
    
    def get_item(self, item_id: str) -> Optional[Item]:
        return self.items.get(item_id)
    
    def get_npc(self, npc_id: str) -> Optional[NPC]:
        return self.npcs.get(npc_id)
    
    def get_player(self, player_id: str) -> Optional[Player]:
        return self.players.get(player_id)
    
    def get_player_by_name(self, name: str) -> Optional[Player]:
        for player in self.players.values():
            if player.name.lower() == name.lower():
                return player
        return None
    
    def get_npc_by_name(self, name: str, room_id: str) -> Optional[NPC]:
        """Get NPC by name in a specific room."""
        room = self.get_room(room_id)
        if not room:
            return None
        for npc_id in room.npcs:
            npc = self.get_npc(npc_id)
            if npc and npc.name.lower() == name.lower():
                return npc
        return None
    
    def add_room(self, room: Room):
        self.rooms[room.id] = room
        
    def add_item(self, item: Item):
        self.items[item.id] = item
        
    def add_npc(self, npc: NPC):
        self.npcs[npc.id] = npc
        
    def add_player(self, player: Player):
        self.players[player.id] = player
