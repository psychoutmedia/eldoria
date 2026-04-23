"""
Astra-MUD: World Generator
Procedural dungeon/world generation for large-scale MUDs
"""

import random
import uuid
from typing import Optional
from .models import Room, Item, NPC, Position


# ============================================================
# ROOM TEMPLATES — Theme + Room Type combinations
# ============================================================
class RoomTemplate:
    def __init__(
        self,
        room_type: str,
        theme: str,
        names: list[str],
        descriptions: list[str],
        exits_possible: list[str] = ["north", "south", "east", "west", "up", "down"],
        item_chance: float = 0.3,
        npc_chance: float = 0.2,
        hostility: float = 0.3,
    ):
        self.room_type = room_type
        self.theme = theme
        self.names = names
        self.descriptions = descriptions
        self.exits_possible = exits_possible
        self.item_chance = item_chance
        self.npc_chance = npc_chance
        self.hostility = hostility


DUNGEON_TEMPLATES = [
    # Catacombs
    RoomTemplate("bone_pit", "catacomb", [
        "Ossuary Chamber", "Bone Garden", "The Skeleton Workshop",
        "Mass Grave", "Bone Bridge", "The Remains Room"
    ], [
        "Skulls stare from walls set in grim mosaics. The floor crunches beneath your feet.",
        "Bones arranged in intricate patterns line the walls. Someone took great care here.",
        "A workshop of the dead. Skeletons in various states of assembly await orders that never came.",
        "Bodies piled three deep, centuries old. A smell of ancient decay and ceremonial herbs.",
        "A bridge made entirely of femurs and tibias spans a pit of lesser remains.",
        "A quiet room of the honored dead. Their faces still hold expressions of peace."
    ]),
    RoomTemplate("crypt_royal", "catacomb", [
        "Royal Crypt", "Noble Tomb", "The Blood Sepulcher",
        "Knight's Rest", "Queen's Chamber", "The Founder's Vault"
    ], [
        "A king's final resting place. The sarcophagus depicts a face serene in death.",
        "Nobles of great houses lie in marble tombs. Their heraldry still gleams.",
        "Blood still stains the altar where sacrifices were made. The dead drink deep here.",
        "Armored knights sleep standing, swords crossed over chests. Ready even in death.",
        "A queen's bower of death. Silk rotted away but jewelry and crowns remain.",
        "The founder of the dungeon lies here. A name, half-eroded, reads: Valdris."
    ]),
    RoomTemplate("prison", "catacomb", [
        "The Holding Cells", "Torture Chamber", "The Forgotten Ones",
        "Executioner's Hall", "Manacles Row", "The Screaming Corridor"
    ], [
        "Cells line both walls, most empty, some not. Chains rattle as you pass.",
        "Implements of pain hang on hooks. Some still bear traces of their last use.",
        "Prisoners the dungeon forgot to execute. They look at you with pleading eyes.",
        "A stage for justice and cruelty in equal measure. The block bears dark stains.",
        "Chains at head height. Whoever was here did not leave willingly.",
        "Sound echoes strangely here. Whispers or screaming — you can't tell."
    ]),
    # Catacombs — standard dungeon
    RoomTemplate("corridor", "dungeon", [
        "Torch-Lit Corridor", "Narrow Passage", "Dripping Hallway",
        "Dusty Tunnel", "Echo Chamber", "Winding Path"
    ], [
        "Flickering torches cast dancing shadows on damp stone walls.",
        "Barely wide enough for one. The walls press close and the ceiling hangs low.",
        "Water drips from somewhere above. The sound echoes endlessly.",
        "Dust covers everything. Nothing has passed this way in ages.",
        "Your footsteps return to you wrong — doubled, delayed, or not at all.",
        "The path winds without reason. It feels like it goes somewhere important."
    ]),
    RoomTemplate("chamber", "dungeon", [
        "Grand Chamber", "Underground Cavern", "Vaulted Hall",
        "Crystal Grotto", "Collapsed Room", "The Throne Alcove"
    ], [
        "A vast chamber with pillars reaching into darkness above.",
        "A natural cave expanded by tool and will. The stone here is ancient.",
        "Vaulted ceilings show craftsmanship from an age when detail mattered.",
        "Crystals in the walls catch and scatter light into rainbows.",
        "Ceiling partially collapsed. Rubble makes navigation difficult.",
        "A small alcove with a stone seat. Someone ruled from here once."
    ]),
    RoomTemplate("trap_room", "dungeon", [
        "Spike Pit", "Collapsing Floor", "Poison Gas Chamber",
        "The Needle Corridor", "Swinging Blade Room", "Pressure Plate Hall"
    ], [
        "Floor tiles have been pushed aside revealing spikes below.",
        "The floor sounds hollow. Cracks spider across the stone.",
        "A green mist hangs at knee height. Your lungs begin to ache.",
        "Floor to ceiling needles wait in the walls. A tripwire glints in torchlight.",
        "Blades pendulum through the air on chains. Timing is everything.",
        "Floor tiles of different colors. Some are pressure plates. Some are not."
    ]),
    RoomTemplate("treasury", "dungeon", [
        "Dragon's Hoard", "Treasure Vault", "The Glittering Cache",
        "Gemstone Nook", "Gold Pile", "Ancient Wealth"
    ], [
        "Mountains of gold with something ancient sleeping on top.",
        "A strongroom with the door hanging open. Empty now, but the shape of wealth remains.",
        "Sparkles catch your eye from every corner. More than one adventurer died here.",
        "Gems fill a basin like water. They hum faintly with stored magic.",
        "Gold coins cover everything. Some are stamped with symbols you almost recognize.",
        "Weapons, armor, coins, relics — the accumulated wealth of centuries."
    ]),
    RoomTemplate("armory", "dungeon", [
        "Ruined Armory", "Weapon Staging", "The Broken Racks",
        "Armor Gallery", "Smithy's Forge", "Military Stores"
    ], [
        "Weapon racks mostly empty or rusted beyond use. A blade still gleams.",
        "Weapons prepared for a army that never came. Dust covers the order.",
        "Broken racks and scattered weapons. Something tore through here.",
        "Suits of armor stand in rows. Some are empty. Some are not.",
        "A forge cold and dark. Tools still hang where the smith left them.",
        "Crates and barrels, most rotted. Labels faded beyond reading."
    ]),
    RoomTemplate("library", "dungeon", [
        "Forgotten Library", "Archivist's Study", "The Burned Collection",
        "Scriptorium", "Rare Books Room", "Lecture Hall"
    ], [
        "Towering bookshelves, most books crumbled. A few remain.",
        "A scholar's desk, papers scattered. They never finished their work.",
        "Charred pages cover the floor. Someone burned the knowledge on purpose.",
        "Writing desks and copying stations. The ink has long since dried.",
        "Locked cases hold books too dangerous or valuable for common reading.",
        "Stone benches in rows face a podium. Students learned here. Or prayed."
    ]),
    RoomTemplate("shrine", "dungeon", [
        "Ancient Shrine", "Gods' Alcoves", "The Silent Sanctuary",
        "Blood Altar", "Consecrated Ground", "Forbidden Chapel"
    ], [
        "A small temple to gods whose names have been forgotten.",
        " niches hold statues of divine figures. Offerings of bone and stone.",
        "A place of peace deep in a hostile place. The air feels different here.",
        "An altar stained with old blood. The gods being prayed to are not kind ones.",
        "Holy ground. Evil creatures avoid it. Good ones gather here.",
        "A chapel sealed behind rubble. Whatever was said here was better forgotten."
    ]),
    RoomTemplate("prison_dungeon", "dungeon", [
        "Dungeon Cells", "The Pit", "Prisoner's Hovel",
        "Chained Wall", "Forgotten Captives", "The Dark Hole"
    ], [
        "Cells with bars rusted but intact. Screams still echo from somewhere.",
        "A pit dug into rock. Prisoners were simply dropped in.",
        "A hovel built by prisoners themselves. Crude but functional.",
        "Chains set into the wall at regular intervals. Skeletons still hang here.",
        "Survivors who were never meant to leave. They may still be alive.",
        "A hole in the ground with no ladder. You hear movement below."
    ]),
    RoomTemplate("sewer", "dungeon", [
        "Sewer Junction", "Filth Tunnel", "The Stream Below",
        "Waste Channel", "Otyugh's Lair", "Filtration Basin"
    ], [
        "The dungeon's waste flows through here. The smell is overwhelming.",
        "Filth ankle-deep in places. You try not to think about what you're wading through.",
        "A stream carries waste through the dungeon. It leads somewhere.",
        "Channels of controlled filth. Engineering at its most unpleasant.",
        "Something large has made a lair here. You can smell it from ten paces.",
        "Large basins filter the waste. The trapped material makes good alchemical use."
    ]),
    # Wilderness / Surface
    RoomTemplate("forest", "wilderness", [
        "Ancient Forest", "Dark Woods", "Overgrown Path",
        "Tree Cathedral", "Mushroom Grove", "The Weeping Glade"
    ], [
        "Trees older than the dungeon grow here. Their roots are its foundation.",
        "Dark woods where sunlight barely penetrates. Movement in every shadow.",
        "A path grown over by nature. Others have walked here recently.",
        "Trees grow in columns like cathedral pillars. The canopy is the roof.",
        "Mushrooms the size of trees grow here, bioluminescent in the dark.",
        "Water pools in a glade. Trees here grow in the shape of mourners."
    ]),
    RoomTemplate("ruins", "wilderness", [
        "Ancient Ruins", "Collapsed Tower", "Fallen Walls",
        "Buried Temple", "Crumbled Keep", "Overgrown Foundation"
    ], [
        "Crumbling structures that predate the dungeon above them.",
        "A tower that fell in on itself. Upper floors are below debris.",
        "Walls that once defined a courtyard. Vines have claimed them.",
        "A temple buried by time. A dig site shows ancient treasures visible.",
        "A fortress that fell to something stronger than siege.",
        "Building foundations reclaimed by earth. What was built here was large."
    ]),
    RoomTemplate("cave", "wilderness", [
        "Natural Cave", "Underground Lake", "Crystal Cavern",
        "Bat Colony", "Narrow Squeeze", "Underground River"
    ], [
        "Not the dungeon's work — nature's. The stone bears no tool marks.",
        "An underground lake stretches before you, fed by unknown sources.",
        "Crystals grow from every surface, some as tall as you are.",
        "Bats hang from the ceiling in clumps. They stir as you pass.",
        "A gap barely wide enough to crawl through. Beyond, the cave opens.",
        "A river tears through stone here. The sound is deafening."
    ]),
    RoomTemplate("swamp", "wilderness", [
        "Murky Swamp", "Bog Crossing", "Will-o'-Wisp Path",
        "Sunken Ruins", "Reed Maze", "Quicksand Edge"
    ], [
        "Water that was once clear is now the color of old tea.",
        "Logs over water that is deeper than it looks. Some logs are not logs.",
        "Lights dance over the water. They lead somewhere. Or nowhere.",
        "A building that has sunk halfway into the swamp. Windows gape open.",
        "Reeds higher than your head form walls. Getting lost is easy.",
        "Ground that shifts when stepped on. Pull free or sink deeper."
    ]),
    RoomTemplate("encampment", "wilderness", [
        "Abandoned Camp", "Bandit Hideout", "Traveller's Rest",
        "Military Tent", "Merchant's Stop", "Refugee Settlement"
    ], [
        "Cold fire ring, tents long collapsed. They left in a hurry.",
        "A defensible position with clear sight lines. Recent use. Maybe current.",
        "A place for travelers to rest. Some are better prepared than others.",
        "Military canvas, faded but standing. Someone of rank slept here.",
        "Carts overturned, goods scattered. Robbery or collapse? Both.",
        "Makeshift shelters built for survival. Someone lived here. Many someones."
    ]),
    # Town / Safe zones
    RoomTemplate("inn", "town", [
        "Traveler's Inn", "Tavern Common Room", "The Sleeping Hall",
        "Merchant's Rest", "Bunk House", "The Warm Hearth"
    ], [
        "A proper inn with actual beds. The innkeeper sizes you up.",
        "Tables and benches, a fire, and a counter. The heart of any town.",
        "Beds in rows, curtained for privacy. A good night's sleep.",
        "Rooms above, merchants below. This is where deals get made.",
        "Bunks three high. Adventurers crowd the lower bunks. Smells like a lot of adventurers.",
        "A fire that has never gone out. The inn has stood since before the dungeon."
    ]),
    RoomTemplate("shop", "town", [
        "General Store", "Alchemist's Shop", "Blacksmith's Forge",
        "Enchantment Boutique", "Provisioner's Stall", "Curiosity Shop"
    ], [
        "Everything a traveler might need. Mostly. The proprietor is suspicious.",
        "Bubbling liquids and the smell of sulfur. The alchemist works behind glass.",
        "The heat of the forge, the ring of hammer on steel. Armor for sale.",
        "Wands, rings, and scrolls. Everything has a purpose and a price.",
        "Rations, rope, torches, and packs. The mundane tools of survival.",
        "Oddities from everywhere. Some are genuine. Some are not."
    ]),
    RoomTemplate("square", "town", [
        "Town Square", "Market Plaza", "Fountain Courtyard",
        "Crossroads", "Town Gate", "Watch Post"
    ], [
        "The center of town. People gather, trade, and gossip here.",
        "Stalls and carts, haggling voices, the smell of street food.",
        "A fountain at the center. People gather around it.",
        "Four roads meet here. Signposts point in directions that shift.",
        "The town's defensive wall has a gap here. The gate hangs open.",
        "Guards watch from this post. They note your passage."
    ]),
    # Special / Portal areas
    RoomTemplate("portal", "special", [
        "Portal Chamber", "Rift in Reality", "The Between Place",
        "Ancient Gate", "Dimensional Tear", "The Threshold"
    ], [
        "A chamber built around a swirling portal. Where does it lead?",
        "The air itself is torn here. Reality is thin.",
        "Neither inside nor outside. A space between spaces.",
        "A gate of metal and magic. It has not activated in centuries.",
        "A tear in the fabric of existence. Looking through shows somewhere else.",
        "The border between two worlds. You stand on the threshold."
    ]),
    RoomTemplate("elemental", "special", [
        "Fire Chamber", "Ice Cavern", "Lightning Core",
        "Earth Chamber", "Wind Tunnel", "Water Basin"
    ], [
        "The heat is unbearable. Fire burns without fuel here.",
        "Ice formations of impossible beauty. The cold bites through armor.",
        "Sparks and crackling energy. A lightning bolt struck here and never stopped.",
        "Stone that breathes. Walls that shift. The earth is alive here.",
        "Wind that never stops. Erasing footprints. Erasing faces.",
        "Water that falls upward. Or has always fallen upward."
    ]),
    RoomTemplate("boss", "special", [
        "Dragon's Domain", "Demon's Throne", "Lich's Sanctum",
        "Demon Lord's Arena", "Elder Thing's Lair", "The Final Chamber"
    ], [
        "The true owner of the dungeon lives here. Their hoard surrounds them.",
        "A throne of bone and shadow. Something sits on it and waits.",
        "Books and phylacteries. The lich who lived here is not entirely dead.",
        "A vast arena. The demon who controls this place watches from above.",
        "A creature too alien to describe. It was here before the dungeon.",
        "This is the end of the path. What waits here has waited for you specifically."
    ]),
]

ITEM_TEMPLATES = {
    "weapon": [
        ("Rusty Shortsword", "A blade showing its age but still sharp."),
        ("Iron Spear", "Simple and effective. The wood is splintered."),
        ("Hunter's Bow", "A recurve bow. The string is frayed."),
        ("War Hammer", "Heavy and brutal. The head is pitted."),
        ("Silver Dagger", "Gleaming silver. Hums with faint magic."),
        ("Battle Axe", "Double-headed. Someone used this for serious violence."),
    ],
    "consumable": [
        ("Health Potion", "Red liquid. Herbs and honey. Heals wounds."),
        ("Mana Crystal", "Blue crystal. Restores magical energy."),
        ("Antidote Vial", "Yellow liquid. Cures poison."),
        ("Smoke Bomb", "Creates a cloud of obscuring smoke."),
        ("Torch", " pitch-soaked cloth on a stick. Burn time: 1 hour."),
        ("Rations", "Dried meat and hard bread. A day's food."),
    ],
    "treasure": [
        ("Gold Coins", "Stamped with a dragon sigil. Value: 10 gold."),
        ("Silver Ring", "A band of pure silver. Minor enchantment."),
        ("Gemstone", "A cut ruby the size of a thumbnail."),
        ("Ancient Coin", "Currency from a kingdom that no longer exists."),
        ("Jeweled Cup", "A goblet with gems set in the bowl."),
        ("Gold Bangle", "Heavy and ornate. Clearly stolen."),
    ],
    "quest": [
        ("Torn Note", "A fragment of writing. The rest is missing."),
        ("Rusted Key", "An old key. Opens something important."),
        ("Sealed Letter", "A letter with a broken seal. Intended for someone specific."),
        ("Spectral Chain", "Ghostly links. The ghost is not far."),
        ("Mysterious Idol", "A small statue. It seems to watch you."),
        ("Fragment of Bone", "A piece of a skeleton. Which one? Why?"),
    ],
}

NPC_TEMPLATES = {
    "dungeon_hostile": [
        ("Skeleton Warrior", "An undead soldier. Still has orders to follow."),
        ("Goblin Scout", "A small green creature. It has a knife and bad intentions."),
        ("Orc Brute", "A large, ugly, violent creature. It hits hard."),
        ("Zombie Laborer", "Undead that never stopped working. It's unhappy about it."),
        ("Giant Spider", "A spider the size of a horse. Many legs. Many eyes."),
        ("Dark Cultist", "Robed figure. Blood on the robes. On their hands."),
    ],
    "dungeon_neutral": [
        ("Scholar's Spirit", "A ghost that studies you with hollow eyes."),
        ("Wandering Merchant", "A ghost who trades in things the living don't need."),
        ("Cursed Knight", "A knight who cannot leave their post. Forever."),
        ("Prisoner Ghost", "Someone who died here and doesn't know it yet."),
        ("Catacomb Guardian", "An animated skeleton in ceremonial armor."),
        ("Lost Adventurer", "Someone who came before you. They left notes."),
    ],
    "wilderness_hostile": [
        ("Dire Wolf", "A wolf twice normal size. It has killed before."),
        ("Giant Spider", "Venomous. Territorial. Patient."),
        ("Bandit Chief", "Armed and dangerous. The leader of a raiding party."),
        ("Otyugh", "A terrible creature that lives in filth and loves it."),
        ("Harpy", "Woman and bird. Its song is a weapon."),
        ("Ogre", "Massive and not very bright. Very violent."),
    ],
    "wilderness_neutral": [
        ("Hermit Sage", "An old person who has advice if you can stomach them."),
        ("Traveling Merchant", "A trader who goes where the roads go."),
        ("Woodcutter", "A person just trying to do a job. Stay out of their way."),
        ("Hunter", "Tracks prey through these woods. Knows paths you'd miss."),
        ("Refugee", "Has fled something terrible. Desperate. Dangerous."),
        ("Pilgrim", "Walking a sacred path. Praying for your safe passage."),
    ],
    "town_neutral": [
        ("Innkeeper", "A person who has seen everything and judges nothing."),
        ("Shopkeeper", "Prices are firm but the goods are good."),
        ("Town Guard", "Watching for trouble. You're not the worst they've seen."),
        ("Beggar", "Someone who has lost everything. They know secrets."),
        ("Town Elder", "Has ruled this place longer than the dungeon has existed."),
        ("Street Urchin", "A child who knows every corner. Useful. Cheap."),
    ],
    "boss": [
        ("Ancient Dragon", "Massive. Gold. Sleeping on a hoard of meaning."),
        ("Lich King", "Undead and intelligent. Their phylactery is hidden."),
        ("Demon Prince", "A creature from beyond. Not the worst thing beyond."),
        ("Elder Thing", "Something that predates everything. It was here first."),
        ("The Dungeon Heart", "Not a creature. The dungeon itself. It is awake."),
    ],
}

ZONE_CONFIGS = {
    "surface_entrance": {
        "theme": "wilderness",
        "room_count": 15,
        "connections": ["wilderness", "town"],
        "hostility": 0.1,
    },
    "surface_wilderness": {
        "theme": "wilderness",
        "room_count": 40,
        "connections": ["wilderness", "ruins"],
        "hostility": 0.3,
    },
    "town_center": {
        "theme": "town",
        "room_count": 20,
        "connections": ["town", "wilderness"],
        "hostility": 0.0,
        "safe": True,
    },
    "dungeon_upper": {
        "theme": "dungeon",
        "room_count": 60,
        "connections": ["dungeon", "catacomb"],
        "hostility": 0.4,
    },
    "dungeon_lower": {
        "theme": "dungeon",
        "room_count": 80,
        "connections": ["dungeon", "catacomb", "special"],
        "hostility": 0.6,
    },
    "catacomb_upper": {
        "theme": "catacomb",
        "room_count": 40,
        "connections": ["catacomb", "dungeon"],
        "hostility": 0.5,
    },
    "catacomb_deep": {
        "theme": "catacomb",
        "room_count": 40,
        "connections": ["catacomb", "dungeon_lower", "special"],
        "hostility": 0.7,
    },
    "special_portal": {
        "theme": "special",
        "room_count": 15,
        "connections": ["special"],
        "hostility": 0.5,
    },
    "special_elemental": {
        "theme": "special",
        "room_count": 10,
        "connections": ["special", "dungeon_lower"],
        "hostility": 0.8,
    },
    "boss_final": {
        "theme": "special",
        "room_count": 5,
        "connections": [],
        "hostility": 1.0,
        "boss": True,
    },
}


# ============================================================
# WORLD GENERATOR
# ============================================================
class DungeonGenerator:
    """Generates large interconnected dungeon worlds."""

    def __init__(self, seed: Optional[int] = None):
        if seed:
            random.seed(seed)
        self.rooms: dict[str, Room] = {}
        self.items: dict[str, Item] = {}
        self.npcs: dict[str, NPC] = {}
        self.room_counter = 0
        self.item_counter = 0
        self.npc_counter = 0

    def _generate_room_id(self, prefix: str = "room") -> str:
        return f"{prefix}_{uuid.uuid4().hex[:8]}"

    def _pick_template(self, theme: str) -> RoomTemplate:
        """Pick a random room template matching the theme."""
        matching = [t for t in DUNGEON_TEMPLATES if t.theme == theme]
        if not matching:
            matching = DUNGEON_TEMPLATES
        return random.choice(matching)

    def _generate_exits(self, template: RoomTemplate, existing_rooms: list[Room]) -> dict[str, str]:
        """Generate exits from a room, connecting to existing rooms where possible."""
        exits = {}
        possible = template.exits_possible.copy()
        random.shuffle(possible)

        # Try to connect to nearby existing rooms first
        for direction in possible[: random.randint(1, 3)]:
            # Connect to existing room in same zone
            nearby = [r for r in existing_rooms[-20:] if direction not in r.exits]
            if nearby and random.random() < 0.7:
                target = random.choice(nearby)
                exits[direction] = target.id
                # Add return exit
                opposites = {"north": "south", "south": "north", "east": "west", "west": "east", "up": "down", "down": "up"}
                if opposites.get(direction):
                    target.exits[opposites[direction]] = "pending"
            else:
                # Will be filled in later pass
                exits[direction] = "pending"

        return exits

    def generate_zone(self, zone_name: str, config: dict, start_x: int = 0, start_y: int = 0) -> list[Room]:
        """Generate a zone of interconnected rooms."""
        rooms = []
        theme = config["theme"]
        room_count = config["room_count"]
        connections = config.get("connections", [])
        hostility = config.get("hostility", 0.5)
        is_boss = config.get("boss", False)
        safe = config.get("safe", False)

        # Generate rooms
        for i in range(room_count):
            template = self._pick_template(theme)
            name = random.choice(template.names)
            desc = random.choice(template.descriptions)

            x = start_x + random.randint(-50, 50)
            y = start_y + random.randint(-50, 50)
            z = start_y  # z = depth level

            room = Room(
                id=self._generate_room_id(),
                name=name,
                description=desc,
                position=Position(x, y, z),
                exits={},
                items=[],
                npcs=[],
            )

            # Generate exits
            room.exits = self._generate_exits(template, rooms)

            rooms.append(room)

        # Second pass: fill pending exits
        pending_rooms = [r for r in rooms if "pending" in r.exits.values()]
        for room in pending_rooms:
            for direction, target_id in list(room.exits.items()):
                if target_id == "pending":
                    # Find another room without this exit
                    targets = [r for r in rooms if r != room and direction not in r.exits]
                    if targets:
                        target = random.choice(targets)
                        room.exits[direction] = target.id
                        opposites = {"north": "south", "south": "north", "east": "west", "west": "east", "up": "down", "down": "up"}
                        target.exits[opposites[direction]] = room.id
                    else:
                        del room.exits[direction]

        # Add items
        for room in rooms:
            if random.random() < 0.35:
                self._add_item_to_room(room)

        # Add NPCs
        if not safe:
            for room in rooms:
                if random.random() < hostility * 0.4:
                    self._add_npc_to_room(room, theme, hostility)

        # Add boss if boss zone
        if is_boss and rooms:
            boss_room = random.choice(rooms[-5:])
            npc = self._spawn_npc("boss", "The Dungeon Heart", "The dungeon breathes. It sees you. It has been waiting.", boss_room.id)
            boss_room.npcs.append(npc.id)

        return rooms

    def _add_item_to_room(self, room: Room):
        """Add a random item to a room."""
        category = random.choice(list(ITEM_TEMPLATES.keys()))
        item_list = ITEM_TEMPLATES[category]
        name, desc = random.choice(item_list)
        item = Item(
            id=self._generate_room_id("item"),
            name=name,
            description=desc,
            location=room.id,
            item_type=category,
            properties={"value": random.randint(1, 100)},
        )
        self.items[item.id] = item
        room.items.append(item.id)

    def _add_npc_to_room(self, room: Room, theme: str, hostility: float):
        """Add a random NPC to a room."""
        if theme == "wilderness":
            pool = "wilderness_hostile" if random.random() < hostility else "wilderness_neutral"
        elif theme == "dungeon":
            pool = "dungeon_hostile" if random.random() < hostility else "dungeon_neutral"
        elif theme == "town":
            pool = "town_neutral"
        else:
            pool = "dungeon_neutral"

        npcs = NPC_TEMPLATES.get(pool, NPC_TEMPLATES["dungeon_neutral"])
        name, desc = random.choice(npcs)
        npc = self._spawn_npc(pool, name, desc, room.id)
        room.npcs.append(npc.id)

    def _spawn_npc(self, npc_type: str, name: str, desc: str, room_id: str) -> NPC:
        """Create and register an NPC."""
        personality_map = {
            "dungeon_hostile": {"traits": ["hostile", "aggressive"], "goals": "Kill intruders", "mood": "violent"},
            "dungeon_neutral": {"traits": ["neutral", "cautious"], "goals": "Survive", "mood": "wary"},
            "wilderness_hostile": {"traits": ["territorial", "predator"], "goals": "Defend territory", "mood": "aggressive"},
            "wilderness_neutral": {"traits": ["peaceful", "aloof"], "goals": "Mind their own business", "mood": "indifferent"},
            "town_neutral": {"traits": ["civilized", "helpful"], "goals": "Run their business", "mood": "pleasant"},
            "boss": {"traits": ["ancient", "powerful", "intelligent"], "goals": "Guard their domain", "mood": "terrible"},
        }
        npc = NPC(
            id=self._generate_room_id("npc"),
            name=name,
            description=desc,
            room_id=room_id,
            personality=personality_map.get(npc_type, {}),
            ai_model="phi3",
        )
        self.npcs[npc.id] = npc
        return npc

    def generate_world(self, target_rooms: int = 300) -> tuple[list[Room], list[Item], list[NPC]]:
        """Generate a complete world targeting a certain number of rooms."""
        print(f"🎲 Generating world targeting {target_rooms} rooms...")

        all_rooms = []
        depth = 0

        # Surface / entrance zone
        zone = ZONE_CONFIGS["surface_entrance"]
        rooms = self.generate_zone("surface_entrance", zone, start_y=0)
        all_rooms.extend(rooms)
        print(f"  Surface entrance: {len(rooms)} rooms")

        # Wilderness
        zone = ZONE_CONFIGS["surface_wilderness"]
        rooms = self.generate_zone("surface_wilderness", zone, start_y=1)
        all_rooms.extend(rooms)
        print(f"  Wilderness: {len(rooms)} rooms")

        # Town center
        zone = ZONE_CONFIGS["town_center"]
        rooms = self.generate_zone("town_center", zone, start_y=1)
        all_rooms.extend(rooms)
        print(f"  Town center: {len(rooms)} rooms")

        # Upper dungeon
        zone = ZONE_CONFIGS["dungeon_upper"]
        rooms = self.generate_zone("dungeon_upper", zone, start_y=2)
        all_rooms.extend(rooms)
        print(f"  Upper dungeon: {len(rooms)} rooms")

        # Lower dungeon
        zone = ZONE_CONFIGS["dungeon_lower"]
        rooms = self.generate_zone("dungeon_lower", zone, start_y=3)
        all_rooms.extend(rooms)
        print(f"  Lower dungeon: {len(rooms)} rooms")

        # Upper catacombs
        zone = ZONE_CONFIGS["catacomb_upper"]
        rooms = self.generate_zone("catacomb_upper", zone, start_y=3)
        all_rooms.extend(rooms)
        print(f"  Upper catacombs: {len(rooms)} rooms")

        # Deep catacombs
        zone = ZONE_CONFIGS["catacomb_deep"]
        rooms = self.generate_zone("catacomb_deep", zone, start_y=4)
        all_rooms.extend(rooms)
        print(f"  Deep catacombs: {len(rooms)} rooms")

        # Special zones
        zone = ZONE_CONFIGS["special_portal"]
        rooms = self.generate_zone("special_portal", zone, start_y=5)
        all_rooms.extend(rooms)
        print(f"  Portal chambers: {len(rooms)} rooms")

        zone = ZONE_CONFIGS["special_elemental"]
        rooms = self.generate_zone("special_elemental", zone, start_y=5)
        all_rooms.extend(rooms)
        print(f"  Elemental chambers: {len(rooms)} rooms")

        # Boss zone
        zone = ZONE_CONFIGS["boss_final"]
        rooms = self.generate_zone("boss_final", zone, start_y=6)
        all_rooms.extend(rooms)
        print(f"  Boss chambers: {len(rooms)} rooms")

        print(f"\n✅ Generated {len(all_rooms)} rooms, {len(self.items)} items, {len(self.npcs)} NPCs")
        return all_rooms, list(self.items.values()), list(self.npcs.values())


def generate_large_world(seed: int = 42, target: int = 300) -> tuple[list[Room], list[Item], list[NPC]]:
    """Quick generator call."""
    gen = DungeonGenerator(seed=seed)
    return gen.generate_world(target_rooms=target)
