"""
Astra-MUD: Quest System
Dynamic and static quests for players to complete
"""

from dataclasses import dataclass, field
from typing import Optional, Callable
from datetime import datetime
from enum import Enum
import uuid


class QuestDifficulty(Enum):
    TRIVIAL = 1
    EASY = 2
    MEDIUM = 3
    HARD = 4
    EPIC = 5


class QuestStatus(Enum):
    AVAILABLE = "available"
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"
    ABANDONED = "abandoned"


@dataclass
class QuestObjective:
    id: str
    description: str
    target_type: str  # "kill", "collect", "talk", "visit", "escort"
    target_id: str  # NPC id, item id, room id
    target_count: int = 1
    current_count: int = 0
    completed: bool = False


@dataclass
class Quest:
    id: str
    title: str
    description: str
    giver_id: Optional[str] = None  # NPC who gave the quest
    objectives: list[QuestObjective] = field(default_factory=list)
    reward_xp: int = 100
    reward_gold: int = 50
    reward_items: list[str] = field(default_factory=list)  # item ids
    difficulty: QuestDifficulty = QuestDifficulty.MEDIUM
    time_limit: Optional[int] = None  # minutes, None = no limit
    status: QuestStatus = QuestStatus.AVAILABLE
    accepted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    prerequisites: list[str] = field(default_factory=list)  # quest ids that must be completed first
    repeatable: bool = False
    properties: dict = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())
    
    def add_objective(self, description: str, target_type: str, target_id: str, count: int = 1):
        obj = QuestObjective(
            id=str(uuid.uuid4()),
            description=description,
            target_type=target_type,
            target_id=target_id,
            target_count=count,
        )
        self.objectives.append(obj)
        return obj
    
    def update_objective(self, target_id: str, delta: int = 1) -> bool:
        """Update objective progress. Returns True if objective completed."""
        for obj in self.objectives:
            if obj.target_id == target_id and not obj.completed:
                obj.current_count += delta
                if obj.current_count >= obj.target_count:
                    obj.completed = True
                return obj.completed
        return False
    
    def is_complete(self) -> bool:
        """Check if all objectives are complete."""
        return all(obj.completed for obj in self.objectives)
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "giver_id": self.giver_id,
            "objectives": [
                {
                    "id": o.id,
                    "description": o.description,
                    "current": o.current_count,
                    "target": o.target_count,
                    "done": o.completed,
                }
                for o in self.objectives
            ],
            "reward_xp": self.reward_xp,
            "reward_gold": self.reward_gold,
            "reward_items": self.reward_items,
            "difficulty": self.difficulty.name,
            "status": self.status.value,
        }


class QuestManager:
    """Manages quests in the game world."""
    
    def __init__(self):
        self.quests: dict[str, Quest] = {}  # All available quests
        self.active_quests: dict[str, dict[str, Quest]] = {}  # player_id -> quest_id -> quest
        self.completed_quests: dict[str, set[str]] = {}  # player_id -> set of completed quest ids
    
    def register_quest(self, quest: Quest):
        """Register a quest as available."""
        self.quests[quest.id] = quest
    
    def offer_quest(self, quest_id: str, player_id: str) -> Optional[Quest]:
        """Offer a quest to a player."""
        quest = self.quests.get(quest_id)
        if not quest:
            return None
        
        # Check prerequisites
        if quest.prerequisites:
            completed = self.completed_quests.get(player_id, set())
            for prereq in quest.prerequisites:
                if prereq not in completed:
                    return None  # Missing prerequisite
        
        # Create a copy for the player
        quest_copy = Quest(
            id=quest.id,
            title=quest.title,
            description=quest.description,
            giver_id=quest.giver_id,
            objectives=quest.objectives.copy(),
            reward_xp=quest.reward_xp,
            reward_gold=quest.reward_gold,
            reward_items=quest.reward_items.copy(),
            difficulty=quest.difficulty,
            time_limit=quest.time_limit,
            prerequisites=quest.prerequisites.copy(),
            repeatable=quest.repeatable,
        )
        
        if player_id not in self.active_quests:
            self.active_quests[player_id] = {}
        
        self.active_quests[player_id][quest_id] = quest_copy
        return quest_copy
    
    def accept_quest(self, quest_id: str, player_id: str) -> Optional[Quest]:
        """Accept a quest."""
        if player_id not in self.active_quests:
            return None
        
        quest = self.active_quests[player_id].get(quest_id)
        if quest:
            quest.status = QuestStatus.ACTIVE
            quest.accepted_at = datetime.utcnow()
        
        return quest
    
    def abandon_quest(self, quest_id: str, player_id: str) -> bool:
        """Abandon an active quest."""
        if player_id not in self.active_quests:
            return False
        
        quest = self.active_quests[player_id].get(quest_id)
        if quest and quest.status == QuestStatus.ACTIVE:
            quest.status = QuestStatus.ABANDONED
            return True
        return False
    
    def complete_quest(self, quest_id: str, player_id: str) -> Optional[Quest]:
        """Mark a quest as completed."""
        if player_id not in self.active_quests:
            return None
        
        quest = self.active_quests[player_id].get(quest_id)
        if quest and quest.is_complete():
            quest.status = QuestStatus.COMPLETED
            quest.completed_at = datetime.utcnow()
            
            # Track completion
            if player_id not in self.completed_quests:
                self.completed_quests[player_id] = set()
            self.completed_quests[player_id].add(quest_id)
            
            # Remove from active (unless repeatable)
            if not quest.repeatable:
                del self.active_quests[player_id][quest_id]
            
            return quest
        return None
    
    def get_quest_progress(self, quest_id: str, player_id: str) -> Optional[dict]:
        """Get player's progress on a quest."""
        if player_id not in self.active_quests:
            return None
        
        quest = self.active_quests[player_id].get(quest_id)
        if not quest:
            return None
        
        return {
            "title": quest.title,
            "status": quest.status.value,
            "objectives": [
                {
                    "description": o.description,
                    "progress": f"{o.current_count}/{o.target_count}",
                    "done": o.completed,
                }
                for o in quest.objectives
            ],
        }
    
    def get_available_quests(self, player_id: str) -> list[Quest]:
        """Get quests available to a player (not yet accepted)."""
        available = []
        completed = self.completed_quests.get(player_id, set())
        
        for quest in self.quests.values():
            # Skip if already active
            if player_id in self.active_quests and quest.id in self.active_quests[player_id]:
                continue
            
            # Skip if completed and not repeatable
            if quest.id in completed and not quest.repeatable:
                continue
            
            # Check prerequisites
            if quest.prerequisites:
                if not all(p in completed for p in quest.prerequisites):
                    continue
            
            available.append(quest)
        
        return available
    
    def get_active_quests(self, player_id: str) -> list[Quest]:
        """Get player's active quests."""
        return list(self.active_quests.get(player_id, {}).values())


# Pre-defined quests

def create_skeleton_guard_quest() -> Quest:
    """Quest: Help the Skeleton Guard deal with rats in the dungeon."""
    quest = Quest(
        id="skeleton_rats",
        title="The Rat Problem",
        description="The Skeleton Guard complains about rats infesting the armory. Kill 3 rats to help.",
        giver_id="skeleton_guard",
        difficulty=QuestDifficulty.EASY,
        reward_xp=50,
        reward_gold=25,
    )
    quest.add_objective("Kill rats in the armory", "kill", "rat", 3)
    return quest


def create_dragon_quest() -> Quest:
    """Quest: Wake the Ancient Dragon and seek its wisdom."""
    quest = Quest(
        id="dragon_wisdom",
        title="The Sleeping Dragon",
        description="The ancient dragon sleeps on its hoard. Perhaps if you offer it something, it will share its wisdom.",
        giver_id="gold_dragon",
        difficulty=QuestDifficulty.HARD,
        reward_xp=200,
        reward_gold=100,
        prerequisites=["skeleton_rats"],  # Must complete easier quest first
    )
    quest.add_objective("Offer the dragon a gold coin", "interact", "gold_dragon", 1)
    return quest


def create_merchant_quest() -> Quest:
    """Quest: Deliver a message to another NPC."""
    quest = Quest(
        id="deliver_message",
        title="A Message for the Guard",
        description="A wandering merchant asks you to deliver a message to the Skeleton Guard about a disturbance in the forest.",
        giver_id=None,  # No specific giver
        difficulty=QuestDifficulty.TRIVIAL,
        reward_xp=30,
        reward_gold=15,
    )
    quest.add_objective("Deliver the message", "talk", "skeleton_guard", 1)
    return quest


def create_scholar_tome_quest() -> Quest:
    """Quest: The Scholar's Spirit wants the Tome of Shadows from the Crypt."""
    quest = Quest(
        id="scholar_tome",
        title="The Lost Knowledge",
        description="The Scholar's Spirit in the library seeks a tome hidden in the Crypt below. Bring the Tome of Shadows to prove that knowledge is not forgotten.",
        giver_id="scholar_ghost",
        difficulty=QuestDifficulty.MEDIUM,
        reward_xp=150,
        reward_gold=75,
    )
    quest.add_objective("Find the Tome of Shadows in the Crypt", "visit", "crypt", 1)
    quest.add_objective("Return the tome to the Scholar's Spirit", "talk", "scholar_ghost", 1)
    return quest


def create_fairy_bell_quest() -> Quest:
    """Quest: Thornweaver lost her silver bell to a Wandering Spirit."""
    quest = Quest(
        id="fairy_bell",
        title="The Fairy's Bell",
        description="Thornweaver in the Garden of Thorns mourns her silver bell. It was taken by a Wandering Spirit. Perhaps if you find the spirit, you can return what was lost.",
        giver_id="fairy_queen",
        difficulty=QuestDifficulty.MEDIUM,
        reward_xp=100,
        reward_gold=50,
    )
    quest.add_objective("Find the Wandering Spirit", "interact", "wandering_spirit", 1)
    quest.add_objective("Return the Silver Bell to Thornweaver", "talk", "fairy_queen", 1)
    return quest


def create_dragon_riddle_quest() -> Quest:
    """Quest: Solve the dragon's riddle for a piece of its hoard."""
    quest = Quest(
        id="dragon_riddle",
        title="The Dragon's Riddle",
        description="The ancient dragon Velathor speaks in riddles and puzzles. It has posed a question: 'I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?' Answer correctly, and treasure shall be yours.",
        giver_id="gold_dragon",
        difficulty=QuestDifficulty.HARD,
        reward_xp=300,
        reward_gold=200,
        prerequisites=["scholar_tome"],  # Need some lore knowledge
    )
    quest.add_objective("Solve the dragon's riddle", "interact", "gold_dragon", 1)
    return quest


def get_starter_quests() -> list[Quest]:
    """Get all starter quests."""
    return [
        create_skeleton_guard_quest(),
        create_dragon_quest(),
        create_merchant_quest(),
        create_scholar_tome_quest(),
        create_fairy_bell_quest(),
        create_dragon_riddle_quest(),
    ]