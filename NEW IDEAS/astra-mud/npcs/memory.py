"""
Astra-MUD: NPC Memory System
Episodic memory for NPCs that persists across interactions
"""

from typing import Optional
from datetime import datetime, timedelta
import json


class NPCMemory:
    """Manages episodic memory for a single NPC."""
    
    # Memory importance levels
    TRIVIAL = 1
    MINOR = 2
    NOTABLE = 3
    IMPORTANT = 4
    CRITICAL = 5
    
    def __init__(self, npc_id: str):
        self.npc_id = npc_id
        self.episodes: list[dict] = []  # List of {event, importance, timestamp, player_id}
        self.max_episodes = 100
    
    def add_memory(self, event: str, player_id: Optional[str] = None, importance: int = NOTABLE):
        """Add an episodic memory."""
        episode = {
            "event": event,
            "importance": importance,
            "timestamp": datetime.utcnow().isoformat(),
            "player_id": player_id,
        }
        self.episodes.append(episode)
        
        # Trim to max
        if len(self.episodes) > self.max_episodes:
            self.episodes = self.episodes[-self.max_episodes:]
    
    def get_recent_memories(self, count: int = 10) -> list[dict]:
        """Get the N most recent memories."""
        return self.episodes[-count:]
    
    def get_memories_about_player(self, player_id: str, count: int = 5) -> list[dict]:
        """Get memories involving a specific player."""
        player_memories = [m for m in self.episodes if m.get("player_id") == player_id]
        return player_memories[-count:]
    
    def get_important_memories(self, min_importance: int = NOTABLE) -> list[dict]:
        """Get memories above a certain importance threshold."""
        return [m for m in self.episodes if m["importance"] >= min_importance]
    
    def get_memories_since(self, hours: int) -> list[dict]:
        """Get memories from the last N hours."""
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        cutoff_iso = cutoff.isoformat()
        return [m for m in self.episodes if m["timestamp"] > cutoff_iso]
    
    def format_memories_for_prompt(self, count: int = 10) -> str:
        """Format recent memories as a string for LLM prompt."""
        recent = self.get_recent_memories(count)
        if not recent:
            return "No recent memories."
        
        formatted = []
        for m in recent:
            ts = datetime.fromisoformat(m["timestamp"])
            relative = self._relative_time(ts)
            formatted.append(f"- [{relative}] {m['event']}")
        
        return "\n".join(formatted)
    
    def _relative_time(self, timestamp: datetime) -> str:
        """Get relative time string."""
        delta = datetime.utcnow() - timestamp
        if delta.total_seconds() < 60:
            return "just now"
        elif delta.total_seconds() < 3600:
            mins = int(delta.total_seconds() / 60)
            return f"{mins}m ago"
        elif delta.total_seconds() < 86400:
            hours = int(delta.total_seconds() / 3600)
            return f"{hours}h ago"
        else:
            days = int(delta.total_seconds() / 86400)
            return f"{days}d ago"
    
    def get_state(self) -> dict:
        """Serialize for persistence."""
        return {
            "npc_id": self.npc_id,
            "episodes": self.episodes,
        }
    
    @classmethod
    def from_state(cls, state: dict) -> "NPCMemory":
        """Deserialize from persistence."""
        memory = cls(state["npc_id"])
        memory.episodes = state.get("episodes", [])
        return memory


class RelationshipTracker:
    """Tracks player-NPC relationships."""
    
    # Relationship status
    HOSTILE = "hostile"      # Wants to harm player
    UNFRIENDLY = "unfriendly" # Wary, distrustful
    NEUTRAL = "neutral"      # Default
    FRIENDLY = "friendly"    # Trusts player
    ALLIED = "allied"        # Active ally
    
    def __init__(self, npc_id: str):
        self.npc_id = npc_id
        self.relationships: dict[str, dict] = {}  # player_id -> {score, status, trust_level, notes}
    
    def adjust_relationship(self, player_id: str, delta: int, reason: str = ""):
        """Adjust relationship score for a player. Range: -100 to +100."""
        if player_id not in self.relationships:
            self.relationships[player_id] = {
                "score": 0,
                "status": self.NEUTRAL,
                "trust_level": 0,  # 0-100
                "notes": [],
            }
        
        rel = self.relationships[player_id]
        rel["score"] = max(-100, min(100, rel["score"] + delta))
        rel["score"] = int(rel["score"])
        
        if reason:
            rel["notes"].append({
                "action": reason,
                "timestamp": datetime.utcnow().isoformat(),
                "delta": delta,
            })
        
        # Keep only last 20 notes
        if len(rel["notes"]) > 20:
            rel["notes"] = rel["notes"][-20:]
        
        # Update status based on score
        rel["status"] = self._score_to_status(rel["score"])
    
    def _score_to_status(self, score: int) -> str:
        """Convert numeric score to status string."""
        if score >= 75:
            return self.ALLIED
        elif score >= 25:
            return self.FRIENDLY
        elif score >= -25:
            return self.NEUTRAL
        elif score >= -75:
            return self.UNFRIENDLY
        else:
            return self.HOSTILE
    
    def get_relationship(self, player_id: str) -> dict:
        """Get full relationship data for a player."""
        return self.relationships.get(player_id, {
            "score": 0,
            "status": self.NEUTRAL,
            "trust_level": 0,
            "notes": [],
        })
    
    def get_status_for_prompt(self, player_id: str) -> str:
        """Get relationship status as a string for LLM prompt."""
        rel = self.get_relationship(player_id)
        status = rel["status"]
        
        if status == self.HOSTILE:
            return "hostile (wants to harm you)"
        elif status == self.UNFRIENDLY:
            return "unfriendly (wary and distrustful)"
        elif status == self.NEUTRAL:
            return "neutral (neither trusting nor hostile)"
        elif status == self.FRIENDLY:
            return "friendly (trusts you)"
        elif status == self.ALLIED:
            return "allied (active friend and ally)"
        
        return "neutral"
    
    def format_all_relationships(self) -> str:
        """Format all relationships for LLM context."""
        if not self.relationships:
            return "No prior interactions."
        
        lines = []
        for player_id, rel in self.relationships.items():
            lines.append(f"- {player_id}: {rel['status']} (score: {rel['score']})")
        
        return "\n".join(lines)
    
    def get_state(self) -> dict:
        """Serialize for persistence."""
        return {
            "npc_id": self.npc_id,
            "relationships": self.relationships,
        }
    
    @classmethod
    def from_state(cls, state: dict) -> "RelationshipTracker":
        """Deserialize from persistence."""
        tracker = cls(state["npc_id"])
        tracker.relationships = state.get("relationships", {})
        return tracker


# Helper functions

def get_memory_context(memory: NPCMemory, player_id: Optional[str] = None) -> str:
    """Build memory context string for NPC brain."""
    if player_id:
        # Player-specific memories
        player_memories = memory.get_memories_about_player(player_id)
        if player_memories:
            return f"Memories involving this player:\n{memory.format_memories_for_prompt(5)}"
    
    # General recent memories
    recent = memory.get_recent_memories(5)
    if recent:
        return f"Recent events:\n{memory.format_memories_for_prompt(5)}"
    
    return "No recent memories."


def get_relationship_context(tracker: RelationshipTracker, player_id: str, npc_name: str) -> str:
    """Build relationship context for NPC brain."""
    rel = tracker.get_relationship(player_id)
    status = tracker.get_status_for_prompt(player_id)
    
    context = f"Your relationship with this player: {status}"
    
    # Add recent notable events
    notes = rel.get("notes", [])
    if notes:
        recent = notes[-3:]  # Last 3 interactions
        context += "\nRecent interactions:"
        for note in recent:
            ts = datetime.fromisoformat(note["timestamp"])
            context += f"\n- {note['action']} ({note['delta']:+d})"
    
    return context