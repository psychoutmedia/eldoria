#!/usr/bin/env python3
"""
Astra-MUD: World Regeneration Script
Regenerates the world database from scratch using the procedural generator.
Run with: python3 regenerate_world.py [--rooms N] [--seed N]
"""

import sys
import asyncio
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from world.generator import DungeonGenerator
from world.database import init_db, save_room, save_item, save_npc, DB_PATH
from world.models import World, Room, Item, NPC


async def regenerate(target_rooms: int = 300, seed: int = 42):
    """Regenerate the world database."""
    print(f"🔄 Regenerating world: {target_rooms} rooms, seed={seed}")
    
    # Remove old database
    db_path = Path(DB_PATH)
    if db_path.exists():
        print(f"  Removing old database...")
        db_path.unlink()
    
    # Initialize fresh database
    await init_db(str(db_path))
    
    # Generate new world
    gen = DungeonGenerator(seed=seed)
    rooms, items, npcs = gen.generate_world(target_rooms=target_rooms)
    
    print(f"\n💾 Saving to database...")
    
    # Save rooms
    for room in rooms:
        await save_room(str(db_path), room)
    print(f"  Saved {len(rooms)} rooms")
    
    # Save items
    for item in items:
        await save_item(str(db_path), item)
    print(f"  Saved {len(items)} items")
    
    # Save NPCs
    for npc in npcs:
        await save_npc(str(db_path), npc)
    print(f"  Saved {len(npcs)} NPCs")
    
    print(f"\n✨ World regenerated: {len(rooms)} rooms, {len(items)} items, {len(npcs)} NPCs")


async def expand(target_rooms: int = 300, seed: int = 42):
    """Expand the existing world by adding new zones."""
    print(f"🔄 Expanding world to {target_rooms} rooms...")
    
    # Load existing world
    from world.database import load_world
    world = await load_world(str(DB_PATH))
    print(f"  Loaded existing: {len(world.rooms)} rooms")
    
    # Generate more
    gen = DungeonGenerator(seed=seed)
    new_rooms, new_items, new_npcs = gen.generate_world(target_rooms=target_rooms)
    
    # Merge (simple: just add new ones)
    for room in new_rooms:
        world.add_room(room)
    for item in new_items:
        world.add_item(item)
    for npc in new_npcs:
        world.add_npc(npc)
    
    print(f"  After merge: {len(world.rooms)} rooms")
    print("  Save logic would go here — for now just regenerate")


def main():
    parser = argparse.ArgumentParser(description="Regenerate the Astra-MUD world")
    parser.add_argument("--rooms", type=int, default=300, help="Target room count (default: 300)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42)")
    parser.add_argument("--expand", action="store_true", help="Expand existing world")
    args = parser.parse_args()
    
    if args.expand:
        asyncio.run(expand(args.rooms, args.seed))
    else:
        asyncio.run(regenerate(args.rooms, args.seed))


if __name__ == "__main__":
    main()
