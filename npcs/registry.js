// NPC registry: loads templates, builds NpcInstances with brains, handles persistence.

const fs = require('fs');
const path = require('path');
const { NpcBrain } = require('./brain');

const TEMPLATES_PATH = path.join(__dirname, 'templates.json');
const BRAINS_DIR = path.join(__dirname, 'brains');

class NpcInstance {
  constructor(template) {
    this.id = template.id;
    this.name = template.name;
    this.shortName = template.shortName || template.id;
    this.aliases = (template.aliases || []).map(a => a.toLowerCase());
    this.currentRoom = template.homeRoom;
    this.homeRoom = template.homeRoom;
    this.wanders = !!template.wanders;
    this.questsOffered = template.questsOffered || [];
    this.brain = new NpcBrain(template);
    this.template = template;
  }

  matches(name) {
    const q = (name || '').toLowerCase().trim();
    if (!q) return false;
    if (this.name.toLowerCase() === q) return true;
    if (this.shortName.toLowerCase() === q) return true;
    if (this.aliases.includes(q)) return true;
    // partial match against full name words
    const words = this.name.toLowerCase().split(/\s+/);
    return words.some(w => w === q || w.startsWith(q));
  }
}

const activeNpcs = new Map();   // id -> NpcInstance
let templates = {};

function ensureBrainsDir() {
  if (!fs.existsSync(BRAINS_DIR)) fs.mkdirSync(BRAINS_DIR, { recursive: true });
}

function brainPath(id) {
  return path.join(BRAINS_DIR, `${id}.json`);
}

function loadBrain(id) {
  const p = brainPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error(`[npc] failed to parse brain ${id}: ${err.message}`);
    return null;
  }
}

function saveBrain(id) {
  const npc = activeNpcs.get(id);
  if (!npc) return false;
  ensureBrainsDir();
  const p = brainPath(id);
  const tmp = p + '.tmp';
  try {
    if (fs.existsSync(p)) fs.copyFileSync(p, p + '.bak');
    fs.writeFileSync(tmp, JSON.stringify(npc.brain.toJSON(), null, 2));
    fs.renameSync(tmp, p);
    npc.brain.dirty = false;
    return true;
  } catch (err) {
    console.error(`[npc] failed to save brain ${id}: ${err.message}`);
    return false;
  }
}

function saveAllDirty() {
  let n = 0;
  for (const npc of activeNpcs.values()) {
    if (npc.brain.dirty) {
      if (saveBrain(npc.id)) n++;
    }
  }
  return n;
}

function loadTemplates() {
  const raw = fs.readFileSync(TEMPLATES_PATH, 'utf8');
  templates = JSON.parse(raw);
  return templates;
}

function spawn(id) {
  const tmpl = templates[id];
  if (!tmpl) throw new Error(`unknown NPC template: ${id}`);
  const npc = new NpcInstance(tmpl);
  const state = loadBrain(id);
  if (state) npc.brain.loadState(state);
  activeNpcs.set(id, npc);
  return npc;
}

function despawn(id) {
  const npc = activeNpcs.get(id);
  if (!npc) return false;
  if (npc.brain.dirty) saveBrain(id);
  activeNpcs.delete(id);
  return true;
}

function init() {
  loadTemplates();
  ensureBrainsDir();
  for (const id of Object.keys(templates)) spawn(id);
  return activeNpcs.size;
}

function reload() {
  // Save state, drop instances, reload templates, respawn (preserving brains via disk).
  saveAllDirty();
  activeNpcs.clear();
  return init();
}

function getNpcsInRoom(roomId) {
  const out = [];
  for (const npc of activeNpcs.values()) {
    if (npc.currentRoom === roomId) out.push(npc);
  }
  return out;
}

function findNpcInRoom(roomId, name) {
  for (const npc of activeNpcs.values()) {
    if (npc.currentRoom === roomId && npc.matches(name)) return npc;
  }
  return null;
}

function findNpc(name) {
  for (const npc of activeNpcs.values()) {
    if (npc.matches(name)) return npc;
  }
  return null;
}

function getNpc(id) { return activeNpcs.get(id); }
function all() { return Array.from(activeNpcs.values()); }

function moveNpc(id, roomId) {
  const npc = activeNpcs.get(id);
  if (!npc) return false;
  npc.currentRoom = roomId;
  return true;
}

function forget(id, playerName) {
  const npc = activeNpcs.get(id);
  if (!npc) return false;
  const key = playerName.toLowerCase();
  let found = false;
  for (const k of Object.keys(npc.brain.relationships)) {
    if (k.toLowerCase() === key) { delete npc.brain.relationships[k]; found = true; }
  }
  for (const k of Object.keys(npc.brain.conversationHistory)) {
    if (k.toLowerCase() === key) { delete npc.brain.conversationHistory[k]; found = true; }
  }
  npc.brain.memory.episodes = npc.brain.memory.episodes.filter(
    e => !e.playerName || e.playerName.toLowerCase() !== key
  );
  if (found) {
    npc.brain.dirty = true;
    saveBrain(id);
  }
  return found;
}

module.exports = {
  init, reload, spawn, despawn, moveNpc,
  getNpcsInRoom, findNpcInRoom, findNpc, getNpc, all,
  saveBrain, saveAllDirty, forget,
  activeNpcs
};
