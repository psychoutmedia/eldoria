"""
Astra-MUD: Web Server v2
Multiplayer WebSocket server with player registry
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from collections.abc import MutableMapping
from starlette.applications import Starlette
from starlette.routing import Route, WebSocketRoute
from starlette.responses import HTMLResponse
from starlette.websockets import WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from world.database import load_world, save_npc, save_player, create_starter_world
from world.models import World
from world.quests import QuestManager, get_starter_quests, QuestStatus
from world.events import WorldEventManager, check_and_trigger_random_events
from npcs.brain import NPCBrain


# Global world state
world: World = None
brains: dict[str, NPCBrain] = {}
quest_manager: QuestManager = None
event_manager: WorldEventManager = None
DB_PATH = Path(__file__).parent.parent / "data" / "world.db"


# ============================================================
# PLAYER REGISTRY (for multiplayer)
# ============================================================
class PlayerRegistry:
    """Tracks all connected players."""
    
    def __init__(self):
        self.sessions: dict[str, 'GameSession'] = {}  # player_id -> session
    
    def register(self, session: 'GameSession'):
        self.sessions[session.player_id] = session
    
    def unregister(self, player_id: str):
        self.sessions.pop(player_id, None)
    
    def get_player_ids(self) -> list[str]:
        return list(self.sessions.keys())
    
    def get_player_names(self) -> list[str]:
        return [s.player_name for s in self.sessions.values()]
    
    def get_session(self, player_id: str) -> 'GameSession':
        return self.sessions.get(player_id)
    
    def get_session_by_name(self, name: str) -> 'GameSession':
        for s in self.sessions.values():
            if s.player_name.lower() == name.lower():
                return s
        return None
    
    def broadcast(self, message: str, exclude_id: str = None):
        """Broadcast to all players."""
        for pid, session in self.sessions.items():
            if pid != exclude_id:
                asyncio.create_task(session.send(message))
    
    def broadcast_room(self, room_id: str, message: str, exclude_id: str = None):
        """Broadcast to players in same room."""
        for pid, session in self.sessions.items():
            if pid != exclude_id and session.room_id == room_id:
                asyncio.create_task(session.send(message))


registry = PlayerRegistry()


# ============================================================
# LORE SYSTEM
# ============================================================
LORE_TEXT = """
🌙 THE FORGOTTEN DUNGEON OF ASTRAMERE

Long before the kingdoms of men rose from the mists, the Archmage Valdris the Eternal raised this fortress in the name of knowledge. For three centuries, Astramere served as the world's greatest repository of forbidden lore—spells that could reshape mountains, rituals that could bend time itself.

The dragon you see sleeping in the treasury was not born there. Velathor was bound here by Valdris himself, a guardian bound by blood-magic to protect the deeper vaults. But the binding held longer than even Valdris anticipated. Centuries passed. Kingdoms fell. The archmage's bloodline scattered to the winds.

Velathor waits. The binding weakens with each passing year, but it holds still—a thread of ancient will refusing to snap. In slumber, the dragon dreams of the day it was bound, the face of the archmage burned into its ancient memory.

The dungeon's fall came not from without, but within.

In the century of storms (Year 703 by the old reckoning), a student named Mira Nightwhisper sought to free the dragon. She believed Velathor held knowledge of the long-lost Path Between Moments—a way to step outside time itself. Her ritual failed. The backlash shattered the eastern tower and broke something in the weave of reality within these walls.

Now the dungeon echoes with more than memory. Something walks the corridors. Something that was not here before Mira's failure.

Rumors speak of a book—the Codex Umbral—that Mira hid before she was consumed. It contains the ritual she attempted, annotated with what she learned. Find it, and you may learn the truth of this place...

Or you may meet the same fate she did.

The dragon sleeps on, bound by threads older than kingdoms. Perhaps the answer lies not in waking Velathor, but in understanding why the binding persists. The Archmage Valdris left no records of his binding-spells. No successor was named.

Why?
"""


# ============================================================
# ROOM DESCRIPTION BUILDER
# ============================================================
async def get_room_description(room, world: World) -> str:
    """Build rich room description."""
    desc = f"**{room.name}**\n\n{room.description}\n"
    
    # Exits
    if room.exits:
        exits = ", ".join(room.exits.keys())
        desc += f"\n*Exits: {exits}*\n"
    
    # Items
    items = [world.get_item(i) for i in room.items if world.get_item(i)]
    if items:
        item_names = ", ".join(f"*{i.name}*" for i in items)
        desc += f"\n*You see: {item_names}*\n"
    
    # NPCs
    npcs = [world.get_npc(n) for n in room.npcs if world.get_npc(n)]
    if npcs:
        npc_names = ", ".join(f"*{n.name}*" for n in npcs)
        desc += f"\n*Present: {npc_names}*\n"
    
    return desc


# ============================================================
# GAME SESSION
# ============================================================
class GameSession:
    """Manages a single player connection."""
    
    def __init__(self, websocket: WebSocket, player_id: str, player_name: str):
        self.websocket = websocket
        self.player_id = player_id
        self.player_name = player_name
        self.room_id = "entrance"
    
    async def send(self, message: str):
        await self.websocket.send_text(json.dumps({"type": "message", "content": message}))
    
    async def send_room(self):
        room = world.get_room(self.room_id)
        if room:
            desc = await get_room_description(room, world)
            await self.send(desc)
    
    async def handle_command(self, command: str):
        global world
        
        cmd = command.strip().lower()
        
        # Movement
        if cmd in ["n", "north"]:
            await self.do_move("north")
        elif cmd in ["s", "south"]:
            await self.do_move("south")
        elif cmd in ["e", "east"]:
            await self.do_move("east")
        elif cmd in ["w", "west"]:
            await self.do_move("west")
        elif cmd in ["u", "up"]:
            await self.do_move("up")
        elif cmd in ["d", "down"]:
            await self.do_move("down")
        
        # Look
        elif cmd in ["look", "l"]:
            await self.send_room()
        
        # Say (broadcast to room)
        elif cmd.startswith("say "):
            message = cmd[4:]
            await self.handle_say(message)
        
        # Tell (private message)
        elif cmd.startswith("tell "):
            parts = cmd[5:].split(" ", 1)
            if len(parts) == 2:
                target_name, msg = parts
                await self.handle_tell(target_name, msg)
            else:
                await self.send("Usage: tell [player] [message]")
        
        # Who (online players)
        elif cmd in ["who", "players", "online"]:
            await self.handle_who()
        
        # Talk to NPC
        elif cmd.startswith("talk to ") or cmd.startswith("talk "):
            npc_name = cmd.replace("talk to ", "").replace("talk ", "").strip()
            await self.handle_talk(npc_name)
        
        # Take item
        elif cmd.startswith("take ") or cmd.startswith("get ") or cmd.startswith("pick up "):
            item_name = cmd.replace("take ", "").replace("get ", "").replace("pick up ", "").strip()
            await self.handle_take(item_name)
        
        # Drop item
        elif cmd.startswith("drop "):
            item_name = cmd[5:].strip()
            await self.handle_drop(item_name)
        
        # Use item
        elif cmd.startswith("use "):
            item_name = cmd[4:].strip()
            await self.handle_use(item_name)
        
        # Inventory
        elif cmd in ["inventory", "inv", "i"]:
            await self.handle_inventory()
        
        # Examine
        elif cmd.startswith("examine ") or cmd.startswith("x "):
            target = cmd.replace("examine ", "").replace("x ", "").strip()
            await self.handle_examine(target)
        
        # Lore
        elif cmd in ["lore", "history", "lore of astra"]:
            await self.handle_lore()
        
        # Help
        elif cmd in ["help", "h", "?"]:
            await self.send("""**Commands:**
- `n/s/e/w/u/d` - Move (north/south/east/west/up/down)
- `look` - Examine room
- `say [message]` - Speak (all in room hear)
- `tell [player] [msg]` - Private message
- `who` - See who's online
- `talk to [npc]` - Talk to NPC
- `take [item]` / `drop [item]` / `use [item]` - Item management
- `examine [item]` - Inspect item
- `attack [npc]` - Attack NPC
- `inventory` - Check belongings
- `lore` - Learn the dungeon's history
- `quests` / `quest [id]` - Quest management
- `status` - View quest progress
- `help` - Show this message""")
        
        # Quests
        elif cmd in ["quests", "q"]:
            await self.handle_quests()
        
        elif cmd.startswith("quest "):
            quest_id = cmd[6:].strip()
            await self.handle_accept_quest(quest_id)
        
        elif cmd in ["status"]:
            await self.handle_quest_status()
        
        # Attack NPC
        elif cmd.startswith("attack ") or cmd.startswith("kill ") or cmd.startswith("fight "):
            npc_name = cmd.replace("attack ", "").replace("kill ", "").replace("fight ", "").strip()
            await self.handle_attack(npc_name)
        
        # Wish (for the Wishing Well)
        elif cmd.startswith("wish "):
            msg = cmd[5:].strip()
            await self.handle_wish(msg)
        
        elif cmd in ["throw coin", "toss coin"]:
            await self.handle_wish("coin")
        
        else:
            await self.send(f"You can't do that ('{cmd}'). Type `help` for commands.")
    
    async def do_move(self, direction: str):
        room = world.get_room(self.room_id)
        if not room:
            await self.send("You seem lost...")
            return
        
        if direction not in room.exits:
            await self.send(f"You can't go {direction} from here.")
            return
        
        target_room_id = room.exits[direction]
        target_room = world.get_room(target_room_id)
        
        if not target_room:
            await self.send("The path leads into darkness...")
            return
        
        old_room = self.room_id
        self.room_id = target_room_id
        
        player = world.get_player(self.player_id)
        if player:
            player.room_id = target_room_id
            await save_player(str(DB_PATH), player)
        
        await self.send(f"\n*You travel {direction}...*\n")
        await self.send_room()
        
        # Announce arrival to others in room
        registry.broadcast_room(
            self.room_id,
            f"\n🌟 *{self.player_name} arrives from the {direction}*\n",
            exclude_id=self.player_id
        )
        
        # Check for events
        if event_manager:
            active = event_manager.get_events_for_room(self.room_id)
            if active:
                msg = event_manager.format_events_message(self.room_id)
                if msg:
                    await self.send(f"\n{msg}\n")
            else:
                encounter = event_manager.check_random_encounter(self.room_id)
                if encounter:
                    await self.send(f"\n⚠️ *{encounter.name}* - {encounter.description}\n")
    
    async def handle_say(self, message: str):
        room = world.get_room(self.room_id)
        if not room:
            return
        
        await self.send(f"You say: {message}")
        
        # Broadcast to others in room
        registry.broadcast_room(
            self.room_id,
            f"\n💬 *{self.player_name} says: {message}*\n",
            exclude_id=self.player_id
        )
        
        # NPCs react
        for npc_id in room.npcs:
            npc = world.get_npc(npc_id)
            if npc and npc_id in brains:
                brain = brains[npc_id]
                context = f"The player '{self.player_name}' just said: '{message}'"
                response = await brain.think(f"The player says: {message}", context, player_id=self.player_id)
                
                brain.record_interaction(
                    self.player_id,
                    f"Player said '{message}'",
                    response[:100],
                    delta=0
                )
                
                if response:
                    await self.send(f"\n*{npc.name} responds: {response}*\n")
    
    async def handle_tell(self, target_name: str, message: str):
        """Send private message to another player."""
        target = registry.get_session_by_name(target_name)
        if not target:
            await self.send(f"Player '{target_name}' is not online.")
            return
        
        await self.send(f"📨 You tell {target_name}: {message}")
        await target.send(f"\n📨 *{self.player_name} whispers to you: {message}*\n")
    
    async def handle_who(self):
        """List online players."""
        names = registry.get_player_names()
        if not names:
            await self.send("No other players online.")
            return
        
        count = len(names)
        player_list = ", ".join(f"*{n}*" for n in names)
        await self.send(f"**Online ({count}):** {player_list}")
    
    async def handle_talk(self, npc_name: str):
        room = world.get_room(self.room_id)
        if not room:
            return
        
        npc = world.get_npc_by_name(npc_name, self.room_id)
        if not npc:
            await self.send(f"There's no one called '{npc_name}' here.")
            return
        
        if npc.id not in brains:
            brains[npc.id] = NPCBrain(
                npc_id=npc.id,
                name=npc.name,
                personality=npc.personality,
                ai_model=npc.ai_model,
            )
        
        brain = brains[npc.id]
        context = f"Current room: {room.name}\n{npc.name} is here. They are {npc.personality.get('mood', 'neutral')}."
        
        await self.send(f"\nYou approach {npc.name} and strike up a conversation...")
        
        response = await brain.think(
            f"The player '{self.player_name}' wants to talk. Start a conversation as {npc.name}.",
            context,
            player_id=self.player_id
        )
        
        brain.record_interaction(
            self.player_id,
            "Player initiated conversation",
            response[:100] if response else "",
            delta=+5
        )
        
        await self.send(f"\n*{npc.name}: {response}*\n")
        
        npc.last_interaction = datetime.utcnow()
        await save_npc(str(DB_PATH), npc)
    
    async def handle_take(self, item_name: str):
        """Pick up an item."""
        room = world.get_room(self.room_id)
        if not room:
            return
        
        # Find item in room
        found_item = None
        for item_id in room.items:
            item = world.get_item(item_id)
            if item and item_name.lower() in item.name.lower():
                found_item = item
                break
        
        if not found_item:
            await self.send(f"There's no '{item_name}' here to take.")
            return
        
        player = world.get_player(self.player_id)
        if not player:
            return
        
        # Move item from room to player
        room.items.remove(found_item.id)
        found_item.location = self.player_id
        player.inventory.append(found_item.id)
        
        await save_player(str(DB_PATH), player)
        await self.send(f"✅ You pick up *{found_item.name}*.")
    
    async def handle_drop(self, item_name: str):
        """Drop an item from inventory."""
        player = world.get_player(self.player_id)
        if not player:
            return
        
        found_item = None
        for item_id in player.inventory:
            item = world.get_item(item_id)
            if item and item_name.lower() in item.name.lower():
                found_item = item
                break
        
        if not found_item:
            await self.send(f"You don't have a '{item_name}'.")
            return
        
        # Move item from player to room
        player.inventory.remove(found_item.id)
        found_item.location = self.room_id
        room = world.get_room(self.room_id)
        room.items.append(found_item.id)
        
        await save_player(str(DB_PATH), player)
        await self.send(f"✅ You drop *{found_item.name}*.")
    
    async def handle_use(self, item_name: str):
        """Use an item (consumables, etc)."""
        player = world.get_player(self.player_id)
        if not player:
            return
        
        found_item = None
        for item_id in player.inventory:
            item = world.get_item(item_id)
            if item and item_name.lower() in item.name.lower():
                found_item = item
                break
        
        if not found_item:
            await self.send(f"You don't have a '{item_name}'.")
            return
        
        # Handle by item type
        if found_item.item_type == "consumable":
            props = found_item.properties
            if "heals" in props:
                heal = props["heals"]
                player.hp = min(player.max_hp, player.hp + heal)
                await save_player(str(DB_PATH), player)
                await self.send(f"💚 You drink the *{found_item.name}* and recover {heal} HP! (HP: {player.hp}/{player.max_hp})")
                player.inventory.remove(found_item.id)
                return
        
        if found_item.item_type == "weapon":
            await self.send(f"You equip *{found_item.name}*.")
            return
        
        await self.send(f"You can't figure out how to use *{found_item.name}*.")
    
    async def handle_examine(self, target: str):
        """Examine an item or NPC."""
        # Check inventory first
        player = world.get_player(self.player_id)
        if player:
            for item_id in player.inventory:
                item = world.get_item(item_id)
                if item and target.lower() in item.name.lower():
                    await self.send(f"**{item.name}** — {item.description}")
                    if item.properties:
                        await self.send(f"*Properties: {item.properties}*")
                    return
        
        # Check room items
        room = world.get_room(self.room_id)
        if room:
            for item_id in room.items:
                item = world.get_item(item_id)
                if item and target.lower() in item.name.lower():
                    await self.send(f"**{item.name}** — {item.description}")
                    return
        
        await self.send(f"You don't see '{target}' to examine.")
    
    async def handle_lore(self):
        """Display the dungeon's history."""
        await self.send(LORE_TEXT)
    
    async def handle_wish(self, msg: str):
        """Handle wishing at the Wishing Well."""
        if self.room_id != "well":  # Only works in well room
            await self.send("There's no well here to throw coins into.")
            return
        
        # Check if player has gold
        player = world.get_player(self.player_id)
        has_gold = any(
            world.get_item(i) and world.get_item(i).id == "gold_coins"
            for i in player.inventory
        )
        
        if "coin" not in msg.lower() and not has_gold:
            await self.send("You need to offer something valuable...")
            return
        
        import random
        effects = [
            ("blessing", "✨ A warm light engulfs you! Your wounds feel less severe. (+20 HP)"),
            ("insight", "💡 Knowledge floods your mind. You feel smarter!"),
            ("curse", "👻 A cold wind passes through you. You feel... watched."),
            ("fortune", "💰 A gold coin appears in your pocket! (+1 Gold)"),
            ("weakness", "😨 Your strength fades momentarily. (-10 max HP)"),
        ]
        
        effect, description = random.choice(effects)
        await self.send(description)
        
        if effect == "blessing" and player:
            player.hp = min(player.max_hp, player.hp + 20)
            await save_player(str(DB_PATH), player)
        elif effect == "weakness" and player:
            player.max_hp = max(10, player.max_hp - 10)
            await save_player(str(DB_PATH), player)
    
    async def handle_inventory(self):
        player = world.get_player(self.player_id)
        if not player:
            await self.send("You carry nothing.")
            return
        
        # HP display
        hp_bar = f"HP: {player.hp}/{player.max_hp}"
        await self.send(f"**{self.player_name}** | {hp_bar}\n")
        
        if not player.inventory:
            await self.send("Your pockets are empty.")
            return
        
        items = [world.get_item(i) for i in player.inventory if world.get_item(i)]
        item_list = "\n".join(f"📦 *{i.name}*: {i.description}" for i in items)
        await self.send(f"**Inventory:**\n{item_list}")
    
    async def handle_quests(self):
        available = quest_manager.get_available_quests(self.player_id)
        active = quest_manager.get_active_quests(self.player_id)
        
        msg = "**Quests**\n\n"
        
        if active:
            msg += "*Active Quests:*\n"
            for quest in active:
                msg += f"- *{quest.title}* ({quest.status.value})\n"
                for obj in quest.objectives:
                    status = "✓" if obj.completed else "○"
                    msg += f"  {status} {obj.description} ({obj.current_count}/{obj.target_count})\n"
            msg += "\n"
        
        if available:
            msg += "*Available Quests:*\n"
            for quest in available:
                diff = quest.difficulty.name
                msg += f"- *{quest.title}* [{diff}] - {quest.description[:60]}...\n"
                msg += f"  Rewards: {quest.reward_xp} XP, {quest.reward_gold} gold\n"
                msg += f"  Type `quest {quest.id}` to accept.\n\n"
        else:
            msg += "*No available quests.*\n"
        
        await self.send(msg)
    
    async def handle_accept_quest(self, quest_id: str):
        quest = quest_manager.offer_quest(quest_id, self.player_id)
        if not quest:
            await self.send("That quest is not available.")
            return
        
        quest_manager.accept_quest(quest_id, self.player_id)
        await self.send(f"\n*You accept the quest: {quest.title}*\n")
        await self.send(f"**Objective:** {quest.description}\n")
        for obj in quest.objectives:
            await self.send(f"- {obj.description} ({obj.current_count}/{obj.target_count})")
    
    async def handle_quest_status(self):
        active = quest_manager.get_active_quests(self.player_id)
        
        if not active:
            await self.send("You have no active quests. Type `quests` to see available quests.")
            return
        
        msg = "**Your Quests**\n\n"
        for quest in active:
            msg += f"*{quest.title}* [{quest.status.value}]\n"
            for obj in quest.objectives:
                status = "✓" if obj.completed else "○"
                msg += f"  {status} {obj.description} ({obj.current_count}/{obj.target_count})\n"
            msg += "\n"
        
        await self.send(msg)
    
    async def handle_attack(self, npc_name: str):
        room = world.get_room(self.room_id)
        if not room:
            return
        
        npc = world.get_npc_by_name(npc_name, self.room_id)
        if not npc:
            await self.send(f"There's no one called '{npc_name}' here.")
            return
        
        await self.send(f"\n*You attack {npc.name}!*")
        
        if npc.id in brains:
            brain = brains[npc.id]
            rel = brain.relationships.get_relationship(self.player_id)
            
            if "cowardly" in npc.personality.get("traits", []):
                await self.send(f"\n*{npc.name} screams in terror and flees!*")
                return
            
            if "hostile" in npc.personality.get("traits", []) or "aggressive" in npc.personality.get("traits", []):
                await self.send(f"\n*{npc.name} retaliates with fury!*")
                response = await brain.think(
                    f"The player '{self.player_name}' is attacking you! React as {npc.name} in combat.",
                    f"You are in combat with {self.player_name}!",
                    player_id=self.player_id
                )
                if response:
                    await self.send(f"\n*{npc.name}: {response}*")
                return
            
            response = await brain.think(
                f"The player '{self.player_name}' is attacking you! React as {npc.name}.",
                f"You are being attacked by {self.player_name}!",
                player_id=self.player_id
            )
            if response:
                await self.send(f"\n*{npc.name}: {response}*")
        else:
            await self.send(f"\n*{npc.name} is confused by your attack.*")


# ============================================================
# WEBSOCKET ENDPOINT
# ============================================================
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    await websocket.send_text(json.dumps({
        "type": "welcome",
        "content": """**Welcome to Astra-MUD** 🏰
An LLM-powered multiplayer text adventure

Type `help` for commands."""
    }))
    
    await websocket.send_text(json.dumps({
        "type": "message",
        "content": "What is your name, adventurer?"
    }))
    
    try:
        data = await websocket.receive_text()
        player_name = data.strip()
    except:
        await websocket.close()
        return
    
    if not player_name or len(player_name) < 2:
        await websocket.send_text(json.dumps({
            "type": "error",
            "content": "Name must be at least 2 characters."
        }))
        await websocket.close()
        return
    
    # Create or get player
    player = world.get_player_by_name(player_name)
    if not player:
        from world.models import Player
        import uuid
        player = Player(
            id=str(uuid.uuid4()),
            name=player_name,
            room_id="entrance",
        )
        world.add_player(player)
        await save_player(str(DB_PATH), player)
    
    session = GameSession(websocket, player.id, player_name)
    registry.register(session)
    
    await session.send_room()
    
    # Announce arrival to others
    registry.broadcast_room(
        session.room_id,
        f"\n🌟 *{player_name} has entered the dungeon!*\n",
        exclude_id=player.id
    )
    
    # Main game loop
    try:
        while True:
            data = await websocket.receive_text()
            await session.handle_command(data)
    except WebSocketDisconnect:
        registry.unregister(player.id)
        registry.broadcast_room(
            session.room_id,
            f"\n👤 *{player_name} has left the dungeon...*\n"
        )


async def homepage(request):
    html_path = Path(__file__).parent / "templates" / "game.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text())
    return HTMLResponse("<h1>Astra-MUD</h1><p>Game client not found.</p>")


# ============================================================
# STARTUP
# ============================================================
async def startup():
    global world, quest_manager, event_manager
    
    print("🏰 Astra-MUD Starting...")
    
    if DB_PATH.exists():
        print("Loading world from database...")
        world = await load_world(str(DB_PATH))
        print(f"Loaded {len(world.rooms)} rooms, {len(world.npcs)} NPCs, {len(world.players)} players")
    else:
        print("Creating new world...")
        world = await create_starter_world(str(DB_PATH))
        print(f"Created world with {len(world.rooms)} rooms")
    
    quest_manager = QuestManager()
    for quest in get_starter_quests():
        quest_manager.register_quest(quest)
    
    event_manager = WorldEventManager()
    print(f"Loaded {len(event_manager.random_encounters)} random encounters")
    
    for npc_id, npc in world.npcs.items():
        brains[npc_id] = NPCBrain(
            npc_id=npc.id,
            name=npc.name,
            personality=npc.personality,
            ai_model=npc.ai_model,
        )
    
    print("Ready!")


@asynccontextmanager
async def lifespan(app):
    await startup()
    yield


app = Starlette(
    routes=[
        Route("/", homepage),
        WebSocketRoute("/ws", websocket_endpoint),
    ],
    lifespan=lifespan,
)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
