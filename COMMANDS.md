# The Shattered Realms MUD — Complete Command Reference

Every command the server recognizes, grouped by category. Aliases are listed together, separated by `/`.

---

## Table of Contents
1. [Core & Session](#core--session)
2. [Movement](#movement)
3. [Looking & Display](#looking--display)
4. [Combat](#combat)
5. [Inventory & Items](#inventory--items)
6. [Equipment](#equipment)
7. [Consumables](#consumables)
8. [Experience & Status](#experience--status)
9. [Spells & Magic](#spells--magic)
10. [NPCs & Dialogue (LLM)](#npcs--dialogue-llm)
11. [Quests](#quests)
12. [Healing Services](#healing-services)
13. [Communication](#communication)
14. [Social & Presence](#social--presence)
15. [World Reset / Cycle](#world-reset--cycle)
16. [PVP](#pvp)
17. [World Info](#world-info)
18. [Admin — Server](#admin--server)
19. [Admin — Players](#admin--players)
20. [Admin — Characters](#admin--characters)
21. [Admin — Communication](#admin--communication)
22. [Admin — World & Spawning](#admin--world--spawning)
23. [Admin — Cycle Control](#admin--cycle-control)
24. [Admin — Testing / Debug](#admin--testing--debug)
25. [Admin — Moderation](#admin--moderation)
26. [Admin — Admin Management](#admin--admin-management)
27. [Admin — NPC & Quest (new)](#admin--npc--quest-new)
28. [Admin — Help](#admin--help)

---

## Core & Session

| Command | Description |
|---|---|
| `quit` | Disconnect. Auto-saves your character, shows session summary, broadcasts departure. |
| `save` | Manually save your character progress. |
| `password` / `changepassword` / `passwd` | Change your account password. |

---

## Movement

Directions can be used raw (`north`) or with `go`.

| Command | Description |
|---|---|
| `north` / `n` | Move north. |
| `south` / `s` | Move south. |
| `east` / `e` | Move east. |
| `west` / `w` | Move west. |
| `northeast` / `ne` | Move northeast. |
| `northwest` / `nw` | Move northwest. |
| `southeast` / `se` | Move southeast. |
| `southwest` / `sw` | Move southwest. |
| `up` / `u` | Move up. |
| `down` / `d` | Move down. |
| `in` / `enter` / `inside` | Move in. |
| `out` / `exit` / `outside` / `leave` | Move out. |
| `go <direction>` | Same as above in verbose form. |

Movement is blocked during combat (use `flee`).

---

## Looking & Display

| Command | Description |
|---|---|
| `look` / `l` | Show current room (respects your display mode). |
| `brief` | Switch to brief display (room name + exits only). |
| `verbose` | Switch to verbose display (full room description). |
| `examine <item>` / `inspect <item>` / `look at <item>` | Inspect an item's stats/description. |

---

## Combat

Combat is automatic real-time (3s rounds). Use the commands below while engaged.

| Command | Description |
|---|---|
| `attack <target>` / `kill <target>` / `k <target>` | Start combat with a monster or player. Also usable against LLM NPCs (hostile act → relationship drops to hostile). |
| `a` / `attack` / `kill` / `k` | Shows attack usage help. |
| `flee` / `run` / `escape` | Attempt to flee combat (60% success, XP/gold penalty). |

**Usable during combat:** `flee`, `qs`, `score`, `look` / `l`, `spells`, `cast <spell>`, `use <item>`, `drink <item>`, `eat <item>`, `consume <item>`.

---

## Inventory & Items

| Command | Description |
|---|---|
| `inventory` / `inv` / `i` | View your inventory + gold. |
| `get <item>` / `take <item>` / `pick up <item>` | Pick up an item from the current room. |
| `drop <item>` | Drop an item from your inventory. |
| `give <item> <player>` | Give an item to another player. |
| `give <item> <npc>` | Give an item to an LLM NPC (+10 relationship, episodic memory). |
| `give <amount> gold <npc>` | Give gold to an NPC (used for `feed_the_void` quest). |
| `examine <item>` / `inspect <item>` | Inspect item details. |

---

## Equipment

| Command | Description |
|---|---|
| `equipment` / `eq` / `gear` | View your equipped items (weapon, armor, shield). |
| `equip <item>` / `wear <item>` / `wield <item>` | Equip an item from inventory. |
| `unequip <slot>` / `remove <slot>` | Remove an equipped item (slots: `weapon`, `armor`, `shield`). |

---

## Consumables

| Command | Description |
|---|---|
| `use <item>` | Use a consumable (potion, scroll, etc.). |
| `drink <item>` | Drink a potion. |
| `eat <item>` | Eat food. |
| `consume <item>` | Generic consume. |

---

## Experience & Status

| Command | Description |
|---|---|
| `stats` / `score` / `st` | Full stats + session/cycle statistics. |
| `qs` / `quickscore` | Compact one-line status (works in combat). |
| `score <target>` | Analyze a player (priority) or monster in the current room. |
| `levels` / `lvls` | View the 15-level progression table. |

---

## Spells & Magic

| Command | Description |
|---|---|
| `spells` / `spellbook` / `spell list` | View spells available at your level. |
| `spells <school>` | List spells of a specific school (`malefic`, `theft`, `divination`, `combat`, `protection`, `utility`). |
| `cast <spell> [target]` | Cast a spell. Targeting optional for buffs/heals. |
| `accept summon` / `accept` | Accept an incoming `summon_player` request. |

### Full Spell List (by school)

**Malefic (damage):**
- `magic_missile` — Lv1, 5 mana, 8–15 dmg
- `fireball` — Lv3, 15 mana, 20–35 dmg
- `lightning_bolt` — Lv5, 20 mana, 30–50 dmg
- `ice_storm` — Lv7, 30 mana, 40–65 dmg
- `disintegrate` — Lv10, 50 mana, 60–100 dmg
- `meteor_swarm` — Lv13, 80 mana, 90–150 dmg

**Theft (drain/steal):**
- `drain_life` — Lv2, 12 mana, 10–20 dmg + heal 50%
- `mana_drain` — Lv4, 8 mana, drains 15–30 mana (PvP)
- `steal_strength` — Lv6, 20 mana, debuff target
- `soul_siphon` — Lv9, 35 mana, 25–40 dmg + heal + mana

**Divination (info/buff):**
- `detect_invisible` — Lv2, 10 mana, see invis 2 min
- `reveal_weakness` — Lv3, 8 mana, inspect target
- `foresight` — Lv6, 25 mana, +25% dodge 45s
- `true_sight` — Lv8, 40 mana, see invis + crit buff

**Combat (physical buff):**
- `battle_cry` — Lv1, 10 mana, +25% dmg 20s
- `berserker_rage` — Lv4, 15 mana, +50% dmg / +25% taken
- `blade_storm` — Lv6, 25 mana, multi-hit
- `executioner` — Lv8, 30 mana, bonus to wounded
- `avatar_of_war` — Lv12, 60 mana, +75% dmg / +30 armor

**Protection (defense):**
- `minor_ward` — Lv1, 8 mana, 20 shield
- `stone_skin` — Lv4, 20 mana, 25% DR 60s
- `arcane_barrier` — Lv7, 35 mana, 60 shield
- `reflect_magic` — Lv9, 30 mana, 50% reflect
- `divine_protection` — Lv11, 50 mana, INVULNERABLE 15s

**Utility (heal/teleport):**
- `minor_heal` — Lv1, 10 mana, heal 15–25
- `cure_wounds` — Lv5, 25 mana, heal 40–60
- `restoration` — Lv9, 45 mana, heal 80–120
- `recall` — Lv3, 20 mana, teleport to room_001
- `sanctuary` — Lv6, 35 mana, teleport to nearest chapel
- `summon_player` — Lv8, 40 mana, summon another player

---

## NPCs & Dialogue (LLM)

NPCs are powered by Ollama/phi3 and remember you across cycles and server restarts.

| Command | Description |
|---|---|
| `talk <npc> <message>` | Speak to an NPC. They reply in-character based on personality, mood, memory, and relationship score. |
| `give <item> <npc>` | Hand over an item (+10 relationship, episodic memory). |
| `give <amount> gold <npc>` | Hand over gold (relationship scales with amount). |
| `attack <npc>` | Hostile act — relationship drops −20 to hostile; active quests from that NPC fail. |

**Current NPCs:**
- **Nomagio's Apprentice** — room_002 (Obsidian Ledge) — gives `flickering_rune`
- **The Obsidian Scribe** — room_058 (Boundless Archive) — gives `silenced_whisper`
- **Thessarian's Clockwatcher** — room_088 (Galactic Observatory) — gives `wind_the_clock`
- **The Void Merchant** — room_078 (Vacant Chamber) — gives `feed_the_void`
- **Mystic Healer** — wandering — existing healing NPC, now with LLM flavor

---

## Quests

Quests reset every world cycle (1 hour). Quest items respawn. **NPC memory persists.**

| Command | Description |
|---|---|
| `quests` / `quest` / `journal` / `j` | Show active + completed-this-cycle quests, plus quests available in your current room. |
| `accept <quest_id>` | Accept a quest (you must be in the same room as the giver). |
| `abandon <quest_id>` | Abandon a quest (−5 relationship with giver). |

**Current quests:**
- `flickering_rune` — retrieve an item from room_015
- `silenced_whisper` — kill a Bookworm in the Ethereal Library
- `wind_the_clock` — visit 3 observatory rooms in 15 min
- `feed_the_void` — give 200 gold to the Void Merchant

Completing a quest: return to the giver and `talk <npc>` — the system auto-detects and awards rewards.

---

## Healing Services

| Command | Description |
|---|---|
| `pray` | Heal at a chapel (room_001, room_020, room_050, room_062, room_090). 5-minute cooldown. |
| `chapels` / `chapel list` / `find chapel` | List all chapel locations. |
| `ask healer` / `ask healer for healing` / `heal with healer` | Request healing from the wandering Mystic Healer (50g, free if HP < 25%). |

---

## Communication

| Command | Description |
|---|---|
| `say <msg>` / `' <msg>` | Speak locally in the current room. |
| `shout <msg>` / `! <msg>` | Global chat to all players. |
| `tell <player> <msg>` / `whisper <player> <msg>` | Private message. |
| `emote <action>` / `: <action>` | Roleplay action in current room. |

---

## Social & Presence

| Command | Description |
|---|---|
| `who` / `players` / `online` | List all online players. |
| `whois <player>` / `finger <player>` | Detailed info on a player. |
| `mysuffix` / `mytitle` / `title` / `suffix` | View your custom title/suffix (set by admins). |
| `afk [message]` | Set AFK status with optional message. |
| `back` | Return from AFK. |
| `ignore <player>` | Block messages from a player. |
| `ignore` | View your ignore list. |
| `unignore <player>` | Remove a player from ignore. |

---

## World Reset / Cycle

| Command | Description |
|---|---|
| `time` / `reset_timer` / `timer` | Show time remaining until next world reset. |
| `cycle_stats` / `cyclestats` / `cycle` | Your performance this cycle (XP/kills/gold/bosses). |
| `leaderboard` / `leaders` / `top` | View the current cycle's champions. |

---

## PVP

| Command | Description |
|---|---|
| `pvp` / `pvp status` | Show your PVP state. |
| `pvp on` | Enable PVP. |
| `pvp off` | Disable PVP (5-minute cooldown once enabled). |
| `attack <player>` | Start automatic PVP combat (PVP must be on for both; no chapels, level-diff limit). |
| `surrender` / `give up` / `yield` | Forfeit current PVP combat. |

**Usable during PVP combat:** `flee`, `surrender`, `qs`, `score`, `look`, `spells`, `cast <spell>`, `use <item>`, `drink <item>`, `eat <item>`, `consume <item>`.

---

## World Info

| Command | Description |
|---|---|
| `monsters` / `monsterlist` | List all active monsters in the world. |
| `spawns` | Show spawn statistics by zone. |

---

## Admin — Server

Admin commands require your name to be in `admins.json`.

| Command | Description |
|---|---|
| `admin status` / `serverstatus` / `adminstatus` | Server uptime, memory, activity log. |
| `shutdown [message]` | Graceful 10-second shutdown with auto-save. |
| `save_all` / `saveall` | Force-save every online player. |
| `reload_monsters` / `reloadmonsters` / `reset_monsters` / `resetmonsters` | Reset all monster spawns. |

---

## Admin — Players

| Command | Description |
|---|---|
| `kick <player> [reason]` | Disconnect a player. |
| `goto <player>` | Teleport yourself to a player. |
| `bring <player>` | Summon a player to you. |
| `send <player> <room_id>` | Teleport a player to a specific room. |
| `list_players` / `adminwho` / `listplayers` | Admin view of all players (HP, IP, time online). |
| `transurf [room_id]` | Teleport yourself to any room (admin-only master teleport). |

---

## Admin — Characters

| Command | Description |
|---|---|
| `set_level <player> <1-15>` / `setlevel ...` | Set a player's level. |
| `give_exp <player> <amount>` / `giveexp` / `givexp` | Grant XP. |
| `give_item <player> <item>` / `giveitem ...` | Add an item to player's inventory. |
| `give_gold <player> <amount>` / `givegold ...` | Add gold to player. |
| `heal <player>` | Restore a player to full HP. |
| `heal_all` / `healall` | Restore all online players. |
| `revive <player>` | Revive a dead player at their current location. |
| `suffix <player> <suffix>` | Set a player's display suffix (max 30 chars). |
| `suffix <player> clear` | Remove suffix. |

---

## Admin — Communication

| Command | Description |
|---|---|
| `broadcast <msg>` / `announce <msg>` | Global admin announcement. |
| `god_say <msg>` / `godsay <msg>` | Speak with divine authority. |
| `invisible` / `invis` | Toggle admin invisibility (hidden from who/room, movement silent). |

---

## Admin — World & Spawning

| Command | Description |
|---|---|
| `spawn <monster> <room_id>` | Spawn a monster in a specific room. |
| `monster_types` / `monstertypes` / `mtypes` | List all monster template IDs. |
| `despawn <monster_id>` | Remove a specific monster instance by its ID. |
| `create_item <item> <room_id>` / `createitem ...` | Place an item in a room. |
| `modify_room <room_id> <property> <value>` / `modifyroom ...` | Temporary room modification. |

---

## Admin — Cycle Control

| Command | Description |
|---|---|
| `force_reset` / `forcereset` | Trigger an immediate world reset. |
| `set_reset_timer <minutes>` / `setresettimer <minutes>` | Adjust time until next reset. |
| `disable_reset` / `disablereset` | Disable the world reset cycle. |
| `enable_reset` / `enablereset` | Re-enable the world reset cycle. |

---

## Admin — Testing / Debug

| Command | Description |
|---|---|
| `test_combat` / `testcombat` | Spawn a weak test monster at your location. |
| `test_loot` / `testloot` | Drop test items at your location. |
| `god_mode` / `godmode` | Toggle invincibility. |
| `zap <player>` | Instantly kill a player (admin strike). |
| `teleport_all <room_id>` / `teleportall <room_id>` | Move all players to a room. |
| `admin_score <player>` / `adminscore <player>` | Complete data dump for a player. |
| `logs [lines]` | Show recent server activity log. |

---

## Admin — Moderation

| Command | Description |
|---|---|
| `ban <player>` | Ban a player (kicks if online, blocks reconnect). |
| `unban <player>` | Remove a ban. |
| `banlist` / `bans` | Show banned players. |
| `reset_password <player>` / `resetpassword <player>` | Reset a player's account password. |

---

## Admin — Admin Management

| Command | Description |
|---|---|
| `promote_admin <player>` / `promoteadmin <player>` / `promote <player>` | Grant admin privileges. |
| `demote_admin <player>` / `demoteadmin <player>` / `demote <player>` | Revoke admin privileges. |
| `adminlist` / `admins` | List all admins. |

---

## Admin — NPC & Quest (new)

Added with the Ollama-powered NPC system.

| Command | Description |
|---|---|
| `npc_list` / `npclist` / `npcs` | List all active NPCs with location, relationship count, and episode count. |
| `npc_reload` / `npcreload` | Reload NPC templates from disk (brains preserved). |
| `npc_spawn <id> <room_id>` | Spawn an NPC (from templates.json) in a specific room. |
| `npc_despawn <id>` | Remove an active NPC. |
| `npc_forget <npc_id> <player_name>` | Wipe one NPC's memory/relationship/history for a specific player. |
| `quest_list` / `questlist` | List all quest definitions. |
| `quest_give <player> <quest_id>` | Grant a quest to a player directly (bypasses giver proximity). |

---

## Admin — Help

| Command | Description |
|---|---|
| `admin` / `admin_help` / `adminhelp` | Show the categorized admin command list. |
| `admin <command>` | Detailed help for a specific admin command. |

---

## Notes & Tips

- **Case-insensitive**: all commands are lowercased before parsing.
- **Partial name matching**: `attack drag` will target a Crystal Dragon if present; `talk appren` matches Nomagio's Apprentice.
- **Aliases**: most common commands have short forms (`i`, `l`, `k`, `eq`, `qs`, `j`).
- **Combat locks**: movement, item management, and `pray` are blocked while in combat — use `flee` first.
- **Automatic combat rounds** happen every 3 seconds (monster) / 2 seconds (PVP). You don't need to retype `attack`.
- **AFK auto-clears** on any movement.
- **Unknown commands** trigger a short hint listing common commands.

---

*Generated from `mud_server.js` command dispatcher. If a command is missing from this doc, it may have been added after the last update — check the `processCommand` function.*
