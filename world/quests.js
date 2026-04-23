// QuestManager: cycle-scoped quests for Shattered Realms.
// Quest definitions are static; per-player state is in-memory and cleared on world reset.
// Quest items are respawned via an injected callback at init (and at resetAll).

const fs = require('fs');
const path = require('path');

const QUESTS_PATH = path.join(__dirname, '..', 'quests.json');

let quests = {};                    // id -> definition
let playerQuests = new Map();       // playerName(lower) -> Map<questId, state>
let hooks = {
  spawnItem: null,      // (roomId, item) => void
  clearQuestItems: null // () => void
};

function load() {
  quests = JSON.parse(fs.readFileSync(QUESTS_PATH, 'utf8'));
  return quests;
}

function init(injectedHooks) {
  load();
  hooks = Object.assign(hooks, injectedHooks || {});
  spawnAllQuestItems();
  return Object.keys(quests).length;
}

function getDefinition(questId) { return quests[questId] || null; }
function allDefinitions() { return Object.values(quests); }

function getQuestsOfferedBy(giverId) {
  return Object.values(quests).filter(q => q.giver === giverId);
}

function pkey(name) { return (name || '').toLowerCase(); }

function getPlayerQuests(playerName) {
  const k = pkey(playerName);
  if (!playerQuests.has(k)) playerQuests.set(k, new Map());
  return playerQuests.get(k);
}

function getState(playerName, questId) {
  return getPlayerQuests(playerName).get(questId) || null;
}

function isActive(playerName, questId) {
  const s = getState(playerName, questId);
  return !!(s && s.status === 'active');
}

function listActive(playerName) {
  const out = [];
  for (const s of getPlayerQuests(playerName).values()) {
    if (s.status === 'active') out.push(s);
  }
  return out;
}

function listCompleted(playerName) {
  const out = [];
  for (const s of getPlayerQuests(playerName).values()) {
    if (s.status === 'completed') out.push(s);
  }
  return out;
}

function accept(playerName, questId) {
  const def = quests[questId];
  if (!def) return { ok: false, reason: 'unknown quest' };
  const existing = getState(playerName, questId);
  if (existing && existing.status === 'active') return { ok: false, reason: 'already active' };
  if (existing && existing.status === 'completed') return { ok: false, reason: 'already completed this cycle' };

  const state = {
    questId,
    title: def.title,
    giver: def.giver,
    status: 'active',
    acceptedAt: Date.now(),
    expiresAt: def.timeLimitMs ? Date.now() + def.timeLimitMs : null,
    objectives: def.objectives.map(o => ({
      id: o.id,
      type: o.type,
      targetId: o.targetId || null,
      targetIds: o.targetIds || null,
      required: o.count || 1,
      progress: 0,
      visited: o.type === 'visit_rooms' ? [] : null,
      completed: false
    }))
  };
  getPlayerQuests(playerName).set(questId, state);
  return { ok: true, state, def };
}

function abandon(playerName, questId) {
  const s = getState(playerName, questId);
  if (!s || s.status !== 'active') return { ok: false, reason: 'no active quest' };
  s.status = 'abandoned';
  s.abandonedAt = Date.now();
  return { ok: true, def: quests[questId] };
}

function _checkAllComplete(state) {
  return state.objectives.every(o => o.completed);
}

// Generic progress updater. Returns array of {questId, state, def, justCompleted, newlyComplete}
function updateObjective(playerName, eventType, targetId, amount) {
  const changes = [];
  const qs = getPlayerQuests(playerName);
  for (const state of qs.values()) {
    if (state.status !== 'active') continue;
    // check expiry
    if (state.expiresAt && Date.now() > state.expiresAt) {
      state.status = 'failed';
      state.failedAt = Date.now();
      state.failureReason = 'time expired';
      changes.push({ questId: state.questId, state, def: quests[state.questId], failed: true });
      continue;
    }
    let touched = false;
    for (const obj of state.objectives) {
      if (obj.completed) continue;
      if (obj.type !== eventType) continue;
      if (obj.type === 'visit_rooms') {
        if (!obj.targetIds.includes(targetId)) continue;
        if (!obj.visited.includes(targetId)) {
          obj.visited.push(targetId);
          obj.progress = obj.visited.length;
          touched = true;
          if (obj.progress >= obj.required) obj.completed = true;
        }
      } else {
        if (obj.targetId && obj.targetId !== targetId) continue;
        obj.progress += (amount || 1);
        touched = true;
        if (obj.progress >= obj.required) {
          obj.progress = obj.required;
          obj.completed = true;
        }
      }
    }
    if (touched) {
      const done = _checkAllComplete(state);
      changes.push({ questId: state.questId, state, def: quests[state.questId], readyToTurnIn: done, failed: false });
    }
  }
  return changes;
}

// Called when player returns to giver NPC after all objectives complete.
function turnIn(playerName, questId) {
  const s = getState(playerName, questId);
  if (!s || s.status !== 'active') return { ok: false, reason: 'no active quest' };
  if (!_checkAllComplete(s)) return { ok: false, reason: 'objectives not complete' };
  s.status = 'completed';
  s.completedAt = Date.now();
  return { ok: true, def: quests[questId], state: s };
}

// Check if a player has a turn-in-ready quest for a specific giver
function readyToTurnInFor(playerName, giverId) {
  for (const s of getPlayerQuests(playerName).values()) {
    if (s.status !== 'active') continue;
    if (s.giver !== giverId) continue;
    if (_checkAllComplete(s)) return s;
  }
  return null;
}

// Check for expired quests (call periodically). Returns failed quests.
function sweepExpired() {
  const failed = [];
  for (const [playerNameKey, qs] of playerQuests) {
    for (const s of qs.values()) {
      if (s.status === 'active' && s.expiresAt && Date.now() > s.expiresAt) {
        s.status = 'failed';
        s.failedAt = Date.now();
        s.failureReason = 'time expired';
        failed.push({ playerName: playerNameKey, questId: s.questId, state: s, def: quests[s.questId] });
      }
    }
  }
  return failed;
}

function spawnAllQuestItems() {
  if (!hooks.spawnItem) return;
  for (const def of Object.values(quests)) {
    if (!def.questItems) continue;
    for (const qi of def.questItems) {
      hooks.spawnItem(qi.room, {
        id: qi.id,
        name: qi.name,
        description: qi.description,
        questItem: true,
        questId: def.id
      });
    }
  }
}

// Cycle reset: wipe all per-player quest state, respawn quest items.
function resetAll() {
  playerQuests.clear();
  if (hooks.clearQuestItems) hooks.clearQuestItems();
  spawnAllQuestItems();
}

function giveQuest(playerName, questId) {
  return accept(playerName, questId);
}

module.exports = {
  init, load, resetAll,
  getDefinition, allDefinitions, getQuestsOfferedBy,
  accept, abandon, turnIn, giveQuest,
  getState, isActive, listActive, listCompleted,
  updateObjective, readyToTurnInFor, sweepExpired
};
