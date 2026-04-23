"""
Astra-MUD: World Events System
Random encounters, timed events, and dynamic world changes
"""

import random
import asyncio
from dataclasses import dataclass, field
from typing import Optional, Callable
from datetime import datetime, timedelta
from enum import Enum
import uuid


class EventType(Enum):
    RANDOM_ENCOUNTER = "random_encounter"
    TIMED_EVENT = "timed_event"
    WORLD_CHANGE = "world_change"
    NPC_ARRIVAL = "npc_arrival"
    ITEM_SPAWN = "item_spawn"
    WEATHER_CHANGE = "weather_change"


class EventSeverity(Enum):
    MINOR = 1      # Flavor text, no gameplay effect
    NOTABLE = 2    # Small effect, NPC reaction
    MAJOR = 3      # Affects gameplay, combat possible
    CRITICAL = 4   # Dangerous, world state change


@dataclass
class WorldEvent:
    id: str
    event_type: EventType
    title: str
    description: str
    severity: EventSeverity = EventSeverity.MINOR
    duration_minutes: Optional[int] = None  # None = instant, >0 = timed
    affected_rooms: list[str] = field(default_factory=list)  # empty = all rooms
    affected_npcs: list[str] = field(default_factory=list)
    on_trigger: Optional[Callable] = None  # Callback when event triggers
    on_expire: Optional[Callable] = None  # Callback when event ends
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    properties: dict = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())
        if self.duration_minutes and not self.expires_at:
            self.expires_at = self.created_at + timedelta(minutes=self.duration_minutes)
    
    def is_expired(self) -> bool:
        if self.expires_at is None:
            return False
        return datetime.utcnow() > self.expires_at


@dataclass
class RandomEncounter:
    id: str
    name: str
    description: str
    rooms: list[str]  # Where this encounter can occur
    min_player_level: int = 1
    max_player_level: int = 99
    rarity: float = 0.1  # 0.0 to 1.0, chance per player action
    hostile: bool = True
    npc_template_id: Optional[str] = None
    loot_table: list[tuple[str, float]] = field(default_factory=list)  # item_id, drop_rate
    properties: dict = field(default_factory=dict)


class WorldEventManager:
    """Manages world events, random encounters, and timed events."""
    
    def __init__(self):
        self.active_events: list[WorldEvent] = []
        self.event_history: list[WorldEvent] = []
        self.random_encounters: list[RandomEncounter] = []
        self.event_callbacks: dict[str, Callable] = {}
        
        # Configuration
        self.encounter_cooldown = 5  # minutes between random encounters
        self.last_encounter: dict[str, datetime] = {}  # room_id -> last encounter time
        
        # Register default encounters
        self._register_default_encounters()
    
    def _register_default_encounters(self):
        """Register starter random encounters."""
        encounters = [
            RandomEncounter(
                id="rat_swarm",
                name="Rat Swarm",
                description="A swarm of rats scurries through the shadows, their red eyes gleaming.",
                rooms=["hallway", "armory", "entrance"],
                min_player_level=1,
                max_player_level=5,
                rarity=0.3,
                hostile=True,
            ),
            RandomEncounter(
                id="skeleton_rogue",
                name="Skeleton Rogue",
                description="A skeletal figure in tattered robes slinks through the darkness, clutching a rusty dagger.",
                rooms=["hallway", "chamber"],
                min_player_level=3,
                max_player_level=8,
                rarity=0.15,
                hostile=True,
            ),
            RandomEncounter(
                id="wandering_spirit",
                name="Wandering Spirit",
                description="A translucent figure drifts through the air, looking lost and sorrowful.",
                rooms=["entrance", "hallway", "chamber", "treasury"],
                min_player_level=1,
                max_player_level=10,
                rarity=0.2,
                hostile=False,
            ),
            RandomEncounter(
                id="treasure_chest",
                name="Treasure Chest",
                description="An ornate chest sits in a shadowy alcove, its lock covered in cobwebs.",
                rooms=["hallway", "chamber", "armory"],
                min_player_level=1,
                max_player_level=10,
                rarity=0.05,
                hostile=False,
                loot_table=[
                    ("gold_coins", 0.7),
                    ("health_potion", 0.3),
                ],
            ),
            # New encounters for expanded world
            RandomEncounter(
                id="book_fall",
                name="Falling Tome",
                description="A heavy book tumbles from a high shelf, crashing to the ground with a cloud of dust.",
                rooms=["library"],
                min_player_level=1,
                max_player_level=10,
                rarity=0.25,
                hostile=False,
            ),
            RandomEncounter(
                id="ghost_whisper",
                name="Ghostly Whisper",
                description="A cold breath on your neck. A whisper in a language you almost understand... 'The Codex... find the Codex...'",
                rooms=["library", "crypt"],
                min_player_level=2,
                max_player_level=8,
                rarity=0.3,
                hostile=False,
            ),
            RandomEncounter(
                id="skeleton_hand",
                name="Grasping Bones",
                description="A skeletal hand erupts from the floor, grasping at your ankles! More bones clatter as a skeleton pulls itself from the earth.",
                rooms=["crypt"],
                min_player_level=3,
                max_player_level=10,
                rarity=0.35,
                hostile=True,
            ),
            RandomEncounter(
                id="cursed_tomb",
                name="Cursed Stone",
                description="One of the tomb lids slides open with a grinding shriek. Green mist seeps from within. You feel a chill settle into your bones.",
                rooms=["crypt"],
                min_player_level=4,
                max_player_level=10,
                rarity=0.2,
                hostile=False,
            ),
            RandomEncounter(
                id="fairy_circle",
                name="Fairy Ring",
                description="Mushrooms glow with soft light, forming a perfect circle. Tiny footprints appear in the dew, but you see no one.",
                rooms=["garden"],
                min_player_level=1,
                max_player_level=10,
                rarity=0.3,
                hostile=False,
            ),
            RandomEncounter(
                id="rose_thorns",
                name="Thorn Ambush",
                description="The roses suddenly reach out with razor-sharp thorns! You narrowly dodge a swipe at your face.",
                rooms=["garden"],
                min_player_level=2,
                max_player_level=6,
                rarity=0.2,
                hostile=True,
            ),
            RandomEncounter(
                id="well_wish",
                name="Whispers from the Well",
                description="The water in the well ripples without wind. Voices whisper from the deep, speaking words you cannot quite catch.",
                rooms=["well"],
                min_player_level=1,
                max_player_level=10,
                rarity=0.4,
                hostile=False,
            ),
            RandomEncounter(
                id="coin_glint",
                name="Glinting Coin",
                description="A gold coin catches the light, half-buried in moss near the well's edge.",
                rooms=["well"],
                min_player_level=1,
                max_player_level=10,
                rarity=0.15,
                hostile=False,
                loot_table=[
                    ("gold_coins", 1.0),
                ],
            ),
        ]
        
        for encounter in encounters:
            self.register_encounter(encounter)
    
    def register_encounter(self, encounter: RandomEncounter):
        """Register a random encounter."""
        self.random_encounters.append(encounter)
    
    def register_event_callback(self, event_type: str, callback: Callable):
        """Register a callback for a specific event type."""
        self.event_callbacks[event_type] = callback
    
    async def trigger_event(self, event: WorldEvent) -> bool:
        """Trigger a world event."""
        # Call trigger callback if set
        if event.on_trigger:
            try:
                await event.on_trigger(event)
            except Exception as e:
                print(f"Event trigger error: {e}")
        
        # Add to active events
        self.active_events.append(event)
        
        # Schedule expiration if timed
        if event.expires_at:
            asyncio.create_task(self._expire_event(event))
        
        return True
    
    async def _expire_event(self, event: WorldEvent):
        """Handle event expiration."""
        await asyncio.sleep(max(0, (event.expires_at - datetime.utcnow()).total_seconds()))
        
        if event in self.active_events:
            self.active_events.remove(event)
            self.event_history.append(event)
            
            if event.on_expire:
                try:
                    await event.on_expire(event)
                except Exception as e:
                    print(f"Event expire error: {e}")
    
    def check_random_encounter(self, room_id: str, player_level: int = 1) -> Optional[RandomEncounter]:
        """Check if a random encounter triggers in a room."""
        # Check cooldown
        last = self.last_encounter.get(room_id)
        if last:
            cooldown_end = last + timedelta(minutes=self.encounter_cooldown)
            if datetime.utcnow() < cooldown_end:
                return None
        
        # Filter encounters by room and level
        valid_encounters = [
            e for e in self.random_encounters
            if room_id in e.rooms
            and e.min_player_level <= player_level <= e.max_player_level
        ]
        
        if not valid_encounters:
            return None
        
        # Roll for each encounter
        for encounter in valid_encounters:
            if random.random() < encounter.rarity:
                self.last_encounter[room_id] = datetime.utcnow()
                return encounter
        
        return None
    
    def create_timed_event(
        self,
        title: str,
        description: str,
        duration_minutes: int,
        severity: EventSeverity = EventSeverity.NOTABLE,
        affected_rooms: Optional[list[str]] = None,
    ) -> WorldEvent:
        """Create a timed world event."""
        return WorldEvent(
            id=str(uuid.uuid4()),
            event_type=EventType.TIMED_EVENT,
            title=title,
            description=description,
            severity=severity,
            duration_minutes=duration_minutes,
            affected_rooms=affected_rooms or [],
        )
    
    def create_world_change(
        self,
        title: str,
        description: str,
        severity: EventSeverity = EventSeverity.MAJOR,
        permanent: bool = False,
    ) -> WorldEvent:
        """Create a world state change event."""
        return WorldEvent(
            id=str(uuid.uuid4()),
            event_type=EventType.WORLD_CHANGE,
            title=title,
            description=description,
            severity=severity,
            duration_minutes=None if permanent else 60,  # Default 1 hour if not permanent
        )
    
    def get_active_events(self) -> list[WorldEvent]:
        """Get all currently active events."""
        return [e for e in self.active_events if not e.is_expired()]
    
    def get_events_for_room(self, room_id: str) -> list[WorldEvent]:
        """Get active events affecting a specific room."""
        return [
            e for e in self.active_events
            if not e.is_expired()
            and (not e.affected_rooms or room_id in e.affected_rooms)
        ]
    
    def format_events_message(self, room_id: str) -> Optional[str]:
        """Format active events as a message for the player."""
        events = self.get_events_for_room(room_id)
        if not events:
            return None
        
        lines = []
        for event in events:
            if event.severity == EventSeverity.CRITICAL:
                lines.append(f"⚠️ *{event.title}* - {event.description}")
            elif event.severity == EventSeverity.MAJOR:
                lines.append(f"⚡ *{event.title}* - {event.description}")
            elif event.severity == EventSeverity.NOTABLE:
                lines.append(f"✨ *{event.title}*")
            else:
                lines.append(f"*Event:* {event.title}")
        
        return "\n".join(lines)


# Pre-defined world events

def create_earthquake_event() -> WorldEvent:
    """A minor earthquake shakes the dungeon."""
    return WorldEvent(
        id="earthquake_minor",
        event_type=EventType.WORLD_CHANGE,
        title="The Ground Trembles",
        description="The ancient stones rumble and dust falls from above. Something has awakened...",
        severity=EventSeverity.NOTABLE,
        duration_minutes=5,
        affected_rooms=[],
    )


def create_darkness_event() -> WorldEvent:
    """Magical darkness spreads through the dungeon."""
    return WorldEvent(
        id="magical_darkness",
        event_type=EventType.WORLD_CHANGE,
        title="Unnatural Darkness",
        description="Shadows deepen and torchlight flickers. An unnatural darkness fills the air.",
        severity=EventSeverity.MAJOR,
        duration_minutes=15,
        affected_rooms=["hallway", "chamber", "armory"],
    )


def create_dragon_awakens_event() -> WorldEvent:
    """The dragon stirs from slumber (major event)."""
    return WorldEvent(
        id="dragon_stirs",
        event_type=EventType.WORLD_CHANGE,
        title="The Dragon Stirs",
        description="A deep rumble echoes through the treasury. The ancient dragon's eyes flicker with awakening fire!",
        severity=EventSeverity.CRITICAL,
        duration_minutes=30,
        affected_rooms=["treasury", "chamber"],
    )


def create_merchant_arrival() -> WorldEvent:
    """A wandering merchant arrives in the dungeon."""
    return WorldEvent(
        id="merchant_arrival",
        event_type=EventType.NPC_ARRIVAL,
        title="A Wandering Merchant",
        description="A mysterious figure wrapped in colorful robes appears, setting up a small stall.",
        severity=EventSeverity.NOTABLE,
        duration_minutes=60,
        affected_rooms=["entrance"],
    )


# Event trigger conditions

async def check_and_trigger_random_events(event_manager: WorldEventManager, room_id: str, player_level: int):
    """Check conditions and potentially trigger a random event."""
    encounter = event_manager.check_random_encounter(room_id, player_level)
    if encounter:
        event = WorldEvent(
            id=str(uuid.uuid4()),
            event_type=EventType.RANDOM_ENCOUNTER,
            title=encounter.name,
            description=encounter.description,
            severity=EventSeverity.MAJOR if encounter.hostile else EventSeverity.NOTABLE,
        )
        await event_manager.trigger_event(event)
        return event
    return None