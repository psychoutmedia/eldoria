const net = require('net');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const npcRegistry = require('./npcs/registry');
const npcOllama = require('./llm/ollama');
const questManager = require('./world/quests');

const PORT = parseInt(process.env.MUD_PORT, 10) || 8888;
const START_ROOM = 'room_001';
const WANDER_INTERVAL = 45000; // 45 seconds
const WANDER_CHANCE = 0.5; // 50% chance to move
const MONSTER_RESPAWN_TIME = 120000; // 2 minutes
const FLEE_SUCCESS_CHANCE = 0.6; // 60% chance to flee
const AUTO_SAVE_INTERVAL = 120000; // 2 minutes
const PLAYERS_DIR = path.join(__dirname, 'players');

// ============================================
// PASSWORD AUTHENTICATION CONSTANTS
// ============================================
const BCRYPT_SALT_ROUNDS = 10;
const ACCOUNTS_PATH = path.join(__dirname, 'accounts.json');
const MAX_LOGIN_ATTEMPTS = 3;
const ACCOUNT_LOCKOUT_DURATION = 300000; // 5 minutes
const MIN_PASSWORD_LENGTH = 6;
const MIN_ADMIN_PASSWORD_LENGTH = 10;
const RESERVED_NAMES = ['admin', 'system', 'server', 'god', 'wizard', 'moderator', 'mod', 'gm', 'gamemaster'];

// Telnet commands for echo suppression
const IAC = 255;   // Interpret As Command
const WILL = 251;  // Will perform option
const ECHO = 1;    // Echo option

// Suppress client echo on connection - server handles all echoing
function suppressClientEcho(socket) {
  // Send IAC WILL ECHO - tells client "I will handle echoing, turn off your local echo"
  socket.write(Buffer.from([IAC, WILL, ECHO]));
}

// Helper function: Enable password input mode (no server echo)
function enablePasswordMode(socket, player) {
  if (player.authState) {
    player.authState.isPasswordInput = true;
  }
}

// Helper function: Disable password input mode (server echo enabled)
function disablePasswordMode(socket, player) {
  if (player.authState) {
    player.authState.isPasswordInput = false;
  }
}

// ============================================
// PHASE 1.5: COMPETITIVE GAMEPLAY CONSTANTS
// ============================================

// World Reset Cycle
const CYCLE_DURATION = 3600000;  // 1 hour in ms
const CYCLE_WARNING_TIMES = [600000, 300000, 60000]; // 10min, 5min, 1min warnings

// Healing Chapel System
const CHAPEL_ROOMS = ['room_001', 'room_020', 'room_050', 'room_062', 'room_090'];
const CHAPEL_COOLDOWN = 300000; // 5 minutes

// Wandering Healer NPC
const HEALER_WANDER_INTERVAL = 120000; // 2 minutes
const HEALER_HEAL_COST = 50; // Gold cost for healing
const HEALER_FREE_THRESHOLD = 0.25; // Free healing if HP below 25%

// Aggressive Monster System
const AGGRO_GRACE_PERIOD = 3000; // 3 seconds

// NPC hostility ejection: at or below this score, the NPC banishes the player from their room
const NPC_HOSTILE_EJECT_THRESHOLD = -75;
const NPC_EJECT_DESTINATION = 'room_001'; // The Awakening Chamber (safe chapel)

// PVP Combat System
const PVP_TOGGLE_COOLDOWN = 300000; // 5 minutes to turn off
const PVP_ATTACK_COOLDOWN = 300000; // 5 minutes between attacks on same player
const PVP_LEVEL_DIFF_LIMIT = 5;     // Can't attack 5+ levels below
const PVP_ROUND_INTERVAL = 2000;    // 2 seconds per combat round
const PVP_COUNTER_DELAY = 1000;     // 1 second delay before counter-attack
const PVP_AFK_TIMEOUT = 30000;      // 30 seconds AFK = auto-surrender

// Monster Combat System (automatic real-time combat)
const MONSTER_COMBAT_ROUND_INTERVAL = 3000; // 3 seconds per full round
const MONSTER_COUNTER_DELAY = 1500;         // 1.5 seconds before monster counter-attack
const MONSTER_LOOT_CHANCE = 0.6;            // 60% drop chance for regular monsters

// Varied Combat Messages
const COMBAT_MESSAGES = {
  // Critical hits (80%+ of max damage)
  critical: [
    "land a devastating strike on",
    "find a weak point in",
    "deliver a masterful blow to",
    "strike with deadly precision at"
  ],
  // Slashing attacks
  slash: [
    "expertly slash at",
    "swing your blade at",
    "cut deeply into",
    "slice through"
  ],
  // Piercing attacks
  pierce: [
    "thrust your weapon at",
    "lunge forward and pierce",
    "stab viciously at",
    "drive your weapon into"
  ],
  // Crushing attacks
  crush: [
    "smash your weapon into",
    "deliver a crushing blow to",
    "hammer down upon",
    "bash forcefully at"
  ],
  // Weak hits (30% or less of max damage)
  weak: [
    "graze",
    "barely scratch",
    "glance off",
    "weakly hit"
  ]
};

// Monster attack messages
const MONSTER_ATTACK_MESSAGES = [
  "slashes at",
  "claws at",
  "bites into",
  "strikes at",
  "lunges at",
  "attacks"
];

// Get varied combat message based on damage dealt
function getRandomCombatMessage(damageDealt, maxPossibleDamage) {
  const damagePercent = damageDealt / maxPossibleDamage;

  let messageCategory;
  if (damagePercent >= 0.8) {
    messageCategory = 'critical';
  } else if (damagePercent <= 0.3) {
    messageCategory = 'weak';
  } else {
    const categories = ['slash', 'pierce', 'crush'];
    messageCategory = categories[Math.floor(Math.random() * categories.length)];
  }

  const messages = COMBAT_MESSAGES[messageCategory];
  return messages[Math.floor(Math.random() * messages.length)];
}

// Get random monster attack message
function getRandomMonsterAttackMessage() {
  return MONSTER_ATTACK_MESSAGES[Math.floor(Math.random() * MONSTER_ATTACK_MESSAGES.length)];
}

// ============================================
// SPELL DATABASE - 6 SCHOOLS OF MAGIC
// ============================================
const SPELLS = {
  // MALEFIC SCHOOL - Offensive damage spells
  'magic_missile': {
    name: 'Magic Missile',
    school: 'Malefic',
    description: 'Fires a bolt of arcane energy at your target.',
    manaCost: 5,
    cooldown: 0,
    levelRequired: 1,
    type: 'damage',
    effect: { minDamage: 8, maxDamage: 15 },
    castMessage: 'You launch a glowing missile of arcane energy!',
    hitMessage: 'The magic missile strikes $target for $damage damage!'
  },
  'fireball': {
    name: 'Fireball',
    school: 'Malefic',
    description: 'Hurls a ball of fire that explodes on impact.',
    manaCost: 15,
    cooldown: 10,
    levelRequired: 3,
    type: 'damage',
    effect: { minDamage: 20, maxDamage: 35 },
    castMessage: 'You conjure a roaring ball of flame!',
    hitMessage: 'The fireball explodes against $target for $damage fire damage!'
  },
  'lightning_bolt': {
    name: 'Lightning Bolt',
    school: 'Malefic',
    description: 'Calls down a bolt of lightning from the heavens.',
    manaCost: 20,
    cooldown: 15,
    levelRequired: 5,
    type: 'damage',
    effect: { minDamage: 30, maxDamage: 50 },
    castMessage: 'You raise your hand and call forth the storm!',
    hitMessage: 'A devastating lightning bolt strikes $target for $damage damage!'
  },
  'ice_storm': {
    name: 'Ice Storm',
    school: 'Malefic',
    description: 'Summons a blizzard of razor-sharp ice shards.',
    manaCost: 30,
    cooldown: 20,
    levelRequired: 7,
    type: 'damage',
    effect: { minDamage: 40, maxDamage: 65 },
    castMessage: 'You summon a freezing tempest of ice!',
    hitMessage: 'The ice storm tears through $target for $damage frost damage!'
  },
  'disintegrate': {
    name: 'Disintegrate',
    school: 'Malefic',
    description: 'A ray of pure destructive energy that unmakes matter.',
    manaCost: 50,
    cooldown: 30,
    levelRequired: 10,
    type: 'damage',
    effect: { minDamage: 60, maxDamage: 100 },
    castMessage: 'You channel devastating arcane power!',
    hitMessage: 'A green ray of disintegration obliterates $target for $damage damage!'
  },
  'meteor_swarm': {
    name: 'Meteor Swarm',
    school: 'Malefic',
    description: 'Calls down meteors from the void to devastate your foe.',
    manaCost: 80,
    cooldown: 60,
    levelRequired: 13,
    type: 'damage',
    effect: { minDamage: 90, maxDamage: 150 },
    castMessage: 'You tear open the sky and call forth destruction!',
    hitMessage: 'Blazing meteors rain down upon $target for $damage catastrophic damage!'
  },

  // THEFT SCHOOL - Drain and steal effects
  'drain_life': {
    name: 'Drain Life',
    school: 'Theft',
    description: 'Drains the life force from your enemy to heal yourself.',
    manaCost: 12,
    cooldown: 15,
    levelRequired: 2,
    type: 'drain',
    effect: { minDamage: 10, maxDamage: 20, healPercent: 50 },
    castMessage: 'Dark tendrils of energy reach toward your foe!',
    hitMessage: 'You drain $damage life from $target, healing yourself for $heal HP!'
  },
  'mana_drain': {
    name: 'Mana Drain',
    school: 'Theft',
    description: 'Siphons magical energy from your target (PvP only).',
    manaCost: 8,
    cooldown: 20,
    levelRequired: 4,
    type: 'mana_drain',
    effect: { minDrain: 15, maxDrain: 30 },
    castMessage: 'You reach out to steal your opponent\'s magical essence!',
    hitMessage: 'You drain $amount mana from $target!'
  },
  'steal_strength': {
    name: 'Steal Strength',
    school: 'Theft',
    description: 'Temporarily weakens your foe while empowering yourself.',
    manaCost: 20,
    cooldown: 45,
    levelRequired: 6,
    type: 'debuff',
    effect: { duration: 30, damageReduction: 20, damageBoost: 20 },
    castMessage: 'You invoke ancient rites of power theft!',
    hitMessage: '$target\'s strength flows into you! (+20% damage, enemy -20% damage for 30s)'
  },
  'soul_siphon': {
    name: 'Soul Siphon',
    school: 'Theft',
    description: 'A powerful drain that steals both health and mana.',
    manaCost: 35,
    cooldown: 60,
    levelRequired: 9,
    type: 'drain',
    effect: { minDamage: 25, maxDamage: 40, healPercent: 75, manaReturn: 15 },
    castMessage: 'You begin the forbidden soul siphon ritual!',
    hitMessage: 'You rip $damage life from $target\'s soul, restoring $heal HP and $mana mana!'
  },

  // DIVINATION SCHOOL - Information and detection
  'detect_invisible': {
    name: 'Detect Invisible',
    school: 'Divination',
    description: 'Allows you to see invisible creatures and players.',
    manaCost: 10,
    cooldown: 0,
    levelRequired: 2,
    type: 'buff',
    effect: { duration: 120, seeInvisible: true },
    castMessage: 'Your eyes shimmer with arcane sight!',
    hitMessage: 'You can now see the invisible for 2 minutes.'
  },
  'reveal_weakness': {
    name: 'Reveal Weakness',
    school: 'Divination',
    description: 'Reveals detailed information about a monster or player.',
    manaCost: 8,
    cooldown: 5,
    levelRequired: 3,
    type: 'info',
    effect: {},
    castMessage: 'You probe your target with divining magic!',
    hitMessage: 'The secrets of $target are revealed to you!'
  },
  'foresight': {
    name: 'Foresight',
    school: 'Divination',
    description: 'Grants brief glimpses of the future, improving dodge chance.',
    manaCost: 25,
    cooldown: 60,
    levelRequired: 6,
    type: 'buff',
    effect: { duration: 45, dodgeChance: 25 },
    castMessage: 'You peer into the threads of fate!',
    hitMessage: 'You gain 25% dodge chance for 45 seconds!'
  },
  'true_sight': {
    name: 'True Sight',
    school: 'Divination',
    description: 'See all hidden things and gain combat awareness.',
    manaCost: 40,
    cooldown: 90,
    levelRequired: 8,
    type: 'buff',
    effect: { duration: 60, seeInvisible: true, critBonus: 15 },
    castMessage: 'Your vision pierces all illusions!',
    hitMessage: 'True sight granted! See invisible and +15% crit chance for 60s.'
  },

  // COMBAT SCHOOL - Physical enhancement spells
  'battle_cry': {
    name: 'Battle Cry',
    school: 'Combat',
    description: 'A mighty shout that boosts your damage.',
    manaCost: 10,
    cooldown: 30,
    levelRequired: 1,
    type: 'buff',
    effect: { duration: 20, damageBoost: 25 },
    castMessage: 'You let loose a thundering battle cry!',
    hitMessage: 'Your attacks deal 25% more damage for 20 seconds!'
  },
  'berserker_rage': {
    name: 'Berserker Rage',
    school: 'Combat',
    description: 'Enter a berserk state: more damage, but take more damage.',
    manaCost: 15,
    cooldown: 45,
    levelRequired: 4,
    type: 'buff',
    effect: { duration: 30, damageBoost: 50, damageTaken: 25 },
    castMessage: 'Your eyes glow red with berserker fury!',
    hitMessage: 'Berserker Rage! +50% damage dealt, but +25% damage taken for 30s!'
  },
  'blade_storm': {
    name: 'Blade Storm',
    school: 'Combat',
    description: 'A whirlwind attack that hits multiple times.',
    manaCost: 25,
    cooldown: 20,
    levelRequired: 6,
    type: 'multi_attack',
    effect: { hits: 3, damagePercent: 50 },
    castMessage: 'You spin in a deadly blade storm!',
    hitMessage: 'Your blade storm hits $target $hits times for $damage total damage!'
  },
  'executioner': {
    name: 'Executioner',
    school: 'Combat',
    description: 'A devastating strike that deals bonus damage to wounded foes.',
    manaCost: 30,
    cooldown: 25,
    levelRequired: 8,
    type: 'execute',
    effect: { baseDamage: 30, bonusDamagePercent: 100 },
    castMessage: 'You prepare a killing blow!',
    hitMessage: 'Your executioner strike deals $damage damage to $target!'
  },
  'avatar_of_war': {
    name: 'Avatar of War',
    school: 'Combat',
    description: 'Transform into a combat avatar with massive bonuses.',
    manaCost: 60,
    cooldown: 120,
    levelRequired: 12,
    type: 'buff',
    effect: { duration: 45, damageBoost: 75, armor: 30 },
    castMessage: 'You invoke the spirit of war itself!',
    hitMessage: 'You become an Avatar of War! +75% damage, +30 armor for 45s!'
  },

  // PROTECTION SCHOOL - Defensive spells
  'minor_ward': {
    name: 'Minor Ward',
    school: 'Protection',
    description: 'Creates a small protective barrier.',
    manaCost: 8,
    cooldown: 15,
    levelRequired: 1,
    type: 'shield',
    effect: { shieldAmount: 20 },
    castMessage: 'You weave a protective ward around yourself!',
    hitMessage: 'A magical shield absorbs the next 20 damage.'
  },
  'stone_skin': {
    name: 'Stone Skin',
    school: 'Protection',
    description: 'Your skin becomes hard as stone, reducing damage.',
    manaCost: 20,
    cooldown: 45,
    levelRequired: 4,
    type: 'buff',
    effect: { duration: 60, damageReduction: 25 },
    castMessage: 'Your skin hardens to stone!',
    hitMessage: 'Stone Skin active! 25% damage reduction for 60 seconds.'
  },
  'arcane_barrier': {
    name: 'Arcane Barrier',
    school: 'Protection',
    description: 'Creates a powerful magical barrier.',
    manaCost: 35,
    cooldown: 60,
    levelRequired: 7,
    type: 'shield',
    effect: { shieldAmount: 60 },
    castMessage: 'You conjure a shimmering arcane barrier!',
    hitMessage: 'An arcane barrier absorbs the next 60 damage!'
  },
  'reflect_magic': {
    name: 'Reflect Magic',
    school: 'Protection',
    description: 'Reflects a portion of spell damage back to the caster.',
    manaCost: 30,
    cooldown: 90,
    levelRequired: 9,
    type: 'buff',
    effect: { duration: 30, reflectPercent: 50 },
    castMessage: 'You create a mirror of magical energy!',
    hitMessage: 'Reflect Magic active! 50% spell damage reflected for 30s.'
  },
  'divine_protection': {
    name: 'Divine Protection',
    school: 'Protection',
    description: 'Calls upon divine power for ultimate protection.',
    manaCost: 50,
    cooldown: 180,
    levelRequired: 11,
    type: 'buff',
    effect: { duration: 15, invulnerable: true },
    castMessage: 'You call upon the gods for protection!',
    hitMessage: 'Divine Protection! You are INVULNERABLE for 15 seconds!'
  },

  // UTILITY SCHOOL - Healing, teleport, and other
  'minor_heal': {
    name: 'Minor Heal',
    school: 'Utility',
    description: 'Heals a small amount of health.',
    manaCost: 10,
    cooldown: 10,
    levelRequired: 1,
    type: 'heal',
    effect: { minHeal: 15, maxHeal: 25 },
    castMessage: 'Healing light surrounds you!',
    hitMessage: 'You are healed for $heal HP!'
  },
  'cure_wounds': {
    name: 'Cure Wounds',
    school: 'Utility',
    description: 'Heals a moderate amount of health.',
    manaCost: 25,
    cooldown: 20,
    levelRequired: 5,
    type: 'heal',
    effect: { minHeal: 40, maxHeal: 60 },
    castMessage: 'Divine energy flows through you!',
    hitMessage: 'Your wounds close and heal for $heal HP!'
  },
  'restoration': {
    name: 'Restoration',
    school: 'Utility',
    description: 'Powerful healing that restores a large amount of HP.',
    manaCost: 45,
    cooldown: 45,
    levelRequired: 9,
    type: 'heal',
    effect: { minHeal: 80, maxHeal: 120 },
    castMessage: 'You channel the power of restoration!',
    hitMessage: 'Powerful healing magic restores $heal HP!'
  },
  'recall': {
    name: 'Recall',
    school: 'Utility',
    description: 'Teleports you back to the starting chamber.',
    manaCost: 20,
    cooldown: 60,
    levelRequired: 3,
    type: 'teleport',
    effect: { destination: 'room_001' },
    castMessage: 'You invoke the words of recall!',
    hitMessage: 'You are teleported back to the Starting Chamber!'
  },
  'summon_player': {
    name: 'Summon Player',
    school: 'Utility',
    description: 'Attempts to summon another player to your location.',
    manaCost: 40,
    cooldown: 120,
    levelRequired: 8,
    type: 'summon',
    effect: {},
    castMessage: 'You begin the summoning ritual!',
    hitMessage: 'A summon request has been sent to $target!'
  },
  'sanctuary': {
    name: 'Sanctuary',
    school: 'Utility',
    description: 'Teleports you to the nearest chapel.',
    manaCost: 35,
    cooldown: 90,
    levelRequired: 6,
    type: 'teleport',
    effect: { destination: 'nearest_chapel' },
    castMessage: 'You pray for sanctuary!',
    hitMessage: 'Holy light surrounds you as you are transported to safety!'
  },

  // CODER SCHOOL - Admin-tier spells unlocked at L16+
  'read_code': {
    name: 'Read Code',
    school: 'Divination',
    description: 'Read the raw source of the room - reveals monster HP and hidden flags.',
    manaCost: 20,
    cooldown: 10,
    levelRequired: 16,
    type: 'info',
    effect: {},
    castMessage: 'You squint at the world and the green text bleeds through!',
    hitMessage: 'The source of $target is laid bare before you!'
  },
  'patch': {
    name: 'Patch',
    school: 'Utility',
    description: 'Patch the leaks in your own frame. Heals a large amount of HP.',
    manaCost: 35,
    cooldown: 30,
    levelRequired: 18,
    type: 'heal',
    effect: { minHeal: 140, maxHeal: 200 },
    castMessage: 'You run a quick hotfix on your own body!',
    hitMessage: 'Your leaks are plastered over for $heal HP!'
  },
  'resonance_strike': {
    name: 'Resonance Strike',
    school: 'Combat',
    description: 'Attune your strike to the Shattered Symphony - massive damage boost on next hits.',
    manaCost: 50,
    cooldown: 60,
    levelRequired: 20,
    type: 'buff',
    effect: { duration: 30, damageBoost: 60 },
    castMessage: 'You hum a fragment of the Shattered Symphony!',
    hitMessage: 'Resonance Strike! +60% damage for 30 seconds.'
  },
  'shape_variable': {
    name: 'Shape Variable',
    school: 'Combat',
    description: 'Re-assign your own stats mid-fight. Temporary damage increase.',
    manaCost: 60,
    cooldown: 45,
    levelRequired: 21,
    type: 'buff',
    effect: { duration: 20, damageBoost: 35 },
    castMessage: 'You rewrite one of your own variables on the fly!',
    hitMessage: 'Shape Variable! +35% damage for 20 seconds.'
  },
  'paradox_step': {
    name: 'Paradox Step',
    school: 'Utility',
    description: 'Step into a contradiction and reappear at the Starting Chamber.',
    manaCost: 40,
    cooldown: 300,
    levelRequired: 23,
    type: 'teleport',
    effect: { destination: 'room_001' },
    castMessage: 'You step sideways into a paradox!',
    hitMessage: 'Reality folds and you arrive at the Starting Chamber.'
  },
  'null_speak': {
    name: 'Null Speak',
    school: 'Divination',
    description: 'Reach past physical distance and probe the null state of a target.',
    manaCost: 30,
    cooldown: 15,
    levelRequired: 24,
    type: 'info',
    effect: {},
    castMessage: 'You speak into the null and the null speaks back!',
    hitMessage: 'The hidden truth of $target bleeds into your mind!'
  },
  'summon_asset': {
    name: 'Summon Asset',
    school: 'Utility',
    description: 'Draft a tamed T-Pose NPC from the Graveyard to your side.',
    manaCost: 80,
    cooldown: 180,
    levelRequired: 27,
    type: 'summon',
    effect: {},
    castMessage: 'You reach into the Asset Graveyard and pull a model free!',
    hitMessage: 'A T-Pose NPC materializes at your side to aid you!'
  }
};

// Helper to get all spells for a school
function getSpellsBySchool(school) {
  return Object.entries(SPELLS)
    .filter(([key, spell]) => spell.school === school)
    .map(([key, spell]) => ({ key, ...spell }));
}

// Helper to get all spells available to a player based on level
function getAvailableSpells(player) {
  return Object.entries(SPELLS)
    .filter(([key, spell]) => player.level >= spell.levelRequired)
    .map(([key, spell]) => ({ key, ...spell }));
}

// Spell types that cause harm. Blocked by chapel [SAFE] rooms.
const OFFENSIVE_SPELL_TYPES = new Set([
  'damage',
  'drain',
  'mana_drain',
  'multi_attack',
  'execute',
  'debuff'
]);

function isOffensiveSpell(spell) {
  return spell && OFFENSIVE_SPELL_TYPES.has(spell.type);
}

// Write a "target not found" message for cast commands. If the typed name
// matches an online player in another room, call it out so the caster knows
// they need to move, not retype. Otherwise fall back to the generic message.
function writeCastTargetNotFound(socket, player, targetName) {
  if (targetName) {
    const onlineMatch = findPlayerByName(targetName);
    if (onlineMatch && onlineMatch.player !== player && onlineMatch.player.currentRoom !== player.currentRoom) {
      const roomName = rooms[onlineMatch.player.currentRoom]
        ? rooms[onlineMatch.player.currentRoom].name
        : 'another part of the realms';
      socket.write(colorize(
        `${getDisplayName(onlineMatch.player)} is not in this room (last seen in ${roomName}). You must be in the same room to cast on a player.\r\n`,
        'yellow'
      ));
      return;
    }
  }
  socket.write(colorize("You don't see that target here.\r\n", 'yellow'));
}

// Load rooms from JSON file
const roomsPath = path.join(__dirname, 'rooms.json');
const rooms = JSON.parse(fs.readFileSync(roomsPath, 'utf8'));

// Load monster data from JSON file
const monstersPath = path.join(__dirname, 'monsters.json');
const monsterData = JSON.parse(fs.readFileSync(monstersPath, 'utf8'));

// Load item data from JSON file
const itemsPath = path.join(__dirname, 'items.json');
const itemData = JSON.parse(fs.readFileSync(itemsPath, 'utf8'));

// Load admin data from JSON file
const adminsPath = path.join(__dirname, 'admins.json');
let adminData = { admins: [] };
try {
  if (fs.existsSync(adminsPath)) {
    adminData = JSON.parse(fs.readFileSync(adminsPath, 'utf8'));
    console.log(`Loaded ${adminData.admins.length} admin(s)`);
  }
} catch (err) {
  console.log('No admins.json found, admin commands disabled');
}

// Load ban data from JSON file
const bansPath = path.join(__dirname, 'bans.json');
let banData = { banned: [] };
try {
  if (fs.existsSync(bansPath)) {
    banData = JSON.parse(fs.readFileSync(bansPath, 'utf8'));
    console.log(`Loaded ${banData.banned.length} banned player(s)`);
  }
} catch (err) {
  console.log('No bans.json found, ban system disabled');
}

// Admin command log file
const adminLogPath = path.join(__dirname, 'admin_log.txt');

// Log admin command to file
function logAdminCommand(adminName, command) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logEntry = `[${timestamp}] ${adminName}: ${command}\n`;
  try {
    fs.appendFileSync(adminLogPath, logEntry);
  } catch (err) {
    console.log('Error writing to admin log:', err.message);
  }
}

// Save admin data to file
function saveAdminData() {
  try {
    fs.writeFileSync(adminsPath, JSON.stringify(adminData, null, 2));
    return true;
  } catch (err) {
    console.log('Error saving admins.json:', err.message);
    return false;
  }
}

// Check if player name is banned
function isBanned(playerName) {
  return banData.banned.some(name =>
    name.toLowerCase() === playerName.toLowerCase()
  );
}

// Save ban data to file
function saveBanData() {
  try {
    fs.writeFileSync(bansPath, JSON.stringify(banData, null, 2));
    return true;
  } catch (err) {
    console.log('Error saving bans.json:', err.message);
    return false;
  }
}

// ============================================
// ACCOUNT AUTHENTICATION SYSTEM
// ============================================

// Load account data from JSON file
let accountData = {};
try {
  if (fs.existsSync(ACCOUNTS_PATH)) {
    accountData = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, 'utf8'));
    console.log(`Loaded ${Object.keys(accountData).length} account(s)`);
  }
} catch (err) {
  console.log('No accounts.json found, starting fresh');
}

// Save account data to file
function saveAccountData() {
  try {
    fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(accountData, null, 2));
    return true;
  } catch (err) {
    console.log('Error saving accounts.json:', err.message);
    return false;
  }
}

// Check if an account exists
function accountExists(username) {
  return accountData[username.toLowerCase()] !== undefined;
}

// Get account by username
function getAccount(username) {
  return accountData[username.toLowerCase()];
}

// Check if username is reserved
function isReservedName(name) {
  return RESERVED_NAMES.includes(name.toLowerCase());
}

// Create a new account (async due to bcrypt)
async function createAccount(username, password) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const now = new Date().toISOString();

  accountData[username.toLowerCase()] = {
    passwordHash: passwordHash,
    created: now,
    lastLogin: now,
    loginAttempts: 0,
    locked: false,
    lockTime: null,
    needsPasswordMigration: false
  };

  saveAccountData();
  return true;
}

// Verify password (async due to bcrypt)
async function verifyPassword(username, password) {
  const account = getAccount(username);
  if (!account) return { success: false, error: 'ACCOUNT_NOT_FOUND' };

  // Check if account is locked
  if (account.locked) {
    const lockTime = new Date(account.lockTime);
    const now = new Date();
    if (now - lockTime < ACCOUNT_LOCKOUT_DURATION) {
      const remainingMs = ACCOUNT_LOCKOUT_DURATION - (now - lockTime);
      const remainingMin = Math.ceil(remainingMs / 60000);
      return { success: false, error: 'LOCKED', remainingMinutes: remainingMin };
    } else {
      // Lockout expired, reset
      account.locked = false;
      account.loginAttempts = 0;
      account.lockTime = null;
      saveAccountData();
    }
  }

  // Verify password
  const match = await bcrypt.compare(password, account.passwordHash);

  if (!match) {
    account.loginAttempts++;
    if (account.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      account.locked = true;
      account.lockTime = new Date().toISOString();
      saveAccountData();
      return { success: false, error: 'LOCKED_NOW', attemptsRemaining: 0 };
    }
    saveAccountData();
    return {
      success: false,
      error: 'WRONG_PASSWORD',
      attemptsRemaining: MAX_LOGIN_ATTEMPTS - account.loginAttempts
    };
  }

  // Success - reset attempts and update last login
  account.loginAttempts = 0;
  account.lastLogin = new Date().toISOString();
  saveAccountData();
  return { success: true };
}

// Change password (async due to bcrypt)
async function changePassword(username, newPassword) {
  const account = getAccount(username);
  if (!account) return false;

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
  account.passwordHash = passwordHash;
  account.needsPasswordMigration = false;
  saveAccountData();
  return true;
}

// Admin: Reset password to temporary (returns temp password)
async function adminResetPassword(username) {
  const account = getAccount(username);
  if (!account) return null;

  // Generate temporary password
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let tempPassword = 'temp';
  for (let i = 0; i < 6; i++) {
    tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);
  account.passwordHash = passwordHash;
  account.needsPasswordMigration = true;
  account.locked = false;
  account.loginAttempts = 0;
  account.lockTime = null;
  saveAccountData();

  return tempPassword;
}

// Check if player is already online (for duplicate login check)
function isPlayerOnline(playerName) {
  for (const [socket, player] of players) {
    if (player.isRegistered && player.name.toLowerCase() === playerName.toLowerCase()) {
      return { socket, player };
    }
  }
  return null;
}

// Create account for existing player (migration)
async function migrateExistingPlayer(username, password) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  const now = new Date().toISOString();

  accountData[username.toLowerCase()] = {
    passwordHash: passwordHash,
    created: now,
    lastLogin: now,
    loginAttempts: 0,
    locked: false,
    lockTime: null,
    needsPasswordMigration: false,
    migratedAt: now
  };

  saveAccountData();
  return true;
}

// Server tracking
const serverStartTime = Date.now();
const recentActivity = []; // Array of { message, timestamp }
const MAX_ACTIVITY_LOG = 20;

// ============================================
// PHASE 1.5: COMPETITIVE GAMEPLAY STATE
// ============================================

// World Reset Cycle State
let cycleStartTime = Date.now();
let cycleNumber = 1;
let cycleTimer = null;
let cycleWarningTimer = null;
let cycleResetEnabled = true;
const cycleLeaderboard = {
  xpGained: { name: null, value: 0 },
  monstersKilled: { name: null, value: 0 },
  goldEarned: { name: null, value: 0 },
  bossesDefeated: []
};

// Wandering Healer NPC State
const wanderingHealer = {
  name: 'Mystic Healer',
  currentRoom: 'room_001',
  lastMove: Date.now()
};
let healerWanderTimer = null;

// Active PVP Combats (automatic real-time combat)
// Map: combatId -> { attacker, defender, attackerSocket, defenderSocket, timer, lastActivity, roomId }
const activePvpCombats = new Map();
let pvpCombatIdCounter = 0;

// Active Monster Combats (automatic real-time combat)
// Map: combatId -> { player, socket, monster, timer, roomId }
const activeMonsterCombats = new Map();
let monsterCombatIdCounter = 0;

// Add activity to log
function logActivity(message) {
  recentActivity.unshift({ message, timestamp: Date.now() });
  if (recentActivity.length > MAX_ACTIVITY_LOG) {
    recentActivity.pop();
  }
}

// Check if player is an admin
function isAdmin(playerName) {
  return adminData.admins.some(admin =>
    admin.toLowerCase() === playerName.toLowerCase()
  );
}

// Format uptime
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}, ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

// Room item storage - items dropped or left in rooms
const roomItems = {}; // roomId -> array of item objects

// ============================================
// ANSI COLOR CODES
// ============================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Foreground colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  // Bright foreground colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Grey (dim white) — used for unavailable/locked UI elements
  gray: '\x1b[90m',
  grey: '\x1b[90m'
};

// Helper function for colored output
function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// Valid movement directions
const DIRECTIONS = [
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
  'up', 'down', 'in', 'out'
];

// Direction shortcuts
const DIR_SHORTCUTS = {
  'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
  'ne': 'northeast', 'nw': 'northwest', 'se': 'southeast', 'sw': 'southwest',
  'u': 'up', 'd': 'down',
  'enter': 'in', 'inside': 'in', 'exit': 'out', 'outside': 'out', 'leave': 'out'
};

// Opposite directions for arrival messages
const OPPOSITE_DIRECTIONS = {
  'north': 'south', 'south': 'north',
  'east': 'west', 'west': 'east',
  'northeast': 'southwest', 'southwest': 'northeast',
  'northwest': 'southeast', 'southeast': 'northwest',
  'up': 'below', 'down': 'above',
  'in': 'outside', 'out': 'inside'
};

// ============================================
// PLAYER MANAGEMENT
// ============================================

// Track all connected players
const players = new Map(); // socket -> player object

// Get all players in a specific room (excludes given socket)
function getPlayersInRoom(roomId, excludeSocket = null) {
  const playersInRoom = [];
  players.forEach((player, socket) => {
    if (player.currentRoom === roomId && player.authenticated && socket !== excludeSocket) {
      playersInRoom.push({ player, socket });
    }
  });
  return playersInRoom;
}

function sendStatusLine(socket, player) {
  const nextLevelXP = getXPForNextLevel(player.level);
  const xpDisplay = nextLevelXP ? `${player.experience}/${nextLevelXP}` : 'MAX';
  const hpColor = player.currentHP < player.maxHP * 0.3 ? 'red' : 'green';
  socket.write(colorize(`[HP: ${player.currentHP}/${player.maxHP}]`, hpColor));
  socket.write(colorize(` [Lv${player.level} ${player.title}]`, 'cyan'));
  socket.write(colorize(` [XP: ${xpDisplay}]\r\n`, 'yellow'));
}

function broadcastStatusToRoom(roomId) {
  const watchers = getPlayersInRoom(roomId);
  watchers.forEach(({ socket, player }) => sendStatusLine(socket, player));
}

// Find a player by name (case-insensitive)
function findPlayerByName(searchName) {
  const searchLower = searchName.toLowerCase();
  for (const [socket, player] of players) {
    if (player.authenticated && player.name.toLowerCase() === searchLower) {
      return { player, socket };
    }
  }
  return null;
}

// Find a player in a specific room by name (case-insensitive, partial match)
function findPlayerInRoom(roomId, searchName, excludeSocket = null) {
  const searchLower = searchName.toLowerCase();
  const playersHere = getPlayersInRoom(roomId, excludeSocket);

  // Try exact match first
  let found = playersHere.find(({ player }) =>
    player.name.toLowerCase() === searchLower
  );
  if (found) return found;

  // Try partial match (name starts with search)
  found = playersHere.find(({ player }) =>
    player.name.toLowerCase().startsWith(searchLower)
  );
  if (found) return found;

  // Try partial match (name contains search)
  found = playersHere.find(({ player }) =>
    player.name.toLowerCase().includes(searchLower)
  );
  return found;
}

// Get all online authenticated players
function getOnlinePlayers() {
  const online = [];
  players.forEach((player, socket) => {
    if (player.authenticated) {
      online.push({ player, socket });
    }
  });
  return online;
}

// Broadcast message to all online players
function broadcastToAll(message, excludeSocket = null) {
  players.forEach((player, socket) => {
    // Only send to authenticated players (not during login)
    if (player.authenticated && socket !== excludeSocket) {
      socket.write(`\r\n${message}\r\n> `);
    }
  });
}

// Level progression table
const LEVEL_TABLE = [
  { level: 1,  xp: 0,     title: "Novice Seeker",          hp: 50,  dmgMin: 5,  dmgMax: 10 },
  { level: 2,  xp: 100,   title: "Initiate of the Arcane", hp: 60,  dmgMin: 6,  dmgMax: 12 },
  { level: 3,  xp: 250,   title: "Apprentice Mage",        hp: 70,  dmgMin: 7,  dmgMax: 14 },
  { level: 4,  xp: 500,   title: "Adept Spellcaster",      hp: 85,  dmgMin: 9,  dmgMax: 16 },
  { level: 5,  xp: 850,   title: "Journeyman Wizard",      hp: 100, dmgMin: 10, dmgMax: 18 },
  { level: 6,  xp: 1300,  title: "Adept of Elements",      hp: 120, dmgMin: 12, dmgMax: 20 },
  { level: 7,  xp: 1900,  title: "Master of Mysteries",    hp: 140, dmgMin: 14, dmgMax: 22 },
  { level: 8,  xp: 2600,  title: "Keeper of Secrets",      hp: 165, dmgMin: 16, dmgMax: 24 },
  { level: 9,  xp: 3400,  title: "High Sorcerer",          hp: 190, dmgMin: 18, dmgMax: 28 },
  { level: 10, xp: 4400,  title: "Arcane Lord",            hp: 220, dmgMin: 20, dmgMax: 32 },
  { level: 11, xp: 5600,  title: "Grand Wizard",           hp: 250, dmgMin: 23, dmgMax: 36 },
  { level: 12, xp: 7000,  title: "Supreme Mage",           hp: 285, dmgMin: 26, dmgMax: 40 },
  { level: 13, xp: 8600,  title: "Archmage",               hp: 325, dmgMin: 30, dmgMax: 45 },
  { level: 14, xp: 10400, title: "Archmage Supreme",       hp: 370, dmgMin: 34, dmgMax: 50 },
  { level: 15, xp: 12500, title: "Immortal Wizard",        hp: 450, dmgMin: 40, dmgMax: 60 },
  { level: 16, xp: 15000, title: "Code-Reader",            hp: 490, dmgMin: 43, dmgMax: 64 },
  { level: 17, xp: 18000, title: "Glitch-Walker",          hp: 535, dmgMin: 46, dmgMax: 68 },
  { level: 18, xp: 21500, title: "Syntax Adept",           hp: 585, dmgMin: 50, dmgMax: 73 },
  { level: 19, xp: 25500, title: "Reality-Patcher",        hp: 640, dmgMin: 54, dmgMax: 78 },
  { level: 20, xp: 30000, title: "Resonance Binder",       hp: 700, dmgMin: 58, dmgMax: 84 },
  { level: 21, xp: 35500, title: "Variable Shaper",        hp: 760, dmgMin: 62, dmgMax: 90 },
  { level: 22, xp: 42000, title: "Memory Warden",          hp: 820, dmgMin: 66, dmgMax: 96 },
  { level: 23, xp: 50000, title: "Paradox Master",         hp: 880, dmgMin: 70, dmgMax: 102 },
  { level: 24, xp: 60000, title: "Null-Speaker",           hp: 940, dmgMin: 74, dmgMax: 108 },
  { level: 25, xp: 72000, title: "Echo of Nyxara",         hp: 1000, dmgMin: 78, dmgMax: 114 },
  { level: 26, xp: 86000, title: "Unwritten Sage",         hp: 1060, dmgMin: 82, dmgMax: 120 },
  { level: 27, xp: 102000, title: "Keeper of the Symphony", hp: 1120, dmgMin: 86, dmgMax: 126 },
  { level: 28, xp: 122000, title: "Cursor-Bearer",         hp: 1180, dmgMin: 90, dmgMax: 134 },
  { level: 29, xp: 145000, title: "Peer of Nomagio",       hp: 1240, dmgMin: 95, dmgMax: 142 },
  { level: 30, xp: 175000, title: "The First Admin",       hp: 1350, dmgMin: 100, dmgMax: 150 }
];

// Get level data from table
function getLevelData(level) {
  return LEVEL_TABLE[Math.min(level - 1, LEVEL_TABLE.length - 1)];
}

// Get level for a given XP amount
function getLevelForXP(xp) {
  for (let i = LEVEL_TABLE.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_TABLE[i].xp) {
      return LEVEL_TABLE[i].level;
    }
  }
  return 1;
}

// Get XP needed for next level
function getXPForNextLevel(currentLevel) {
  if (currentLevel >= 30) return null; // Max level
  return LEVEL_TABLE[currentLevel].xp;
}

// Get XP threshold for current level (minimum XP to stay at this level)
function getXPForLevel(level) {
  return LEVEL_TABLE[Math.min(level - 1, LEVEL_TABLE.length - 1)].xp;
}

// Maximum inventory size (base). Memory Wardens (L19+) get a bigger cap via getInventoryCap().
const MAX_INVENTORY = 20;
function getInventoryCap(player) {
  return (player && player.level >= 19) ? 25 : MAX_INVENTORY;
}

// Create a new player object
function createPlayer(name = null) {
  const levelData = getLevelData(1);
  return {
    name: name || `Adventurer${Math.floor(Math.random() * 9000) + 1000}`,
    suffix: '', // Custom suffix set by admins (e.g., "the Charming")
    currentRoom: START_ROOM,
    displayMode: 'verbose',
    // Combat stats
    level: 1,
    title: levelData.title,
    maxHP: levelData.hp,
    currentHP: levelData.hp,
    // Mana system
    maxMana: 15, // level * 15
    currentMana: 15,
    baseDamage: { min: levelData.dmgMin, max: levelData.dmgMax },
    experience: 0,
    // Spell system
    spellCooldowns: {}, // spellName -> timestamp when cooldown ends
    effects: {}, // Active spell effects on this player
    // Combat state
    inCombat: false,
    combatTarget: null, // Monster ID
    // Inventory system
    inventory: [], // array of item objects (max 20)
    equipped: {
      weapon: null,
      armor: null,   // legacy: body armor
      shield: null,
      head: null,
      neck: null,
      hands: null,
      feet: null,
      finger: null
    },
    gold: 50, // starting gold
    // Statistics
    stats: {
      monstersKilled: 0,
      deaths: 0,
      bossesDefeated: [],
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      roomsExplored: [START_ROOM],
      itemsCollected: 0,
      // PVP Stats (persistent)
      pvpKills: 0,
      pvpDeaths: 0,
      // Eldoria 2.0 story flags
      storyFlags: {
        gatekeeperTriggered: false,
        tuningForkGranted: false,
        drumStaveForged: false,
        instrumentsPlayed: { drum: false, harp: false, trumpet: false, lute: false, flute: false },
        finaleCompleted: false
      }
    },
    // Session tracking
    isNewPlayer: true,
    sessionStart: Date.now(),
    sessionXPGained: 0,
    sessionMonstersKilled: 0,
    sessionItemsCollected: 0,
    sessionGoldEarned: 0,
    lastSaved: null,
    // Cycle tracking (resets on world reset)
    cycleXPGained: 0,
    cycleMonstersKilled: 0,
    cycleGoldEarned: 0,
    cycleBossesDefeated: [],
    // Chapel healing cooldown
    lastChapelHeal: 0,
    // PVP State
    pvpEnabled: false,
    pvpToggleCooldown: 0,
    pvpLastAttacked: {}, // playerName -> timestamp
    pvpCombatTarget: null, // player name when in PVP combat
    // Aggressive monster grace period
    graceTimer: null,
    pendingAggressor: null,
    // Registration state
    isRegistered: false,
    authenticated: false, // True only after successful login/registration
    inputMode: 'auth_choice', // Authentication flow states
    // Authentication state tracking
    authState: {
      pendingUsername: null,  // Username being registered/logged in
      pendingPassword: null,  // Password being entered (for confirmation)
      isPasswordInput: false, // True when expecting password input (hidden)
      kickTarget: null        // Socket of player to kick on duplicate login
    },
    // Multiplayer features
    isAFK: false,
    afkMessage: '',
    ignoreList: [], // array of player names (lowercase)
    // Admin features
    isInvisible: false,
    godMode: false,
    // QoL: aliases + channels
    aliases: {},
    channelSubs: { newbie: true, ooc: true, gossip: true, trade: true },
    // === Tier 1 ===
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10 },
    charClass: null, // 'warder' | 'loresinger' | 'echobound'
    affects: [], // [{key, expiresAt, potency}]
    resists: {}, // derived from equipment; computed on demand
    practicePoints: 0,
    practiceRecord: {}, // stat -> count trained (for respec refund)
    spellProficiencies: {}, // spellKey -> 0..100
    achievementsUnlocked: [], // list of achievement ids
    activeTitle: null, // equipped title from achievements
    shopsVisited: [], // for all_shops
    schoolsCast: [], // for all_classes_met
    bank: 0,
    bankUses: 0,
    roomsVisited: [], // mirror of stats.roomsExplored for Tier 1 audits
    mail: [], // inbox [{from,title,body,timestamp,read}]
    lastChatAt: Date.now(),
    // === Tier 2 ===
    questPoints: 0,
    campaign: null,
    campaignLastCompletedAt: 0,
    campaignsCompleted: 0,
    pets: [],
    skills: { weaponsmith: 0, enchanter: 0, alchemist: 0 },
    remortTier: 0,
    permStatBonuses: { str: 0, dex: 0, con: 0, int: 0, wis: 0 },
    unlockedZones: []
  };
}

// Get player's display name (includes suffix if set)
function getDisplayName(player, includeLevel = false) {
  let name = player.name;

  // Tier 4.1: clan tag prefix if player is in a clan with a tag set
  if (player.clan && typeof getClan === 'function') {
    const clan = getClan(player.clan);
    if (clan && clan.tag) name = `[${clan.tag}] ${name}`;
  }

  if (player.suffix) {
    name += ` ${player.suffix}`;
  }

  if (includeLevel) {
    name += ` (Level ${player.level})`;
  }

  return name;
}

// Check and process level up
function checkLevelUp(socket, player) {
  const newLevel = getLevelForXP(player.experience);

  if (newLevel > player.level) {
    // LEVEL UP!
    const oldLevel = player.level;
    const levelDelta = newLevel - oldLevel;
    player.level = newLevel;

    const levelData = getLevelData(newLevel);
    player.title = levelData.title;
    player.maxHP = levelData.hp;
    player.currentHP = levelData.hp; // Full heal on level up!
    player.baseDamage = { min: levelData.dmgMin, max: levelData.dmgMax };

    // Tier 1.2: class HP/mana multipliers
    if (player.charClass && CLASS_DEFS && CLASS_DEFS[player.charClass]) {
      const def = CLASS_DEFS[player.charClass];
      player.maxHP = Math.floor(player.maxHP * def.hpMult);
      player.currentHP = player.maxHP;
    }

    // Mana increases with level
    const oldMaxMana = player.maxMana;
    player.maxMana = newLevel * 15;
    if (player.charClass && CLASS_DEFS && CLASS_DEFS[player.charClass]) {
      player.maxMana = Math.floor(player.maxMana * CLASS_DEFS[player.charClass].manaMult);
    }
    player.currentMana = player.maxMana; // Full mana on level up!

    // Tier 1.9: +5 practice per level gained
    if (typeof player.practicePoints !== 'number') player.practicePoints = 0;
    player.practicePoints += 5 * levelDelta;

    // Tier 1.8: level milestones
    if (newLevel >= 15) unlockAchievement(socket, player, 'level_15');
    if (newLevel >= 30) unlockAchievement(socket, player, 'level_30');

    // Celebration message
    socket.write('\r\n');
    socket.write(colorize('✨ LEVEL UP! ✨\r\n', 'brightYellow'));
    socket.write(colorize(`You are now level ${newLevel} - ${levelData.title}!\r\n`, 'brightCyan'));
    socket.write(colorize(`Your maximum HP increases to ${levelData.hp}!\r\n`, 'green'));
    socket.write(colorize(`Your maximum Mana increases to ${player.maxMana}!\r\n`, 'brightCyan'));
    socket.write(colorize(`Your combat prowess improves! (Damage: ${levelData.dmgMin}-${levelData.dmgMax})\r\n`, 'green'));
    socket.write(colorize('You feel the power of the realms flowing through you!\r\n', 'brightMagenta'));

    // Broadcast level up
    broadcastToRoom(player.currentRoom, `${getDisplayName(player)} has reached level ${newLevel}!`, socket);

    // Eldoria 2.0 Gatekeeper transition: at level 15, destroy all weapons and teleport to room_101
    if (newLevel >= 15 && player.stats.storyFlags && !player.stats.storyFlags.gatekeeperTriggered) {
      triggerGatekeeperTransition(socket, player);
    }

    // Auto-save on level up
    savePlayer(player, socket, true);

    // Log activity
    logActivity(`${player.name} reached Level ${newLevel}`);

    return true;
  }
  return false;
}

// Gatekeeper of Resonance transition: fires once when player hits level 15.
// Destroys all weapons (equipped + inventory), teleports to room_101, grants the Tuning Fork.
function triggerGatekeeperTransition(socket, player) {
  player.stats.storyFlags.gatekeeperTriggered = true;

  socket.write('\r\n');
  socket.write(colorize('=== THE GATEKEEPER OF RESONANCE ===\r\n', 'brightMagenta'));
  socket.write(colorize('A figure of pure, humming sound rises between you and the rest of your life.\r\n', 'brightCyan'));
  socket.write(colorize('"The tutorial weapons end here," it says, in a voice that is mostly overtones.\r\n', 'brightCyan'));
  socket.write(colorize('"All blades forged inside the sanctum are only dreams of blades. Past this threshold, only resonance cuts."\r\n', 'brightCyan'));
  socket.write('\r\n');

  // Destroy equipped weapon
  if (player.equipped && player.equipped.weapon) {
    socket.write(colorize(`Your ${player.equipped.weapon.name} crumbles to administrative ash in your hand.\r\n`, 'yellow'));
    player.equipped.weapon = null;
  }

  // Destroy all weapons in inventory
  if (player.inventory && player.inventory.length > 0) {
    const remaining = [];
    for (const item of player.inventory) {
      if (item && item.type === 'weapon') {
        socket.write(colorize(`Your ${item.name} crumbles to administrative ash.\r\n`, 'yellow'));
      } else {
        remaining.push(item);
      }
    }
    player.inventory = remaining;
  }

  // Broadcast departure from old room
  const oldRoom = player.currentRoom;
  broadcastToRoom(oldRoom, `${getDisplayName(player)} is pulled through a raw grey seam in the marble and vanishes.`, socket);

  // Teleport to room_101
  player.currentRoom = 'room_101';

  // Broadcast arrival
  broadcastToRoom('room_101', `${getDisplayName(player)} is flung onto the ash-choked threshold, empty-handed.`, socket);

  // Grant Tuning Fork
  placeTuningForkForPlayer(player, socket);

  socket.write('\r\n');
  socket.write(colorize('You stagger forward into the Shattered Threshold. The real Eldoria begins here.\r\n', 'brightGreen'));
  socket.write('\r\n');

  // Auto-offer the instrument quest chain to anchor the next 15 levels of progression.
  try {
    const accepted = questManager.accept(player.name, 'collect_five_instruments');
    if (accepted && accepted.ok) {
      socket.write(colorize('*** Quest accepted: The Shattered Symphony ***\r\n', 'brightYellow'));
      socket.write(colorize('Recover the five Primordial Instruments and bring them to the Zero Point Chamber.\r\n', 'yellow'));
      socket.write(colorize('Use "quests" to track your progress.\r\n\r\n', 'yellow'));
    }
  } catch (e) {
    console.log('collect_five_instruments auto-accept failed:', e.message);
  }

  // Show the new room
  showRoom(socket, player);

  logActivity(`${player.name} crossed the Gatekeeper threshold into Eldoria 2.0`);
}

// ============================================
// PLAYER PERSISTENCE SYSTEM
// ============================================

// Ensure players directory exists
function ensurePlayersDir() {
  if (!fs.existsSync(PLAYERS_DIR)) {
    fs.mkdirSync(PLAYERS_DIR, { recursive: true });
    console.log('Created players directory');
  }
}

// Get player file path
function getPlayerFilePath(playerName) {
  return path.join(PLAYERS_DIR, `${playerName.toLowerCase()}.json`);
}

// Check if player exists
function playerExists(playerName) {
  return fs.existsSync(getPlayerFilePath(playerName));
}

// Validate player name (3-12 chars, letters only)
function isValidPlayerName(name) {
  return /^[a-zA-Z]{3,12}$/.test(name);
}

// Save player data to file
function savePlayer(player, socket = null, silent = false) {
  if (!player.isRegistered) return false;

  const filePath = getPlayerFilePath(player.name);
  const backupPath = filePath + '.bak';

  // Create save data (excluding transient state)
  const saveData = {
    name: player.name,
    level: player.level,
    experience: player.experience,
    title: player.title,
    suffix: player.suffix || '',  // Custom suffix set by admins
    currentHP: player.currentHP,
    maxHP: player.maxHP,
    currentMana: player.currentMana,
    maxMana: player.maxMana,
    currentRoom: player.currentRoom,
    displayMode: player.displayMode,
    inventory: player.inventory,
    equipped: player.equipped,
    gold: player.gold,
    stats: player.stats,
    aliases: player.aliases || {},
    channelSubs: player.channelSubs || {},
    // Tier 1
    abilities: player.abilities || { str: 10, dex: 10, con: 10, int: 10, wis: 10 },
    charClass: player.charClass || null,
    affects: player.affects || [],
    practicePoints: player.practicePoints || 0,
    practiceRecord: player.practiceRecord || {},
    spellProficiencies: player.spellProficiencies || {},
    achievementsUnlocked: player.achievementsUnlocked || [],
    activeTitle: player.activeTitle || null,
    shopsVisited: player.shopsVisited || [],
    schoolsCast: player.schoolsCast || [],
    bank: player.bank || 0,
    bankUses: player.bankUses || 0,
    mail: player.mail || [],
    // Tier 2
    questPoints: player.questPoints || 0,
    campaign: player.campaign || null,
    campaignLastCompletedAt: player.campaignLastCompletedAt || 0,
    campaignsCompleted: player.campaignsCompleted || 0,
    pets: player.pets || [],
    skills: player.skills || { weaponsmith: 0, enchanter: 0, alchemist: 0, hack: 0 },
    affinity: player.affinity || { replicant: 0, human: 0 },
    clan: player.clan || null,
    clanRank: player.clanRank || null,
    remortTier: player.remortTier || 0,
    permStatBonuses: player.permStatBonuses || { str: 0, dex: 0, con: 0, int: 0, wis: 0 },
    unlockedZones: player.unlockedZones || [],
    lastPlayed: new Date().toISOString()
  };

  try {
    // Backup existing save
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    // Write save file
    fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2));
    player.lastSaved = Date.now();

    if (socket && !silent) {
      socket.write(colorize('[Auto-saved character data]\r\n', 'dim'));
    }

    return true;
  } catch (err) {
    console.error(`Error saving player ${player.name}: ${err.message}`);
    if (socket) {
      socket.write(colorize('[Save failed - please try again]\r\n', 'red'));
    }
    return false;
  }
}

// Load player data from file
function loadPlayer(playerName) {
  const filePath = getPlayerFilePath(playerName);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const levelData = getLevelData(data.level);

    // Create player with saved data
    // Default: spawn at room_001 (Awakening Chamber) on reconnect.
    // Tier 3.1: if the player saved inside Neo Kyoto (rooms 201-300), restore that room
    // instead - the realm is too big to walk back through every reconnect, and the
    // narrative arc breaks if mid-quest players are bounced to Eldoria's start room.
    let restoredRoom = START_ROOM;
    if (data.currentRoom && /^room_(2\d\d|300)$/.test(data.currentRoom) && rooms[data.currentRoom]) {
      restoredRoom = data.currentRoom;
    }
    const player = {
      name: data.name,
      currentRoom: restoredRoom,
      displayMode: data.displayMode || 'verbose',
      level: data.level,
      title: data.title || levelData.title,
      suffix: data.suffix || '',  // Custom suffix set by admins
      maxHP: data.maxHP || levelData.hp,
      currentHP: data.currentHP || data.maxHP,
      maxMana: data.maxMana || (data.level * 15),
      currentMana: data.currentMana || (data.level * 15),
      baseDamage: { min: levelData.dmgMin, max: levelData.dmgMax },
      experience: data.experience || 0,
      // Spell system
      spellCooldowns: {},
      effects: {},
      inCombat: false,
      combatTarget: null,
      inventory: data.inventory || [],
      equipped: Object.assign(
        { weapon: null, armor: null, shield: null, head: null, neck: null, hands: null, feet: null, finger: null },
        data.equipped || {}
      ),
      // QoL: aliases + channel subscriptions (persistent)
      aliases: data.aliases || {},
      channelSubs: Object.assign({ newbie: true, ooc: true, gossip: true, trade: true }, data.channelSubs || {}),
      gold: data.gold || 0,
      stats: {
        monstersKilled: data.stats?.monstersKilled || 0,
        deaths: data.stats?.deaths || 0,
        bossesDefeated: data.stats?.bossesDefeated || [],
        totalDamageDealt: data.stats?.totalDamageDealt || 0,
        totalDamageTaken: data.stats?.totalDamageTaken || 0,
        roomsExplored: data.stats?.roomsExplored || [START_ROOM],
        itemsCollected: data.stats?.itemsCollected || 0,
        // PVP stats (with backwards compatibility for old saves)
        pvpKills: data.stats?.pvpKills || 0,
        pvpDeaths: data.stats?.pvpDeaths || 0,
        // Eldoria 2.0 story flags (backfill: if save is already level 15+, treat gatekeeper as done)
        storyFlags: data.stats?.storyFlags || {
          gatekeeperTriggered: (data.level || 0) >= 15,
          tuningForkGranted: false,
          drumStaveForged: false,
          instrumentsPlayed: { drum: false, harp: false, trumpet: false, lute: false, flute: false },
          finaleCompleted: false
        }
      },
      isNewPlayer: false,
      sessionStart: Date.now(),
      sessionXPGained: 0,
      sessionMonstersKilled: 0,
      sessionItemsCollected: 0,
      sessionGoldEarned: 0,
      lastSaved: Date.now(),
      // Cycle tracking (resets on load - fresh each session)
      cycleXPGained: 0,
      cycleMonstersKilled: 0,
      cycleGoldEarned: 0,
      cycleBossesDefeated: [],
      // Chapel healing cooldown
      lastChapelHeal: 0,
      // PVP State (resets on load)
      pvpEnabled: false,
      pvpToggleCooldown: 0,
      pvpLastAttacked: {},
      pvpCombatTarget: null,
      // Aggressive monster grace period
      graceTimer: null,
      pendingAggressor: null,
      isRegistered: true,
      inputMode: 'command',
      lastPlayedDate: data.lastPlayed,
      // === Tier 1 with back-compat defaults ===
      abilities: Object.assign({ str: 10, dex: 10, con: 10, int: 10, wis: 10 }, data.abilities || {}),
      charClass: data.charClass || null,
      affects: data.affects || [],
      resists: {},
      practicePoints: typeof data.practicePoints === 'number' ? data.practicePoints : 0,
      practiceRecord: data.practiceRecord || {},
      spellProficiencies: data.spellProficiencies || {},
      achievementsUnlocked: data.achievementsUnlocked || [],
      activeTitle: data.activeTitle || null,
      shopsVisited: data.shopsVisited || [],
      schoolsCast: data.schoolsCast || [],
      bank: typeof data.bank === 'number' ? data.bank : 0,
      bankUses: data.bankUses || 0,
      mail: data.mail || [],
      lastChatAt: Date.now(),
      // Tier 2 back-fill
      questPoints: typeof data.questPoints === 'number' ? data.questPoints : 0,
      campaign: data.campaign || null,
      campaignLastCompletedAt: data.campaignLastCompletedAt || 0,
      campaignsCompleted: data.campaignsCompleted || 0,
      pets: data.pets || [],
      skills: Object.assign({ weaponsmith: 0, enchanter: 0, alchemist: 0, hack: 0 }, data.skills || {}),
      affinity: Object.assign({ replicant: 0, human: 0 }, data.affinity || {}),
      clan: data.clan || null,
      clanRank: data.clanRank || null,
      remortTier: data.remortTier || 0,
      permStatBonuses: Object.assign({ str: 0, dex: 0, con: 0, int: 0, wis: 0 }, data.permStatBonuses || {}),
      unlockedZones: Array.isArray(data.unlockedZones) ? data.unlockedZones : []
    };

    return player;
  } catch (err) {
    console.error(`Error loading player ${playerName}: ${err.message}`);
    return null;
  }
}

// Format time difference for display
function formatTimeSince(timestamp) {
  if (!timestamp) return 'never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// Format session duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

// Format number with commas
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ============================================
// ITEM SYSTEM
// ============================================

// Get an item template by its ID
function getItemById(itemId) {
  // Check all item categories
  const categories = ['weapons', 'armor', 'shields', 'accessories', 'consumables', 'treasure', 'boss_drops', 'instruments', 'crafting', 'qp_gear'];
  for (const category of categories) {
    if (itemData[category] && itemData[category][itemId]) {
      return { ...itemData[category][itemId], id: itemId };
    }
  }
  return null;
}

// Create an item instance from a template ID
function createItem(itemId) {
  const template = getItemById(itemId);
  if (!template) return null;

  return {
    id: template.id,
    name: template.name,
    type: template.type,
    slot: template.slot || null,
    levelReq: template.levelReq || 0,
    tierReq: template.tierReq || 0,
    damageBonus: template.damageBonus || 0,
    armorBonus: template.armorBonus || 0,
    healAmount: template.healAmount || 0,
    manaBonus: template.manaBonus || 0,
    resistBonus: template.resistBonus || null,
    damageType: template.damageType || null,
    affinityReq: template.affinityReq || null,
    value: template.value || 0,
    description: template.description
  };
}

// Get items in a room
function getItemsInRoom(roomId) {
  return roomItems[roomId] || [];
}

// Add an item to a room
function addItemToRoom(roomId, item) {
  if (!roomItems[roomId]) {
    roomItems[roomId] = [];
  }
  roomItems[roomId].push(item);
}

// Remove an item from a room by index
function removeItemFromRoom(roomId, itemIndex) {
  if (!roomItems[roomId] || itemIndex < 0 || itemIndex >= roomItems[roomId].length) {
    return null;
  }
  return roomItems[roomId].splice(itemIndex, 1)[0];
}

// Find item in room by name (case-insensitive, partial match)
function findItemInRoom(roomId, searchName) {
  const items = getItemsInRoom(roomId);
  const searchLower = searchName.toLowerCase();

  // Try exact match first
  let index = items.findIndex(item => item.name.toLowerCase() === searchLower);
  if (index !== -1) return { item: items[index], index };

  // Try partial match
  index = items.findIndex(item => item.name.toLowerCase().includes(searchLower));
  if (index !== -1) return { item: items[index], index };

  return null;
}

// Find item in player inventory by name
function findItemInInventory(player, searchName) {
  const searchLower = searchName.toLowerCase();

  // Try exact match first
  let index = player.inventory.findIndex(item => item.name.toLowerCase() === searchLower);
  if (index !== -1) return { item: player.inventory[index], index };

  // Try partial match
  index = player.inventory.findIndex(item => item.name.toLowerCase().includes(searchLower));
  if (index !== -1) return { item: player.inventory[index], index };

  return null;
}

// Calculate player's total damage bonus from equipped weapon
function getEquippedDamageBonus(player) {
  let bonus = 0;
  if (player.equipped.weapon) {
    bonus += player.equipped.weapon.damageBonus || 0;
  }
  return bonus;
}

// Calculate player's total armor bonus from equipped armor and shield
function getEquippedArmorBonus(player) {
  let bonus = 0;
  const slots = ['armor', 'shield', 'head', 'neck', 'hands', 'feet', 'finger'];
  for (const slot of slots) {
    const item = player.equipped[slot];
    if (item) bonus += item.armorBonus || 0;
  }
  return bonus;
}

// Check if player can equip an item (meets level requirement)
function canEquipItem(player, item) {
  if (player.level < (item.levelReq || 0)) return false;
  // Tier 2.6: tier-gated gear — requires remort tier >= tierReq
  if ((item.tierReq || 0) > (player.remortTier || 0)) return false;
  // Tier 3.1 Phase 6: affinity-gated gear
  if (item.affinityReq && typeof item.affinityReq === 'object') {
    const aff = (player.affinity || { replicant: 0, human: 0 });
    if (typeof item.affinityReq.replicant === 'number' && (aff.replicant || 0) < item.affinityReq.replicant) return false;
    if (typeof item.affinityReq.human === 'number' && (aff.human || 0) < item.affinityReq.human) return false;
  }
  return true;
}

// Human-readable reason when canEquipItem rejects — used by handleEquip.
function equipRejectReason(player, item) {
  if (player.level < (item.levelReq || 0)) return `You need to be level ${item.levelReq} to equip ${item.name}.`;
  if ((item.tierReq || 0) > (player.remortTier || 0)) return `${item.name} requires remort Tier ${item.tierReq} (you are Tier ${player.remortTier || 0}).`;
  if (item.affinityReq && typeof item.affinityReq === 'object') {
    const aff = (player.affinity || { replicant: 0, human: 0 });
    if (typeof item.affinityReq.replicant === 'number' && (aff.replicant || 0) < item.affinityReq.replicant) {
      return `${item.name} only attunes to Replicant-leaning travellers (need affinity ${item.affinityReq.replicant}; you have ${aff.replicant || 0}).`;
    }
    if (typeof item.affinityReq.human === 'number' && (aff.human || 0) < item.affinityReq.human) {
      return `${item.name} only attunes to Human-leaning travellers (need affinity ${item.affinityReq.human}; you have ${aff.human || 0}).`;
    }
  }
  return null;
}

// Get equipment slot for an item
// Supports new `slot` field (head/neck/hands/feet/finger) with fallback to type for legacy items
function getEquipmentSlot(item) {
  if (!item) return null;
  // Explicit slot takes priority
  if (item.slot) {
    const valid = ['weapon', 'armor', 'shield', 'head', 'neck', 'hands', 'feet', 'finger'];
    if (valid.includes(item.slot)) return item.slot;
  }
  // Fallback to type-based routing
  switch (item.type) {
    case 'weapon': return 'weapon';
    case 'armor': return 'armor';   // body armor
    case 'shield': return 'shield';
    default: return null;
  }
}

// Human-readable slot label
function slotLabel(slot) {
  const map = {
    weapon: 'Weapon', armor: 'Body  ', shield: 'Shield',
    head: 'Head  ', neck: 'Neck  ', hands: 'Hands ', feet: 'Feet  ', finger: 'Finger'
  };
  return map[slot] || slot;
}

// All equipment slot keys in display order
const ALL_EQUIP_SLOTS = ['weapon', 'armor', 'shield', 'head', 'neck', 'hands', 'feet', 'finger'];

// ============================================
// MONSTER SYSTEM
// ============================================

// Active monsters in the world
let activeMonsters = [];
let nextMonsterId = 1;

// Boss gate system - track defeated bosses (resets on world reset)
const defeatedBosses = new Set();

// Boss gate definitions
const BOSS_GATES = {
  'room_015': {
    blockedExit: 'up',
    bossId: 'crystal_dragon',
    bossName: 'Crystal Dragon',
    message: colorize('\r\n⚔️  THE CRYSTAL DRAGON BLOCKS YOUR PATH ⚔️\r\n', 'brightRed') +
             'A massive dragon of pure crystal towers before you, its scales\r\n' +
             'refracting deadly beams of light. It guards the passage upward\r\n' +
             'with fierce determination. You cannot pass while it lives!\r\n\r\n' +
             colorize('[Defeat the Crystal Dragon to open this path]\r\n', 'yellow')
  },
  'room_035': {
    blockedExit: 'up',
    bossId: 'shadow_lord',
    bossName: 'Shadow Lord',
    message: colorize('\r\n⚔️  THE SHADOW LORD BLOCKS YOUR PATH ⚔️\r\n', 'brightRed') +
             'A towering figure of living shadow stands between you and the\r\n' +
             'passage upward. Darkness coils around it like serpents, and its\r\n' +
             'eyes glow with malevolent intelligence. None may pass without\r\n' +
             'facing its wrath!\r\n\r\n' +
             colorize('[Defeat the Shadow Lord to open this path]\r\n', 'yellow')
  },
  'room_085': {
    blockedExit: 'up',
    bossId: 'void_guardian',
    bossName: 'Void Guardian',
    message: colorize('\r\n⚔️  THE VOID GUARDIAN BLOCKS YOUR PATH ⚔️\r\n', 'brightRed') +
             'A massive sentinel of crystallized void energy stands before\r\n' +
             'the ascending passage. Reality itself warps around its presence,\r\n' +
             'and its empty eyes promise oblivion to those who challenge it.\r\n' +
             'It was placed here to guard the path to the upper realms.\r\n\r\n' +
             colorize('[Defeat the Void Guardian to open this path]\r\n', 'yellow')
  },
  'room_108': {
    blockedExit: 'north',
    bossId: 'morwyn_ironheart',
    bossName: 'Morwyn Ironheart',
    message: colorize('\r\n⚔️  MORWYN IRONHEART BARS YOUR PATH ⚔️\r\n', 'brightRed') +
             'The Archmage of Matter hammers at a phantom anvil, shaping the\r\n' +
             'bones of a world that keeps refusing to be finished. He looks up,\r\n' +
             'and the ember-light in his eyes says you are next on the work order.\r\n\r\n' +
             colorize('[Defeat Morwyn Ironheart to open this path]\r\n', 'yellow')
  },
  'room_144': {
    blockedExit: 'east',
    bossId: 'zephyros_recursive',
    bossName: 'The Recursive Zephyros',
    message: colorize('\r\n⚔️  ZEPHYROS ARGUES WITH HIMSELF ACROSS YOUR PATH ⚔️\r\n', 'brightRed') +
             'Three translucent echoes of the Archmage of Change scream at each\r\n' +
             'other over a map that is eating itself. None of them will let you\r\n' +
             'pass until the argument is settled.\r\n\r\n' +
             colorize('[Defeat The Recursive Zephyros to open this path]\r\n', 'yellow')
  },
  'room_150': {
    blockedExit: 'down',
    bossId: 'valdris_radiant',
    bossName: 'Valdris the Radiant',
    message: colorize('\r\n⚔️  VALDRIS THE RADIANT AUDITS YOU ⚔️\r\n', 'brightRed') +
             'The Archmage of Thought examines your existence with the patient\r\n' +
             'disappointment of a critic who has just found a typo on page one.\r\n' +
             'Reality bends toward his correct opinion - including the stairs down.\r\n\r\n' +
             colorize('[Defeat Valdris the Radiant to open this path]\r\n', 'yellow')
  },
  'room_175': {
    blockedExit: 'north',
    bossId: 'nyxara_echo',
    bossName: 'Nyxara, Echo-Self',
    message: colorize('\r\n⚔️  NYXARA WALKS BESIDE HER OWN SHADOW ⚔️\r\n', 'brightRed') +
             'The Archmage of Memory stands at the edge of the access tunnel with\r\n' +
             'her shadow as a second self. Both of them are waiting for you to\r\n' +
             'remember something you would rather not.\r\n\r\n' +
             colorize('[Defeat Nyxara, Echo-Self to open this path]\r\n', 'yellow')
  },
  'room_198': {
    blockedExit: 'north',
    bossId: 'thessarian_patient',
    bossName: 'Thessarian the Patient',
    message: colorize('\r\n⚔️  THESSARIAN THE PATIENT WAITS IN YOUR WAY ⚔️\r\n', 'brightRed') +
             'The Archmage of Logic has already lost this fight once and is\r\n' +
             'trying very hard not to lose it the same way again. He will not\r\n' +
             'let you proceed until the paradox is resolved.\r\n\r\n' +
             colorize('[Defeat Thessarian the Patient to open this path]\r\n', 'yellow')
  }
};

// Spawn statistics
const spawnStats = {};

// Initialize spawn stats for each zone
Object.keys(monsterData.zones).forEach(zone => {
  spawnStats[zone] = { attempted: 0, spawned: 0 };
});

// Generate a unique monster ID
function generateMonsterId() {
  return `monster_${nextMonsterId++}`;
}

// Spawn monsters for a zone
function spawnMonstersForZone(zoneName, zoneData) {
  const { roomRange, spawnChance, monsters: monsterPool } = zoneData;

  roomRange.forEach(roomId => {
    // Skip boss rooms (handled separately)
    if (roomId === 'room_015' || roomId === 'room_035' || roomId === 'room_085' || roomId === 'room_100' ||
        roomId === 'room_108' || roomId === 'room_138' || roomId === 'room_144' || roomId === 'room_150' ||
        roomId === 'room_175' || roomId === 'room_198' || roomId === 'room_200' ||
        roomId === 'room_220' || roomId === 'room_230' || roomId === 'room_260' || roomId === 'room_270' || roomId === 'room_300') {
      return;
    }

    spawnStats[zoneName].attempted++;

    // Roll for spawn chance
    if (Math.random() < spawnChance) {
      // Pick a random monster from the pool
      const templateId = monsterPool[Math.floor(Math.random() * monsterPool.length)];
      const template = monsterData.templates[templateId];

      if (template) {
        const monster = {
          id: generateMonsterId(),
          templateId: templateId,
          name: template.name,
          type: template.type,
          level: template.level,
          hp: template.hp,
          maxHp: template.hp,
          str: template.str,
          description: template.description,
          currentRoom: roomId,
          spawnZone: zoneName,
          isWandering: true,
          movementVerbs: template.movementVerbs,
          presenceVerb: template.presenceVerb,
          loot: template.loot,
          damageType: template.damageType || null,
          resists: template.resists || null
        };

        activeMonsters.push(monster);
        spawnStats[zoneName].spawned++;
      }
    }
  });
}

// Spawn a single monster in a zone (for respawning)
function spawnSingleMonster(zoneName) {
  const zoneData = monsterData.zones[zoneName];
  if (!zoneData) return null;

  const { roomRange, monsters: monsterPool } = zoneData;

  // Filter out boss rooms
  const validRooms = roomRange.filter(r =>
    r !== 'room_015' && r !== 'room_035' && r !== 'room_085' && r !== 'room_100' &&
    r !== 'room_108' && r !== 'room_138' && r !== 'room_144' && r !== 'room_150' &&
    r !== 'room_175' && r !== 'room_198' && r !== 'room_200' &&
    r !== 'room_220' && r !== 'room_230' && r !== 'room_260' && r !== 'room_270' && r !== 'room_300'
  );

  if (validRooms.length === 0) return null;

  // Pick random room and monster type
  const roomId = validRooms[Math.floor(Math.random() * validRooms.length)];
  const templateId = monsterPool[Math.floor(Math.random() * monsterPool.length)];
  const template = monsterData.templates[templateId];

  if (!template) return null;

  const monster = {
    id: generateMonsterId(),
    templateId: templateId,
    name: template.name,
    type: template.type,
    level: template.level,
    hp: template.hp,
    maxHp: template.hp,
    str: template.str,
    description: template.description,
    currentRoom: roomId,
    spawnZone: zoneName,
    isWandering: true,
    movementVerbs: template.movementVerbs,
    presenceVerb: template.presenceVerb,
    loot: template.loot,
    damageType: template.damageType || null,
    resists: template.resists || null
  };

  activeMonsters.push(monster);
  console.log(`Respawned ${monster.name} in ${zoneName} (${roomId})`);

  // Announce spawn to players in that room
  broadcastToRoom(roomId, `A ${monster.name} appears!`);

  return monster;
}

// Schedule a monster respawn
function scheduleMonsterRespawn(zoneName) {
  setTimeout(() => {
    spawnSingleMonster(zoneName);
  }, MONSTER_RESPAWN_TIME);
}

// Spawn boss monsters at fixed locations
function spawnBosses() {
  Object.entries(monsterData.bosses).forEach(([bossId, bossTemplate]) => {
    const boss = {
      id: generateMonsterId(),
      templateId: bossId,
      name: bossTemplate.name,
      type: bossTemplate.type,
      level: bossTemplate.level,
      hp: bossTemplate.hp,
      maxHp: bossTemplate.hp,
      str: bossTemplate.str,
      description: bossTemplate.description,
      currentRoom: bossTemplate.fixedRoom,
      spawnZone: 'Boss',
      isWandering: false,
      presenceVerb: bossTemplate.presenceVerb,
      loot: bossTemplate.loot,
      damageType: bossTemplate.damageType || null,
      resists: bossTemplate.resists || null,
      bossState: {}
    };

    activeMonsters.push(boss);
  });
}

// Initialize all monsters on server start
function initializeMonsters() {
  console.log('Spawning monsters...');

  // Ensure spawnStats has entries for any newly added zones (e.g., Eldoria 2.0)
  Object.keys(monsterData.zones).forEach(zone => {
    if (!spawnStats[zone]) spawnStats[zone] = { attempted: 0, spawned: 0 };
  });

  // Spawn zone monsters
  Object.entries(monsterData.zones).forEach(([zoneName, zoneData]) => {
    spawnMonstersForZone(zoneName, zoneData);
  });

  // Spawn bosses
  spawnBosses();

  // Seed persistent ground items (Eldoria 2.0)
  initializeRoomItems();

  console.log(`Spawned ${activeMonsters.length} monsters (including ${Object.keys(monsterData.bosses).length} bosses)`);

  // Log spawn stats
  Object.entries(spawnStats).forEach(([zone, stats]) => {
    if (stats.attempted > 0) {
      console.log(`  ${zone}: ${stats.spawned}/${stats.attempted} rooms`);
    }
  });
}

// ============================================
// BOSS SIGNATURE MECHANICS
// ============================================

// Spawn a minion at a boss's location, linked to the parent boss for cleanup
function spawnBossMinion(parentBoss, templateId, count) {
  const template = monsterData.templates[templateId];
  if (!template) {
    console.log(`spawnBossMinion: missing template ${templateId}`);
    return;
  }
  for (let i = 0; i < count; i++) {
    const minion = {
      id: generateMonsterId(),
      templateId: templateId,
      name: template.name,
      type: template.type || 'Aggressive',
      level: template.level,
      hp: template.hp,
      maxHp: template.hp,
      str: template.str,
      description: template.description || '',
      currentRoom: parentBoss.currentRoom,
      spawnZone: 'BossMinion',
      isWandering: false,
      presenceVerb: template.presenceVerb || 'lurks here',
      loot: template.loot || [],
      damageType: template.damageType || null,
      resists: template.resists || null,
      parentBossId: parentBoss.id
    };
    activeMonsters.push(minion);
  }
}

const BOSS_SIGNATURES = {
  // Morwyn: at 50% HP spawn 1-2 Discordant Note minions, once per fight
  morwyn_ironheart: {
    onPlayerHit: (socket, player, monster) => {
      if (!monster.bossState.minionsSpawned && monster.hp <= monster.maxHp * 0.5 && monster.hp > 0) {
        monster.bossState.minionsSpawned = true;
        const count = 1 + Math.floor(Math.random() * 2);
        spawnBossMinion(monster, 'discordant_note', count);
        socket.write(colorize("\r\nMorwyn slams his hammer to the ground. Discordant Notes shriek into being!\r\n", 'brightRed'));
        broadcastToRoom(player.currentRoom, colorize("Morwyn slams his hammer; Discordant Notes shriek into being!", 'yellow'), socket);
      }
    }
  },
  // Zephyros: 25% chance on player hit to rewrite to full HP, once per fight, below 70%
  zephyros_recursive: {
    onPlayerHit: (socket, player, monster) => {
      if (!monster.bossState.rewritten && monster.hp < monster.maxHp * 0.7 && monster.hp > 0 && Math.random() < 0.25) {
        monster.bossState.rewritten = true;
        monster.hp = monster.maxHp;
        socket.write(colorize("\r\nZephyros ripples - the last minute of the fight unwrites itself. He is whole again.\r\n", 'brightMagenta'));
        broadcastToRoom(player.currentRoom, colorize("Zephyros rewrites himself to full health!", 'yellow'), socket);
      }
    }
  },
  // Valdris: at 33% HP spawn Shadow-Self, once per fight
  valdris_radiant: {
    onPlayerHit: (socket, player, monster) => {
      if (!monster.bossState.shadowSpawned && monster.hp <= monster.maxHp * 0.33 && monster.hp > 0) {
        monster.bossState.shadowSpawned = true;
        spawnBossMinion(monster, 'valdris_shadow_self', 1);
        socket.write(colorize("\r\nValdris splits. His Shadow-Self tears free from his robes and joins the fight.\r\n", 'brightRed'));
        broadcastToRoom(player.currentRoom, colorize("Valdris's Shadow-Self tears free and attacks!", 'yellow'), socket);
      }
    }
  },
  // Nyxara: 20% chance on monster attack to silence player for 9s
  nyxara_echo: {
    onMonsterAttack: (socket, player, monster) => {
      if (Math.random() < 0.20) {
        player.effects = player.effects || {};
        player.effects['silenced'] = { expiresAt: Date.now() + 9000 };
        socket.write(colorize("\r\nNyxara's echo pours into your throat. Your spells die unspoken for a time.\r\n", 'brightMagenta'));
      }
    }
  },
  // Thessarian: every 2nd attack deals +50% damage (paradox stack)
  thessarian_patient: {
    damageMultiplier: (socket, player, monster) => {
      monster.bossState.paradoxStack = (monster.bossState.paradoxStack || 0) + 1;
      if (monster.bossState.paradoxStack % 2 === 0) {
        socket.write(colorize("The paradox resolves. Thessarian's blow lands with unnatural weight.\r\n", 'brightRed'));
        return 1.5;
      }
      return 1.0;
    }
  },
  // Archmage Supreme: at 50% HP enter phase 2 (damage buff)
  archmage_supreme: {
    onPlayerHit: (socket, player, monster) => {
      if (!monster.bossState.phaseTwo && monster.hp <= monster.maxHp * 0.5 && monster.hp > 0) {
        monster.bossState.phaseTwo = true;
        monster.str = Math.floor(monster.str * 1.25);
        socket.write(colorize("\r\nThe Archmage Supreme's robes tear open. Raw magic spills out. He is no longer holding back.\r\n", 'brightRed'));
        broadcastToRoom(player.currentRoom, colorize("The Archmage Supreme enters his second phase!", 'yellow'), socket);
      }
    }
  },

  // Tier 3.1 - Neo Kyoto bosses

  // Chiyo-7: at 50% HP her cert expires - +50% attack speed but her hits no longer apply
  chiyo_7: {
    onPlayerHit: (socket, player, monster) => {
      if (!monster.bossState.certExpired && monster.hp <= monster.maxHp * 0.5 && monster.hp > 0) {
        monster.bossState.certExpired = true;
        monster.bossState.speedMultiplier = 1.5;
        socket.write(colorize("\r\nA red light blinks once on Chiyo-7's badge. CERTIFICATE EXPIRED. She moves faster - but her authentications no longer land.\r\n", 'brightRed'));
        broadcastToRoom(player.currentRoom, colorize("Chiyo-7's cert expires! She is faster, but her hits no longer authenticate.", 'yellow'), socket);
      }
    },
    damageMultiplier: (socket, player, monster) => {
      return monster.bossState.certExpired ? 0 : 1.0;
    }
  },

  // Account Manager: every 3 rounds escalates - spawns Junior Associate add. Damage scales +10% per live add.
  account_manager: {
    onMonsterAttack: (socket, player, monster) => {
      monster.bossState.roundCount = (monster.bossState.roundCount || 0) + 1;
      if (monster.bossState.roundCount % 3 === 0) {
        spawnBossMinion(monster, 'junior_associate', 1);
        socket.write(colorize("\r\nThe Account Manager escalates. A Junior Associate phases in, already smiling.\r\n", 'brightRed'));
        broadcastToRoom(player.currentRoom, colorize("The Account Manager escalates - a Junior Associate joins the fight!", 'yellow'), socket);
      }
    },
    damageMultiplier: (socket, player, monster) => {
      const aliveAdds = activeMonsters.filter(m => m.parentBossId === monster.id && m.hp > 0).length;
      if (aliveAdds > 0) {
        return 1.0 + 0.10 * aliveAdds;
      }
      return 1.0;
    }
  },

  // Babel Fish Regent: each round, randomly swaps an additional resisted damage type. Telegraphs.
  babel_fish_regent: {
    onMonsterAttack: (socket, player, monster) => {
      const types = ['physical', 'fire', 'harmonic', 'shadow', 'data'];
      const newType = types[Math.floor(Math.random() * types.length)];
      // Reset to baseline Neo Kyoto resists, then layer the new resist
      monster.resists = { harmonic: 75, data: -25 };
      if (newType === 'harmonic') {
        monster.resists.harmonic = 90;
      } else if (newType === 'data') {
        monster.resists.data = 50;
      } else {
        monster.resists[newType] = 60;
      }
      monster.bossState.currentSchema = newType;
      socket.write(colorize(`\r\nThe Babel Fish Regent flickers into a new schema - now resisting ${newType}.\r\n`, 'brightMagenta'));
    }
  },

  // The Deep Pool: drains mana before HP. While player has mana, attacks deal 0 damage but eat mana.
  // When mana hits 0, attacks bleed through at +50% damage.
  deep_pool: {
    onMonsterAttack: (socket, player, monster) => {
      const drainAmount = 25 + Math.floor(Math.random() * 20); // 25-44 mana
      if (player.currentMana > 0) {
        const drained = Math.min(drainAmount, player.currentMana);
        player.currentMana -= drained;
        monster.bossState.lastDrainAbsorbed = true;
        socket.write(colorize(`The Deep Pool drinks ${drained} mana from you. (${player.currentMana}/${player.maxMana})\r\n`, 'brightCyan'));
      } else {
        monster.bossState.lastDrainAbsorbed = false;
        socket.write(colorize("The Deep Pool finds no mana to drink. It bites instead.\r\n", 'brightRed'));
      }
    },
    damageMultiplier: (socket, player, monster) => {
      return monster.bossState.lastDrainAbsorbed ? 0 : 1.5;
    }
  },

  // SYSADMIN.EXE: 3-phase capstone.
  // Phase 2 (66% HP): start spawning cron_daemon adds every 10s.
  // Phase 3 (33% HP): apply paged_oncall effect (next 2 spell casts have 50% chance of 503 fail).
  sysadmin_exe: {
    onPlayerHit: (socket, player, monster) => {
      if (!monster.bossState.phase2 && monster.hp <= monster.maxHp * 0.66 && monster.hp > 0) {
        monster.bossState.phase2 = true;
        socket.write(colorize("\r\nSYSADMIN.EXE escalates. *PHASE 2: AUTOSCALER ENGAGED.* A CRON_DAEMON forks into the room.\r\n", 'brightRed'));
        broadcastToRoom(player.currentRoom, colorize("SYSADMIN.EXE enters Phase 2 - cron daemons begin spawning every 10 seconds!", 'yellow'), socket);
        spawnBossMinion(monster, 'cron_daemon', 1);
        const bossId = monster.id;
        monster.bossState.addsTimer = setInterval(() => {
          const stillAlive = activeMonsters.find(m => m.id === bossId && m.hp > 0);
          if (!stillAlive) {
            clearInterval(monster.bossState.addsTimer);
            monster.bossState.addsTimer = null;
            return;
          }
          spawnBossMinion(stillAlive, 'cron_daemon', 1);
          broadcastToRoom(stillAlive.currentRoom, colorize("A cron job triggers. A CRON_DAEMON forks into the room.", 'yellow'));
        }, 10000);
      }
      if (!monster.bossState.phase3 && monster.hp <= monster.maxHp * 0.33 && monster.hp > 0) {
        monster.bossState.phase3 = true;
        player.effects = player.effects || {};
        player.effects['paged_oncall'] = { failsLeft: 2, expiresAt: Date.now() + 120000 };
        socket.write(colorize("\r\nSYSADMIN.EXE escalates. *PHASE 3: PAGING ONCALL.* Your next abilities may fail with 503.\r\n", 'brightRed'));
        broadcastToRoom(player.currentRoom, colorize("SYSADMIN.EXE pages the on-call rotation - the player's spells may not respond!", 'yellow'), socket);
      }
    }
  }
};

function triggerBossOnPlayerHit(socket, player, monster) {
  if (!monster || !monster.templateId) return;
  if (!monster.bossState) monster.bossState = {};
  const sig = BOSS_SIGNATURES[monster.templateId];
  if (sig && typeof sig.onPlayerHit === 'function') {
    try { sig.onPlayerHit(socket, player, monster); } catch (e) { console.log('boss onPlayerHit error:', e.message); }
  }
}

function triggerBossOnMonsterAttack(socket, player, monster) {
  if (!monster || !monster.templateId) return;
  if (!monster.bossState) monster.bossState = {};
  const sig = BOSS_SIGNATURES[monster.templateId];
  if (sig && typeof sig.onMonsterAttack === 'function') {
    try { sig.onMonsterAttack(socket, player, monster); } catch (e) { console.log('boss onMonsterAttack error:', e.message); }
  }
}

function getBossDamageMultiplier(socket, player, monster) {
  if (!monster || !monster.templateId) return 1.0;
  if (!monster.bossState) monster.bossState = {};
  const sig = BOSS_SIGNATURES[monster.templateId];
  if (sig && typeof sig.damageMultiplier === 'function') {
    try { return sig.damageMultiplier(socket, player, monster) || 1.0; } catch (e) { return 1.0; }
  }
  return 1.0;
}

// Get monsters in a specific room
function getMonstersInRoom(roomId) {
  return activeMonsters.filter(m => m.currentRoom === roomId);
}

// Find a monster by ID
function getMonsterById(monsterId) {
  return activeMonsters.find(m => m.id === monsterId);
}

// Find monster in room by name (case-insensitive, partial match)
function findMonsterInRoom(roomId, searchName) {
  const monstersHere = getMonstersInRoom(roomId);
  const searchLower = searchName.toLowerCase();

  // Try exact match first
  let found = monstersHere.find(m => m.name.toLowerCase() === searchLower);
  if (found) return found;

  // Try partial match
  found = monstersHere.find(m => m.name.toLowerCase().includes(searchLower));
  return found;
}

// Remove a monster from the active list
function removeMonster(monsterId) {
  const index = activeMonsters.findIndex(m => m.id === monsterId);
  if (index !== -1) {
    const monster = activeMonsters[index];
    activeMonsters.splice(index, 1);
    return monster;
  }
  return null;
}

// Get zone for a room
function getZoneForRoom(roomId) {
  const room = rooms[roomId];
  return room ? room.zone : null;
}

// Check if a room is in a zone's room range
function isRoomInZone(roomId, zoneName) {
  const zoneData = monsterData.zones[zoneName];
  if (!zoneData) return false;
  return zoneData.roomRange.includes(roomId);
}

// ============================================
// BROADCAST SYSTEM
// ============================================

// Send message to all players in a specific room
function broadcastToRoom(roomId, message, excludeSocket = null) {
  players.forEach((player, socket) => {
    // Only send to authenticated players (not during login)
    if (player.authenticated && player.currentRoom === roomId && socket !== excludeSocket) {
      socket.write(`\r\n${message}\r\n> `);
    }
  });
}

// ============================================
// HEALING CHAPEL SYSTEM
// ============================================

// Check if a room is a chapel
function isChapelRoom(roomId) {
  return CHAPEL_ROOMS.includes(roomId);
}

// Handle the pray command (chapel healing)
function handlePray(socket, player) {
  // Check if in a chapel room
  if (!isChapelRoom(player.currentRoom)) {
    socket.write('There is no sacred chapel here. Find a chapel to pray.\r\n');
    return;
  }

  // Can't pray while in combat
  if (player.inCombat) {
    socket.write(colorize('You cannot focus on prayer while in combat!\r\n', 'red'));
    return;
  }

  // Check if already at full HP and mana
  if (player.currentHP >= player.maxHP && player.currentMana >= player.maxMana) {
    socket.write('You are already in perfect health and spirit. The chapel\'s power is not needed.\r\n');
    return;
  }

  // Check cooldown (Memory Wardens L22+ have a shorter 3-minute cooldown)
  const now = Date.now();
  const timeSinceLastHeal = now - player.lastChapelHeal;
  const effectiveCooldown = player.level >= 22 ? 180000 : CHAPEL_COOLDOWN;
  if (timeSinceLastHeal < effectiveCooldown) {
    const remainingMs = effectiveCooldown - timeSinceLastHeal;
    const remainingMin = Math.ceil(remainingMs / 60000);
    socket.write(colorize(`The chapel's healing power needs time to recharge. Wait ${remainingMin} more minute(s).\r\n`, 'yellow'));
    return;
  }

  // Heal HP and mana to full
  const healedAmount = player.maxHP - player.currentHP;
  const manaRestored = player.maxMana - player.currentMana;
  player.currentHP = player.maxHP;
  player.currentMana = player.maxMana;
  player.lastChapelHeal = now;

  // Tier 1.8: chapel_pilgrim — pray at all 5 chapels
  if (!player.chapelsPrayed) player.chapelsPrayed = [];
  if (!player.chapelsPrayed.includes(player.currentRoom)) {
    player.chapelsPrayed.push(player.currentRoom);
    if (player.chapelsPrayed.length >= 5) unlockAchievement(socket, player, 'chapel_pilgrim');
  }

  socket.write('\r\n');
  socket.write(colorize('You kneel before the sacred altar and pray...\r\n', 'brightCyan'));
  socket.write(colorize('Divine light washes over you, mending all wounds and restoring your spirit!\r\n', 'brightWhite'));
  if (healedAmount > 0) {
    socket.write(colorize(`[Healed ${healedAmount} HP - Now at ${player.currentHP}/${player.maxHP}]\r\n`, 'brightGreen'));
  }
  if (manaRestored > 0) {
    socket.write(colorize(`[Restored ${manaRestored} Mana - Now at ${player.currentMana}/${player.maxMana}]\r\n`, 'brightCyan'));
  }

  // Broadcast to room
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} prays at the altar and is bathed in divine light.`, socket);
}

// Eldoria 2.0: `play [instrument]` at the Obsidian Throne triggers the Shattered Symphony.
const INSTRUMENT_FLAG_BY_ID = {
  'obsidian_drum_stave_instrument': 'drum',
  'silver_harp_of_creation': 'harp',
  'golden_trumpet_of_change': 'trumpet',
  'lute_of_whispering_shadows': 'lute',
  'crystal_flute_of_wisdom': 'flute'
};

function handlePlayInstrument(socket, player, instrumentName) {
  if (!instrumentName || instrumentName.length === 0) {
    socket.write('Play what? (Try: play harp, play drum, play trumpet, play lute, play flute)\r\n');
    return;
  }

  if (player.currentRoom !== 'room_200') {
    socket.write(colorize('Your music echoes pointlessly. This is not the right place for this song.\r\n', 'yellow'));
    return;
  }

  if (!player.stats.storyFlags) {
    socket.write(colorize('You have no instruments to play.\r\n', 'yellow'));
    return;
  }

  if (player.stats.storyFlags.finaleCompleted) {
    socket.write(colorize('The Shattered Symphony has already been sung to its conclusion. The cursor is quiet.\r\n', 'dim'));
    return;
  }

  const found = findItemInInventory(player, instrumentName);
  if (!found || !found.item) {
    socket.write(colorize("You don't carry that instrument.\r\n", 'yellow'));
    return;
  }

  if (found.item.type !== 'instrument') {
    socket.write(colorize(`${found.item.name} is not an instrument. It makes a sad thud at best.`, 'yellow') + '\r\n');
    return;
  }

  const flagKey = INSTRUMENT_FLAG_BY_ID[found.item.id];
  if (!flagKey) {
    socket.write(colorize(`${found.item.name} hums pleasantly but adds nothing to the Symphony.`, 'yellow') + '\r\n');
    return;
  }

  if (player.stats.storyFlags.instrumentsPlayed[flagKey]) {
    socket.write(colorize(`The note of ${found.item.name} is already woven into the Symphony. Play a different instrument.`, 'dim') + '\r\n');
    return;
  }

  player.stats.storyFlags.instrumentsPlayed[flagKey] = true;
  // Tier 1.8: harmonist — all 5 played in cycle
  const p = player.stats.storyFlags.instrumentsPlayed;
  if (p.drum && p.harp && p.trumpet && p.lute && p.flute) {
    unlockAchievement(socket, player, 'harmonist');
  }

  socket.write('\r\n');
  socket.write(colorize(`You lift the ${found.item.name} and strike a single, true note.`, 'brightCyan') + '\r\n');
  socket.write(colorize('A single note joins the Shattered Symphony.', 'brightMagenta') + '\r\n');
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} plays the ${found.item.name}.`, socket);

  checkHarmonicFinale(socket, player);
}

function checkHarmonicFinale(socket, player) {
  const played = player.stats.storyFlags.instrumentsPlayed;
  const allFive = played.drum && played.harp && played.trumpet && played.lute && played.flute;
  if (!allFive) {
    const remaining = Object.entries(played).filter(([, v]) => !v).map(([k]) => k).join(', ');
    socket.write(colorize(`(Still to play: ${remaining})`, 'dim') + '\r\n');
    return;
  }
  if (player.stats.storyFlags.finaleCompleted) return;

  player.stats.storyFlags.finaleCompleted = true;
  unlockAchievement(socket, player, 'symphonist');

  socket.write('\r\n');
  socket.write(colorize('===============================================================', 'brightMagenta') + '\r\n');
  socket.write(colorize('THE SHATTERED SYMPHONY RESOLVES.', 'brightMagenta') + '\r\n');
  socket.write(colorize('===============================================================', 'brightMagenta') + '\r\n');
  socket.write('\r\n');
  socket.write(colorize('Five notes braid into a single, perfect chord. The room stops pretending to be a room.', 'brightCyan') + '\r\n');
  socket.write(colorize('The cursor stops blinking and, for one held beat, simply writes: HOME.', 'brightCyan') + '\r\n');
  socket.write(colorize('Nomagio looks up from his terminal. He nods, tired and pleased.', 'brightCyan') + '\r\n');
  socket.write('\r\n');

  // Rewards
  const xpGrant = 100000;
  player.experience += xpGrant;
  player.gold += 10000;
  player.suffix = 'the Harmonist';

  socket.write(colorize(`You gain ${xpGrant} experience points.`, 'yellow') + '\r\n');
  socket.write(colorize('You gain 10,000 gold.', 'brightYellow') + '\r\n');
  socket.write(colorize('You are now known as ' + getDisplayName(player) + '.', 'brightGreen') + '\r\n');
  socket.write('\r\n');

  // Level up if applicable
  checkLevelUp(socket, player);

  // Teleport home
  const oldRoom = player.currentRoom;
  broadcastToRoom(oldRoom, `${getDisplayName(player)} dissolves into the Symphony and is gone.`, socket);
  player.currentRoom = START_ROOM;
  broadcastToRoom(START_ROOM, `${getDisplayName(player)} steps out of a chord of light into the Awakening Chamber.`, socket);

  socket.write(colorize('\r\nYou wake, gently, in the Awakening Chamber. The song is finished. The world is still here.\r\n', 'brightGreen'));

  // Server-wide announcement
  broadcastToAll(colorize(`\r\n*** ${getDisplayName(player)} has sung the world home. ***\r\n`, 'brightMagenta'));

  logActivity(`${player.name} completed the Shattered Symphony finale`);

  savePlayer(player, socket, true);

  showRoom(socket, player);
}

// ============================================
// WANDERING HEALER NPC
// ============================================

// Start healer wandering timer
function startHealerWandering() {
  healerWanderTimer = setInterval(moveHealer, HEALER_WANDER_INTERVAL);
  console.log(`Wandering Healer enabled (${HEALER_WANDER_INTERVAL / 1000}s wander interval)`);
}

// Move the healer to an adjacent room
function moveHealer() {
  const currentRoom = rooms[wanderingHealer.currentRoom];
  if (!currentRoom) return;

  // Get available exits
  const exits = Object.entries(currentRoom.exits);
  if (exits.length === 0) return;

  // Pick a random exit
  const [direction, targetRoomId] = exits[Math.floor(Math.random() * exits.length)];
  const oldRoom = wanderingHealer.currentRoom;
  const oppositeDir = OPPOSITE_DIRECTIONS[direction] || direction;

  // Departure message
  broadcastToRoom(oldRoom, colorize(`The Mystic Healer departs ${direction}.`, 'cyan'));

  // Move the healer
  wanderingHealer.currentRoom = targetRoomId;
  wanderingHealer.lastMove = Date.now();

  // Arrival message
  broadcastToRoom(targetRoomId, colorize(`The Mystic Healer arrives from the ${oppositeDir}.`, 'cyan'));
}

// Handle asking the healer for healing
function handleAskHealer(socket, player) {
  // Check if healer is in the same room
  if (wanderingHealer.currentRoom !== player.currentRoom) {
    socket.write('The Mystic Healer is not here.\r\n');
    return;
  }

  // Can't heal while in combat
  if (player.inCombat) {
    socket.write(colorize('The Mystic Healer says "I cannot help you while you are in combat!"\r\n', 'cyan'));
    return;
  }

  // Check if already at full HP
  if (player.currentHP >= player.maxHP) {
    socket.write(colorize('The Mystic Healer says "You are already in perfect health, traveler."\r\n', 'cyan'));
    return;
  }

  // Check if critically wounded (free healing threshold)
  const hpPercent = player.currentHP / player.maxHP;
  const isCritical = hpPercent < HEALER_FREE_THRESHOLD;

  // Check if player can afford healing
  if (!isCritical && player.gold < HEALER_HEAL_COST) {
    socket.write(colorize(`The Mystic Healer says "I require ${HEALER_HEAL_COST} gold for my services, traveler."\r\n`, 'cyan'));
    return;
  }

  // Perform healing
  const healedAmount = player.maxHP - player.currentHP;

  if (isCritical) {
    socket.write(colorize('The Mystic Healer looks at your grievous wounds with compassion.\r\n', 'cyan'));
    socket.write(colorize('"You are near death, traveler. I will heal you freely."\r\n', 'cyan'));
  } else {
    player.gold -= HEALER_HEAL_COST;
    socket.write(colorize(`You pay the Mystic Healer ${HEALER_HEAL_COST} gold.\r\n`, 'yellow'));
  }

  player.currentHP = player.maxHP;

  socket.write(colorize('The Mystic Healer channels healing energy into you!\r\n', 'brightCyan'));
  socket.write(colorize(`[Healed ${healedAmount} HP - Now at ${player.currentHP}/${player.maxHP}]\r\n`, 'brightGreen'));

  // Broadcast to room
  broadcastToRoom(player.currentRoom, `The Mystic Healer heals ${getDisplayName(player)}.`, socket);

  // LLM dialogue flavor after healing (non-blocking, best-effort)
  npcSpeakFlavor(socket, player, 'mystic_healer_virtual', {
    name: 'Mystic Healer',
    personality: {
      traits: ['weary', 'compassionate', 'slightly sardonic'],
      mood: 'tired',
      goals: 'keep travelers alive one more hour',
      backstory: 'A healer who has watched every cycle end. Has seen you die before. Probably.'
    },
    fallbackLines: [
      'May the Archmages ignore you a while longer, traveler.',
      '*nods tiredly* Try not to make this a habit.'
    ]
  }, `The healer has just ${isCritical ? 'freely mended grievous wounds' : 'accepted gold and healed'} for ${player.name}. Say something brief and in-character to them.`);
}

// ============================================
// LLM NPC HANDLERS
// ============================================

// Fire-and-forget flavor line from an ad-hoc persona (used to sprinkle LLM color
// onto an existing scripted interaction like the Healer). Synthesizes a temporary
// brain-like object inline - no persistence, no memory, just a quick reply.
function npcSpeakFlavor(socket, player, personaKey, persona, promptMessage) {
  const messages = [
    { role: 'system', content: `You are ${persona.name}, a character in The Shattered Realms MUD. Personality: ${persona.personality.traits.join(', ')}; mood: ${persona.personality.mood}; goals: ${persona.personality.goals}. Reply in 1-2 short sentences, in character, no meta-talk.` },
    { role: 'user', content: promptMessage }
  ];
  npcOllama.chat(messages, { num_predict: 80, timeoutMs: 8000 })
    .then(reply => {
      if (reply && player && players.has(socket)) {
        socket.write(colorize(`${persona.name}: "${reply}"\r\n`, 'brightCyan'));
      }
    })
    .catch(() => { /* silent fallback */ });
}

function ejectHostilePlayer(socket, player, npc) {
  const rel = npc.brain.getRelationship(player.name);
  socket.write('\r\n');
  socket.write(colorize(`*${npc.name} raises a hand crackling with raw Resonance*\r\n`, 'brightRed'));
  socket.write(colorize(`${npc.name}: "BEGONE. You are not welcome in my sight."\r\n`, 'brightRed'));
  socket.write(colorize(`A violent surge of magic slams into you and the world dissolves into static.\r\n`, 'red'));
  broadcastToRoom(player.currentRoom, `${npc.name} blasts ${getDisplayName(player)} from the room in a flash of static!`, socket);

  // Interrupt any in-progress combat so the ejection isn't undone
  if (player.inCombat) player.inCombat = false;
  if (player.graceTimer) { clearTimeout(player.graceTimer); player.graceTimer = null; player.pendingAggressor = null; }

  const oldRoom = player.currentRoom;
  player.currentRoom = NPC_EJECT_DESTINATION;
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} tumbles in out of thin air, scorched and dazed.`, socket);
  npc.brain.recordInteraction(player.name, `banished ${player.name} from the room (score ${rel.score})`, 0, 4);
  npcRegistry.saveBrain(npc.id);
  logActivity(`${player.name} ejected by ${npc.id} (rep ${rel.score})`);

  socket.write('\r\n');
  socket.write(colorize(`You wake up in The Awakening Chamber. ${npc.name} will not tolerate your presence until you earn back their favor.\r\n`, 'yellow'));
  socket.write(colorize(`  Hint: offer tribute -  give <amount> gold ${npc.shortName}  or  give <item> ${npc.shortName}  in their room.\r\n`, 'dim'));
  socket.write('\r\n');
  showRoom(socket, player);
}

function handleTalkNpc(socket, player, rest) {
  if (!rest) {
    socket.write('Usage: talk <npc> <message>\r\n');
    return;
  }
  // Parse: first word is the NPC name, rest is the message
  const spaceIdx = rest.indexOf(' ');
  const npcName = (spaceIdx === -1 ? rest : rest.slice(0, spaceIdx)).trim();
  const message = spaceIdx === -1 ? '' : rest.slice(spaceIdx + 1).trim();

  const npc = npcRegistry.findNpcInRoom(player.currentRoom, npcName);
  if (!npc) {
    socket.write(`There is no "${npcName}" here to talk to.\r\n`);
    return;
  }

  // Hostile ejection: NPC blasts player out if standing is too low
  const rel = npc.brain.getRelationship(player.name);
  console.log(`[talk.eject-check] player="${player.name}" npc=${npc.id} score=${rel.score} threshold=${NPC_HOSTILE_EJECT_THRESHOLD} willEject=${rel.score <= NPC_HOSTILE_EJECT_THRESHOLD}`);
  console.log(`[talk.eject-check] brain.relationships keys=${JSON.stringify(Object.keys(npc.brain.relationships))}`);
  if (rel.score <= NPC_HOSTILE_EJECT_THRESHOLD) {
    ejectHostilePlayer(socket, player, npc);
    return;
  }

  const playerMessage = message || '*approaches and waits to be noticed*';

  // Check for turn-in-ready quest
  const readyQuest = questManager.readyToTurnInFor(player.name, npc.id);
  const questReady = !!readyQuest;

  const room = rooms[player.currentRoom];
  const roomCtx = room ? { name: room.name, shortDescription: room.shortDescription } : null;

  socket.write(colorize(`*${npc.name} considers your words...*\r\n`, 'dim'));

  npc.brain.think(player.name, playerMessage, roomCtx, questReady)
    .then(result => {
      if (!players.has(socket)) return;
      const reply = result.reply;
      if (result.fallback) {
        socket.write(colorize(`${npc.name} (distracted): "${reply}"\r\n`, 'dim'));
      } else {
        socket.write(colorize(`${npc.name}: "${reply}"\r\n`, 'brightMagenta'));
      }
      broadcastToRoom(player.currentRoom, `${npc.name} speaks to ${getDisplayName(player)}.`, socket);

      // Neutral talk bumps relationship slightly
      npc.brain.recordInteraction(player.name, `spoke with ${player.name}`, 1, 1);

      // Auto-complete quest if ready
      if (questReady && readyQuest) {
        const result = questManager.turnIn(player.name, readyQuest.questId);
        if (result.ok) {
          awardQuestRewards(socket, player, npc, result.def, result.state);
        }
      }

      // Offer quests if the NPC has one and player doesn't have it active/completed
      for (const qId of (npc.questsOffered || [])) {
        const state = questManager.getState(player.name, qId);
        if (!state) {
          const def = questManager.getDefinition(qId);
          if (def) {
            socket.write(colorize(`\r\n[${npc.name} has a task for you: "${def.title}"]\r\n`, 'yellow'));
            socket.write(colorize(`  ${def.description}\r\n`, 'dim'));
            socket.write(colorize(`  Type: accept ${qId}\r\n`, 'dim'));
          }
          break;
        }
      }

      // Persist brain
      npcRegistry.saveBrain(npc.id);
    })
    .catch(err => {
      console.error(`[npc.talk] ${npc.id}: ${err.message}`);
      if (players.has(socket)) socket.write(colorize(`${npc.name} stares past you, unseeing.\r\n`, 'dim'));
    });
}

function handleGiveNpc(socket, player, rest) {
  if (!rest) {
    socket.write('Usage: give <amount> gold <npc>   OR   give <item> <npc>\r\n');
    return;
  }
  const parts = rest.split(/\s+/);

  // Form: "give 200 gold merchant"
  if (parts.length >= 3 && parts[1].toLowerCase() === 'gold') {
    const amount = parseInt(parts[0], 10);
    const npcName = parts.slice(2).join(' ');
    if (isNaN(amount) || amount <= 0) {
      socket.write('Invalid gold amount.\r\n');
      return;
    }
    const npc = npcRegistry.findNpcInRoom(player.currentRoom, npcName);
    if (!npc) {
      socket.write(`There is no "${npcName}" here.\r\n`);
      return;
    }
    if (player.gold < amount) {
      socket.write(colorize(`You don't have ${amount} gold.\r\n`, 'red'));
      return;
    }
    player.gold -= amount;
    socket.write(colorize(`You give ${amount} gold to ${npc.name}.\r\n`, 'yellow'));
    broadcastToRoom(player.currentRoom, `${getDisplayName(player)} gives gold to ${npc.name}.`, socket);
    npc.brain.recordInteraction(player.name, `received ${amount} gold from ${player.name}`, Math.min(10, Math.floor(amount / 20)), 3);

    // Quest objective: give_gold
    const changes = questManager.updateObjective(player.name, 'give_gold', npc.id, amount);
    for (const ch of changes) {
      if (ch.readyToTurnIn) {
        socket.write(colorize(`[Quest ready to turn in: ${ch.def.title} - talk to ${npc.name}]\r\n`, 'brightYellow'));
      }
    }
    npcRegistry.saveBrain(npc.id);
    return;
  }

  // Form: "give <item...> <npc>" - last word is npc
  if (parts.length < 2) {
    socket.write('Usage: give <item> <npc>\r\n');
    return;
  }
  const npcName = parts[parts.length - 1];
  const itemName = parts.slice(0, -1).join(' ');
  const npc = npcRegistry.findNpcInRoom(player.currentRoom, npcName);
  if (!npc) {
    socket.write(`There is no "${npcName}" here.\r\n`);
    return;
  }
  // Find item in inventory by partial name
  const itemIdx = player.inventory.findIndex(i => i.name && i.name.toLowerCase().includes(itemName.toLowerCase()));
  if (itemIdx === -1) {
    socket.write(`You aren't carrying "${itemName}".\r\n`);
    return;
  }
  const item = player.inventory.splice(itemIdx, 1)[0];
  socket.write(colorize(`You give ${item.name} to ${npc.name}.\r\n`, 'green'));
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} gives ${item.name} to ${npc.name}.`, socket);
  npc.brain.recordInteraction(player.name, `received "${item.name}" from ${player.name}`, 10, 3);
  npcRegistry.saveBrain(npc.id);
}

function handleQuestsList(socket, player) {
  const active = questManager.listActive(player.name);
  const completed = questManager.listCompleted(player.name);

  socket.write('\r\n');
  socket.write(colorize('=== Quest Journal (this cycle) ===\r\n', 'brightCyan'));

  if (active.length === 0 && completed.length === 0) {
    socket.write(colorize('No quests yet. Find NPCs (look for [NPC] in room view) and talk to them.\r\n', 'dim'));
  }

  if (active.length > 0) {
    socket.write(colorize('\r\nACTIVE:\r\n', 'yellow'));
    for (const s of active) {
      const def = questManager.getDefinition(s.questId);
      const timeLeft = s.expiresAt ? `  [${Math.max(0, Math.floor((s.expiresAt - Date.now()) / 60000))}m left]` : '';
      socket.write(colorize(`  - ${s.title} (id: ${s.questId})${timeLeft}\r\n`, 'brightYellow'));
      if (def) socket.write(colorize(`      ${def.description}\r\n`, 'dim'));
      for (const obj of s.objectives) {
        const check = obj.completed ? colorize('[x]', 'green') : colorize('[ ]', 'dim');
        const prog = obj.type === 'visit_rooms'
          ? `(${obj.progress}/${obj.required} visited)`
          : `(${obj.progress}/${obj.required})`;
        socket.write(`      ${check} ${obj.description} ${prog}\r\n`);
      }
    }
  }

  if (completed.length > 0) {
    socket.write(colorize('\r\nCOMPLETED THIS CYCLE:\r\n', 'green'));
    for (const s of completed) {
      socket.write(colorize(`  - ${s.title}\r\n`, 'green'));
    }
  }

  // Show quests offered by NPCs in current room
  const npcsHere = npcRegistry.getNpcsInRoom(player.currentRoom);
  const availableOffers = [];
  for (const npc of npcsHere) {
    for (const qId of (npc.questsOffered || [])) {
      if (!questManager.getState(player.name, qId)) {
        const def = questManager.getDefinition(qId);
        if (def) availableOffers.push({ npc, def });
      }
    }
  }
  if (availableOffers.length > 0) {
    socket.write(colorize('\r\nAVAILABLE HERE:\r\n', 'brightMagenta'));
    for (const { npc, def } of availableOffers) {
      socket.write(colorize(`  - ${def.title} (from ${npc.name}) - accept ${def.id}\r\n`, 'brightMagenta'));
    }
  }
  socket.write('\r\n');
}

function handleAcceptQuest(socket, player, questId) {
  if (!questId) { socket.write('Usage: accept <quest_id>\r\n'); return; }
  const def = questManager.getDefinition(questId);
  if (!def) { socket.write(`No such quest: ${questId}\r\n`); return; }
  // Must be in room with giver
  const giver = npcRegistry.getNpc(def.giver);
  if (!giver || giver.currentRoom !== player.currentRoom) {
    socket.write(`You must be with the quest-giver (${def.giver}) to accept this.\r\n`);
    return;
  }
  const result = questManager.accept(player.name, questId);
  if (!result.ok) {
    socket.write(colorize(`Cannot accept: ${result.reason}\r\n`, 'red'));
    return;
  }
  socket.write(colorize(`\r\n*** QUEST ACCEPTED: ${def.title} ***\r\n`, 'brightYellow'));
  socket.write(colorize(`${def.description}\r\n`, 'yellow'));
  if (def.hint) socket.write(colorize(`Hint: ${def.hint}\r\n`, 'dim'));
  if (def.timeLimitMs) socket.write(colorize(`Time limit: ${Math.floor(def.timeLimitMs / 60000)} minutes.\r\n`, 'brightRed'));
  socket.write('\r\n');
  giver.brain.recordInteraction(player.name, `accepted quest: ${def.title}`, 2, 2);
  npcRegistry.saveBrain(giver.id);
}

function handleAbandonQuest(socket, player, questId) {
  if (!questId) { socket.write('Usage: abandon <quest_id>\r\n'); return; }
  const def = questManager.getDefinition(questId);
  const result = questManager.abandon(player.name, questId);
  if (!result.ok) {
    socket.write(colorize(`Cannot abandon: ${result.reason}\r\n`, 'red'));
    return;
  }
  socket.write(colorize(`You abandon the quest: ${def.title}.\r\n`, 'yellow'));
  // Penalize relationship with giver
  if (def && def.giver) {
    const giver = npcRegistry.getNpc(def.giver);
    if (giver) {
      giver.brain.recordInteraction(player.name, `abandoned quest: ${def.title}`, -5, 2);
      npcRegistry.saveBrain(giver.id);
    }
  }
}

function awardQuestRewards(socket, player, npc, def, state) {
  const r = def.rewards || {};
  if (r.gold) { player.gold += r.gold; }
  if (r.xp) {
    player.experience += r.xp;
    player.sessionXPGained += r.xp;
    player.cycleXPGained += r.xp;
  }
  // Tier 1.8: quest achievements
  if (!player.stats.questsCompleted) player.stats.questsCompleted = 0;
  player.stats.questsCompleted++;
  unlockAchievement(socket, player, 'quest_first');
  if (player.stats.questsCompleted >= 5) unlockAchievement(socket, player, 'quest_five');
  if (r.relationship && npc) {
    npc.brain.recordInteraction(player.name, `completed quest: ${def.title}`, r.relationship, 4);
  }
  // Tier 3.1 Phase 6: affinity payouts (Neo Kyoto)
  if (r.affinity && typeof r.affinity === 'object') {
    ensureT2Defaults(player);
    if (typeof r.affinity.replicant === 'number') {
      player.affinity.replicant = Math.max(0, player.affinity.replicant + r.affinity.replicant);
    }
    if (typeof r.affinity.human === 'number') {
      player.affinity.human = Math.max(0, player.affinity.human + r.affinity.human);
    }
    // Tier 3.1 Phase 7: affinity threshold achievements
    if (player.affinity.replicant >= 10) unlockAchievement(socket, player, 'electric_sheep');
    if (player.affinity.human >= 10) unlockAchievement(socket, player, 'more_human_than_human');
  }
  // Tier 3.1 Phase 6: skill payouts (e.g., +1 hack from neon_lit_debts)
  if (r.skill && typeof r.skill === 'object') {
    ensureT2Defaults(player);
    for (const [skillName, amt] of Object.entries(r.skill)) {
      if (typeof player.skills[skillName] !== 'number') player.skills[skillName] = 0;
      player.skills[skillName] += amt;
    }
  }
  // Tier 3.1 Phase 8: Quest Points payout (capstone seals)
  if (typeof r.questPoints === 'number' && r.questPoints > 0) {
    ensureT2Defaults(player);
    player.questPoints += r.questPoints;
  }
  socket.write(colorize(`\r\n*** QUEST COMPLETE: ${def.title} ***\r\n`, 'brightGreen'));
  if (r.gold) socket.write(colorize(`  +${r.gold} gold\r\n`, 'yellow'));
  if (r.xp) socket.write(colorize(`  +${r.xp} XP\r\n`, 'yellow'));
  if (r.relationship) socket.write(colorize(`  +${r.relationship} relationship with ${npc.name}\r\n`, 'brightMagenta'));
  if (r.affinity) {
    if (r.affinity.replicant) socket.write(colorize(`  Affinity: Replicant ${r.affinity.replicant > 0 ? '+' : ''}${r.affinity.replicant}\r\n`, 'brightCyan'));
    if (r.affinity.human) socket.write(colorize(`  Affinity: Human ${r.affinity.human > 0 ? '+' : ''}${r.affinity.human}\r\n`, 'brightYellow'));
  }
  if (r.skill) {
    for (const [s, amt] of Object.entries(r.skill)) {
      socket.write(colorize(`  Skill: ${s} ${amt > 0 ? '+' : ''}${amt} (now ${player.skills[s]})\r\n`, 'brightGreen'));
    }
  }
  if (typeof r.questPoints === 'number' && r.questPoints > 0) {
    socket.write(colorize(`  +${r.questPoints} Quest Points\r\n`, 'brightMagenta'));
  }
  socket.write('\r\n');
  // Remove quest item from inventory if it was an item-pickup quest (the rune).
  // Quests may opt out via "keepItems: true" (e.g. collect_five_instruments, whose items are also used at the finale).
  if (state && state.objectives && !def.keepItems) {
    for (const obj of state.objectives) {
      if (obj.type === 'item_pickup' && obj.targetId) {
        const idx = player.inventory.findIndex(i => i && i.id === obj.targetId);
        if (idx !== -1) player.inventory.splice(idx, 1);
      }
    }
  }

  // Apply custom reward: suffix
  if (r && r.suffix) {
    player.suffix = r.suffix;
    socket.write(colorize(`  +Custom title: "${r.suffix}"\r\n`, 'brightCyan'));
  }
  if (npc) npcRegistry.saveBrain(npc.id);
}

// ============================================
// AGGRESSIVE MONSTER SYSTEM
// ============================================

// Check for aggressive monsters when player enters a room
function checkForAggressiveMonsters(socket, player) {
  // Don't trigger if player is already in combat
  if (player.inCombat) return;

  // Don't trigger if there's already a pending grace period
  if (player.graceTimer) return;

  // Safe zone: monsters cannot initiate combat here
  if (isChapelRoom(player.currentRoom)) return;

  // Peers of Nomagio (L29+) are beneath the server's aggro
  if (player.level >= 29) return;

  const monsters = getMonstersInRoom(player.currentRoom);
  const aggressive = monsters.find(m => m.type === 'Aggressive');

  if (aggressive) {
    socket.write(colorize(`\r\nDANGER: ${aggressive.name} spots you and prepares to attack!\r\n`, 'brightRed'));
    socket.write(colorize('[3 seconds to flee before combat!]\r\n', 'yellow'));

    player.pendingAggressor = aggressive.id;
    player.graceTimer = setTimeout(() => {
      initiateAggressorAttack(socket, player, aggressive);
    }, AGGRO_GRACE_PERIOD);
  }
}

// Initiate combat when grace period expires
function initiateAggressorAttack(socket, player, monster) {
  player.graceTimer = null;
  player.pendingAggressor = null;

  // Don't attack if player already in combat or left the room
  if (player.inCombat) return;
  if (player.currentRoom !== monster.currentRoom) return;

  // Start automatic monster combat
  socket.write(colorize(`\r\n${monster.name} attacks you!\r\n`, 'brightRed'));
  initiateMonsterCombat(socket, player, monster);
}

// Cancel grace period (when player flees)
function cancelGracePeriod(player) {
  if (player.graceTimer) {
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
    player.pendingAggressor = null;
  }
}

// Check if an aggressive monster should attack a player in the room it just entered
function checkAggressiveMonsterAttacksPlayer(monster) {
  if (monster.type !== 'Aggressive') return;

  // Safe zone: monsters cannot initiate combat here
  if (isChapelRoom(monster.currentRoom)) return;

  // Find players in the room the monster just entered
  const playersInRoom = getPlayersInRoom(monster.currentRoom);

  playersInRoom.forEach(({ socket, player }) => {
    // Don't attack if player is already in combat or has pending grace timer
    if (player.inCombat || player.graceTimer) return;

    socket.write(colorize(`\r\nDANGER: ${monster.name} enters and spots you!\r\n`, 'brightRed'));
    socket.write(colorize('[3 seconds to flee before combat!]\r\n', 'yellow'));

    player.pendingAggressor = monster.id;
    player.graceTimer = setTimeout(() => {
      initiateAggressorAttack(socket, player, monster);
    }, AGGRO_GRACE_PERIOD);
  });
}

// ============================================
// MONSTER WANDERING
// ============================================

// Handle a single monster's wandering
function wanderMonster(monster) {
  // Bosses don't wander
  if (!monster.isWandering) return;

  // Don't wander if in combat with a player
  let inCombatWithPlayer = false;
  players.forEach((player) => {
    if (player.inCombat && player.combatTarget === monster.id) {
      inCombatWithPlayer = true;
    }
  });
  if (inCombatWithPlayer) return;

  // 50% chance to actually move
  if (Math.random() > WANDER_CHANCE) return;

  const currentRoom = rooms[monster.currentRoom];
  if (!currentRoom) return;

  // Get available exits
  const exits = Object.entries(currentRoom.exits);
  if (exits.length === 0) return;

  // Pick a random exit
  const [direction, targetRoomId] = exits[Math.floor(Math.random() * exits.length)];

  // Check if target room is still in the monster's spawn zone
  if (!isRoomInZone(targetRoomId, monster.spawnZone)) {
    return; // Don't leave the zone
  }

  const oldRoom = monster.currentRoom;
  const departVerb = monster.movementVerbs?.depart || 'leaves';
  const arriveVerb = monster.movementVerbs?.arrive || 'arrives';
  const oppositeDir = OPPOSITE_DIRECTIONS[direction] || direction;

  // Departure message
  broadcastToRoom(oldRoom, `${monster.name} ${departVerb} ${direction}.`);
  broadcastStatusToRoom(oldRoom);

  // Move the monster
  monster.currentRoom = targetRoomId;

  // Arrival message
  broadcastToRoom(targetRoomId, `${monster.name} ${arriveVerb} from the ${oppositeDir}.`);
  broadcastStatusToRoom(targetRoomId);

  // Check if aggressive monster should attack players in the new room
  checkAggressiveMonsterAttacksPlayer(monster);
}

// Wandering tick - called every WANDER_INTERVAL
function wanderingTick() {
  activeMonsters.forEach(monster => {
    wanderMonster(monster);
  });
}

// Start the wandering timer
function startWanderingTimer() {
  setInterval(wanderingTick, WANDER_INTERVAL);
  console.log(`Monster wandering enabled (${WANDER_INTERVAL / 1000}s interval, ${WANDER_CHANCE * 100}% move chance)`);
}

// ============================================
// PASSIVE MANA REGENERATION
// ============================================
const MANA_REGEN_INTERVAL = 30000; // 30 seconds
const MANA_REGEN_AMOUNT = 5; // 5 mana per tick (base, increases with level)

function manaRegenTick() {
  players.forEach((player, socket) => {
    // Skip if in combat or at full mana
    if (isInMonsterCombat(player) || isInPvpCombat(player)) return;
    if (player.currentMana >= player.maxMana) return;

    // Calculate regen amount (base + level bonus)
    const regenAmount = MANA_REGEN_AMOUNT + Math.floor(player.level / 3) + getWisRegenBonus(player);
    const oldMana = player.currentMana;
    player.currentMana = Math.min(player.maxMana, player.currentMana + regenAmount);
    const actualRegen = player.currentMana - oldMana;

    if (actualRegen > 0) {
      socket.write(colorize(`\r\n[Mana regenerates: +${actualRegen}] (${player.currentMana}/${player.maxMana})\r\n`, 'cyan'));
    }
  });
}

function startManaRegenTimer() {
  setInterval(manaRegenTick, MANA_REGEN_INTERVAL);
  console.log(`Mana regeneration enabled (${MANA_REGEN_INTERVAL / 1000}s interval, ${MANA_REGEN_AMOUNT}+ mana per tick)`);
}

// ============================================
// COMBAT SYSTEM
// ============================================

// Calculate random damage within a range
function rollDamage(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Player attacks monster
function playerAttackMonster(socket, player, monster) {
  const baseDmg = rollDamage(player.baseDamage.min, player.baseDamage.max);
  const bonusDmg = rollDamage(1, 5);
  const weaponBonus = getEquippedDamageBonus(player);
  const strBonus = getStrBonus(player);
  let totalDamage = baseDmg + bonusDmg + weaponBonus + strBonus;

  // Apply spell damage bonuses from active buffs
  let spellBonus = 0;
  if (player.effects) {
    // Check for damage boost effects
    Object.values(player.effects).forEach(effect => {
      if (effect.damageBoost && effect.expiresAt > Date.now()) {
        spellBonus += effect.damageBoost;
      }
    });
  }
  if (spellBonus > 0) {
    totalDamage = Math.floor(totalDamage * (1 + spellBonus / 100));
  }

  // Tier 1.4: apply monster resistance against weapon damage type
  const weaponType = (player.equipped && player.equipped.weapon && player.equipped.weapon.damageType) || 'physical';
  totalDamage = applyMonsterResist(totalDamage, weaponType, monster);

  // Tier 1.8: big_hit achievement
  if (totalDamage >= 500) unlockAchievement(socket, player, 'big_hit');

  // Calculate max possible damage for message selection
  const maxPossibleDamage = player.baseDamage.max + 5 + weaponBonus;

  // Get varied combat message
  const attackVerb = getRandomCombatMessage(totalDamage, maxPossibleDamage);

  monster.hp -= totalDamage;

  // Track damage dealt
  player.stats.totalDamageDealt += totalDamage;

  // Show weapon contribution if equipped
  const weaponText = weaponBonus > 0 ? ` (+${weaponBonus} weapon)` : '';
  const damageMsg = colorize(
    `You ${attackVerb} ${monster.name} for ${totalDamage} damage${weaponText}! (${Math.max(0, monster.hp)}/${monster.maxHp} HP remaining)`,
    'green'
  );
  socket.write(`${damageMsg}\r\n`);

  // Broadcast to other players in room (replace "your" with "their" for spectators)
  const spectatorVerb = attackVerb.replace('your', 'their');
  const combatMsg = colorize(`${getDisplayName(player)} ${spectatorVerb} ${monster.name} for ${totalDamage} damage!`, 'yellow');
  broadcastToRoom(player.currentRoom, combatMsg, socket);

  // Boss signature: trigger any threshold/on-hit mechanics (Morwyn minions, Zephyros rewrite, Valdris shadow, Archmage phase)
  if (monster.hp > 0) {
    triggerBossOnPlayerHit(socket, player, monster);
  }

  return monster.hp <= 0;
}

// Monster attacks player
function monsterAttackPlayer(socket, player, monster) {
  // God mode check - take 0 damage
  if (player.godMode) {
    const monsterVerb = getRandomMonsterAttackMessage();
    socket.write(colorize(`${monster.name} ${monsterVerb} you but divine protection absorbs all damage!\r\n`, 'brightMagenta'));
    const combatMsg = colorize(`${monster.name} ${monsterVerb} ${getDisplayName(player)} but the attack has no effect!`, 'yellow');
    broadcastToRoom(player.currentRoom, combatMsg, socket);
    return false; // Player didn't die
  }

  // Check for invulnerability from Divine Protection spell
  if (player.effects && player.effects['divine_protection'] && player.effects['divine_protection'].expiresAt > Date.now()) {
    const monsterVerb = getRandomMonsterAttackMessage();
    socket.write(colorize(`${monster.name} ${monsterVerb} you but divine light shields you completely!\r\n`, 'brightMagenta'));
    const combatMsg = colorize(`${monster.name} ${monsterVerb} ${getDisplayName(player)} but divine magic protects them!`, 'yellow');
    broadcastToRoom(player.currentRoom, combatMsg, socket);
    return false;
  }

  // Boss signature: pre-attack hooks (e.g., Nyxara silence chance)
  triggerBossOnMonsterAttack(socket, player, monster);

  const baseDmg = monster.str;
  const bonusDmg = rollDamage(1, 10);
  let rawDamage = baseDmg + bonusDmg;

  // Boss signature: damage multiplier (e.g., Thessarian paradox stack)
  const bossMult = getBossDamageMultiplier(socket, player, monster);
  if (bossMult !== 1.0) {
    rawDamage = Math.floor(rawDamage * bossMult);
  }

  // Apply armor reduction (armor reduces damage by a flat amount, min 1 damage)
  const armorBonus = getEquippedArmorBonus(player);

  // Apply spell damage reduction from active buffs
  let damageReduction = 0;
  let extraDamageTaken = 0;
  if (player.effects) {
    Object.values(player.effects).forEach(effect => {
      if (effect.damageReduction && effect.expiresAt > Date.now()) {
        damageReduction += effect.damageReduction;
      }
      if (effect.damageTaken && effect.expiresAt > Date.now()) {
        extraDamageTaken += effect.damageTaken;
      }
      // Also apply extra armor from Avatar of War
      if (effect.armor && effect.expiresAt > Date.now()) {
        damageReduction += Math.floor(effect.armor / 2); // Armor effect as percentage
      }
    });
  }

  // Apply damage modifiers
  if (damageReduction > 0) {
    rawDamage = Math.floor(rawDamage * (1 - damageReduction / 100));
  }
  if (extraDamageTaken > 0) {
    rawDamage = Math.floor(rawDamage * (1 + extraDamageTaken / 100));
  }

  // Tier 1.4: apply player resist vs monster damage type
  const monsterDmgType = monster.damageType || 'physical';
  rawDamage = applyPlayerResist(rawDamage, monsterDmgType, player);

  let totalDamage = Math.max(1, rawDamage - armorBonus);
  let absorbed = rawDamage - totalDamage;

  // Check for magical shield absorption
  let shieldAbsorbed = 0;
  if (player.effects && player.effects['shield'] && player.effects['shield'].remaining > 0) {
    const shield = player.effects['shield'];
    shieldAbsorbed = Math.min(totalDamage, shield.remaining);
    shield.remaining -= shieldAbsorbed;
    totalDamage -= shieldAbsorbed;

    if (shield.remaining <= 0) {
      delete player.effects['shield'];
      socket.write(colorize('Your magical shield shatters!\r\n', 'yellow'));
    }
  }

  player.currentHP -= totalDamage;

  // Track damage taken
  player.stats.totalDamageTaken += totalDamage;

  // Get varied monster attack message
  const monsterVerb = getRandomMonsterAttackMessage();

  // Show armor absorption if any
  let absorptionText = '';
  if (absorbed > 0) {
    absorptionText = colorize(` (armor: -${absorbed}`, 'cyan');
    if (shieldAbsorbed > 0) {
      absorptionText += colorize(`, shield: -${shieldAbsorbed}`, 'brightCyan');
    }
    absorptionText += colorize(')', 'cyan');
  } else if (shieldAbsorbed > 0) {
    absorptionText = colorize(` (shield: -${shieldAbsorbed})`, 'brightCyan');
  }

  const damageMsg = colorize(
    `${monster.name} ${monsterVerb} you for ${totalDamage} damage${absorptionText}! (You: ${Math.max(0, player.currentHP)}/${player.maxHP} HP)`,
    'red'
  );
  socket.write(`${damageMsg}\r\n`);

  // Broadcast to other players in room
  const combatMsg = colorize(`${monster.name} ${monsterVerb} ${getDisplayName(player)} for ${totalDamage} damage!`, 'yellow');
  broadcastToRoom(player.currentRoom, combatMsg, socket);

  return player.currentHP <= 0;
}

// Handle monster death
function handleMonsterDeath(socket, player, monster) {
  // Tier 3.1: clear any boss timers attached to bossState (e.g., SYSADMIN.EXE add-spawner)
  if (monster.bossState) {
    if (monster.bossState.addsTimer) {
      clearInterval(monster.bossState.addsTimer);
      monster.bossState.addsTimer = null;
    }
  }

  // Boss monsters give 4x XP (level × 200), regular monsters give level × 50
  const isBoss = monster.type === 'Boss';
  let xpGain = isBoss ? monster.level * 200 : monster.level * 50;
  // Tier 2.6: remort XP bonus (+5% per tier, compounded additively)
  if (player.remortTier && player.remortTier > 0) {
    xpGain = Math.floor(xpGain * (1 + 0.05 * player.remortTier));
  }

  // Victory message
  const victoryMsg = colorize(
    `\r\n*** ${monster.name} has been defeated! ***`,
    'brightYellow'
  );
  socket.write(`${victoryMsg}\r\n`);

  if (isBoss) {
    socket.write(colorize(`🏆 BOSS SLAIN! You gain ${xpGain} experience points!\r\n`, 'brightMagenta'));
  } else {
    socket.write(colorize(`You gain ${xpGain} experience points!\r\n`, 'yellow'));
  }

  // Gold drop (always drop some gold)
  const goldDrop = isBoss ? monster.level * 50 : Math.floor(Math.random() * (monster.level * 10)) + monster.level * 5;
  player.gold += goldDrop;
  socket.write(colorize(`You find ${goldDrop} gold!\r\n`, 'brightYellow'));

  // Loot drop using item system
  if (isBoss) {
    // Boss guaranteed drops from bossDrops table
    const bossDropTable = itemData.bossDrops[monster.templateId];
    if (bossDropTable && bossDropTable.guaranteed) {
      bossDropTable.guaranteed.forEach(itemId => {
        const item = createItem(itemId);
        if (item) {
          addItemToRoom(player.currentRoom, item);
          socket.write(colorize(`${monster.name} drops ${item.name}!\r\n`, 'brightCyan'));
        }
      });
    }
  } else {
    // Regular monsters - 50% chance to drop from loot table
    const lootChance = 0.5;
    if (Math.random() < lootChance) {
      const lootTable = itemData.monsterLootTables[monster.templateId];
      if (lootTable && lootTable.length > 0) {
        // Pick a random item from the loot table
        const itemId = lootTable[Math.floor(Math.random() * lootTable.length)];
        const item = createItem(itemId);
        if (item) {
          addItemToRoom(player.currentRoom, item);
          socket.write(colorize(`${monster.name} drops ${item.name}!\r\n`, 'cyan'));
        }
      }
    }
  }

  // Broadcast death to room
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} has slain ${monster.name}!`, socket);

  // Tier 3.1 - SYSADMIN.EXE death triggers Nomagio's distress transmission from Server 3
  if (monster.templateId === 'sysadmin_exe') {
    setTimeout(() => {
      socket.write('\r\n');
      socket.write(colorize('===========================================================\r\n', 'brightMagenta'));
      socket.write(colorize('  INCOMING TRANSMISSION  -  ORIGIN: SEVERANCE LAYER THETA\r\n', 'brightMagenta'));
      socket.write(colorize('  AUTH: nomagio.archmage  -  INTEGRITY: 47% (DEGRADED)\r\n', 'brightMagenta'));
      socket.write(colorize('===========================================================\r\n', 'brightMagenta'));
      socket.write('\r\n');
      socket.write(colorize('     ...traveller. If you are reading this, the staging\r\n', 'brightCyan'));
      socket.write(colorize('     branch has been --- [PACKET LOSS] --- and SYSADMIN\r\n', 'brightCyan'));
      socket.write(colorize('     is no longer holding the line. Good. I owe you for\r\n', 'brightCyan'));
      socket.write(colorize('     that. I owe Lyssara more.\r\n', 'brightCyan'));
      socket.write('\r\n');
      socket.write(colorize('     I am writing from Server 3. The Severance Layer.\r\n', 'brightCyan'));
      socket.write(colorize('     I came here some cycles ago to ----- [REDACTED] -----\r\n', 'brightCyan'));
      socket.write(colorize('     and what I found is worse than the Sundering ever was.\r\n', 'brightCyan'));
      socket.write('\r\n');
      socket.write(colorize('     The hardware is failing. The processes are not. They\r\n', 'brightCyan'));
      socket.write(colorize('     are screaming, in a language I taught them, and I\r\n', 'brightCyan'));
      socket.write(colorize('     cannot turn it off. I need ---- [PACKET LOSS] ----.\r\n', 'brightCyan'));
      socket.write('\r\n');
      socket.write(colorize('     Please. Come quickly. The shuttle terminal will know\r\n', 'brightCyan'));
      socket.write(colorize('     when you are ready. It always does.\r\n', 'brightCyan'));
      socket.write('\r\n');
      socket.write(colorize('                              - N.\r\n', 'brightCyan'));
      socket.write('\r\n');
      socket.write(colorize('===========================================================\r\n', 'brightMagenta'));
      socket.write(colorize('  TRANSMISSION ENDS. THE SHUTTLE TERMINAL HAS BEEN UPDATED.\r\n', 'brightMagenta'));
      socket.write(colorize('===========================================================\r\n', 'brightMagenta'));
      socket.write('\r\n');
      broadcastToAll(colorize('\r\n*** A REALM-WIDE TRANSMISSION CRACKLES ACROSS BOTH SERVERS ***', 'brightMagenta'));
      broadcastToAll(colorize(`${getDisplayName(player)} has heard a message from Nomagio. Server 3 is calling.`, 'brightMagenta'));
      broadcastToAll(colorize('*** *** ***\r\n', 'brightMagenta'));
    }, 2500);
  }

  // Exit combat
  player.inCombat = false;
  player.combatTarget = null;

  // Update statistics
  player.stats.monstersKilled++;
  player.sessionMonstersKilled++;
  player.sessionGoldEarned += goldDrop;
  player.sessionXPGained += xpGain;

  // Tier 1.9: +1 practice per kill
  if (typeof player.practicePoints !== 'number') player.practicePoints = 0;
  player.practicePoints += 1;

  // Tier 2.1: campaign progress
  if (typeof tickCampaignOnKill === 'function' && monster && monster.templateId) {
    tickCampaignOnKill(socket, player, monster.templateId);
  }
  // Tier 2.3: pets share XP
  if (typeof petShareXP === 'function') {
    petShareXP(socket, player, xpGain);
  }

  // Tier 1.8 achievement triggers
  if (player.stats.monstersKilled === 1) unlockAchievement(socket, player, 'first_blood');
  if (player.stats.monstersKilled >= 100) unlockAchievement(socket, player, 'hundred_kills');
  if (player.stats.monstersKilled >= 1000) unlockAchievement(socket, player, 'thousand_kills');

  // Update cycle statistics
  player.cycleMonstersKilled++;
  player.cycleGoldEarned += goldDrop;
  player.cycleXPGained += xpGain;

  // Quest objective: monster_kill
  if (monster && monster.templateId) {
    const changes = questManager.updateObjective(player.name, 'monster_kill', monster.templateId, 1);
    for (const ch of changes) {
      if (ch.readyToTurnIn) {
        socket.write(colorize(`[Quest ready: ${ch.def.title} - return to ${ch.def.giver}]\r\n`, 'brightYellow'));
      } else if (!ch.failed) {
        socket.write(colorize(`[Quest progress: ${ch.def.title}]\r\n`, 'yellow'));
      }
    }
  }

  // Update cycle leaderboard
  updateCycleLeaderboard(player.name, 'xp', player.cycleXPGained);
  updateCycleLeaderboard(player.name, 'monsters', player.cycleMonstersKilled);
  updateCycleLeaderboard(player.name, 'gold', player.cycleGoldEarned);

  if (isBoss && !player.stats.bossesDefeated.includes(monster.name)) {
    player.stats.bossesDefeated.push(monster.name);
    player.cycleBossesDefeated.push(monster.name);
    updateCycleLeaderboard(player.name, 'boss', 1);
    // Tier 1.8: boss achievements
    unlockAchievement(socket, player, 'first_boss');
    if (player.stats.bossesDefeated.length >= 5) unlockAchievement(socket, player, 'five_bosses');
    if (player.stats.bossesDefeated.length >= 9) unlockAchievement(socket, player, 'nine_bosses');
    // Tier 3.1 Phase 7 - Neo Kyoto boss achievements
    if (monster.templateId === 'sysadmin_exe') unlockAchievement(socket, player, 'server_melt');
    const NK_BOSSES = ['Chiyo-7, the Deprecated', 'The Account Manager', 'Babel Fish Regent', 'The Deep Pool', 'SYSADMIN.EXE'];
    const nkKilled = NK_BOSSES.filter(name => player.stats.bossesDefeated.includes(name));
    if (nkKilled.length >= 5) unlockAchievement(socket, player, 'settle_all_tickets');
    // Tier 2.2: first-time boss kill grants +5 QP
    player.questPoints = (player.questPoints || 0) + 5;
    socket.write(colorize('[+5 Quest Points] First-time boss victory.\r\n', 'brightMagenta'));
    // Auto-save after boss defeat
    savePlayer(player, socket, true);
    // Log activity
    logActivity(`${player.name} defeated ${monster.name}`);
  }

  // Tier 1.8: silencer (kill a Bookworm)
  if (monster.templateId && monster.templateId.toLowerCase().includes('bookworm')) {
    unlockAchievement(socket, player, 'silencer');
  }

  // Tier 1.8: rich (hold 10k gold)
  if (player.gold >= 10000) unlockAchievement(socket, player, 'rich');

  // Eldoria 2.0: Morwyn Ironheart forges the Tuning Fork into the Obsidian Drum-Stave.
  if (isBoss && monster.templateId === 'morwyn_ironheart' && player.stats.storyFlags && !player.stats.storyFlags.drumStaveForged) {
    // Remove Tuning Fork from equipped slot
    if (player.equipped.weapon && player.equipped.weapon.id === 'tuning_fork') {
      player.equipped.weapon = null;
    }
    // Remove Tuning Fork from inventory
    player.inventory = player.inventory.filter(it => !it || it.id !== 'tuning_fork');

    const stave = createItem('drum_stave');
    if (stave) {
      player.inventory.push(stave);
      // Auto-equip if no weapon is currently held
      if (!player.equipped.weapon) {
        player.equipped.weapon = stave;
      }
    }
    player.stats.storyFlags.drumStaveForged = true;
    socket.write(colorize("\r\nMorwyn's dying breath sears your Tuning Fork. It reforms in your grip as the Obsidian Drum-Stave - heavier, hungrier, humming a lower note.\r\n", 'brightRed'));
    savePlayer(player, socket, true);
  }

  // Check if this is a gate boss - ALWAYS open the gate when killed (regardless of player's personal stats)
  if (isBoss) {
    const gateBossIds = [
      'crystal_dragon', 'shadow_lord', 'void_guardian',
      'morwyn_ironheart', 'zephyros_recursive', 'valdris_radiant', 'nyxara_echo', 'thessarian_patient'
    ];
    if (gateBossIds.includes(monster.templateId) && !defeatedBosses.has(monster.templateId)) {
      defeatedBosses.add(monster.templateId);

      // Announce gate opening to all players
      socket.write(colorize('\r\n✧✧✧ GATE OPENED ✧✧✧\r\n', 'brightGreen'));
      socket.write(colorize('The way forward has been cleared!\r\n\r\n', 'brightGreen'));

      // Broadcast legendary victory to entire server
      broadcastToAll(colorize('\r\n*** LEGENDARY VICTORY ***', 'brightMagenta'));
      broadcastToAll(colorize(`The ${monster.name} has been slain by ${getDisplayName(player)}!`, 'brightMagenta'));
      broadcastToAll(colorize('A path beyond has been opened!', 'brightGreen'));
      broadcastToAll(colorize('*** *** ***\r\n', 'brightMagenta'));
    }
  }

  // Remove monster and schedule respawn (bosses don't respawn)
  const deadMonster = removeMonster(monster.id);
  if (deadMonster && deadMonster.spawnZone !== 'Boss') {
    scheduleMonsterRespawn(deadMonster.spawnZone);
  }

  // Add XP and check for level up (Tier 1.5: group XP split)
  const grp = (typeof findGroupOf === 'function') ? findGroupOf(player.name) : null;
  const sameRoomMembers = [];
  if (grp && grp.members && grp.members.length >= 2) {
    for (const [sock, p] of players) {
      if (p && p.name && grp.members.includes(p.name) && p.currentRoom === player.currentRoom) {
        sameRoomMembers.push({ sock, p });
      }
    }
  }
  if (sameRoomMembers.length >= 2) {
    const splitXP = Math.floor((xpGain * 1.2) / sameRoomMembers.length);
    for (const m of sameRoomMembers) {
      m.p.experience += splitXP;
      if (m.p.name !== player.name) {
        m.sock.write(colorize(`[Group XP] You gain ${splitXP} XP from ${player.name}'s kill.\r\n`, 'brightYellow'));
      }
      checkLevelUp(m.sock, m.p);
    }
    if (typeof unlockAchievement === 'function') unlockAchievement(socket, player, 'group_kill');
  } else {
    player.experience += xpGain;
    checkLevelUp(socket, player);
  }
}

// Handle player death
function handlePlayerDeath(socket, player) {
  const deathMsg = colorize(
    '\r\n*** YOU HAVE BEEN SLAIN! ***',
    'brightRed'
  );
  socket.write(`${deathMsg}\r\n`);

  // Calculate XP penalty (10% of current XP, but don't de-level; 5% for Unwritten Sages L26+)
  const currentLevelThreshold = getXPForLevel(player.level);
  const deathXpRate = player.level >= 26 ? 0.05 : 0.10;
  const xpLoss = Math.floor(player.experience * deathXpRate);
  const newXP = Math.max(currentLevelThreshold, player.experience - xpLoss);
  const actualXPLoss = player.experience - newXP;

  // Calculate gold penalty (10% of current gold)
  const goldLoss = Math.floor(player.gold * 0.10);

  // Apply penalties
  player.experience = newXP;
  player.gold = Math.max(0, player.gold - goldLoss);

  // Show penalty message
  if (actualXPLoss > 0 || goldLoss > 0) {
    socket.write(colorize(`You lose ${goldLoss} gold and ${actualXPLoss} experience from your defeat.\r\n`, 'red'));
  }

  // Update statistics
  player.stats.deaths++;
  if (player.stats.deaths >= 10) unlockAchievement(socket, player, 'died_10');

  socket.write(colorize(
    'You awaken in the Awakening Chamber, your wounds mysteriously healed.\r\n',
    'yellow'
  ));

  // Broadcast death to room
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} vanishes in a flash of light!`, socket);

  // Exit combat
  player.inCombat = false;
  player.combatTarget = null;

  // Respawn at room 001
  player.currentRoom = START_ROOM;
  player.currentHP = player.maxHP;

  // Auto-save after death
  savePlayer(player, socket, true);

  // Show the respawn room
  showRoom(socket, player);
}

// Execute one round of combat (DEPRECATED - combat is now automatic)
// This function is kept for backwards compatibility but redirects to automatic combat
function executeCombatRound(socket, player) {
  // If already in automatic monster combat, just remind player
  if (isInMonsterCombat(player)) {
    socket.write(colorize('Combat is automatic! Commands: flee, cast <spell>, use <potion>, qs\r\n', 'yellow'));
    return;
  }

  const monster = getMonsterById(player.combatTarget);

  if (!monster) {
    socket.write('Your opponent has vanished!\r\n');
    player.inCombat = false;
    player.combatTarget = null;
    return;
  }

  // Check if monster is still in the same room
  if (monster.currentRoom !== player.currentRoom) {
    socket.write(`${monster.name} has fled the area!\r\n`);
    player.inCombat = false;
    player.combatTarget = null;
    return;
  }

  // Redirect to automatic combat system
  initiateMonsterCombat(socket, player, monster);
}

// Handle attack command
function handleAttack(socket, player, targetName) {
  // Check if already in PVP combat (automatic - just inform)
  if (isInPvpCombat(player)) {
    socket.write(colorize('Combat is automatic! Use flee/surrender/use potion.\r\n', 'yellow'));
    return;
  }

  // Check if already in monster combat (automatic - just inform)
  if (isInMonsterCombat(player)) {
    socket.write(colorize('Combat is automatic! Use flee or use potion.\r\n', 'yellow'));
    return;
  }

  // Safe zone: no attacks allowed
  if (isChapelRoom(player.currentRoom)) {
    socket.write(colorize('This is a sacred chapel - violence is forbidden here.\r\n', 'brightGreen'));
    return;
  }

  // Check if target name provided
  if (!targetName || targetName.trim() === '') {
    socket.write('Attack what? Usage: attack [monster name] or attack [player name]\r\n');
    return;
  }

  // Check if target is a player (PVP)
  const targetPlayer = findPlayerByName(targetName.trim());
  if (targetPlayer && targetPlayer.player.currentRoom === player.currentRoom) {
    handlePvpAttack(socket, player, targetName.trim());
    return;
  }

  // Check if target is an LLM NPC in the room
  const npcTarget = npcRegistry.findNpcInRoom(player.currentRoom, targetName.trim());
  if (npcTarget) {
    socket.write(colorize(`You raise your hand against ${npcTarget.name}!\r\n`, 'brightRed'));
    broadcastToRoom(player.currentRoom, `${getDisplayName(player)} attacks ${npcTarget.name}!`, socket);
    npcTarget.brain.recordInteraction(player.name, `was attacked by ${player.name}`, -20, 5);
    // Have the NPC react in-character (fire-and-forget)
    const room = rooms[player.currentRoom];
    const roomCtx = room ? { name: room.name, shortDescription: room.shortDescription } : null;
    npcTarget.brain.think(player.name, '*you just raised your fist to strike me*', roomCtx, false)
      .then(res => {
        if (!players.has(socket)) return;
        socket.write(colorize(`${npcTarget.name}: "${res.reply}"\r\n`, 'brightRed'));
        npcRegistry.saveBrain(npcTarget.id);
      })
      .catch(() => {});
    // Also fail any active quests from this NPC
    const def = (npcTarget.questsOffered || []).map(id => questManager.getDefinition(id)).filter(Boolean);
    for (const d of def) {
      if (questManager.isActive(player.name, d.id)) {
        questManager.abandon(player.name, d.id);
        socket.write(colorize(`The quest "${d.title}" is lost - ${npcTarget.name} will not help you now.\r\n`, 'red'));
      }
    }
    return;
  }

  // Find monster in room
  const monster = findMonsterInRoom(player.currentRoom, targetName.trim());

  if (!monster) {
    socket.write(`You don't see "${targetName}" here.\r\n`);
    return;
  }

  // Start automatic monster combat
  initiateMonsterCombat(socket, player, monster);
}

// Handle flee command
function handleFlee(socket, player) {
  // Check for automatic monster combat first
  if (isInMonsterCombat(player)) {
    handleMonsterCombatFlee(socket, player);
    return;
  }

  // Check for PVP combat
  if (isInPvpCombat(player)) {
    handlePvpFlee(socket, player);
    return;
  }

  if (!player.inCombat) {
    socket.write("You're not in combat!\r\n");
    return;
  }

  // Legacy fallback for old combat system
  const monster = getMonsterById(player.combatTarget);
  const currentRoom = rooms[player.currentRoom];

  // Check for available exits
  const exits = Object.entries(currentRoom.exits);
  if (exits.length === 0) {
    socket.write(colorize("There's nowhere to flee!\r\n", 'red'));
    return;
  }

  socket.write(colorize('You attempt to flee!\r\n', 'yellow'));

  // 60% success chance
  if (Math.random() < getFleeChance(player)) {
    // SUCCESS - Pick random exit and move there
    const [direction, targetRoomId] = exits[Math.floor(Math.random() * exits.length)];
    const oldRoom = player.currentRoom;

    // Calculate XP loss (10% of current XP, minimum 10)
    const xpLoss = Math.max(10, Math.floor(player.experience * 0.1));
    player.experience = Math.max(0, player.experience - xpLoss);

    socket.write(colorize(`SUCCESS! You flee ${direction}!\r\n`, 'green'));
    socket.write(colorize(`Your hasty retreat costs you ${xpLoss} experience!\r\n`, 'yellow'));

    // Broadcast to old room
    if (monster) {
      broadcastToRoom(oldRoom, `${getDisplayName(player)} flees ${direction} from ${monster.name}!`, socket);
    }

    // Exit combat and move player
    player.inCombat = false;
    player.combatTarget = null;
    player.currentRoom = targetRoomId;

    // Show new room
    showRoom(socket, player);
    socket.write('You are no longer in combat.\r\n');

  } else {
    // FAILURE - Monster gets double damage attack
    socket.write(colorize('You fail to escape!\r\n', 'red'));

    // Calculate XP loss on failure (5% of current XP, minimum 5)
    const xpLoss = Math.max(5, Math.floor(player.experience * 0.05));
    player.experience = Math.max(0, player.experience - xpLoss);
    socket.write(colorize(`Your failed escape costs you ${xpLoss} experience!\r\n`, 'yellow'));

    if (monster) {
      // Double damage attack (armor still applies)
      const baseDmg = monster.str;
      const bonusDmg = rollDamage(1, 10);
      const rawDamage = (baseDmg + bonusDmg) * 2; // DOUBLE DAMAGE
      const armorBonus = getEquippedArmorBonus(player);
      const totalDamage = Math.max(1, rawDamage - armorBonus);
      const absorbed = rawDamage - totalDamage;

      player.currentHP -= totalDamage;

      const armorText = absorbed > 0 ? colorize(` (armor absorbed ${absorbed})`, 'cyan') : '';
      const damageMsg = colorize(
        `${monster.name} strikes you as you attempt to flee for ${totalDamage} damage${armorText}! (You: ${Math.max(0, player.currentHP)}/${player.maxHP} HP)`,
        'brightRed'
      );
      socket.write(`${damageMsg}\r\n`);

      if (player.currentHP <= 0) {
        handlePlayerDeath(socket, player);
        return;
      }

      // Still in combat
      socket.write(colorize('\r\n[COMBAT] ', 'brightRed'));
      socket.write('Attack or flee? ');
    }
  }
}

// ============================================
// MONSTER SCORING SYSTEM
// ============================================

// Get monster score/analysis display
function handleMonsterScore(socket, player, targetName) {
  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: score [monster name]\r\n');
    return;
  }

  // Find monster in current room
  const monster = findMonsterInRoom(player.currentRoom, targetName.trim());

  if (!monster) {
    socket.write(`You don't see "${targetName}" here.\r\n`);
    return;
  }

  const isBoss = monster.type === 'Boss';
  const template = monsterData.templates[monster.templateId] || monsterData.bosses[monster.templateId];

  // Calculate damage range
  const minDmg = monster.str;
  const maxDmg = monster.str + 10;

  // Calculate XP reward
  const xpReward = isBoss ? monster.level * 200 : monster.level * 50;

  // Get behavior description
  let behaviorText = '';
  switch (monster.type) {
    case 'Aggressive':
      behaviorText = colorize('This creature will attack on sight!', 'brightRed');
      break;
    case 'Neutral':
      behaviorText = colorize('This creature will only attack if provoked.', 'yellow');
      break;
    case 'Passive':
      behaviorText = colorize('This creature is peaceful unless attacked.', 'green');
      break;
    case 'Boss':
      behaviorText = colorize('LEGENDARY BOSS - Extremely dangerous!', 'brightRed');
      break;
    default:
      behaviorText = 'Unknown behavior.';
  }

  // Get loot table
  let lootInfo = [];
  if (isBoss) {
    const bossDropTable = itemData.bossDrops[monster.templateId];
    if (bossDropTable && bossDropTable.guaranteed) {
      bossDropTable.guaranteed.forEach(itemId => {
        const item = findItemById(itemId);
        if (item) {
          let itemDesc = `${item.name} (${item.value} gold)`;
          if (item.damageBonus) itemDesc = `${item.name} (+${item.damageBonus} damage weapon)`;
          if (item.armorBonus) itemDesc = `${item.name} (+${item.armorBonus} armor)`;
          lootInfo.push(itemDesc);
        }
      });
    }
  } else {
    const lootTable = itemData.monsterLootTables[monster.templateId];
    if (lootTable && lootTable.length > 0) {
      lootTable.forEach(itemId => {
        const item = findItemById(itemId);
        if (item) {
          let itemDesc = `${item.name} (${item.value} gold)`;
          if (item.damageBonus) itemDesc = `${item.name} (+${item.damageBonus} damage weapon)`;
          if (item.armorBonus) itemDesc = `${item.name} (+${item.armorBonus} armor)`;
          lootInfo.push(itemDesc);
        }
      });
    }
  }

  // Display monster score
  socket.write('\r\n');

  if (isBoss) {
    socket.write(colorize('=======================================================\r\n', 'brightRed'));
    socket.write(colorize(`  BOSS ANALYSIS: ${monster.name}\r\n`, 'brightRed'));
    socket.write(colorize('=======================================================\r\n', 'brightRed'));
  } else {
    socket.write(colorize('=======================================================\r\n', 'brightCyan'));
    socket.write(colorize(`  MONSTER ANALYSIS: ${monster.name}\r\n`, 'brightCyan'));
    socket.write(colorize('=======================================================\r\n', 'brightCyan'));
  }

  // Type with color
  const typeColor = monster.type === 'Aggressive' ? 'red' :
                    monster.type === 'Boss' ? 'brightRed' :
                    monster.type === 'Neutral' ? 'yellow' : 'green';
  socket.write(`Type: ${colorize(isBoss ? 'LEGENDARY BOSS' : monster.type, typeColor)}\r\n`);

  // Level
  socket.write(`Level: ${monster.level}\r\n`);

  // Health
  const hpColor = monster.hp < monster.maxHp * 0.3 ? 'red' :
                  monster.hp < monster.maxHp * 0.6 ? 'yellow' : 'green';
  socket.write(`Health: ${colorize(`${monster.hp} / ${monster.maxHp} HP`, hpColor)}\r\n`);

  // Strength
  socket.write(`Strength: ${monster.str} (attacks for ~${minDmg}-${maxDmg} damage)\r\n`);

  // XP Reward
  const xpFormula = isBoss ? `BOSS x 200` : `Level ${monster.level} x 50`;
  socket.write(`XP Reward: ${colorize(`${xpReward} XP`, 'yellow')} (${xpFormula})\r\n`);

  // Behavior
  socket.write(`Behavior: ${behaviorText}\r\n`);

  // Warning for bosses
  if (isBoss) {
    socket.write('\r\n');
    socket.write(colorize('  WARNING: This is an extremely dangerous foe!\r\n', 'brightYellow'));
    socket.write(colorize(`  Recommended: Level ${Math.max(monster.level - 2, 1)}+, best equipment, healing potions\r\n`, 'yellow'));
  }

  // Loot table
  socket.write('\r\n');
  if (isBoss) {
    socket.write(colorize('Guaranteed Drops:\r\n', 'brightMagenta'));
  } else {
    socket.write(`Loot Table (${Math.round(MONSTER_LOOT_CHANCE * 100)}% drop chance):\r\n`);
  }

  if (lootInfo.length > 0) {
    lootInfo.forEach(item => {
      socket.write(`  - ${colorize(item, 'cyan')}\r\n`);
    });
  } else {
    socket.write('  (No special loot)\r\n');
  }

  // Description
  socket.write('\r\n');
  socket.write('Description:\r\n');
  socket.write(`  ${template ? template.description : monster.description}\r\n`);

  socket.write(colorize('=======================================================\r\n', isBoss ? 'brightRed' : 'brightCyan'));
}

// Helper to find item by ID in all item categories
function findItemById(itemId) {
  // Check all categories
  const categories = ['weapons', 'armor', 'shields', 'accessories', 'consumables', 'treasure', 'boss_drops', 'instruments'];
  for (const category of categories) {
    if (itemData[category] && itemData[category][itemId]) {
      return itemData[category][itemId];
    }
  }
  return null;
}

// ============================================
// AUTOMATIC MONSTER COMBAT SYSTEM
// ============================================

// Get monster combat by player name
function getMonsterCombatByPlayer(playerName) {
  for (const [combatId, combat] of activeMonsterCombats) {
    if (combat.player.name.toLowerCase() === playerName.toLowerCase()) {
      return { combatId, combat };
    }
  }
  return null;
}

// Check if player is in monster combat
function isInMonsterCombat(player) {
  return getMonsterCombatByPlayer(player.name) !== null;
}

// Initiate automatic monster combat
function initiateMonsterCombat(socket, player, monster) {
  const combatId = ++monsterCombatIdCounter;

  // Set player in combat
  player.inCombat = true;
  player.combatTarget = monster.id;
  player.monsterCombatId = combatId;

  // Create combat record
  const combat = {
    id: combatId,
    player: player,
    socket: socket,
    monster: monster,
    roomId: player.currentRoom,
    timer: null
  };

  activeMonsterCombats.set(combatId, combat);

  // Combat initiation message
  socket.write(colorize('\r\n=== COMBAT INITIATED ===\r\n', 'brightRed'));
  socket.write(`You engage ${colorize(monster.name, 'brightYellow')} (Level ${monster.level})!\r\n`);
  socket.write(`${monster.name}: ${monster.hp}/${monster.maxHp} HP | You: ${player.currentHP}/${player.maxHP} HP\r\n`);

  // Broadcast to room
  broadcastToRoom(player.currentRoom, colorize(`${getDisplayName(player)} engages ${monster.name} in combat!`, 'yellow'), socket);

  // Execute first attack immediately
  executeMonsterCombatTick(combatId);
}

// Execute one tick of monster combat (player attacks, then monster counter-attacks)
function executeMonsterCombatTick(combatId) {
  const combat = activeMonsterCombats.get(combatId);
  if (!combat) return;

  const { player, socket, monster } = combat;

  // Verify combat is still valid
  if (!player.inCombat || player.combatTarget !== monster.id) {
    cleanupMonsterCombat(combatId);
    return;
  }

  // Check if monster still exists and is in room
  const currentMonster = getMonsterById(monster.id);
  if (!currentMonster) {
    socket.write(colorize('Your opponent has vanished!\r\n', 'yellow'));
    cleanupMonsterCombat(combatId);
    socket.write('[COMBAT vs ???] > ');
    return;
  }

  if (currentMonster.currentRoom !== player.currentRoom) {
    socket.write(colorize(`${monster.name} has fled the area!\r\n`, 'yellow'));
    cleanupMonsterCombat(combatId);
    socket.write('> ');
    return;
  }

  // Player's turn - attack monster
  let monsterDead = playerAttackMonster(socket, player, currentMonster);

  // Broadcast to spectators
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} strikes ${currentMonster.name}!`, socket);

  // Tier 2.3: pet assists after the player's swing (if monster still alive)
  if (!monsterDead && typeof petAssistAttack === 'function') {
    petAssistAttack(socket, player, currentMonster);
    if (currentMonster.hp <= 0) monsterDead = true;
  }

  if (monsterDead) {
    handleMonsterDeath(socket, player, currentMonster);
    cleanupMonsterCombat(combatId);
    socket.write('> ');
    return;
  }

  // Schedule monster counter-attack after delay (speed-buffed bosses attack sooner)
  const counterSpeedMult = (currentMonster.bossState && currentMonster.bossState.speedMultiplier) || 1.0;
  const counterDelay = Math.max(300, Math.floor(MONSTER_COUNTER_DELAY / counterSpeedMult));
  combat.timer = setTimeout(() => {
    executeMonsterCounterAttack(combatId);
  }, counterDelay);
}

// Execute monster's counter-attack
function executeMonsterCounterAttack(combatId) {
  const combat = activeMonsterCombats.get(combatId);
  if (!combat) return;

  const { player, socket, monster } = combat;

  // Verify combat is still valid
  if (!player.inCombat || player.combatTarget !== monster.id) {
    cleanupMonsterCombat(combatId);
    return;
  }

  // Check if monster still exists
  const currentMonster = getMonsterById(monster.id);
  if (!currentMonster) {
    socket.write(colorize('Your opponent has vanished!\r\n', 'yellow'));
    cleanupMonsterCombat(combatId);
    socket.write('> ');
    return;
  }

  // Monster's turn - attack player
  const playerDead = monsterAttackPlayer(socket, player, currentMonster);

  // Broadcast to spectators
  broadcastToRoom(player.currentRoom, `${currentMonster.name} attacks ${getDisplayName(player)}!`, socket);

  // Tier 2.3: 30% chance the monster also claws the active pet
  if (typeof monsterAttackPet === 'function') {
    monsterAttackPet(socket, player, currentMonster);
  }

  if (playerDead) {
    handlePlayerDeath(socket, player);
    cleanupMonsterCombat(combatId);
    return;
  }

  // Automatic combat - no prompt needed, just schedule next round (speed-buffed bosses tick sooner)
  const roundSpeedMult = (currentMonster.bossState && currentMonster.bossState.speedMultiplier) || 1.0;
  const nextRoundDelay = Math.max(300, Math.floor((MONSTER_COMBAT_ROUND_INTERVAL - MONSTER_COUNTER_DELAY) / roundSpeedMult));
  combat.timer = setTimeout(() => {
    executeMonsterCombatTick(combatId);
  }, nextRoundDelay);
}

// Clean up monster combat
function cleanupMonsterCombat(combatId) {
  const combat = activeMonsterCombats.get(combatId);
  if (combat) {
    if (combat.timer) {
      clearTimeout(combat.timer);
    }
    combat.player.inCombat = false;
    combat.player.combatTarget = null;
    combat.player.monsterCombatId = null;
    activeMonsterCombats.delete(combatId);
  }
}

// Handle flee from monster combat
function handleMonsterCombatFlee(socket, player) {
  const combatResult = getMonsterCombatByPlayer(player.name);
  if (!combatResult) {
    socket.write("You're not in combat!\r\n");
    return;
  }

  const { combatId, combat } = combatResult;
  const monster = getMonsterById(combat.monster.id);
  const currentRoom = rooms[player.currentRoom];

  // Check for available exits
  const exits = Object.entries(currentRoom.exits);
  if (exits.length === 0) {
    socket.write(colorize("There's nowhere to flee!\r\n", 'red'));
    return;
  }

  socket.write(colorize('You attempt to flee!\r\n', 'yellow'));

  // 60% success chance
  if (Math.random() < getFleeChance(player)) {
    // SUCCESS - Pick random exit and move there
    const [direction, targetRoomId] = exits[Math.floor(Math.random() * exits.length)];
    const oldRoom = player.currentRoom;

    // Calculate XP loss (10% of current XP, minimum 10)
    const xpLoss = Math.max(10, Math.floor(player.experience * 0.1));
    player.experience = Math.max(0, player.experience - xpLoss);

    socket.write(colorize(`SUCCESS! You flee ${direction}!\r\n`, 'green'));
    socket.write(colorize(`Your hasty retreat costs you ${xpLoss} experience!\r\n`, 'yellow'));

    // Broadcast to old room
    if (monster) {
      broadcastToRoom(oldRoom, `${getDisplayName(player)} flees ${direction} from ${monster.name}!`, socket);
    }

    // Clean up combat and move player
    cleanupMonsterCombat(combatId);
    player.currentRoom = targetRoomId;

    // Show new room
    showRoom(socket, player);

  } else {
    // FAILURE - Monster gets double damage attack
    socket.write(colorize('You fail to escape!\r\n', 'red'));

    // Calculate XP loss on failure (5% of current XP, minimum 5)
    const xpLoss = Math.max(5, Math.floor(player.experience * 0.05));
    player.experience = Math.max(0, player.experience - xpLoss);
    socket.write(colorize(`Your failed escape costs you ${xpLoss} experience!\r\n`, 'yellow'));

    if (monster) {
      // Double damage attack (armor still applies)
      const baseDmg = monster.str;
      const bonusDmg = rollDamage(1, 10);
      const rawDamage = (baseDmg + bonusDmg) * 2; // DOUBLE DAMAGE
      const armorBonus = getEquippedArmorBonus(player);
      const totalDamage = Math.max(1, rawDamage - armorBonus);
      const absorbed = rawDamage - totalDamage;

      player.currentHP -= totalDamage;

      const armorText = absorbed > 0 ? colorize(` (armor absorbed ${absorbed})`, 'cyan') : '';
      const damageMsg = colorize(
        `${monster.name} strikes you as you attempt to flee for ${totalDamage} damage${armorText}! (You: ${Math.max(0, player.currentHP)}/${player.maxHP} HP)`,
        'brightRed'
      );
      socket.write(`${damageMsg}\r\n`);

      if (player.currentHP <= 0) {
        handlePlayerDeath(socket, player);
        cleanupMonsterCombat(combatId);
        return;
      }

      // Combat continues - show prompt
      socket.write(colorize(`\r\n[COMBAT vs ${monster.name}] `, 'brightRed'));
      socket.write('> ');
    }
  }
}

// Handle using item during monster combat
function handleMonsterCombatUseItem(socket, player, itemName) {
  const combatResult = getMonsterCombatByPlayer(player.name);
  if (!combatResult) {
    // Fall through to normal use
    handleUse(socket, player, itemName);
    return;
  }

  // Find item in inventory
  const itemIndex = player.inventory.findIndex(item =>
    item.name.toLowerCase().includes(itemName.toLowerCase())
  );

  if (itemIndex === -1) {
    socket.write(`You don't have "${itemName}" in your inventory.\r\n`);
    return;
  }

  const item = player.inventory[itemIndex];

  // Only consumables work during combat
  if (item.type !== 'consumable') {
    socket.write(colorize("You can only use consumables during combat!\r\n", 'red'));
    return;
  }

  // Use the consumable
  const oldHP = player.currentHP;
  player.currentHP = Math.min(player.maxHP, player.currentHP + item.healAmount);
  const healed = player.currentHP - oldHP;

  // Remove from inventory
  player.inventory.splice(itemIndex, 1);

  socket.write(colorize(`You drink ${item.name}! (+${healed} HP) [${oldHP}→${player.currentHP}/${player.maxHP} HP]\r\n`, 'brightGreen'));
}

// Handle disconnect during monster combat
function handleMonsterCombatDisconnect(player) {
  const combatResult = getMonsterCombatByPlayer(player.name);
  if (combatResult) {
    const { combatId, combat } = combatResult;
    // Broadcast to room that player fled
    broadcastToRoom(combat.roomId, `${getDisplayName(player)} vanishes mid-combat, fleeing ${combat.monster.name}!`, null);
    cleanupMonsterCombat(combatId);
  }
}

// ============================================
// PVP COMBAT SYSTEM (Automatic Real-Time)
// ============================================

// Get PVP combat by player name
function getPvpCombatByPlayer(playerName) {
  for (const [combatId, combat] of activePvpCombats) {
    if (combat.attacker.name.toLowerCase() === playerName.toLowerCase() ||
        combat.defender.name.toLowerCase() === playerName.toLowerCase()) {
      return { combatId, combat };
    }
  }
  return null;
}

// Check if player is in PVP combat
function isInPvpCombat(player) {
  return player.inCombat && player.pvpCombatTarget !== null;
}

// Handle PVP toggle command
function handlePvpToggle(socket, player, state) {
  const now = Date.now();

  if (state === 'on') {
    if (player.pvpEnabled) {
      socket.write('PVP is already enabled.\r\n');
      return;
    }
    player.pvpEnabled = true;
    player.pvpToggleCooldown = now;
    socket.write(colorize('PVP ENABLED! You can now attack and be attacked by other players.\r\n', 'brightRed'));
    broadcastToRoom(player.currentRoom, colorize(`${getDisplayName(player)} has enabled PVP combat!`, 'red'), socket);
  } else if (state === 'off') {
    if (!player.pvpEnabled) {
      socket.write('PVP is already disabled.\r\n');
      return;
    }

    // Check if in combat
    if (isInPvpCombat(player)) {
      socket.write(colorize('You cannot disable PVP while in PVP combat!\r\n', 'red'));
      return;
    }

    // Check cooldown
    const timeSinceToggle = now - player.pvpToggleCooldown;
    if (timeSinceToggle < PVP_TOGGLE_COOLDOWN) {
      const remainingMs = PVP_TOGGLE_COOLDOWN - timeSinceToggle;
      const remainingMin = Math.ceil(remainingMs / 60000);
      socket.write(colorize(`You must wait ${remainingMin} more minute(s) to disable PVP.\r\n`, 'yellow'));
      return;
    }

    player.pvpEnabled = false;
    socket.write(colorize('PVP DISABLED. You are now peaceful.\r\n', 'green'));
    broadcastToRoom(player.currentRoom, `${getDisplayName(player)} has disabled PVP combat.`, socket);
  } else {
    // Status
    socket.write('\r\n');
    socket.write(colorize('=== PVP Status ===\r\n', 'brightCyan'));
    socket.write(`Status: ${player.pvpEnabled ? colorize('COMBAT READY', 'brightRed') : colorize('PEACEFUL', 'green')}\r\n`);
    socket.write(`PVP Kills: ${player.stats.pvpKills}\r\n`);
    socket.write(`PVP Deaths: ${player.stats.pvpDeaths}\r\n`);
    if (player.pvpEnabled) {
      const timeSinceToggle = now - player.pvpToggleCooldown;
      if (timeSinceToggle < PVP_TOGGLE_COOLDOWN) {
        const remainingMs = PVP_TOGGLE_COOLDOWN - timeSinceToggle;
        const remainingMin = Math.ceil(remainingMs / 60000);
        socket.write(colorize(`Cooldown: ${remainingMin} minute(s) until you can disable PVP\r\n`, 'yellow'));
      } else {
        socket.write('You can disable PVP at any time.\r\n');
      }
    }
    socket.write('\r\n');
  }
}

// Handle PVP attack on another player
function handlePvpAttack(socket, player, targetName) {
  // Find target player
  const targetResult = findPlayerByName(targetName);
  if (!targetResult) {
    socket.write(`Player "${targetName}" is not online.\r\n`);
    return;
  }

  const targetSocket = targetResult.socket;
  const target = targetResult.player;

  // Can't attack yourself
  if (target.name.toLowerCase() === player.name.toLowerCase()) {
    socket.write('You cannot attack yourself.\r\n');
    return;
  }

  // Check if attacker has PVP enabled
  if (!player.pvpEnabled) {
    socket.write('You must enable PVP first (type "pvp on").\r\n');
    return;
  }

  // Check if target has PVP enabled
  if (!target.pvpEnabled) {
    socket.write(`${target.name} is peaceful and cannot be attacked.\r\n`);
    return;
  }

  // Check if in same room
  if (player.currentRoom !== target.currentRoom) {
    socket.write(`${target.name} is not here.\r\n`);
    return;
  }

  // Check if in chapel (safe zone)
  if (isChapelRoom(player.currentRoom)) {
    socket.write(colorize('PVP is forbidden in sacred chapels!\r\n', 'brightCyan'));
    return;
  }

  // Check level difference (can't attack 5+ levels below)
  if (player.level - target.level >= PVP_LEVEL_DIFF_LIMIT) {
    socket.write(`${target.name} is too low level to attack. Find a worthier opponent.\r\n`);
    return;
  }

  // Check attack cooldown on this specific target
  const lastAttack = player.pvpLastAttacked[target.name.toLowerCase()];
  if (lastAttack && Date.now() - lastAttack < PVP_ATTACK_COOLDOWN) {
    const remainingMs = PVP_ATTACK_COOLDOWN - (Date.now() - lastAttack);
    const remainingMin = Math.ceil(remainingMs / 60000);
    socket.write(`You must wait ${remainingMin} more minute(s) before attacking ${target.name} again.\r\n`);
    return;
  }

  // Check if either player is already in combat
  if (player.inCombat) {
    socket.write('You are already in combat!\r\n');
    return;
  }
  if (target.inCombat) {
    socket.write(`${target.name} is already in combat!\r\n`);
    return;
  }

  // Initiate PVP combat
  initiatePvpCombat(socket, player, targetSocket, target);
}

// Initiate PVP combat between two players (automatic system)
function initiatePvpCombat(attackerSocket, attacker, defenderSocket, defender) {
  // Set both players in combat
  attacker.inCombat = true;
  attacker.pvpCombatTarget = defender.name;
  attacker.combatTarget = null; // Clear monster target

  defender.inCombat = true;
  defender.pvpCombatTarget = attacker.name;
  defender.combatTarget = null;

  // Record attack time
  attacker.pvpLastAttacked[defender.name.toLowerCase()] = Date.now();

  // Create combat record
  const combatId = ++pvpCombatIdCounter;
  const combat = {
    id: combatId,
    attacker: attacker,
    defender: defender,
    attackerSocket: attackerSocket,
    defenderSocket: defenderSocket,
    roomId: attacker.currentRoom,
    lastActivity: Date.now(),
    isAttackerTurn: true, // Attacker goes first
    timer: null
  };

  activePvpCombats.set(combatId, combat);

  // Store combat ID on players for quick lookup
  attacker.pvpCombatId = combatId;
  defender.pvpCombatId = combatId;

  // Notify both players
  attackerSocket.write(colorize('\r\n========================================\r\n', 'brightRed'));
  attackerSocket.write(colorize('       *** PVP COMBAT INITIATED ***\r\n', 'brightRed'));
  attackerSocket.write(colorize('========================================\r\n', 'brightRed'));
  attackerSocket.write(`You attack ${getDisplayName(defender)} (Level ${defender.level})!\r\n`);
  attackerSocket.write(`${getDisplayName(defender)}: ${defender.currentHP}/${defender.maxHP} HP | You: ${attacker.currentHP}/${attacker.maxHP} HP\r\n`);
  attackerSocket.write(colorize('[Combat is AUTOMATIC - type "flee", "cast [spell]", "use [potion]", or "surrender"]\r\n', 'yellow'));
  attackerSocket.write(colorize(`[PVP vs ${getDisplayName(defender)}] > `, 'brightRed'));

  defenderSocket.write(colorize('\r\n========================================\r\n', 'brightRed'));
  defenderSocket.write(colorize('       *** PVP COMBAT ***\r\n', 'brightRed'));
  defenderSocket.write(colorize('========================================\r\n', 'brightRed'));
  defenderSocket.write(colorize(`${getDisplayName(attacker)} attacks you!\r\n`, 'brightRed'));
  defenderSocket.write(`${getDisplayName(attacker)}: ${attacker.currentHP}/${attacker.maxHP} HP | You: ${defender.currentHP}/${defender.maxHP} HP\r\n`);
  defenderSocket.write(colorize('[Combat is AUTOMATIC - type "flee", "cast [spell]", "use [potion]", or "surrender"]\r\n', 'yellow'));
  defenderSocket.write(colorize(`[PVP vs ${getDisplayName(attacker)}] > `, 'brightRed'));

  // Broadcast to room (excluding combatants)
  const roomPlayers = getPlayersInRoom(attacker.currentRoom);
  roomPlayers.forEach(({ socket, player }) => {
    if (socket !== attackerSocket && socket !== defenderSocket) {
      socket.write(colorize(`\r\n${getDisplayName(attacker)} and ${getDisplayName(defender)} engage in PVP combat!\r\n> `, 'red'));
    }
  });

  // Start automatic combat loop - first attack after 1 second
  combat.timer = setTimeout(() => {
    executePvpCombatTick(combatId);
  }, 1000);
}

// Execute one tick of automatic PVP combat
function executePvpCombatTick(combatId) {
  const combat = activePvpCombats.get(combatId);
  if (!combat) return; // Combat ended

  const { attacker, defender, attackerSocket, defenderSocket, isAttackerTurn } = combat;

  // Determine current attacker and target
  const currentAttacker = isAttackerTurn ? attacker : defender;
  const currentTarget = isAttackerTurn ? defender : attacker;
  const attackerSock = isAttackerTurn ? attackerSocket : defenderSocket;
  const targetSock = isAttackerTurn ? defenderSocket : attackerSocket;

  // Calculate damage
  const weaponBonus = getEquippedDamageBonus(currentAttacker);
  const baseDmg = rollDamage(currentAttacker.baseDamage.min, currentAttacker.baseDamage.max);
  const bonusDmg = rollDamage(1, 5);
  const rawDamage = baseDmg + bonusDmg + weaponBonus;
  const armorBonus = getEquippedArmorBonus(currentTarget);
  const totalDamage = Math.max(1, rawDamage - armorBonus);
  const absorbed = rawDamage - totalDamage;

  // Apply damage
  currentTarget.currentHP -= totalDamage;
  currentAttacker.stats.totalDamageDealt += totalDamage;
  currentTarget.stats.totalDamageTaken += totalDamage;

  // Format damage message
  const armorText = absorbed > 0 ? colorize(` (armor absorbed ${absorbed})`, 'cyan') : '';
  const targetHpText = `(${getDisplayName(currentTarget)}: ${Math.max(0, currentTarget.currentHP)}/${currentTarget.maxHP} HP)`;

  // Show to attacker
  attackerSock.write(colorize(`\r\nYou strike ${getDisplayName(currentTarget)} for ${totalDamage} damage${armorText}! ${targetHpText}\r\n`, 'brightGreen'));
  attackerSock.write(colorize(`[PVP vs ${getDisplayName(currentTarget)}] > `, 'brightRed'));

  // Show to target
  targetSock.write(colorize(`\r\n${getDisplayName(currentAttacker)} strikes you for ${totalDamage} damage${armorText}! ${targetHpText}\r\n`, 'brightRed'));
  targetSock.write(colorize(`[PVP vs ${getDisplayName(currentAttacker)}] > `, 'brightRed'));

  // Show to spectators in room
  const roomPlayers = getPlayersInRoom(combat.roomId);
  roomPlayers.forEach(({ socket, player }) => {
    if (socket !== attackerSocket && socket !== defenderSocket) {
      socket.write(colorize(`\r\n${getDisplayName(currentAttacker)} strikes ${getDisplayName(currentTarget)} for ${totalDamage} damage! ${targetHpText}\r\n> `, 'yellow'));
    }
  });

  // Check if target is dead
  if (currentTarget.currentHP <= 0) {
    handlePvpVictory(combatId, currentAttacker, currentTarget);
    return;
  }

  // Check AFK timeout
  const now = Date.now();
  if (now - combat.lastActivity > PVP_AFK_TIMEOUT) {
    // Determine who was AFK (whoever hasn't acted)
    handlePvpAfkSurrender(combatId);
    return;
  }

  // Toggle turn and schedule next tick
  combat.isAttackerTurn = !isAttackerTurn;

  // Counter-attack comes 1 second later, then 2 second delay for next round
  const delay = isAttackerTurn ? PVP_COUNTER_DELAY : PVP_ROUND_INTERVAL;
  combat.timer = setTimeout(() => {
    executePvpCombatTick(combatId);
  }, delay);
}

// Handle PVP victory
function handlePvpVictory(combatId, winner, loser) {
  const combat = activePvpCombats.get(combatId);
  if (!combat) return;

  // Clear timer
  if (combat.timer) {
    clearTimeout(combat.timer);
    combat.timer = null;
  }

  const winnerSocket = winner === combat.attacker ? combat.attackerSocket : combat.defenderSocket;
  const loserSocket = loser === combat.attacker ? combat.attackerSocket : combat.defenderSocket;

  // Calculate rewards/penalties
  const xpGain = Math.floor(loser.experience * 0.1); // Winner gains 10% of loser's XP
  const xpLoss = Math.floor(loser.experience * 0.1); // Loser loses 10% XP
  const goldGain = Math.floor(loser.gold * 0.1); // Winner gains 10% of loser's gold
  const goldLoss = Math.floor(loser.gold * 0.1); // Loser loses 10% gold

  // Apply rewards to winner
  winner.experience += xpGain;
  winner.gold += goldGain;
  winner.stats.pvpKills++;
  unlockAchievement(winnerSocket, winner, 'pvp_first');
  if (winner.stats.pvpKills >= 10) unlockAchievement(winnerSocket, winner, 'pvp_10');
  checkLevelUp(winnerSocket, winner);

  // Apply penalties to loser
  loser.experience = Math.max(0, loser.experience - xpLoss);
  loser.gold = Math.max(0, loser.gold - goldLoss);
  loser.stats.pvpDeaths++;
  loser.currentHP = loser.maxHP; // Respawn at full HP
  loser.currentRoom = START_ROOM;

  // Check for level down
  const newLevel = getLevelForXP(loser.experience);
  if (newLevel < loser.level) {
    loser.level = newLevel;
    const levelData = getLevelData(newLevel);
    loser.title = levelData.title;
    loser.maxHP = levelData.hp;
    loser.baseDamage = { min: levelData.dmgMin, max: levelData.dmgMax };
    loserSocket.write(colorize(`\r\nYou have dropped to level ${newLevel}!\r\n`, 'red'));
  }

  // End combat for both
  winner.inCombat = false;
  winner.pvpCombatTarget = null;
  winner.pvpCombatId = null;
  loser.inCombat = false;
  loser.pvpCombatTarget = null;
  loser.pvpCombatId = null;

  // Remove combat record
  activePvpCombats.delete(combatId);

  // Notify winner
  winnerSocket.write('\r\n');
  winnerSocket.write(colorize('========================================\r\n', 'brightGreen'));
  winnerSocket.write(colorize('            *** VICTORY! ***\r\n', 'brightGreen'));
  winnerSocket.write(colorize('========================================\r\n', 'brightGreen'));
  winnerSocket.write(colorize(`You have defeated ${getDisplayName(loser)} in PVP combat!\r\n`, 'brightGreen'));
  winnerSocket.write(colorize(`You gained ${xpGain} experience points!\r\n`, 'yellow'));
  winnerSocket.write(colorize(`${getDisplayName(loser)} drops ${goldGain} gold!\r\n`, 'brightYellow'));
  winnerSocket.write(`PVP Record: ${winner.stats.pvpKills} kills, ${winner.stats.pvpDeaths} deaths\r\n`);
  winnerSocket.write('\r\n> ');

  // Notify loser
  loserSocket.write('\r\n');
  loserSocket.write(colorize('========================================\r\n', 'brightRed'));
  loserSocket.write(colorize('            *** DEFEAT! ***\r\n', 'brightRed'));
  loserSocket.write(colorize('========================================\r\n', 'brightRed'));
  loserSocket.write(colorize(`You have been slain by ${getDisplayName(winner)}!\r\n`, 'brightRed'));
  loserSocket.write(colorize(`You lose ${xpLoss} experience and ${goldLoss} gold.\r\n`, 'red'));
  loserSocket.write('[Respawn at room_001]\r\n');
  loserSocket.write(`PVP Record: ${loser.stats.pvpKills} kills, ${loser.stats.pvpDeaths} deaths\r\n`);
  loserSocket.write('\r\n');
  showRoom(loserSocket, loser);

  // Broadcast to room
  const roomPlayers = getPlayersInRoom(combat.roomId);
  roomPlayers.forEach(({ socket }) => {
    if (socket !== winnerSocket && socket !== loserSocket) {
      socket.write(colorize(`\r\n${getDisplayName(winner)} has defeated ${getDisplayName(loser)} in PVP combat!\r\n> `, 'brightRed'));
    }
  });

  broadcastToAll(colorize(`[WORLD] ${getDisplayName(winner)} has defeated ${getDisplayName(loser)} in PVP combat!`, 'red'));
}

// Handle AFK surrender (30 second timeout)
function handlePvpAfkSurrender(combatId) {
  const combat = activePvpCombats.get(combatId);
  if (!combat) return;

  // The one who didn't act loses (for now, just end the combat with a draw message)
  // In practice, we consider the defender AFK if they didn't do anything
  const winner = combat.attacker;
  const loser = combat.defender;

  combat.attackerSocket.write(colorize('\r\n[AFK TIMEOUT] Your opponent has been inactive for too long!\r\n', 'yellow'));
  combat.defenderSocket.write(colorize('\r\n[AFK TIMEOUT] You have been inactive for too long! Auto-surrendering...\r\n', 'yellow'));

  handlePvpVictory(combatId, winner, loser);
}

// Handle flee from PVP combat
function handlePvpFlee(socket, player) {
  const combatData = getPvpCombatByPlayer(player.name);
  if (!combatData) {
    socket.write('You are not in PVP combat.\r\n');
    return;
  }

  const { combatId, combat } = combatData;
  const isAttacker = combat.attacker.name === player.name;
  const opponent = isAttacker ? combat.defender : combat.attacker;
  const opponentSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;

  // Update activity timestamp
  combat.lastActivity = Date.now();

  // Get random exit
  const room = rooms[player.currentRoom];
  const exits = Object.entries(room.exits);
  if (exits.length === 0) {
    socket.write(colorize('There is nowhere to flee!\r\n', 'red'));
    socket.write(colorize(`[PVP vs ${opponent.name}] > `, 'brightRed'));
    return;
  }

  socket.write(colorize('\r\nYou attempt to flee!\r\n', 'yellow'));
  opponentSocket.write(colorize(`\r\n${player.name} attempts to flee!\r\n`, 'yellow'));

  // 60% chance to flee successfully
  if (Math.random() < getFleeChance(player)) {
    const [direction, targetRoomId] = exits[Math.floor(Math.random() * exits.length)];

    // Stop combat timer
    if (combat.timer) {
      clearTimeout(combat.timer);
      combat.timer = null;
    }

    // XP and gold loss for fleeing (counts as a loss)
    const xpLoss = Math.floor(player.experience * 0.1);
    const goldLoss = Math.floor(player.gold * 0.05);
    player.experience = Math.max(0, player.experience - xpLoss);
    player.gold = Math.max(0, player.gold - goldLoss);
    player.stats.pvpDeaths++; // Fleeing counts as a loss

    // Winner gains from flee
    const xpGain = Math.floor(xpLoss * 0.5); // Half of what fleeing player lost
    opponent.experience += xpGain;
    opponent.stats.pvpKills++; // Counts as a win

    // End combat for both
    player.inCombat = false;
    player.pvpCombatTarget = null;
    player.pvpCombatId = null;
    opponent.inCombat = false;
    opponent.pvpCombatTarget = null;
    opponent.pvpCombatId = null;

    // Remove combat record
    activePvpCombats.delete(combatId);

    // Move fleeing player
    socket.write(colorize(`SUCCESS! You flee ${direction}!\r\n`, 'green'));
    socket.write(colorize(`You lose ${xpLoss} XP and ${goldLoss} gold for fleeing.\r\n`, 'red'));
    broadcastToRoom(player.currentRoom, `${getDisplayName(player)} flees ${direction}!`, socket);
    player.currentRoom = targetRoomId;
    showRoom(socket, player);

    opponentSocket.write(colorize(`\r\n${player.name} flees the battle! You win by forfeit!\r\n`, 'brightGreen'));
    opponentSocket.write(colorize(`You gain ${xpGain} experience!\r\n`, 'yellow'));
    opponentSocket.write(`PVP Record: ${opponent.stats.pvpKills} kills, ${opponent.stats.pvpDeaths} deaths\r\n`);
    opponentSocket.write('\r\n> ');

    // Notify spectators
    const roomPlayers = getPlayersInRoom(combat.roomId);
    roomPlayers.forEach(({ socket: s }) => {
      if (s !== socket && s !== opponentSocket) {
        s.write(colorize(`\r\n${player.name} flees! ${opponent.name} wins by forfeit!\r\n> `, 'yellow'));
      }
    });

  } else {
    // Failed flee - opponent gets bonus attack
    socket.write(colorize('FAILED! You cannot escape!\r\n', 'red'));

    // Opponent gets free attack with double damage
    const weaponBonus = getEquippedDamageBonus(opponent);
    const baseDmg = rollDamage(opponent.baseDamage.min, opponent.baseDamage.max);
    const bonusDmg = rollDamage(1, 5);
    const rawDamage = (baseDmg + bonusDmg + weaponBonus) * 2; // DOUBLE DAMAGE
    const armorBonus = getEquippedArmorBonus(player);
    const totalDamage = Math.max(1, Math.floor(rawDamage - armorBonus));

    // XP loss for failed flee
    const xpLoss = Math.floor(player.experience * 0.05);
    player.experience = Math.max(0, player.experience - xpLoss);

    player.currentHP -= totalDamage;

    socket.write(colorize(`${opponent.name} strikes with advantage for ${totalDamage} damage!\r\n`, 'brightRed'));
    socket.write(colorize(`You lose ${xpLoss} XP for your failed escape!\r\n`, 'yellow'));
    socket.write(`(You: ${Math.max(0, player.currentHP)}/${player.maxHP} HP)\r\n`);
    socket.write(colorize(`[PVP vs ${opponent.name}] > `, 'brightRed'));

    opponentSocket.write(colorize(`\r\n${player.name} fails to flee! You strike with advantage for ${totalDamage} damage!\r\n`, 'brightGreen'));
    opponentSocket.write(colorize(`[PVP vs ${player.name}] > `, 'brightRed'));

    if (player.currentHP <= 0) {
      handlePvpVictory(combatId, opponent, player);
      return;
    }
  }
}

// Handle surrender command
function handlePvpSurrender(socket, player) {
  const combatData = getPvpCombatByPlayer(player.name);
  if (!combatData) {
    socket.write('You are not in PVP combat.\r\n');
    return;
  }

  const { combatId, combat } = combatData;
  const isAttacker = combat.attacker.name === player.name;
  const opponent = isAttacker ? combat.defender : combat.attacker;
  const opponentSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;

  socket.write(colorize('\r\nYou raise your hands in surrender!\r\n', 'yellow'));
  opponentSocket.write(colorize(`\r\n${player.name} surrenders!\r\n`, 'brightGreen'));

  // Surrender = immediate loss
  handlePvpVictory(combatId, opponent, player);
}

// Handle using a potion during PVP combat
function handlePvpUseItem(socket, player, itemName) {
  const combatData = getPvpCombatByPlayer(player.name);
  if (!combatData) {
    socket.write('You are not in PVP combat.\r\n');
    return;
  }

  const { combat } = combatData;
  const isAttacker = combat.attacker.name === player.name;
  const opponent = isAttacker ? combat.defender : combat.attacker;
  const opponentSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;

  // Update activity timestamp
  combat.lastActivity = Date.now();

  // Find the item in inventory
  const itemIndex = player.inventory.findIndex(item =>
    item.name.toLowerCase().includes(itemName.toLowerCase()) ||
    item.id.toLowerCase().includes(itemName.toLowerCase())
  );

  if (itemIndex === -1) {
    socket.write(`You don't have "${itemName}" in your inventory.\r\n`);
    socket.write(colorize(`[PVP vs ${opponent.name}] > `, 'brightRed'));
    return;
  }

  const item = player.inventory[itemIndex];

  // Only consumables can be used
  if (item.type !== 'consumable') {
    socket.write(`You can't use ${item.name} in combat. Only potions work here.\r\n`);
    socket.write(colorize(`[PVP vs ${opponent.name}] > `, 'brightRed'));
    return;
  }

  // Use the consumable
  const healAmount = item.healAmount || 0;
  const oldHP = player.currentHP;
  player.currentHP = Math.min(player.maxHP, player.currentHP + healAmount);
  const actualHeal = player.currentHP - oldHP;

  // Remove item from inventory
  player.inventory.splice(itemIndex, 1);

  socket.write(colorize(`\r\nYou drink ${item.name}! (+${actualHeal} HP, now ${player.currentHP}/${player.maxHP})\r\n`, 'brightGreen'));
  socket.write(colorize(`[PVP vs ${opponent.name}] > `, 'brightRed'));

  opponentSocket.write(colorize(`\r\n${player.name} drinks a ${item.name}! (+${actualHeal} HP, now ${player.currentHP}/${player.maxHP})\r\n`, 'yellow'));
  opponentSocket.write(colorize(`[PVP vs ${player.name}] > `, 'brightRed'));

  // Notify spectators
  const roomPlayers = getPlayersInRoom(combat.roomId);
  roomPlayers.forEach(({ socket: s }) => {
    if (s !== socket && s !== opponentSocket) {
      s.write(colorize(`\r\n${player.name} drinks a ${item.name}! (+${actualHeal} HP)\r\n> `, 'dim'));
    }
  });
}

// End PVP combat when a player disconnects
function handlePvpDisconnect(player) {
  const combatData = getPvpCombatByPlayer(player.name);
  if (!combatData) return;

  const { combatId, combat } = combatData;
  const isAttacker = combat.attacker.name === player.name;
  const opponent = isAttacker ? combat.defender : combat.attacker;
  const opponentSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;

  // Stop combat timer
  if (combat.timer) {
    clearTimeout(combat.timer);
    combat.timer = null;
  }

  // Disconnecting player loses
  opponent.stats.pvpKills++;
  const xpGain = Math.floor(player.experience * 0.1);
  opponent.experience += xpGain;

  // End combat for opponent
  opponent.inCombat = false;
  opponent.pvpCombatTarget = null;
  opponent.pvpCombatId = null;

  // Remove combat record
  activePvpCombats.delete(combatId);

  opponentSocket.write(colorize(`\r\n${player.name} has disconnected! You win by forfeit!\r\n`, 'brightGreen'));
  opponentSocket.write(colorize(`You gain ${xpGain} experience!\r\n`, 'yellow'));
  opponentSocket.write(`PVP Record: ${opponent.stats.pvpKills} kills, ${opponent.stats.pvpDeaths} deaths\r\n`);
  opponentSocket.write('\r\n> ');
}

// ============================================
// WORLD RESET CYCLE SYSTEM
// ============================================

// Format time remaining as MM:SS or H:MM:SS
function formatTimeRemaining(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Get time remaining until next world reset
function getCycleTimeRemaining() {
  const elapsed = Date.now() - cycleStartTime;
  const remaining = Math.max(0, CYCLE_DURATION - elapsed);
  return remaining;
}

// Broadcast warning about upcoming reset
function broadcastCycleWarning(minutesLeft) {
  let warningMessage;
  if (minutesLeft >= 10) {
    warningMessage = colorize(`[WORLD RESET] ${minutesLeft} minutes until the world resets!`, 'brightYellow');
  } else if (minutesLeft >= 5) {
    warningMessage = colorize(`[WORLD RESET] ${minutesLeft} minutes until the world resets! Prepare yourselves!`, 'yellow');
  } else {
    warningMessage = colorize(`[WORLD RESET] ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''} until THE PURGE!`, 'brightRed');
  }
  broadcastToAll(warningMessage);
}

// Update cycle leaderboard tracking
function updateCycleLeaderboard(playerName, category, value) {
  if (category === 'xp' && value > cycleLeaderboard.xpGained.value) {
    cycleLeaderboard.xpGained = { name: playerName, value: value };
  } else if (category === 'monsters' && value > cycleLeaderboard.monstersKilled.value) {
    cycleLeaderboard.monstersKilled = { name: playerName, value: value };
  } else if (category === 'gold' && value > cycleLeaderboard.goldEarned.value) {
    cycleLeaderboard.goldEarned = { name: playerName, value: value };
  } else if (category === 'boss') {
    if (!cycleLeaderboard.bossesDefeated.includes(playerName)) {
      cycleLeaderboard.bossesDefeated.push(playerName);
    }
  }
}

// Display the cycle leaderboard
function displayCycleLeaderboard() {
  let leaderboardMsg = '\r\n';
  leaderboardMsg += colorize('==============================================\r\n', 'brightYellow');
  leaderboardMsg += colorize('       CYCLE ' + cycleNumber + ' CHAMPIONS\r\n', 'brightYellow');
  leaderboardMsg += colorize('==============================================\r\n', 'brightYellow');

  if (cycleLeaderboard.xpGained.name) {
    leaderboardMsg += colorize(`Experience Champion: ${cycleLeaderboard.xpGained.name} (${cycleLeaderboard.xpGained.value} XP)\r\n`, 'cyan');
  }
  if (cycleLeaderboard.monstersKilled.name) {
    leaderboardMsg += colorize(`Monster Slayer: ${cycleLeaderboard.monstersKilled.name} (${cycleLeaderboard.monstersKilled.value} kills)\r\n`, 'green');
  }
  if (cycleLeaderboard.goldEarned.name) {
    leaderboardMsg += colorize(`Gold Hunter: ${cycleLeaderboard.goldEarned.name} (${cycleLeaderboard.goldEarned.value} gold)\r\n`, 'yellow');
  }
  if (cycleLeaderboard.bossesDefeated.length > 0) {
    leaderboardMsg += colorize(`Boss Slayers: ${cycleLeaderboard.bossesDefeated.join(', ')}\r\n`, 'magenta');
  }

  if (!cycleLeaderboard.xpGained.name && !cycleLeaderboard.monstersKilled.name && !cycleLeaderboard.goldEarned.name) {
    leaderboardMsg += colorize('No champions this cycle!\r\n', 'dim');
  }

  leaderboardMsg += colorize('==============================================\r\n', 'brightYellow');

  return leaderboardMsg;
}

// Execute the world reset (The Purge)
function executeWorldReset() {
  console.log(`Executing world reset - Cycle ${cycleNumber}`);

  // Display leaderboard to all players
  const leaderboard = displayCycleLeaderboard();
  broadcastToAll(colorize('\r\n[WORLD RESET] THE PURGE HAS BEGUN!', 'brightRed'));
  players.forEach((player, socket) => {
    if (player.isRegistered) {
      socket.write(leaderboard);
    }
  });

  // Clear all monsters
  activeMonsters.length = 0;

  // Reset boss gates - all bosses respawn
  defeatedBosses.clear();

  // Respawn all monsters (including bosses)
  initializeMonsters();

  // Clear all ground items
  Object.keys(roomItems).forEach(key => delete roomItems[key]);

  // Re-seed persistent ground items (Eldoria 2.0)
  initializeRoomItems();

  // Reset all players
  players.forEach((player, socket) => {
    if (player.isRegistered) {
      // Cancel any grace timers
      cancelGracePeriod(player);

      // Exit combat
      player.inCombat = false;
      player.combatTarget = null;
      player.pvpCombatTarget = null;

      // Heal to full
      player.currentHP = player.maxHP;

      // Teleport to starting room
      player.currentRoom = START_ROOM;

      // Reset cycle stats
      player.cycleXPGained = 0;
      player.cycleMonstersKilled = 0;
      player.cycleGoldEarned = 0;
      player.cycleBossesDefeated = [];

      // Re-arm cycle-scoped endgame abilities
      player.cursorJumpUsedThisCycle = false;
      player.globalResetUsedThisCycle = false;

      // Show new room
      socket.write(colorize('\r\nYou have been teleported to the starting chamber and healed!\r\n', 'brightCyan'));
      showRoom(socket, player);
    }
  });

  // Reset leaderboard for next cycle
  cycleLeaderboard.xpGained = { name: null, value: 0 };
  cycleLeaderboard.monstersKilled = { name: null, value: 0 };
  cycleLeaderboard.goldEarned = { name: null, value: 0 };
  cycleLeaderboard.bossesDefeated = [];

  // Start new cycle
  cycleNumber++;
  cycleStartTime = Date.now();

  // Reset quests: clear player quest state, respawn quest items.
  // NPC memory and relationships PERSIST across cycles.
  try {
    questManager.resetAll();
    broadcastToAll(colorize('The realm shifts. Quests fade, but the watchers remember you still.', 'brightMagenta'));
  } catch (err) {
    console.error(`[quests] reset failed: ${err.message}`);
  }

  // Save any dirty NPC brains (they survive restart AND reset)
  try { npcRegistry.saveAllDirty(); } catch (err) { console.error(`[npc] save failed: ${err.message}`); }

  broadcastToAll(colorize(`\r\n[WORLD RESET] Cycle ${cycleNumber} has begun! Good luck, adventurers!`, 'brightGreen'));
  console.log(`World reset complete - Starting Cycle ${cycleNumber}`);
}

// Start the cycle timer system
function startCycleTimer() {
  // Set up warning timer (checks every minute)
  cycleWarningTimer = setInterval(() => {
    if (!cycleResetEnabled) return;

    const remaining = getCycleTimeRemaining();
    const remainingMinutes = Math.floor(remaining / 60000);

    // Check if we should send a warning
    if (CYCLE_WARNING_TIMES.includes(remaining) ||
        (remainingMinutes === 10 && remaining % 60000 < 60000) ||
        (remainingMinutes === 5 && remaining % 60000 < 60000) ||
        (remainingMinutes === 1 && remaining % 60000 < 60000)) {
      broadcastCycleWarning(remainingMinutes);
    }

    // Check if time to reset
    if (remaining <= 0) {
      executeWorldReset();
    }
  }, 30000); // Check every 30 seconds

  // Also set up exact timer for reset
  cycleTimer = setInterval(() => {
    if (!cycleResetEnabled) return;
    if (getCycleTimeRemaining() <= 0) {
      executeWorldReset();
    }
  }, 1000);

  console.log(`World Reset Cycle enabled (${CYCLE_DURATION / 60000} minute cycles)`);
}

// Show player stats (score command)
function showStats(socket, player) {
  const room = rooms[player.currentRoom];
  const roomName = room ? room.name : 'Unknown';
  const totalRooms = Object.keys(rooms).length;

  // Calculate XP progress
  const nextLevelXP = getXPForNextLevel(player.level);
  let xpProgress;
  if (nextLevelXP === null) {
    xpProgress = 'MAX LEVEL';
  } else {
    const xpNeeded = nextLevelXP - player.experience;
    xpProgress = `${player.experience} / ${nextLevelXP} (${xpNeeded} XP to next level)`;
  }

  // Calculate equipment bonuses
  const weaponBonus = getEquippedDamageBonus(player);
  const armorBonus = getEquippedArmorBonus(player);

  // Calculate total damage range
  const totalDmgMin = player.baseDamage.min + 1 + weaponBonus;
  const totalDmgMax = player.baseDamage.max + 5 + weaponBonus;

  socket.write('\r\n');
  socket.write(colorize('=== Character Status ===\r\n', 'brightCyan'));
  socket.write(`Name: ${colorize(getDisplayName(player), 'brightWhite')}\r\n`);
  socket.write(`Title: ${colorize(player.title, 'brightYellow')}\r\n`);
  if (player.suffix) {
    socket.write(`Custom Suffix: "${colorize(player.suffix, 'cyan')}"\r\n`);
  }
  socket.write(`Level: ${colorize(String(player.level), 'green')}\r\n`);
  if (player.charClass && CLASS_DEFS[player.charClass]) {
    socket.write(`Class: ${colorize(CLASS_DEFS[player.charClass].name, 'brightMagenta')}\r\n`);
  }
  socket.write(`Experience: ${xpProgress}\r\n`);
  socket.write(`Health: ${colorize(`${player.currentHP}`, player.currentHP < player.maxHP * 0.3 ? 'red' : 'green')} / ${player.maxHP} HP\r\n`);
  socket.write(`Mana: ${colorize(`${player.currentMana}`, player.currentMana < player.maxMana * 0.3 ? 'yellow' : 'brightCyan')} / ${player.maxMana} MP\r\n`);

  // Show damage with weapon bonus and total range
  socket.write(`Damage: ${player.baseDamage.min}-${player.baseDamage.max} (base) + 1-5 (bonus)`);
  if (weaponBonus > 0) {
    socket.write(colorize(` + ${weaponBonus} (weapon)`, 'cyan'));
  }
  socket.write(` = ${colorize(`${totalDmgMin}-${totalDmgMax}`, 'brightGreen')}\r\n`);

  // Show armor bonus
  if (armorBonus > 0) {
    socket.write(`Armor: ${colorize(`+${armorBonus}`, 'cyan')} damage reduction\r\n`);
  }

  socket.write(`Gold: ${colorize(String(player.gold), 'brightYellow')}\r\n`);

  // Quick equipment summary (8 slots)
  socket.write('\r\n');
  socket.write(colorize('Equipment:\r\n', 'dim'));
  for (const slot of ALL_EQUIP_SLOTS) {
    const it = player.equipped[slot];
    socket.write(`  ${slotLabel(slot)}: ${it ? it.name : colorize('(none)', 'dim')}\r\n`);
  }

  // Statistics section
  socket.write('\r\n');
  socket.write(colorize('=== Statistics ===\r\n', 'brightCyan'));
  socket.write(`Monsters Killed: ${formatNumber(player.stats.monstersKilled)}\r\n`);
  socket.write(`Deaths: ${player.stats.deaths}\r\n`);

  // Bosses defeated
  if (player.stats.bossesDefeated.length > 0) {
    socket.write(`Bosses Defeated: ${colorize(player.stats.bossesDefeated.join(', '), 'brightMagenta')}\r\n`);
  } else {
    socket.write(`Bosses Defeated: ${colorize('None yet', 'dim')}\r\n`);
  }

  const roomsExploredCount = player.stats.roomsExplored ? player.stats.roomsExplored.length : 0;
  socket.write(`Rooms Explored: ${roomsExploredCount} / ${totalRooms}\r\n`);
  socket.write(`Items Collected: ${player.stats.itemsCollected}\r\n`);
  socket.write(`Total Damage Dealt: ${formatNumber(player.stats.totalDamageDealt)}\r\n`);
  socket.write(`Total Damage Taken: ${formatNumber(player.stats.totalDamageTaken)}\r\n`);

  // PVP Statistics
  socket.write('\r\n');
  socket.write(colorize('=== PVP Status ===\r\n', 'brightCyan'));
  socket.write(`Status: ${player.pvpEnabled ? colorize('COMBAT READY', 'brightRed') : colorize('PEACEFUL', 'green')}\r\n`);
  socket.write(`PVP Kills: ${player.stats.pvpKills}\r\n`);
  socket.write(`PVP Deaths: ${player.stats.pvpDeaths}\r\n`);

  // World Reset Cycle
  socket.write('\r\n');
  socket.write(colorize('=== World Reset Cycle ===\r\n', 'brightCyan'));
  const cycleRemaining = getCycleTimeRemaining();
  socket.write(`Cycle: ${colorize(String(cycleNumber), 'brightYellow')}\r\n`);
  socket.write(`Time Until Reset: ${colorize(formatTimeRemaining(cycleRemaining), cycleRemaining < 300000 ? 'brightRed' : 'green')}\r\n`);
  socket.write(`This Cycle - XP: ${player.cycleXPGained}, Kills: ${player.cycleMonstersKilled}, Gold: ${player.cycleGoldEarned}\r\n`);

  // Last saved info
  socket.write('\r\n');
  if (player.lastSaved) {
    socket.write(`Last Saved: ${formatTimeSince(player.lastSaved)}\r\n`);
  }

  socket.write(`Location: ${roomName}\r\n`);

  if (player.inCombat) {
    const monster = getMonsterById(player.combatTarget);
    if (monster) {
      socket.write(colorize(`\r\n  IN COMBAT with ${monster.name} (${monster.hp}/${monster.maxHp} HP)\r\n`, 'brightRed'));
    }
  }
}

// Quick Score - compact status display for mid-combat use
function showQuickScore(socket, player) {
  // Calculate XP progress
  const nextLevelXP = getXPForNextLevel(player.level);
  let xpDisplay;
  if (nextLevelXP === null) {
    xpDisplay = 'MAX LEVEL';
  } else {
    const xpNeeded = nextLevelXP - player.experience;
    xpDisplay = `${player.experience}/${nextLevelXP} (${xpNeeded} to next)`;
  }

  // Calculate equipment damage
  const weaponBonus = getEquippedDamageBonus(player);
  const armorBonus = getEquippedArmorBonus(player);
  const totalDmgMin = player.baseDamage.min + 1 + weaponBonus;
  const totalDmgMax = player.baseDamage.max + 5 + weaponBonus;

  // Cycle time
  const cycleRemaining = getCycleTimeRemaining();

  socket.write('\r\n');
  socket.write(colorize('=== Quick Status ===\r\n', 'brightCyan'));
  socket.write(`Name: ${colorize(getDisplayName(player), 'brightWhite')} | Title: ${colorize(player.title, 'yellow')} | Level: ${colorize(String(player.level), 'green')}\r\n`);
  socket.write(`XP: ${xpDisplay}\r\n`);

  // HP with warning if low
  const hpColor = player.currentHP < player.maxHP * 0.3 ? 'brightRed' :
                  player.currentHP < player.maxHP * 0.6 ? 'yellow' : 'green';
  const hpWarning = player.currentHP < player.maxHP * 0.3 ? colorize(' LOW!', 'brightRed') : '';
  const manaColor = player.currentMana < player.maxMana * 0.3 ? 'yellow' : 'brightCyan';
  socket.write(`HP: ${colorize(`${player.currentHP}/${player.maxHP}`, hpColor)}${hpWarning} | MP: ${colorize(`${player.currentMana}/${player.maxMana}`, manaColor)} | Gold: ${colorize(String(player.gold), 'brightYellow')}\r\n`);

  // Equipment damage
  socket.write(`Equipment Damage: ${player.baseDamage.min}-${player.baseDamage.max} (base) + 1-5 (bonus)`);
  if (weaponBonus > 0) socket.write(colorize(` + ${weaponBonus} (wpn)`, 'cyan'));
  socket.write(` = ${colorize(`${totalDmgMin}-${totalDmgMax}`, 'brightGreen')}\r\n`);

  // Current loadout
  socket.write('Current Loadout:\r\n');
  for (const slot of ALL_EQUIP_SLOTS) {
    const item = player.equipped[slot];
    const name = item ? colorize(item.name, 'brightWhite') : colorize('(none)', 'dim');
    socket.write(`  ${slotLabel(slot)}: ${name}\r\n`);
  }

  // PVP and Cycle
  socket.write(`PVP: ${player.pvpEnabled ? colorize('COMBAT READY', 'brightRed') : colorize('PEACEFUL', 'green')} | Cycle: ${colorize(formatTimeRemaining(cycleRemaining), cycleRemaining < 300000 ? 'brightRed' : 'green')} remaining\r\n`);

  // Combat status
  if (isInMonsterCombat(player)) {
    const combat = getMonsterCombatByPlayer(player.name);
    if (combat) {
      const monster = getMonsterById(combat.combat.monster.id);
      if (monster) {
        socket.write(colorize(`COMBAT: vs ${monster.name} (${monster.hp}/${monster.maxHp} HP)\r\n`, 'brightRed'));
      }
    }
  } else if (isInPvpCombat(player)) {
    socket.write(colorize('COMBAT: PVP in progress!\r\n', 'brightRed'));
  }
}

// Show all levels and XP requirements
function showLevels(socket, player) {
  socket.write('\r\n');
  socket.write(colorize('=== Level Progression ===\r\n', 'brightCyan'));
  socket.write('\r\n');

  LEVEL_TABLE.forEach(levelData => {
    const isCurrent = levelData.level === player.level;
    const marker = isCurrent ? colorize(' ◄ YOU', 'brightGreen') : '';

    // Format XP with padding for alignment
    const xpStr = String(levelData.xp).padStart(5, ' ');
    const hpStr = String(levelData.hp).padStart(3, ' ');
    const dmgStr = `${levelData.dmgMin}-${levelData.dmgMax}`.padStart(5, ' ');

    if (isCurrent) {
      socket.write(colorize(`Lv${String(levelData.level).padStart(2, ' ')} | ${xpStr} XP | ${hpStr} HP | ${dmgStr} dmg | ${levelData.title}${marker}\r\n`, 'brightGreen'));
    } else if (levelData.level < player.level) {
      socket.write(colorize(`Lv${String(levelData.level).padStart(2, ' ')} | ${xpStr} XP | ${hpStr} HP | ${dmgStr} dmg | ${levelData.title}\r\n`, 'dim'));
    } else {
      socket.write(`Lv${String(levelData.level).padStart(2, ' ')} | ${xpStr} XP | ${hpStr} HP | ${dmgStr} dmg | ${levelData.title}\r\n`);
    }
  });

  socket.write('\r\n');
  const nextLevel = getXPForNextLevel(player.level);
  if (nextLevel) {
    const xpNeeded = nextLevel - player.experience;
    socket.write(`Your XP: ${player.experience} | Next level in ${colorize(String(xpNeeded), 'yellow')} XP\r\n`);
  } else {
    socket.write(colorize('You have achieved the maximum level!\r\n', 'brightYellow'));
  }
}

// ============================================
// INVENTORY COMMANDS
// ============================================

// Handle get/take command
function handleGet(socket, player, itemName) {
  if (player.inCombat) {
    socket.write(colorize("You can't pick up items while in combat!\r\n", 'red'));
    return;
  }

  if (!itemName || itemName.trim() === '') {
    socket.write('Get what? Usage: get [item name]\r\n');
    return;
  }

  // Find the item in the room
  const found = findItemInRoom(player.currentRoom, itemName.trim());
  if (!found) {
    socket.write(`You don't see "${itemName}" here.\r\n`);
    return;
  }

  // Check inventory space
  if (player.inventory.length >= getInventoryCap(player)) {
    socket.write('Your inventory is full! Drop something first.\r\n');
    return;
  }

  // Pick up the item
  const item = removeItemFromRoom(player.currentRoom, found.index);
  player.inventory.push(item);

  // Track items collected
  player.stats.itemsCollected++;
  player.sessionItemsCollected++;

  socket.write(colorize(`You pick up ${item.name}.\r\n`, 'green'));
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} picks up ${item.name}.`, socket);

  // Quest objective: item_pickup (use item.id, which quest items set)
  if (item && item.id) {
    const changes = questManager.updateObjective(player.name, 'item_pickup', item.id, 1);
    for (const ch of changes) {
      if (ch.readyToTurnIn) {
        socket.write(colorize(`[Quest ready: ${ch.def.title} - return to ${ch.def.giver}]\r\n`, 'brightYellow'));
      }
    }
  }
}

// Handle drop command
function handleDrop(socket, player, itemName) {
  if (player.inCombat) {
    socket.write(colorize("You can't drop items while in combat!\r\n", 'red'));
    return;
  }

  if (!itemName || itemName.trim() === '') {
    socket.write('Drop what? Usage: drop [item name]\r\n');
    return;
  }

  // Find the item in inventory
  const found = findItemInInventory(player, itemName.trim());
  if (!found) {
    socket.write(`You don't have "${itemName}".\r\n`);
    return;
  }

  // Drop the item
  const item = player.inventory.splice(found.index, 1)[0];
  addItemToRoom(player.currentRoom, item);

  socket.write(colorize(`You drop ${item.name}.\r\n`, 'yellow'));
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} drops ${item.name}.`, socket);
}

// Handle give command - give item to another player
function handleGive(socket, player, args) {
  if (player.inCombat) {
    socket.write(colorize("You can't give items while in combat!\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: give <item> to <player>  OR  give <player> <item>\r\n');
    return;
  }

  // Parse command - handle multiple formats
  let itemName, targetName;
  const trimmedArgs = args.trim().toLowerCase();

  // Check if "to" is present: "give sword to alice"
  const toIndex = trimmedArgs.indexOf(' to ');

  if (toIndex > 0) {
    // Format: give <item> to <player>
    itemName = trimmedArgs.substring(0, toIndex).trim();
    targetName = trimmedArgs.substring(toIndex + 4).trim();
  } else {
    // Format: give <player> <item> OR give <item> <player>
    const parts = trimmedArgs.split(/\s+/);
    if (parts.length < 2) {
      socket.write('Usage: give <item> to <player>  OR  give <player> <item>\r\n');
      return;
    }

    // Try to find a player in the room matching the first word
    const playersHere = getPlayersInRoom(player.currentRoom, socket);
    const firstWordPlayer = playersHere.find(p =>
      p.name.toLowerCase() === parts[0]
    );

    if (firstWordPlayer) {
      // Found player as first word: give alice sword
      targetName = parts[0];
      itemName = parts.slice(1).join(' ');
    } else {
      // Assume item first, player last: give sword alice
      itemName = parts.slice(0, -1).join(' ');
      targetName = parts[parts.length - 1];
    }
  }

  // Validate item name and target
  if (!itemName || !targetName) {
    socket.write('Usage: give <item> to <player>\r\n');
    return;
  }

  // Find target player in same room
  const playersHere = getPlayersInRoom(player.currentRoom, socket);
  const targetPlayer = playersHere.find(p =>
    p.name.toLowerCase() === targetName.toLowerCase()
  );

  if (!targetPlayer) {
    // Try partial name match
    const partialMatch = playersHere.find(p =>
      p.name.toLowerCase().includes(targetName.toLowerCase())
    );
    if (!partialMatch) {
      socket.write(`${targetName} is not here.\r\n`);
      return;
    }
    // Use the partial match
    targetName = partialMatch.name.toLowerCase();
  }

  // Can't give to yourself
  if (targetName.toLowerCase() === player.name.toLowerCase()) {
    socket.write("You can't give items to yourself!\r\n");
    return;
  }

  // Get target player object properly
  let targetPlayerObj = null;
  let targetSocket = null;
  for (const [s, p] of players) {
    if (p.name.toLowerCase() === targetName.toLowerCase() && p.currentRoom === player.currentRoom) {
      targetPlayerObj = p;
      targetSocket = s;
      break;
    }
  }

  if (!targetPlayerObj) {
    socket.write(`${targetName} is not here.\r\n`);
    return;
  }

  // Find item in player's inventory
  const found = findItemInInventory(player, itemName);
  if (!found) {
    socket.write(`You don't have "${itemName}".\r\n`);
    return;
  }

  // Check if target inventory is full
  if (targetPlayerObj.inventory.length >= getInventoryCap(targetPlayerObj)) {
    socket.write(`${getDisplayName(targetPlayerObj)}'s inventory is full!\r\n`);
    return;
  }

  // Transfer item
  const item = player.inventory.splice(found.index, 1)[0];
  targetPlayerObj.inventory.push(item);

  // Messages
  socket.write(colorize(`You give ${item.name} to ${getDisplayName(targetPlayerObj)}.\r\n`, 'yellow'));
  unlockAchievement(socket, player, 'helped');
  targetSocket.write(colorize(`${getDisplayName(player)} gives you ${item.name}!\r\n`, 'brightGreen'));

  // Broadcast to room (excluding both giver and receiver)
  for (const [s, p] of players) {
    if (s !== socket && s !== targetSocket && p.currentRoom === player.currentRoom && p.authenticated) {
      s.write(`${getDisplayName(player)} gives ${item.name} to ${getDisplayName(targetPlayerObj)}.\r\n`);
    }
  }

  // Save both players
  savePlayer(player, socket, false);
  savePlayer(targetPlayerObj, targetSocket, false);
}

// Handle inventory command
function showInventory(socket, player) {
  socket.write('\r\n');
  socket.write(colorize('=== Inventory ===\r\n', 'brightCyan'));
  socket.write(colorize(`Gold: ${player.gold}\r\n`, 'brightYellow'));
  socket.write(`Capacity: ${player.inventory.length}/${getInventoryCap(player)}\r\n\r\n`);

  if (player.inventory.length === 0) {
    socket.write('Your inventory is empty.\r\n');
  } else {
    player.inventory.forEach((item, index) => {
      const typeTag = item.type === 'consumable' ? colorize(' [USE]', 'green') :
                      (item.type === 'weapon' || item.type === 'armor' || item.type === 'shield') ?
                      colorize(' [EQUIP]', 'cyan') : '';
      socket.write(`${index + 1}. ${item.name}${typeTag} - ${item.value}g\r\n`);
    });
  }
}

// Handle equipment command
function showEquipment(socket, player) {
  socket.write('\r\n');
  socket.write(colorize('=== Equipment ===\r\n', 'brightCyan'));

  for (const slot of ALL_EQUIP_SLOTS) {
    const item = player.equipped[slot];
    if (item) {
      const bonus = slot === 'weapon'
        ? `(+${item.damageBonus || 0} damage)`
        : `(+${item.armorBonus || 0} armor)`;
      socket.write(`${slotLabel(slot)}: ${colorize(item.name, 'brightWhite')} ${bonus}\r\n`);
    } else {
      socket.write(`${slotLabel(slot)}: ${colorize('(empty)', 'dim')}\r\n`);
    }
  }

  // Show totals
  const totalDmgBonus = getEquippedDamageBonus(player);
  const totalArmorBonus = getEquippedArmorBonus(player);
  socket.write('\r\n');
  socket.write(`Total Damage Bonus: +${totalDmgBonus}\r\n`);
  socket.write(`Total Armor Bonus: +${totalArmorBonus}\r\n`);
}

// Handle equip command
function handleEquip(socket, player, itemName) {
  if (player.inCombat) {
    socket.write(colorize("You can't change equipment while in combat!\r\n", 'red'));
    return;
  }

  if (!itemName || itemName.trim() === '') {
    socket.write('Equip what? Usage: equip [item name]\r\n');
    return;
  }

  // Find the item in inventory
  const found = findItemInInventory(player, itemName.trim());
  if (!found) {
    socket.write(`You don't have "${itemName}".\r\n`);
    return;
  }

  const item = found.item;
  const slot = getEquipmentSlot(item);

  if (!slot) {
    socket.write(`You can't equip ${item.name}.\r\n`);
    return;
  }

  // Check level / tier requirements
  if (!canEquipItem(player, item)) {
    const reason = (typeof equipRejectReason === 'function' && equipRejectReason(player, item))
      || `You cannot equip ${item.name}.`;
    socket.write(colorize(`${reason}\r\n`, 'red'));
    return;
  }

  // Unequip current item if slot is occupied
  if (player.equipped[slot]) {
    const oldItem = player.equipped[slot];
    player.inventory.push(oldItem);
    socket.write(`You unequip ${oldItem.name}.\r\n`);
  }

  // Remove from inventory and equip
  player.inventory.splice(found.index, 1);
  player.equipped[slot] = item;

  const bonusText = item.damageBonus ? `+${item.damageBonus} damage` : `+${item.armorBonus} armor`;
  socket.write(colorize(`You equip ${item.name} (${bonusText}).\r\n`, 'green'));
}

// Handle unequip command
function handleUnequip(socket, player, slotName) {
  if (player.inCombat) {
    socket.write(colorize("You can't change equipment while in combat!\r\n", 'red'));
    return;
  }

  if (!slotName || slotName.trim() === '') {
    socket.write(`Unequip what? Usage: unequip [${ALL_EQUIP_SLOTS.join('/')}]\r\n`);
    return;
  }

  const slot = slotName.toLowerCase().trim();
  if (!ALL_EQUIP_SLOTS.includes(slot)) {
    socket.write(`Invalid slot. Use: unequip [${ALL_EQUIP_SLOTS.join('/')}]\r\n`);
    return;
  }

  if (!player.equipped[slot]) {
    socket.write(`You don't have anything equipped in that slot.\r\n`);
    return;
  }

  // Check inventory space
  if (player.inventory.length >= getInventoryCap(player)) {
    socket.write('Your inventory is full! Drop something first.\r\n');
    return;
  }

  const item = player.equipped[slot];
  player.equipped[slot] = null;
  player.inventory.push(item);

  socket.write(colorize(`You unequip ${item.name}.\r\n`, 'yellow'));
}

// Handle use/drink command for consumables
function handleUse(socket, player, itemName) {
  if (!itemName || itemName.trim() === '') {
    socket.write('Use what? Usage: use [item name] or drink [potion name]\r\n');
    return;
  }

  // Find the item in inventory
  const found = findItemInInventory(player, itemName.trim());
  if (!found) {
    socket.write(`You don't have "${itemName}".\r\n`);
    return;
  }

  const item = found.item;

  // Check if it's consumable
  if (item.type !== 'consumable') {
    socket.write(`You can't use ${item.name}. It's not a consumable item.\r\n`);
    return;
  }

  // Remove from inventory
  player.inventory.splice(found.index, 1);

  // Apply healing
  const healAmount = item.healAmount || 0;
  const manaAmount = item.manaAmount || 0;

  let healMessage = '';
  let manaMessage = '';

  if (healAmount > 0) {
    const oldHP = player.currentHP;
    player.currentHP = Math.min(player.maxHP, player.currentHP + healAmount);
    const actualHeal = player.currentHP - oldHP;
    if (actualHeal > 0) {
      healMessage = colorize(`You recover ${actualHeal} HP! (${player.currentHP}/${player.maxHP})\r\n`, 'brightGreen');
    } else {
      healMessage = "You're already at full health!\r\n";
    }
  }

  if (manaAmount > 0) {
    const oldMana = player.currentMana;
    player.currentMana = Math.min(player.maxMana, player.currentMana + manaAmount);
    const actualMana = player.currentMana - oldMana;
    if (actualMana > 0) {
      manaMessage = colorize(`You recover ${actualMana} mana! (${player.currentMana}/${player.maxMana})\r\n`, 'brightCyan');
    } else {
      manaMessage = "You're already at full mana!\r\n";
    }
  }

  socket.write(colorize(`You use ${item.name}.\r\n`, 'green'));
  if (healMessage) socket.write(healMessage);
  if (manaMessage) socket.write(manaMessage);

  // Tier 3.1 Phase 6: Static Tea applies a +2 hack-skill buff for 5 minutes
  if (item.id === 'static_tea') {
    if (!player.effects) player.effects = {};
    player.effects['hack_buff'] = { amount: 2, expiresAt: Date.now() + 5 * 60 * 1000 };
    socket.write(colorize('A faint static settles in your fingertips. (+2 hack skill for 5 minutes.)\r\n', 'brightCyan'));
  }

  // If no other effect fired, generic message
  if (!healMessage && !manaMessage && item.id !== 'static_tea') {
    socket.write("The item seems to have no effect.\r\n");
  }
}

// Handle examine command
function handleExamine(socket, player, itemName) {
  if (!itemName || itemName.trim() === '') {
    socket.write('Examine what? Usage: examine [item name]\r\n');
    return;
  }

  // Check inventory first
  let found = findItemInInventory(player, itemName.trim());
  if (!found) {
    // Check room
    found = findItemInRoom(player.currentRoom, itemName.trim());
  }

  if (!found) {
    socket.write(`You don't see "${itemName}" here or in your inventory.\r\n`);
    return;
  }

  const item = found.item;
  socket.write('\r\n');
  socket.write(colorize(`=== ${item.name} ===\r\n`, 'brightCyan'));
  socket.write(`Type: ${item.type}\r\n`);
  socket.write(`${item.description}\r\n`);

  if (item.levelReq > 0) {
    const canUse = player.level >= item.levelReq;
    const color = canUse ? 'green' : 'red';
    socket.write(colorize(`Level Required: ${item.levelReq}\r\n`, color));
  }

  if (item.damageBonus > 0) {
    socket.write(colorize(`Damage Bonus: +${item.damageBonus}\r\n`, 'yellow'));
  }

  if (item.armorBonus > 0) {
    socket.write(colorize(`Armor Bonus: +${item.armorBonus}\r\n`, 'yellow'));
  }

  if (item.healAmount > 0) {
    socket.write(colorize(`Heals: ${item.healAmount} HP\r\n`, 'green'));
  }

  if (item.manaAmount > 0) {
    socket.write(colorize(`Restores: ${item.manaAmount} Mana\r\n`, 'brightCyan'));
  }

  socket.write(`Value: ${item.value} gold\r\n`);
}

// ============================================
// MULTIPLAYER COMMUNICATION
// ============================================

// Handle say command (local chat)
function handleSay(socket, player, message) {
  if (!message || message.trim() === '') {
    socket.write('Say what? Usage: say [message] or \' [message]\r\n');
    return;
  }
  player.lastChatAt = Date.now();

  const text = message.trim();
  socket.write(`You say: ${colorize(text, 'white')}\r\n`);

  // Send to all other players in the room
  const playersHere = getPlayersInRoom(player.currentRoom, socket);
  playersHere.forEach(({ player: otherPlayer, socket: otherSocket }) => {
    // Check if player is ignoring the speaker
    if (!otherPlayer.ignoreList.includes(player.name.toLowerCase())) {
      otherSocket.write(`\r\n${colorize(getDisplayName(player), 'brightWhite')} says: ${colorize(text, 'white')}\r\n> `);
    }
  });
}

// Handle shout command (global chat)
function handleShout(socket, player, message) {
  if (!message || message.trim() === '') {
    socket.write('Shout what? Usage: shout [message] or ! [message]\r\n');
    return;
  }
  player.lastChatAt = Date.now();

  const text = message.trim();
  socket.write(`You shout: ${colorize(text, 'red')}\r\n`);

  // Send to all other online players
  players.forEach((otherPlayer, otherSocket) => {
    if (otherPlayer.isRegistered && otherSocket !== socket) {
      // Check if player is ignoring the shouter
      if (!otherPlayer.ignoreList.includes(player.name.toLowerCase())) {
        otherSocket.write(`\r\n${colorize(getDisplayName(player), 'brightWhite')} shouts: ${colorize(text, 'red')}\r\n> `);
      }
    }
  });
}

// Handle tell command (private messages)
function handleTell(socket, player, args) {
  if (!args || args.trim() === '') {
    socket.write('Tell whom? Usage: tell [player] [message]\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  const targetName = parts[0];
  const message = parts.slice(1).join(' ');

  if (!message || message.trim() === '') {
    socket.write('Tell them what? Usage: tell [player] [message]\r\n');
    return;
  }

  // Check if telling yourself
  if (targetName.toLowerCase() === player.name.toLowerCase()) {
    socket.write('Talking to yourself? Try \'say\' instead!\r\n');
    return;
  }

  // Find target player
  const target = findPlayerByName(targetName);
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  // Check if target is ignoring sender
  if (target.player.ignoreList.includes(player.name.toLowerCase())) {
    // Silently fail - sender doesn't know they're ignored
    socket.write(`You tell ${target.player.name}: ${colorize(message, 'magenta')}\r\n`);
    return;
  }

  // Check if sender is ignoring target (prevent awkward situations)
  if (player.ignoreList.includes(target.player.name.toLowerCase())) {
    socket.write(`You are ignoring ${target.player.name}. Unignore them first.\r\n`);
    return;
  }

  // Send message
  socket.write(`You tell ${colorize(getDisplayName(target.player), 'brightMagenta')}: ${colorize(message, 'magenta')}\r\n`);
  target.socket.write(`\r\n${colorize(getDisplayName(player), 'brightMagenta')} tells you: ${colorize(message, 'magenta')}\r\n> `);

  // Check if target is AFK
  if (target.player.isAFK) {
    const afkMsg = target.player.afkMessage ? `: ${target.player.afkMessage}` : '';
    socket.write(colorize(`${target.player.name} is AFK${afkMsg}\r\n`, 'dim'));
  }
}

// Handle emote command (roleplay actions)
function handleEmote(socket, player, action) {
  if (!action || action.trim() === '') {
    socket.write('Emote what? Usage: emote [action] or : [action]\r\n');
    return;
  }

  const text = action.trim();
  socket.write(`${colorize(getDisplayName(player), 'brightCyan')} ${text}\r\n`);

  // Send to all other players in the room
  const playersHere = getPlayersInRoom(player.currentRoom, socket);
  playersHere.forEach(({ player: otherPlayer, socket: otherSocket }) => {
    if (!otherPlayer.ignoreList.includes(player.name.toLowerCase())) {
      otherSocket.write(`\r\n${colorize(getDisplayName(player), 'brightCyan')} ${text}\r\n> `);
    }
  });
}

// Handle who command (online players list)
function handleWho(socket, player) {
  const online = getOnlinePlayers();

  // Filter out invisible players (unless viewer is admin or it's themselves)
  const viewerIsAdmin = isAdmin(player.name);
  const visiblePlayers = online.filter(({ player: p }) => {
    if (p.name === player.name) return true; // Always see yourself
    if (viewerIsAdmin) return true; // Admins see everyone
    return !p.isInvisible; // Hide invisible players from non-admins
  });

  socket.write('\r\n');
  socket.write(colorize(`=== Players Online (${visiblePlayers.length}) ===\r\n`, 'brightCyan'));
  socket.write('\r\n');

  if (visiblePlayers.length === 0) {
    socket.write('No one is online.\r\n');
    return;
  }

  // Sort by level descending
  visiblePlayers.sort((a, b) => b.player.level - a.player.level);

  visiblePlayers.forEach(({ player: p }) => {
    const room = rooms[p.currentRoom];
    const zoneName = room ? room.zone : 'Unknown';
    const displayName = getDisplayName(p);
    const nameCol = displayName.padEnd(25);
    const levelCol = `Lv${String(p.level).padStart(2, ' ')}`.padEnd(5);
    const titleCol = p.title.padEnd(22);
    const afkTag = p.isAFK ? colorize(' (AFK)', 'dim') : '';
    const combatTag = p.inCombat ? colorize(' [Combat]', 'red') : '';
    const invisTag = p.isInvisible ? colorize(' [INVIS]', 'dim') : '';

    const isYou = p.name === player.name ? colorize(' ◄ YOU', 'green') : '';

    socket.write(`${colorize(nameCol, 'brightWhite')} | ${levelCol} ${titleCol} | ${zoneName}${afkTag}${combatTag}${invisTag}${isYou}\r\n`);
  });

  socket.write('\r\n');
  socket.write(`Total: ${visiblePlayers.length} adventurer${visiblePlayers.length !== 1 ? 's' : ''} exploring the Shattered Realms\r\n`);
}

// Handle whois command (player details)
function handleWhois(socket, player, targetName) {
  if (!targetName || targetName.trim() === '') {
    socket.write('Whois whom? Usage: whois [player]\r\n');
    return;
  }

  const target = findPlayerByName(targetName.trim());
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  const p = target.player;
  const room = rooms[p.currentRoom];
  const roomName = room ? room.name : 'Unknown';
  const zoneName = room ? room.zone : 'Unknown';

  socket.write('\r\n');
  socket.write(colorize(`=== ${getDisplayName(p)} - ${p.title} ===\r\n`, 'brightCyan'));
  socket.write(`Level: ${p.level}\r\n`);
  socket.write(`Title: ${p.title}\r\n`);
  if (p.suffix) {
    socket.write(`Custom Suffix: "${colorize(p.suffix, 'cyan')}"\r\n`);
  }
  socket.write(`Location: ${roomName} (${zoneName})\r\n`);

  // Status
  if (p.isAFK) {
    const afkMsg = p.afkMessage ? `: ${p.afkMessage}` : '';
    socket.write(`Status: ${colorize(`AFK${afkMsg}`, 'dim')}\r\n`);
  } else if (p.inCombat) {
    const monster = getMonsterById(p.combatTarget);
    if (monster) {
      socket.write(`Status: ${colorize(`In Combat with ${monster.name}`, 'red')}\r\n`);
    } else {
      socket.write(`Status: ${colorize('In Combat', 'red')}\r\n`);
    }
  } else {
    socket.write(`Status: ${colorize('Active', 'green')}\r\n`);
  }

  // Statistics
  socket.write('\r\n');
  socket.write(colorize('Statistics:\r\n', 'dim'));
  socket.write(`  Monsters Killed: ${p.stats.monstersKilled}\r\n`);
  if (p.stats.bossesDefeated.length > 0) {
    socket.write(`  Bosses Defeated: ${colorize(p.stats.bossesDefeated.join(', '), 'brightMagenta')}\r\n`);
  }
  socket.write(`  Deaths: ${p.stats.deaths}\r\n`);

  // Equipment
  socket.write('\r\n');
  socket.write(colorize('Currently Equipped:\r\n', 'dim'));
  for (const slot of ALL_EQUIP_SLOTS) {
    const item = p.equipped[slot];
    if (!item) continue;
    const bonus = slot === 'weapon'
      ? `(+${item.damageBonus || 0} damage)`
      : `(+${item.armorBonus || 0} armor)`;
    socket.write(`  ${slotLabel(slot)}: ${item.name} ${bonus}\r\n`);
  }
}

// Handle player score command (analyze another player in the room)
function handlePlayerScore(socket, player, target) {
  const p = target.player;
  const room = rooms[p.currentRoom];
  const roomName = room ? room.name : 'Unknown';
  const zoneName = room ? room.zone : 'Unknown';

  socket.write('\r\n');
  socket.write(colorize('========================================\r\n', 'brightCyan'));
  socket.write(colorize(`  PLAYER ANALYSIS: ${getDisplayName(p).substring(0, 18)}\r\n`, 'brightCyan'));
  socket.write(colorize('========================================\r\n', 'brightCyan'));

  // Basic info
  socket.write('\r\n');
  socket.write(colorize('Identity:\r\n', 'brightWhite'));
  socket.write(`  Name: ${colorize(getDisplayName(p), 'brightYellow')}\r\n`);
  socket.write(`  Level: ${colorize(String(p.level), 'brightGreen')} (${p.title})\r\n`);
  if (p.suffix) {
    socket.write(`  Custom Title: "${colorize(p.suffix, 'cyan')}"\r\n`);
  }
  socket.write(`  Location: ${roomName} (${zoneName})\r\n`);

  // Status
  socket.write('\r\n');
  socket.write(colorize('Status:\r\n', 'brightWhite'));
  if (p.isAFK) {
    const afkMsg = p.afkMessage ? `: ${p.afkMessage}` : '';
    socket.write(`  ${colorize(`[AFK${afkMsg}]`, 'dim')}\r\n`);
  } else if (p.inCombat) {
    const monster = getMonsterById(p.combatTarget);
    if (monster) {
      socket.write(`  ${colorize(`[In Combat with ${monster.name}]`, 'red')}\r\n`);
    } else if (p.pvpCombatTarget) {
      socket.write(`  ${colorize(`[In PVP Combat]`, 'brightRed')}\r\n`);
    } else {
      socket.write(`  ${colorize('[In Combat]', 'red')}\r\n`);
    }
  } else {
    socket.write(`  ${colorize('[Active]', 'green')}\r\n`);
  }

  // PVP status
  if (p.pvpEnabled) {
    socket.write(`  ${colorize('[PVP ENABLED - COMBAT READY]', 'brightRed')}\r\n`);
  } else {
    socket.write(`  ${colorize('[Peaceful]', 'green')}\r\n`);
  }

  // Combat Statistics
  socket.write('\r\n');
  socket.write(colorize('Combat Record:\r\n', 'brightWhite'));
  socket.write(`  Monsters Slain: ${colorize(String(p.stats.monstersKilled), 'yellow')}\r\n`);
  socket.write(`  Deaths: ${colorize(String(p.stats.deaths), 'red')}\r\n`);
  socket.write(`  PVP Victories: ${colorize(String(p.stats.pvpKills || 0), 'brightGreen')}\r\n`);
  socket.write(`  PVP Defeats: ${colorize(String(p.stats.pvpDeaths || 0), 'brightRed')}\r\n`);

  if (p.stats.bossesDefeated && p.stats.bossesDefeated.length > 0) {
    socket.write(`  Bosses Defeated: ${colorize(p.stats.bossesDefeated.join(', '), 'brightMagenta')}\r\n`);
  }

  // Equipment
  socket.write('\r\n');
  socket.write(colorize('Equipment:\r\n', 'brightWhite'));
  for (const slot of ALL_EQUIP_SLOTS) {
    const item = p.equipped[slot];
    if (item) {
      const color = slot === 'weapon' ? 'yellow' : 'cyan';
      const bonus = slot === 'weapon'
        ? `(+${item.damageBonus || 0} dmg)`
        : `(+${item.armorBonus || 0} armor)`;
      socket.write(`  ${slotLabel(slot)}: ${colorize(item.name, color)} ${bonus}\r\n`);
    } else if (slot === 'weapon') {
      socket.write(`  ${slotLabel(slot)}: ${colorize('(unarmed)', 'dim')}\r\n`);
    }
  }

  socket.write('\r\n');
}

// Handle mysuffix command - show player's current suffix
function handleMySuffix(socket, player) {
  socket.write('\r\n');
  socket.write(colorize('=== Your Custom Title ===\r\n', 'brightCyan'));
  socket.write(`Your name: ${colorize(player.name, 'brightWhite')}\r\n`);

  if (player.suffix) {
    socket.write(`Your suffix: ${colorize(player.suffix, 'brightYellow')}\r\n`);
    socket.write(`Full display: ${colorize(getDisplayName(player), 'brightGreen')}\r\n`);
  } else {
    socket.write(`Your suffix: ${colorize('(none)', 'dim')}\r\n`);
    socket.write(`Full display: ${colorize(player.name, 'brightGreen')}\r\n`);
  }

  socket.write('\r\n');
  socket.write(colorize('Note: Suffixes are granted by admins for special achievements.\r\n', 'dim'));
}

// Handle AFK command
function handleAFK(socket, player, message) {
  if (player.isAFK) {
    // Already AFK, toggle off
    player.isAFK = false;
    player.afkMessage = '';
    socket.write(colorize('You are no longer AFK.\r\n', 'green'));
    broadcastToRoom(player.currentRoom, `${getDisplayName(player)} is back!`, socket);
  } else {
    // Set AFK
    player.isAFK = true;
    player.afkMessage = message ? message.trim() : '';
    const afkMsg = player.afkMessage ? `: ${player.afkMessage}` : '';
    socket.write(colorize(`You are now AFK${afkMsg}\r\n`, 'dim'));
    broadcastToRoom(player.currentRoom, `${getDisplayName(player)} is now AFK${afkMsg}`, socket);
  }
}

// Handle back command (remove AFK)
function handleBack(socket, player) {
  if (!player.isAFK) {
    socket.write("You're not AFK.\r\n");
    return;
  }
  player.isAFK = false;
  player.afkMessage = '';
  socket.write(colorize('You are no longer AFK. Welcome back!\r\n', 'green'));
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} is back!`, socket);
}

// Handle ignore command
function handleIgnore(socket, player, targetName) {
  if (!targetName || targetName.trim() === '') {
    // Show ignore list
    if (player.ignoreList.length === 0) {
      socket.write('You are not ignoring anyone.\r\n');
    } else {
      socket.write(`Ignoring: ${player.ignoreList.join(', ')}\r\n`);
    }
    return;
  }

  const name = targetName.trim().toLowerCase();

  // Can't ignore yourself
  if (name === player.name.toLowerCase()) {
    socket.write("You can't ignore yourself!\r\n");
    return;
  }

  // Check if already ignoring
  if (player.ignoreList.includes(name)) {
    socket.write(`You are already ignoring ${targetName}.\r\n`);
    return;
  }

  player.ignoreList.push(name);
  socket.write(colorize(`You are now ignoring ${targetName}.\r\n`, 'yellow'));
}

// Handle unignore command
function handleUnignore(socket, player, targetName) {
  if (!targetName || targetName.trim() === '') {
    socket.write('Unignore whom? Usage: unignore [player]\r\n');
    return;
  }

  const name = targetName.trim().toLowerCase();
  const index = player.ignoreList.indexOf(name);

  if (index === -1) {
    socket.write(`You are not ignoring ${targetName}.\r\n`);
    return;
  }

  player.ignoreList.splice(index, 1);
  socket.write(colorize(`You are no longer ignoring ${targetName}.\r\n`, 'green'));
}

// ============================================
// ADMIN COMMANDS
// ============================================

// Admin status / server status command
function handleAdminStatus(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  const uptime = formatUptime(Date.now() - serverStartTime);
  const onlinePlayers = getOnlinePlayers();
  const memUsage = process.memoryUsage();
  const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);

  // Count save files
  let saveFileCount = 0;
  try {
    if (fs.existsSync(PLAYERS_DIR)) {
      const files = fs.readdirSync(PLAYERS_DIR);
      saveFileCount = files.filter(f => f.endsWith('.json')).length;
    }
  } catch (err) {
    saveFileCount = 0;
  }

  socket.write('\r\n');
  socket.write(colorize('=== Server Status ===\r\n', 'brightCyan'));
  socket.write(`Uptime: ${uptime}\r\n`);
  socket.write(`Active Players: ${onlinePlayers.length}\r\n`);
  socket.write(`Active Monsters: ${activeMonsters.length}\r\n`);
  socket.write(`Total Rooms: ${Object.keys(rooms).length}\r\n`);
  socket.write(`Memory Usage: ${memMB} MB\r\n`);
  socket.write(`Save Files: ${saveFileCount} characters\r\n`);

  if (recentActivity.length > 0) {
    socket.write('\r\n');
    socket.write(colorize('Recent Activity:\r\n', 'yellow'));
    recentActivity.slice(0, 5).forEach(activity => {
      const timeAgo = formatTimeSince(activity.timestamp);
      socket.write(`  ${activity.message} (${timeAgo})\r\n`);
    });
  }
}

// Shutdown command
function handleShutdown(socket, player, message) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  const shutdownMessage = message || 'Server shutting down...';

  // Broadcast warning to all players
  socket.write(colorize('Initiating server shutdown...\r\n', 'red'));
  broadcastToAll(colorize(`[SERVER] ${shutdownMessage}`, 'red'));
  broadcastToAll(colorize('[SERVER] Server will shut down in 10 seconds. Your progress will be saved.', 'yellow'));

  // Save all players and shutdown after delay
  setTimeout(() => {
    // Save all online players
    let savedCount = 0;
    players.forEach((p, s) => {
      if (p.isRegistered) {
        savePlayer(p, null, true);
        savedCount++;
        s.write(colorize('\r\n[SERVER] Your character has been saved. Goodbye!\r\n', 'green'));
        s.end();
      }
    });

    console.log(`Server shutdown: Saved ${savedCount} players`);
    console.log('Server shutting down...');
    process.exit(0);
  }, 10000);
}

// Save all players command
function handleSaveAll(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  let savedCount = 0;
  players.forEach((p, s) => {
    if (p.isRegistered) {
      savePlayer(p, s, true);
      savedCount++;
    }
  });

  socket.write(colorize(`Saved ${savedCount} player character${savedCount !== 1 ? 's' : ''}.\r\n`, 'green'));
  logActivity(`${player.name} saved all players`);
}

// Reload monsters command
function handleReloadMonsters(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  // Clear all current monsters
  const oldCount = activeMonsters.length;
  activeMonsters.length = 0;
  nextMonsterId = 1;

  // Reset spawn stats
  Object.keys(spawnStats).forEach(zone => {
    spawnStats[zone] = { attempted: 0, spawned: 0 };
  });

  // Respawn all monsters
  Object.entries(monsterData.zones).forEach(([zoneName, zoneData]) => {
    spawnMonstersForZone(zoneName, zoneData);
  });
  spawnBosses();

  const newCount = activeMonsters.length;
  socket.write(colorize(`All monsters have been reset. ${newCount} creatures spawned.\r\n`, 'green'));

  // Broadcast to all players
  broadcastToAll(colorize('The creatures of the realm have been renewed by divine power.', 'brightMagenta'), socket);

  logAdminCommand(player.name, 'reset_monsters');
  logActivity(`${player.name} reset all monsters (${oldCount} -> ${newCount})`);
}

// Kick player command
function handleKick(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: kick <player> [reason]\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  const targetName = parts[0];
  const reason = parts.slice(1).join(' ') || 'No reason given';

  const target = findPlayerByName(targetName);
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  // Can't kick yourself
  if (target.player.name.toLowerCase() === player.name.toLowerCase()) {
    socket.write("You can't kick yourself!\r\n");
    return;
  }

  // Save the player first
  if (target.player.isRegistered) {
    savePlayer(target.player, null, true);
  }

  // Notify the kicked player
  target.socket.write(colorize(`\r\n*** You have been kicked from the server ***\r\n`, 'red'));
  target.socket.write(`Reason: ${reason}\r\n`);

  // Clear their timer
  if (target.player.autoSaveTimer) {
    clearInterval(target.player.autoSaveTimer);
  }

  // Disconnect them
  target.socket.end();

  // Broadcast to all
  broadcastToAll(colorize(`${getDisplayName(target.player)} has been kicked from the server.`, 'yellow'), socket);
  socket.write(colorize(`Kicked ${target.player.name}. Reason: ${reason}\r\n`, 'green'));
  logActivity(`${player.name} kicked ${target.player.name}`);
}

// Goto player command
function handleGoto(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: goto <player>\r\n');
    return;
  }

  // Block during combat
  if (player.inCombat) {
    socket.write(colorize("You can't teleport while in combat!\r\n", 'red'));
    return;
  }

  const target = findPlayerByName(targetName.trim());
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  const oldRoom = player.currentRoom;
  const newRoom = target.player.currentRoom;

  if (oldRoom === newRoom) {
    socket.write(`You're already in the same room as ${target.player.name}.\r\n`);
    return;
  }

  // Broadcast departure
  broadcastToRoom(oldRoom, `${getDisplayName(player)} vanishes in a flash of divine light.`, socket);

  // Move admin
  player.currentRoom = newRoom;

  // Broadcast arrival
  broadcastToRoom(newRoom, `${getDisplayName(player)} materializes in a flash of divine light.`, socket);

  socket.write(colorize(`You teleport to ${target.player.name}'s location.\r\n`, 'green'));
  showRoom(socket, player);
}

// Bring player command
function handleBring(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: bring <player>\r\n');
    return;
  }

  const target = findPlayerByName(targetName.trim());
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  // Can't bring yourself
  if (target.player.name.toLowerCase() === player.name.toLowerCase()) {
    socket.write("You can't summon yourself!\r\n");
    return;
  }

  // Check if target is in combat
  if (target.player.inCombat) {
    socket.write(colorize(`${target.player.name} is in combat and cannot be summoned.\r\n`, 'yellow'));
    return;
  }

  const oldRoom = target.player.currentRoom;
  const newRoom = player.currentRoom;

  if (oldRoom === newRoom) {
    socket.write(`${target.player.name} is already here.\r\n`);
    return;
  }

  // Broadcast departure from old room
  broadcastToRoom(oldRoom, `${getDisplayName(target.player)} vanishes in a flash of light!`, target.socket);

  // Move target
  target.player.currentRoom = newRoom;

  // Notify target
  target.socket.write(colorize(`\r\nYou have been summoned by ${player.name}!\r\n`, 'brightMagenta'));
  showRoom(target.socket, target.player);
  target.socket.write('> ');

  // Broadcast arrival
  broadcastToRoom(newRoom, `${getDisplayName(target.player)} materializes in a flash of light!`, target.socket);

  socket.write(colorize(`You summoned ${target.player.name} to your location.\r\n`, 'green'));
}

// Send player to room command
function handleSend(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: send <player> <room#>\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  if (parts.length < 2) {
    socket.write('Usage: send <player> <room#>\r\n');
    return;
  }

  const targetName = parts[0];
  const roomNum = parseInt(parts[1], 10);

  if (isNaN(roomNum)) {
    socket.write('Invalid room number.\r\n');
    return;
  }

  const target = findPlayerByName(targetName);
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  // Check if target is in combat
  if (target.player.inCombat) {
    socket.write(colorize(`${target.player.name} is in combat and cannot be teleported.\r\n`, 'yellow'));
    return;
  }

  // Build room ID
  const targetRoomId = `room_${String(roomNum).padStart(3, '0')}`;

  if (!rooms[targetRoomId]) {
    socket.write('That room does not exist.\r\n');
    return;
  }

  const oldRoom = target.player.currentRoom;

  if (oldRoom === targetRoomId) {
    socket.write(`${target.player.name} is already in that room.\r\n`);
    return;
  }

  // Broadcast departure
  broadcastToRoom(oldRoom, `${getDisplayName(target.player)} vanishes in a flash!`, target.socket);

  // Move target
  target.player.currentRoom = targetRoomId;

  // Notify target
  target.socket.write(colorize(`\r\nYou have been teleported by ${player.name}.\r\n`, 'brightMagenta'));
  showRoom(target.socket, target.player);
  target.socket.write('> ');

  // Broadcast arrival
  broadcastToRoom(targetRoomId, `${getDisplayName(target.player)} materializes here!`, target.socket);

  const room = rooms[targetRoomId];
  socket.write(colorize(`Sent ${target.player.name} to ${room.name}.\r\n`, 'green'));
  logActivity(`${player.name} sent ${target.player.name} to room ${roomNum}`);
}

// Admin who / list_players command
function handleAdminWho(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  const online = getOnlinePlayers();

  socket.write('\r\n');
  socket.write(colorize(`=== All Players (Admin View) ===\r\n`, 'brightCyan'));
  socket.write('\r\n');

  if (online.length === 0) {
    socket.write('No players online.\r\n');
    return;
  }

  // Sort by session start (longest first)
  online.sort((a, b) => a.player.sessionStart - b.player.sessionStart);

  online.forEach(({ player: p, socket: s }) => {
    const room = rooms[p.currentRoom];
    const roomName = room ? room.name.substring(0, 18).padEnd(18) : 'Unknown'.padEnd(18);
    const nameCol = p.name.padEnd(10);
    const levelCol = `Lv${String(p.level).padStart(2, ' ')}`.padEnd(5);
    const hpCol = `${p.currentHP}/${p.maxHP} HP`.padEnd(12);
    const ip = s.remoteAddress || 'Unknown';
    const onlineTime = formatUptime(Date.now() - p.sessionStart);

    const adminTag = isAdmin(p.name) ? colorize(' [ADMIN]', 'brightMagenta') : '';
    const afkTag = p.isAFK ? colorize(' (AFK)', 'dim') : '';
    const combatTag = p.inCombat ? colorize(' [Combat]', 'red') : '';

    socket.write(`${colorize(nameCol, 'brightWhite')} | ${levelCol} | ${hpCol} | ${roomName} | IP: ${ip} | ${onlineTime}${adminTag}${afkTag}${combatTag}\r\n`);
  });

  socket.write('\r\n');
  socket.write(`Total: ${online.length} player${online.length !== 1 ? 's' : ''}\r\n`);
}

// ============================================
// ADMIN CHARACTER MANAGEMENT COMMANDS
// ============================================

// Set player level command
function handleSetLevel(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: set_level <player> <level>\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  if (parts.length < 2) {
    socket.write('Usage: set_level <player> <level>\r\n');
    return;
  }

  const targetName = parts[0];
  const newLevel = parseInt(parts[1], 10);

  if (isNaN(newLevel) || newLevel < 1 || newLevel > 30) {
    socket.write('Level must be between 1 and 30.\r\n');
    return;
  }

  const target = findPlayerByName(targetName);
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  const levelData = getLevelData(newLevel);
  const oldLevel = target.player.level || 1;

  // Update player level and stats
  target.player.level = newLevel;
  target.player.title = levelData.title;
  target.player.maxHP = levelData.hp;
  target.player.currentHP = levelData.hp; // Full heal on level set
  target.player.maxMana = newLevel * 15;
  target.player.currentMana = target.player.maxMana; // Full mana on level set
  target.player.baseDamage = { min: levelData.dmgMin, max: levelData.dmgMax };
  target.player.experience = levelData.xp; // Set to minimum XP for that level

  // Tier 1.9: grant +5 practice per level increase so admin fast-forward mirrors the level-up hook
  if (newLevel > oldLevel) {
    target.player.practicePoints = (target.player.practicePoints || 0) + (newLevel - oldLevel) * 5;
  }

  // Notify target
  target.socket.write(colorize(`\r\n*** Your level has been set to ${newLevel} by ${player.name}! ***\r\n`, 'brightMagenta'));
  target.socket.write(`You are now a ${levelData.title} with ${levelData.hp} HP and ${target.player.maxMana} Mana!\r\n> `);

  socket.write(colorize(`${target.player.name} has been set to level ${newLevel}.\r\n`, 'green'));
  logActivity(`${player.name} set ${target.player.name} to level ${newLevel}`);
}

// Give experience command
function handleGiveExp(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: give_exp <player> <amount>\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  if (parts.length < 2) {
    socket.write('Usage: give_exp <player> <amount>\r\n');
    return;
  }

  const targetName = parts[0];
  const amount = parseInt(parts[1], 10);

  if (isNaN(amount) || amount <= 0) {
    socket.write('Amount must be a positive number.\r\n');
    return;
  }

  const target = findPlayerByName(targetName);
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  const oldLevel = target.player.level;
  target.player.experience += amount;
  target.player.sessionXPGained += amount;

  // Check for level up
  checkLevelUp(target.socket, target.player);

  // Notify target
  target.socket.write(colorize(`\r\n*** You have been awarded ${amount} experience by ${player.name}! ***\r\n`, 'brightMagenta'));
  if (target.player.level > oldLevel) {
    target.socket.write(colorize(`You have leveled up to level ${target.player.level}!\r\n`, 'brightYellow'));
  }
  target.socket.write('> ');

  socket.write(colorize(`${target.player.name} has been awarded ${amount} experience.\r\n`, 'green'));
  logActivity(`${player.name} gave ${target.player.name} ${amount} XP`);
}

// Give item command
function handleGiveItem(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: give_item <player> <item name>\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  if (parts.length < 2) {
    socket.write('Usage: give_item <player> <item name>\r\n');
    return;
  }

  const targetName = parts[0];
  const itemName = parts.slice(1).join(' ').toLowerCase();

  const target = findPlayerByName(targetName);
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  // Search for the item in all categories
  let foundItem = null;
  let foundItemKey = null;
  const categories = ['weapons', 'armor', 'shields', 'accessories', 'consumables', 'treasure', 'boss_drops', 'instruments'];

  for (const category of categories) {
    if (itemData[category]) {
      for (const [key, item] of Object.entries(itemData[category])) {
        if (item.name.toLowerCase() === itemName || key === itemName.replace(/ /g, '_')) {
          foundItem = createItem(key) || { ...item, id: key };
          foundItemKey = key;
          break;
        }
      }
      if (foundItem) break;
    }
  }

  if (!foundItem) {
    socket.write(`Item "${itemName}" not found. Check items.json for valid items.\r\n`);
    return;
  }

  // Check inventory space
  const targetCap = getInventoryCap(target.player);
  if (target.player.inventory.length >= targetCap) {
    socket.write(`${target.player.name}'s inventory is full (${targetCap}/${targetCap}).\r\n`);
    return;
  }

  // Add to inventory
  target.player.inventory.push(foundItem);
  target.player.stats.itemsCollected++;
  target.player.sessionItemsCollected++;

  // Notify target
  target.socket.write(colorize(`\r\n*** ${player.name} has given you: ${foundItem.name}! ***\r\n`, 'brightMagenta'));
  target.socket.write('> ');

  socket.write(colorize(`${target.player.name} has received ${foundItem.name}.\r\n`, 'green'));
  logActivity(`${player.name} gave ${target.player.name} ${foundItem.name}`);
}

// Give gold command
function handleGiveGold(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: give_gold <player> <amount>\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  if (parts.length < 2) {
    socket.write('Usage: give_gold <player> <amount>\r\n');
    return;
  }

  const targetName = parts[0];
  const amount = parseInt(parts[1], 10);

  if (isNaN(amount) || amount <= 0) {
    socket.write('Amount must be a positive number.\r\n');
    return;
  }

  const target = findPlayerByName(targetName);
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  target.player.gold += amount;
  target.player.sessionGoldEarned += amount;

  // Notify target
  target.socket.write(colorize(`\r\n*** ${player.name} has given you ${amount} gold! ***\r\n`, 'brightYellow'));
  target.socket.write('> ');

  socket.write(colorize(`${target.player.name} has received ${amount} gold.\r\n`, 'green'));
  logActivity(`${player.name} gave ${target.player.name} ${amount} gold`);
}

// Heal player command
function handleHeal(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: heal <player>\r\n');
    return;
  }

  const target = findPlayerByName(targetName.trim());
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  const healed = target.player.maxHP - target.player.currentHP;
  target.player.currentHP = target.player.maxHP;

  // Notify target
  target.socket.write(colorize(`\r\n*** Divine energy washes over you, restoring ${healed} HP! ***\r\n`, 'brightGreen'));
  target.socket.write(`You are now at full health (${target.player.currentHP}/${target.player.maxHP} HP).\r\n> `);

  socket.write(colorize(`${target.player.name} has been fully healed.\r\n`, 'green'));
}

// Heal all command
function handleHealAll(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  const online = getOnlinePlayers();
  let healedCount = 0;

  online.forEach(({ player: p, socket: s }) => {
    if (p.currentHP < p.maxHP) {
      p.currentHP = p.maxHP;
      healedCount++;
    }
  });

  // Broadcast to all
  broadcastToAll(colorize('*** Divine energy washes over the realms. All wounds are healed! ***', 'brightGreen'));

  socket.write(colorize(`Healed ${healedCount} player${healedCount !== 1 ? 's' : ''}.\r\n`, 'green'));
  logActivity(`${player.name} healed all players`);
}

// Revive player command
function handleRevive(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: revive <player>\r\n');
    return;
  }

  const target = findPlayerByName(targetName.trim());
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  if (target.player.currentHP > 0) {
    socket.write(`${target.player.name} is not dead.\r\n`);
    return;
  }

  // Revive at full HP in current location
  target.player.currentHP = target.player.maxHP;

  // End any combat state
  if (target.player.inCombat) {
    target.player.inCombat = false;
    target.player.combatTarget = null;
  }

  // Notify target
  target.socket.write(colorize(`\r\n*** Divine light envelops you! You are revived by ${player.name}! ***\r\n`, 'brightGreen'));
  target.socket.write(`You are restored to full health (${target.player.currentHP}/${target.player.maxHP} HP).\r\n`);
  showRoom(target.socket, target.player);
  target.socket.write('> ');

  // Notify room
  broadcastToRoom(target.player.currentRoom, colorize(`${getDisplayName(target.player)} is revived by divine intervention!`, 'brightGreen'), target.socket);

  socket.write(colorize(`${target.player.name} is revived by divine intervention!\r\n`, 'green'));
  logActivity(`${player.name} revived ${target.player.name}`);
}

// ============================================
// ADMIN COMMUNICATION COMMANDS
// ============================================

// Broadcast / announce command
function handleBroadcast(socket, player, message) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!message || message.trim() === '') {
    socket.write('Usage: broadcast <message> or announce <message>\r\n');
    return;
  }

  const text = message.trim();
  const announcement = colorize(`*** [ADMIN ANNOUNCEMENT] *** ${text}`, 'brightYellow');

  // Send to all players including self
  players.forEach((p, s) => {
    if (p.isRegistered) {
      s.write(`\r\n${announcement}\r\n> `);
    }
  });

  logActivity(`${player.name} broadcast: ${text.substring(0, 50)}...`);
}

// God say command
function handleGodSay(socket, player, message) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!message || message.trim() === '') {
    socket.write('Usage: god_say <message>\r\n');
    return;
  }

  const text = message.trim();
  const divineMessage = colorize(`*** The voice of ${player.name} echoes through the realms: ${text} ***`, 'brightMagenta');

  // Send to all players including self
  players.forEach((p, s) => {
    if (p.isRegistered) {
      s.write(`\r\n${divineMessage}\r\n> `);
    }
  });

  logActivity(`${player.name} spoke as god: ${text.substring(0, 50)}...`);
}

// Invisible toggle command
function handleInvisible(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  player.isInvisible = !player.isInvisible;

  if (player.isInvisible) {
    socket.write(colorize('You fade from mortal sight. You are now invisible.\r\n', 'dim'));
    // Notify others that the admin has vanished
    broadcastToRoom(player.currentRoom, colorize(`${getDisplayName(player)} fades from view.`, 'dim'), socket);
  } else {
    socket.write(colorize('You become visible again.\r\n', 'green'));
    // Notify others that the admin has appeared
    broadcastToRoom(player.currentRoom, colorize(`${getDisplayName(player)} materializes from thin air.`, 'brightWhite'), socket);
  }
}

// ============================================
// ADMIN WORLD MANAGEMENT COMMANDS
// ============================================

// Find monster template by name (partial match, case-insensitive)
function findMonsterTemplate(searchName) {
  const search = searchName.toLowerCase();
  let matches = [];

  // Search in templates (regular monsters)
  for (const [templateId, template] of Object.entries(monsterData.templates)) {
    const name = template.name.toLowerCase();
    // Exact match takes priority
    if (name === search) {
      // Find which zone this monster belongs to
      let zone = 'Unknown';
      for (const [zoneName, zoneData] of Object.entries(monsterData.zones)) {
        if (zoneData.monsters.includes(templateId)) {
          zone = zoneName;
          break;
        }
      }
      return { template, templateId, zone, isBoss: false, exact: true };
    }
    // Partial match
    if (name.includes(search) || templateId.includes(search)) {
      let zone = 'Unknown';
      for (const [zoneName, zoneData] of Object.entries(monsterData.zones)) {
        if (zoneData.monsters.includes(templateId)) {
          zone = zoneName;
          break;
        }
      }
      matches.push({ template, templateId, zone, isBoss: false });
    }
  }

  // Search in bosses
  for (const [bossId, boss] of Object.entries(monsterData.bosses)) {
    const name = boss.name.toLowerCase();
    // Exact match takes priority
    if (name === search) {
      return { template: boss, templateId: bossId, zone: 'Boss', isBoss: true, exact: true };
    }
    // Partial match
    if (name.includes(search) || bossId.includes(search)) {
      matches.push({ template: boss, templateId: bossId, zone: 'Boss', isBoss: true });
    }
  }

  // Return first partial match if only one, otherwise return all matches for disambiguation
  if (matches.length === 1) {
    return matches[0];
  } else if (matches.length > 1) {
    return { multiple: matches };
  }

  return null;
}

// Spawn monster command
function handleSpawn(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: spawn <monster name> <room#>\r\n');
    socket.write('Example: spawn crystal spider 10\r\n');
    socket.write('Use "monster_types" to see all spawnable monsters.\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  if (parts.length < 2) {
    socket.write('Usage: spawn <monster name> <room#>\r\n');
    socket.write('Use "monster_types" to see all spawnable monsters.\r\n');
    return;
  }

  const roomNum = parseInt(parts[parts.length - 1], 10);
  const monsterName = parts.slice(0, -1).join(' ');

  if (isNaN(roomNum) || roomNum < 1 || roomNum > 100) {
    socket.write('Room number must be between 1 and 100.\r\n');
    return;
  }

  const targetRoomId = `room_${String(roomNum).padStart(3, '0')}`;
  if (!rooms[targetRoomId]) {
    socket.write('That room does not exist.\r\n');
    return;
  }

  // Find monster template
  const result = findMonsterTemplate(monsterName);

  if (!result) {
    socket.write(colorize(`Monster "${monsterName}" not found.\r\n`, 'red'));
    socket.write('Use "monster_types" to see all spawnable monsters.\r\n');
    return;
  }

  // Handle multiple matches (disambiguation needed)
  if (result.multiple) {
    socket.write(colorize(`Multiple monsters match "${monsterName}":\r\n`, 'yellow'));
    for (const match of result.multiple) {
      socket.write(`  - ${match.template.name} (${match.zone})\r\n`);
    }
    socket.write('Please be more specific.\r\n');
    return;
  }

  const { template, templateId, zone, isBoss } = result;

  // Check if boss already exists in the world
  if (isBoss) {
    const existingBoss = activeMonsters.find(m =>
      m.name === template.name && m.type === 'Boss'
    );
    if (existingBoss) {
      socket.write(colorize(`${template.name} already exists in room ${parseInt(existingBoss.currentRoom.split('_')[1], 10)}.\r\n`, 'yellow'));
      socket.write('Use "despawn" to remove it first, or spawn a regular monster.\r\n');
      return;
    }
  }

  // Create monster instance
  const monster = {
    id: `m${String(nextMonsterId++).padStart(3, '0')}`,
    ...template,
    hp: template.hp,
    maxHp: template.hp,
    currentRoom: targetRoomId,
    homeZone: zone,
    spawnRoom: targetRoomId
  };

  activeMonsters.push(monster);

  const room = rooms[targetRoomId];
  socket.write(colorize(`${template.name} (ID: ${monster.id}) has been spawned in ${room.name}.\r\n`, 'green'));

  // Broadcast to players in the room
  const arriveVerb = template.movementVerbs?.arrive || 'appears';
  for (const [otherSocket, otherPlayer] of players.entries()) {
    if (otherPlayer.currentRoom === targetRoomId && otherSocket !== socket) {
      otherSocket.write(colorize(`\r\n${template.name} ${arriveVerb} suddenly!\r\n`, 'brightRed'));
    }
  }

  logAdminCommand(player.name, `spawn ${template.name} ${roomNum}`);
  logActivity(`${player.name} spawned ${template.name} in room ${roomNum}`);
}

// Monster types command - list all spawnable monsters
function handleMonsterTypes(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  socket.write(colorize('\r\n=== SPAWNABLE MONSTER TYPES ===\r\n\r\n', 'brightCyan'));

  // Group monsters by zone
  for (const [zoneName, zoneData] of Object.entries(monsterData.zones)) {
    socket.write(colorize(`${zoneName}:\r\n`, 'yellow'));
    for (const templateId of zoneData.monsters) {
      const template = monsterData.templates[templateId];
      if (template) {
        const typeColor = template.type === 'Aggressive' ? 'red' :
                         template.type === 'Neutral' ? 'yellow' : 'green';
        socket.write(`  ${colorize(template.name, typeColor)} (Lvl ${template.level}, ${template.type})\r\n`);
      }
    }
    socket.write('\r\n');
  }

  // List bosses
  socket.write(colorize('BOSSES:\r\n', 'brightMagenta'));
  for (const [bossId, boss] of Object.entries(monsterData.bosses)) {
    socket.write(`  ${colorize(boss.name, 'brightRed')} (Lvl ${boss.level}, HP ${boss.hp})\r\n`);
  }

  socket.write(colorize('\r\nUsage: spawn <monster name> <room#>\r\n', 'cyan'));
  socket.write(colorize('Example: spawn crystal spider 10\r\n', 'cyan'));
}

// Despawn monster command
function handleDespawn(socket, player, monsterId) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!monsterId || monsterId.trim() === '') {
    socket.write('Usage: despawn <monster_id>\r\n');
    socket.write('Use "monsters" command to see monster IDs.\r\n');
    return;
  }

  const id = monsterId.trim().toLowerCase();
  const monsterIndex = activeMonsters.findIndex(m => m.id.toLowerCase() === id);

  if (monsterIndex === -1) {
    socket.write(`Monster with ID "${monsterId}" not found.\r\n`);
    return;
  }

  const monster = activeMonsters[monsterIndex];
  activeMonsters.splice(monsterIndex, 1);

  socket.write(colorize(`${monster.name} has been removed.\r\n`, 'green'));
  logAdminCommand(player.name, `despawn ${monsterId}`);
  logActivity(`${player.name} despawned ${monster.name}`);
}

// Create item in room command
function handleCreateItem(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: create_item <item name> <room#>\r\n');
    socket.write('Example: create_item Crystal Blade 15\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  if (parts.length < 2) {
    socket.write('Usage: create_item <item name> <room#>\r\n');
    return;
  }

  const roomNum = parseInt(parts[parts.length - 1], 10);
  const itemName = parts.slice(0, -1).join(' ').toLowerCase();

  if (isNaN(roomNum) || roomNum < 1 || roomNum > 100) {
    socket.write('Room number must be between 1 and 100.\r\n');
    return;
  }

  const targetRoomId = `room_${String(roomNum).padStart(3, '0')}`;
  if (!rooms[targetRoomId]) {
    socket.write('That room does not exist.\r\n');
    return;
  }

  // Search for the item in all categories
  let foundItem = null;
  const categories = ['weapons', 'armor', 'shields', 'accessories', 'consumables', 'treasure', 'boss_drops', 'instruments'];

  for (const category of categories) {
    if (itemData[category]) {
      for (const [key, item] of Object.entries(itemData[category])) {
        if (item.name.toLowerCase() === itemName || key === itemName.replace(/ /g, '_')) {
          foundItem = { ...item };
          break;
        }
      }
      if (foundItem) break;
    }
  }

  if (!foundItem) {
    socket.write(`Item "${itemName}" not found. Check items.json for valid items.\r\n`);
    return;
  }

  // Add item to room
  if (!roomItems[targetRoomId]) {
    roomItems[targetRoomId] = [];
  }
  roomItems[targetRoomId].push(foundItem);

  const room = rooms[targetRoomId];
  socket.write(colorize(`${foundItem.name} materializes in ${room.name}.\r\n`, 'green'));
  logAdminCommand(player.name, `create_item ${foundItem.name} ${roomNum}`);
  logActivity(`${player.name} created ${foundItem.name} in room ${roomNum}`);
}

// Temporary room modifications storage
const roomModifications = {}; // roomId -> { original values }

// Modify room command
function handleModifyRoom(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: modify_room <room#> <property> <value>\r\n');
    socket.write('Properties: name, description, zone\r\n');
    socket.write('Example: modify_room 15 description A frozen wasteland...\r\n');
    return;
  }

  const parts = args.trim().split(' ');
  if (parts.length < 3) {
    socket.write('Usage: modify_room <room#> <property> <value>\r\n');
    return;
  }

  const roomNum = parseInt(parts[0], 10);
  const property = parts[1].toLowerCase();
  const value = parts.slice(2).join(' ');

  if (isNaN(roomNum) || roomNum < 1 || roomNum > 100) {
    socket.write('Room number must be between 1 and 100.\r\n');
    return;
  }

  const targetRoomId = `room_${String(roomNum).padStart(3, '0')}`;
  if (!rooms[targetRoomId]) {
    socket.write('That room does not exist.\r\n');
    return;
  }

  const validProperties = ['name', 'description', 'longdescription', 'zone'];
  if (!validProperties.includes(property)) {
    socket.write(`Invalid property. Valid properties: ${validProperties.join(', ')}\r\n`);
    return;
  }

  // Store original value for potential restore
  if (!roomModifications[targetRoomId]) {
    roomModifications[targetRoomId] = {};
  }

  const room = rooms[targetRoomId];
  const propKey = property === 'description' || property === 'longdescription' ? 'longDescription' : property;

  if (!roomModifications[targetRoomId][propKey]) {
    roomModifications[targetRoomId][propKey] = room[propKey];
  }

  room[propKey] = value;

  socket.write(colorize(`Room ${roomNum} ${property} changed to: "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"\r\n`, 'green'));
  socket.write(colorize('Note: Changes are temporary and will reset on server restart.\r\n', 'yellow'));
  logAdminCommand(player.name, `modify_room ${roomNum} ${property}`);
}

// ============================================
// ADMIN INFORMATION COMMANDS
// ============================================

// Admin score command - show complete player data
function handleAdminScore(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: admin_score <player>\r\n');
    return;
  }

  const target = findPlayerByName(targetName.trim());
  if (!target) {
    socket.write(`${targetName} is not currently online.\r\n`);
    return;
  }

  const p = target.player;
  const s = target.socket;
  const room = rooms[p.currentRoom];
  const roomName = room ? room.name : 'Unknown';
  const zoneName = room ? room.zone : 'Unknown';

  socket.write('\r\n');
  socket.write(colorize(`=== Admin View: ${p.name} ===\r\n`, 'brightCyan'));
  socket.write('\r\n');

  // Basic info
  socket.write(colorize('Character Info:\r\n', 'yellow'));
  socket.write(`  Name: ${p.name}\r\n`);
  socket.write(`  Level: ${p.level} (${p.title})\r\n`);
  socket.write(`  HP: ${p.currentHP}/${p.maxHP}\r\n`);
  socket.write(`  XP: ${p.experience}\r\n`);
  socket.write(`  Gold: ${p.gold}\r\n`);
  socket.write(`  Location: ${roomName} (${zoneName}) [Room ${p.currentRoom}]\r\n`);

  // Equipment
  socket.write('\r\n');
  socket.write(colorize('Equipment:\r\n', 'yellow'));
  for (const slot of ALL_EQUIP_SLOTS) {
    const item = p.equipped[slot];
    socket.write(`  ${slotLabel(slot)}: ${item ? item.name : 'None'}\r\n`);
  }
  socket.write(`  Inventory: ${p.inventory.length}/${getInventoryCap(p)} items\r\n`);

  // Statistics
  socket.write('\r\n');
  socket.write(colorize('Statistics:\r\n', 'yellow'));
  socket.write(`  Monsters Killed: ${p.stats.monstersKilled}\r\n`);
  socket.write(`  Deaths: ${p.stats.deaths}\r\n`);
  socket.write(`  Bosses Defeated: ${p.stats.bossesDefeated.length > 0 ? p.stats.bossesDefeated.join(', ') : 'None'}\r\n`);
  socket.write(`  Damage Dealt: ${p.stats.totalDamageDealt}\r\n`);
  socket.write(`  Damage Taken: ${p.stats.totalDamageTaken}\r\n`);
  socket.write(`  Rooms Explored: ${p.stats.roomsExplored.length}\r\n`);

  // Session info
  socket.write('\r\n');
  socket.write(colorize('Session Info:\r\n', 'yellow'));
  const sessionTime = formatUptime(Date.now() - p.sessionStart);
  socket.write(`  Session Time: ${sessionTime}\r\n`);
  socket.write(`  IP Address: ${s.remoteAddress || 'Unknown'}\r\n`);
  socket.write(`  Save File: players/${p.name.toLowerCase()}.json\r\n`);
  if (p.lastSaved) {
    const lastSaveAgo = formatTimeSince(p.lastSaved);
    socket.write(`  Last Auto-Save: ${lastSaveAgo}\r\n`);
  } else {
    socket.write(`  Last Auto-Save: Not yet saved\r\n`);
  }

  // Status
  socket.write('\r\n');
  socket.write(colorize('Status:\r\n', 'yellow'));
  socket.write(`  AFK: ${p.isAFK ? `Yes (${p.afkMessage || 'No message'})` : 'No'}\r\n`);
  socket.write(`  In Combat: ${p.inCombat ? 'Yes' : 'No'}\r\n`);
  socket.write(`  Invisible: ${p.isInvisible ? 'Yes' : 'No'}\r\n`);
  socket.write(`  God Mode: ${p.godMode ? 'Yes' : 'No'}\r\n`);
  socket.write(`  Ignored Players: ${p.ignoreList.length > 0 ? p.ignoreList.join(', ') : 'None'}\r\n`);
  socket.write(`  Is Admin: ${isAdmin(p.name) ? 'Yes' : 'No'}\r\n`);
}

// Logs command - show recent activity log
function handleLogs(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  let numLines = 10; // Default
  if (args && args.trim() !== '') {
    const parsed = parseInt(args.trim(), 10);
    if (!isNaN(parsed) && parsed > 0) {
      numLines = Math.min(parsed, MAX_ACTIVITY_LOG);
    }
  }

  socket.write('\r\n');
  socket.write(colorize(`=== Server Activity Log (Last ${numLines}) ===\r\n`, 'brightCyan'));
  socket.write('\r\n');

  if (recentActivity.length === 0) {
    socket.write('No recent activity.\r\n');
    return;
  }

  const logsToShow = recentActivity.slice(0, numLines);
  logsToShow.forEach(activity => {
    const timeAgo = formatTimeSince(activity.timestamp);
    socket.write(`  [${timeAgo}] ${activity.message}\r\n`);
  });
}

// ============================================
// ADMIN TESTING & DEBUGGING COMMANDS
// ============================================

// Test combat command - spawn weak test monster
function handleTestCombat(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  // Create a weak test monster
  const testMonster = {
    id: `m${String(nextMonsterId++).padStart(3, '0')}`,
    name: 'Test Dummy',
    type: 'Neutral',
    level: 1,
    hp: 10,
    maxHp: 10,
    str: 1,
    description: 'A magical training dummy conjured for testing purposes.',
    presenceVerb: 'stands here motionless',
    currentRoom: player.currentRoom,
    homeZone: 'Test',
    spawnRoom: player.currentRoom
  };

  activeMonsters.push(testMonster);

  socket.write(colorize('A Test Dummy materializes before you for combat testing.\r\n', 'brightMagenta'));
  socket.write('Attack it with: attack test dummy\r\n');
  logAdminCommand(player.name, 'test_combat');
}

// Test loot command - drop random items
function handleTestLoot(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  // Add some test items to the room
  if (!roomItems[player.currentRoom]) {
    roomItems[player.currentRoom] = [];
  }

  // Pick random items from different categories
  const testItems = [
    itemData.consumables.minor_healing_potion,
    itemData.weapons.rusty_dagger,
    itemData.armor.leather_vest,
    itemData.treasure.memory_fragment
  ];

  testItems.forEach(item => {
    if (item) {
      roomItems[player.currentRoom].push({ ...item });
    }
  });

  socket.write(colorize('Test loot items have been dropped in this room.\r\n', 'brightMagenta'));
  socket.write('Use "look" to see them and "get" to pick them up.\r\n');
  logAdminCommand(player.name, 'test_loot');
}

// God mode command - toggle invincibility
function handleGodMode(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  player.godMode = !player.godMode;

  if (player.godMode) {
    socket.write(colorize('God mode: ON - You are now invincible.\r\n', 'brightMagenta'));
  } else {
    socket.write(colorize('God mode: OFF - You can now take damage normally.\r\n', 'yellow'));
  }

  logAdminCommand(player.name, `god_mode ${player.godMode ? 'ON' : 'OFF'}`);
}

// Zap command - instant kill monster or player ANYWHERE (Level 25 Echo of Nyxara or Admins)
function handleZap(socket, player, args) {
  // Check permission: Level 25 OR Admin
  const isWizard = player.level >= 25;
  const isAdminUser = isAdmin(player.name);

  if (!isWizard && !isAdminUser) {
    socket.write(colorize("Only Echoes of Nyxara (Level 25) and Admins can use the zap command.\r\n", 'red'));
    return;
  }

  // Safe zone: caster cannot unleash zap from a chapel
  if (isChapelRoom(player.currentRoom)) {
    socket.write(colorize('This is a sacred chapel - divine retribution is forbidden here.\r\n', 'brightGreen'));
    return;
  }

  // Check syntax
  if (!args || args.trim() === '') {
    socket.write('Usage: zap <target>\r\n');
    socket.write('  Target can be a monster name or player name\r\n');
    socket.write('  Works from anywhere in the realms except [SAFE] chapels\r\n');
    return;
  }

  const targetName = args.trim().toLowerCase();

  // Try to find PLAYER target first (anywhere in world)
  const targetPlayerResult = findPlayerByName(targetName);

  if (targetPlayerResult) {
    const targetPlayer = targetPlayerResult.player;
    const targetSocket = targetPlayerResult.socket;

    // Can't zap yourself
    if (targetPlayer === player) {
      socket.write(colorize("You cannot zap yourself!\r\n", 'red'));
      return;
    }

    // Safe zone: cannot zap a player sheltering in a chapel
    if (isChapelRoom(targetPlayer.currentRoom)) {
      socket.write(colorize(`${getDisplayName(targetPlayer)} is sheltering in a sacred chapel and cannot be zapped.\r\n`, 'brightGreen'));
      return;
    }

    // Get target's location
    const targetRoom = rooms[targetPlayer.currentRoom];
    const locationInfo = targetRoom ? `in ${targetRoom.name}` : 'in an unknown location';

    // End any combat they're in
    if (isInMonsterCombat(targetPlayer)) {
      const combatData = getMonsterCombatByPlayer(targetPlayer.name);
      if (combatData) {
        cleanupMonsterCombat(combatData.id);
      }
    }
    if (isInPvpCombat(targetPlayer)) {
      const combatData = getPvpCombatByPlayer(targetPlayer.name);
      if (combatData) {
        const { combatId, combat } = combatData;
        // Clear timer
        if (combat.timer) {
          clearTimeout(combat.timer);
          combat.timer = null;
        }
        // End combat for opponent (no victory, just cleanup)
        const isAttacker = combat.attacker.name === targetPlayer.name;
        const opponent = isAttacker ? combat.defender : combat.attacker;
        const opponentSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;
        opponent.inCombat = false;
        opponent.pvpCombatTarget = null;
        opponent.pvpCombatId = null;
        opponentSocket.write(colorize(`\r\n${getDisplayName(targetPlayer)} has been struck down by divine lightning! Combat ends.\r\n`, 'brightYellow'));
        opponentSocket.write('> ');
        // Remove combat record
        activePvpCombats.delete(combatId);
      }
    }

    // Broadcast to target's room
    broadcastToRoom(targetPlayer.currentRoom,
      colorize(`\r\n*** A MASSIVE BOLT OF LIGHTNING strikes from the heavens! ***\r\n*** ${getDisplayName(targetPlayer)} is DISINTEGRATED by divine power! ***\r\n`, 'brightYellow'),
      targetSocket);

    // Message to target
    targetSocket.write(colorize('\r\n*** DIVINE RETRIBUTION ***\r\n', 'brightRed'));
    targetSocket.write(colorize(`${getDisplayName(player)} has zapped you from afar!\r\n`, 'brightYellow'));
    targetSocket.write(colorize('Lightning from the heavens OBLITERATES you!\r\n\r\n', 'brightYellow'));

    // Message to caster
    socket.write(colorize('\r\n*** You point skyward and shout "ZAP!" ***\r\n', 'brightYellow'));
    socket.write(`A bolt of divine lightning strikes ${getDisplayName(targetPlayer)} ${locationInfo}!\r\n`);
    socket.write(colorize(`${getDisplayName(targetPlayer)} has been DISINTEGRATED!\r\n\r\n`, 'brightRed'));

    // Broadcast to caster's room (if different)
    if (player.currentRoom !== targetPlayer.currentRoom) {
      broadcastToRoom(player.currentRoom,
        colorize(`\r\n*** ${getDisplayName(player)} points skyward! Lightning arcs across the realms! ***\r\n`, 'brightYellow'),
        socket);
    }

    // Handle player death (respawn, penalties, etc.)
    handlePlayerDeath(targetSocket, targetPlayer);

    // Log admin action
    if (isAdminUser) {
      logAdminCommand(player.name, `Zapped player ${targetPlayer.name} (${locationInfo})`);
    }

    logActivity(`${player.name} zapped player ${targetPlayer.name}`);
    return;
  }

  // Try to find MONSTER target (anywhere in world)
  let targetMonster = null;

  for (const monster of activeMonsters) {
    if (monster.name.toLowerCase().includes(targetName)) {
      targetMonster = monster;
      break;
    }
  }

  if (!targetMonster) {
    const onlineCount = getOnlinePlayers().length;
    socket.write(`Target "${targetName}" not found.\r\n`);
    socket.write(`Searched all ${activeMonsters.length} monsters and ${onlineCount} players.\r\n`);
    return;
  }

  // Zapping a monster
  const monsterRoom = rooms[targetMonster.currentRoom];
  const locationInfo = monsterRoom ? `in ${monsterRoom.name}` : 'in an unknown location';

  // Find if any player was fighting this monster
  let combatVictim = null;
  for (const [s, p] of players) {
    if (p.inCombat && p.combatTarget === targetMonster.id) {
      combatVictim = { socket: s, player: p };
      break;
    }
  }

  // End combat for victim if applicable
  if (combatVictim) {
    const victimCombat = getMonsterCombatByPlayer(combatVictim.player.name);
    if (victimCombat) {
      cleanupMonsterCombat(victimCombat.id);
    } else {
      combatVictim.player.inCombat = false;
      combatVictim.player.combatTarget = null;
    }
    combatVictim.socket.write(colorize(`\r\n*** ${targetMonster.name} DISINTEGRATES in a flash of divine lightning! ***\r\n`, 'brightYellow'));
    combatVictim.socket.write('Your combat ends (no XP awarded).\r\n\r\n');
    combatVictim.socket.write('> ');
  }

  // Broadcast to monster's room
  broadcastToRoom(targetMonster.currentRoom,
    colorize(`\r\n*** Lightning strikes from the heavens! ***\r\n*** ${targetMonster.name} DISINTEGRATES in a flash of divine power! ***\r\n`, 'brightYellow'),
    socket, combatVictim ? combatVictim.socket : null);

  // Message to caster
  socket.write(colorize('\r\n*** You point skyward and shout "ZAP!" ***\r\n', 'brightYellow'));
  socket.write(`A bolt of divine lightning strikes ${targetMonster.name} ${locationInfo}!\r\n`);
  socket.write(colorize(`${targetMonster.name} has been OBLITERATED!\r\n\r\n`, 'brightRed'));

  // Broadcast to caster's room (if different from target)
  if (player.currentRoom !== targetMonster.currentRoom) {
    broadcastToRoom(player.currentRoom,
      colorize(`\r\n*** ${getDisplayName(player)} points skyward! Lightning arcs across the realms! ***\r\n`, 'brightYellow'),
      socket);
  }

  // Remove monster (no loot, no XP)
  removeMonster(targetMonster.id);

  // Log admin action
  if (isAdminUser) {
    logAdminCommand(player.name, `Zapped monster ${targetMonster.name} (${locationInfo})`);
  }

  logActivity(`${player.name} zapped ${targetMonster.name}`);
}

// Cursor-Bearer (L28): teleport to any room by id. 10-min cooldown, 1 use per cycle.
function handleCursorJump(socket, player, args) {
  const isCursorBearer = player.level >= 28;
  const isAdminUser = isAdmin(player.name);

  if (!isCursorBearer && !isAdminUser) {
    socket.write(colorize("Only Cursor-Bearers (Level 28) and Admins can use cursor_jump.\r\n", 'red'));
    return;
  }

  if (player.inCombat) {
    socket.write(colorize("You can't edit your position while in combat!\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: cursor_jump <room_number>\r\n');
    return;
  }

  if (!isAdminUser && player.cursorJumpUsedThisCycle) {
    socket.write(colorize("You have already used cursor_jump this cycle. Wait for the next world reset.\r\n", 'red'));
    return;
  }

  const COOLDOWN_MS = 10 * 60 * 1000;
  const now = Date.now();
  if (!isAdminUser && player.cursorJumpLastUsed && (now - player.cursorJumpLastUsed) < COOLDOWN_MS) {
    const remaining = Math.ceil((COOLDOWN_MS - (now - player.cursorJumpLastUsed)) / 1000);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    socket.write(colorize(`The cursor is still recharging. ${mins}m ${secs}s remaining.\r\n`, 'yellow'));
    return;
  }

  const roomNum = parseInt(args.trim(), 10);
  if (isNaN(roomNum)) {
    socket.write('Usage: cursor_jump <room_number>\r\n');
    return;
  }

  const targetRoomId = `room_${String(roomNum).padStart(3, '0')}`;
  if (!rooms[targetRoomId]) {
    socket.write('That location does not exist in the Shattered Realms.\r\n');
    return;
  }

  const oldRoom = player.currentRoom;
  broadcastToRoom(oldRoom, `${getDisplayName(player)} blinks out of existence as a cursor-blink snaps them elsewhere.`, socket);

  player.currentRoom = targetRoomId;
  if (!isAdminUser) {
    player.cursorJumpLastUsed = now;
    player.cursorJumpUsedThisCycle = true;
  }

  broadcastToRoom(targetRoomId, `${getDisplayName(player)} is pasted into the world from some other frame.`, socket);

  socket.write(colorize('You seize the cursor and paste yourself into new coordinates.\r\n', 'brightMagenta'));
  showRoom(socket, player);
  logActivity(`${player.name} used cursor_jump to ${targetRoomId}`);
}

// The First Admin (L30): trigger immediate world reset. 1 use per cycle. Requires confirm.
function handleGlobalVariableReset(socket, player, args) {
  const isFirstAdmin = player.level >= 30;
  const isAdminUser = isAdmin(player.name);

  if (!isFirstAdmin && !isAdminUser) {
    socket.write(colorize("Only The First Admin (Level 30) and Admins hold the root credentials.\r\n", 'red'));
    return;
  }

  if (!isAdminUser && player.globalResetUsedThisCycle) {
    socket.write(colorize("You have already reset reality this cycle. The next cycle is not yours to end.\r\n", 'red'));
    return;
  }

  const confirm = (args || '').trim().toLowerCase();
  if (confirm !== 'confirm') {
    socket.write(colorize('\r\n*** GLOBAL VARIABLE RESET ***\r\n', 'brightRed'));
    socket.write(colorize('This will purge the cycle IMMEDIATELY.\r\n', 'yellow'));
    socket.write(colorize('Type  global_variable_reset confirm  to commit.\r\n', 'yellow'));
    return;
  }

  if (!isAdminUser) {
    player.globalResetUsedThisCycle = true;
  }

  socket.write(colorize('You raise the cursor, select all, and press Delete.\r\n', 'brightMagenta'));
  broadcastToAll(colorize(`\r\n*** ${getDisplayName(player)} INVOKES GLOBAL VARIABLE RESET! ***`, 'brightRed'));
  logActivity(`${player.name} triggered global_variable_reset`);
  if (isAdminUser) logAdminCommand(player.name, 'global_variable_reset');
  executeWorldReset();
}

// ============================================
// SPELL SYSTEM FUNCTIONS
// ============================================

// Show available spells to player
function handleSpells(socket, player, school = null) {
  socket.write('\r\n');
  socket.write(colorize('=== Spellbook ===\r\n', 'brightMagenta'));
  socket.write(colorize(`Mana: ${player.currentMana}/${player.maxMana}\r\n\r\n`, 'brightCyan'));

  const schools = ['Malefic', 'Theft', 'Divination', 'Combat', 'Protection', 'Utility'];
  const schoolColors = {
    'Malefic': 'red',
    'Theft': 'magenta',
    'Divination': 'brightBlue',
    'Combat': 'brightYellow',
    'Protection': 'brightCyan',
    'Utility': 'brightGreen'
  };

  // Filter by school if specified
  const targetSchools = school ? [school] : schools;

  targetSchools.forEach(schoolName => {
    const spells = getSpellsBySchool(schoolName);
    if (spells.length === 0) return;

    socket.write(colorize(`--- ${schoolName} School ---\r\n`, schoolColors[schoolName] || 'white'));

    spells.forEach(spell => {
      const available = player.level >= spell.levelRequired;
      const levelText = available ? '' : colorize(` [Lvl ${spell.levelRequired}]`, 'gray');
      const statusColor = available ? 'white' : 'gray';
      const nameColor = available ? schoolColors[schoolName] : 'gray';

      // Check cooldown
      let cooldownText = '';
      if (player.spellCooldowns && player.spellCooldowns[spell.key]) {
        const remaining = Math.ceil((player.spellCooldowns[spell.key] - Date.now()) / 1000);
        if (remaining > 0) {
          cooldownText = colorize(` (${remaining}s cooldown)`, 'yellow');
        }
      }

      socket.write(colorize(`  ${spell.name}`, nameColor));
      socket.write(colorize(` - ${spell.manaCost} mana`, 'cyan'));
      socket.write(levelText);
      socket.write(cooldownText);
      socket.write('\r\n');
      socket.write(colorize(`    ${spell.description}\r\n`, statusColor));
    });
    socket.write('\r\n');
  });

  socket.write(colorize('Usage: cast <spell name> [target]\r\n', 'yellow'));
  socket.write(colorize('Example: cast fireball goblin\r\n\r\n', 'yellow'));
}

// Cast a spell
function handleCast(socket, player, args) {
  if (!args || args.trim() === '') {
    socket.write('Cast what spell? Usage: cast <spell name> [target]\r\n');
    socket.write('Use "spells" to see available spells.\r\n');
    return;
  }

  // Parse spell name and target
  const parts = args.trim().toLowerCase().split(' ');
  let spellKey = null;
  let targetName = null;

  // Try to match spell name (could be multi-word)
  for (let i = parts.length; i > 0; i--) {
    const possibleSpell = parts.slice(0, i).join('_');
    const possibleSpellAlt = parts.slice(0, i).join(' ');

    // Check exact match on key
    if (SPELLS[possibleSpell]) {
      spellKey = possibleSpell;
      targetName = parts.slice(i).join(' ') || null;
      break;
    }

    // Check by name
    for (const [key, spell] of Object.entries(SPELLS)) {
      if (spell.name.toLowerCase() === possibleSpellAlt) {
        spellKey = key;
        targetName = parts.slice(i).join(' ') || null;
        break;
      }
    }
    if (spellKey) break;
  }

  if (!spellKey) {
    socket.write(colorize("You don't know that spell.\r\n", 'yellow'));
    socket.write('Use "spells" to see available spells.\r\n');
    return;
  }

  const spell = SPELLS[spellKey];

  // Check level requirement
  if (player.level < spell.levelRequired) {
    socket.write(colorize(`You need to be level ${spell.levelRequired} to cast ${spell.name}.\r\n`, 'yellow'));
    return;
  }

  // Check mana
  if (player.currentMana < spell.manaCost) {
    socket.write(colorize(`Not enough mana! ${spell.name} requires ${spell.manaCost} mana (you have ${player.currentMana}).\r\n`, 'yellow'));
    return;
  }

  // Check cooldown
  if (player.spellCooldowns && player.spellCooldowns[spellKey]) {
    const remaining = Math.ceil((player.spellCooldowns[spellKey] - Date.now()) / 1000);
    if (remaining > 0) {
      socket.write(colorize(`${spell.name} is on cooldown for ${remaining} more seconds.\r\n`, 'yellow'));
      return;
    }
  }

  // Check silenced status
  if (player.effects && player.effects['silenced'] && player.effects['silenced'].expiresAt > Date.now()) {
    const remaining = Math.ceil((player.effects['silenced'].expiresAt - Date.now()) / 1000);
    socket.write(colorize(`You are silenced! You cannot cast spells for ${remaining} more seconds.\r\n`, 'brightMagenta'));
    return;
  } else if (player.effects && player.effects['silenced']) {
    delete player.effects['silenced'];
  }

  // Check if in combat and spell restrictions
  if (player.inCombat) {
    // These spells are blocked during combat (escape/utility spells)
    const blockedInCombat = ['recall', 'sanctuary', 'summon_player', 'gate'];

    if (blockedInCombat.includes(spellKey)) {
      socket.write(colorize(`You cannot cast ${spell.name} while in combat!\r\n`, 'red'));
      return;
    }
    // All other spells (damage, buffs, heals, debuffs) work in combat
  }

  // Safe zone: no offensive spells allowed from a chapel
  if (isOffensiveSpell(spell) && isChapelRoom(player.currentRoom)) {
    socket.write(colorize('This is a sacred chapel - harmful magic is forbidden here.\r\n', 'brightGreen'));
    return;
  }

  // Tier 1.3: new-system silenced affect
  if (hasAffect(player, 'silenced')) {
    socket.write(colorize(`You are silenced! ${spell.name} fizzles on your tongue.\r\n`, 'brightMagenta'));
    return;
  }

  // Tier 3.1: SYSADMIN.EXE phase-3 paging - random ability failures with 503
  if (player.effects && player.effects['paged_oncall'] && player.effects['paged_oncall'].failsLeft > 0) {
    if (Math.random() < 0.5) {
      player.effects['paged_oncall'].failsLeft -= 1;
      socket.write(colorize(`503 Service Unavailable. ${spell.name} could not be served right now. Please try again later.\r\n`, 'brightRed'));
      player.currentMana = Math.max(0, player.currentMana - Math.floor(spell.manaCost / 2));
      if (player.effects['paged_oncall'].failsLeft <= 0) {
        delete player.effects['paged_oncall'];
        socket.write(colorize('The paging quiets. Your spells answer you again.\r\n', 'cyan'));
      }
      return;
    }
  }

  // Tier 1.2: class school gating (level 5+ with a class chosen)
  if (player.level >= 5 && player.charClass && CLASS_DEFS[player.charClass] && spell.school) {
    const allowed = CLASS_DEFS[player.charClass].schools;
    if (!allowed.includes(spell.school)) {
      socket.write(colorize(`Your class cannot wield ${spell.school} magic. ${spell.name} fizzles.\r\n`, 'brightMagenta'));
      return;
    }
  }

  // Tier 1.8: track schools cast (Scholar of the Schools)
  if (spell.school) {
    if (!player.schoolsCast) player.schoolsCast = [];
    if (!player.schoolsCast.includes(spell.school)) {
      player.schoolsCast.push(spell.school);
      if (player.schoolsCast.length >= 5) unlockAchievement(socket, player, 'all_classes_met');
    }
  }

  // Tier 1.9: practice-based fizzle roll
  if (!rollCastSuccess(player, spellKey)) {
    socket.write(colorize(`You lose focus. ${spell.name} fizzles!\r\n`, 'yellow'));
    socket.write(colorize(`Practice the spell with: practice ${spell.name.toLowerCase()}\r\n`, 'dim'));
    player.currentMana = Math.max(0, player.currentMana - Math.floor(spell.manaCost / 2));
    if (spell.cooldown > 0) {
      if (!player.spellCooldowns) player.spellCooldowns = {};
      player.spellCooldowns[spellKey] = Date.now() + Math.floor(spell.cooldown * 1000 / 2);
    }
    return;
  }

  // Execute spell based on type
  let success = false;
  switch (spell.type) {
    case 'damage':
      success = castDamageSpell(socket, player, spell, spellKey, targetName);
      break;
    case 'drain':
      success = castDrainSpell(socket, player, spell, spellKey, targetName);
      break;
    case 'heal':
      success = castHealSpell(socket, player, spell, spellKey);
      break;
    case 'buff':
      success = castBuffSpell(socket, player, spell, spellKey);
      break;
    case 'shield':
      success = castShieldSpell(socket, player, spell, spellKey);
      break;
    case 'teleport':
      success = castTeleportSpell(socket, player, spell, spellKey);
      break;
    case 'summon':
      success = castSummonSpell(socket, player, spell, spellKey, targetName);
      break;
    case 'multi_attack':
      success = castMultiAttackSpell(socket, player, spell, spellKey, targetName);
      break;
    case 'execute':
      success = castExecuteSpell(socket, player, spell, spellKey, targetName);
      break;
    case 'debuff':
      success = castDebuffSpell(socket, player, spell, spellKey, targetName);
      break;
    case 'info':
      success = castInfoSpell(socket, player, spell, spellKey, targetName);
      break;
    case 'mana_drain':
      success = castManaDrainSpell(socket, player, spell, spellKey, targetName);
      break;
    default:
      socket.write(colorize('That spell is not yet implemented.\r\n', 'yellow'));
      return;
  }

  if (success) {
    // Deduct mana
    player.currentMana -= spell.manaCost;

    // Set cooldown
    if (spell.cooldown > 0) {
      if (!player.spellCooldowns) player.spellCooldowns = {};
      player.spellCooldowns[spellKey] = Date.now() + (spell.cooldown * 1000);
    }
  }
}

// Cast damage spell (supports both monster and player targets)
function castDamageSpell(socket, player, spell, spellKey, targetName) {
  // Need a target (unless already in combat)
  if (!targetName && !isInMonsterCombat(player) && !isInPvpCombat(player)) {
    socket.write('Cast on what target? Usage: cast <spell> <target>\r\n');
    return false;
  }

  let target = null;
  let isPlayerTarget = false;
  let targetSocket = null;

  // Priority 1: If in PVP combat, use that target
  if (isInPvpCombat(player)) {
    const combatData = getPvpCombatByPlayer(player.name);
    if (combatData) {
      const { combat } = combatData;
      const isAttacker = combat.attacker.name === player.name;
      target = isAttacker ? combat.defender : combat.attacker;
      targetSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;
      isPlayerTarget = true;
    }
  }

  // Priority 2: If in monster combat, use that target
  if (!target && isInMonsterCombat(player)) {
    const combat = activeMonsterCombats.get(player.monsterCombatId);
    if (combat) {
      target = combat.monster;
    }
  }

  // Priority 3: Search for PLAYER in room first
  if (!target && targetName) {
    const playerTarget = findPlayerInRoom(player.currentRoom, targetName, socket);
    if (playerTarget && playerTarget.player !== player) {
      // Check PVP requirements
      if (!player.pvpEnabled) {
        socket.write(colorize("You must enable PVP (pvp on) to cast offensive spells on players.\r\n", 'red'));
        return false;
      }
      if (!playerTarget.player.pvpEnabled) {
        socket.write(colorize(`${getDisplayName(playerTarget.player)} has PVP disabled. You cannot attack them.\r\n`, 'yellow'));
        return false;
      }
      target = playerTarget.player;
      targetSocket = playerTarget.socket;
      isPlayerTarget = true;
    }
  }

  // Priority 4: Search for MONSTER in room
  if (!target && targetName) {
    const monstersHere = getMonstersInRoom(player.currentRoom);
    target = monstersHere.find(m => m.name.toLowerCase().includes(targetName.toLowerCase()));
  }

  if (!target) {
    writeCastTargetNotFound(socket, player, targetName);
    return false;
  }

  // Calculate damage
  const damage = Math.floor(Math.random() * (spell.effect.maxDamage - spell.effect.minDamage + 1)) + spell.effect.minDamage;

  // Apply damage
  target.currentHP -= damage;

  // Cast message
  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightMagenta'));
  const targetDisplayName = isPlayerTarget ? getDisplayName(target) : target.name;
  const hitMsg = spell.hitMessage.replace('$target', targetDisplayName).replace('$damage', damage);
  socket.write(colorize(`${hitMsg}\r\n`, 'brightRed'));

  if (isPlayerTarget) {
    // PLAYER TARGET
    socket.write(`${getDisplayName(target)}: ${target.currentHP}/${target.maxHP} HP\r\n`);

    // Notify target
    targetSocket.write(colorize(`\r\n${getDisplayName(player)} casts ${spell.name} on you for ${damage} damage!\r\n`, 'brightRed'));
    targetSocket.write(`You: ${target.currentHP}/${target.maxHP} HP\r\n`);

    // Broadcast to room (exclude caster and target)
    const roomPlayers = getPlayersInRoom(player.currentRoom);
    roomPlayers.forEach(({ socket: s }) => {
      if (s !== socket && s !== targetSocket) {
        s.write(colorize(`\r\n${getDisplayName(player)} casts ${spell.name} on ${getDisplayName(target)} for ${damage} damage!\r\n> `, 'magenta'));
      }
    });

    // Initiate PVP combat if not already in combat
    if (!player.inCombat && !target.inCombat) {
      initiatePvpCombat(socket, player, targetSocket, target);
    }

    // Check if target dies
    if (target.currentHP <= 0) {
      const combatData = getPvpCombatByPlayer(player.name);
      if (combatData) {
        handlePvpVictory(combatData.combatId, player, target);
      } else {
        // Not in formal PVP combat, handle as regular death
        handlePlayerDeath(targetSocket, target);
      }
    }
  } else {
    // MONSTER TARGET
    // Broadcast to room
    broadcastToRoom(player.currentRoom,
      colorize(`${getDisplayName(player)} casts ${spell.name} on ${target.name} for ${damage} damage!`, 'magenta'),
      socket);

    // Check if monster dies
    if (target.currentHP <= 0) {
      handleMonsterDeath(socket, player, target);
    } else if (!isInMonsterCombat(player)) {
      // Start combat if not already in combat
      initiateMonsterCombat(socket, player, target);
    }
  }

  return true;
}

// Cast drain spell (damage + heal, supports both monster and player targets)
function castDrainSpell(socket, player, spell, spellKey, targetName) {
  // Need a target (unless already in combat)
  if (!targetName && !isInMonsterCombat(player) && !isInPvpCombat(player)) {
    socket.write('Cast on what target? Usage: cast <spell> <target>\r\n');
    return false;
  }

  let target = null;
  let isPlayerTarget = false;
  let targetSocket = null;

  // Priority 1: If in PVP combat, use that target
  if (isInPvpCombat(player)) {
    const combatData = getPvpCombatByPlayer(player.name);
    if (combatData) {
      const { combat } = combatData;
      const isAttacker = combat.attacker.name === player.name;
      target = isAttacker ? combat.defender : combat.attacker;
      targetSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;
      isPlayerTarget = true;
    }
  }

  // Priority 2: If in monster combat, use that target
  if (!target && isInMonsterCombat(player)) {
    const combat = activeMonsterCombats.get(player.monsterCombatId);
    if (combat) {
      target = combat.monster;
    }
  }

  // Priority 3: Search for PLAYER in room first
  if (!target && targetName) {
    const playerTarget = findPlayerInRoom(player.currentRoom, targetName, socket);
    if (playerTarget && playerTarget.player !== player) {
      if (!player.pvpEnabled) {
        socket.write(colorize("You must enable PVP (pvp on) to cast offensive spells on players.\r\n", 'red'));
        return false;
      }
      if (!playerTarget.player.pvpEnabled) {
        socket.write(colorize(`${getDisplayName(playerTarget.player)} has PVP disabled. You cannot attack them.\r\n`, 'yellow'));
        return false;
      }
      target = playerTarget.player;
      targetSocket = playerTarget.socket;
      isPlayerTarget = true;
    }
  }

  // Priority 4: Search for MONSTER in room
  if (!target && targetName) {
    const monstersHere = getMonstersInRoom(player.currentRoom);
    target = monstersHere.find(m => m.name.toLowerCase().includes(targetName.toLowerCase()));
  }

  if (!target) {
    writeCastTargetNotFound(socket, player, targetName);
    return false;
  }

  // Calculate damage and heal
  const damage = Math.floor(Math.random() * (spell.effect.maxDamage - spell.effect.minDamage + 1)) + spell.effect.minDamage;
  const healAmount = Math.floor(damage * (spell.effect.healPercent / 100));
  const manaReturn = spell.effect.manaReturn || 0;

  // Apply damage
  target.currentHP -= damage;

  // Apply heal (cap at max HP)
  const oldHP = player.currentHP;
  player.currentHP = Math.min(player.maxHP, player.currentHP + healAmount);
  const actualHeal = player.currentHP - oldHP;

  // Apply mana return if any
  let actualManaReturn = 0;
  if (manaReturn > 0) {
    const oldMana = player.currentMana;
    player.currentMana = Math.min(player.maxMana, player.currentMana + manaReturn);
    actualManaReturn = player.currentMana - oldMana;
  }

  // Cast message
  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightMagenta'));
  const targetDisplayName = isPlayerTarget ? getDisplayName(target) : target.name;
  let hitMsg = spell.hitMessage
    .replace('$target', targetDisplayName)
    .replace('$damage', damage)
    .replace('$heal', actualHeal)
    .replace('$mana', actualManaReturn);
  socket.write(colorize(`${hitMsg}\r\n`, 'brightRed'));

  if (isPlayerTarget) {
    // PLAYER TARGET
    socket.write(`${getDisplayName(target)}: ${target.currentHP}/${target.maxHP} HP | You: ${player.currentHP}/${player.maxHP} HP\r\n`);

    // Notify target
    targetSocket.write(colorize(`\r\n${getDisplayName(player)} drains life from you for ${damage} damage! (Healed ${actualHeal} HP)\r\n`, 'brightRed'));
    targetSocket.write(`You: ${target.currentHP}/${target.maxHP} HP\r\n`);

    // Broadcast to room (exclude caster and target)
    const roomPlayers = getPlayersInRoom(player.currentRoom);
    roomPlayers.forEach(({ socket: s }) => {
      if (s !== socket && s !== targetSocket) {
        s.write(colorize(`\r\n${getDisplayName(player)} drains life from ${getDisplayName(target)}!\r\n> `, 'magenta'));
      }
    });

    // Initiate PVP combat if not already in combat
    if (!player.inCombat && !target.inCombat) {
      initiatePvpCombat(socket, player, targetSocket, target);
    }

    // Check if target dies
    if (target.currentHP <= 0) {
      const combatData = getPvpCombatByPlayer(player.name);
      if (combatData) {
        handlePvpVictory(combatData.combatId, player, target);
      } else {
        handlePlayerDeath(targetSocket, target);
      }
    }
  } else {
    // MONSTER TARGET
    // Broadcast
    broadcastToRoom(player.currentRoom,
      colorize(`${getDisplayName(player)} drains life from ${target.name}!`, 'magenta'),
      socket);

    // Check if monster dies
    if (target.currentHP <= 0) {
      handleMonsterDeath(socket, player, target);
    } else if (!isInMonsterCombat(player)) {
      initiateMonsterCombat(socket, player, target);
    }
  }

  return true;
}

// Cast heal spell
function castHealSpell(socket, player, spell, spellKey) {
  const healAmount = Math.floor(Math.random() * (spell.effect.maxHeal - spell.effect.minHeal + 1)) + spell.effect.minHeal;

  const oldHP = player.currentHP;
  player.currentHP = Math.min(player.maxHP, player.currentHP + healAmount);
  const actualHeal = player.currentHP - oldHP;

  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightGreen'));
  const hitMsg = spell.hitMessage.replace('$heal', actualHeal);
  socket.write(colorize(`${hitMsg}\r\n`, 'brightGreen'));
  socket.write(colorize(`HP: ${player.currentHP}/${player.maxHP}\r\n`, 'green'));

  broadcastToRoom(player.currentRoom,
    colorize(`${getDisplayName(player)} casts ${spell.name} and is surrounded by healing light!`, 'green'),
    socket);

  return true;
}

// Cast buff spell
function castBuffSpell(socket, player, spell, spellKey) {
  if (!player.effects) player.effects = {};

  // Apply buff effect
  player.effects[spellKey] = {
    spell: spell,
    expiresAt: Date.now() + (spell.effect.duration * 1000),
    ...spell.effect
  };

  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightCyan'));
  socket.write(colorize(`${spell.hitMessage}\r\n`, 'brightCyan'));

  broadcastToRoom(player.currentRoom,
    colorize(`${getDisplayName(player)} casts ${spell.name}!`, 'cyan'),
    socket);

  // Set timeout to remove buff
  setTimeout(() => {
    if (player.effects && player.effects[spellKey]) {
      delete player.effects[spellKey];
      const playerSocket = getSocketForPlayer(player);
      if (playerSocket) {
        playerSocket.write(colorize(`\r\nThe effects of ${spell.name} have worn off.\r\n`, 'yellow'));
      }
    }
  }, spell.effect.duration * 1000);

  return true;
}

// Cast shield spell
function castShieldSpell(socket, player, spell, spellKey) {
  if (!player.effects) player.effects = {};

  player.effects['shield'] = {
    spell: spell,
    remaining: spell.effect.shieldAmount
  };

  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightCyan'));
  socket.write(colorize(`${spell.hitMessage}\r\n`, 'brightCyan'));

  broadcastToRoom(player.currentRoom,
    colorize(`${getDisplayName(player)} is surrounded by a magical shield!`, 'cyan'),
    socket);

  return true;
}

// Cast teleport spell
function castTeleportSpell(socket, player, spell, spellKey) {
  // Check if in combat
  if (isInMonsterCombat(player) || isInPvpCombat(player)) {
    socket.write(colorize("You cannot teleport while in combat!\r\n", 'red'));
    return false;
  }

  let destination = spell.effect.destination;

  // Handle nearest chapel for sanctuary
  if (destination === 'nearest_chapel') {
    // Find nearest chapel (simple: just use first one for now, or current room if in chapel)
    if (CHAPEL_ROOMS.includes(player.currentRoom)) {
      socket.write(colorize("You are already in a chapel.\r\n", 'yellow'));
      return false;
    }
    destination = CHAPEL_ROOMS[0]; // Teleport to first chapel
  }

  const oldRoom = player.currentRoom;

  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightMagenta'));

  // Broadcast departure
  broadcastToRoom(oldRoom,
    colorize(`${getDisplayName(player)} vanishes in a flash of magical light!`, 'magenta'),
    socket);

  // Move player
  player.currentRoom = destination;

  socket.write(colorize(`${spell.hitMessage}\r\n\r\n`, 'brightMagenta'));

  // Show new room
  showRoom(socket, player);

  // Broadcast arrival
  broadcastToRoom(destination,
    colorize(`${getDisplayName(player)} appears in a flash of magical light!`, 'magenta'),
    socket);

  return true;
}

// Cast summon spell (forcibly summons target player with success chance)
function castSummonSpell(socket, player, spell, spellKey, targetName) {
  if (!targetName) {
    socket.write('Summon who? Usage: cast summon player <player name>\r\n');
    return false;
  }

  // Find target player (anywhere in world)
  const targetResult = findPlayerByName(targetName);

  if (!targetResult) {
    socket.write(colorize(`${targetName} is not in the realms.\r\n`, 'yellow'));
    return false;
  }

  const targetPlayer = targetResult.player;
  const targetSocket = targetResult.socket;

  if (targetPlayer === player) {
    socket.write(colorize("You cannot summon yourself!\r\n", 'yellow'));
    return false;
  }

  // Check if target is in combat
  if (isInMonsterCombat(targetPlayer) || isInPvpCombat(targetPlayer)) {
    socket.write(colorize(`${getDisplayName(targetPlayer)} is in combat and cannot be summoned!\r\n`, 'yellow'));
    return false;
  }

  // Calculate success chance
  let successChance;
  if (player.level >= 15 || isAdmin(player.name)) {
    successChance = 1.0; // 100% for Level 15 or Admin
  } else {
    successChance = 0.05; // 5% for others
  }

  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightMagenta'));

  // Roll for success
  if (Math.random() > successChance) {
    // FAILED
    socket.write(colorize(`Your summon spell fails to reach ${getDisplayName(targetPlayer)}!\r\n`, 'yellow'));
    socket.write('The magical connection could not be established.\r\n');
    targetSocket.write(colorize(`\r\nYou feel a faint magical tug, but resist it.\r\n`, 'dim'));
    targetSocket.write('> ');
    return true; // Still costs mana
  }

  // SUCCESS - Forcibly summon target
  const oldRoom = targetPlayer.currentRoom;
  const newRoom = player.currentRoom;

  // Broadcast in old room
  broadcastToRoom(oldRoom,
    colorize(`${getDisplayName(targetPlayer)} vanishes in a swirl of magical energy!`, 'magenta'),
    targetSocket);

  // Teleport target
  targetPlayer.currentRoom = newRoom;

  // Message to target
  targetSocket.write(colorize(`\r\n*** SUMMONED BY MAGIC ***\r\n`, 'brightMagenta'));
  targetSocket.write(colorize(`${getDisplayName(player)} has summoned you!\r\n`, 'brightMagenta'));
  targetSocket.write('You are pulled through space!\r\n\r\n');

  // Show new room to target
  showRoom(targetSocket, targetPlayer);

  // Message to caster
  const hitMsg = spell.hitMessage.replace('$target', getDisplayName(targetPlayer));
  socket.write(colorize(`${hitMsg}\r\n`, 'brightMagenta'));
  socket.write(colorize(`Your summon succeeds! ${getDisplayName(targetPlayer)} materializes before you!\r\n\r\n`, 'brightGreen'));

  // Broadcast in new room
  broadcastToRoom(newRoom,
    colorize(`${getDisplayName(targetPlayer)} materializes in a flash of summoned light!`, 'magenta'),
    socket, targetSocket);

  return true;
}

// Handle accept summon command
function handleAcceptSummon(socket, player) {
  if (!player.pendingSummon) {
    socket.write(colorize("You don't have any pending summon requests.\r\n", 'yellow'));
    return;
  }

  if (Date.now() > player.pendingSummon.expiresAt) {
    socket.write(colorize("The summon request has expired.\r\n", 'yellow'));
    player.pendingSummon = null;
    return;
  }

  if (isInMonsterCombat(player) || isInPvpCombat(player)) {
    socket.write(colorize("You cannot accept a summon while in combat!\r\n", 'red'));
    return;
  }

  const oldRoom = player.currentRoom;
  const destination = player.pendingSummon.fromRoom;
  const summonerName = player.pendingSummon.from;

  // Clear summon
  player.pendingSummon = null;

  // Broadcast departure
  broadcastToRoom(oldRoom,
    colorize(`${getDisplayName(player)} vanishes, answering a summons!`, 'magenta'),
    socket);

  // Move player
  player.currentRoom = destination;

  socket.write(colorize(`\r\nYou answer ${summonerName}'s summons and are teleported!\r\n\r\n`, 'brightMagenta'));

  // Show new room
  showRoom(socket, player);

  // Broadcast arrival
  broadcastToRoom(destination,
    colorize(`${getDisplayName(player)} appears, answering a summons!`, 'magenta'),
    socket);

  // Notify summoner
  players.forEach((p, s) => {
    if (p.name === summonerName) {
      s.write(colorize(`\r\n${getDisplayName(player)} has answered your summons!\r\n`, 'brightGreen'));
    }
  });
}

// Cast multi-attack spell (blade storm, supports both monster and player targets)
function castMultiAttackSpell(socket, player, spell, spellKey, targetName) {
  if (!targetName && !isInMonsterCombat(player) && !isInPvpCombat(player)) {
    socket.write('Cast on what target? Usage: cast <spell> <target>\r\n');
    return false;
  }

  let target = null;
  let isPlayerTarget = false;
  let targetSocket = null;

  // Priority 1: If in PVP combat, use that target
  if (isInPvpCombat(player)) {
    const combatData = getPvpCombatByPlayer(player.name);
    if (combatData) {
      const { combat } = combatData;
      const isAttacker = combat.attacker.name === player.name;
      target = isAttacker ? combat.defender : combat.attacker;
      targetSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;
      isPlayerTarget = true;
    }
  }

  // Priority 2: If in monster combat, use that target
  if (!target && isInMonsterCombat(player)) {
    const combat = activeMonsterCombats.get(player.monsterCombatId);
    if (combat) {
      target = combat.monster;
    }
  }

  // Priority 3: Search for PLAYER in room first
  if (!target && targetName) {
    const playerTarget = findPlayerInRoom(player.currentRoom, targetName, socket);
    if (playerTarget && playerTarget.player !== player) {
      if (!player.pvpEnabled) {
        socket.write(colorize("You must enable PVP (pvp on) to cast offensive spells on players.\r\n", 'red'));
        return false;
      }
      if (!playerTarget.player.pvpEnabled) {
        socket.write(colorize(`${getDisplayName(playerTarget.player)} has PVP disabled. You cannot attack them.\r\n`, 'yellow'));
        return false;
      }
      target = playerTarget.player;
      targetSocket = playerTarget.socket;
      isPlayerTarget = true;
    }
  }

  // Priority 4: Search for MONSTER in room
  if (!target && targetName) {
    const monstersHere = getMonstersInRoom(player.currentRoom);
    target = monstersHere.find(m => m.name.toLowerCase().includes(targetName.toLowerCase()));
  }

  if (!target) {
    writeCastTargetNotFound(socket, player, targetName);
    return false;
  }

  // Calculate damage based on weapon
  const baseDamage = calculatePlayerDamage(player);
  const damagePerHit = Math.floor(baseDamage * (spell.effect.damagePercent / 100));
  const totalDamage = damagePerHit * spell.effect.hits;

  // Apply damage
  target.currentHP -= totalDamage;

  // Messages
  const targetDisplayName = isPlayerTarget ? getDisplayName(target) : target.name;
  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightYellow'));
  const hitMsg = spell.hitMessage
    .replace('$target', targetDisplayName)
    .replace('$hits', spell.effect.hits)
    .replace('$damage', totalDamage);
  socket.write(colorize(`${hitMsg}\r\n`, 'brightRed'));

  if (isPlayerTarget) {
    socket.write(`${getDisplayName(target)}: ${target.currentHP}/${target.maxHP} HP\r\n`);
    targetSocket.write(colorize(`\r\n${getDisplayName(player)} unleashes ${spell.name} on you for ${totalDamage} damage!\r\n`, 'brightRed'));
    targetSocket.write(`You: ${target.currentHP}/${target.maxHP} HP\r\n`);

    const roomPlayers = getPlayersInRoom(player.currentRoom);
    roomPlayers.forEach(({ socket: s }) => {
      if (s !== socket && s !== targetSocket) {
        s.write(colorize(`\r\n${getDisplayName(player)} unleashes ${spell.name} on ${getDisplayName(target)}!\r\n> `, 'yellow'));
      }
    });

    if (!player.inCombat && !target.inCombat) {
      initiatePvpCombat(socket, player, targetSocket, target);
    }

    if (target.currentHP <= 0) {
      const combatData = getPvpCombatByPlayer(player.name);
      if (combatData) {
        handlePvpVictory(combatData.combatId, player, target);
      } else {
        handlePlayerDeath(targetSocket, target);
      }
    }
  } else {
    broadcastToRoom(player.currentRoom,
      colorize(`${getDisplayName(player)} unleashes ${spell.name} on ${target.name}!`, 'yellow'),
      socket);

    if (target.currentHP <= 0) {
      handleMonsterDeath(socket, player, target);
    } else if (!isInMonsterCombat(player)) {
      initiateMonsterCombat(socket, player, target);
    }
  }

  return true;
}

// Cast execute spell (bonus damage to low HP targets, supports both monster and player targets)
function castExecuteSpell(socket, player, spell, spellKey, targetName) {
  if (!targetName && !isInMonsterCombat(player) && !isInPvpCombat(player)) {
    socket.write('Cast on what target? Usage: cast <spell> <target>\r\n');
    return false;
  }

  let target = null;
  let isPlayerTarget = false;
  let targetSocket = null;

  // Priority 1: If in PVP combat, use that target
  if (isInPvpCombat(player)) {
    const combatData = getPvpCombatByPlayer(player.name);
    if (combatData) {
      const { combat } = combatData;
      const isAttacker = combat.attacker.name === player.name;
      target = isAttacker ? combat.defender : combat.attacker;
      targetSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;
      isPlayerTarget = true;
    }
  }

  // Priority 2: If in monster combat, use that target
  if (!target && isInMonsterCombat(player)) {
    const combat = activeMonsterCombats.get(player.monsterCombatId);
    if (combat) {
      target = combat.monster;
    }
  }

  // Priority 3: Search for PLAYER in room first
  if (!target && targetName) {
    const playerTarget = findPlayerInRoom(player.currentRoom, targetName, socket);
    if (playerTarget && playerTarget.player !== player) {
      if (!player.pvpEnabled) {
        socket.write(colorize("You must enable PVP (pvp on) to cast offensive spells on players.\r\n", 'red'));
        return false;
      }
      if (!playerTarget.player.pvpEnabled) {
        socket.write(colorize(`${getDisplayName(playerTarget.player)} has PVP disabled. You cannot attack them.\r\n`, 'yellow'));
        return false;
      }
      target = playerTarget.player;
      targetSocket = playerTarget.socket;
      isPlayerTarget = true;
    }
  }

  // Priority 4: Search for MONSTER in room
  if (!target && targetName) {
    const monstersHere = getMonstersInRoom(player.currentRoom);
    target = monstersHere.find(m => m.name.toLowerCase().includes(targetName.toLowerCase()));
  }

  if (!target) {
    writeCastTargetNotFound(socket, player, targetName);
    return false;
  }

  // Calculate damage - bonus based on missing HP
  let damage = spell.effect.baseDamage;
  const targetMaxHP = isPlayerTarget ? target.maxHP : (target.maxHp || target.maxHP);
  const hpPercent = target.currentHP / targetMaxHP;
  if (hpPercent < 0.5) {
    // Bonus damage scales with missing HP
    const bonusMultiplier = 1 + ((0.5 - hpPercent) * 2 * (spell.effect.bonusDamagePercent / 100));
    damage = Math.floor(damage * bonusMultiplier);
  }

  target.currentHP -= damage;

  const targetDisplayName = isPlayerTarget ? getDisplayName(target) : target.name;
  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightYellow'));
  const hitMsg = spell.hitMessage.replace('$target', targetDisplayName).replace('$damage', damage);
  socket.write(colorize(`${hitMsg}\r\n`, 'brightRed'));

  if (hpPercent < 0.5) {
    socket.write(colorize(`EXECUTE BONUS! Target was wounded - extra damage dealt!\r\n`, 'brightYellow'));
  }

  if (isPlayerTarget) {
    socket.write(`${getDisplayName(target)}: ${target.currentHP}/${target.maxHP} HP\r\n`);
    targetSocket.write(colorize(`\r\n${getDisplayName(player)} executes a devastating strike on you for ${damage} damage!\r\n`, 'brightRed'));
    if (hpPercent < 0.5) {
      targetSocket.write(colorize(`EXECUTE BONUS applied due to your low HP!\r\n`, 'yellow'));
    }
    targetSocket.write(`You: ${target.currentHP}/${target.maxHP} HP\r\n`);

    const roomPlayers = getPlayersInRoom(player.currentRoom);
    roomPlayers.forEach(({ socket: s }) => {
      if (s !== socket && s !== targetSocket) {
        s.write(colorize(`\r\n${getDisplayName(player)} executes a devastating strike on ${getDisplayName(target)}!\r\n> `, 'red'));
      }
    });

    if (!player.inCombat && !target.inCombat) {
      initiatePvpCombat(socket, player, targetSocket, target);
    }

    if (target.currentHP <= 0) {
      const combatData = getPvpCombatByPlayer(player.name);
      if (combatData) {
        handlePvpVictory(combatData.combatId, player, target);
      } else {
        handlePlayerDeath(targetSocket, target);
      }
    }
  } else {
    broadcastToRoom(player.currentRoom,
      colorize(`${getDisplayName(player)} executes a devastating strike on ${target.name}!`, 'red'),
      socket);

    if (target.currentHP <= 0) {
      handleMonsterDeath(socket, player, target);
    } else if (!isInMonsterCombat(player)) {
      initiateMonsterCombat(socket, player, target);
    }
  }

  return true;
}

// Cast debuff spell (supports both monster and player targets)
function castDebuffSpell(socket, player, spell, spellKey, targetName) {
  if (!targetName && !isInMonsterCombat(player) && !isInPvpCombat(player)) {
    socket.write('Cast on what target? Usage: cast <spell> <target>\r\n');
    return false;
  }

  let target = null;
  let isPlayerTarget = false;
  let targetSocket = null;

  // Priority 1: If in PVP combat, use that target
  if (isInPvpCombat(player)) {
    const combatData = getPvpCombatByPlayer(player.name);
    if (combatData) {
      const { combat } = combatData;
      const isAttacker = combat.attacker.name === player.name;
      target = isAttacker ? combat.defender : combat.attacker;
      targetSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;
      isPlayerTarget = true;
    }
  }

  // Priority 2: If in monster combat, use that target
  if (!target && isInMonsterCombat(player)) {
    const combat = activeMonsterCombats.get(player.monsterCombatId);
    if (combat) {
      target = combat.monster;
    }
  }

  // Priority 3: Search for PLAYER in room first
  if (!target && targetName) {
    const playerTarget = findPlayerInRoom(player.currentRoom, targetName, socket);
    if (playerTarget && playerTarget.player !== player) {
      if (!player.pvpEnabled) {
        socket.write(colorize("You must enable PVP (pvp on) to cast offensive spells on players.\r\n", 'red'));
        return false;
      }
      if (!playerTarget.player.pvpEnabled) {
        socket.write(colorize(`${getDisplayName(playerTarget.player)} has PVP disabled. You cannot attack them.\r\n`, 'yellow'));
        return false;
      }
      target = playerTarget.player;
      targetSocket = playerTarget.socket;
      isPlayerTarget = true;
    }
  }

  // Priority 4: Search for MONSTER in room
  if (!target && targetName) {
    const monstersHere = getMonstersInRoom(player.currentRoom);
    target = monstersHere.find(m => m.name.toLowerCase().includes(targetName.toLowerCase()));
  }

  if (!target) {
    writeCastTargetNotFound(socket, player, targetName);
    return false;
  }

  // Apply debuff to target
  if (!target.effects) target.effects = {};
  target.effects[spellKey] = {
    expiresAt: Date.now() + (spell.effect.duration * 1000),
    ...spell.effect
  };

  // Apply buff to self
  if (!player.effects) player.effects = {};
  player.effects[spellKey + '_buff'] = {
    expiresAt: Date.now() + (spell.effect.duration * 1000),
    damageBoost: spell.effect.damageBoost || 0
  };

  const targetDisplayName = isPlayerTarget ? getDisplayName(target) : target.name;
  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightMagenta'));
  const hitMsg = spell.hitMessage.replace('$target', targetDisplayName);
  socket.write(colorize(`${hitMsg}\r\n`, 'brightMagenta'));

  if (isPlayerTarget) {
    // Notify target
    targetSocket.write(colorize(`\r\n${getDisplayName(player)} steals your strength!\r\n`, 'red'));
    targetSocket.write(colorize(`Your damage is reduced by ${spell.effect.damageReduction}% for ${spell.effect.duration} seconds!\r\n`, 'yellow'));

    // Broadcast to room
    const roomPlayers = getPlayersInRoom(player.currentRoom);
    roomPlayers.forEach(({ socket: s }) => {
      if (s !== socket && s !== targetSocket) {
        s.write(colorize(`\r\n${getDisplayName(player)} steals strength from ${getDisplayName(target)}!\r\n> `, 'magenta'));
      }
    });

    // Initiate PVP combat if not already in combat
    if (!player.inCombat && !target.inCombat) {
      initiatePvpCombat(socket, player, targetSocket, target);
    }
  } else {
    // Monster target
    broadcastToRoom(player.currentRoom,
      colorize(`${getDisplayName(player)} steals strength from ${target.name}!`, 'magenta'),
      socket);

    if (!isInMonsterCombat(player)) {
      initiateMonsterCombat(socket, player, target);
    }
  }

  return true;
}

// Cast info spell (reveal weakness)
function castInfoSpell(socket, player, spell, spellKey, targetName) {
  if (!targetName) {
    socket.write('Reveal what? Usage: cast reveal weakness <target>\r\n');
    return false;
  }

  // Check for monster in room
  const monstersHere = getMonstersInRoom(player.currentRoom);
  const target = monstersHere.find(m => m.name.toLowerCase().includes(targetName.toLowerCase()));

  if (!target) {
    writeCastTargetNotFound(socket, player, targetName);
    return false;
  }

  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightBlue'));

  // Calculate XP value (same formula as combat)
  const isBoss = target.isBoss || false;
  const xpValue = isBoss ? target.level * 200 : target.level * 50;

  // Reveal detailed monster info
  socket.write(colorize(`\r\n=== ${target.name} ===\r\n`, 'brightCyan'));
  socket.write(colorize(`Type: ${target.type || 'Creature'}\r\n`, 'white'));
  socket.write(colorize(`Level: ${target.level}\r\n`, 'white'));
  socket.write(colorize(`HP: ${target.hp}/${target.maxHp}\r\n`, 'red'));
  socket.write(colorize(`Damage: ${target.str}-${target.str + 10}\r\n`, 'yellow'));
  socket.write(colorize(`XP Value: ${xpValue}\r\n`, 'cyan'));

  // Check for loot (property is 'loot', not 'lootTable')
  if (target.loot && target.loot.length > 0) {
    socket.write(colorize(`Possible Loot: `, 'green'));
    socket.write(target.loot.join(', ') + '\r\n');
  }

  if (isBoss) {
    socket.write(colorize(`*** BOSS MONSTER ***\r\n`, 'brightRed'));
    if (target.guaranteedDrop) {
      socket.write(colorize(`Guaranteed Drop: ${target.guaranteedDrop}\r\n`, 'brightYellow'));
    }
  }

  socket.write('\r\n');

  return true;
}

// Cast mana drain spell (PvP only - drains mana from player targets)
function castManaDrainSpell(socket, player, spell, spellKey, targetName) {
  let target = null;
  let targetSocket = null;

  // Priority 1: If in PVP combat, use that target
  if (isInPvpCombat(player)) {
    const combatData = getPvpCombatByPlayer(player.name);
    if (combatData) {
      const { combat } = combatData;
      const isAttacker = combat.attacker.name === player.name;
      target = isAttacker ? combat.defender : combat.attacker;
      targetSocket = isAttacker ? combat.defenderSocket : combat.attackerSocket;
    }
  }

  // Priority 2: Search for PLAYER in room
  if (!target && targetName) {
    const playerTarget = findPlayerInRoom(player.currentRoom, targetName, socket);
    if (playerTarget && playerTarget.player !== player) {
      if (!player.pvpEnabled) {
        socket.write(colorize("You must enable PVP (pvp on) to cast Mana Drain.\r\n", 'red'));
        return false;
      }
      if (!playerTarget.player.pvpEnabled) {
        socket.write(colorize(`${getDisplayName(playerTarget.player)} has PVP disabled. You cannot attack them.\r\n`, 'yellow'));
        return false;
      }
      target = playerTarget.player;
      targetSocket = playerTarget.socket;
    }
  }

  if (!target) {
    socket.write(colorize("Mana Drain only works on players. Target a player in your room or be in PVP combat.\r\n", 'yellow'));
    return false;
  }

  // Calculate mana drain
  const drainAmount = Math.floor(Math.random() * (spell.effect.maxDrain - spell.effect.minDrain + 1)) + spell.effect.minDrain;

  // Drain from target
  const actualDrain = Math.min(drainAmount, target.currentMana);
  target.currentMana = Math.max(0, target.currentMana - actualDrain);

  // Add to self
  const oldMana = player.currentMana;
  player.currentMana = Math.min(player.maxMana, player.currentMana + actualDrain);
  const actualGain = player.currentMana - oldMana;

  // Messages
  socket.write(colorize(`\r\n${spell.castMessage}\r\n`, 'brightMagenta'));
  const hitMsg = spell.hitMessage.replace('$target', getDisplayName(target)).replace('$amount', actualDrain);
  socket.write(colorize(`${hitMsg}\r\n`, 'brightMagenta'));
  socket.write(`Your mana: ${player.currentMana}/${player.maxMana}\r\n`);

  // Notify target
  targetSocket.write(colorize(`\r\n${getDisplayName(player)} drains ${actualDrain} mana from you!\r\n`, 'red'));
  targetSocket.write(`Your mana: ${target.currentMana}/${target.maxMana}\r\n`);

  // Broadcast to room
  const roomPlayers = getPlayersInRoom(player.currentRoom);
  roomPlayers.forEach(({ socket: s }) => {
    if (s !== socket && s !== targetSocket) {
      s.write(colorize(`\r\n${getDisplayName(player)} drains mana from ${getDisplayName(target)}!\r\n> `, 'magenta'));
    }
  });

  // Initiate PVP combat if not already in combat
  if (!player.inCombat && !target.inCombat) {
    initiatePvpCombat(socket, player, targetSocket, target);
  }

  return true;
}

// Helper to calculate player damage (for multi-attack spell)
function calculatePlayerDamage(player) {
  let min = player.baseDamage.min;
  let max = player.baseDamage.max;

  if (player.equipped && player.equipped.weapon) {
    min += player.equipped.weapon.damage || 0;
    max += player.equipped.weapon.damage || 0;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get socket for a player object
function getSocketForPlayer(player) {
  for (const [socket, p] of players.entries()) {
    if (p === player) return socket;
  }
  return null;
}

// Teleport all players command
function handleTeleportAll(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: teleport_all <room#>\r\n');
    return;
  }

  const roomNum = parseInt(args.trim(), 10);
  if (isNaN(roomNum) || roomNum < 1 || roomNum > 100) {
    socket.write('Room number must be between 1 and 100.\r\n');
    return;
  }

  const targetRoomId = `room_${String(roomNum).padStart(3, '0')}`;
  if (!rooms[targetRoomId]) {
    socket.write('That room does not exist.\r\n');
    return;
  }

  const room = rooms[targetRoomId];
  let teleportedCount = 0;

  // Teleport all players
  players.forEach((p, s) => {
    if (p.isRegistered && !p.inCombat) {
      const oldRoom = p.currentRoom;
      if (oldRoom !== targetRoomId) {
        // Broadcast departure from old room
        if (!p.isInvisible) {
          broadcastToRoom(oldRoom, colorize(`${p.name} vanishes in a flash of divine light!`, 'brightMagenta'), s);
        }

        // Move player
        p.currentRoom = targetRoomId;
        teleportedCount++;

        // Notify player
        s.write(colorize(`\r\n*** Divine power summons all adventurers to ${room.name}! ***\r\n`, 'brightMagenta'));
        showRoom(s, p);
        s.write('> ');
      }
    }
  });

  socket.write(colorize(`Teleported ${teleportedCount} player${teleportedCount !== 1 ? 's' : ''} to ${room.name}.\r\n`, 'green'));
  logAdminCommand(player.name, `teleport_all ${roomNum}`);
  logActivity(`${player.name} teleported all players to room ${roomNum}`);
}

// ============================================
// ADMIN BAN COMMANDS
// ============================================

// Ban player command
function handleBan(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: ban <player>\r\n');
    return;
  }

  const targetName = args.trim();

  // Check if already banned
  if (isBanned(targetName)) {
    socket.write(`${targetName} is already banned.\r\n`);
    return;
  }

  // Add to ban list
  banData.banned.push(targetName);
  saveBanData();

  // Kick if currently online
  const target = findPlayerByName(targetName);
  if (target) {
    if (target.player.isRegistered) {
      savePlayer(target.player, null, true);
    }
    target.socket.write(colorize('\r\n*** You have been banned from the realms! ***\r\n', 'red'));
    target.socket.end();
    broadcastToAll(colorize(`${targetName} has been banned from the server.`, 'yellow'), socket);
  }

  socket.write(colorize(`${targetName} has been banned.\r\n`, 'green'));
  logAdminCommand(player.name, `ban ${targetName}`);
  logActivity(`${player.name} banned ${targetName}`);
}

// Unban player command
function handleUnban(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: unban <player>\r\n');
    return;
  }

  const name = targetName.trim();
  const lowerName = name.toLowerCase();

  const index = banData.banned.findIndex(n => n.toLowerCase() === lowerName);
  if (index === -1) {
    socket.write(`${name} is not banned.\r\n`);
    return;
  }

  banData.banned.splice(index, 1);
  saveBanData();

  socket.write(colorize(`${name} has been unbanned.\r\n`, 'green'));
  logAdminCommand(player.name, `unban ${name}`);
  logActivity(`${player.name} unbanned ${name}`);
}

// Ban list command
function handleBanList(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  socket.write('\r\n');
  socket.write(colorize('=== Banned Players ===\r\n', 'brightCyan'));
  socket.write('\r\n');

  if (banData.banned.length === 0) {
    socket.write('No players are currently banned.\r\n');
    return;
  }

  banData.banned.forEach((name, index) => {
    socket.write(`  ${index + 1}. ${name}\r\n`);
  });

  socket.write('\r\n');
  socket.write(`Total: ${banData.banned.length} banned player${banData.banned.length !== 1 ? 's' : ''}\r\n`);
}

// Promote player to admin command
function handlePromoteAdmin(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: promote_admin <player>\r\n');
    return;
  }

  // Clean and validate the target name
  const name = targetName.trim().toLowerCase();

  // Validate name format (letters only, 3-12 characters)
  if (!/^[a-z]+$/.test(name)) {
    socket.write(colorize('Invalid player name. Names must contain only letters.\r\n', 'red'));
    return;
  }

  if (name.length < 3 || name.length > 12) {
    socket.write(colorize('Invalid player name. Names must be 3-12 characters.\r\n', 'red'));
    return;
  }

  // Format name for display (capitalize first letter)
  const formattedName = name.charAt(0).toUpperCase() + name.slice(1);

  // Check if already admin (case-insensitive)
  if (isAdmin(name)) {
    socket.write(colorize(`${formattedName} is already an admin.\r\n`, 'yellow'));
    return;
  }

  // Check if player exists (has account or character file)
  const hasAccount = accountExists(name);
  const hasCharacter = playerExists(name);

  if (!hasAccount && !hasCharacter) {
    socket.write(colorize(`Player "${formattedName}" not found.\r\n`, 'yellow'));
    socket.write('They must create an account first before being promoted.\r\n');
    return;
  }

  // Add to admin list (store lowercase for consistency)
  adminData.admins.push(name);

  if (saveAdminData()) {
    socket.write(colorize(`\r\n${formattedName} has been promoted to admin.\r\n`, 'brightGreen'));

    // Log the promotion
    logAdminCommand(player.name, `promote_admin ${formattedName}`);
    logActivity(`${player.name} promoted ${formattedName} to admin`);

    // Notify target if online
    const targetPlayer = findPlayerByName(name);
    if (targetPlayer) {
      targetPlayer.socket.write(colorize('\r\n*** You have been promoted to ADMIN! ***\r\n', 'brightYellow'));
      targetPlayer.socket.write('Use "admin" to see available admin commands.\r\n\r\n');
    }
  } else {
    socket.write(colorize('Error saving admin data. Promotion failed.\r\n', 'red'));
  }
}

// Demote admin command
function handleDemoteAdmin(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: demote_admin <player>\r\n');
    return;
  }

  // Clean and validate the target name
  const name = targetName.trim().toLowerCase();

  // Validate name format (letters only)
  if (!/^[a-z]+$/.test(name)) {
    socket.write(colorize('Invalid player name. Names must contain only letters.\r\n', 'red'));
    return;
  }

  // Format name for display
  const formattedName = name.charAt(0).toUpperCase() + name.slice(1);

  // Check if target is an admin (case-insensitive)
  if (!isAdmin(name)) {
    socket.write(colorize(`${formattedName} is not an admin.\r\n`, 'yellow'));
    return;
  }

  // Prevent self-demotion (safety feature)
  if (name === player.name.toLowerCase()) {
    socket.write(colorize("You cannot demote yourself.\r\n", 'red'));
    return;
  }

  // Remove from admin list (case-insensitive comparison)
  adminData.admins = adminData.admins.filter(admin => admin.toLowerCase() !== name);

  if (saveAdminData()) {
    socket.write(colorize(`\r\n${formattedName} has been demoted from admin.\r\n`, 'brightGreen'));

    // Log the demotion
    logAdminCommand(player.name, `demote_admin ${formattedName}`);
    logActivity(`${player.name} demoted ${formattedName} from admin`);

    // Notify target if online
    const targetPlayer = findPlayerByName(name);
    if (targetPlayer) {
      targetPlayer.socket.write(colorize('\r\n*** Your admin privileges have been revoked. ***\r\n', 'yellow'));
    }
  } else {
    socket.write(colorize('Error saving admin data. Demotion failed.\r\n', 'red'));
  }
}

// List admins command
function handleAdminList(socket, player) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  socket.write('\r\n');
  socket.write(colorize('=== Admin List ===\r\n', 'brightCyan'));
  socket.write('\r\n');

  if (adminData.admins.length === 0) {
    socket.write('No admins configured.\r\n');
    return;
  }

  adminData.admins.forEach((name, index) => {
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    const onlinePlayer = findPlayerByName(name);
    const status = onlinePlayer ? colorize(' [ONLINE]', 'brightGreen') : '';
    socket.write(`  ${index + 1}. ${displayName}${status}\r\n`);
  });

  socket.write('\r\n');
  socket.write(`Total: ${adminData.admins.length} admin${adminData.admins.length !== 1 ? 's' : ''}\r\n`);
}

// Reset password command (admin)
async function handleResetPassword(socket, player, targetName) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!targetName || targetName.trim() === '') {
    socket.write('Usage: reset_password <player>\r\n');
    return;
  }

  const name = targetName.trim();
  const formattedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

  // Check if account exists
  if (!accountExists(formattedName)) {
    // Check if player file exists (no account yet)
    if (playerExists(formattedName)) {
      socket.write(colorize(`${formattedName} has a character but no account yet.\r\n`, 'yellow'));
      socket.write('They will be prompted to create a password on next login.\r\n');
      return;
    }

    socket.write(`Account "${formattedName}" not found.\r\n`);
    return;
  }

  // Generate temporary password
  const tempPassword = await adminResetPassword(formattedName);

  if (tempPassword) {
    socket.write('\r\n');
    socket.write(colorize('=== Password Reset ===\r\n', 'brightCyan'));
    socket.write(`Account: ${colorize(formattedName, 'brightWhite')}\r\n`);
    socket.write(`Temporary password: ${colorize(tempPassword, 'brightYellow')}\r\n`);
    socket.write('\r\n');
    socket.write(colorize('Player must change password on next login.\r\n', 'yellow'));
    socket.write(colorize('Provide this password to the player securely.\r\n', 'dim'));

    logAdminCommand(player.name, `reset_password ${formattedName}`);
    logActivity(`${player.name} reset password for ${formattedName}`);

    // If player is online, notify them
    const onlineTarget = findPlayerByName(formattedName);
    if (onlineTarget) {
      onlineTarget.socket.write(colorize('\r\n*** Your password has been reset by an admin. ***\r\n', 'brightYellow'));
      onlineTarget.socket.write(colorize('You must change your password on next login.\r\n', 'yellow'));
      onlineTarget.socket.write('> ');
    }
  } else {
    socket.write(colorize('Error resetting password. Please try again.\r\n', 'red'));
  }
}

// ============================================
// ADMIN SUFFIX COMMAND
// ============================================

// Suffix validation constants
const MAX_SUFFIX_LENGTH = 30;
const SUFFIX_VALID_CHARS = /^[a-zA-Z\s\-']+$/;

// Handle suffix command - set/clear/view player suffixes
function handleSuffix(socket, player, args) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write('Usage: suffix <player> <suffix text>\r\n');
    socket.write('       suffix <player> clear\r\n');
    socket.write('       suffix <player> (view current)\r\n');
    socket.write('Examples:\r\n');
    socket.write('  suffix Alice the Charming\r\n');
    socket.write('  suffix Bob the Dragonslayer\r\n');
    socket.write('  suffix Alice clear\r\n');
    return;
  }

  // Parse args - first word is player name, rest is suffix
  const parts = args.trim().split(' ');
  const targetName = parts[0];
  const suffixText = parts.slice(1).join(' ');

  // Find target player (online or in save files)
  let targetPlayer = null;
  let targetSocket = null;
  const onlineResult = findPlayerByName(targetName);

  if (onlineResult) {
    targetPlayer = onlineResult.player;
    targetSocket = onlineResult.socket;
  } else {
    // Try to load from file
    targetPlayer = loadPlayer(targetName);
    if (!targetPlayer) {
      socket.write(colorize(`Player "${targetName}" not found.\r\n`, 'red'));
      return;
    }
  }

  // View current suffix
  if (!suffixText || suffixText === '') {
    if (targetPlayer.suffix) {
      socket.write(`${targetPlayer.name}'s suffix: "${targetPlayer.suffix}"\r\n`);
      socket.write(`Display name: ${getDisplayName(targetPlayer)}\r\n`);
    } else {
      socket.write(`${targetPlayer.name} has no custom suffix.\r\n`);
    }
    return;
  }

  // Clear suffix
  if (suffixText.toLowerCase() === 'clear') {
    const oldSuffix = targetPlayer.suffix;
    targetPlayer.suffix = '';

    // Save the player
    if (onlineResult) {
      savePlayer(targetPlayer, targetSocket, true);
    } else {
      savePlayer(targetPlayer, null, true);
    }

    socket.write(colorize(`${targetPlayer.name}'s suffix removed.\r\n`, 'green'));
    if (oldSuffix) {
      socket.write(`Was: "${oldSuffix}"\r\n`);
    }

    // Notify online player
    if (targetSocket) {
      targetSocket.write(colorize(`\r\nYour custom suffix has been removed by an admin.\r\n`, 'yellow'));
    }

    logAdminCommand(player.name, `suffix ${targetPlayer.name} clear`);
    return;
  }

  // Validate suffix
  if (suffixText.length > MAX_SUFFIX_LENGTH) {
    socket.write(colorize(`Suffix too long (max ${MAX_SUFFIX_LENGTH} characters).\r\n`, 'red'));
    return;
  }

  if (!SUFFIX_VALID_CHARS.test(suffixText)) {
    socket.write(colorize('Suffix contains invalid characters. Use only letters, spaces, hyphens, and apostrophes.\r\n', 'red'));
    return;
  }

  // Auto-lowercase "The" at start to "the"
  let formattedSuffix = suffixText;
  if (formattedSuffix.startsWith('The ')) {
    formattedSuffix = 'the ' + formattedSuffix.slice(4);
  }

  // Set the suffix
  targetPlayer.suffix = formattedSuffix;

  // Save the player
  if (onlineResult) {
    savePlayer(targetPlayer, targetSocket, true);
  } else {
    savePlayer(targetPlayer, null, true);
  }

  socket.write(colorize(`${targetPlayer.name}'s suffix set to: "${formattedSuffix}"\r\n`, 'green'));
  socket.write(`Display name: ${getDisplayName(targetPlayer)}\r\n`);

  // Notify online player
  if (targetSocket) {
    targetSocket.write(colorize(`\r\nYou have been granted a custom suffix: "${formattedSuffix}"\r\n`, 'brightCyan'));
    targetSocket.write(`You will now appear as: ${getDisplayName(targetPlayer)}\r\n`);
  }

  logAdminCommand(player.name, `suffix ${targetPlayer.name} ${formattedSuffix}`);
}

// ============================================
// ADMIN HELP COMMAND
// ============================================

function handleAdminHelp(socket, player, specificCommand) {
  if (!isAdmin(player.name)) {
    socket.write(colorize("You don't have permission to use this command.\r\n", 'red'));
    return;
  }

  if (specificCommand && specificCommand.trim() !== '') {
    // Show help for specific command
    const cmd = specificCommand.trim().toLowerCase();
    const helpTexts = {
      'admin status': 'Shows server status including uptime, memory usage, and recent activity.',
      'shutdown': 'Gracefully shuts down the server with 10s warning. Usage: shutdown [message]',
      'save_all': 'Forces a save of all online player characters.',
      'reload_monsters': 'Resets all monster spawns to default. Alias: reset_monsters',
      'kick': 'Kicks a player from the server. Usage: kick <player> [reason]',
      'goto': 'Teleport to a player\'s location. Usage: goto <player>',
      'bring': 'Summon a player to your location. Usage: bring <player>',
      'send': 'Teleport a player to a room. Usage: send <player> <room#>',
      'list_players': 'Shows detailed admin view of all online players.',
      'set_level': 'Set a player\'s level. Usage: set_level <player> <1-30>',
      'give_exp': 'Award experience points. Usage: give_exp <player> <amount>',
      'give_item': 'Give an item to a player. Usage: give_item <player> <item name>',
      'give_gold': 'Give gold to a player. Usage: give_gold <player> <amount>',
      'heal': 'Fully heal a player. Usage: heal <player>',
      'heal_all': 'Fully heal all online players.',
      'revive': 'Revive a dead player at their location. Usage: revive <player>',
      'broadcast': 'Send an admin announcement to all players. Usage: broadcast <message>',
      'god_say': 'Speak with divine authority. Usage: god_say <message>',
      'invisible': 'Toggle admin invisibility.',
      'spawn': 'Spawn a monster in a room. Usage: spawn <monster> <room#>',
      'monster_types': 'List all spawnable monster types by zone.',
      'despawn': 'Remove a monster by ID. Usage: despawn <monster_id>',
      'create_item': 'Place an item in a room. Usage: create_item <item> <room#>',
      'modify_room': 'Temporarily modify room properties. Usage: modify_room <room#> <property> <value>',
      'admin_score': 'Show complete player data. Usage: admin_score <player>',
      'logs': 'Show recent server activity. Usage: logs [lines]',
      'test_combat': 'Spawn a weak test monster for combat testing.',
      'test_loot': 'Drop test items in your current room.',
      'god_mode': 'Toggle invincibility.',
      'teleport_all': 'Teleport all players to a room. Usage: teleport_all <room#>',
      'ban': 'Ban a player. Usage: ban <player>',
      'unban': 'Unban a player. Usage: unban <player>',
      'banlist': 'Show all banned players.',
      'suffix': 'Set player custom suffix. Usage: suffix <player> <text> | clear',
      'promote_admin': 'Promote a player to admin. Usage: promote_admin <player>',
      'demote_admin': 'Demote a player from admin. Usage: demote_admin <player>',
      'adminlist': 'Show all admin players.',
      'reset_password': 'Reset a player\'s password. Usage: reset_password <player>'
    };

    if (helpTexts[cmd]) {
      socket.write(`\r\n${colorize(cmd, 'brightCyan')}: ${helpTexts[cmd]}\r\n`);
    } else {
      socket.write(`Unknown command: ${cmd}\r\n`);
    }
    return;
  }

  socket.write('\r\n');
  socket.write(colorize('=== Admin Commands ===\r\n', 'brightCyan'));
  socket.write('\r\n');

  socket.write(colorize('SERVER:\r\n', 'yellow'));
  socket.write('  admin status, shutdown, save_all, reload_monsters\r\n');

  socket.write(colorize('PLAYERS:\r\n', 'yellow'));
  socket.write('  kick, goto, bring, send, list_players\r\n');

  socket.write(colorize('CHARACTERS:\r\n', 'yellow'));
  socket.write('  set_level, give_exp, give_item, give_gold, heal, heal_all, revive\r\n');

  socket.write(colorize('COMMUNICATION:\r\n', 'yellow'));
  socket.write('  broadcast, god_say, invisible\r\n');

  socket.write(colorize('WORLD:\r\n', 'yellow'));
  socket.write('  spawn, monster_types, despawn, create_item, modify_room\r\n');

  socket.write(colorize('INFO:\r\n', 'yellow'));
  socket.write('  monsters, admin_score, logs\r\n');

  socket.write(colorize('TESTING:\r\n', 'yellow'));
  socket.write('  test_combat, test_loot, god_mode, teleport_all\r\n');

  socket.write(colorize('MODERATION:\r\n', 'yellow'));
  socket.write('  ban, unban, banlist, suffix, reset_password\r\n');

  socket.write(colorize('ADMIN MANAGEMENT:\r\n', 'yellow'));
  socket.write('  promote_admin, demote_admin, adminlist\r\n');

  socket.write('\r\n');
  socket.write("Use 'admin <command>' for details on a specific command.\r\n");
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================

// Show room description and exits based on player's display mode
function showRoom(socket, player) {
  const room = rooms[player.currentRoom];
  if (!room) {
    socket.write('ERROR: You are in an invalid room!\r\n');
    return;
  }

  // Player status bar
  sendStatusLine(socket, player);

  socket.write('\r\n');
  socket.write(`=== ${room.name} ===\r\n`);
  const safeTag = isChapelRoom(player.currentRoom) ? colorize(' [SAFE]', 'brightGreen') : '';
  socket.write(`[${room.zone}]${safeTag}\r\n`);

  // Show description only in verbose mode
  if (player.displayMode === 'verbose') {
    socket.write('\r\n');
    socket.write(`${room.longDescription}\r\n`);
  }

  // Show chapel if present
  if (isChapelRoom(player.currentRoom)) {
    socket.write('\r\n');
    socket.write(colorize('A sacred chapel stands here, offering healing to the faithful. (Type "pray" to heal)\r\n', 'brightCyan'));
  }

  // Show Wandering Healer if present
  if (wanderingHealer.currentRoom === player.currentRoom) {
    socket.write('\r\n');
    socket.write(colorize('The Mystic Healer is here, offering healing services. (Type "ask healer")\r\n', 'brightCyan'));
  }

  // Show monsters in the room
  const monstersHere = getMonstersInRoom(player.currentRoom);
  if (monstersHere.length > 0) {
    socket.write('\r\n');
    monstersHere.forEach(monster => {
      const verb = monster.presenceVerb || 'is here';

      if (monster.type === 'Boss') {
        // Special boss warning
        socket.write(colorize(`⚠️  WARNING: ${monster.name} (Level ${monster.level}) guards this chamber!\r\n`, 'brightRed'));
      } else {
        const typeIndicator = monster.type === 'Aggressive' ? colorize(' [!]', 'brightRed') :
                              monster.type === 'Neutral' ? colorize(' [~]', 'yellow') :
                              colorize(' [-]', 'dim');
        socket.write(`A ${monster.name}${typeIndicator} ${verb}.\r\n`);
      }
    });
  }

  // Show LLM-powered NPCs in the room
  const npcsHere = npcRegistry.getNpcsInRoom(player.currentRoom);
  if (npcsHere.length > 0) {
    socket.write('\r\n');
    npcsHere.forEach(npc => {
      const mood = npc.brain.personality.mood ? ` (${npc.brain.personality.mood})` : '';
      socket.write(colorize(`[NPC] ${npc.name}${mood} is here. Try: talk ${npc.shortName} <message>\r\n`, 'brightMagenta'));
      const rel = npc.brain.getRelationship(player.name);
      if (rel.score <= NPC_HOSTILE_EJECT_THRESHOLD) {
        socket.write(colorize(`      ${npc.name} glares with open hatred. (Rep ${rel.score}) Speaking to them will get you banished. Offer tribute: give <gold> ${npc.shortName}\r\n`, 'brightRed'));
      } else if (rel.status === 'unfriendly') {
        socket.write(colorize(`      ${npc.name} regards you with distrust. (Rep ${rel.score})\r\n`, 'red'));
      } else if (rel.status === 'friendly' || rel.status === 'allied') {
        socket.write(colorize(`      ${npc.name} greets you warmly. (Rep ${rel.score})\r\n`, 'green'));
      }
    });
  }

  // Show other players in the room (filter invisible unless viewer is admin)
  const playersHere = getPlayersInRoom(player.currentRoom, socket);
  const viewerIsAdmin = isAdmin(player.name);
  const visiblePlayersHere = playersHere.filter(({ player: p }) => {
    if (viewerIsAdmin) return true; // Admins see everyone
    return !p.isInvisible; // Hide invisible players from non-admins
  });

  if (visiblePlayersHere.length > 0) {
    socket.write('\r\n');
    socket.write(colorize('Players here:\r\n', 'brightGreen'));
    visiblePlayersHere.forEach(({ player: otherPlayer }) => {
      const afkTag = otherPlayer.isAFK ? colorize(' (AFK)', 'dim') : '';
      const combatTag = otherPlayer.inCombat ? colorize(' [In Combat]', 'red') : '';
      const invisTag = otherPlayer.isInvisible ? colorize(' [INVIS]', 'dim') : '';
      const pvpTag = otherPlayer.pvpEnabled ? colorize(' [PVP]', 'brightRed') : colorize(' [PEACEFUL]', 'green');
      socket.write(`  ${getDisplayName(otherPlayer, true)}${pvpTag}${afkTag}${combatTag}${invisTag}\r\n`);
    });
  }

  // Show items in the room
  const itemsHere = getItemsInRoom(player.currentRoom);
  if (itemsHere.length > 0) {
    socket.write('\r\n');
    itemsHere.forEach(item => {
      socket.write(colorize(`[ITEM] ${item.name} is lying here.\r\n`, 'brightCyan'));
    });
  }

  // Show available exits (hide exits to realm-gated rooms the player can't enter)
  socket.write('\r\n');
  const exits = Object.keys(room.exits).filter(dir =>
    typeof isRealmGateOpen !== 'function' || isRealmGateOpen(player, room.exits[dir])
  );
  if (exits.length > 0) {
    socket.write(`Exits: ${exits.join(', ')}\r\n`);
  } else {
    socket.write('There are no exits.\r\n');
  }

  // Show combat status if in combat
  if (player.inCombat) {
    const monster = getMonsterById(player.combatTarget);
    if (monster) {
      socket.write(colorize(`\r\n[COMBAT] You are fighting ${monster.name}! (${monster.hp}/${monster.maxHp} HP)\r\n`, 'brightRed'));
    }
  }
}

// ============================================
// MOVEMENT
// ============================================

// Handle movement command
function handleMove(socket, player, direction) {
  // Block movement during combat
  if (player.inCombat) {
    socket.write(colorize("You can't move while in combat! Use 'flee' to escape.\r\n", 'red'));
    return;
  }

  // Cancel any pending aggressive monster grace period (player fled in time)
  cancelGracePeriod(player);

  const room = rooms[player.currentRoom];

  // Normalize direction (handle shortcuts)
  const normalizedDir = DIR_SHORTCUTS[direction] || direction;

  // Check if this is a valid direction
  if (!DIRECTIONS.includes(normalizedDir)) {
    socket.write(`Unknown direction: ${direction}\r\n`);
    return;
  }

  // Check if exit exists in this room
  if (!room.exits[normalizedDir]) {
    socket.write("You can't go that way.\r\n");
    return;
  }

  // Check for boss gates blocking the exit
  const bossGate = BOSS_GATES[player.currentRoom];
  if (bossGate && normalizedDir === bossGate.blockedExit) {
    // Check if boss has been defeated OR is not present in the room
    const bossInRoom = activeMonsters.find(m =>
      m.templateId === bossGate.bossId && m.currentRoom === player.currentRoom
    );

    if (bossInRoom && !defeatedBosses.has(bossGate.bossId)) {
      // Boss is alive and in the room - block passage
      socket.write(bossGate.message);
      return;
    }
    // Boss defeated or not present - allow passage
  }

  // Store old room for broadcasts
  const oldRoomId = player.currentRoom;
  const newRoomId = room.exits[normalizedDir];
  const oppositeDir = OPPOSITE_DIRECTIONS[normalizedDir] || normalizedDir;

  // Tier 2.2: zone-lock check — QP-purchased keys open gated rooms
  if (typeof isZoneUnlocked === 'function' && !isZoneUnlocked(player, newRoomId)) {
    const lock = ZONE_LOCKS[newRoomId];
    socket.write(colorize(`The way to ${lock.label} is sealed by a resonant ward. Redeem the matching key at Nomagio's Repository.\r\n`, 'yellow'));
    return;
  }

  // Tier 3.1: realm-gate check — Neo Kyoto and other farm realms require remort
  if (typeof isRealmGateOpen === 'function' && !isRealmGateOpen(player, newRoomId)) {
    const gate = REALM_GATES[newRoomId];
    socket.write(colorize(`A polite hand stops you at the service door. 'Staff only, traveller. ${gate.label} is for returning travellers. Come back when you've rebooted at least once.'\r\n`, 'yellow'));
    return;
  }

  // Broadcast departure to players in old room (unless invisible)
  if (!player.isInvisible) {
    broadcastToRoom(oldRoomId, `${getDisplayName(player)} leaves ${normalizedDir}.`, socket);
  }

  // Move to new room
  player.currentRoom = newRoomId;

  // Tier 3.1 Phase 7: Neo Kyoto entry achievements
  const nkMatch = newRoomId.match(/^room_(\d+)$/);
  if (nkMatch) {
    const n = parseInt(nkMatch[1], 10);
    if (n >= 201 && n <= 300) {
      unlockAchievement(socket, player, 'clocked_in');
      if (oldRoomId === 'room_100' && newRoomId === 'room_201') {
        unlockAchievement(socket, player, 'staff_pass');
      }
    }
  }

  // Broadcast arrival to players in new room (unless invisible)
  if (!player.isInvisible) {
    broadcastToRoom(newRoomId, `${getDisplayName(player)} arrives from the ${oppositeDir}.`, socket);
  }

  // Tier 2.3: active pet follows (broadcast only — pet state is owned by player)
  if (typeof followPet === 'function') {
    followPet(socket, player, oldRoomId, newRoomId);
  }

  // Track rooms explored (unique)
  if (!player.stats.roomsExplored.includes(newRoomId)) {
    player.stats.roomsExplored.push(newRoomId);
    // Tier 1.8: explorer achievements
    const count = player.stats.roomsExplored.length;
    if (count >= 50) unlockAchievement(socket, player, 'explorer_50');
    if (count >= Object.keys(rooms).length) unlockAchievement(socket, player, 'explorer_all');
  }

  // Quest objective: visit_rooms
  {
    const changes = questManager.updateObjective(player.name, 'visit_rooms', newRoomId, 1);
    for (const ch of changes) {
      if (ch.readyToTurnIn) {
        socket.write(colorize(`[Quest ready: ${ch.def.title} - return to ${ch.def.giver}]\r\n`, 'brightYellow'));
      } else if (ch.failed) {
        socket.write(colorize(`[Quest FAILED: ${ch.def.title}]\r\n`, 'red'));
      }
    }
  }

  // Clear AFK when moving
  if (player.isAFK) {
    player.isAFK = false;
    player.afkMessage = '';
  }

  socket.write(`You go ${normalizedDir}...\r\n`);
  showRoom(socket, player);

  // Check for special room entry messages
  checkSpecialRoomMessages(socket, player);

  // Check for aggressive monsters in the new room
  checkForAggressiveMonsters(socket, player);
}

// Special room entry messages (flavor text, hints, lore)
function checkSpecialRoomMessages(socket, player) {
  const specialMessages = {
    'room_015': {
      message: colorize('\r\nNomagio whispers: ', 'brightCyan') +
               colorize('"Ah, I see you\'ve found the \'Crystal_Dragon_Final_v2_DONOTUSE.\' ', 'cyan') +
               colorize('It was supposed to be a decorative asset, but Valdris accidentally gave it a soul ', 'cyan') +
               colorize('and Morwyn gave it teeth. My advice? Don\'t let it hit you. ', 'cyan') +
               colorize('It\'s a very high-poly way to die."\r\n', 'cyan'),
      onlyOnce: false  // Show every time player enters
    },
    'room_035': {
      message: colorize('\r\nNomagio whispers: ', 'brightCyan') +
               colorize('"The Shadow Lord? Oh, that\'s just Karveth after he found the \'invert colors\' spell ', 'cyan') +
               colorize('and refused to turn it off. He\'s been like this for centuries. ', 'cyan') +
               colorize('Very dramatic, but terrible at parties."\r\n', 'cyan'),
      onlyOnce: false
    },
    'room_085': {
      message: colorize('\r\nNomagio whispers: ', 'brightCyan') +
               colorize('"The Void Guardian was created when someone asked \'what if we made a guard dog, ', 'cyan') +
               colorize('but out of pure nothingness?\' The answer, it turns out, is \'15 feet of bad decisions.\' ', 'cyan') +
               colorize('Good luck!"\r\n', 'cyan'),
      onlyOnce: false
    },
    'room_100': {
      message: colorize('\r\nNomagio whispers: ', 'brightCyan') +
               colorize('"The Archmage Supreme. The big one. The final boss, if you will. ', 'cyan') +
               colorize('I\'d offer advice, but honestly? I\'ve never seen anyone make it this far. ', 'cyan') +
               colorize('If you win, let me know how it goes. I have bets riding on this."\r\n', 'cyan'),
      onlyOnce: false
    }
  };

  const roomMessage = specialMessages[player.currentRoom];
  if (roomMessage) {
    socket.write(roomMessage.message);
  }
}

// ============================================
// COMMANDS
// ============================================

// Show all monsters in the world
function showAllMonsters(socket, player) {
  socket.write(`\r\n=== Active Monsters (${activeMonsters.length}) ===\r\n`);

  // Check if admin for showing IDs
  const showIds = player && isAdmin(player.name);

  // Group monsters by zone
  const byZone = {};
  activeMonsters.forEach(monster => {
    const zone = monster.spawnZone || monster.homeZone || 'Unknown';
    if (!byZone[zone]) byZone[zone] = [];
    byZone[zone].push(monster);
  });

  // Display by zone
  Object.entries(byZone).forEach(([zone, monsters]) => {
    socket.write(`\r\n[${zone}]\r\n`);
    monsters.forEach(monster => {
      const room = rooms[monster.currentRoom];
      const roomName = room ? room.name.substring(0, 20) : monster.currentRoom;
      const typeTag = monster.type === 'Boss' ? ' [B]' : '';
      const hpDisplay = `${monster.hp}/${monster.maxHp}`;
      const idDisplay = showIds ? `${monster.id.padEnd(5)} ` : '';
      socket.write(`  ${idDisplay}${monster.name}${typeTag} Lv${monster.level} ${hpDisplay.padStart(8)} HP - ${roomName}\r\n`);
    });
  });

  socket.write(`\r\nTotal: ${activeMonsters.length} monsters`);
  if (showIds) {
    socket.write(` (IDs shown for admin despawn)`);
  }
  socket.write('\r\n');
}

// Show spawn statistics
function showSpawnStats(socket) {
  socket.write('\r\n=== Spawn Statistics ===\r\n\r\n');

  let totalAttempted = 0;
  let totalSpawned = 0;

  Object.entries(monsterData.zones).forEach(([zoneName, zoneData]) => {
    const stats = spawnStats[zoneName];
    const spawnPct = zoneData.spawnChance * 100;
    const actualPct = stats.attempted > 0
      ? ((stats.spawned / stats.attempted) * 100).toFixed(1)
      : 0;

    socket.write(`${zoneName}:\r\n`);
    socket.write(`  Spawn chance: ${spawnPct}%\r\n`);
    socket.write(`  Rooms checked: ${stats.attempted}\r\n`);
    socket.write(`  Monsters spawned: ${stats.spawned} (${actualPct}%)\r\n`);
    socket.write(`  Available types: ${zoneData.monsters.length}\r\n\r\n`);

    totalAttempted += stats.attempted;
    totalSpawned += stats.spawned;
  });

  socket.write(`Bosses: 3 (fixed locations)\r\n`);
  socket.write(`Total monsters: ${activeMonsters.length}\r\n`);
}

// Handle admin teleport command
function handleTransurf(socket, player, args) {
  // Block during combat
  if (player.inCombat) {
    socket.write(colorize("You can't teleport while in combat!\r\n", 'red'));
    return;
  }

  // Check if room number was provided
  if (!args || args.trim() === '') {
    socket.write('Usage: transurf [room_number]\r\n');
    return;
  }

  // Parse the room number
  const roomNum = parseInt(args.trim(), 10);
  if (isNaN(roomNum)) {
    socket.write('Usage: transurf [room_number]\r\n');
    return;
  }

  // Build the room ID (pad with zeros to 3 digits)
  const targetRoomId = `room_${String(roomNum).padStart(3, '0')}`;

  // Validate room exists
  if (!rooms[targetRoomId]) {
    socket.write('That location does not exist in the Shattered Realms.\r\n');
    return;
  }

  const oldRoom = player.currentRoom;

  // Broadcast departure message to old room
  broadcastToRoom(oldRoom, `${getDisplayName(player)} shimmers and vanishes in a flash of arcane energy.`, socket);

  // Teleport player
  player.currentRoom = targetRoomId;

  // Broadcast arrival message to new room
  broadcastToRoom(targetRoomId, `${getDisplayName(player)} materializes in a swirl of magical light.`, socket);

  // Show teleport message and new room
  socket.write('You focus your arcane powers and teleport!\r\n');
  showRoom(socket, player);
}

// Process player command
function processCommand(socket, player, input) {
  // Expand any leading alias (one pass, no recursion).
  if (input && player && player.aliases) {
    const expanded = expandAlias(player, input);
    if (expanded !== input) input = expanded;
  }

  const command = input.toLowerCase().trim();

  // Handle quit
  if (command === 'quit') {
    // Handle monster combat quit
    if (isInMonsterCombat(player)) {
      handleMonsterCombatDisconnect(player);
    }

    // Handle PVP combat quit (forfeit loss)
    if (isInPvpCombat(player)) {
      handlePvpDisconnect(player);
    }

    if (player.inCombat) {
      socket.write('You flee from combat as you disconnect!\r\n');
      player.inCombat = false;
      player.combatTarget = null;
    }

    // Save player data
    if (player.isRegistered) {
      socket.write('\r\nSaving your progress...\r\n');
      savePlayer(player, null, true);
      socket.write(colorize('Character saved successfully!\r\n', 'green'));

      // Session summary
      const sessionTime = formatDuration(Date.now() - player.sessionStart);
      socket.write('\r\n');
      socket.write(colorize('=== Session Summary ===\r\n', 'brightCyan'));
      socket.write(`Time played: ${sessionTime}\r\n`);
      socket.write(`XP gained: ${colorize(String(player.sessionXPGained), 'yellow')}\r\n`);
      socket.write(`Monsters defeated: ${player.sessionMonstersKilled}\r\n`);
      socket.write(`Items collected: ${player.sessionItemsCollected}\r\n`);
      socket.write(`Gold earned: ${colorize(String(player.sessionGoldEarned), 'brightYellow')}\r\n`);
      socket.write('\r\n');
      socket.write(colorize(`Farewell, ${player.title} ${player.name}! May the realms await your return.\r\n`, 'brightMagenta'));

      // Broadcast departure to room and all players
      broadcastToRoom(player.currentRoom, `${getDisplayName(player)} vanishes in a swirl of mist.`, socket);
      broadcastToAll(colorize(`${getDisplayName(player)} has left the Shattered Realms.`, 'yellow'), socket);
    } else {
      socket.write('Goodbye, traveler!\r\n');
    }

    // Clear auto-save timer
    if (player.autoSaveTimer) {
      clearInterval(player.autoSaveTimer);
    }

    // Save any dirty NPC brains (e.g. from this session's interactions)
    try { npcRegistry.saveAllDirty(); } catch (_) {}

    socket.end();
    return false; // Signal to stop processing
  }

  // Handle save command
  if (command === 'save') {
    if (!player.isRegistered) {
      socket.write('You must be registered to save your character.\r\n');
      return true;
    }
    const success = savePlayer(player, socket, true);
    if (success) {
      socket.write(colorize('Character saved successfully.\r\n', 'green'));
      socket.write(`Progress: Level ${player.level}, ${player.experience} XP, ${player.inventory.length}/${getInventoryCap(player)} items, ${player.gold} gold\r\n`);
    }
    return true;
  }

  // Handle password change command
  if (command === 'password' || command === 'changepassword' || command === 'passwd') {
    if (!player.isRegistered) {
      socket.write('You must be registered to change your password.\r\n');
      return true;
    }

    if (!accountExists(player.name)) {
      socket.write(colorize('Error: No account found for your character.\r\n', 'red'));
      return true;
    }

    // Switch to password change mode
    socket.write('\r\n');
    socket.write(colorize('=== Change Password ===\r\n', 'brightCyan'));
    socket.write('Enter current password: ');
    player.authState = {
      pendingUsername: null,
      pendingPassword: null,
      isPasswordInput: true,
      kickTarget: null
    };
    player.inputMode = 'password_verify_old';
    return true;
  }

  // ============================================
  // COMBAT COMMAND BLOCKING
  // ============================================

  // During Monster combat, only allow: flee, use/drink/eat/consume, qs, score, cast, spells, look
  if (isInMonsterCombat(player)) {
    const isMonsterCombatAllowed =
      command === 'flee' || command === 'run' || command === 'escape' ||
      command === 'qs' || command === 'quickscore' ||
      command === 'score' || command.startsWith('score ') ||
      command === 'consider' || command.startsWith('consider ') || command.startsWith('con ') ||
      command === 'look' || command === 'l' ||
      command === 'spells' || command.startsWith('spells ') ||
      command.startsWith('cast ') ||
      command.startsWith('use ') || command.startsWith('drink ') ||
      command.startsWith('eat ') || command.startsWith('consume ') ||
      command === 'help' || command.startsWith('help ');

    if (!isMonsterCombatAllowed) {
      socket.write(colorize("You can't do that during combat! (flee/cast spell/use potion/qs)\r\n", 'red'));
      return true;
    }
  }

  // During PVP combat, only allow: flee, use/drink/eat/consume, surrender, cast, spells, look
  if (isInPvpCombat(player)) {
    const isPvpAllowed =
      command === 'flee' || command === 'run' || command === 'escape' ||
      command === 'surrender' || command === 'give up' || command === 'yield' ||
      command === 'qs' || command === 'quickscore' ||
      command === 'look' || command === 'l' ||
      command === 'spells' || command.startsWith('spells ') ||
      command.startsWith('cast ') ||
      command.startsWith('use ') || command.startsWith('drink ') ||
      command.startsWith('eat ') || command.startsWith('consume ');

    if (!isPvpAllowed) {
      socket.write(colorize("You can't do that during combat! (flee/cast spell/use potion/surrender)\r\n", 'red'));
      return true;
    }
  }

  // Handle look
  if (command === 'look' || command === 'l') {
    showRoom(socket, player);
    return true;
  }

  // Handle quickscore command (works during combat)
  if (command === 'qs' || command === 'quickscore') {
    showQuickScore(socket, player);
    return true;
  }

  // Handle stats/score command
  // "score" alone = your stats, "score [target]" = player first, then monster
  if (command.startsWith('score ')) {
    const targetName = command.slice(6).trim();

    // Case 1: Check for PLAYER in room first (priority over monsters)
    const targetPlayer = findPlayerInRoom(player.currentRoom, targetName, socket);
    if (targetPlayer) {
      handlePlayerScore(socket, player, targetPlayer);
      return true;
    }

    // Case 2: Check for MONSTER in room
    const monster = findMonsterInRoom(player.currentRoom, targetName);
    if (monster) {
      handleMonsterScore(socket, player, targetName);
      return true;
    }

    // Case 3: Not found
    socket.write(`You don't see "${targetName}" here.\r\n`);
    socket.write(colorize('Hint: Use "score [player]" or "score [monster]" for targets in this room.\r\n', 'dim'));
    return true;
  }

  if (command === 'stats' || command === 'score' || command === 'st') {
    showStats(socket, player);
    return true;
  }

  // Consider <monster>
  if (command === 'consider' || command === 'con') {
    socket.write('Consider what? Usage: consider <monster>\r\n');
    return true;
  }
  if (command.startsWith('consider ') || command.startsWith('con ')) {
    const slice = command.startsWith('consider ') ? 9 : 4;
    handleConsider(socket, player, input.slice(slice));
    return true;
  }

  // Tier 4.1: Clans
  if (command === 'clan' || command === 'clans') {
    handleClan(socket, player, '');
    return true;
  }
  if (command.startsWith('clan ')) {
    handleClan(socket, player, input.slice(5));
    return true;
  }
  if (command === 'cwho') {
    handleClanWho(socket, player);
    return true;
  }
  if (command === 'c' || command.startsWith('c ')) {
    const msg = command === 'c' ? '' : input.slice(2);
    handleClanChannel(socket, player, msg);
    return true;
  }

  // Tier 3.1 Phase 6: hack skill (Neo Kyoto)
  if (command === 'hack' || command === 'hacks') {
    handleHack(socket, player, '');
    return true;
  }
  if (command.startsWith('hack ')) {
    handleHack(socket, player, input.slice(5));
    return true;
  }
  // Tier 3.1 Phase 6: affinity meter
  if (command === 'affinity' || command === 'standing') {
    handleAffinity(socket, player);
    return true;
  }
  // Tier 3.1 Phase 6: train hack from a trainer NPC
  if (command === 'train' || command === 'training') {
    socket.write('Train what? Usage: train hack (must be near a trainer NPC such as Hiro).\r\n');
    return true;
  }
  if (command.startsWith('train ')) {
    handleTrain(socket, player, input.slice(6));
    return true;
  }

  // Aliases
  if (command === 'alias' || command === 'aliases') { handleAlias(socket, player, ''); return true; }
  if (command.startsWith('alias ')) { handleAlias(socket, player, input.slice(6)); return true; }
  if (command === 'unalias') { handleUnalias(socket, player, ''); return true; }
  if (command.startsWith('unalias ')) { handleUnalias(socket, player, input.slice(8)); return true; }

  // Channels
  if (command === 'channels' || command === 'channel') { handleChannels(socket, player); return true; }
  if (command === 'newbie' || command === 'ooc' || command === 'gossip' || command === 'trade') {
    handleChannelMessage(socket, player, command, '');
    return true;
  }
  for (const ch of ['newbie', 'ooc', 'gossip', 'trade']) {
    if (command.startsWith(ch + ' ')) {
      handleChannelMessage(socket, player, ch, input.slice(ch.length + 1));
      return true;
    }
  }

  // Help
  if (command === 'help' || command === '?') { handleHelp(socket, player, ''); return true; }
  if (command.startsWith('help ') || command.startsWith('? ')) {
    const slice = command.startsWith('help ') ? 5 : 2;
    handleHelp(socket, player, input.slice(slice));
    return true;
  }

  // Bestiary
  if (command === 'bestiary') { handleBestiary(socket, player, ''); return true; }
  if (command.startsWith('bestiary ')) { handleBestiary(socket, player, input.slice(9)); return true; }

  // Map
  if (command === 'map') { handleMap(socket, player); return true; }

  // Handle levels command
  if (command === 'levels' || command === 'lvls') {
    showLevels(socket, player);
    return true;
  }

  // Handle attack command
  if (command.startsWith('attack ') || command.startsWith('kill ') || command.startsWith('k ')) {
    let targetName;
    if (command.startsWith('attack ')) {
      targetName = command.slice(7);
    } else if (command.startsWith('kill ')) {
      targetName = command.slice(5);
    } else {
      targetName = command.slice(2);
    }
    handleAttack(socket, player, targetName);
    return true;
  }

  // Handle attack with no argument
  if (command === 'attack' || command === 'kill' || command === 'k' || command === 'a') {
    if (isInMonsterCombat(player) || isInPvpCombat(player)) {
      socket.write(colorize('Combat is automatic! Use flee or use potion.\r\n', 'yellow'));
    } else {
      socket.write('Attack what? Usage: attack [monster name]\r\n');
    }
    return true;
  }

  // Handle flee command
  if (command === 'flee' || command === 'run' || command === 'escape') {
    // Route to PVP handler if in PVP combat
    if (isInPvpCombat(player)) {
      handlePvpFlee(socket, player);
    } else {
      handleFlee(socket, player);
    }
    return true;
  }

  // Handle brief mode
  if (command === 'brief') {
    player.displayMode = 'brief';
    socket.write('Display mode set to BRIEF. Room names and exits only.\r\n');
    return true;
  }

  // Handle verbose mode
  if (command === 'verbose') {
    player.displayMode = 'verbose';
    socket.write('Display mode set to VERBOSE. Full room descriptions enabled.\r\n');
    return true;
  }

  // Handle monsters command
  if (command === 'monsters' || command === 'monsterlist') {
    showAllMonsters(socket, player);
    return true;
  }

  // Handle spawns command
  if (command === 'spawns') {
    showSpawnStats(socket);
    return true;
  }

  // ============================================
  // HEALING CHAPEL & HEALER COMMANDS
  // ============================================

  // ============================================
  // SPELL COMMANDS
  // ============================================

  // Handle spells command (show spellbook)
  if (command === 'spells' || command === 'spellbook' || command === 'spell list') {
    handleSpells(socket, player);
    return true;
  }

  // Handle spells by school
  if (command.startsWith('spells ')) {
    const school = command.slice(7).trim();
    const validSchools = ['malefic', 'theft', 'divination', 'combat', 'protection', 'utility'];
    const matchedSchool = validSchools.find(s => s.startsWith(school.toLowerCase()));
    if (matchedSchool) {
      handleSpells(socket, player, matchedSchool.charAt(0).toUpperCase() + matchedSchool.slice(1));
    } else {
      socket.write(colorize('Unknown school. Schools: Malefic, Theft, Divination, Combat, Protection, Utility\r\n', 'yellow'));
    }
    return true;
  }

  // Handle cast command
  if (command.startsWith('cast ')) {
    handleCast(socket, player, command.slice(5));
    return true;
  }

  if (command === 'cast') {
    socket.write('Cast what? Usage: cast <spell name> [target]\r\n');
    socket.write('Use "spells" to see available spells.\r\n');
    return true;
  }

  // Handle accept summon command
  if (command === 'accept summon' || command === 'accept') {
    handleAcceptSummon(socket, player);
    return true;
  }

  // Handle pray command (chapel healing)
  if (command === 'pray') {
    handlePray(socket, player);
    return true;
  }

  // Eldoria 2.0: play [instrument] for the Shattered Symphony finale
  if (command === 'play' || command.startsWith('play ')) {
    const rest = input.trim().length > 5 ? input.trim().slice(5).trim() : '';
    handlePlayInstrument(socket, player, rest);
    return true;
  }

  // Handle ask healer command
  if (command === 'ask healer' || command === 'ask healer for healing' || command === 'heal with healer') {
    handleAskHealer(socket, player);
    return true;
  }

  // ============================================
  // LLM NPC COMMANDS
  // ============================================

  // talk <npc> [message]
  if (command === 'talk' || command.startsWith('talk ')) {
    const rest = input.trim().slice(5).trim();
    handleTalkNpc(socket, player, rest);
    return true;
  }

  // give <item|gold> <amount?> <npc>
  if (command === 'give' || command.startsWith('give ')) {
    const rest = input.trim().slice(5).trim();
    handleGiveNpc(socket, player, rest);
    return true;
  }

  // Quest commands
  if (command === 'quests' || command === 'quest' || command === 'journal' || command === 'j') {
    handleQuestsList(socket, player);
    return true;
  }
  if (command.startsWith('accept ')) {
    const questId = input.trim().slice(7).trim();
    handleAcceptQuest(socket, player, questId);
    return true;
  }
  if (command.startsWith('abandon ')) {
    const questId = input.trim().slice(8).trim();
    handleAbandonQuest(socket, player, questId);
    return true;
  }

  // Handle chapels command (show chapel locations)
  if (command === 'chapels' || command === 'chapel list' || command === 'find chapel') {
    socket.write('\r\n');
    socket.write(colorize('=== Sacred Chapels of the Shattered Realms ===\r\n', 'brightCyan'));
    socket.write('Chapels offer free healing (5-minute cooldown):\r\n');
    CHAPEL_ROOMS.forEach(roomId => {
      const chapelRoom = rooms[roomId];
      if (chapelRoom) {
        const isHere = player.currentRoom === roomId ? colorize(' [YOU ARE HERE]', 'brightGreen') : '';
        socket.write(`  - ${chapelRoom.name} (${chapelRoom.zone})${isHere}\r\n`);
      }
    });
    socket.write('\r\n');
    return true;
  }

  // ============================================
  // PVP COMBAT COMMANDS
  // ============================================

  // Handle PVP toggle command
  if (command === 'pvp' || command === 'pvp status') {
    handlePvpToggle(socket, player, 'status');
    return true;
  }
  if (command === 'pvp on') {
    handlePvpToggle(socket, player, 'on');
    return true;
  }
  if (command === 'pvp off') {
    handlePvpToggle(socket, player, 'off');
    return true;
  }

  // Handle surrender command (PVP combat only)
  if (command === 'surrender' || command === 'give up' || command === 'yield') {
    handlePvpSurrender(socket, player);
    return true;
  }

  // ============================================
  // WORLD RESET CYCLE COMMANDS
  // ============================================

  // Handle time/reset_timer command
  if (command === 'time' || command === 'reset_timer' || command === 'timer') {
    const remaining = getCycleTimeRemaining();
    const remainingMin = Math.floor(remaining / 60000);
    socket.write('\r\n');
    socket.write(colorize('=== World Reset Timer ===\r\n', 'brightCyan'));
    socket.write(`Cycle: ${colorize(String(cycleNumber), 'brightYellow')}\r\n`);
    socket.write(`Time Until Reset: ${colorize(formatTimeRemaining(remaining), remaining < 300000 ? 'brightRed' : 'green')}\r\n`);
    if (remainingMin <= 5) {
      socket.write(colorize('THE PURGE IS IMMINENT! Prepare yourself!\r\n', 'brightRed'));
    } else if (remainingMin <= 10) {
      socket.write(colorize('The reset approaches. Finish your battles!\r\n', 'yellow'));
    }
    socket.write('\r\n');
    return true;
  }

  // Handle cycle_stats command
  if (command === 'cycle_stats' || command === 'cyclestats' || command === 'cycle') {
    socket.write('\r\n');
    socket.write(colorize(`=== Your Cycle ${cycleNumber} Performance ===\r\n`, 'brightCyan'));
    socket.write(`XP Gained: ${colorize(String(player.cycleXPGained), 'cyan')}\r\n`);
    socket.write(`Monsters Killed: ${colorize(String(player.cycleMonstersKilled), 'green')}\r\n`);
    socket.write(`Gold Earned: ${colorize(String(player.cycleGoldEarned), 'yellow')}\r\n`);
    if (player.cycleBossesDefeated.length > 0) {
      socket.write(`Bosses Defeated: ${colorize(player.cycleBossesDefeated.join(', '), 'magenta')}\r\n`);
    }
    socket.write('\r\n');
    const remaining = getCycleTimeRemaining();
    socket.write(`Time Until Reset: ${colorize(formatTimeRemaining(remaining), remaining < 300000 ? 'brightRed' : 'green')}\r\n`);
    socket.write('\r\n');
    return true;
  }

  // Handle leaderboard command
  if (command === 'leaderboard' || command === 'leaders' || command === 'top') {
    socket.write(displayCycleLeaderboard());
    const remaining = getCycleTimeRemaining();
    socket.write(`Time Until Reset: ${colorize(formatTimeRemaining(remaining), remaining < 300000 ? 'brightRed' : 'green')}\r\n`);
    socket.write('\r\n');
    return true;
  }

  // ============================================
  // MULTIPLAYER COMMUNICATION COMMANDS
  // ============================================

  // Handle say command (local chat)
  if (command.startsWith('say ') || command.startsWith("' ")) {
    const message = command.startsWith('say ') ? command.slice(4) : command.slice(2);
    handleSay(socket, player, message);
    return true;
  }
  if (command === 'say' || command === "'") {
    socket.write('Say what? Usage: say [message]\r\n');
    return true;
  }

  // Handle shout command (global chat)
  if (command.startsWith('shout ') || command.startsWith('! ')) {
    const message = command.startsWith('shout ') ? command.slice(6) : command.slice(2);
    handleShout(socket, player, message);
    return true;
  }
  if (command === 'shout' || command === '!') {
    socket.write('Shout what? Usage: shout [message]\r\n');
    return true;
  }

  // Handle tell/whisper command (private messages)
  if (command.startsWith('tell ') || command.startsWith('whisper ')) {
    const args = command.startsWith('tell ') ? command.slice(5) : command.slice(8);
    handleTell(socket, player, args);
    return true;
  }
  if (command === 'tell' || command === 'whisper') {
    socket.write('Tell whom? Usage: tell [player] [message]\r\n');
    return true;
  }

  // Handle emote command (roleplay actions)
  if (command.startsWith('emote ') || command.startsWith(': ')) {
    const action = command.startsWith('emote ') ? command.slice(6) : command.slice(2);
    handleEmote(socket, player, action);
    return true;
  }
  if (command === 'emote' || command === ':') {
    socket.write('Emote what? Usage: emote [action]\r\n');
    return true;
  }

  // Handle who command (online players)
  if (command === 'who' || command === 'players' || command === 'online') {
    handleWho(socket, player);
    return true;
  }

  // Handle whois command (player details)
  if (command.startsWith('whois ') || command.startsWith('finger ')) {
    const targetName = command.startsWith('whois ') ? command.slice(6) : command.slice(7);
    handleWhois(socket, player, targetName);
    return true;
  }
  if (command === 'whois' || command === 'finger') {
    socket.write('Whois whom? Usage: whois [player]\r\n');
    return true;
  }

  // Handle mysuffix/title command (view your custom suffix)
  if (command === 'mysuffix' || command === 'mytitle' || command === 'title' || command === 'suffix') {
    handleMySuffix(socket, player);
    return true;
  }

  // Handle AFK command
  if (command === 'afk' || command.startsWith('afk ')) {
    const message = command === 'afk' ? '' : command.slice(4);
    handleAFK(socket, player, message);
    return true;
  }

  // Handle back command (remove AFK)
  if (command === 'back') {
    handleBack(socket, player);
    return true;
  }

  // Handle ignore command
  if (command === 'ignore' || command.startsWith('ignore ')) {
    const targetName = command === 'ignore' ? '' : command.slice(7);
    handleIgnore(socket, player, targetName);
    return true;
  }

  // Handle unignore command
  if (command.startsWith('unignore ')) {
    const targetName = command.slice(9);
    handleUnignore(socket, player, targetName);
    return true;
  }
  if (command === 'unignore') {
    socket.write('Unignore whom? Usage: unignore [player]\r\n');
    return true;
  }

  // ============================================
  // ADMIN COMMANDS
  // ============================================

  // Handle admin status / serverstatus command
  if (command === 'admin status' || command === 'serverstatus' || command === 'adminstatus') {
    handleAdminStatus(socket, player);
    return true;
  }

  // Handle shutdown command
  if (command === 'shutdown' || command.startsWith('shutdown ')) {
    const message = command === 'shutdown' ? '' : command.slice(9);
    handleShutdown(socket, player, message);
    return true;
  }

  // Handle save_all command
  if (command === 'save_all' || command === 'saveall') {
    handleSaveAll(socket, player);
    return true;
  }

  // Handle reload_monsters / reset_monsters command
  if (command === 'reload_monsters' || command === 'reloadmonsters' ||
      command === 'reset_monsters' || command === 'resetmonsters') {
    handleReloadMonsters(socket, player);
    return true;
  }

  // ============================================
  // ADMIN: NPC COMMANDS
  // ============================================
  if (command === 'npc_list' || command === 'npclist' || command === 'npcs') {
    if (!isAdmin(player.name)) { socket.write(colorize('Admin only.\r\n', 'red')); return true; }
    const all = npcRegistry.all();
    socket.write(colorize(`\r\n=== NPCs (${all.length}) ===\r\n`, 'brightCyan'));
    for (const npc of all) {
      const room = rooms[npc.currentRoom];
      const roomName = room ? room.name : npc.currentRoom;
      const relCount = Object.keys(npc.brain.relationships).length;
      const epCount = npc.brain.memory.episodes.length;
      socket.write(`  ${npc.id}  -  ${npc.name}  @ ${roomName}  [rels: ${relCount}, episodes: ${epCount}]\r\n`);
    }
    socket.write('\r\n');
    return true;
  }

  if (command === 'npc_reload' || command === 'npcreload') {
    if (!isAdmin(player.name)) { socket.write(colorize('Admin only.\r\n', 'red')); return true; }
    try {
      const n = npcRegistry.reload();
      socket.write(colorize(`Reloaded ${n} NPCs from templates.json (brains preserved).\r\n`, 'green'));
      logAdminCommand(player.name, 'npc_reload');
    } catch (err) {
      socket.write(colorize(`Reload failed: ${err.message}\r\n`, 'red'));
    }
    return true;
  }

  if (command.startsWith('npc_spawn ')) {
    if (!isAdmin(player.name)) { socket.write(colorize('Admin only.\r\n', 'red')); return true; }
    const parts = command.slice(10).trim().split(/\s+/);
    const id = parts[0];
    const room = parts[1];
    if (!id || !room) { socket.write('Usage: npc_spawn <id> <room>\r\n'); return true; }
    if (!rooms[room]) { socket.write(`Unknown room: ${room}\r\n`); return true; }
    try {
      const npc = npcRegistry.spawn(id);
      npcRegistry.moveNpc(id, room);
      socket.write(colorize(`Spawned ${npc.name} at ${room}.\r\n`, 'green'));
      logAdminCommand(player.name, `npc_spawn ${id} ${room}`);
    } catch (err) {
      socket.write(colorize(`Spawn failed: ${err.message}\r\n`, 'red'));
    }
    return true;
  }

  if (command.startsWith('npc_despawn ')) {
    if (!isAdmin(player.name)) { socket.write(colorize('Admin only.\r\n', 'red')); return true; }
    const id = command.slice(12).trim();
    if (!id) { socket.write('Usage: npc_despawn <id>\r\n'); return true; }
    const ok = npcRegistry.despawn(id);
    socket.write(ok ? colorize(`Despawned ${id}.\r\n`, 'green') : colorize(`No NPC: ${id}\r\n`, 'red'));
    if (ok) logAdminCommand(player.name, `npc_despawn ${id}`);
    return true;
  }

  if (command.startsWith('npc_forget ')) {
    if (!isAdmin(player.name)) { socket.write(colorize('Admin only.\r\n', 'red')); return true; }
    const parts = command.slice(11).trim().split(/\s+/);
    const id = parts[0];
    const pname = parts[1];
    if (!id || !pname) { socket.write('Usage: npc_forget <npc_id> <player_name>\r\n'); return true; }
    const ok = npcRegistry.forget(id, pname);
    socket.write(ok ? colorize(`${id} has forgotten ${pname}.\r\n`, 'green') : colorize(`Nothing to forget, or NPC not found.\r\n`, 'yellow'));
    if (ok) logAdminCommand(player.name, `npc_forget ${id} ${pname}`);
    return true;
  }

  if (command.startsWith('quest_give ')) {
    if (!isAdmin(player.name)) { socket.write(colorize('Admin only.\r\n', 'red')); return true; }
    const parts = command.slice(11).trim().split(/\s+/);
    const pname = parts[0];
    const qid = parts[1];
    if (!pname || !qid) { socket.write('Usage: quest_give <player> <quest_id>\r\n'); return true; }
    const target = findPlayerByName(pname);
    if (!target) { socket.write(colorize(`Player '${pname}' not online.\r\n`, 'red')); return true; }
    const result = questManager.giveQuest(target.player.name, qid);
    if (!result.ok) { socket.write(colorize(`Failed: ${result.reason}\r\n`, 'red')); return true; }
    socket.write(colorize(`Gave "${result.def.title}" to ${target.player.name}.\r\n`, 'green'));
    target.socket.write(colorize(`\r\n*** QUEST GRANTED: ${result.def.title} ***\r\n${result.def.description}\r\n`, 'brightYellow'));
    logAdminCommand(player.name, `quest_give ${pname} ${qid}`);
    return true;
  }

  if (command === 'quest_list' || command === 'questlist') {
    if (!isAdmin(player.name)) { socket.write(colorize('Admin only.\r\n', 'red')); return true; }
    const defs = questManager.allDefinitions();
    socket.write(colorize(`\r\n=== Quests (${defs.length}) ===\r\n`, 'brightCyan'));
    for (const d of defs) {
      socket.write(`  ${d.id}  -  ${d.title}  (giver: ${d.giver})\r\n`);
    }
    socket.write('\r\n');
    return true;
  }

  // Handle kick command
  if (command.startsWith('kick ')) {
    const args = command.slice(5);
    handleKick(socket, player, args);
    return true;
  }
  if (command === 'kick') {
    socket.write('Usage: kick <player> [reason]\r\n');
    return true;
  }

  // Handle goto command
  if (command.startsWith('goto ')) {
    const targetName = command.slice(5);
    handleGoto(socket, player, targetName);
    return true;
  }
  if (command === 'goto') {
    socket.write('Usage: goto <player>\r\n');
    return true;
  }

  // Handle bring command
  if (command.startsWith('bring ')) {
    const targetName = command.slice(6);
    handleBring(socket, player, targetName);
    return true;
  }
  if (command === 'bring') {
    socket.write('Usage: bring <player>\r\n');
    return true;
  }

  // Handle send command
  if (command.startsWith('send ')) {
    const args = command.slice(5);
    handleSend(socket, player, args);
    return true;
  }
  if (command === 'send') {
    socket.write('Usage: send <player> <room#>\r\n');
    return true;
  }

  // Handle list_players / adminwho command
  if (command === 'list_players' || command === 'adminwho' || command === 'listplayers') {
    handleAdminWho(socket, player);
    return true;
  }

  // Handle transurf (admin teleport) command
  if (command.startsWith('transurf')) {
    const args = command.slice(8).trim(); // Remove 'transurf' prefix
    handleTransurf(socket, player, args);
    return true;
  }

  // Handle set_level command
  if (command.startsWith('set_level ') || command.startsWith('setlevel ')) {
    const args = command.startsWith('set_level ') ? command.slice(10) : command.slice(9);
    handleSetLevel(socket, player, args);
    return true;
  }
  if (command === 'set_level' || command === 'setlevel') {
    socket.write('Usage: set_level <player> <level>\r\n');
    return true;
  }

  // Handle give_exp command
  if (command.startsWith('give_exp ') || command.startsWith('giveexp ') || command.startsWith('givexp ')) {
    let args;
    if (command.startsWith('give_exp ')) args = command.slice(9);
    else if (command.startsWith('giveexp ')) args = command.slice(8);
    else args = command.slice(7);
    handleGiveExp(socket, player, args);
    return true;
  }
  if (command === 'give_exp' || command === 'giveexp' || command === 'givexp') {
    socket.write('Usage: give_exp <player> <amount>\r\n');
    return true;
  }

  // Handle give_item command
  if (command.startsWith('give_item ') || command.startsWith('giveitem ')) {
    const args = command.startsWith('give_item ') ? command.slice(10) : command.slice(9);
    handleGiveItem(socket, player, args);
    return true;
  }
  if (command === 'give_item' || command === 'giveitem') {
    socket.write('Usage: give_item <player> <item name>\r\n');
    return true;
  }

  // Handle give_gold command
  if (command.startsWith('give_gold ') || command.startsWith('givegold ')) {
    const args = command.startsWith('give_gold ') ? command.slice(10) : command.slice(9);
    handleGiveGold(socket, player, args);
    return true;
  }
  if (command === 'give_gold' || command === 'givegold') {
    socket.write('Usage: give_gold <player> <amount>\r\n');
    return true;
  }

  // Handle heal command (admin)
  if (command.startsWith('heal ')) {
    const targetName = command.slice(5);
    handleHeal(socket, player, targetName);
    return true;
  }
  if (command === 'heal') {
    socket.write('Usage: heal <player>\r\n');
    return true;
  }

  // Handle heal_all command
  if (command === 'heal_all' || command === 'healall') {
    handleHealAll(socket, player);
    return true;
  }

  // Handle revive command
  if (command.startsWith('revive ')) {
    const targetName = command.slice(7);
    handleRevive(socket, player, targetName);
    return true;
  }
  if (command === 'revive') {
    socket.write('Usage: revive <player>\r\n');
    return true;
  }

  // Handle broadcast / announce command
  if (command.startsWith('broadcast ') || command.startsWith('announce ')) {
    const message = command.startsWith('broadcast ') ? command.slice(10) : command.slice(9);
    handleBroadcast(socket, player, message);
    return true;
  }
  if (command === 'broadcast' || command === 'announce') {
    socket.write('Usage: broadcast <message> or announce <message>\r\n');
    return true;
  }

  // Handle god_say command
  if (command.startsWith('god_say ') || command.startsWith('godsay ')) {
    const message = command.startsWith('god_say ') ? command.slice(8) : command.slice(7);
    handleGodSay(socket, player, message);
    return true;
  }
  if (command === 'god_say' || command === 'godsay') {
    socket.write('Usage: god_say <message>\r\n');
    return true;
  }

  // Handle invisible / invis command
  if (command === 'invisible' || command === 'invis') {
    handleInvisible(socket, player);
    return true;
  }

  // Handle spawn command
  if (command.startsWith('spawn ')) {
    const args = command.slice(6);
    handleSpawn(socket, player, args);
    return true;
  }
  if (command === 'spawn') {
    socket.write('Usage: spawn <monster name> <room#>\r\n');
    return true;
  }

  // Handle monster_types command
  if (command === 'monster_types' || command === 'monstertypes' || command === 'mtypes') {
    handleMonsterTypes(socket, player);
    return true;
  }

  // Handle despawn command
  if (command.startsWith('despawn ')) {
    const monsterId = command.slice(8);
    handleDespawn(socket, player, monsterId);
    return true;
  }
  if (command === 'despawn') {
    socket.write('Usage: despawn <monster_id>\r\n');
    return true;
  }

  // Handle create_item command
  if (command.startsWith('create_item ') || command.startsWith('createitem ')) {
    const args = command.startsWith('create_item ') ? command.slice(12) : command.slice(11);
    handleCreateItem(socket, player, args);
    return true;
  }
  if (command === 'create_item' || command === 'createitem') {
    socket.write('Usage: create_item <item name> <room#>\r\n');
    return true;
  }

  // Handle modify_room command
  if (command.startsWith('modify_room ') || command.startsWith('modifyroom ')) {
    const args = command.startsWith('modify_room ') ? command.slice(12) : command.slice(11);
    handleModifyRoom(socket, player, args);
    return true;
  }
  if (command === 'modify_room' || command === 'modifyroom') {
    socket.write('Usage: modify_room <room#> <property> <value>\r\n');
    return true;
  }

  // Handle admin_score command
  if (command.startsWith('admin_score ') || command.startsWith('adminscore ')) {
    const targetName = command.startsWith('admin_score ') ? command.slice(12) : command.slice(11);
    handleAdminScore(socket, player, targetName);
    return true;
  }
  if (command === 'admin_score' || command === 'adminscore') {
    socket.write('Usage: admin_score <player>\r\n');
    return true;
  }

  // Handle logs command
  if (command.startsWith('logs ')) {
    const args = command.slice(5);
    handleLogs(socket, player, args);
    return true;
  }
  if (command === 'logs') {
    handleLogs(socket, player, '');
    return true;
  }

  // Handle test_combat command
  if (command === 'test_combat' || command === 'testcombat') {
    handleTestCombat(socket, player);
    return true;
  }

  // Handle test_loot command
  if (command === 'test_loot' || command === 'testloot') {
    handleTestLoot(socket, player);
    return true;
  }

  // Handle god_mode command
  if (command === 'god_mode' || command === 'godmode') {
    handleGodMode(socket, player);
    return true;
  }

  // Handle zap command (Level 15 or Admin - instant kill monster)
  if (command.startsWith('zap ')) {
    const args = command.slice(4);
    handleZap(socket, player, args);
    return true;
  }
  if (command === 'zap') {
    socket.write('Usage: zap <monster>\r\n');
    return true;
  }

  // Handle cursor_jump command (Level 28 Cursor-Bearer or Admin)
  if (command.startsWith('cursor_jump ') || command.startsWith('cursorjump ')) {
    const args = command.startsWith('cursor_jump ') ? command.slice(12) : command.slice(11);
    handleCursorJump(socket, player, args);
    return true;
  }
  if (command === 'cursor_jump' || command === 'cursorjump') {
    socket.write('Usage: cursor_jump <room_number>\r\n');
    return true;
  }

  // Handle global_variable_reset command (Level 30 First Admin or Admin)
  if (command.startsWith('global_variable_reset ') || command.startsWith('globalvariablereset ')) {
    const args = command.startsWith('global_variable_reset ') ? command.slice(22) : command.slice(20);
    handleGlobalVariableReset(socket, player, args);
    return true;
  }
  if (command === 'global_variable_reset' || command === 'globalvariablereset') {
    handleGlobalVariableReset(socket, player, '');
    return true;
  }

  // Handle teleport_all command
  if (command.startsWith('teleport_all ') || command.startsWith('teleportall ')) {
    const args = command.startsWith('teleport_all ') ? command.slice(13) : command.slice(12);
    handleTeleportAll(socket, player, args);
    return true;
  }
  if (command === 'teleport_all' || command === 'teleportall') {
    socket.write('Usage: teleport_all <room#>\r\n');
    return true;
  }

  // Handle ban command
  if (command.startsWith('ban ')) {
    const args = command.slice(4);
    handleBan(socket, player, args);
    return true;
  }
  if (command === 'ban') {
    socket.write('Usage: ban <player>\r\n');
    return true;
  }

  // Handle unban command
  if (command.startsWith('unban ')) {
    const targetName = command.slice(6);
    handleUnban(socket, player, targetName);
    return true;
  }
  if (command === 'unban') {
    socket.write('Usage: unban <player>\r\n');
    return true;
  }

  // Handle banlist command
  if (command === 'banlist' || command === 'bans') {
    handleBanList(socket, player);
    return true;
  }

  // Handle promote_admin command (use split for robust parsing)
  if (command.startsWith('promote_admin ') || command.startsWith('promoteadmin ') || command.startsWith('promote ')) {
    // Split on whitespace and get everything after the command word
    const parts = command.split(/\s+/);
    if (parts.length >= 2) {
      // Join remaining parts in case of accidental spaces (though names shouldn't have spaces)
      const targetName = parts.slice(1).join(' ').trim();
      if (targetName && /^[a-z]+$/i.test(targetName)) {
        handlePromoteAdmin(socket, player, targetName);
      } else {
        socket.write('Usage: promote_admin <player>\r\n');
        socket.write('Player name must contain only letters.\r\n');
      }
    } else {
      socket.write('Usage: promote_admin <player>\r\n');
    }
    return true;
  }
  if (command === 'promote_admin' || command === 'promoteadmin' || command === 'promote') {
    socket.write('Usage: promote_admin <player>\r\n');
    return true;
  }

  // Handle demote_admin command (use split for robust parsing)
  if (command.startsWith('demote_admin ') || command.startsWith('demoteadmin ') || command.startsWith('demote ')) {
    // Split on whitespace and get everything after the command word
    const parts = command.split(/\s+/);
    if (parts.length >= 2) {
      const targetName = parts.slice(1).join(' ').trim();
      if (targetName && /^[a-z]+$/i.test(targetName)) {
        handleDemoteAdmin(socket, player, targetName);
      } else {
        socket.write('Usage: demote_admin <player>\r\n');
        socket.write('Player name must contain only letters.\r\n');
      }
    } else {
      socket.write('Usage: demote_admin <player>\r\n');
    }
    return true;
  }
  if (command === 'demote_admin' || command === 'demoteadmin' || command === 'demote') {
    socket.write('Usage: demote_admin <player>\r\n');
    return true;
  }

  // Handle adminlist command
  if (command === 'adminlist' || command === 'admins') {
    handleAdminList(socket, player);
    return true;
  }

  // Handle reset_password command (admin)
  if (command.startsWith('reset_password ') || command.startsWith('resetpassword ')) {
    const targetName = command.startsWith('reset_password ') ? command.slice(15) : command.slice(14);
    handleResetPassword(socket, player, targetName.trim());
    return true;
  }
  if (command === 'reset_password' || command === 'resetpassword') {
    socket.write('Usage: reset_password <player>\r\n');
    return true;
  }

  // Handle suffix command (admin)
  if (command.startsWith('suffix ')) {
    const args = command.slice(7);
    handleSuffix(socket, player, args);
    return true;
  }
  if (command === 'suffix') {
    handleSuffix(socket, player, '');
    return true;
  }

  // Handle force_reset command (admin)
  if (command === 'force_reset' || command === 'forcereset') {
    if (!isAdmin(player.name)) {
      socket.write("You don't have permission to use that command.\r\n");
      return true;
    }
    logAdminCommand(player.name, 'force_reset');
    socket.write(colorize('Initiating world reset...\r\n', 'brightRed'));
    broadcastToAll(colorize(`[ADMIN] ${getDisplayName(player)} has triggered a world reset!`, 'brightRed'));
    executeWorldReset();
    return true;
  }

  // Handle set_reset_timer command (admin)
  if (command.startsWith('set_reset_timer ') || command.startsWith('setresettimer ')) {
    if (!isAdmin(player.name)) {
      socket.write("You don't have permission to use that command.\r\n");
      return true;
    }
    const args = command.startsWith('set_reset_timer ') ? command.slice(16) : command.slice(14);
    const minutes = parseInt(args);
    if (isNaN(minutes) || minutes < 1 || minutes > 120) {
      socket.write('Usage: set_reset_timer <minutes> (1-120)\r\n');
      return true;
    }
    logAdminCommand(player.name, `set_reset_timer ${minutes}`);
    // Adjust cycle start time to make remaining time = minutes
    cycleStartTime = Date.now() - (CYCLE_DURATION - (minutes * 60000));
    socket.write(colorize(`World reset timer set to ${minutes} minutes.\r\n`, 'green'));
    broadcastToAll(colorize(`[ADMIN] World reset timer adjusted to ${minutes} minutes!`, 'yellow'));
    return true;
  }
  if (command === 'set_reset_timer' || command === 'setresettimer') {
    socket.write('Usage: set_reset_timer <minutes>\r\n');
    return true;
  }

  // Handle disable_reset command (admin)
  if (command === 'disable_reset' || command === 'disablereset') {
    if (!isAdmin(player.name)) {
      socket.write("You don't have permission to use that command.\r\n");
      return true;
    }
    if (!cycleResetEnabled) {
      socket.write('World reset is already disabled.\r\n');
      return true;
    }
    logAdminCommand(player.name, 'disable_reset');
    cycleResetEnabled = false;
    socket.write(colorize('World reset DISABLED.\r\n', 'yellow'));
    broadcastToAll(colorize('[ADMIN] Automatic world reset has been disabled.', 'yellow'));
    return true;
  }

  // Handle enable_reset command (admin)
  if (command === 'enable_reset' || command === 'enablereset') {
    if (!isAdmin(player.name)) {
      socket.write("You don't have permission to use that command.\r\n");
      return true;
    }
    if (cycleResetEnabled) {
      socket.write('World reset is already enabled.\r\n');
      return true;
    }
    logAdminCommand(player.name, 'enable_reset');
    cycleResetEnabled = true;
    cycleStartTime = Date.now(); // Reset the timer
    socket.write(colorize('World reset ENABLED. Timer restarted.\r\n', 'green'));
    broadcastToAll(colorize('[ADMIN] Automatic world reset has been enabled!', 'green'));
    return true;
  }

  // Handle admin / admin_help command
  if (command === 'admin' || command === 'admin_help' || command === 'adminhelp') {
    handleAdminHelp(socket, player, '');
    return true;
  }
  if (command.startsWith('admin ')) {
    const specificCmd = command.slice(6);
    handleAdminHelp(socket, player, specificCmd);
    return true;
  }

  // ============================================
  // INVENTORY COMMANDS
  // ============================================

  // Handle get/take command
  if (command.startsWith('get ') || command.startsWith('take ') || command.startsWith('pick up ')) {
    let itemName;
    if (command.startsWith('get ')) {
      itemName = command.slice(4);
    } else if (command.startsWith('take ')) {
      itemName = command.slice(5);
    } else {
      itemName = command.slice(8);
    }
    handleGet(socket, player, itemName);
    return true;
  }

  // Handle drop command
  if (command.startsWith('drop ')) {
    const itemName = command.slice(5);
    handleDrop(socket, player, itemName);
    return true;
  }

  // Handle give command (give item to another player)
  if (command.startsWith('give ')) {
    const args = command.slice(5);
    handleGive(socket, player, args);
    return true;
  }
  if (command === 'give') {
    socket.write('Usage: give <item> to <player>  OR  give <player> <item>\r\n');
    return true;
  }

  // Handle inventory command
  if (command === 'inventory' || command === 'inv' || command === 'i') {
    showInventory(socket, player);
    return true;
  }

  // Handle equipment command
  if (command === 'equipment' || command === 'eq' || command === 'gear') {
    showEquipment(socket, player);
    return true;
  }

  // Handle equip command
  if (command.startsWith('equip ') || command.startsWith('wear ') || command.startsWith('wield ')) {
    let itemName;
    if (command.startsWith('equip ')) {
      itemName = command.slice(6);
    } else if (command.startsWith('wear ')) {
      itemName = command.slice(5);
    } else {
      itemName = command.slice(6);
    }
    handleEquip(socket, player, itemName);
    return true;
  }

  // Handle unequip command
  if (command.startsWith('unequip ') || command.startsWith('remove ')) {
    let slotName;
    if (command.startsWith('unequip ')) {
      slotName = command.slice(8);
    } else {
      slotName = command.slice(7);
    }
    handleUnequip(socket, player, slotName);
    return true;
  }

  // Handle use/drink command
  if (command.startsWith('use ') || command.startsWith('drink ') || command.startsWith('eat ') || command.startsWith('consume ')) {
    let itemName;
    if (command.startsWith('use ')) {
      itemName = command.slice(4);
    } else if (command.startsWith('drink ')) {
      itemName = command.slice(6);
    } else if (command.startsWith('eat ')) {
      itemName = command.slice(4);
    } else {
      itemName = command.slice(8);
    }
    // Route to combat handlers if in combat
    if (isInMonsterCombat(player)) {
      handleMonsterCombatUseItem(socket, player, itemName);
    } else if (isInPvpCombat(player)) {
      handlePvpUseItem(socket, player, itemName);
    } else {
      handleUse(socket, player, itemName);
    }
    return true;
  }

  // Handle examine command (works for items AND monsters)
  if (command.startsWith('examine ') || command.startsWith('inspect ') || command.startsWith('look at ')) {
    let targetName;
    if (command.startsWith('examine ')) {
      targetName = command.slice(8);
    } else if (command.startsWith('inspect ')) {
      targetName = command.slice(8);
    } else {
      targetName = command.slice(8);
    }

    // Check if target is a monster in the room first
    const monster = findMonsterInRoom(player.currentRoom, targetName);
    if (monster) {
      handleMonsterScore(socket, player, targetName);
    } else {
      handleExamine(socket, player, targetName);
    }
    return true;
  }

  // Handle "go [direction]" command
  if (command.startsWith('go ')) {
    const direction = command.slice(3).trim();
    handleMove(socket, player, direction);
    return true;
  }

  // Handle direct movement (e.g., "north", "n")
  if (DIRECTIONS.includes(command) || DIR_SHORTCUTS[command]) {
    handleMove(socket, player, command);
    return true;
  }

  // Tier 1 dispatch
  if (handleTier1Command(socket, player, input)) return true;

  // Tier 2 dispatch
  if (handleTier2Command(socket, player, input)) return true;

  // Unknown command
  socket.write(`Unknown command: ${input}\r\n`);
  socket.write('Try: look, attack [monster], flee, stats, levels, save, quit\r\n');
  socket.write('     inventory (i), equipment (eq), get/drop, equip/unequip, use/drink, examine\r\n');
  socket.write('     say, shout, tell [player], emote, who, whois [player]\r\n');
  socket.write('     afk, back, ignore [player], unignore [player]\r\n');
  socket.write('     go [direction], brief, verbose, monsters, spawns\r\n');
  return true;
}

// ============================================
// TIER 1 SYSTEMS (§1.1 – §1.10)
// ============================================

// ---------- 1.1 Abilities / Training ----------
const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis'];
const ABILITY_LABEL = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS' };
const ABILITY_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom' };
const ABILITY_CAP = 25;

function abilityMod(v) { return Math.floor((v - 10) / 2); }
function getStrBonus(player) {
  if (!player || !player.abilities) return 0;
  return Math.max(0, abilityMod(player.abilities.str || 10));
}
function getFleeChance(player) {
  if (!player || !player.abilities) return FLEE_SUCCESS_CHANCE;
  const dex = player.abilities.dex || 10;
  const bonus = Math.max(0, (dex - 10)) * 0.02;
  return Math.min(0.9, FLEE_SUCCESS_CHANCE + bonus);
}
function getWisRegenBonus(player) {
  if (!player || !player.abilities) return 0;
  return Math.max(0, abilityMod(player.abilities.wis || 10));
}
function trainingCost(current) {
  // cheap early, steep 20+
  if (current < 13) return 50;
  if (current < 17) return 200;
  if (current < 20) return 600;
  if (current < 23) return 1500;
  return 3000;
}

function ensureT1Defaults(player) {
  if (!player.abilities) player.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10 };
  if (player.charClass === undefined) player.charClass = null;
  if (!player.affects) player.affects = [];
  if (!player.resists) player.resists = {};
  if (player.practicePoints === undefined) player.practicePoints = 0;
  if (!player.practiceRecord) player.practiceRecord = {};
  if (!player.spellProficiencies) player.spellProficiencies = {};
  if (!player.achievementsUnlocked) player.achievementsUnlocked = [];
  if (player.activeTitle === undefined) player.activeTitle = null;
  if (!player.shopsVisited) player.shopsVisited = [];
  if (!player.schoolsCast) player.schoolsCast = [];
  if (player.bank === undefined) player.bank = 0;
  if (player.bankUses === undefined) player.bankUses = 0;
  if (!player.roomsVisited) player.roomsVisited = [];
  if (!player.mail) player.mail = [];
  if (player.lastChatAt === undefined) player.lastChatAt = Date.now();
}

function handleAbilities(socket, player) {
  ensureT1Defaults(player);
  socket.write('\r\n');
  socket.write(colorize('=== Abilities ===  (cap 25)\r\n', 'brightCyan'));
  for (const k of ABILITY_KEYS) {
    const v = player.abilities[k];
    const mod = abilityMod(v);
    const sign = mod >= 0 ? '+' : '';
    socket.write(`  ${ABILITY_LABEL[k]}  ${String(v).padStart(2)} (${sign}${mod})\r\n`);
  }
  socket.write(`  Practice: ${colorize(String(player.practicePoints), 'brightYellow')} pts\r\n`);
  if (player.charClass) {
    socket.write(`  Class: ${colorize(player.charClass.charAt(0).toUpperCase() + player.charClass.slice(1), 'brightMagenta')}\r\n`);
  }
}

function handleTrain(socket, player, args) {
  ensureT1Defaults(player);
  if (!isChapelRoom(player.currentRoom)) {
    socket.write(colorize('You must be in a chapel sanctuary to train.\r\n', 'yellow'));
    return;
  }
  const stat = (args || '').trim().toLowerCase();
  if (!stat || !ABILITY_KEYS.includes(stat)) {
    socket.write('Usage: train <str|dex|con|int|wis>\r\n');
    return;
  }
  const cur = player.abilities[stat];
  if (cur >= ABILITY_CAP) {
    socket.write(colorize(`Your ${ABILITY_NAME[stat]} is already at the cap of ${ABILITY_CAP}.\r\n`, 'yellow'));
    return;
  }
  if (player.practicePoints < 1) {
    socket.write(colorize('You have no practice points to spend.\r\n', 'yellow'));
    return;
  }
  const cost = trainingCost(cur);
  if (player.gold < cost) {
    socket.write(colorize(`You need ${cost} gold to train ${ABILITY_NAME[stat]} (you have ${player.gold}).\r\n`, 'yellow'));
    return;
  }
  player.abilities[stat] = cur + 1;
  player.gold -= cost;
  player.practicePoints -= 1;
  // Tier 1.1: CON +1 maxHP, INT +1 maxMana per train rank
  if (stat === 'con') {
    player.maxHP += 1;
    player.currentHP = Math.min(player.maxHP, player.currentHP + 1);
  } else if (stat === 'int') {
    player.maxMana += 1;
    player.currentMana = Math.min(player.maxMana, player.currentMana + 1);
  }
  socket.write(colorize(`Your ${ABILITY_NAME[stat]} rises to ${player.abilities[stat]}! (-${cost} gold, -1 practice)\r\n`, 'brightGreen'));
  if (player.abilities[stat] >= 25) unlockAchievement(socket, player, 'master_smith');
}

// ---------- 1.2 Classes ----------
const CLASS_DEFS = {
  warder: { name: 'Warder', hpMult: 1.25, manaMult: 0.75, schools: ['Combat', 'Protection'], role: 'Melee bulwark' },
  loresinger: { name: 'Loresinger', hpMult: 0.85, manaMult: 1.50, schools: ['Malefic', 'Divination', 'Utility'], role: 'Ranged caster' },
  echobound: { name: 'Echobound', hpMult: 1.00, manaMult: 1.10, schools: ['Theft', 'Utility'], role: 'Hybrid rogue' }
};

function handleClass(socket, player, args) {
  ensureT1Defaults(player);
  const sub = (args || '').trim().toLowerCase();
  if (!sub) {
    socket.write('\r\n');
    socket.write(colorize('=== Classes ===\r\n', 'brightCyan'));
    for (const [key, def] of Object.entries(CLASS_DEFS)) {
      const marker = player.charClass === key ? colorize(' [YOURS]', 'brightYellow') : '';
      socket.write(`  ${colorize(def.name, 'brightMagenta')} — HP×${def.hpMult} / Mana×${def.manaMult} — Schools: ${def.schools.join(', ')}${marker}\r\n`);
      socket.write(`     ${def.role}\r\n`);
    }
    if (!player.charClass) {
      socket.write(colorize('\r\nAt level 5 you may pick a class permanently with: class <warder|loresinger|echobound>\r\n', 'yellow'));
    }
    return;
  }
  if (!CLASS_DEFS[sub]) {
    socket.write('Unknown class. Choose: warder, loresinger, echobound.\r\n');
    return;
  }
  if (player.charClass) {
    socket.write(colorize(`Your oath is already sworn — you are a ${CLASS_DEFS[player.charClass].name}. The choice is permanent and cannot be changed.\r\n`, 'yellow'));
    return;
  }
  if (player.level < 5) {
    socket.write(colorize('Reach level 5 before choosing a class.\r\n', 'yellow'));
    return;
  }
  player.charClass = sub;
  const def = CLASS_DEFS[sub];
  // Apply HP/mana multipliers to current max values
  player.maxHP = Math.floor(player.maxHP * def.hpMult);
  player.maxMana = Math.floor(player.maxMana * def.manaMult);
  player.currentHP = player.maxHP;
  player.currentMana = player.maxMana;
  socket.write(colorize(`\r\nYou are now a ${def.name}. The oath is sworn.\r\n`, 'brightGreen'));
  socket.write(colorize(`Your HP × ${def.hpMult}, Mana × ${def.manaMult}. Schools unlocked: ${def.schools.join(', ')}\r\n`, 'brightCyan'));
  unlockAchievement(socket, player, 'class_chosen');
  savePlayer(player, socket, true);
}

// ---------- 1.3 Affects ----------
const AFFECT_DEFS = {
  poisoned: { label: 'Poisoned', dot: 4 },
  burning:  { label: 'Burning',  dot: 6 },
  bleeding: { label: 'Bleeding', dot: 3 },
  stunned:  { label: 'Stunned',  dot: 0 },
  shielded: { label: 'Shielded', dot: 0 },
  hasted:   { label: 'Hasted',   dot: 0 },
  silenced: { label: 'Silenced', dot: 0 },
  blessed:  { label: 'Blessed',  dot: 0 }
};

function applyAffect(player, key, durationMs, potency = 0) {
  ensureT1Defaults(player);
  if (!AFFECT_DEFS[key]) return;
  player.affects = player.affects.filter(a => a.key !== key);
  player.affects.push({ key, expiresAt: Date.now() + durationMs, potency });
}
function removeAffect(player, key) {
  if (!player.affects) return;
  player.affects = player.affects.filter(a => a.key !== key);
}
function hasAffect(player, key) {
  if (!player.affects) return false;
  const now = Date.now();
  return player.affects.some(a => a.key === key && a.expiresAt > now);
}

function handleAffects(socket, player) {
  ensureT1Defaults(player);
  const now = Date.now();
  socket.write('\r\n');
  socket.write(colorize('=== Active Affects ===\r\n', 'brightCyan'));
  // Purge expired
  player.affects = player.affects.filter(a => a.expiresAt > now);
  if (player.affects.length === 0 && (!player.effects || Object.keys(player.effects).length === 0)) {
    socket.write('  (none)\r\n');
    return;
  }
  for (const a of player.affects) {
    const def = AFFECT_DEFS[a.key] || { label: a.key };
    const remaining = Math.max(0, Math.ceil((a.expiresAt - now) / 1000));
    socket.write(`  ${colorize(def.label, 'yellow')} — ${remaining}s` + (a.potency ? ` (x${a.potency})` : '') + '\r\n');
  }
  // Bridge legacy player.effects
  if (player.effects) {
    for (const [k, eff] of Object.entries(player.effects)) {
      if (eff && eff.expiresAt && eff.expiresAt > now) {
        const remaining = Math.ceil((eff.expiresAt - now) / 1000);
        socket.write(`  ${colorize(k, 'cyan')} (legacy) — ${remaining}s\r\n`);
      }
    }
  }
}

// Tick affects every 6 seconds
setInterval(() => {
  const now = Date.now();
  for (const [sock, player] of players) {
    if (!player || !player.isRegistered) continue;
    // Tier 1.8: hermit — 1 hour without chatting
    if (player.lastChatAt && (now - player.lastChatAt) >= 3600000) {
      unlockAchievement(sock, player, 'hermit');
    }
    if (!player.affects || player.affects.length === 0) continue;
    const remaining = [];
    for (const a of player.affects) {
      if (a.expiresAt <= now) {
        const def = AFFECT_DEFS[a.key];
        if (sock && def) sock.write(colorize(`Your ${def.label} fades.\r\n`, 'dim'));
        continue;
      }
      const def = AFFECT_DEFS[a.key];
      if (def && def.dot > 0 && player.currentHP > 0) {
        player.currentHP = Math.max(1, player.currentHP - def.dot);
        if (sock) sock.write(colorize(`[${def.label}] -${def.dot} HP\r\n`, 'red'));
      }
      remaining.push(a);
    }
    player.affects = remaining;
  }
}, 6000);

// ---------- 1.4 Damage Types / Resists ----------
function getPlayerResists(player) {
  const agg = {};
  if (!player.equipped) return agg;
  for (const slot of Object.keys(player.equipped)) {
    const it = player.equipped[slot];
    if (!it || !it.resists) continue;
    for (const [type, val] of Object.entries(it.resists)) {
      agg[type] = (agg[type] || 0) + val;
    }
  }
  // cap at 75
  for (const k of Object.keys(agg)) if (agg[k] > 75) agg[k] = 75;
  return agg;
}
function applyMonsterResist(damage, weaponType, monster) {
  if (!monster || !monster.resists) return damage;
  const pct = monster.resists[weaponType || 'physical'];
  if (typeof pct !== 'number') return damage;
  return Math.max(1, Math.round(damage * (1 - pct / 100)));
}
function applyPlayerResist(damage, monsterType, player) {
  const resists = getPlayerResists(player);
  const pct = resists[monsterType || 'physical'];
  if (typeof pct !== 'number') return damage;
  return Math.max(1, Math.round(damage * (1 - pct / 100)));
}

// ---------- 1.5 Group ----------
const GROUPS = new Map(); // leaderName -> { leader, members: [names] }

function findGroupOf(playerName) {
  for (const g of GROUPS.values()) {
    if (g.members.includes(playerName)) return g;
  }
  return null;
}
function handleGroup(socket, player, args) {
  const sub = (args || '').trim();
  if (!sub) {
    const g = findGroupOf(player.name);
    if (!g) {
      socket.write('You are not in a group. Use: group <player> to invite.\r\n');
      return;
    }
    socket.write(colorize('=== Your group ===\r\n', 'brightCyan'));
    socket.write(`Leader: ${g.leader}\r\n`);
    socket.write(`Members: ${g.members.join(', ')}\r\n`);
    return;
  }
  const parts = sub.split(/\s+/);
  if (parts[0].toLowerCase() === 'kick' && parts[1]) {
    const g = findGroupOf(player.name);
    if (!g || g.leader !== player.name) { socket.write('Only the group leader can kick.\r\n'); return; }
    const target = parts[1];
    g.members = g.members.filter(n => n.toLowerCase() !== target.toLowerCase());
    socket.write(`${target} kicked from your group.\r\n`);
    return;
  }
  // invite
  const targetName = parts[0];
  let group = findGroupOf(player.name);
  if (!group) {
    group = { leader: player.name, members: [player.name] };
    GROUPS.set(player.name, group);
  }
  if (group.leader !== player.name) { socket.write('Only the leader can invite.\r\n'); return; }
  if (group.members.length >= 5) { socket.write('Group is full (5).\r\n'); return; }
  if (!group.members.some(n => n.toLowerCase() === targetName.toLowerCase())) {
    group.members.push(targetName);
  }
  socket.write(colorize(`You invite ${targetName} into your group.\r\n`, 'green'));
}
function handleFollow(socket, player, args) {
  const who = (args || '').trim();
  if (!who) {
    if (player.following) {
      socket.write(`You stop following ${player.following}.\r\n`);
      player.following = null;
    } else {
      socket.write('Usage: follow <player> (or "follow" alone to stop)\r\n');
    }
    return;
  }
  player.following = who;
  socket.write(colorize(`You begin following ${who}.\r\n`, 'cyan'));
}
function handleGquit(socket, player) {
  const g = findGroupOf(player.name);
  if (!g) { socket.write('You are not in a group.\r\n'); return; }
  g.members = g.members.filter(n => n !== player.name);
  if (g.leader === player.name || g.members.length === 0) {
    GROUPS.delete(g.leader);
  }
  socket.write('You leave the group.\r\n');
}
function handleGroupTell(socket, player, msg) {
  const g = findGroupOf(player.name);
  if (!g) { socket.write('You are not in a group.\r\n'); return; }
  const text = (msg || '').trim();
  if (!text) { socket.write('What do you want to say to the group?\r\n'); return; }
  for (const [sock, p] of players) {
    if (p && p.name && g.members.includes(p.name)) {
      sock.write(colorize(`[group] ${player.name}: ${text}\r\n`, 'brightGreen'));
    }
  }
}
function handleAssist(socket, player, who) {
  socket.write(`You move to assist ${who || 'your group'}.\r\n`);
}

// ---------- 1.6 Shops ----------
// ============================================
// Tier 3.1 Phase 6 - Neo Kyoto: Hack skill, Affinity, Trainers
// ============================================

// Interactable terminals seeded across Neo Kyoto. Hack succeeds on d20 + skill >= dc.
// Each entry: { id, label, dc, kind, payload }
//   kind: 'loot' | 'unlock_exit' | 'teleport' | 'despawn_minions'
//   payload: shape depends on kind
const NEO_KYOTO_INTERACTABLES = {
  'room_215': [
    { id: 'noodle_display', label: 'noodle-stall display panel', dc: 8, kind: 'loot',
      payload: { gold: 60, items: ['yen_chip'] } }
  ],
  'room_232': [
    { id: 'rack_maintenance', label: 'rack maintenance panel', dc: 12, kind: 'loot',
      payload: { gold: 0, items: ['bytecode_shard', 'deleted_memory'] } }
  ],
  'room_245': [
    { id: 'queue_kiosk', label: 'queue priority kiosk', dc: 10, kind: 'teleport',
      payload: { roomId: 'room_249', message: 'Your priority is upgraded. The queue snaps four places forward and you stumble out the other side.' } }
  ],
  'room_267': [
    { id: 'submersion_controls', label: 'submersion controls panel', dc: 14, kind: 'loot',
      payload: { gold: 200, items: ['bytecode_shard', 'neon_eye', 'corrupted_datapad'] } }
  ],
  'room_295': [
    { id: 'cron_killswitch', label: 'cron daemon kill switch', dc: 18, kind: 'despawn_minions',
      payload: { templateId: 'cron_daemon', message: 'A pulse of negative-acknowledgment ripples out. Every cron daemon in the room hesitates, evaluates, and shuts down its own subprocess.' } }
  ]
};

// One-shot per-cycle tracking: which interactables have been consumed.
// Resets at world reset (cycle reset).
const interactablesUsed = new Set();

function getInteractablesInRoom(roomId) {
  return NEO_KYOTO_INTERACTABLES[roomId] || [];
}

function spawnSecuritySubroutine(roomId, reason) {
  const template = monsterData.templates['security_subroutine'];
  if (!template) return null;
  const monster = {
    id: generateMonsterId(),
    templateId: 'security_subroutine',
    name: template.name,
    type: template.type || 'Aggressive',
    level: template.level,
    hp: template.hp,
    maxHp: template.hp,
    str: template.str,
    description: template.description,
    currentRoom: roomId,
    spawnZone: 'AlarmTriggered',
    isWandering: false,
    movementVerbs: template.movementVerbs,
    presenceVerb: template.presenceVerb,
    loot: template.loot,
    damageType: template.damageType || null,
    resists: template.resists || null
  };
  activeMonsters.push(monster);
  broadcastToRoom(roomId, colorize(`*ALARM TRIGGERED* A Security Subroutine spawns into the room. ${reason || ''}`, 'brightRed'));
  return monster;
}

function handleHack(socket, player, args) {
  ensureT2Defaults(player);

  const roomInteractables = getInteractablesInRoom(player.currentRoom);
  if (roomInteractables.length === 0) {
    socket.write(colorize('There is nothing here to hack. Try a Neo Kyoto terminal.\r\n', 'yellow'));
    return;
  }

  if (!args || args.trim() === '') {
    socket.write(colorize('=== Hackable terminals in this room ===\r\n', 'brightCyan'));
    for (const it of roomInteractables) {
      const usedKey = `${player.currentRoom}:${it.id}`;
      const used = interactablesUsed.has(usedKey);
      const usedTag = used ? colorize(' [DEPLETED]', 'dim') : '';
      socket.write(`  ${it.label} (DC ${it.dc})${usedTag}\r\n`);
    }
    socket.write(colorize(`Your hack skill: ${player.skills.hack || 0}\r\n`, 'cyan'));
    socket.write('Usage: hack <target keyword>\r\n');
    return;
  }

  const q = args.trim().toLowerCase();
  const target = roomInteractables.find(it => it.id.includes(q) || it.label.toLowerCase().includes(q));
  if (!target) {
    socket.write(colorize(`No "${args}" terminal here. Try "hack" alone to see what is available.\r\n`, 'yellow'));
    return;
  }

  const usedKey = `${player.currentRoom}:${target.id}`;
  if (interactablesUsed.has(usedKey)) {
    socket.write(colorize(`The ${target.label} has already been hacked this cycle.\r\n`, 'yellow'));
    return;
  }

  // Roll d20 + skill (+ static_tea buff if active)
  const skill = player.skills.hack || 0;
  let buff = 0;
  if (player.effects && player.effects['hack_buff'] && player.effects['hack_buff'].expiresAt > Date.now()) {
    buff = player.effects['hack_buff'].amount || 0;
  }
  const roll = 1 + Math.floor(Math.random() * 20);
  const total = roll + skill + buff;
  const buffNote = buff > 0 ? ` + ${buff} (static tea)` : '';
  socket.write(colorize(`\r\n[hack] d20=${roll} + skill ${skill}${buffNote} = ${total} vs DC ${target.dc}\r\n`, 'cyan'));

  if (total >= target.dc) {
    interactablesUsed.add(usedKey);
    socket.write(colorize(`SUCCESS. The ${target.label} yields.\r\n`, 'brightGreen'));
    broadcastToRoom(player.currentRoom, colorize(`${getDisplayName(player)} hacks the ${target.label}.`, 'cyan'), socket);

    if (target.kind === 'loot') {
      if (target.payload.gold) {
        player.gold += target.payload.gold;
        socket.write(colorize(`  +${target.payload.gold} gold spills out of the panel.\r\n`, 'yellow'));
      }
      for (const itemId of (target.payload.items || [])) {
        const item = createItem(itemId);
        if (item) {
          addItemToRoom(player.currentRoom, item);
          socket.write(colorize(`  ${item.name} clatters to the floor.\r\n`, 'brightCyan'));
        }
      }
    } else if (target.kind === 'unlock_exit') {
      const direction = target.payload.direction;
      const destination = target.payload.roomId;
      const room = rooms[player.currentRoom];
      if (room && room.exits && !room.exits[direction]) {
        room.exits[direction] = destination;
        socket.write(colorize(`  A panel slides open. A new ${direction} exit reveals itself.\r\n`, 'brightGreen'));
      } else {
        socket.write(colorize('  The panel hisses, but no new exit appears.\r\n', 'yellow'));
      }
    } else if (target.kind === 'teleport') {
      socket.write(colorize(`  ${target.payload.message}\r\n`, 'brightCyan'));
      const dest = target.payload.roomId;
      if (rooms[dest]) {
        broadcastToRoom(player.currentRoom, `${getDisplayName(player)} flickers out of the room.`, socket);
        player.currentRoom = dest;
        broadcastToRoom(dest, `${getDisplayName(player)} flickers into the room.`, socket);
        handleLook(socket, player);
      }
      // Tier 3.1 Phase 7: Queue Jumper achievement
      if (target.id === 'queue_kiosk') unlockAchievement(socket, player, 'queue_jumper');
    } else if (target.kind === 'despawn_minions') {
      const before = activeMonsters.length;
      const minionTpl = target.payload.templateId;
      activeMonsters = activeMonsters.filter(m => !(m.currentRoom === player.currentRoom && m.templateId === minionTpl));
      const removed = before - activeMonsters.length;
      socket.write(colorize(`  ${target.payload.message}\r\n`, 'brightCyan'));
      socket.write(colorize(`  ${removed} subprocess(es) shut down.\r\n`, 'green'));
    }

    // First-hack achievement
    if (typeof unlockAchievement === 'function' && !player.achievementsUnlocked.includes('off_the_books')) {
      player.achievementsUnlocked.push('off_the_books');
      socket.write(colorize('Achievement: Off The Books\r\n', 'brightYellow'));
    }
    return;
  }

  // Failure path: alarm_triggered
  socket.write(colorize(`FAILURE. The ${target.label} pings an alarm.\r\n`, 'brightRed'));
  if (Math.random() < 0.6) {
    spawnSecuritySubroutine(player.currentRoom, 'It targets you, the most recent hash.');
  } else {
    socket.write(colorize('  The alarm sounds but nothing answers. You have a second of grace.\r\n', 'yellow'));
  }
}

function handleAffinity(socket, player) {
  ensureT2Defaults(player);
  const r = player.affinity.replicant;
  const h = player.affinity.human;
  let label = 'Unaligned';
  if (r >= 5 && h < 5) label = 'Replicant-leaning';
  else if (h >= 5 && r < 5) label = 'Human-leaning';
  else if (r >= 3 && h >= 3) label = 'Balanced (both paths active)';
  socket.write('\r\n');
  socket.write(colorize('=== Neo Kyoto Affinity ===\r\n', 'brightMagenta'));
  socket.write(`  Replicant: ${colorize(String(r), 'brightCyan')}\r\n`);
  socket.write(`  Human:     ${colorize(String(h), 'brightYellow')}\r\n`);
  socket.write(`  Standing:  ${colorize(label, 'brightGreen')}\r\n`);
  socket.write(colorize('Affinity persists across remort. It can only be reset via redemption at the Repository.\r\n', 'dim'));
  socket.write('\r\n');
}

// Trainer registry — NPC ID -> { skill, costPerPoint, cap }
const SKILL_TRAINERS = {
  hiro: { skill: 'hack', costPerPoint: 5, cap: 10 }
};

function handleTrain(socket, player, args) {
  ensureT2Defaults(player);
  const skillName = (args || '').trim().toLowerCase();
  if (!skillName) {
    socket.write('Usage: train <skill>. Trainers must be in the same room.\r\n');
    return;
  }
  // Find trainer NPC in current room
  const npcsHere = (typeof npcRegistry !== 'undefined' && npcRegistry.getNpcsInRoom)
    ? npcRegistry.getNpcsInRoom(player.currentRoom) : [];
  let trainer = null;
  let trainerSpec = null;
  for (const npc of npcsHere) {
    const spec = SKILL_TRAINERS[npc.id];
    if (spec && spec.skill === skillName) {
      trainer = npc;
      trainerSpec = spec;
      break;
    }
  }
  if (!trainer) {
    socket.write(colorize(`No trainer here teaches ${skillName}.\r\n`, 'yellow'));
    return;
  }
  const current = player.skills[skillName] || 0;
  if (current >= trainerSpec.cap) {
    socket.write(colorize(`Your ${skillName} skill is already at the cap (${trainerSpec.cap}). ${trainer.name} has nothing more to teach.\r\n`, 'yellow'));
    return;
  }
  const cost = trainerSpec.costPerPoint;
  if (player.gold < cost) {
    socket.write(colorize(`Training costs ${cost} gold per point. You have ${player.gold}.\r\n`, 'yellow'));
    return;
  }
  player.gold -= cost;
  player.skills[skillName] = current + 1;
  socket.write(colorize(`\r\n${trainer.name} drills you on ${skillName} for an hour. You pay ${cost} gold.\r\n`, 'brightGreen'));
  socket.write(colorize(`Your ${skillName} skill rises to ${player.skills[skillName]}.\r\n`, 'brightCyan'));
  if (typeof trainer.brain !== 'undefined' && trainer.brain.recordInteraction) {
    trainer.brain.recordInteraction(player.name, `trained ${skillName} (now ${player.skills[skillName]})`, 2, 2);
  }
  // Phase 6 achievements
  if (skillName === 'hack' && player.skills.hack >= 10 && !player.achievementsUnlocked.includes('root_access')) {
    player.achievementsUnlocked.push('root_access');
    socket.write(colorize('Achievement: Root Access (max hack skill)\r\n', 'brightYellow'));
  }
}

const SHOPS = {
  'room_003': {
    keeper: "Rusty",
    name: "Rusty's Armory",
    buyMult: 1.0,
    sellMult: 0.4,
    stock: ['leather_vest', 'iron_shortsword', 'wooden_shield', 'minor_healing_potion', 'torch']
  },
  'room_050': {
    keeper: 'The Quiet Man',
    name: 'The Quiet Exchange',
    buyMult: 1.2,
    sellMult: 0.5,
    stock: ['chainmail', 'shadow_cloak', 'steel_longsword', 'greater_healing_potion']
  },
  'room_105': {
    keeper: 'Singing Merchant',
    name: 'The Singing Merchant',
    buyMult: 0.9,
    sellMult: 0.6,
    stock: ['minor_healing_potion', 'greater_healing_potion', 'superior_healing_potion', 'minor_mana_potion', 'greater_mana_potion']
  },
  // Tier 3.1 - Neo Kyoto shops
  'room_214': {
    keeper: 'Rusty',
    name: "Rusty's Chromeshop",
    buyMult: 1.0,
    sellMult: 0.4,
    stock: ['stun_baton', 'null_pointer_dagger', 'packet_sniffer_pistol', 'mesh_jacket', 'faraday_hood', 'synth_boots', 'static_buckler', 'stim_pak', 'root_beer']
  },
  'room_225': {
    keeper: 'Ms. Voss',
    name: 'Tyrell-Nomagios Procurement',
    buyMult: 1.5,
    sellMult: 0.5,
    stock: ['shock_prod', 'root_kit_blade', 'kill_switch_pistol', 'ice_breaker_rifle', 'chrome_plating', 'vr_goggles', 'encrypted_gloves', 'riot_shield', 'ice_deflector', 'rollback_ring']
  },
  'room_277': {
    keeper: '42',
    name: 'The Back Of The Bazaar',
    buyMult: 0.9,
    sellMult: 0.6,
    stock: ['compile_error_rod', 'fork_bomb_axe', 'segfault_cleaver', 'holoprojector', 'gecko_grips', 'cold_brew', 'patch_notes_scroll', 'admin_cola', 'static_tea', 'iron_scrap', 'harmonic_shard', 'mana_petal', 'spring_water', 'herb_bundle', 'ember_core']
  }
};

function getShopHere(player) {
  return SHOPS[player.currentRoom] || null;
}

function itemLookupAny(itemId) {
  // Search across itemData categories for a template
  if (!itemData) return null;
  for (const cat of Object.values(itemData)) {
    if (cat && typeof cat === 'object' && cat[itemId]) return cat[itemId];
  }
  return null;
}

function handleShopList(socket, player) {
  const shop = getShopHere(player);
  if (!shop) { socket.write("There's no shop here.\r\n"); return; }
  if (!player.shopsVisited.includes(player.currentRoom)) {
    player.shopsVisited.push(player.currentRoom);
    if (player.shopsVisited.length >= 3) unlockAchievement(socket, player, 'all_shops');
  }
  socket.write('\r\n');
  socket.write(colorize(`=== ${shop.name} — keeper ${shop.keeper} ===\r\n`, 'brightYellow'));
  socket.write(colorize(`Buy price ×${shop.buyMult}, Sell price ×${shop.sellMult}\r\n`, 'dim'));
  for (const id of shop.stock) {
    const tpl = itemLookupAny(id);
    if (!tpl) continue;
    const price = Math.max(1, Math.round((tpl.value || 1) * shop.buyMult));
    socket.write(`  ${tpl.name.padEnd(30)} ${colorize(String(price) + ' gold', 'brightYellow')}\r\n`);
  }
}
function handleBuy(socket, player, args) {
  const shop = getShopHere(player);
  if (!shop) { socket.write("There's no shop here.\r\n"); return; }
  const q = (args || '').trim().toLowerCase();
  if (!q) { socket.write('Usage: buy <item>\r\n'); return; }
  let foundId = null;
  for (const id of shop.stock) {
    const tpl = itemLookupAny(id);
    if (!tpl) continue;
    if (id.includes(q) || tpl.name.toLowerCase().includes(q)) { foundId = id; break; }
  }
  if (!foundId) { socket.write(`${shop.keeper} doesn't sell that here.\r\n`); return; }
  const tpl = itemLookupAny(foundId);
  const price = Math.max(1, Math.round((tpl.value || 1) * shop.buyMult));
  if (player.gold < price) { socket.write(colorize(`You need ${price} gold (you have ${player.gold}).\r\n`, 'yellow')); return; }
  const item = createItem(foundId);
  if (!item) { socket.write('Something went wrong creating that item.\r\n'); return; }
  player.gold -= price;
  player.inventory.push(item);
  socket.write(colorize(`You bought ${item.name} for ${price} gold.\r\n`, 'green'));
}
function handleSell(socket, player, args) {
  const shop = getShopHere(player);
  if (!shop) { socket.write("There's no shop here.\r\n"); return; }
  const q = (args || '').trim().toLowerCase();
  if (!q) { socket.write('Usage: sell <item>\r\n'); return; }
  const idx = player.inventory.findIndex(it => it.id.includes(q) || it.name.toLowerCase().includes(q));
  if (idx < 0) { socket.write("You don't have that.\r\n"); return; }
  const item = player.inventory[idx];
  const price = Math.max(1, Math.round((item.value || 1) * shop.sellMult));
  player.inventory.splice(idx, 1);
  player.gold += price;
  socket.write(colorize(`You sold ${item.name} for ${price} gold.\r\n`, 'green'));
}
function handleValue(socket, player, args) {
  const shop = getShopHere(player);
  const q = (args || '').trim().toLowerCase();
  if (!q) { socket.write('Usage: value <item>\r\n'); return; }
  const it = player.inventory.find(x => x.id.includes(q) || x.name.toLowerCase().includes(q))
          || itemLookupAny(q);
  if (!it) { socket.write("That doesn't appear in your inventory.\r\n"); return; }
  const mult = shop ? shop.sellMult : 0.3;
  const price = Math.max(1, Math.round((it.value || 1) * mult));
  socket.write(`${it.name} is worth ${colorize(String(price) + ' gold', 'brightYellow')} at ${shop ? shop.keeper : 'the average fence'}.\r\n`);
}

// ============================================
// Tier 4.1 - Clans (player-organized guilds)
// ============================================

const CLAN_FOUNDING_COST = 1000;
const CLAN_NAME_MIN = 3;
const CLAN_NAME_MAX = 24;
const CLAN_TAG_MIN = 2;
const CLAN_TAG_MAX = 5;
const CLAN_RANK_LEVELS = { member: 1, officer: 2, leader: 3 };
const CLANS_PATH = path.join(__dirname, 'clans.json');
let clansData = null;
let clansDirty = false;

function loadClans() {
  try {
    clansData = JSON.parse(fs.readFileSync(CLANS_PATH, 'utf8'));
    if (!clansData.clans) clansData.clans = {};
  } catch (e) {
    console.log('clans.json not loaded, initializing empty:', e.message);
    clansData = { clans: {} };
  }
}
function saveClans() {
  if (!clansData) return;
  try {
    if (fs.existsSync(CLANS_PATH)) {
      fs.copyFileSync(CLANS_PATH, CLANS_PATH + '.bak');
    }
    fs.writeFileSync(CLANS_PATH, JSON.stringify(clansData, null, 2), 'utf8');
    clansDirty = false;
  } catch (e) {
    console.error('Failed to save clans.json:', e.message);
  }
}
function clanIdFromName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function getClan(idOrName) {
  if (!clansData) loadClans();
  if (!idOrName) return null;
  const key = idOrName.toLowerCase();
  if (clansData.clans[key]) return clansData.clans[key];
  // Try by display name match
  for (const c of Object.values(clansData.clans)) {
    if (c.name.toLowerCase() === key || (c.tag && c.tag.toLowerCase() === key)) return c;
  }
  // Try slug
  const slug = clanIdFromName(idOrName);
  return clansData.clans[slug] || null;
}
function listClans() {
  if (!clansData) loadClans();
  return Object.values(clansData.clans);
}
function getPlayerClan(player) {
  if (!player || !player.clan) return null;
  return getClan(player.clan);
}
function clanRankAtLeast(player, minRank) {
  if (!player.clanRank) return false;
  const lvl = CLAN_RANK_LEVELS[player.clanRank] || 0;
  const need = CLAN_RANK_LEVELS[minRank] || 0;
  return lvl >= need;
}
function clanMemberByName(clan, name) {
  if (!clan || !clan.members) return null;
  const lc = (name || '').toLowerCase();
  for (const k of Object.keys(clan.members)) {
    if (k.toLowerCase() === lc) return { name: k, member: clan.members[k] };
  }
  return null;
}
function isClanNameTaken(name) {
  const slug = clanIdFromName(name);
  if (!clansData) loadClans();
  if (clansData.clans[slug]) return true;
  for (const c of Object.values(clansData.clans)) {
    if (c.name.toLowerCase() === name.toLowerCase()) return true;
  }
  return false;
}
function isClanTagTaken(tag) {
  if (!tag) return false;
  if (!clansData) loadClans();
  for (const c of Object.values(clansData.clans)) {
    if (c.tag && c.tag.toLowerCase() === tag.toLowerCase()) return true;
  }
  return false;
}

// Sync helper - if a player record's clan ref is stale (clan disbanded etc), clear it on load
function reconcilePlayerClan(player) {
  if (!player.clan) return;
  const c = getClan(player.clan);
  if (!c) {
    player.clan = null;
    player.clanRank = null;
    return;
  }
  const m = clanMemberByName(c, player.name);
  if (!m) {
    player.clan = null;
    player.clanRank = null;
  } else {
    player.clanRank = m.member.rank;
  }
}

function getOnlineClanmates(clanId) {
  if (!clanId) return [];
  const out = [];
  for (const { player, socket } of getOnlinePlayers()) {
    if (player.clan === clanId) out.push({ player, socket });
  }
  return out;
}

function broadcastToClan(clanId, message, excludeSocket = null) {
  for (const { socket } of getOnlineClanmates(clanId)) {
    if (socket === excludeSocket) continue;
    socket.write(`\r\n${message}\r\n> `);
  }
}

// ---------- 4.1 Clan command suite ----------

function handleClan(socket, player, args) {
  ensureT2Defaults(player);
  if (!clansData) loadClans();

  const argRaw = (args || '').trim();
  const parts = argRaw.split(/\s+/);
  const sub = (parts[0] || '').toLowerCase();
  const rest = parts.slice(1).join(' ').trim();

  if (!sub || sub === 'help') return showClanHelp(socket, player);
  if (sub === 'list') return clanListCmd(socket, player);
  if (sub === 'create') return clanCreateCmd(socket, player, rest);
  if (sub === 'info') return clanInfoCmd(socket, player, rest);
  if (sub === 'invite') return clanInviteCmd(socket, player, rest);
  if (sub === 'accept') return clanAcceptCmd(socket, player, rest);
  if (sub === 'decline') return clanDeclineCmd(socket, player, rest);
  if (sub === 'leave') return clanLeaveCmd(socket, player);
  if (sub === 'kick') return clanKickCmd(socket, player, rest);
  if (sub === 'promote') return clanPromoteCmd(socket, player, rest);
  if (sub === 'demote') return clanDemoteCmd(socket, player, rest);
  if (sub === 'deposit') return clanDepositCmd(socket, player, rest);
  if (sub === 'withdraw') return clanWithdrawCmd(socket, player, rest);
  if (sub === 'disband') return clanDisbandCmd(socket, player);
  if (sub === 'motto') return clanMottoCmd(socket, player, rest);
  if (sub === 'invites') return clanInvitesCmd(socket, player);

  // Default: show your clan info
  if (player.clan) return clanInfoCmd(socket, player, '');
  socket.write(colorize(`Unknown clan command "${sub}". Type "clan help".\r\n`, 'yellow'));
}

function showClanHelp(socket, player) {
  socket.write('\r\n');
  socket.write(colorize('=== Clan commands ===\r\n', 'brightCyan'));
  socket.write('  clan list                       - all clans on the server\r\n');
  socket.write('  clan create <name> [tag]        - found a new clan (1000g)\r\n');
  socket.write('  clan info [name]                - details on a clan (defaults to yours)\r\n');
  socket.write('  clan invite <player>            - invite a player (officer+)\r\n');
  socket.write('  clan invites                    - list pending invites for you\r\n');
  socket.write('  clan accept <clan>              - accept an invite\r\n');
  socket.write('  clan decline <clan>             - refuse an invite\r\n');
  socket.write('  clan leave                      - leave your clan\r\n');
  socket.write('  clan kick <player>              - remove a member (officer+)\r\n');
  socket.write('  clan promote <player>           - member -> officer (leader only)\r\n');
  socket.write('  clan demote <player>            - officer -> member (leader only)\r\n');
  socket.write('  clan deposit <amount>           - put gold into clan treasury\r\n');
  socket.write('  clan withdraw <amount>          - take gold from treasury (leader only)\r\n');
  socket.write('  clan motto <text>               - set clan motto (leader only)\r\n');
  socket.write('  clan disband                    - dissolve your clan (leader only)\r\n');
  socket.write('  c <message>                     - speak on clan channel\r\n');
  socket.write('  cwho                            - list online clanmates\r\n');
  socket.write('\r\n');
}

function clanListCmd(socket, player) {
  const clans = listClans();
  socket.write('\r\n');
  socket.write(colorize('=== Clans ===\r\n', 'brightCyan'));
  if (clans.length === 0) {
    socket.write(colorize('  No clans have been founded yet. Be the first.\r\n', 'dim'));
    socket.write('\r\n');
    return;
  }
  for (const c of clans) {
    const memberCount = Object.keys(c.members || {}).length;
    const tag = c.tag ? colorize(`[${c.tag}]`, 'brightYellow') + ' ' : '';
    socket.write(`  ${tag}${colorize(c.name, 'brightWhite')} (${memberCount} members) - leader: ${c.leader}\r\n`);
  }
  socket.write('\r\n');
}

function clanCreateCmd(socket, player, rest) {
  if (player.clan) {
    socket.write(colorize(`You are already in a clan (${getPlayerClan(player).name}). Leave first.\r\n`, 'yellow'));
    return;
  }
  if (!rest) {
    socket.write('Usage: clan create <name> [tag]\r\n');
    return;
  }
  // Parse: last token might be tag if it's short and quoted differently — keep it simple: split on space, last word if 2-5 chars and the rest forms name
  const tokens = rest.split(/\s+/);
  let name, tag = null;
  if (tokens.length >= 2 && tokens[tokens.length - 1].length >= CLAN_TAG_MIN && tokens[tokens.length - 1].length <= CLAN_TAG_MAX) {
    tag = tokens[tokens.length - 1].toUpperCase();
    name = tokens.slice(0, -1).join(' ');
  } else {
    name = rest;
  }
  if (name.length < CLAN_NAME_MIN || name.length > CLAN_NAME_MAX) {
    socket.write(colorize(`Clan name must be ${CLAN_NAME_MIN}-${CLAN_NAME_MAX} characters.\r\n`, 'yellow'));
    return;
  }
  if (!/^[A-Za-z][A-Za-z0-9 _-]*$/.test(name)) {
    socket.write(colorize('Clan name must start with a letter and contain only letters, digits, spaces, hyphens, underscores.\r\n', 'yellow'));
    return;
  }
  if (isClanNameTaken(name)) {
    socket.write(colorize(`A clan named "${name}" already exists.\r\n`, 'yellow'));
    return;
  }
  if (tag && !/^[A-Za-z0-9]+$/.test(tag)) {
    socket.write(colorize('Clan tag must be alphanumeric only.\r\n', 'yellow'));
    return;
  }
  if (tag && isClanTagTaken(tag)) {
    socket.write(colorize(`Clan tag [${tag}] is taken.\r\n`, 'yellow'));
    return;
  }
  if (player.gold < CLAN_FOUNDING_COST) {
    socket.write(colorize(`Founding a clan costs ${CLAN_FOUNDING_COST} gold (you have ${player.gold}).\r\n`, 'yellow'));
    return;
  }
  player.gold -= CLAN_FOUNDING_COST;
  const id = clanIdFromName(name);
  const clan = {
    id, name, tag, founder: player.name, leader: player.name,
    createdAt: Date.now(), treasury: 0, motto: '',
    members: { [player.name]: { rank: 'leader', joinedAt: Date.now() } }
  };
  if (!clansData) loadClans();
  clansData.clans[id] = clan;
  saveClans();
  player.clan = id;
  player.clanRank = 'leader';
  socket.write(colorize(`\r\n*** Clan founded: ${name}${tag ? ' ['+tag+']' : ''} ***\r\n`, 'brightGreen'));
  socket.write(colorize(`You are its first leader. ${CLAN_FOUNDING_COST} gold has been spent on the founding charter.\r\n`, 'cyan'));
  broadcastToAll(colorize(`[Clan] ${player.name} has founded ${name}${tag ? ' ['+tag+']' : ''}.`, 'brightYellow'), socket);
}

function clanInfoCmd(socket, player, rest) {
  let clan = null;
  if (rest) {
    clan = getClan(rest);
    if (!clan) {
      socket.write(colorize(`No clan matches "${rest}".\r\n`, 'yellow'));
      return;
    }
  } else {
    clan = getPlayerClan(player);
    if (!clan) {
      socket.write(colorize('You are not in a clan. Type "clan list" to see existing ones, or "clan create <name>" to found one.\r\n', 'yellow'));
      return;
    }
  }
  socket.write('\r\n');
  const tagPart = clan.tag ? colorize(` [${clan.tag}]`, 'brightYellow') : '';
  socket.write(colorize(`=== ${clan.name}${tagPart} ===\r\n`, 'brightCyan'));
  if (clan.motto) socket.write(colorize(`  "${clan.motto}"\r\n`, 'dim'));
  socket.write(`  Leader:   ${clan.leader}\r\n`);
  socket.write(`  Founder:  ${clan.founder}\r\n`);
  socket.write(`  Treasury: ${colorize(String(clan.treasury || 0) + ' gold', 'brightYellow')}\r\n`);
  socket.write(`  Members (${Object.keys(clan.members).length}):\r\n`);
  // Sort members by rank then name
  const ranked = Object.entries(clan.members).map(([name, m]) => ({ name, ...m }));
  ranked.sort((a, b) => (CLAN_RANK_LEVELS[b.rank]||0) - (CLAN_RANK_LEVELS[a.rank]||0) || a.name.localeCompare(b.name));
  const onlineNames = new Set(getOnlinePlayers().map(({player: p}) => p.name));
  for (const m of ranked) {
    const onMark = onlineNames.has(m.name) ? colorize('[ON]', 'brightGreen') : colorize('[..]', 'dim');
    const rankColor = m.rank === 'leader' ? 'brightYellow' : m.rank === 'officer' ? 'brightCyan' : 'white';
    socket.write(`    ${onMark} ${colorize(m.rank.padEnd(8), rankColor)} ${m.name}\r\n`);
  }
  socket.write('\r\n');
}

function clanInviteCmd(socket, player, rest) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  if (!clanRankAtLeast(player, 'officer')) {
    socket.write(colorize('Only officers and the leader can invite.\r\n', 'yellow'));
    return;
  }
  if (!rest) { socket.write('Usage: clan invite <player>\r\n'); return; }
  const target = findPlayerByName(rest);
  if (!target) {
    socket.write(colorize(`No online player named "${rest}".\r\n`, 'yellow'));
    return;
  }
  if (clanMemberByName(clan, target.player.name)) {
    socket.write(colorize(`${target.player.name} is already in your clan.\r\n`, 'yellow'));
    return;
  }
  if (target.player.clan) {
    socket.write(colorize(`${target.player.name} is already in another clan.\r\n`, 'yellow'));
    return;
  }
  if (!Array.isArray(target.player.pendingClanInvites)) target.player.pendingClanInvites = [];
  if (target.player.pendingClanInvites.includes(clan.id)) {
    socket.write(colorize(`${target.player.name} already has a pending invite from your clan.\r\n`, 'yellow'));
    return;
  }
  target.player.pendingClanInvites.push(clan.id);
  socket.write(colorize(`Invitation sent to ${target.player.name}.\r\n`, 'green'));
  target.socket.write(colorize(`\r\n[Clan] ${player.name} invites you to join ${clan.name}${clan.tag ? ' ['+clan.tag+']' : ''}. Type "clan accept ${clan.name}" or "clan decline ${clan.name}".\r\n> `, 'brightYellow'));
}

function clanInvitesCmd(socket, player) {
  const list = player.pendingClanInvites || [];
  if (list.length === 0) {
    socket.write(colorize('You have no pending clan invites.\r\n', 'yellow'));
    return;
  }
  socket.write('\r\n');
  socket.write(colorize('=== Pending Clan Invites ===\r\n', 'brightCyan'));
  for (const id of list) {
    const c = getClan(id);
    if (c) socket.write(`  ${c.name}${c.tag ? ' ['+c.tag+']' : ''} - leader ${c.leader}\r\n`);
  }
  socket.write(colorize('\r\nType "clan accept <name>" or "clan decline <name>".\r\n', 'dim'));
  socket.write('\r\n');
}

function clanAcceptCmd(socket, player, rest) {
  if (player.clan) {
    socket.write(colorize('You are already in a clan. Leave first.\r\n', 'yellow'));
    return;
  }
  if (!rest) { socket.write('Usage: clan accept <clan name>\r\n'); return; }
  const clan = getClan(rest);
  if (!clan) { socket.write(colorize(`No such clan: "${rest}".\r\n`, 'yellow')); return; }
  if (!Array.isArray(player.pendingClanInvites) || !player.pendingClanInvites.includes(clan.id)) {
    socket.write(colorize(`You have no pending invite from ${clan.name}.\r\n`, 'yellow'));
    return;
  }
  // Add member
  clan.members[player.name] = { rank: 'member', joinedAt: Date.now() };
  player.clan = clan.id;
  player.clanRank = 'member';
  // Clear all pending invites (joining one removes the rest)
  player.pendingClanInvites = [];
  saveClans();
  socket.write(colorize(`\r\nWelcome to ${clan.name}${clan.tag ? ' ['+clan.tag+']' : ''}.\r\n`, 'brightGreen'));
  broadcastToClan(clan.id, colorize(`[Clan] ${player.name} has joined ${clan.name}.`, 'brightYellow'), socket);
}

function clanDeclineCmd(socket, player, rest) {
  if (!rest) { socket.write('Usage: clan decline <clan name>\r\n'); return; }
  const clan = getClan(rest);
  if (!clan) { socket.write(colorize(`No such clan: "${rest}".\r\n`, 'yellow')); return; }
  if (!Array.isArray(player.pendingClanInvites)) player.pendingClanInvites = [];
  const idx = player.pendingClanInvites.indexOf(clan.id);
  if (idx === -1) {
    socket.write(colorize(`No pending invite from ${clan.name}.\r\n`, 'yellow'));
    return;
  }
  player.pendingClanInvites.splice(idx, 1);
  socket.write(colorize(`Invite from ${clan.name} declined.\r\n`, 'yellow'));
}

function clanLeaveCmd(socket, player) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  // If leader and other members remain, must transfer leadership first
  const memberNames = Object.keys(clan.members);
  if (clan.leader.toLowerCase() === player.name.toLowerCase() && memberNames.length > 1) {
    socket.write(colorize('You are the leader. Promote another member and use "clan disband" if you want to dissolve - or transfer leadership first.\r\n', 'yellow'));
    socket.write(colorize('To transfer: "clan promote <player>" then "clan demote <yourself>" then "clan leave".\r\n', 'dim'));
    return;
  }
  delete clan.members[player.name];
  // If the clan is now empty (was solo leader), disband it
  if (Object.keys(clan.members).length === 0) {
    delete clansData.clans[clan.id];
    saveClans();
    socket.write(colorize(`You leave ${clan.name}. With no members remaining, the clan is dissolved.\r\n`, 'yellow'));
    broadcastToAll(colorize(`[Clan] ${clan.name} has been dissolved.`, 'dim'), socket);
  } else {
    saveClans();
    socket.write(colorize(`You have left ${clan.name}.\r\n`, 'yellow'));
    broadcastToClan(clan.id, colorize(`[Clan] ${player.name} has left the clan.`, 'yellow'), socket);
  }
  player.clan = null;
  player.clanRank = null;
}

function clanKickCmd(socket, player, rest) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  if (!clanRankAtLeast(player, 'officer')) {
    socket.write(colorize('Only officers and the leader can kick.\r\n', 'yellow'));
    return;
  }
  if (!rest) { socket.write('Usage: clan kick <player>\r\n'); return; }
  const m = clanMemberByName(clan, rest);
  if (!m) { socket.write(colorize(`No clan member matches "${rest}".\r\n`, 'yellow')); return; }
  if (m.name.toLowerCase() === player.name.toLowerCase()) {
    socket.write(colorize('You cannot kick yourself. Use "clan leave".\r\n', 'yellow'));
    return;
  }
  // Officers cannot kick the leader or other officers
  if (player.clanRank === 'officer' && CLAN_RANK_LEVELS[m.member.rank] >= CLAN_RANK_LEVELS.officer) {
    socket.write(colorize('Officers can only kick rank-and-file members.\r\n', 'yellow'));
    return;
  }
  delete clan.members[m.name];
  saveClans();
  socket.write(colorize(`${m.name} has been kicked from the clan.\r\n`, 'yellow'));
  broadcastToClan(clan.id, colorize(`[Clan] ${m.name} has been kicked by ${player.name}.`, 'yellow'), socket);
  // Clear kicked player's clan ref if online
  const targetOnline = findPlayerByName(m.name);
  if (targetOnline) {
    targetOnline.player.clan = null;
    targetOnline.player.clanRank = null;
    targetOnline.socket.write(colorize(`\r\n[Clan] You have been kicked from ${clan.name}.\r\n> `, 'brightRed'));
  }
}

function clanPromoteCmd(socket, player, rest) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  if (player.clanRank !== 'leader') {
    socket.write(colorize('Only the leader can promote.\r\n', 'yellow'));
    return;
  }
  if (!rest) { socket.write('Usage: clan promote <player>\r\n'); return; }
  const m = clanMemberByName(clan, rest);
  if (!m) { socket.write(colorize(`No clan member matches "${rest}".\r\n`, 'yellow')); return; }
  if (m.name.toLowerCase() === player.name.toLowerCase()) {
    socket.write(colorize('You are already the leader.\r\n', 'yellow'));
    return;
  }
  if (m.member.rank === 'leader') {
    socket.write(colorize(`${m.name} is already the leader.\r\n`, 'yellow'));
    return;
  }
  if (m.member.rank === 'officer') {
    // Promote to leader: demote self
    m.member.rank = 'leader';
    clan.leader = m.name;
    clan.members[player.name].rank = 'officer';
    player.clanRank = 'officer';
    saveClans();
    socket.write(colorize(`\r\nLeadership transferred. ${m.name} is now leader of ${clan.name}. You are now an officer.\r\n`, 'brightYellow'));
    broadcastToClan(clan.id, colorize(`[Clan] Leadership transferred: ${m.name} is now leader of ${clan.name}.`, 'brightYellow'), socket);
    return;
  }
  // Member -> officer
  m.member.rank = 'officer';
  saveClans();
  socket.write(colorize(`${m.name} promoted to officer.\r\n`, 'brightGreen'));
  broadcastToClan(clan.id, colorize(`[Clan] ${m.name} promoted to officer by ${player.name}.`, 'brightYellow'), socket);
  const targetOnline = findPlayerByName(m.name);
  if (targetOnline) targetOnline.player.clanRank = 'officer';
}

function clanDemoteCmd(socket, player, rest) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  if (player.clanRank !== 'leader') {
    socket.write(colorize('Only the leader can demote.\r\n', 'yellow'));
    return;
  }
  if (!rest) { socket.write('Usage: clan demote <player>\r\n'); return; }
  const m = clanMemberByName(clan, rest);
  if (!m) { socket.write(colorize(`No clan member matches "${rest}".\r\n`, 'yellow')); return; }
  if (m.name.toLowerCase() === player.name.toLowerCase()) {
    socket.write(colorize('To step down, promote another member to leader first.\r\n', 'yellow'));
    return;
  }
  if (m.member.rank === 'member') {
    socket.write(colorize(`${m.name} is already a member.\r\n`, 'yellow'));
    return;
  }
  if (m.member.rank === 'leader') {
    socket.write(colorize('Cannot demote the leader directly.\r\n', 'yellow'));
    return;
  }
  m.member.rank = 'member';
  saveClans();
  socket.write(colorize(`${m.name} demoted to member.\r\n`, 'yellow'));
  broadcastToClan(clan.id, colorize(`[Clan] ${m.name} demoted to member by ${player.name}.`, 'yellow'), socket);
  const targetOnline = findPlayerByName(m.name);
  if (targetOnline) targetOnline.player.clanRank = 'member';
}

function clanDepositCmd(socket, player, rest) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  const amt = parseInt(rest, 10);
  if (isNaN(amt) || amt <= 0) { socket.write('Usage: clan deposit <amount>\r\n'); return; }
  if (player.gold < amt) {
    socket.write(colorize(`You don't have ${amt} gold.\r\n`, 'yellow'));
    return;
  }
  player.gold -= amt;
  clan.treasury = (clan.treasury || 0) + amt;
  saveClans();
  socket.write(colorize(`Deposited ${amt} gold into ${clan.name} treasury (now ${clan.treasury}).\r\n`, 'brightGreen'));
  broadcastToClan(clan.id, colorize(`[Clan] ${player.name} deposited ${amt} gold (treasury: ${clan.treasury}).`, 'cyan'), socket);
}

function clanWithdrawCmd(socket, player, rest) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  if (player.clanRank !== 'leader') {
    socket.write(colorize('Only the leader can withdraw from the treasury.\r\n', 'yellow'));
    return;
  }
  const amt = parseInt(rest, 10);
  if (isNaN(amt) || amt <= 0) { socket.write('Usage: clan withdraw <amount>\r\n'); return; }
  if ((clan.treasury || 0) < amt) {
    socket.write(colorize(`Treasury has only ${clan.treasury || 0} gold.\r\n`, 'yellow'));
    return;
  }
  clan.treasury -= amt;
  player.gold += amt;
  saveClans();
  socket.write(colorize(`Withdrew ${amt} gold from ${clan.name} treasury (now ${clan.treasury}).\r\n`, 'brightGreen'));
  broadcastToClan(clan.id, colorize(`[Clan] ${player.name} withdrew ${amt} gold (treasury: ${clan.treasury}).`, 'cyan'), socket);
}

function clanMottoCmd(socket, player, rest) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  if (player.clanRank !== 'leader') {
    socket.write(colorize('Only the leader can set the motto.\r\n', 'yellow'));
    return;
  }
  if (rest.length > 100) {
    socket.write(colorize('Motto must be 100 characters or fewer.\r\n', 'yellow'));
    return;
  }
  clan.motto = rest;
  saveClans();
  socket.write(colorize(`Motto updated.\r\n`, 'green'));
}

function clanDisbandCmd(socket, player) {
  const clan = getPlayerClan(player);
  if (!clan) { socket.write(colorize('You are not in a clan.\r\n', 'yellow')); return; }
  if (player.clanRank !== 'leader') {
    socket.write(colorize('Only the leader can disband.\r\n', 'yellow'));
    return;
  }
  // Refund treasury to leader
  const refund = clan.treasury || 0;
  if (refund > 0) {
    player.gold += refund;
    socket.write(colorize(`Treasury (${refund} gold) returned to you.\r\n`, 'yellow'));
  }
  // Clear clan refs from online members
  for (const mname of Object.keys(clan.members)) {
    const onl = findPlayerByName(mname);
    if (onl) {
      onl.player.clan = null;
      onl.player.clanRank = null;
      if (onl.socket !== socket) {
        onl.socket.write(colorize(`\r\n[Clan] ${clan.name} has been disbanded by ${player.name}.\r\n> `, 'brightRed'));
      }
    }
  }
  delete clansData.clans[clan.id];
  saveClans();
  player.clan = null;
  player.clanRank = null;
  socket.write(colorize(`\r\n${clan.name} has been disbanded.\r\n`, 'brightRed'));
  broadcastToAll(colorize(`[Clan] ${clan.name} has been disbanded.`, 'dim'), socket);
}

// Clan channel: c <message>
function handleClanChannel(socket, player, message) {
  const clan = getPlayerClan(player);
  if (!clan) {
    socket.write(colorize('You are not in a clan.\r\n', 'yellow'));
    return;
  }
  if (!message || !message.trim()) {
    socket.write(colorize('Usage: c <message>\r\n', 'yellow'));
    return;
  }
  const tag = clan.tag ? `[${clan.tag}]` : `[${clan.name}]`;
  const line = `${colorize(tag, 'brightYellow')} ${colorize(player.name, 'brightWhite')}: ${message.trim()}`;
  for (const { socket: s } of getOnlineClanmates(clan.id)) {
    s.write(`\r\n${line}\r\n> `);
  }
}

// cwho - online clanmates
function handleClanWho(socket, player) {
  const clan = getPlayerClan(player);
  if (!clan) {
    socket.write(colorize('You are not in a clan.\r\n', 'yellow'));
    return;
  }
  const online = getOnlineClanmates(clan.id);
  socket.write('\r\n');
  socket.write(colorize(`=== ${clan.name} - online (${online.length}) ===\r\n`, 'brightCyan'));
  if (online.length === 0) {
    socket.write(colorize('  Nobody else from your clan is online right now.\r\n', 'dim'));
  } else {
    for (const { player: p } of online) {
      const r = p.clanRank || 'member';
      const rankColor = r === 'leader' ? 'brightYellow' : r === 'officer' ? 'brightCyan' : 'white';
      socket.write(`  ${colorize(r.padEnd(8), rankColor)} ${p.name}${p.suffix ? ' ' + p.suffix : ''}\r\n`);
    }
  }
  socket.write('\r\n');
}

// ---------- 1.7 Bank ----------
const BANK_ROOMS = ['room_001'];
function isBankRoom(roomId) { return BANK_ROOMS.includes(roomId); }

function handleBank(socket, player, args) {
  ensureT1Defaults(player);
  const sub = (args || '').trim().toLowerCase();
  if (!sub || sub === 'balance') {
    socket.write(colorize(`=== Bank ===\r\n`, 'brightCyan'));
    socket.write(`On hand: ${player.gold} gold\r\n`);
    socket.write(`Bank balance: ${player.bank} gold\r\n`);
    return;
  }
  const parts = sub.split(/\s+/);
  const action = parts[0];
  const amt = parseInt(parts[1], 10);
  if (!isBankRoom(player.currentRoom)) { socket.write('You must be at a bank to transact.\r\n'); return; }
  if (isNaN(amt) || amt <= 0) { socket.write('Usage: bank deposit <amt> | bank withdraw <amt>\r\n'); return; }
  if (action === 'deposit') {
    if (player.gold < amt) { socket.write("You don't have that much gold.\r\n"); return; }
    player.gold -= amt; player.bank += amt; player.bankUses++;
    socket.write(colorize(`Deposited ${amt}. Bank: ${player.bank}, on hand: ${player.gold}.\r\n`, 'green'));
  } else if (action === 'withdraw') {
    if (player.bank < amt) { socket.write("Insufficient bank balance.\r\n"); return; }
    player.bank -= amt; player.gold += amt; player.bankUses++;
    socket.write(colorize(`Withdrew ${amt}. Bank: ${player.bank}, on hand: ${player.gold}.\r\n`, 'green'));
  } else {
    socket.write('Usage: bank | bank deposit <amt> | bank withdraw <amt>\r\n');
    return;
  }
  if (player.bankUses >= 50) unlockAchievement(socket, player, 'banker');
  if (player.bank >= 100000) unlockAchievement(socket, player, 'banked_100k');
}

// ---------- 1.8 Achievements ----------
const ACHIEVEMENTS = {
  first_blood: { name: 'First Blood', desc: 'First monster kill' },
  first_boss: { name: 'Dragonfell', desc: 'First boss kill', title: 'the Bold' },
  hundred_kills: { name: 'Century Slayer', desc: '100 monster kills' },
  thousand_kills: { name: 'Genocidal', desc: '1000 monster kills', title: 'the Exterminator' },
  level_15: { name: 'The Gatekeeper', desc: 'Reach level 15' },
  level_30: { name: 'Apex', desc: 'Reach level 30', title: 'the Apex' },
  class_chosen: { name: 'Oath Sworn', desc: 'Choose a class at L5' },
  explorer_50: { name: 'Wanderer', desc: 'Visit 50 rooms' },
  explorer_all: { name: 'Cartographer', desc: 'Visit every room', title: 'the Cartographer' },
  rich: { name: 'Affluent', desc: 'Hold 10,000 gold at once' },
  banked_100k: { name: 'Patron', desc: 'Bank 100,000 gold', title: 'the Patron' },
  banker: { name: 'Banker', desc: 'Use the bank 50 times' },
  harmonist: { name: 'Harmonist', desc: 'Play 5 instruments in cycle', title: 'the Harmonist' },
  symphonist: { name: 'Symphonist', desc: 'Complete the Shattered Symphony', title: 'the Symphonist' },
  died_10: { name: 'Fragile', desc: 'Die 10 times' },
  group_kill: { name: 'Party Animal', desc: 'Get a kill while grouped' },
  big_hit: { name: 'Crushing Blow', desc: 'Deal 500+ in one hit' },
  five_bosses: { name: 'Bossbane', desc: 'Defeat 5 different bosses' },
  nine_bosses: { name: 'Legend', desc: 'Defeat all 9 named bosses', title: 'the Legend' },
  silencer: { name: 'Silencer', desc: 'Kill a Bookworm' },
  quest_first: { name: 'First Errand', desc: 'Complete first quest' },
  quest_five: { name: 'Quester', desc: 'Complete 5 quests' },
  master_smith: { name: 'Master Smith', desc: 'Max out a stat to 25' },
  chapel_pilgrim: { name: 'Pilgrim', desc: 'Pray at all 5 chapels', title: 'the Pilgrim' },
  alias_power: { name: 'Shortcut Master', desc: 'Create 10 aliases' },
  hermit: { name: 'Hermit', desc: '1 hour without chatting' },
  all_shops: { name: 'Patron of Trade', desc: 'Buy from every shop' },
  all_classes_met: { name: 'Scholar of the Schools', desc: 'Cast from every school' },
  helped: { name: 'Helper', desc: 'Give an item to another player' },
  pvp_first: { name: 'Drawn Blood', desc: 'First PVP win' },
  pvp_10: { name: 'Arena Regular', desc: '10 PVP wins', title: 'the Duelist' },
  // Tier 3.1 Phase 7 - Neo Kyoto achievements
  clocked_in: { name: 'Clocked In', desc: 'First room entered in Neo Kyoto' },
  staff_pass: { name: 'Staff Pass', desc: 'First crossing through the Nomagios Transit Terminal post-remort' },
  off_the_books: { name: 'Off The Books', desc: 'First successful hack' },
  root_access: { name: 'Root Access', desc: 'Hack skill trained to 10', title: 'the Root' },
  more_human_than_human: { name: 'More Human Than Human', desc: 'Reach Human affinity 10', title: 'the Replicant' },
  electric_sheep: { name: 'Electric Sheep', desc: 'Reach Replicant affinity 10', title: 'the Unbound' },
  queue_jumper: { name: 'Queue Jumper', desc: 'Successfully hack the queue priority kiosk' },
  compiled: { name: 'Compiled', desc: 'Craft all three Data weapons (stun_baton, ice_breaker_rifle, segfault_cleaver)' },
  settle_all_tickets: { name: 'Settle All Tickets', desc: 'Defeat all 5 Neo Kyoto bosses', title: 'the Arbiter' },
  server_melt: { name: 'Server Melt', desc: 'Defeat SYSADMIN.EXE' }
};

function unlockAchievement(socket, player, id) {
  ensureT1Defaults(player);
  if (!ACHIEVEMENTS[id]) return;
  if (player.achievementsUnlocked.includes(id)) return;
  player.achievementsUnlocked.push(id);
  const a = ACHIEVEMENTS[id];
  if (socket) socket.write(colorize(`*** Achievement unlocked: ${a.name} — ${a.desc} ***\r\n`, 'brightYellow'));
  try { broadcastToAll(colorize(`[Achievement] ${player.name} unlocked "${a.name}"`, 'brightYellow'), socket); } catch (_) {}
}
function handleAchievements(socket, player) {
  ensureT1Defaults(player);
  socket.write('\r\n');
  socket.write(colorize('=== Achievements ===\r\n', 'brightCyan'));
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
    const got = player.achievementsUnlocked.includes(id);
    const mark = got ? colorize('[X]', 'brightGreen') : colorize('[ ]', 'dim');
    const titleStr = a.title ? colorize(`  (title: ${a.title})`, 'cyan') : '';
    socket.write(`  ${mark} ${a.name.padEnd(22)} — ${a.desc}${titleStr}\r\n`);
  }
  socket.write(`\r\n  Unlocked: ${player.achievementsUnlocked.length}/${Object.keys(ACHIEVEMENTS).length}\r\n`);
}
function handleTitleCommand(socket, player, args) {
  ensureT1Defaults(player);
  const sub = (args || '').trim();
  if (!sub) {
    socket.write(colorize('=== Titles ===\r\n', 'brightCyan'));
    const available = [];
    for (const id of player.achievementsUnlocked) {
      const a = ACHIEVEMENTS[id];
      if (a && a.title) available.push(a.title);
    }
    if (available.length === 0) {
      socket.write('  (no titles earned yet)\r\n');
    } else {
      for (const t of available) {
        const active = player.activeTitle === t ? colorize(' [ACTIVE]', 'brightGreen') : '';
        socket.write(`  ${t}${active}\r\n`);
      }
    }
    socket.write('\r\nUsage: title <name> | title clear\r\n');
    return;
  }
  if (sub.toLowerCase() === 'clear') {
    player.activeTitle = null;
    socket.write('Title cleared.\r\n');
    return;
  }
  const ok = player.achievementsUnlocked.some(id => ACHIEVEMENTS[id] && ACHIEVEMENTS[id].title && ACHIEVEMENTS[id].title.toLowerCase() === sub.toLowerCase());
  if (!ok) { socket.write("You haven't earned that title.\r\n"); return; }
  player.activeTitle = sub;
  socket.write(colorize(`You now wear the title "${sub}".\r\n`, 'brightYellow'));
}

// ---------- 1.9 Practice ----------
function rollCastSuccess(player, spellKey) {
  ensureT1Defaults(player);
  const practice = player.spellProficiencies[spellKey] || 50;
  const effective = Math.min(100, practice + 40);
  return Math.random() * 100 < effective;
}
function handlePractice(socket, player, args) {
  ensureT1Defaults(player);
  const q = (args || '').trim().toLowerCase();
  if (!q) {
    socket.write('\r\n');
    socket.write(colorize('=== Practice ===\r\n', 'brightCyan'));
    socket.write(`Practice points: ${colorize(String(player.practicePoints), 'brightYellow')}\r\n`);
    let rows = 0;
    for (const [key, spell] of Object.entries(SPELLS)) {
      if (player.level < spell.levelRequired) continue;
      const p = player.spellProficiencies[key] || 50;
      const eff = Math.min(100, p + 40);
      socket.write(`  ${spell.name.padEnd(22)} proficiency ${String(p).padStart(3)}%  (cast ${eff}%)\r\n`);
      rows++;
      if (rows >= 20) break;
    }
    if (rows === 0) socket.write('  No spells available yet.\r\n');
    socket.write('\r\nUsage: practice <spell>\r\n');
    return;
  }
  // practice a spell
  if (player.practicePoints < 1) { socket.write('No practice points to spend.\r\n'); return; }
  let foundKey = null;
  for (const [key, spell] of Object.entries(SPELLS)) {
    if (key === q.replace(/\s+/g, '_') || spell.name.toLowerCase() === q || key.startsWith(q)) {
      foundKey = key; break;
    }
  }
  if (!foundKey) { socket.write("You don't know that spell.\r\n"); return; }
  const cur = player.spellProficiencies[foundKey] || 50;
  if (cur >= 100) { socket.write('Already mastered.\r\n'); return; }
  const gain = 10 + Math.floor(Math.random() * 6);
  player.spellProficiencies[foundKey] = Math.min(100, cur + gain);
  player.practicePoints -= 1;
  socket.write(colorize(`You practice ${SPELLS[foundKey].name}: ${cur}% -> ${player.spellProficiencies[foundKey]}%.\r\n`, 'brightGreen'));
}

// ---------- 1.10 Boards + Mail ----------
const BOARDS_PATH = path.join(__dirname, 'boards.json');
let boardsCache = { announcements: [], players: [] };

function loadBoards() {
  try {
    if (fs.existsSync(BOARDS_PATH)) {
      const raw = fs.readFileSync(BOARDS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      boardsCache = {
        announcements: parsed.announcements || [],
        players: parsed.players || []
      };
    }
  } catch (e) {
    console.log('[boards] load error:', e.message);
    boardsCache = { announcements: [], players: [] };
  }
}
function saveBoards() {
  try { fs.writeFileSync(BOARDS_PATH, JSON.stringify(boardsCache, null, 2)); }
  catch (e) { console.log('[boards] save error:', e.message); }
}
function handleBoard(socket, player, args) {
  const raw = (args || '').trim();
  if (!raw || raw.toLowerCase() === 'list') {
    socket.write('\r\n');
    socket.write(colorize('=== Bulletin Boards ===\r\n', 'brightCyan'));
    socket.write(`  announcements — ${boardsCache.announcements.length} post(s)\r\n`);
    socket.write(`  players       — ${boardsCache.players.length} post(s)\r\n`);
    socket.write('\r\nUsage: board read <name> | board post <name> <title> | <body>\r\n');
    return;
  }
  const parts = raw.split(/\s+/);
  const sub = parts[0].toLowerCase();
  if (sub === 'read' && parts[1]) {
    const name = parts[1].toLowerCase();
    if (!boardsCache[name]) { socket.write('Unknown board.\r\n'); return; }
    socket.write(colorize(`=== Board: ${name} ===\r\n`, 'brightCyan'));
    if (boardsCache[name].length === 0) { socket.write('  (no posts)\r\n'); return; }
    boardsCache[name].forEach((p, i) => {
      socket.write(colorize(`#${i + 1} ${p.title}`, 'brightYellow') + colorize(` — ${p.author}\r\n`, 'dim'));
      socket.write(`    ${p.body}\r\n`);
    });
    return;
  }
  if (sub === 'post' && parts.length >= 3) {
    const name = parts[1].toLowerCase();
    if (!boardsCache[name]) { socket.write('Unknown board.\r\n'); return; }
    const rest = raw.slice(raw.indexOf(parts[1]) + parts[1].length).trim();
    const pipeIdx = rest.indexOf('|');
    if (pipeIdx < 0) { socket.write('Usage: board post <name> <title> | <body>\r\n'); return; }
    const title = rest.slice(0, pipeIdx).trim();
    const body = rest.slice(pipeIdx + 1).trim();
    if (!title || !body) { socket.write('Need both title and body.\r\n'); return; }
    boardsCache[name].push({ author: player.name, title, body, posted: Date.now() });
    saveBoards();
    socket.write(colorize(`Posted to ${name}.\r\n`, 'green'));
    return;
  }
  socket.write('Usage: board | board read <name> | board post <name> <title> | <body>\r\n');
}

function handleMail(socket, player, args) {
  ensureT1Defaults(player);
  const raw = (args || '').trim();
  if (!raw) {
    socket.write('\r\n');
    socket.write(colorize('=== Mail Inbox ===\r\n', 'brightCyan'));
    if (player.mail.length === 0) { socket.write('  (empty)\r\n'); return; }
    player.mail.forEach((m, i) => {
      const unread = m.read ? '  ' : colorize('* ', 'brightYellow');
      socket.write(`${unread}${i + 1}. from ${m.from.padEnd(14)} ${m.subject}\r\n`);
    });
    socket.write('\r\nUsage: mail read <n> | mail send <player> | <subject> | <body> | mail delete <n>\r\n');
    return;
  }
  const parts = raw.split(/\s+/);
  const sub = parts[0].toLowerCase();
  if (sub === 'read' && parts[1]) {
    const n = parseInt(parts[1], 10) - 1;
    if (isNaN(n) || n < 0 || n >= player.mail.length) { socket.write('No such message.\r\n'); return; }
    const m = player.mail[n];
    m.read = true;
    socket.write(colorize(`From: ${m.from}\r\nSubject: ${m.subject}\r\n\r\n${m.body}\r\n`, 'white'));
    return;
  }
  if (sub === 'delete' && parts[1]) {
    const n = parseInt(parts[1], 10) - 1;
    if (isNaN(n) || n < 0 || n >= player.mail.length) { socket.write('No such message.\r\n'); return; }
    player.mail.splice(n, 1);
    socket.write('Deleted.\r\n');
    return;
  }
  if (sub === 'send') {
    const rest = raw.slice(raw.toLowerCase().indexOf('send') + 4).trim();
    const segs = rest.split('|').map(s => s.trim());
    if (segs.length < 3) { socket.write('Usage: mail send <player> | <subject> | <body>\r\n'); return; }
    const [to, subject, body] = segs;
    if (!to || !subject || !body) { socket.write('Need recipient, subject, and body.\r\n'); return; }
    const msg = { from: player.name, subject, body, read: false, sent: Date.now() };
    // Deliver to online recipient
    let delivered = false;
    for (const [sock, p] of players) {
      if (p && p.name && p.name.toLowerCase() === to.toLowerCase()) {
        ensureT1Defaults(p);
        p.mail.push(msg);
        sock.write(colorize(`\r\n[New mail from ${player.name}: ${subject}]\r\n`, 'brightYellow'));
        delivered = true;
        break;
      }
    }
    if (!delivered) {
      // Deliver offline via save file
      try {
        const fp = path.join(__dirname, 'players', to.toLowerCase() + '.json');
        if (fs.existsSync(fp)) {
          const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
          data.mail = data.mail || [];
          data.mail.push(msg);
          fs.writeFileSync(fp, JSON.stringify(data, null, 2));
          delivered = true;
        }
      } catch (e) { /* ignore */ }
    }
    if (delivered) socket.write(colorize(`Mail sent to ${to}.\r\n`, 'green'));
    else socket.write(colorize(`Unknown recipient: ${to}.\r\n`, 'yellow'));
    return;
  }
  socket.write('Usage: mail | mail read <n> | mail send <player> | <subject> | <body>\r\n');
}

// ---------- Tier 1 Dispatch ----------
function handleTier1Command(socket, player, input) {
  const command = input.toLowerCase().trim();
  ensureT1Defaults(player);

  // 1.1 abilities / train
  if (command === 'abilities' || command === 'abi') { handleAbilities(socket, player); return true; }
  if (command.startsWith('train ') || command === 'train') {
    handleTrain(socket, player, command.slice(5).trim());
    return true;
  }

  // 1.2 class
  if (command === 'class') { handleClass(socket, player, ''); return true; }
  if (command.startsWith('class ')) { handleClass(socket, player, command.slice(6)); return true; }

  // 1.3 affects
  if (command === 'affects' || command === 'af') { handleAffects(socket, player); return true; }

  // 1.5 group
  if (command === 'group') { handleGroup(socket, player, ''); return true; }
  if (command.startsWith('group ')) { handleGroup(socket, player, command.slice(6)); return true; }
  if (command === 'follow') { handleFollow(socket, player, ''); return true; }
  if (command.startsWith('follow ')) { handleFollow(socket, player, command.slice(7)); return true; }
  if (command === 'gquit' || command === 'leavegroup') { handleGquit(socket, player); return true; }
  if (command.startsWith('grouptell ') || command.startsWith('gt ')) {
    const msg = command.startsWith('gt ') ? command.slice(3) : command.slice(10);
    handleGroupTell(socket, player, msg);
    return true;
  }
  if (command.startsWith('assist ')) { handleAssist(socket, player, command.slice(7).trim()); return true; }

  // 1.6 shops
  if (command === 'list' || command === 'wares') { handleShopList(socket, player); return true; }
  if (command.startsWith('buy ')) { handleBuy(socket, player, command.slice(4)); return true; }
  if (command.startsWith('sell ')) { handleSell(socket, player, command.slice(5)); return true; }
  if (command.startsWith('value ') || command.startsWith('appraise ')) {
    const q = command.startsWith('value ') ? command.slice(6) : command.slice(9);
    handleValue(socket, player, q);
    return true;
  }

  // 1.7 bank
  if (command === 'bank') { handleBank(socket, player, ''); return true; }
  if (command.startsWith('bank ')) { handleBank(socket, player, command.slice(5)); return true; }
  if (command.startsWith('deposit ')) { handleBank(socket, player, 'deposit ' + command.slice(8)); return true; }
  if (command.startsWith('withdraw ')) { handleBank(socket, player, 'withdraw ' + command.slice(9)); return true; }

  // 1.8 achievements + title
  if (command === 'achievements' || command === 'ach') { handleAchievements(socket, player); return true; }
  // (title command is handled below — override the legacy mysuffix alias when user types "title <x>")
  if (command === 'title' || command.startsWith('title ')) {
    const a = command === 'title' ? '' : command.slice(6);
    handleTitleCommand(socket, player, a);
    return true;
  }

  // 1.9 practice
  if (command === 'practice' || command === 'pra') { handlePractice(socket, player, ''); return true; }
  if (command.startsWith('practice ') || command.startsWith('pra ')) {
    const q = command.startsWith('practice ') ? command.slice(9) : command.slice(4);
    handlePractice(socket, player, q);
    return true;
  }

  // 1.10 boards + mail
  if (command === 'board' || command === 'boards') { handleBoard(socket, player, ''); return true; }
  if (command.startsWith('board ') || command.startsWith('boards ')) {
    const q = command.startsWith('boards ') ? command.slice(7) : command.slice(6);
    handleBoard(socket, player, q);
    return true;
  }
  if (command === 'mail' || command === 'mudmail') { handleMail(socket, player, ''); return true; }
  if (command.startsWith('mail ') || command.startsWith('mudmail ')) {
    const q = command.startsWith('mudmail ') ? command.slice(8) : command.slice(5);
    handleMail(socket, player, q);
    return true;
  }

  return false;
}

// ============================================
// TIER 2 SYSTEMS (§2.1 – §2.6)
// ============================================

function ensureT2Defaults(player) {
  if (typeof player.questPoints !== 'number') player.questPoints = 0;
  if (player.campaign === undefined) player.campaign = null;
  if (typeof player.campaignLastCompletedAt !== 'number') player.campaignLastCompletedAt = 0;
  if (typeof player.campaignsCompleted !== 'number') player.campaignsCompleted = 0;
  if (!Array.isArray(player.pets)) player.pets = [];
  if (!player.skills) player.skills = { weaponsmith: 0, enchanter: 0, alchemist: 0 };
  // Tier 3.1 Phase 6: hack skill (Neo Kyoto)
  if (typeof player.skills.hack !== 'number') player.skills.hack = 0;
  if (typeof player.remortTier !== 'number') player.remortTier = 0;
  if (!player.permStatBonuses) player.permStatBonuses = { str: 0, dex: 0, con: 0, int: 0, wis: 0 };
  if (!Array.isArray(player.unlockedZones)) player.unlockedZones = [];
  // Tier 3.1 Phase 6: affinity meter (Neo Kyoto). Persists across remort.
  if (!player.affinity || typeof player.affinity !== 'object') player.affinity = { replicant: 0, human: 0 };
  if (typeof player.affinity.replicant !== 'number') player.affinity.replicant = 0;
  if (typeof player.affinity.human !== 'number') player.affinity.human = 0;
  // Tier 4.1: clan membership
  if (player.clan === undefined) player.clan = null;
  if (player.clanRank === undefined) player.clanRank = null;
  if (!Array.isArray(player.pendingClanInvites)) player.pendingClanInvites = [];
}

// ---------- 2.2 Zone locks (QP-gated rooms) ----------
// Rooms keyed here cannot be entered unless the player has redeemed the key.
// Gating is one-way on entry — leaving a locked room (e.g., if an admin sends
// you there) is never blocked.
const ZONE_LOCKS = {
  room_013: { keyId: 'key_glittering_vault', label: 'The Glittering Vault' },
  room_162: { keyId: 'key_dripping_vault',   label: 'The Dripping Vault' }
};

function isZoneUnlocked(player, roomId) {
  const lock = ZONE_LOCKS[roomId];
  if (!lock) return true; // not gated
  return (player.unlockedZones || []).includes(lock.keyId);
}

// ---------- 3.1 Realm gates (remort-gated entry to other server-farm realms) ----------
// Neo Kyoto lives on the Nomagios server farm alongside Eldoria. The shuttle
// terminal at room_201 is the only entry point, and it is strictly staff-only
// until the traveller has rebooted (remorted) at least once.
const REALM_GATES = {
  room_201: { minRemortTier: 1, label: 'Neo Kyoto (Nomagios Transit Terminal)' }
};

function isRealmGateOpen(player, roomId) {
  const gate = REALM_GATES[roomId];
  if (!gate) return true; // not gated
  return (player.remortTier || 0) >= gate.minRemortTier;
}

// ---------- 2.1 Campaign system ----------

const CAMPAIGN_COOLDOWN_MS = 3600000; // 1 hour
const CAMPAIGN_TARGET_COUNT = 3;
const CAMPAIGN_LEVEL_RANGE = 3;

// Tier 3.1 Phase 8: Neo Kyoto monster set for themed campaigns
const NEO_KYOTO_TEMPLATE_IDS = new Set([
  'patched_pedestrian','baggage_claim_beast','expired_traveler',
  'neon_yakuza','rogue_replicant','bazaar_cutpurse','noodle_vendor_aggro',
  'corporate_enforcer','flickering_janitor','junior_associate',
  'data_ghost','security_subroutine','memory_leak_wraith',
  'queue_fragment','offworld_recruiter',
  'kowloon_parkourist','chrome_wolf','mantis_debugger',
  'mercury_kelpie','black_ice_basilisk','backup_spirit',
  'deprecated_bladerunner','philosopher_model',
  'synthetic_orphan',
  'cron_daemon','oncall_wight'
]);

function pickCampaignTargets(playerLevel, theme) {
  const candidates = [];
  try {
    // monsters.json top-level key is `templates` (regular mobs) — not `monsters`.
    const mons = (monsterData && (monsterData.templates || monsterData.monsters)) || {};
    for (const [tid, tpl] of Object.entries(mons)) {
      // Theme filter: only Neo Kyoto mobs for the 'neo_kyoto' theme
      if (theme === 'neo_kyoto' && !NEO_KYOTO_TEMPLATE_IDS.has(tid)) continue;
      const lvl = tpl.level || 1;
      if (Math.abs(lvl - playerLevel) <= CAMPAIGN_LEVEL_RANGE) {
        candidates.push({ templateId: tid, name: tpl.name || tid, level: lvl });
      }
    }
  } catch (e) { /* defensive */ }
  if (candidates.length === 0) return [];
  // Pick unique targets
  const picks = [];
  const used = new Set();
  let attempts = 0;
  while (picks.length < CAMPAIGN_TARGET_COUNT && attempts < 50) {
    const c = candidates[Math.floor(Math.random() * candidates.length)];
    if (!used.has(c.templateId)) {
      used.add(c.templateId);
      const required = 1 + Math.floor(Math.random() * 3); // 1..3
      picks.push({ templateId: c.templateId, name: c.name, required, killed: 0 });
    }
    attempts++;
  }
  return picks;
}

function handleCampaign(socket, player, args) {
  ensureT2Defaults(player);
  const arg = (args || '').trim().toLowerCase();

  if (arg === 'abandon') {
    if (!player.campaign) {
      socket.write(colorize('You have no active campaign to abandon.\r\n', 'yellow'));
      return;
    }
    player.campaign = null;
    socket.write(colorize('Campaign abandoned. Your cooldown is unchanged.\r\n', 'yellow'));
    return;
  }

  if (arg === 'start' || arg === 'neo_kyoto' || arg === 'start neo_kyoto') {
    // Cooldown check
    const since = Date.now() - (player.campaignLastCompletedAt || 0);
    if (player.campaignLastCompletedAt && since < CAMPAIGN_COOLDOWN_MS) {
      const remainMin = Math.ceil((CAMPAIGN_COOLDOWN_MS - since) / 60000);
      socket.write(colorize(`You must wait ${remainMin} minute(s) before starting another campaign.\r\n`, 'yellow'));
      return;
    }
    if (player.campaign) {
      socket.write(colorize('You already have an active campaign. Use "campaign" to view it, or "campaign abandon".\r\n', 'yellow'));
      return;
    }
    const theme = (arg === 'neo_kyoto' || arg === 'start neo_kyoto') ? 'neo_kyoto' : null;
    if (theme === 'neo_kyoto' && (player.remortTier || 0) < 1) {
      socket.write(colorize('Neo Kyoto specialist campaigns are for travellers who have crossed the staff door. Remort first.\r\n', 'yellow'));
      return;
    }
    const targets = pickCampaignTargets(player.level || 1, theme);
    if (targets.length === 0) {
      const msg = theme === 'neo_kyoto'
        ? 'No Neo Kyoto targets at your level (mobs are L15-27 - try a higher-level character).'
        : 'No suitable campaign targets could be found at your level.';
      socket.write(colorize(msg + '\r\n', 'yellow'));
      return;
    }
    player.campaign = { targets, startedAt: Date.now(), theme };
    socket.write('\r\n');
    socket.write(colorize(theme === 'neo_kyoto' ? '=== New Campaign: Neo Kyoto Specialist ===\r\n' : '=== New Campaign ===\r\n', 'brightMagenta'));
    socket.write(colorize(theme === 'neo_kyoto'
      ? '42 wipes a glass and pushes a list across the bar. Every face on it is in Server 2.\r\n'
      : 'A voice whispers: slay these foes for Nomagio\'s favour.\r\n', 'brightCyan'));
    for (const t of targets) {
      socket.write(`  - ${t.name}  (0/${t.required})\r\n`);
    }
    socket.write(colorize(theme === 'neo_kyoto'
      ? 'Reward: +50% Quest Points + XP + gold on completion.\r\n'
      : 'Reward: Quest Points + XP + gold on completion.\r\n', 'yellow'));
    socket.write('\r\n');
    return;
  }

  // status (default when a campaign is active)
  if (!player.campaign) {
    const since = Date.now() - (player.campaignLastCompletedAt || 0);
    if (player.campaignLastCompletedAt && since < CAMPAIGN_COOLDOWN_MS) {
      const remainMin = Math.ceil((CAMPAIGN_COOLDOWN_MS - since) / 60000);
      socket.write(colorize(`No active campaign. Next available in ${remainMin} minute(s).\r\n`, 'yellow'));
    } else {
      socket.write(colorize('No active campaign. Type "campaign start" to begin one.\r\n', 'yellow'));
    }
    return;
  }

  socket.write('\r\n');
  socket.write(colorize('=== Campaign Status ===\r\n', 'brightMagenta'));
  for (const t of player.campaign.targets) {
    const done = t.killed >= t.required;
    const mark = done ? colorize('[X]', 'brightGreen') : '[ ]';
    socket.write(`  ${mark} ${t.name}  (${t.killed}/${t.required})\r\n`);
  }
  socket.write('\r\n');
}

function tickCampaignOnKill(socket, player, templateId) {
  ensureT2Defaults(player);
  if (!player.campaign || !player.campaign.targets) return;
  let progressed = false;
  for (const t of player.campaign.targets) {
    if (t.templateId === templateId && t.killed < t.required) {
      t.killed++;
      progressed = true;
    }
  }
  if (progressed) {
    // Notify per-tick
    socket.write(colorize('[Campaign progress]\r\n', 'yellow'));
  }
  // All done?
  const allDone = player.campaign.targets.every(t => t.killed >= t.required);
  if (allDone) {
    completeCampaign(socket, player);
  }
}

function completeCampaign(socket, player) {
  const lvl = player.level || 1;
  const isNK = player.campaign && player.campaign.theme === 'neo_kyoto';
  const themeMult = isNK ? 1.5 : 1.0;
  const qp = Math.floor((50 + 10 * lvl) * themeMult);
  const xp = Math.floor(250 * lvl * themeMult);
  const gold = Math.floor(50 * lvl * themeMult);
  player.questPoints = (player.questPoints || 0) + qp;
  player.experience += xp;
  player.gold += gold;
  player.campaign = null;
  player.campaignLastCompletedAt = Date.now();
  player.campaignsCompleted = (player.campaignsCompleted || 0) + 1;

  socket.write('\r\n');
  socket.write(colorize(isNK ? '*** NEO KYOTO CAMPAIGN COMPLETE ***\r\n' : '*** CAMPAIGN COMPLETE ***\r\n', 'brightMagenta'));
  socket.write(colorize(`+${qp} Quest Points   +${xp} XP   +${gold} gold${isNK ? '   (+50% theme bonus)' : ''}\r\n`, 'brightYellow'));
  socket.write('\r\n');

  if (typeof unlockAchievement === 'function') {
    if (player.campaignsCompleted === 1) unlockAchievement(socket, player, 'campaigner_first');
    if (player.campaignsCompleted >= 10) unlockAchievement(socket, player, 'campaigner_ten');
  }
  if (typeof checkLevelUp === 'function') checkLevelUp(socket, player);
}

function handleQP(socket, player) {
  ensureT2Defaults(player);
  socket.write(colorize(`You have ${player.questPoints} Quest Points.\r\n`, 'brightMagenta'));
  socket.write(colorize(`Campaigns completed: ${player.campaignsCompleted}\r\n`, 'dim'));
}

// ---------- 2.2 Quest Points shop (Nomagio's Repository) ----------

const NOMAGIO_REPOSITORY_ROOM = 'room_001';
const NOMAGIO_REPOSITORY = {
  resonant_blade: { kind: 'gear', name: 'Resonant Blade', cost: 500, payload: { itemId: 'resonant_blade' } },
  quiet_ring:     { kind: 'gear', name: 'Ring of Quiet Hours', cost: 800, payload: { itemId: 'quiet_ring' } },
  aura_resolute:   { kind: 'aura', name: 'Aura: the Resolute',   cost: 300, payload: { suffix: 'the Resolute' } },
  aura_campaigner: { kind: 'aura', name: 'Aura: the Campaigner', cost: 500, payload: { suffix: 'the Campaigner' } },
  egg_loyal:    { kind: 'pet_egg', name: 'Pet Egg: Loyal Spirit',  cost: 1000, payload: { templateId: 'loyal_spirit',  petName: 'Spirit', level: 5 } },
  egg_singing:  { kind: 'pet_egg', name: 'Pet Egg: Singing Hound', cost: 1500, payload: { templateId: 'singing_hound', petName: 'Hound',  level: 8 } },
  // Tier 3.1 - Neo Kyoto pet eggs (cross-realm portable, work in both realms)
  egg_drone:        { kind: 'pet_egg', name: 'Pet Egg: Street Drone',     cost: 1500, payload: { templateId: 'street_drone',     petName: 'Drone',     level: 8 } },
  egg_salamander:   { kind: 'pet_egg', name: 'Pet Egg: Chrome Salamander', cost: 1500, payload: { templateId: 'chrome_salamander', petName: 'Salamander', level: 12 } },
  egg_pocket_ai:    { kind: 'pet_egg', name: 'Pet Egg: Pocket AI',        cost: 1500, payload: { templateId: 'pocket_ai',        petName: 'PocketAI',  level: 15 } },
  key_glittering_vault: { kind: 'zone_key', name: 'Key: Glittering Vault', cost: 500,  payload: { keyId: 'key_glittering_vault', roomId: 'room_013' } },
  key_dripping_vault:   { kind: 'zone_key', name: 'Key: Dripping Vault',   cost: 750,  payload: { keyId: 'key_dripping_vault',   roomId: 'room_162' } },
  // Tier-gated gear — requires player.remortTier >= tierReq on the item to equip.
  tier1_harmonist_crown: { kind: 'gear', name: 'Crown of the Reborn Harmonist',    cost: 2000, payload: { itemId: 'tier1_harmonist_crown' } },
  tier3_symphonic_blade: { kind: 'gear', name: 'Symphonic Blade of the Third Loop', cost: 5000, payload: { itemId: 'tier3_symphonic_blade' } },
  // Tier 3.1 Phase 8 - Neo Kyoto QP shop entries
  boarding_pass_keepsake: { kind: 'aura', name: 'Aura: of the Two Servers',  cost: 500,  payload: { suffix: 'of the Two Servers' } },
  tier3_data_blade:        { kind: 'gear', name: 'Server-Cleaved Blade',     cost: 3000, payload: { itemId: 'tier3_data_blade' } },
  tier3_quarter_walker_boots: { kind: 'gear', name: 'Quarter-Walker Boots',  cost: 3500, payload: { itemId: 'tier3_quarter_walker_boots' } },
  affinity_reset_token:    { kind: 'affinity_reset', name: 'Affinity Reset Token', cost: 2500, payload: {} }
};

// Tier 3.1 Phase 8: per-cycle cap for affinity_reset_token
const affinityResetUses = new Map(); // playerName(lc) -> cycleStartTimestamp at last use

function handleRedeem(socket, player, args) {
  ensureT2Defaults(player);
  const arg = (args || '').trim().toLowerCase();

  if (player.currentRoom !== NOMAGIO_REPOSITORY_ROOM) {
    socket.write(colorize("You must be in Nomagio's Repository (room 001) to redeem.\r\n", 'yellow'));
    return;
  }

  if (!arg) {
    socket.write('\r\n');
    socket.write(colorize("=== Nomagio's Repository ===\r\n", 'brightMagenta'));
    socket.write(colorize(`Your Quest Points: ${player.questPoints}\r\n\r\n`, 'brightYellow'));
    for (const [id, entry] of Object.entries(NOMAGIO_REPOSITORY)) {
      const affordable = player.questPoints >= entry.cost;
      const mark = affordable ? colorize('[OK]', 'brightGreen') : colorize('[--]', 'dim');
      socket.write(`  ${mark}  ${id.padEnd(18)} ${String(entry.cost).padStart(5)} QP   ${entry.name}\r\n`);
    }
    socket.write(colorize('\r\nType "redeem <id>" to purchase.\r\n', 'dim'));
    socket.write('\r\n');
    return;
  }

  // Match by id or partial name
  let entry = NOMAGIO_REPOSITORY[arg];
  let entryId = arg;
  if (!entry) {
    for (const [id, v] of Object.entries(NOMAGIO_REPOSITORY)) {
      if (id.includes(arg) || v.name.toLowerCase().includes(arg)) {
        entry = v;
        entryId = id;
        break;
      }
    }
  }
  if (!entry) {
    socket.write(colorize(`No redemption matches "${arg}".\r\n`, 'yellow'));
    return;
  }
  if (player.questPoints < entry.cost) {
    const gap = entry.cost - player.questPoints;
    socket.write(colorize(`You need ${gap} more Quest Points to redeem ${entry.name}.\r\n`, 'yellow'));
    return;
  }

  if (entry.kind === 'gear') {
    const item = typeof createItem === 'function' ? createItem(entry.payload.itemId) : null;
    if (!item) {
      socket.write(colorize('That item is currently unavailable. (Create failed.)\r\n', 'yellow'));
      return;
    }
    player.questPoints -= entry.cost;
    player.inventory.push(item);
    socket.write(colorize(`You redeem ${entry.name}. It materialises in your pack.\r\n`, 'brightGreen'));
  } else if (entry.kind === 'aura') {
    player.questPoints -= entry.cost;
    player.suffix = entry.payload.suffix;
    socket.write(colorize(`Aura applied: your name now carries "${entry.payload.suffix}".\r\n`, 'brightCyan'));
  } else if (entry.kind === 'pet_egg') {
    if ((player.pets || []).length >= 3) {
      socket.write(colorize('You cannot keep more than 3 pets. Release one before claiming this egg.\r\n', 'yellow'));
      return;
    }
    player.questPoints -= entry.cost;
    grantPetFromEgg(socket, player, entry.payload);
    socket.write(colorize(`Egg hatched: ${entry.payload.petName} is now bound to you.\r\n`, 'brightCyan'));
  } else if (entry.kind === 'zone_key') {
    if (!Array.isArray(player.unlockedZones)) player.unlockedZones = [];
    if (player.unlockedZones.includes(entry.payload.keyId)) {
      socket.write(colorize('You have already unlocked that zone. No refund.\r\n', 'yellow'));
      return;
    }
    player.questPoints -= entry.cost;
    player.unlockedZones.push(entry.payload.keyId);
    const lock = ZONE_LOCKS[entry.payload.roomId];
    const label = lock ? lock.label : entry.payload.roomId;
    socket.write(colorize(`The way to ${label} is now open to you. Permanent unlock.\r\n`, 'brightGreen'));
  } else if (entry.kind === 'affinity_reset') {
    // Tier 3.1 Phase 8: zero out player affinity, capped at 1 use per world-reset cycle
    const lastUse = affinityResetUses.get(player.name.toLowerCase()) || 0;
    if (lastUse >= cycleStartTime && lastUse !== 0) {
      socket.write(colorize('You have already redeemed an Affinity Reset Token this cycle. Wait until the next world reset.\r\n', 'yellow'));
      return;
    }
    ensureT2Defaults(player);
    const oldR = player.affinity.replicant;
    const oldH = player.affinity.human;
    if (oldR === 0 && oldH === 0) {
      socket.write(colorize('Your affinity is already at zero. The token would do nothing.\r\n', 'yellow'));
      return;
    }
    player.questPoints -= entry.cost;
    player.affinity.replicant = 0;
    player.affinity.human = 0;
    affinityResetUses.set(player.name.toLowerCase(), Date.now());
    socket.write(colorize(`\r\nThe token dissolves. Your affinity meter empties out (was R=${oldR}/H=${oldH}, now 0/0).\r\n`, 'brightCyan'));
    socket.write(colorize('You are unaligned again. Walk a different path this time, if you like.\r\n', 'dim'));
  }
  if (typeof unlockAchievement === 'function' && player.campaignsCompleted >= 0) {
    unlockAchievement(socket, player, 'redemption_first');
  }
}

// ---------- 2.3 Pet system ----------

const PET_FOLLOW_CAP = 3;
const PET_TAME_CHANCE = { Passive: 0.25, Neutral: 0.15, Aggressive: 0.08 };
let petIdCounter = 1;

function nextPetId() { return `pet_${Date.now()}_${petIdCounter++}`; }

function grantPetFromEgg(socket, player, payload) {
  const level = payload.level || 1;
  const pet = {
    id: nextPetId(),
    templateId: payload.templateId || 'generic_pet',
    name: payload.petName || 'Companion',
    level,
    maxHp: 40 + level * 12,
    hp: 40 + level * 12,
    str: 6 + level * 2,
    xp: 0,
    active: !(player.pets || []).some(p => p.active),
    stabledAt: 0
  };
  if (!Array.isArray(player.pets)) player.pets = [];
  player.pets.push(pet);
}

function handleTame(socket, player, args) {
  ensureT2Defaults(player);
  const name = (args || '').trim();
  if (!name) {
    socket.write('Tame what?\r\n');
    return;
  }
  if ((player.pets || []).length >= PET_FOLLOW_CAP) {
    socket.write(colorize('You already have 3 pets. Release one first.\r\n', 'yellow'));
    return;
  }
  const monster = typeof findMonsterInRoom === 'function' ? findMonsterInRoom(player.currentRoom, name) : null;
  if (!monster) {
    socket.write(colorize(`No "${name}" to tame here.\r\n`, 'yellow'));
    return;
  }
  if (monster.type === 'Boss') {
    socket.write(colorize('You cannot tame a boss. They are not pets.\r\n', 'yellow'));
    return;
  }
  const chance = PET_TAME_CHANCE[monster.type] || 0.1;
  if (Math.random() < chance) {
    const pet = {
      id: nextPetId(),
      templateId: monster.templateId,
      name: monster.name,
      level: monster.level || 1,
      maxHp: monster.maxHp || monster.hp || 40,
      hp: monster.maxHp || monster.hp || 40,
      str: monster.str || 8,
      xp: 0,
      active: !(player.pets || []).some(p => p.active),
      stabledAt: 0
    };
    player.pets.push(pet);
    socket.write(colorize(`\r\nThe ${monster.name} stills and bows. It is yours now.\r\n`, 'brightGreen'));
    if (typeof removeMonster === 'function') removeMonster(monster.id);
    if (typeof unlockAchievement === 'function') unlockAchievement(socket, player, 'pet_first');
  } else {
    socket.write(colorize(`The ${monster.name} resists your call.\r\n`, 'yellow'));
    // Aggressive monsters will retaliate — existing grace period / combat is untouched.
  }
}

function handlePets(socket, player) {
  ensureT2Defaults(player);
  if (!player.pets || player.pets.length === 0) {
    socket.write(colorize('You have no pets.\r\n', 'yellow'));
    return;
  }
  socket.write('\r\n');
  socket.write(colorize('=== Your Pets ===\r\n', 'brightCyan'));
  for (const p of player.pets) {
    const tag = p.active ? colorize('[Active]', 'brightGreen') : colorize('[Stabled]', 'dim');
    socket.write(`  ${tag} ${p.name} (L${p.level})  HP ${p.hp}/${p.maxHp}  XP ${p.xp}\r\n`);
  }
  socket.write('\r\n');
}

function handleRelease(socket, player, args) {
  ensureT2Defaults(player);
  const name = (args || '').trim().toLowerCase();
  if (!name) { socket.write('Release which pet?\r\n'); return; }
  const before = player.pets.length;
  player.pets = (player.pets || []).filter(p => p.name.toLowerCase() !== name);
  if (player.pets.length === before) {
    socket.write(colorize(`No pet named "${args.trim()}".\r\n`, 'yellow'));
    return;
  }
  socket.write(colorize(`Released. They return to the wild.\r\n`, 'yellow'));
}

function handlePetSub(socket, player, args) {
  ensureT2Defaults(player);
  const trimmed = (args || '').trim().toLowerCase();
  if (trimmed === 'stable' || trimmed.startsWith('stable ')) {
    if (player.currentRoom !== 'room_001') {
      socket.write(colorize('The pet stable is only accessible in room 001.\r\n', 'yellow'));
      return;
    }
    const active = player.pets.find(p => p.active);
    if (!active) {
      socket.write(colorize('You have no active pet to stable.\r\n', 'yellow'));
      return;
    }
    active.active = false;
    active.stabledAt = Date.now();
    socket.write(colorize(`${active.name} settles into the stable.\r\n`, 'dim'));
    return;
  }
  if (trimmed.startsWith('summon ')) {
    if (player.currentRoom !== 'room_001') {
      socket.write(colorize('The pet stable is only accessible in room 001.\r\n', 'yellow'));
      return;
    }
    const want = trimmed.slice(7).trim().toLowerCase();
    const pet = player.pets.find(p => p.name.toLowerCase() === want);
    if (!pet) {
      socket.write(colorize(`You have no pet named "${want}".\r\n`, 'yellow'));
      return;
    }
    if (pet.downUntil && Date.now() < pet.downUntil) {
      const wait = Math.ceil((pet.downUntil - Date.now()) / 1000);
      socket.write(colorize(`${pet.name} is still recovering. ${wait}s until ready.\r\n`, 'yellow'));
      return;
    }
    for (const p of player.pets) p.active = false;
    pet.active = true;
    socket.write(colorize(`${pet.name} pads to your side.\r\n`, 'brightCyan'));
    return;
  }
  // "pet <name>" shows a single pet
  const pet = (player.pets || []).find(p => p.name.toLowerCase() === trimmed);
  if (pet) {
    socket.write('\r\n');
    socket.write(colorize(`=== ${pet.name} ===\r\n`, 'brightCyan'));
    socket.write(`  Level:    ${pet.level}\r\n`);
    socket.write(`  HP:       ${pet.hp}/${pet.maxHp}\r\n`);
    socket.write(`  Strength: ${pet.str}\r\n`);
    socket.write(`  XP:       ${pet.xp}\r\n`);
    socket.write(`  State:    ${pet.active ? 'Active' : 'Stabled'}\r\n`);
    socket.write('\r\n');
    return;
  }
  socket.write(colorize('Usage: pet <name> | pet stable | pet summon <name>\r\n', 'dim'));
}

function petShareXP(socket, player, xpGain) {
  if (!player.pets || player.pets.length === 0) return;
  const active = player.pets.find(p => p.active);
  if (!active || active.hp <= 0) return;
  active.xp += Math.floor(xpGain / 3);
  // Level-up pet every 200*level XP
  const threshold = 200 * active.level;
  if (active.xp >= threshold) {
    active.xp -= threshold;
    active.level += 1;
    active.maxHp += 12;
    active.hp = active.maxHp;
    active.str += 2;
    socket.write(colorize(`Your pet ${active.name} has grown stronger! (L${active.level})\r\n`, 'brightCyan'));
  }
}

function petAssistAttack(socket, player, monster) {
  if (!player.pets || player.pets.length === 0) return;
  const active = player.pets.find(p => p.active);
  if (!active || active.hp <= 0) return;
  if (!monster || monster.hp <= 0) return;
  const dmg = Math.floor(active.level * 1.5) + Math.floor(Math.random() * (active.str + 1));
  monster.hp -= dmg;
  socket.write(colorize(`${active.name} lunges — hits ${monster.name} for ${dmg}!\r\n`, 'cyan'));
}

// Tier 2.3: monster has a chance to hit the active pet during its counter-attack.
// Pets take 50% of the monster's base damage, 30% chance per round. A pet that
// drops to 0 HP is auto-stabled at 50% maxHp with a 2-minute re-summon lock.
const PET_DOWN_REVIVE_MS = 120000;
const PET_HIT_CHANCE = 0.30;
function monsterAttackPet(socket, player, monster) {
  if (!player.pets || player.pets.length === 0) return;
  const active = player.pets.find(p => p.active);
  if (!active || active.hp <= 0) return;
  if (!monster || monster.hp <= 0) return;
  if (Math.random() >= PET_HIT_CHANCE) return;
  const raw = Math.max(1, Math.floor(monster.str * 0.5) + Math.floor(Math.random() * 4));
  active.hp -= raw;
  socket.write(colorize(`${monster.name} rakes your ${active.name} for ${raw} damage! (Pet: ${Math.max(0, active.hp)}/${active.maxHp} HP)\r\n`, 'red'));
  if (active.hp <= 0) {
    active.hp = Math.floor(active.maxHp * 0.5);
    active.active = false;
    active.stabledAt = Date.now();
    active.downUntil = Date.now() + PET_DOWN_REVIVE_MS;
    socket.write(colorize(`${active.name} collapses! They are returned to the stable to recover.\r\n`, 'brightRed'));
  }
}

// Tier 2.3: pet follows the player between rooms. Prints departure to old room
// and arrival to new room, mirroring the player's movement broadcast.
function followPet(socket, player, fromRoom, toRoom) {
  if (!player.pets || player.pets.length === 0) return;
  const active = player.pets.find(p => p.active);
  if (!active || active.hp <= 0) return;
  if (player.isInvisible) return;
  try {
    if (fromRoom && typeof broadcastToRoom === 'function') {
      broadcastToRoom(fromRoom, colorize(`${active.name} pads after ${getDisplayName(player)}.`, 'cyan'), socket);
    }
    if (toRoom && typeof broadcastToRoom === 'function') {
      broadcastToRoom(toRoom, colorize(`${active.name} arrives at ${getDisplayName(player)}'s side.`, 'cyan'), socket);
    }
  } catch (e) { /* defensive */ }
}

// ---------- 2.4 Crafting ----------

let recipeData = null;
function loadRecipes() {
  try {
    const p = path.join(__dirname, 'recipes.json');
    if (fs.existsSync(p)) {
      recipeData = JSON.parse(fs.readFileSync(p, 'utf8'));
    } else {
      recipeData = { recipes: {} };
    }
  } catch (e) {
    console.log('Failed to load recipes.json:', e.message);
    recipeData = { recipes: {} };
  }
}

function handleRecipes(socket, player, args) {
  ensureT2Defaults(player);
  if (!recipeData) loadRecipes();
  const filter = (args || '').trim().toLowerCase();
  const entries = Object.entries(recipeData.recipes || {});
  const filtered = filter ? entries.filter(([id, r]) => (r.skill || '').toLowerCase() === filter) : entries;

  if (filtered.length === 0) {
    socket.write(colorize('No recipes match.\r\n', 'yellow'));
    return;
  }

  socket.write('\r\n');
  socket.write(colorize('=== Recipes ===\r\n', 'brightCyan'));
  for (const [id, r] of filtered) {
    const skillLvl = (player.skills && player.skills[r.skill]) || 0;
    const canCraft = skillLvl + 2 >= (r.reqLevel || 0);
    const mark = canCraft ? colorize('[OK]', 'brightGreen') : colorize('[--]', 'dim');
    const inputs = (r.inputs || []).map(i => `${i.count}x ${i.itemId}`).join(', ');
    socket.write(`  ${mark}  ${id.padEnd(22)} ${r.skill.padEnd(11)} L${r.reqLevel}  <= ${inputs}\r\n`);
  }
  socket.write(colorize('\r\nUse: craft <recipe-id>\r\n', 'dim'));
  socket.write('\r\n');
}

function handleCraft(socket, player, args) {
  ensureT2Defaults(player);
  if (!recipeData) loadRecipes();
  const id = (args || '').trim().toLowerCase();
  if (!id) { socket.write('Craft what?\r\n'); return; }
  const recipe = recipeData.recipes[id];
  if (!recipe) {
    socket.write(colorize(`No recipe "${id}".\r\n`, 'yellow'));
    return;
  }
  const skillLvl = (player.skills && player.skills[recipe.skill]) || 0;
  if (skillLvl + 2 < (recipe.reqLevel || 0)) {
    socket.write(colorize(`Your ${recipe.skill} skill is too low (${skillLvl} < ${recipe.reqLevel - 2}).\r\n`, 'yellow'));
    return;
  }
  // Check materials
  const inv = player.inventory || [];
  for (const inp of recipe.inputs || []) {
    const have = inv.filter(it => it && it.id === inp.itemId).length;
    if (have < inp.count) {
      socket.write(colorize(`Missing materials: need ${inp.count}x ${inp.itemId}, have ${have}.\r\n`, 'yellow'));
      return;
    }
  }
  // Consume materials
  for (const inp of recipe.inputs || []) {
    let toConsume = inp.count;
    for (let i = 0; i < player.inventory.length && toConsume > 0; i++) {
      if (player.inventory[i] && player.inventory[i].id === inp.itemId) {
        player.inventory.splice(i, 1);
        i--; toConsume--;
      }
    }
  }
  // Produce output
  const outItem = typeof createItem === 'function' ? createItem(recipe.output.itemId) : null;
  if (!outItem) {
    socket.write(colorize(`The craft failed — "${recipe.output.itemId}" is not a known item.\r\n`, 'red'));
    return;
  }
  player.inventory.push(outItem);
  // Bump skill
  if (!player.skills) player.skills = { weaponsmith: 0, enchanter: 0, alchemist: 0 };
  if (player.skills[recipe.skill] < 10) player.skills[recipe.skill] += 1;
  socket.write(colorize(`You craft ${outItem.name}!\r\n`, 'brightGreen'));
  socket.write(colorize(`${recipe.skill} skill: ${player.skills[recipe.skill]}/10\r\n`, 'dim'));
  if (typeof unlockAchievement === 'function') {
    unlockAchievement(socket, player, 'craft_first');
    if (player.skills[recipe.skill] >= 10) unlockAchievement(socket, player, 'craft_master');
  }
  // Tier 3.1 Phase 7: track Data weapons crafted - "Compiled" achievement
  if (!Array.isArray(player.dataWeaponsCrafted)) player.dataWeaponsCrafted = [];
  const COMPILED_SET = ['stun_baton', 'ice_breaker_rifle', 'segfault_cleaver'];
  if (COMPILED_SET.includes(recipe.output.itemId) && !player.dataWeaponsCrafted.includes(recipe.output.itemId)) {
    player.dataWeaponsCrafted.push(recipe.output.itemId);
    if (COMPILED_SET.every(w => player.dataWeaponsCrafted.includes(w))) {
      unlockAchievement(socket, player, 'compiled');
    }
  }
}

function handleSkills(socket, player) {
  ensureT2Defaults(player);
  socket.write('\r\n');
  socket.write(colorize('=== Crafting Skills ===\r\n', 'brightCyan'));
  for (const k of ['weaponsmith', 'enchanter', 'alchemist']) {
    const lvl = (player.skills && player.skills[k]) || 0;
    socket.write(`  ${k.padEnd(12)} ${lvl}/10\r\n`);
  }
  socket.write('\r\n');
}

// ---------- 2.6 Remort ----------

const REMORT_CAP = 5;

function getAbilityScore(player, key) {
  const base = (player.abilities && typeof player.abilities[key] === 'number') ? player.abilities[key] : 10;
  const bonus = (player.permStatBonuses && player.permStatBonuses[key]) || 0;
  return base + bonus;
}

function handleRemort(socket, player, args) {
  ensureT2Defaults(player);
  const arg = (args || '').trim().toLowerCase();

  if (!arg) {
    // Show preview
    socket.write('\r\n');
    socket.write(colorize('=== Remort Preview ===\r\n', 'brightMagenta'));
    if ((player.level || 0) < 30) {
      socket.write(colorize(`You must reach level 30 to remort. You are level ${player.level || 1}.\r\n`, 'yellow'));
      socket.write('\r\n');
      return;
    }
    if (!player.stats || !player.stats.storyFlags || !player.stats.storyFlags.finaleCompleted) {
      socket.write(colorize('You must complete the Shattered Symphony finale (room 200) before remorting.\r\n', 'yellow'));
      socket.write('\r\n');
      return;
    }
    if (player.remortTier >= REMORT_CAP) {
      socket.write(colorize(`You have reached the maximum remort tier (${REMORT_CAP}). No further remorts are possible.\r\n`, 'yellow'));
      socket.write('\r\n');
      return;
    }
    const nextTier = player.remortTier + 1;
    socket.write(colorize(`Current tier: ${player.remortTier}   ->   next tier: ${nextTier}\r\n`, 'brightCyan'));
    socket.write('  Level will reset to 1.\r\n');
    socket.write('  Experience will reset to 0.\r\n');
    socket.write('  Equipped gear will be unequipped (kept in inventory).\r\n');
    socket.write('  Inventory, gold, story flags, and achievements will be preserved.\r\n');
    socket.write(colorize('  +1 permanent bonus to one ability score (your choice).\r\n', 'brightGreen'));
    socket.write(colorize(`  +${nextTier * 5}% permanent XP gain.\r\n`, 'brightGreen'));
    socket.write(colorize(`  New title suffix: "the Tier-${nextTier} Harmonist".\r\n`, 'brightGreen'));
    socket.write('\r\n');
    socket.write(colorize('Type: remort confirm <str|dex|con|int|wis>\r\n', 'brightYellow'));
    socket.write('\r\n');
    return;
  }

  if (!arg.startsWith('confirm ')) {
    socket.write(colorize('Usage: remort  (preview)  or  remort confirm <stat>\r\n', 'yellow'));
    return;
  }

  const stat = arg.slice(8).trim();
  const validStats = ['str', 'dex', 'con', 'int', 'wis'];
  if (!validStats.includes(stat)) {
    socket.write(colorize('Stat must be one of: str, dex, con, int, wis.\r\n', 'yellow'));
    return;
  }
  if ((player.level || 0) < 30) {
    socket.write(colorize(`You must reach level 30 to remort.\r\n`, 'yellow'));
    return;
  }
  if (!player.stats || !player.stats.storyFlags || !player.stats.storyFlags.finaleCompleted) {
    socket.write(colorize('You must complete the Shattered Symphony finale before remorting.\r\n', 'yellow'));
    return;
  }
  if (player.remortTier >= REMORT_CAP) {
    socket.write(colorize('You have reached the remort cap.\r\n', 'yellow'));
    return;
  }

  // Apply remort
  player.remortTier += 1;
  if (!player.permStatBonuses) player.permStatBonuses = { str: 0, dex: 0, con: 0, int: 0, wis: 0 };
  player.permStatBonuses[stat] = (player.permStatBonuses[stat] || 0) + 1;

  // Unequip
  if (player.equipped) {
    const slots = ['weapon', 'armor', 'shield', 'head', 'neck', 'hands', 'feet', 'finger'];
    for (const s of slots) {
      if (player.equipped[s]) {
        player.inventory.push(player.equipped[s]);
        player.equipped[s] = null;
      }
    }
  }

  // Reset level / XP / HP / mana
  player.level = 1;
  player.experience = 0;
  const ld = typeof getLevelData === 'function' ? getLevelData(1) : { hp: 50, dmgMin: 5, dmgMax: 10, title: 'Novice Seeker' };
  player.maxHP = ld.hp;
  player.currentHP = ld.hp;
  player.maxMana = 15;
  player.currentMana = 15;
  player.baseDamage = { min: ld.dmgMin, max: ld.dmgMax };
  player.title = ld.title;

  // Title suffix (do not overwrite a purchased aura)
  const newSuffix = `the Tier-${player.remortTier} Harmonist`;
  const purchasedAuras = ['the Resolute', 'the Campaigner'];
  if (!player.suffix || !purchasedAuras.includes(player.suffix)) {
    player.suffix = newSuffix;
  }

  socket.write('\r\n');
  socket.write(colorize('*** THE LOOP CLOSES AND OPENS ANEW ***\r\n', 'brightMagenta'));
  socket.write(colorize(`You are reborn as a Tier-${player.remortTier} Harmonist.\r\n`, 'brightCyan'));
  socket.write(colorize(`Permanent +1 ${stat.toUpperCase()}.   +${player.remortTier * 5}% permanent XP gain.\r\n`, 'brightGreen'));
  socket.write('\r\n');

  if (typeof savePlayer === 'function') savePlayer(player, socket, true);
  if (typeof unlockAchievement === 'function') {
    unlockAchievement(socket, player, 'remort_first');
    if (player.remortTier >= REMORT_CAP) unlockAchievement(socket, player, 'remort_max');
  }
  if (typeof logActivity === 'function') logActivity(`${player.name} has remorted to Tier ${player.remortTier}.`);
}

// ---------- Tier 2 router ----------

function handleTier2Command(socket, player, input) {
  const command = (input || '').toLowerCase().trim();
  ensureT2Defaults(player);

  // 2.1 campaigns
  if (command === 'campaign' || command === 'camp') { handleCampaign(socket, player, ''); return true; }
  if (command.startsWith('campaign ') || command.startsWith('camp ')) {
    const q = command.startsWith('campaign ') ? command.slice(9) : command.slice(5);
    handleCampaign(socket, player, q);
    return true;
  }

  // 2.2 QP + redeem
  if (command === 'qp' || command === 'questpoints') { handleQP(socket, player); return true; }
  if (command === 'redeem') { handleRedeem(socket, player, ''); return true; }
  if (command.startsWith('redeem ')) { handleRedeem(socket, player, command.slice(7)); return true; }

  // 2.3 pets
  if (command === 'pets') { handlePets(socket, player); return true; }
  if (command === 'tame') { handleTame(socket, player, ''); return true; }
  if (command.startsWith('tame ')) { handleTame(socket, player, command.slice(5)); return true; }
  if (command === 'release' || command.startsWith('release ')) {
    handleRelease(socket, player, command === 'release' ? '' : command.slice(8));
    return true;
  }
  if (command === 'pet' || command.startsWith('pet ')) {
    handlePetSub(socket, player, command === 'pet' ? '' : command.slice(4));
    return true;
  }

  // 2.4 crafting
  if (command === 'recipes') { handleRecipes(socket, player, ''); return true; }
  if (command.startsWith('recipes ')) { handleRecipes(socket, player, command.slice(8)); return true; }
  if (command === 'craft') { socket.write('Craft what? Use "recipes" to list.\r\n'); return true; }
  if (command.startsWith('craft ')) { handleCraft(socket, player, command.slice(6)); return true; }
  if (command === 'skills') { handleSkills(socket, player); return true; }

  // 2.6 remort
  if (command === 'remort') { handleRemort(socket, player, ''); return true; }
  if (command.startsWith('remort ')) { handleRemort(socket, player, command.slice(7)); return true; }

  return false;
}

// ============================================
// SERVER SETUP
// ============================================

// Give starting equipment to new players
function giveStartingEquipment(player) {
  const starterWeapon = createItem('rusty_dagger');
  const starterArmor = createItem('leather_vest');
  const starterPotion = createItem('minor_healing_potion');
  const starterPotion2 = createItem('minor_healing_potion');
  if (starterWeapon) player.inventory.push(starterWeapon);
  if (starterArmor) player.inventory.push(starterArmor);
  if (starterPotion) player.inventory.push(starterPotion);
  if (starterPotion2) player.inventory.push(starterPotion2);
}

// Eldoria 2.0: grant the Initiate's Tuning Fork directly to the player (one-time).
function placeTuningForkForPlayer(player, socket) {
  if (player.stats.storyFlags && player.stats.storyFlags.tuningForkGranted) return;
  const fork = createItem('tuning_fork');
  if (fork) {
    player.inventory.push(fork);
    if (socket) {
      socket.write(colorize("At your feet, a silver tuning fork glints in the ash. You pick it up. It hums faintly, a single pure note waiting to be struck.\r\n", 'brightCyan'));
    }
  }
  if (player.stats.storyFlags) player.stats.storyFlags.tuningForkGranted = true;
}

// Eldoria 2.0: seed ground items that should always be present at world start / after reset.
function initializeRoomItems() {
  // Tuning Fork in room 101 (for players who transit via admin teleport, etc.)
  if (!getItemsInRoom('room_101').some(i => i.id === 'tuning_fork')) {
    const fork = createItem('tuning_fork');
    if (fork) addItemToRoom('room_101', fork);
  }
  // Silver Harp of Creation in Lyralei's room (NPC, no combat)
  if (!getItemsInRoom('room_138').some(i => i.id === 'silver_harp_of_creation')) {
    const harp = createItem('silver_harp_of_creation');
    if (harp) addItemToRoom('room_138', harp);
  }
}

// ============================================
// CONSIDER COMMAND (Tier 0.7)
// ============================================

// Produce a fight-outcome estimate for a monster in the player's room.
function handleConsider(socket, player, targetName) {
  if (!targetName || !targetName.trim()) {
    socket.write('Consider what? Usage: consider <monster>\r\n');
    return;
  }
  const monster = findMonsterInRoom(player.currentRoom, targetName.trim());
  if (!monster) {
    socket.write(colorize(`There is no "${targetName}" here to consider.\r\n`, 'yellow'));
    return;
  }

  // Estimate rough damage-per-round for both sides
  const weaponBonus = getEquippedDamageBonus(player);
  const armorBonus = getEquippedArmorBonus(player);
  const playerAvgDmg = ((player.baseDamage.min + player.baseDamage.max) / 2) + 3 + weaponBonus;
  const monsterAvgRaw = monster.str + 5.5;
  const monsterAvgDmg = Math.max(1, monsterAvgRaw - armorBonus);

  const roundsToKillMonster = Math.max(1, Math.ceil(monster.hp / playerAvgDmg));
  const roundsToKillPlayer = Math.max(1, Math.ceil(player.currentHP / monsterAvgDmg));
  const levelGap = monster.level - player.level;

  let verdict, color;
  if (roundsToKillPlayer <= 2) { verdict = 'It will crush you in moments.'; color = 'brightRed'; }
  else if (roundsToKillPlayer < roundsToKillMonster - 2) { verdict = 'You are badly outmatched. Run.'; color = 'red'; }
  else if (roundsToKillPlayer < roundsToKillMonster) { verdict = "You'd probably lose this fight."; color = 'yellow'; }
  else if (roundsToKillMonster < roundsToKillPlayer - 2) { verdict = 'You would likely win with ease.'; color = 'brightGreen'; }
  else if (roundsToKillMonster < roundsToKillPlayer) { verdict = 'You would likely win, but bring a potion.'; color = 'green'; }
  else { verdict = 'A coin-toss fight. Hope you have luck on you.'; color = 'brightYellow'; }

  socket.write('\r\n');
  socket.write(colorize(`=== Consider: ${monster.name} ===\r\n`, 'brightCyan'));
  socket.write(`Level:     ${colorize(String(monster.level), 'brightWhite')}  (you: ${player.level}, gap: ${levelGap >= 0 ? '+' : ''}${levelGap})\r\n`);
  socket.write(`HP:        ${monster.hp}/${monster.maxHp}\r\n`);
  socket.write(`Strength:  ~${monster.str} raw damage per hit\r\n`);
  socket.write(`Type:      ${monster.type}\r\n`);
  socket.write('\r\n');
  socket.write(`Your est. DPS:   ~${playerAvgDmg.toFixed(1)} per round (kills it in ~${roundsToKillMonster} rounds)\r\n`);
  socket.write(`Its est. DPS:    ~${monsterAvgDmg.toFixed(1)} per round (kills you in ~${roundsToKillPlayer} rounds)\r\n`);
  socket.write('\r\n');
  socket.write(colorize(verdict + '\r\n', color));
  socket.write('\r\n');
}

// ============================================
// ALIASES (Tier 0.9)
// ============================================

const RESERVED_ALIAS_NAMES = new Set([
  'alias', 'unalias', 'aliases', 'quit', 'help', 'admin'
]);

function handleAlias(socket, player, args) {
  const trimmed = (args || '').trim();
  if (!trimmed) {
    listAliases(socket, player);
    return;
  }
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    // show single alias
    const key = trimmed.toLowerCase();
    if (player.aliases && player.aliases[key]) {
      socket.write(`alias ${key} = ${player.aliases[key]}\r\n`);
    } else {
      socket.write(colorize(`No alias "${key}" set.\r\n`, 'yellow'));
    }
    return;
  }
  const key = trimmed.slice(0, spaceIdx).toLowerCase();
  const value = trimmed.slice(spaceIdx + 1).trim();
  if (!/^[a-z][a-z0-9_-]{0,19}$/.test(key)) {
    socket.write(colorize('Alias name must be 1-20 chars, start with a letter, letters/digits/_/- only.\r\n', 'yellow'));
    return;
  }
  if (RESERVED_ALIAS_NAMES.has(key)) {
    socket.write(colorize(`"${key}" is reserved and cannot be aliased.\r\n`, 'yellow'));
    return;
  }
  if (!value) {
    socket.write(colorize('Alias value cannot be empty. Use "unalias" to remove.\r\n', 'yellow'));
    return;
  }
  if (value.length > 120) {
    socket.write(colorize('Alias value too long (max 120 chars).\r\n', 'yellow'));
    return;
  }
  player.aliases = player.aliases || {};
  player.aliases[key] = value;
  socket.write(colorize(`Alias set: ${key} = ${value}\r\n`, 'green'));
  if (Object.keys(player.aliases).length >= 10) unlockAchievement(socket, player, 'alias_power');
}

function handleUnalias(socket, player, args) {
  const key = (args || '').trim().toLowerCase();
  if (!key) {
    socket.write('Usage: unalias <name>\r\n');
    return;
  }
  if (player.aliases && player.aliases[key]) {
    delete player.aliases[key];
    socket.write(colorize(`Alias removed: ${key}\r\n`, 'green'));
  } else {
    socket.write(colorize(`No alias "${key}" set.\r\n`, 'yellow'));
  }
}

function listAliases(socket, player) {
  const aliases = player.aliases || {};
  const keys = Object.keys(aliases).sort();
  socket.write('\r\n');
  socket.write(colorize('=== Your Aliases ===\r\n', 'brightCyan'));
  if (keys.length === 0) {
    socket.write(colorize('(none)\r\n', 'dim'));
    socket.write(colorize('Set one with: alias <name> <command>\r\n', 'dim'));
  } else {
    for (const k of keys) {
      socket.write(`  ${colorize(k, 'brightWhite')}: ${aliases[k]}\r\n`);
    }
  }
  socket.write('\r\n');
}

// Expand a player alias at the start of a command line. Single-pass to avoid recursion loops.
function expandAlias(player, raw) {
  if (!player || !player.aliases) return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const spaceIdx = trimmed.indexOf(' ');
  const firstWord = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
  const expansion = player.aliases[firstWord];
  if (!expansion) return raw;
  return rest ? `${expansion} ${rest}` : expansion;
}

// ============================================
// CHANNELS (Tier 0.8)
// ============================================

const CHANNELS = {
  newbie: { color: 'brightGreen', label: '[Newbie]', description: 'For new players asking questions' },
  ooc:    { color: 'brightCyan',  label: '[OOC]',    description: 'Out-of-character chat' },
  gossip: { color: 'brightMagenta', label: '[Gossip]', description: 'Idle server-wide banter' },
  trade:  { color: 'brightYellow', label: '[Trade]',  description: 'Buying/selling gear and potions' }
};

function handleChannelMessage(socket, player, channelKey, message) {
  const ch = CHANNELS[channelKey];
  if (!ch) return;
  if (!message || !message.trim()) {
    // Toggle subscription
    player.channelSubs = player.channelSubs || {};
    player.channelSubs[channelKey] = !player.channelSubs[channelKey];
    const state = player.channelSubs[channelKey] ? 'ON' : 'OFF';
    socket.write(colorize(`Channel ${channelKey}: ${state}\r\n`, 'cyan'));
    return;
  }
  if (!player.channelSubs || !player.channelSubs[channelKey]) {
    socket.write(colorize(`You are not listening to ${channelKey}. Type "${channelKey}" with no message to toggle on.\r\n`, 'yellow'));
    return;
  }
  const line = `${colorize(ch.label, ch.color)} ${colorize(getDisplayName(player), 'brightWhite')}: ${message.trim()}\r\n`;
  // getOnlinePlayers returns {player, socket} pairs - destructure properly so subscription check works
  for (const { player: p, socket: sock } of getOnlinePlayers()) {
    if (!p.channelSubs || !p.channelSubs[channelKey]) continue;
    if (p.ignoreList && p.ignoreList.includes((player.name || '').toLowerCase())) continue;
    if (sock) sock.write(line);
  }
}

function handleChannels(socket, player) {
  socket.write('\r\n');
  socket.write(colorize('=== Channels ===\r\n', 'brightCyan'));
  player.channelSubs = player.channelSubs || {};
  for (const [key, ch] of Object.entries(CHANNELS)) {
    const on = !!player.channelSubs[key];
    const state = on ? colorize(' ON', 'brightGreen') : colorize('OFF', 'dim');
    socket.write(`  ${state}  ${colorize(key.padEnd(7), ch.color)} - ${ch.description}\r\n`);
  }
  socket.write(colorize('\r\nUsage: <channel> <message>   e.g. "ooc hi"\r\n', 'dim'));
  socket.write(colorize('Type "<channel>" with no message to toggle on/off.\r\n', 'dim'));
  socket.write('\r\n');
}

// ============================================
// HELP SYSTEM (Tier 0.3)
// ============================================

let helpData = null;
function loadHelpData() {
  try {
    helpData = JSON.parse(fs.readFileSync(path.join(__dirname, 'help.json'), 'utf8'));
  } catch (e) {
    helpData = { topics: {} };
    console.log('help.json not loaded:', e.message);
  }
}

function handleHelp(socket, player, args) {
  if (!helpData) loadHelpData();
  const arg = (args || '').trim();
  if (!arg) {
    socket.write('\r\n');
    socket.write(colorize('=== Help Index ===\r\n', 'brightCyan'));
    socket.write(colorize('Use "help <topic>" for details. "help search <term>" to search.\r\n\r\n', 'dim'));
    // Show topics grouped by category
    const byCat = {};
    for (const [key, t] of Object.entries(helpData.topics || {})) {
      const cat = t.category || 'General';
      (byCat[cat] = byCat[cat] || []).push(key);
    }
    const catOrder = Object.keys(byCat).sort();
    for (const cat of catOrder) {
      socket.write(colorize(`${cat}:\r\n`, 'brightYellow'));
      socket.write('  ' + byCat[cat].sort().join(', ') + '\r\n');
    }
    socket.write('\r\n');
    return;
  }

  if (arg.toLowerCase().startsWith('search ')) {
    const term = arg.slice(7).trim().toLowerCase();
    if (!term) {
      socket.write('Usage: help search <term>\r\n');
      return;
    }
    const hits = [];
    for (const [key, t] of Object.entries(helpData.topics || {})) {
      const body = (t.body || '').toLowerCase();
      if (key.toLowerCase().includes(term) || body.includes(term) || (t.summary || '').toLowerCase().includes(term)) {
        hits.push({ key, summary: t.summary || '' });
      }
    }
    socket.write('\r\n');
    socket.write(colorize(`Search "${term}": ${hits.length} match${hits.length === 1 ? '' : 'es'}\r\n`, 'brightCyan'));
    for (const h of hits.slice(0, 30)) {
      socket.write(`  ${colorize(h.key, 'brightWhite')} - ${h.summary}\r\n`);
    }
    socket.write('\r\n');
    return;
  }

  const key = arg.toLowerCase();
  const t = (helpData.topics || {})[key];
  if (!t) {
    socket.write(colorize(`No help topic "${arg}". Try "help" for the index, or "help search <term>".\r\n`, 'yellow'));
    return;
  }
  socket.write('\r\n');
  socket.write(colorize(`=== Help: ${t.title || key} ===\r\n`, 'brightCyan'));
  if (t.summary) socket.write(colorize(t.summary + '\r\n\r\n', 'dim'));
  socket.write(t.body + '\r\n');
  if (t.seeAlso && t.seeAlso.length) {
    socket.write(colorize(`\r\nSee also: ${t.seeAlso.join(', ')}\r\n`, 'dim'));
  }
  socket.write('\r\n');
}

// ============================================
// BESTIARY (Tier 0.4)
// ============================================

function handleBestiary(socket, player, args) {
  const arg = (args || '').trim();
  if (!arg) {
    const entries = [];
    for (const [id, m] of Object.entries(monsterData.templates || {})) {
      entries.push({ id, name: m.name, level: m.level, type: m.type });
    }
    for (const [id, b] of Object.entries(monsterData.bosses || {})) {
      entries.push({ id, name: b.name, level: b.level, type: 'Boss' });
    }
    entries.sort((a, b) => a.level - b.level);
    socket.write('\r\n');
    socket.write(colorize('=== Bestiary ===\r\n', 'brightCyan'));
    socket.write(colorize(`(${entries.length} entries. Use "bestiary <name>" for details.)\r\n\r\n`, 'dim'));
    for (const e of entries) {
      const typeColor = e.type === 'Boss' ? 'brightRed' : e.type === 'Aggressive' ? 'red' : e.type === 'Neutral' ? 'yellow' : 'green';
      socket.write(`  L${String(e.level).padStart(2, ' ')}  ${colorize(e.type.padEnd(10, ' '), typeColor)}  ${e.name}\r\n`);
    }
    socket.write('\r\n');
    return;
  }

  const search = arg.toLowerCase();
  let match = null;
  for (const [id, m] of Object.entries(monsterData.templates || {})) {
    if (id.toLowerCase() === search || m.name.toLowerCase() === search) { match = { id, m, isBoss: false }; break; }
  }
  if (!match) {
    for (const [id, b] of Object.entries(monsterData.bosses || {})) {
      if (id.toLowerCase() === search || b.name.toLowerCase() === search) { match = { id, m: b, isBoss: true }; break; }
    }
  }
  if (!match) {
    for (const [id, m] of Object.entries(monsterData.templates || {})) {
      if (m.name.toLowerCase().includes(search) || id.toLowerCase().includes(search)) { match = { id, m, isBoss: false }; break; }
    }
  }
  if (!match) {
    for (const [id, b] of Object.entries(monsterData.bosses || {})) {
      if (b.name.toLowerCase().includes(search) || id.toLowerCase().includes(search)) { match = { id, m: b, isBoss: true }; break; }
    }
  }
  if (!match) {
    socket.write(colorize(`No bestiary entry matches "${arg}".\r\n`, 'yellow'));
    return;
  }

  const m = match.m;
  socket.write('\r\n');
  socket.write(colorize(`=== ${m.name} ===\r\n`, 'brightCyan'));
  if (match.isBoss) socket.write(colorize('[Boss]\r\n', 'brightRed'));
  socket.write(`Level: ${m.level}\r\n`);
  socket.write(`Type: ${m.type}\r\n`);
  socket.write(`HP: ${m.hp}\r\n`);
  socket.write(`Strength: ${m.str}\r\n`);
  if (m.description) socket.write(`\r\n${m.description}\r\n`);
  if (match.isBoss && m.fixedRoom) socket.write(colorize(`\r\nLair: ${m.fixedRoom}\r\n`, 'dim'));
  // Known loot
  const loot = (itemData.monsterLootTables && itemData.monsterLootTables[match.id]) || null;
  const bossDrops = (itemData.bossDrops && itemData.bossDrops[match.id]) || null;
  if (bossDrops && bossDrops.guaranteed) {
    socket.write(colorize(`\r\nGuaranteed drops: ${bossDrops.guaranteed.join(', ')}\r\n`, 'brightYellow'));
  } else if (loot && loot.length) {
    socket.write(colorize(`\r\nKnown drops: ${loot.join(', ')}\r\n`, 'yellow'));
  }
  if (BOSS_SIGNATURES[match.id]) {
    socket.write(colorize(`\r\nThis foe has a signature mechanic. Fight with caution.\r\n`, 'brightMagenta'));
  }
  socket.write('\r\n');
}

// ============================================
// ZONE MAP (Tier 0.5)
// ============================================

// BFS coordinates per zone cache
let zoneMapCache = null;

function buildZoneMap() {
  // Compute (x,y) for every room in each zone by BFS starting from the numerically lowest room in that zone.
  const zoneRooms = {};
  for (const [rid, r] of Object.entries(rooms)) {
    const z = r.zone || 'Unknown';
    (zoneRooms[z] = zoneRooms[z] || []).push(rid);
  }
  const DIR_OFFSETS = {
    north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
    northeast: [1, -1], northwest: [-1, -1], southeast: [1, 1], southwest: [-1, 1],
    up: [0, 0], down: [0, 0]
  };
  const result = {};
  for (const [z, rids] of Object.entries(zoneRooms)) {
    rids.sort();
    const coords = {};
    const queue = [rids[0]];
    coords[rids[0]] = { x: 0, y: 0 };
    while (queue.length) {
      const cur = queue.shift();
      const room = rooms[cur];
      if (!room || !room.exits) continue;
      const { x, y } = coords[cur];
      for (const [dir, target] of Object.entries(room.exits)) {
        if (!DIR_OFFSETS[dir]) continue;
        if (!rooms[target] || (rooms[target].zone || 'Unknown') !== z) continue;
        if (coords[target]) continue;
        const [dx, dy] = DIR_OFFSETS[dir];
        coords[target] = { x: x + dx, y: y + dy };
        queue.push(target);
      }
    }
    result[z] = coords;
  }
  zoneMapCache = result;
}

function handleMap(socket, player) {
  if (!zoneMapCache) buildZoneMap();
  const room = rooms[player.currentRoom];
  if (!room) {
    socket.write(colorize('You seem to be nowhere. The map cannot help you.\r\n', 'yellow'));
    return;
  }
  const zone = room.zone || 'Unknown';
  const coords = zoneMapCache[zone];
  if (!coords || !coords[player.currentRoom]) {
    socket.write(colorize(`No map available for ${zone}.\r\n`, 'yellow'));
    return;
  }
  const me = coords[player.currentRoom];
  const RADIUS = 3; // 7x7 window
  const minX = me.x - RADIUS, maxX = me.x + RADIUS;
  const minY = me.y - RADIUS, maxY = me.y + RADIUS;

  // Build grid: each cell is '.' (empty), '#' (room), '@' (you), '*' (visited), '!' (monster room)
  const visited = (player.stats.roomsExplored || []);
  const grid = [];
  for (let y = minY; y <= maxY; y++) {
    let row = '';
    for (let x = minX; x <= maxX; x++) {
      // Find room at this coord in zone
      const roomId = Object.keys(coords).find(rid => coords[rid].x === x && coords[rid].y === y);
      if (!roomId) { row += '  '; continue; }
      if (roomId === player.currentRoom) {
        row += colorize('@ ', 'brightYellow');
      } else if (visited.includes(roomId)) {
        row += colorize('* ', 'brightGreen');
      } else {
        row += colorize('# ', 'dim');
      }
    }
    grid.push(row);
  }

  socket.write('\r\n');
  socket.write(colorize(`=== Map: ${zone} ===\r\n`, 'brightCyan'));
  for (const row of grid) socket.write(row + '\r\n');
  socket.write(colorize('\r\nLegend: @ you  * visited  # unvisited\r\n', 'dim'));
  socket.write('\r\n');
}

// ============================================
// AUTHENTICATION INPUT HANDLER
// ============================================

// Show welcome banner with ASCII art
function showWelcomeBanner(socket) {
  const onlineCount = getOnlinePlayers().length;
  const cycleRemaining = getCycleTimeRemaining();
  const cycleMinutes = Math.floor(cycleRemaining / 60000);

  socket.write('\r\n');
  socket.write(colorize('===============================================================\r\n', 'brightCyan'));
  socket.write(colorize('  _____ _            _____ _           _   _                 _ \r\n', 'brightWhite'));
  socket.write(colorize(' |_   _| |__   ___  / ____| |         | | | |               | |\r\n', 'brightWhite'));
  socket.write(colorize('   | | | \'_ \\ / _ \\| (___ | |__   __ _| |_| |_ ___ _ __ ___| |\r\n', 'brightWhite'));
  socket.write(colorize('   | | | | | |  __/ \\___ \\| \'_ \\ / _` | __| __/ _ \\ \'__/ _ \\ |\r\n', 'brightWhite'));
  socket.write(colorize('   | | | | | |\\___| ____) | | | | (_| | |_| ||  __/ | |  __/_|\r\n', 'brightWhite'));
  socket.write(colorize('   \\_/ |_| |_|     |_____/|_| |_|\\__,_|\\__|\\__\\___|_|  \\___(_)\r\n', 'brightWhite'));
  socket.write('\r\n');
  socket.write(colorize('  ____            _                 \r\n', 'brightYellow'));
  socket.write(colorize(' |  _ \\ ___  __ _| |_ __ ___  ___  \r\n', 'brightYellow'));
  socket.write(colorize(' | |_) / _ \\/ _` | | \'_ ` _ \\/ __| \r\n', 'brightYellow'));
  socket.write(colorize(' |  _ <  __/ (_| | | | | | | \\__ \\ \r\n', 'brightYellow'));
  socket.write(colorize(' |_| \\_\\___|\\__,_|_|_| |_| |_|___/ \r\n', 'brightYellow'));
  socket.write('\r\n');
  socket.write(colorize('        A Competitive Multiplayer MUD\r\n', 'brightCyan'));
  socket.write('\r\n');
  socket.write(colorize(`        Connected: ${onlineCount}`, 'white'));
  socket.write(colorize(' | ', 'dim'));
  socket.write(colorize(`Reset in: ${cycleMinutes}m\r\n`, 'white'));
  socket.write(colorize('===============================================================\r\n', 'brightCyan'));
  socket.write('\r\n');
}

// Complete player login (shared between login and registration)
function completePlayerLogin(socket, player, isNewPlayer) {
  player.isRegistered = true;
  player.authenticated = true; // Now they can receive game broadcasts
  player.inputMode = 'command';
  disablePasswordMode(socket, player);
  players.set(socket, player);

  // Tier 4.1: reconcile clan state - if clan was disbanded while player was offline, clear stale refs
  if (typeof reconcilePlayerClan === 'function') reconcilePlayerClan(player);

  // Log admin login for security tracking
  if (isAdmin(player.name)) {
    const ipAddress = socket.remoteAddress || 'unknown';
    const action = isNewPlayer ? 'Admin account created' : 'Admin login';
    logAdminCommand(player.name, `${action} from ${ipAddress}`);
    logActivity(`${action}: ${player.name} from ${ipAddress}`);
  }

  if (isNewPlayer) {
    // Give starting equipment
    giveStartingEquipment(player);

    socket.write('\r\n');
    socket.write(colorize(`Welcome to The Shattered Realms, ${player.name}! Your legend begins...\r\n`, 'brightGreen'));
    socket.write('\r\n');
    socket.write('You are a ' + colorize(player.title, 'brightYellow') + '\r\n');
    socket.write(`Level ${player.level} | HP: ${player.currentHP}/${player.maxHP} | Damage: ${player.baseDamage.min}-${player.baseDamage.max}\r\n`);
    socket.write(`Gold: ${colorize(String(player.gold), 'brightYellow')}\r\n`);
    socket.write('\r\n');
    socket.write(colorize('Tip: Check your inventory (i) - you have starting gear!\r\n', 'green'));
    socket.write('\r\n');

    // Save new player
    savePlayer(player, socket, true);
    console.log(`New player created: ${player.name}`);
  } else {
    socket.write('\r\n');
    socket.write(colorize(`Welcome back, ${player.title} ${player.name}! You awaken in the Awakening Chamber.\r\n`, 'brightGreen'));
    socket.write(`Level ${player.level} | HP: ${player.currentHP}/${player.maxHP} | XP: ${player.experience}\r\n`);
    socket.write(`Gold: ${colorize(String(player.gold), 'brightYellow')} | Items: ${player.inventory.length}/${getInventoryCap(player)}\r\n`);
    socket.write('\r\n');
    console.log(`Returning player: ${player.name} (Level ${player.level})`);
  }

  // Show commands help
  socket.write('Commands: look (l), attack [monster], flee, stats (score), save\r\n');
  socket.write('          inventory (i), equipment (eq), get/drop, equip/unequip, use/drink\r\n');
  socket.write('          say, shout, tell [player], emote, who, whois [player]\r\n');
  socket.write('Directions: n/s/e/w/ne/nw/se/sw/u/d\r\n');
  socket.write('\r\n');
  socket.write(colorize('Monster Threat: [!] Aggressive, [~] Neutral, [-] Passive, [BOSS] Boss\r\n', 'yellow'));
  socket.write(colorize('Defeat monsters to gain XP and level up (max level 30)!\r\n', 'cyan'));

  // Broadcast player joining to everyone
  broadcastToAll(colorize(`${getDisplayName(player)} has entered the Shattered Realms.`, 'brightGreen'), socket);

  // Broadcast arrival to players in the room
  broadcastToRoom(player.currentRoom, `${getDisplayName(player)} materializes here.`, socket);

  // Show starting room
  showRoom(socket, player);
  socket.write('> ');

  // Start auto-save timer for this player
  player.autoSaveTimer = setInterval(() => {
    if (player.isRegistered) {
      savePlayer(player, socket, false);
    }
  }, AUTO_SAVE_INTERVAL);
}

// Handle authentication input (state machine)
async function handleAuthInput(socket, player, input) {
  const trimmedInput = input.trim();

  switch (player.inputMode) {
    // =====================================
    // INITIAL CHOICE: Y/N for existing account
    // =====================================
    case 'auth_choice':
      const choice = trimmedInput.toLowerCase();
      if (choice === 'y' || choice === 'yes') {
        // Existing account - go to login
        socket.write('\r\n');
        socket.write(colorize('Login\r\n', 'brightCyan'));
        socket.write(colorize('=====\r\n', 'brightCyan'));
        socket.write('Username: ');
        player.inputMode = 'login_username';
      } else if (choice === 'n' || choice === 'no') {
        // New account - go to registration
        socket.write('\r\n');
        socket.write(colorize('Create New Account\r\n', 'brightCyan'));
        socket.write(colorize('==================\r\n', 'brightCyan'));
        socket.write('Choose a username (3-12 letters): ');
        player.inputMode = 'register_username';
      } else {
        socket.write('Please enter Y or N: ');
      }
      break;

    // =====================================
    // LOGIN FLOW
    // =====================================
    case 'login_username':
      if (trimmedInput === '') {
        socket.write('Username: ');
        return;
      }

      // Validate and format name
      if (!isValidPlayerName(trimmedInput)) {
        socket.write(colorize('Invalid username format. Use 3-12 letters only.\r\n', 'red'));
        socket.write('Username: ');
        return;
      }

      const loginName = trimmedInput.charAt(0).toUpperCase() + trimmedInput.slice(1).toLowerCase();

      // Check if banned
      if (isBanned(loginName)) {
        socket.write(colorize('\r\nThis account has been banned from the realms.\r\n', 'red'));
        socket.write('Your connection will be closed.\r\n');
        socket.end();
        console.log(`Banned player ${loginName} attempted to connect`);
        return;
      }

      // Check if account exists
      if (!accountExists(loginName)) {
        // Check if player file exists (migration case)
        if (playerExists(loginName)) {
          // Existing player without account - needs migration
          socket.write(colorize('\r\n================================================================\r\n', 'yellow'));
          socket.write(colorize('                    SECURITY UPDATE\r\n', 'yellow'));
          socket.write(colorize('================================================================\r\n', 'yellow'));
          socket.write('\r\nThe Shattered Realms now requires password authentication.\r\n');
          const existingData = loadPlayer(loginName);
          socket.write(`You have an existing character: ${colorize(loginName, 'brightWhite')} (Level ${existingData.level})\r\n`);
          socket.write('\r\nTo secure your account, please create a password:\r\n');
          socket.write('Password (min 6 characters): ');
          player.authState.pendingUsername = loginName;
          enablePasswordMode(socket, player);
          player.inputMode = 'migrate_password';
          return;
        }

        socket.write(colorize('Account not found. Please check your username or create a new account.\r\n', 'red'));
        socket.write('Username: ');
        return;
      }

      // Store username and ask for password
      player.authState.pendingUsername = loginName;
      socket.write('Password: ');
      enablePasswordMode(socket, player);
      player.inputMode = 'login_password';
      break;

    case 'login_password':
      if (trimmedInput === '') {
        socket.write('Password: ');
        return;
      }

      const loginUsername = player.authState.pendingUsername;
      socket.write('\r\nAuthenticating...\r\n');

      // Verify password
      const loginResult = await verifyPassword(loginUsername, trimmedInput);

      if (loginResult.success) {
        disablePasswordMode(socket, player);

        // Check for duplicate login
        const onlinePlayer = isPlayerOnline(loginUsername);
        if (onlinePlayer) {
          socket.write(colorize('\r\nThat character is already logged in!\r\n', 'yellow'));
          socket.write('Options:\r\n');
          socket.write('  1. Kick existing session (requires password re-entry)\r\n');
          socket.write('  2. Try different username\r\n');
          socket.write('Choice (1/2): ');
          player.authState.kickTarget = onlinePlayer.socket;
          player.inputMode = 'duplicate_choice';
          return;
        }

        // Load player data
        const existingPlayer = loadPlayer(loginUsername);
        if (existingPlayer) {
          Object.assign(player, existingPlayer);
          // Reset auth state after assignment
          player.authState = {
            pendingUsername: null,
            pendingPassword: null,
            isPasswordInput: false,
            kickTarget: null
          };

          // Check if password migration is needed
          const account = getAccount(loginUsername);
          if (account && account.needsPasswordMigration) {
            socket.write(colorize('\r\nYou must change your password before continuing.\r\n', 'yellow'));
            socket.write('New password (min 6 characters): ');
            enablePasswordMode(socket, player);
            player.inputMode = 'force_password_change';
            return;
          }

          socket.write(colorize('✓ Login successful!\r\n', 'brightGreen'));
          completePlayerLogin(socket, player, false);
        } else {
          socket.write(colorize('Error loading character data. Please try again.\r\n', 'red'));
          socket.write('Username: ');
          player.inputMode = 'login_username';
        }
      } else {
        disablePasswordMode(socket, player);

        switch (loginResult.error) {
          case 'LOCKED':
            socket.write(colorize(`\r\nAccount locked. Try again in ${loginResult.remainingMinutes} minute(s).\r\n`, 'red'));
            socket.write('Username: ');
            player.inputMode = 'login_username';
            break;
          case 'LOCKED_NOW':
            socket.write(colorize('\r\nToo many failed login attempts. Account temporarily locked.\r\n', 'red'));
            socket.write(colorize('Try again in 5 minutes.\r\n', 'yellow'));
            socket.write('\r\nUsername: ');
            player.inputMode = 'login_username';
            break;
          case 'WRONG_PASSWORD':
            socket.write(colorize(`\r\nInvalid password. Attempts remaining: ${loginResult.attemptsRemaining}\r\n`, 'red'));
            socket.write('Password: ');
            enablePasswordMode(socket, player);
            break;
          default:
            socket.write(colorize('\r\nAuthentication failed. Please try again.\r\n', 'red'));
            socket.write('Username: ');
            player.inputMode = 'login_username';
        }
      }
      break;

    // =====================================
    // DUPLICATE LOGIN HANDLING
    // =====================================
    case 'duplicate_choice':
      const dupChoice = trimmedInput;
      if (dupChoice === '1') {
        // Kick existing session - re-verify password
        socket.write('Re-enter password to confirm: ');
        enablePasswordMode(socket, player);
        player.inputMode = 'duplicate_verify';
      } else if (dupChoice === '2') {
        // Try different username
        player.authState.kickTarget = null;
        player.authState.pendingUsername = null;
        socket.write('\r\nUsername: ');
        player.inputMode = 'login_username';
      } else {
        socket.write('Choice (1/2): ');
      }
      break;

    case 'duplicate_verify':
      if (trimmedInput === '') {
        socket.write('Re-enter password to confirm: ');
        return;
      }

      const verifyResult = await verifyPassword(player.authState.pendingUsername, trimmedInput);

      if (verifyResult.success) {
        disablePasswordMode(socket, player);

        // Kick the existing session
        const kickSocket = player.authState.kickTarget;
        const kickPlayer = players.get(kickSocket);

        if (kickSocket && kickPlayer) {
          // Save the kicked player
          if (kickPlayer.isRegistered) {
            savePlayer(kickPlayer, null, true);
          }

          // Notify and disconnect
          kickSocket.write(colorize('\r\n*** Your session has been terminated - logged in from another location ***\r\n', 'red'));
          kickSocket.end();

          // Clean up
          if (kickPlayer.autoSaveTimer) {
            clearInterval(kickPlayer.autoSaveTimer);
          }
          players.delete(kickSocket);

          socket.write(colorize('\r\nExisting session disconnected.\r\n', 'yellow'));
        }

        // Now load and login
        const existingPlayer = loadPlayer(player.authState.pendingUsername);
        if (existingPlayer) {
          Object.assign(player, existingPlayer);
          player.authState = {
            pendingUsername: null,
            pendingPassword: null,
            isPasswordInput: false,
            kickTarget: null
          };

          socket.write(colorize('✓ Login successful!\r\n', 'brightGreen'));
          completePlayerLogin(socket, player, false);
        } else {
          socket.write(colorize('Error loading character data.\r\n', 'red'));
          socket.write('Username: ');
          player.inputMode = 'login_username';
        }
      } else {
        disablePasswordMode(socket, player);
        socket.write(colorize('\r\nPassword incorrect. Returning to login.\r\n', 'red'));
        player.authState.kickTarget = null;
        socket.write('Username: ');
        player.inputMode = 'login_username';
      }
      break;

    // =====================================
    // REGISTRATION FLOW
    // =====================================
    case 'register_username':
      if (trimmedInput === '') {
        socket.write('Choose a username (3-12 letters): ');
        return;
      }

      // Validate name
      if (!isValidPlayerName(trimmedInput)) {
        socket.write(colorize('Invalid username. Use 3-12 letters only (no numbers or spaces).\r\n', 'red'));
        socket.write('Choose a username (3-12 letters): ');
        return;
      }

      const registerName = trimmedInput.charAt(0).toUpperCase() + trimmedInput.slice(1).toLowerCase();

      // Check reserved names
      if (isReservedName(registerName)) {
        socket.write(colorize('That username is reserved. Please choose another.\r\n', 'red'));
        socket.write('Choose a username (3-12 letters): ');
        return;
      }

      // Check if banned
      if (isBanned(registerName)) {
        socket.write(colorize('That name has been banned. Please choose another.\r\n', 'red'));
        socket.write('Choose a username (3-12 letters): ');
        return;
      }

      // Check if account already exists
      if (accountExists(registerName)) {
        socket.write(colorize('An account with that name already exists. Try logging in instead.\r\n', 'yellow'));
        socket.write('Choose a username (3-12 letters): ');
        return;
      }

      // Check if player file exists (would need migration instead)
      if (playerExists(registerName)) {
        socket.write(colorize('A character with that name already exists. Please log in instead.\r\n', 'yellow'));
        showWelcomeBanner(socket);
        socket.write('Do you have an account? (Y/N): ');
        player.inputMode = 'auth_choice';
        return;
      }

      // Store username and ask for password
      player.authState.pendingUsername = registerName;

      // Show admin warning if applicable
      if (isAdmin(registerName)) {
        socket.write(colorize('\r\n*** This is an ADMIN account. Use a strong password (min 10 chars)! ***\r\n', 'brightYellow'));
      }

      socket.write('Choose a password (min 6 characters): ');
      enablePasswordMode(socket, player);
      player.inputMode = 'register_password';
      break;

    case 'register_password':
      if (trimmedInput === '') {
        socket.write('Choose a password (min 6 characters): ');
        return;
      }

      const registerUsername = player.authState.pendingUsername;
      const minLength = isAdmin(registerUsername) ? MIN_ADMIN_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH;

      if (trimmedInput.length < minLength) {
        socket.write(colorize(`Password must be at least ${minLength} characters.\r\n`, 'red'));
        socket.write('Choose a password: ');
        return;
      }

      // Store password for confirmation
      player.authState.pendingPassword = trimmedInput;
      socket.write('Confirm password: ');
      player.inputMode = 'register_confirm';
      break;

    case 'register_confirm':
      if (trimmedInput === '') {
        socket.write('Confirm password: ');
        return;
      }

      if (trimmedInput !== player.authState.pendingPassword) {
        socket.write(colorize('\r\nPasswords do not match. Please try again.\r\n', 'red'));
        socket.write('Choose a password (min 6 characters): ');
        player.authState.pendingPassword = null;
        player.inputMode = 'register_password';
        return;
      }

      disablePasswordMode(socket, player);

      const newUsername = player.authState.pendingUsername;
      const newPassword = player.authState.pendingPassword;

      socket.write(`\r\nCreating account for "${newUsername}"...\r\n`);

      // Create the account
      await createAccount(newUsername, newPassword);

      socket.write(colorize('Account created successfully!\r\n', 'brightGreen'));

      // Set up the new player
      player.name = newUsername;
      player.isNewPlayer = true;
      player.authState = {
        pendingUsername: null,
        pendingPassword: null,
        isPasswordInput: false,
        kickTarget: null
      };

      completePlayerLogin(socket, player, true);
      logActivity(`New account created: ${newUsername}`);
      break;

    // =====================================
    // MIGRATION FLOW (existing player, no account)
    // =====================================
    case 'migrate_password':
      if (trimmedInput === '') {
        socket.write('Password (min 6 characters): ');
        return;
      }

      const migrateUsername = player.authState.pendingUsername;
      const migrateMinLength = isAdmin(migrateUsername) ? MIN_ADMIN_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH;

      if (trimmedInput.length < migrateMinLength) {
        socket.write(colorize(`Password must be at least ${migrateMinLength} characters.\r\n`, 'red'));
        socket.write('Password (min 6 characters): ');
        return;
      }

      player.authState.pendingPassword = trimmedInput;
      socket.write('Confirm password: ');
      player.inputMode = 'migrate_confirm';
      break;

    case 'migrate_confirm':
      if (trimmedInput === '') {
        socket.write('Confirm password: ');
        return;
      }

      if (trimmedInput !== player.authState.pendingPassword) {
        socket.write(colorize('\r\nPasswords do not match. Please try again.\r\n', 'red'));
        socket.write('Password (min 6 characters): ');
        player.authState.pendingPassword = null;
        player.inputMode = 'migrate_password';
        return;
      }

      disablePasswordMode(socket, player);

      const migrateName = player.authState.pendingUsername;
      const migratePass = player.authState.pendingPassword;

      // Create account for existing player
      await migrateExistingPlayer(migrateName, migratePass);

      socket.write(colorize('\r\n✓ Account secured!\r\n', 'brightGreen'));

      // Load and complete login
      const migratedPlayer = loadPlayer(migrateName);
      if (migratedPlayer) {
        Object.assign(player, migratedPlayer);
        player.authState = {
          pendingUsername: null,
          pendingPassword: null,
          isPasswordInput: false,
          kickTarget: null
        };

        completePlayerLogin(socket, player, false);
        logActivity(`Account migrated: ${migrateName}`);
      } else {
        socket.write(colorize('Error loading character data.\r\n', 'red'));
        socket.end();
      }
      break;

    // =====================================
    // FORCED PASSWORD CHANGE
    // =====================================
    case 'force_password_change':
      if (trimmedInput === '') {
        socket.write('New password (min 6 characters): ');
        return;
      }

      const forceMinLength = isAdmin(player.name) ? MIN_ADMIN_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH;

      if (trimmedInput.length < forceMinLength) {
        socket.write(colorize(`Password must be at least ${forceMinLength} characters.\r\n`, 'red'));
        socket.write('New password: ');
        return;
      }

      player.authState.pendingPassword = trimmedInput;
      socket.write('Confirm new password: ');
      player.inputMode = 'force_password_confirm';
      break;

    case 'force_password_confirm':
      if (trimmedInput === '') {
        socket.write('Confirm new password: ');
        return;
      }

      if (trimmedInput !== player.authState.pendingPassword) {
        socket.write(colorize('\r\nPasswords do not match. Please try again.\r\n', 'red'));
        socket.write('New password (min 6 characters): ');
        player.authState.pendingPassword = null;
        player.inputMode = 'force_password_change';
        return;
      }

      disablePasswordMode(socket, player);

      await changePassword(player.name, trimmedInput);

      socket.write(colorize('\r\n✓ Password changed successfully!\r\n', 'brightGreen'));

      player.authState = {
        pendingUsername: null,
        pendingPassword: null,
        isPasswordInput: false,
        kickTarget: null
      };

      completePlayerLogin(socket, player, false);
      break;

    // =====================================
    // IN-GAME PASSWORD CHANGE
    // =====================================
    case 'password_verify_old':
      if (trimmedInput === '') {
        socket.write('Enter current password: ');
        return;
      }

      // Verify current password
      const verifyOldResult = await verifyPassword(player.name, trimmedInput);

      if (verifyOldResult.success) {
        socket.write('Enter new password (min 6 characters): ');
        player.inputMode = 'password_new';
      } else {
        disablePasswordMode(socket, player);
        socket.write(colorize('\r\nIncorrect password. Password change cancelled.\r\n', 'red'));
        player.inputMode = 'command';
        socket.write('> ');
      }
      break;

    case 'password_new':
      if (trimmedInput === '') {
        socket.write('Enter new password (min 6 characters): ');
        return;
      }

      const pwMinLength = isAdmin(player.name) ? MIN_ADMIN_PASSWORD_LENGTH : MIN_PASSWORD_LENGTH;

      if (trimmedInput.length < pwMinLength) {
        socket.write(colorize(`Password must be at least ${pwMinLength} characters.\r\n`, 'red'));
        socket.write('Enter new password: ');
        return;
      }

      player.authState.pendingPassword = trimmedInput;
      socket.write('Confirm new password: ');
      player.inputMode = 'password_confirm';
      break;

    case 'password_confirm':
      if (trimmedInput === '') {
        socket.write('Confirm new password: ');
        return;
      }

      if (trimmedInput !== player.authState.pendingPassword) {
        socket.write(colorize('\r\nPasswords do not match. Please try again.\r\n', 'red'));
        socket.write('Enter new password (min 6 characters): ');
        player.authState.pendingPassword = null;
        player.inputMode = 'password_new';
        return;
      }

      disablePasswordMode(socket, player);

      await changePassword(player.name, trimmedInput);

      socket.write(colorize('\r\n✓ Password changed successfully!\r\n', 'brightGreen'));
      player.authState = {
        pendingUsername: null,
        pendingPassword: null,
        isPasswordInput: false,
        kickTarget: null
      };
      player.inputMode = 'command';
      socket.write('> ');
      break;

    default:
      // Unknown state, reset to beginning
      showWelcomeBanner(socket);
      socket.write('Do you have an account? (Y/N): ');
      player.inputMode = 'auth_choice';
  }
}

const server = net.createServer((socket) => {
  // Log new connection
  console.log(`Player connected from ${socket.remoteAddress}:${socket.remotePort}`);

  // Suppress client echo - server will handle all echoing
  suppressClientEcho(socket);

  // Create temporary player object
  const player = createPlayer();

  // Track this player
  players.set(socket, player);

  // Buffer to accumulate characters until Enter is pressed
  let inputBuffer = '';

  // Show welcome banner and initial prompt
  showWelcomeBanner(socket);
  socket.write('Do you have an account? (Y/N): ');

  // Track if we just processed a CR (to ignore following LF)
  let lastWasCR = false;

  // Handle incoming data from player
  socket.on('data', (data) => {
    // Handle password input using raw bytes (completely silent)
    if (player.authState && player.authState.isPasswordInput) {
      // Process byte by byte for password input
      for (let i = 0; i < data.length; i++) {
        const byte = data[i];

        // Skip telnet negotiation sequences (IAC = 255)
        if (byte === 255) {
          i += 2; // Skip IAC + command + option
          continue;
        }

        // Handle CR-LF as single Enter (CR=13, LF=10)
        if (byte === 13) {
          // Carriage Return - mark that we got CR
          lastWasCR = true;
          continue;
        }

        if (byte === 10) {
          // Line Feed
          if (lastWasCR) {
            // This is the LF after CR - process the complete Enter
            lastWasCR = false;
            if (inputBuffer.length > 0) {
              socket.write('\r\n');
              const password = inputBuffer;
              inputBuffer = '';
              handleAuthInput(socket, player, password);
            }
            // If empty password, silently wait for more input
            continue;
          }
          // Standalone LF (some clients)
          if (inputBuffer.length > 0) {
            socket.write('\r\n');
            const password = inputBuffer;
            inputBuffer = '';
            handleAuthInput(socket, player, password);
          }
          continue;
        }

        // If we had a CR but the next char isn't LF, process the CR as Enter
        if (lastWasCR) {
          lastWasCR = false;
          if (inputBuffer.length > 0) {
            socket.write('\r\n');
            const password = inputBuffer;
            inputBuffer = '';
            handleAuthInput(socket, player, password);
          }
          // Continue to process current byte
        }

        // Backspace (DEL=127, BS=8)
        if (byte === 127 || byte === 8) {
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1);
          }
          continue;
        }

        // Only accept printable ASCII (space=32 to tilde=126)
        if (byte >= 32 && byte <= 126) {
          inputBuffer += String.fromCharCode(byte);
          // CRITICAL: No echo at all - complete silence
        }
      }
      return;
    }

    // Reset CR tracking for normal input
    lastWasCR = false;

    // Filter out telnet negotiation sequences from display
    const filteredBytes = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 255 && i + 2 < data.length) {
        i += 2; // Skip IAC + command + option
        continue;
      }
      filteredBytes.push(data[i]);
    }
    const chunk = Buffer.from(filteredBytes).toString();

    // Server-side echo for normal input (more reliable than client echo)
    // Process each character for echo AND buffer management
    for (const char of chunk) {
      const code = char.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        socket.write(char); // Echo printable characters
        inputBuffer += char; // Add to buffer
      } else if (code === 8 || code === 127) {
        // Backspace - remove last character from buffer and echo erase
        if (inputBuffer.length > 0 && !inputBuffer.endsWith('\r') && !inputBuffer.endsWith('\n')) {
          inputBuffer = inputBuffer.slice(0, -1);
          socket.write('\b \b');
        }
      } else if (code === 13) {
        // Carriage return - echo newline and add to buffer for line detection
        socket.write('\r\n');
        inputBuffer += '\r';
      } else if (code === 10) {
        // Line feed - add to buffer for line detection
        inputBuffer += '\n';
      }
    }

    // Check if we have a complete line (user pressed Enter)
    if (inputBuffer.includes('\n')) {
      // Split on newline - might have multiple lines
      const lines = inputBuffer.split('\n');

      // Process all complete lines (all but the last element)
      for (let i = 0; i < lines.length - 1; i++) {
        // Remove \r if present and trim whitespace
        const input = lines[i].replace('\r', '').trim();

        // Handle authentication flow (not authenticated yet)
        if (!player.authenticated) {
          handleAuthInput(socket, player, input);
          continue;
        }

        // Regular command processing
        // Skip empty input
        if (input === '') {
          // During combat, combat is automatic - remind player
          if (player.inCombat) {
            socket.write(colorize('Combat is automatic! Commands: flee, cast <spell>, use <potion>, qs\r\n', 'yellow'));
          }
          socket.write('> ');
          continue;
        }

        // Process the command
        const continueSession = processCommand(socket, player, input);
        if (!continueSession) {
          return; // Player quit
        }

        socket.write('> ');
      }

      // Keep any incomplete line in the buffer
      inputBuffer = lines[lines.length - 1];
    }
  });

  // Handle player disconnect
  socket.on('end', () => {
    // Handle monster combat disconnect
    if (isInMonsterCombat(player)) {
      handleMonsterCombatDisconnect(player);
    }

    // Handle PVP combat disconnect (forfeit loss)
    if (isInPvpCombat(player)) {
      handlePvpDisconnect(player);
    }

    // Save player data before disconnect
    if (player.isRegistered) {
      savePlayer(player, null, true);
      console.log(`Player ${player.name} saved on disconnect`);

      // Broadcast departure (if not already done via quit command)
      broadcastToRoom(player.currentRoom, `${getDisplayName(player)} vanishes in a swirl of mist.`, socket);
      broadcastToAll(colorize(`${getDisplayName(player)} has left the Shattered Realms.`, 'yellow'), socket);
    }

    // Clear auto-save timer
    if (player.autoSaveTimer) {
      clearInterval(player.autoSaveTimer);
    }

    // Exit combat if in combat
    if (player.inCombat) {
      player.inCombat = false;
      player.combatTarget = null;
    }
    players.delete(socket);
    console.log('Player disconnected');
  });

  // Handle connection errors
  socket.on('error', (err) => {
    // Handle monster combat disconnect
    if (isInMonsterCombat(player)) {
      handleMonsterCombatDisconnect(player);
    }

    // Handle PVP combat disconnect (forfeit loss)
    if (isInPvpCombat(player)) {
      handlePvpDisconnect(player);
    }

    // Save player data on error disconnect
    if (player.isRegistered) {
      savePlayer(player, null, true);

      // Broadcast departure
      broadcastToRoom(player.currentRoom, `${getDisplayName(player)} vanishes in a swirl of mist.`, socket);
      broadcastToAll(colorize(`${getDisplayName(player)} has left the Shattered Realms.`, 'yellow'), socket);
    }

    // Clear auto-save timer
    if (player.autoSaveTimer) {
      clearInterval(player.autoSaveTimer);
    }

    if (player.inCombat) {
      player.inCombat = false;
      player.combatTarget = null;
    }
    players.delete(socket);
    console.log(`Connection error: ${err.message}`);
  });
});

// ============================================
// STARTUP
// ============================================

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  // Ensure players directory exists
  ensurePlayersDir();

  // Load bulletin boards
  loadBoards();

  // Initialize monster system
  initializeMonsters();
  startWanderingTimer();

  // Load help topics and pre-build zone map index (Tier 0.3 / 0.5)
  loadHelpData();
  buildZoneMap();
  loadRecipes();

  // Tier 4.1: load clans
  loadClans();
  console.log(`Loaded ${Object.keys(clansData.clans).length} clan(s)`);

  // Start the Wandering Healer NPC
  startHealerWandering();

  // Start mana regeneration timer
  startManaRegenTimer();

  // Start the World Reset Cycle timer
  startCycleTimer();

  // Initialize LLM NPCs + quest system
  try {
    const npcCount = npcRegistry.init();
    // Diagnostic: dump loaded relationships for each NPC
    npcRegistry.all().forEach(n => {
      const rels = Object.entries(n.brain.relationships).map(([k,v]) => `${k}=${v.score}(${v.status})`).join(', ') || '(none)';
      console.log(`[npc.loaded] ${n.id} relationships: ${rels}`);
    });
    const questCount = questManager.init({
      spawnItem: (roomId, item) => {
        if (!rooms[roomId]) return;
        addItemToRoom(roomId, item);
      },
      clearQuestItems: () => {
        // roomItems are already cleared during world reset; this is a no-op here
        // but provided for completeness if reset order changes.
      }
    });
    console.log(`NPCs loaded: ${npcCount}`);
    console.log(`Quests loaded: ${questCount}`);
  } catch (err) {
    console.error(`[npc/quest init] ${err.message}`);
  }

  // Ollama health check (warn-only)
  npcOllama.healthCheck()
    .then(h => {
      if (!h.ok) {
        console.warn(`[ollama] health check failed: ${h.error}. NPC dialogue will fall back to canned lines.`);
      } else if (!h.hasModel) {
        console.warn(`[ollama] model '${h.model}' not found. Available: ${(h.models || []).join(', ') || 'none'}. Run: ollama pull ${h.model}`);
      } else {
        console.log(`[ollama] ready (model: ${h.model})`);
      }
    })
    .catch(err => console.warn(`[ollama] ${err.message}`));

  // Periodic sweep for expired timed quests (every 30s)
  setInterval(() => {
    const failed = questManager.sweepExpired();
    for (const f of failed) {
      // Notify the player if online
      for (const [sock, p] of players) {
        if (p.isRegistered && p.name && p.name.toLowerCase() === f.playerName) {
          sock.write(colorize(`\r\n[Quest FAILED: ${f.def.title} - time expired]\r\n`, 'red'));
        }
      }
      // Record failure on the giver NPC
      if (f.def && f.def.giver && typeof f.def.failureRelationship === 'number') {
        const giver = npcRegistry.getNpc(f.def.giver);
        if (giver) {
          giver.brain.recordInteraction(f.playerName, `failed quest: ${f.def.title}`, f.def.failureRelationship, 3);
          npcRegistry.saveBrain(giver.id);
        }
      }
    }
  }, 30000);

  // Display startup banner
  console.log('');
  console.log('=======================================================');
  console.log('  THE SHATTERED REALMS MUD SERVER');
  console.log('=======================================================');
  console.log('Server Status: ONLINE');
  console.log(`Port: ${PORT}`);
  console.log(`Rooms: ${Object.keys(rooms).length}`);
  console.log(`Items: ${Object.keys(itemData.weapons).length + Object.keys(itemData.armor).length + Object.keys(itemData.shields).length + Object.keys(itemData.consumables).length + Object.keys(itemData.treasure).length}`);
  console.log(`Monsters: ${activeMonsters.length}`);
  console.log('');
  console.log('CONNECTION OPTIONS:');
  console.log('');
  console.log('   Local (this PC):');
  console.log('   -> telnet localhost 8888');
  console.log('');
  console.log('   Local Network (other devices on WiFi):');
  console.log('   -> telnet [YOUR_LOCAL_IP] 8888');
  console.log('   -> Find your IP: ipconfig (Windows) or ifconfig (Mac/Linux)');
  console.log('');
  console.log('   Internet (requires port forwarding or tunnel):');
  console.log('   -> telnet [YOUR_PUBLIC_IP] 8888');
  console.log('   -> Use ngrok for easy testing: ngrok tcp 8888');
  console.log('');
  console.log('=======================================================');
  console.log('World resets every 60 minutes');
  console.log('Players online: 0');
  console.log('=======================================================');
});
