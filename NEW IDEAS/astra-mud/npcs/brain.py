"""
Astra-MUD: NPC Brain
LLM-powered NPC controller with memory and relationships
"""

import aiohttp
import json
from typing import Optional
from datetime import datetime

from .personality import build_system_prompt
from .memory import NPCMemory, RelationshipTracker, get_memory_context, get_relationship_context


class NPCBrain:
    """LLM-powered brain for an NPC."""
    
    def __init__(
        self,
        npc_id: str,
        name: str,
        personality: dict,
        ai_model: str = "phi3",
        base_url: str = "http://localhost:11434",
    ):
        self.npc_id = npc_id
        self.name = name
        self.personality = personality
        self.ai_model = ai_model
        self.base_url = base_url
        self.conversation_history: list[dict] = []
        self.max_history = 20  # Keep last 20 exchanges
        
        # Memory system
        self.memory = NPCMemory(npc_id)
        self.relationships = RelationshipTracker(npc_id)
        
        # Personality-driven behaviors
        self.mood = personality.get("mood", "neutral")
        self.goals = personality.get("goals", "survive")
        self.traits = personality.get("traits", [])
    
    async def think(self, player_input: str, world_context: str, player_id: Optional[str] = None) -> str:
        """Generate NPC response to player input."""
        
        # Build memory context
        memory_context = ""
        if player_id:
            memory_context = get_memory_context(self.memory, player_id)
            relationship_context = get_relationship_context(self.relationships, player_id, self.name)
        else:
            memory_context = get_memory_context(self.memory)
            relationship_context = ""
        
        # Build system prompt with personality and recent memory
        system_prompt = build_system_prompt(
            self.name,
            self.personality,
            self.conversation_history[-5:] if self.conversation_history else [],
            world_context,
            memory_context,
            relationship_context,
        )
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": player_input},
        ]
        
        # Call Ollama
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.ai_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.8,
                "top_p": 0.9,
            }
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status != 200:
                        return f"{self.name} seems distracted and doesn't respond."
                    
                    data = await resp.json()
                    response = data["message"]["content"]
                    
                    # Add to conversation history
                    self.conversation_history.append({
                        "role": "user",
                        "content": player_input,
                    })
                    self.conversation_history.append({
                        "role": "assistant", 
                        "content": response,
                    })
                    
                    # Trim history
                    if len(self.conversation_history) > self.max_history * 2:
                        self.conversation_history = self.conversation_history[-self.max_history * 2:]
                    
                    return response
                    
        except aiohttp.ClientError:
            return f"{self.name} is unavailable (Ollama not running)."
    
    async def think_stream(self, player_input: str, world_context: str, player_id: Optional[str] = None):
        """Generate NPC response with streaming."""
        
        # Build memory context
        memory_context = ""
        if player_id:
            memory_context = get_memory_context(self.memory, player_id)
            relationship_context = get_relationship_context(self.relationships, player_id, self.name)
        else:
            memory_context = get_memory_context(self.memory)
            relationship_context = ""
        
        system_prompt = build_system_prompt(
            self.name,
            self.personality,
            self.conversation_history[-5:] if self.conversation_history else [],
            world_context,
            memory_context,
            relationship_context,
        )
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": player_input},
        ]
        
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.ai_model,
            "messages": messages,
            "stream": True,
        }
        
        full_response = ""
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    if resp.status != 200:
                        yield f"{self.name} seems distracted."
                        return
                    
                    async for line in resp.content:
                        if line:
                            try:
                                data = json.loads(line)
                                if "message" in data and "content" in data["message"]:
                                    token = data["message"]["content"]
                                    full_response += token
                                    yield token
                                if data.get("done"):
                                    break
                            except json.JSONDecodeError:
                                continue
            
            # Add to history
            self.conversation_history.append({"role": "user", "content": player_input})
            self.conversation_history.append({"role": "assistant", "content": full_response})
            
        except aiohttp.ClientError:
            yield f"{self.name} is unavailable (Ollama not running)."
    
    def add_memory(self, event: str, player_id: Optional[str] = None, importance: int = 3):
        """Add an episodic memory."""
        self.memory.add_memory(event, player_id, importance)
    
    def record_interaction(self, player_id: str, action: str, outcome: str, delta: int):
        """Record an interaction and adjust relationship."""
        # Add memory
        self.add_memory(f"{action}: {outcome}", player_id, importance=abs(delta))
        
        # Adjust relationship
        self.relationships.adjust_relationship(player_id, delta, f"{action} -> {outcome}")
    
    def clear_history(self):
        """Clear conversation history (e.g., after long absence)."""
        self.conversation_history = []
    
    def get_state(self) -> dict:
        """Get brain state for persistence."""
        return {
            "conversation_history": self.conversation_history,
            "ai_model": self.ai_model,
            "memory": self.memory.get_state(),
            "relationships": self.relationships.get_state(),
        }
    
    def load_state(self, state: dict):
        """Restore brain state."""
        self.conversation_history = state.get("conversation_history", [])
        self.ai_model = state.get("ai_model", self.ai_model)
        
        if "memory" in state:
            self.memory = NPCMemory.from_state(state["memory"])
        
        if "relationships" in state:
            self.relationships = RelationshipTracker.from_state(state["relationships"])
    
    def apply_personality_behavior(self, action: str) -> str:
        """Modify action based on personality traits."""
        if "cowardly" in self.traits and action in ["attack", "threaten"]:
            return "flee"
        if "aggressive" in self.traits and action == "talk":
            return "challenge"
        return action