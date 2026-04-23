"""
Astra-MUD: NPC Behaviors
Behavior trees and reaction patterns based on personality
"""

from typing import Optional, Callable
from dataclasses import dataclass
from enum import Enum


class BehaviorState(Enum):
    IDLE = "idle"
    ALERT = "alert"
    AGGRESSIVE = "aggressive"
    FRIENDLY = "friendly"
    SCARED = "scared"


@dataclass
class BehaviorResult:
    action: str
    message: str
    should_remember: bool = True
    importance: int = 3


class NPCBehaviors:
    """Personality-driven behavior patterns for NPCs."""
    
    def __init__(self, personality: dict, room_id: str):
        self.personality = personality
        self.room_id = room_id
        self.traits = personality.get("traits", [])
        self.mood = personality.get("mood", "neutral")
        self.goals = personality.get("goals", "")
        
        # Current behavior state
        self.state = self._get_initial_state()
        
        # Cooldown tracking
        self.last_action_time = 0
        self.action_cooldown = 2  # seconds between actions
    
    def _get_initial_state(self) -> BehaviorState:
        """Determine initial behavior state based on personality."""
        if "sleeping" in self.traits or "dormant" in self.mood:
            return BehaviorState.IDLE
        elif "hostile" in self.traits or "aggressive" in self.traits:
            return BehaviorState.ALERT
        elif "friendly" in self.traits or "jovial" in self.mood:
            return BehaviorState.FRIENDLY
        elif "cowardly" in self.traits:
            return BehaviorState.SCARED
        return BehaviorState.IDLE
    
    def on_player_enter(self, player_name: str) -> Optional[BehaviorResult]:
        """React when player enters the room."""
        
        if self.state == BehaviorState.IDLE:
            # Sleeping/dormant NPCs wake up slowly
            return BehaviorResult(
                action="wake",
                message=f"*{self.personality.get('name', 'NPC')} stirs and opens their eyes...*",
                should_remember=True,
                importance=2,
            )
        
        elif self.state == BehaviorState.AGGRESSIVE:
            return BehaviorResult(
                action="threaten",
                message=f"*{self.personality.get('name', 'NPC')} bares their weapon and glares at you!*",
                should_remember=True,
                importance=4,
            )
        
        elif self.state == BehaviorState.FRIENDLY:
            return BehaviorResult(
                action="greet",
                message=f"*{self.personality.get('name', 'NPC)} welcomes you warmly.*",
                should_remember=True,
                importance=2,
            )
        
        elif self.state == BehaviorState.SCARED:
            return BehaviorResult(
                action="hide",
                message=f"*{self.personality.get('name', 'NPC')} flinches and tries to hide.*",
                should_remember=True,
                importance=2,
            )
        
        return None
    
    def on_player_attack(self, player_name: str) -> Optional[BehaviorResult]:
        """React when player attacks."""
        
        # Cowardly NPCs flee
        if "cowardly" in self.traits:
            self.state = BehaviorState.SCARED
            return BehaviorResult(
                action="flee",
                message=f"*{self.personality.get('name', 'NPC')} screams and runs away!*",
                should_remember=True,
                importance=5,
            )
        
        # Hostile NPCs fight back
        if "hostile" in self.traits or "aggressive" in self.traits:
            self.state = BehaviorState.AGGRESSIVE
            return BehaviorResult(
                action="counter_attack",
                message=f"*{self.personality.get('name', 'NPC')} retaliates with fury!*",
                should_remember=True,
                importance=5,
            )
        
        # Otherwise become aggressive
        self.state = BehaviorState.ALERT
        return BehaviorResult(
            action="defend",
            message=f"*{self.personality.get('name', 'NPC')} raises their guard!*",
            should_remember=True,
            importance=4,
        )
    
    def on_player_give(self, player_name: str, item: str) -> Optional[BehaviorResult]:
        """React when player gives an item."""
        
        if "greedy" in self.traits:
            self.state = BehaviorState.FRIENDLY
            return BehaviorResult(
                action="accept_gift",
                message=f"*{self.personality.get('name', 'NPC')} eyes the {item} greedily and accepts it!*",
                should_remember=True,
                importance=3,
            )
        
        # Friendly NPCs appreciate gifts
        if "friendly" in self.traits:
            self.state = BehaviorState.FRIENDLY
            return BehaviorResult(
                action="appreciate",
                message=f"*{self.personality.get('name', 'NPC')} smiles and thanks you sincerely.*",
                should_remember=True,
                importance=3,
            )
        
        return BehaviorResult(
            action="accept",
            message=f"*{self.personality.get('name', 'NPC')} accepts the {item}.*",
            should_remember=True,
            importance=2,
        )
    
    def on_player_leave(self, player_name: str) -> Optional[BehaviorResult]:
        """React when player leaves."""
        
        if self.state == BehaviorState.FRIENDLY:
            return BehaviorResult(
                action="farewell",
                message=f"*{self.personality.get('name', 'NPC')} waves goodbye.*",
                should_remember=False,
                importance=1,
            )
        
        elif self.state == BehaviorState.AGGRESSIVE:
            return BehaviorResult(
                action="taunt",
                message=f"*{self.personality.get('name', 'NPC')} shouts: 'Run away, coward!'*",
                should_remember=False,
                importance=2,
            )
        
        return None
    
    def on_world_event(self, event: str) -> Optional[BehaviorResult]:
        """React to world events (dragon attack, earthquake, etc.)."""
        
        if "cowardly" in self.traits:
            return BehaviorResult(
                action="panic",
                message=f"*{self.personality.get('name', 'NPC')} panics and hides!*",
                should_remember=True,
                importance=4,
            )
        
        if "protective" in self.traits:
            self.state = BehaviorState.ALERT
            return BehaviorResult(
                action="defend_post",
                message=f"*{self.personality.get('name', 'NPC')} takes a defensive stance.*",
                should_remember=True,
                importance=3,
            )
        
        return None


# Behavior modifiers based on relationship score

def get_aggression_modifier(relationship_score: int) -> float:
    """Get aggression multiplier based on relationship (-1 to +1)."""
    # Score range: -100 to +100
    normalized = relationship_score / 100.0
    # -1 = very hostile, +1 = very friendly
    return -normalized  # Higher trust = lower aggression


def get_greeting_based_on_relationship(relationship_score: int, npc_name: str) -> str:
    """Get appropriate greeting based on relationship."""
    if relationship_score >= 75:
        return f"*{npc_name} greets you like an old friend!*"
    elif relationship_score >= 25:
        return f"*{npc_name} nods in recognition.*"
    elif relationship_score >= -25:
        return f"*{npc_name} eyes you warily.*"
    elif relationship_score >= -75:
        return f"*{npc_name} glares at you suspiciously.*"
    else:
        return f"*{npc_name} snarls and prepares to attack!*"