// NpcBrain: per-NPC conversation + memory + relationships + Ollama dialogue.

const ollama = require('../llm/ollama');
const mem = require('./memory');

const SMART_CHARS = {
  '\u2014': '-', '\u2013': '-', '\u2011': '-', '\u2212': '-',
  '\u2018': "'", '\u2019': "'",
  '\u201C': '"', '\u201D': '"',
  '\u2026': '...', '\u00A0': ' '
};
const SMART_RE = new RegExp(Object.keys(SMART_CHARS).join('|'), 'g');
function sanitize(s) {
  return (s || '').replace(SMART_RE, c => SMART_CHARS[c]);
}

function attitudeDirective(status, playerName) {
  switch (status) {
    case 'hostile':
      return `[ATTITUDE: You HATE ${playerName}. They have attacked you before. Be cold, hostile, threatening. Refuse help. Keep replies short and angry. Do NOT pretend to be friendly. Do NOT greet them warmly.]`;
    case 'unfriendly':
      return `[ATTITUDE: You distrust ${playerName}. They have wronged you before. Be terse, suspicious, guarded. Do NOT be warm. Do NOT offer help eagerly. Remind them of past wrongs if relevant.]`;
    case 'allied':
      return `[ATTITUDE: ${playerName} is a trusted ally. Greet warmly, offer help freely.]`;
    case 'friendly':
      return `[ATTITUDE: ${playerName} is a friend. Be warm and helpful.]`;
    default:
      return `[ATTITUDE: ${playerName} is a stranger. Be polite but neutral.]`;
  }
}

class NpcBrain {
  constructor(template) {
    this.id = template.id;
    this.name = template.name;
    this.personality = template.personality || {};
    this.fallbackLines = template.fallbackLines || ['*says nothing*'];
    this.conversationHistory = {};   // playerName -> [{role, content}]
    this.memory = { episodes: [] };
    this.relationships = {};         // playerName -> {score, status, notes}
    this.queue = Promise.resolve();  // per-NPC async lock
    this.dirty = false;
  }

  _resolveKey(map, playerName) {
    if (!playerName) return playerName;
    if (Object.prototype.hasOwnProperty.call(map, playerName)) return playerName;
    const lc = playerName.toLowerCase();
    for (const k of Object.keys(map)) {
      if (k.toLowerCase() === lc) return k;
    }
    return playerName;
  }

  getRelationship(playerName) {
    const key = this._resolveKey(this.relationships, playerName);
    if (!this.relationships[key]) {
      this.relationships[key] = mem.newRelationship();
    }
    return this.relationships[key];
  }

  getHistory(playerName) {
    const key = this._resolveKey(this.conversationHistory, playerName);
    if (!this.conversationHistory[key]) {
      this.conversationHistory[key] = [];
    }
    return this.conversationHistory[key];
  }

  recordInteraction(playerName, action, delta, importance) {
    const rel = this.getRelationship(playerName);
    mem.adjustRelationship(rel, delta || 0, action);
    mem.addEpisode(this.memory.episodes, action, playerName, importance);
    this.dirty = true;
  }

  buildSystemPrompt(playerName, roomCtx, questReady) {
    const p = this.personality;
    const rel = this.getRelationship(playerName);
    const memText = mem.formatMemoriesForPrompt(this.memory.episodes, playerName);
    const notesText = mem.formatNotesForPrompt(rel.notes);

    const lines = [
      `You are ${this.name}, a character in The Shattered Realms - a text MUD ruled by five quarreling Archmages (Nomagio, Zephyros, Morwyn, Valdris, Thessarian). Reality has bugs; the world is glitchy, melancholic, sardonic.`,
      '',
      'Your personality:',
      `- Traits: ${(p.traits || []).join(', ') || 'ordinary'}`,
      `- Mood: ${p.mood || 'neutral'}`,
      `- Goals: ${p.goals || 'survive the next cycle'}`,
      `- Backstory: ${p.backstory || 'unremarkable'}`,
      ''
    ];

    if (roomCtx) {
      lines.push(`Your current location: ${roomCtx.name}`);
      if (roomCtx.shortDescription) lines.push(roomCtx.shortDescription);
      lines.push('');
    }

    lines.push(`The traveler's name is: ${playerName}`);
    lines.push(`Your memories of ${playerName}:`);
    lines.push(memText);
    lines.push('');
    lines.push(`Relationship with ${playerName}: ${rel.status.toUpperCase()} (score ${rel.score} out of range -100 to +100)`);
    lines.push('Recent interactions:');
    lines.push(notesText);
    lines.push('');
    lines.push(attitudeDirective(rel.status, playerName));
    lines.push('');

    if (questReady) {
      lines.push('IMPORTANT: The traveler has completed the task you gave them. Acknowledge this warmly (or begrudgingly if your mood demands it) and reward them.');
      lines.push('');
    }

    lines.push('How you speak:');
    lines.push('- Stay in character. Reply in 1-3 sentences. Use *asterisks* for actions.');
    lines.push('- Match your mood and relationship status. Hostile = cold/threatening. Friendly = warm.');
    lines.push('- Never mention being an AI, language model, or roleplay. You are real within the fiction.');
    lines.push('- If asked about things you cannot know, stay in-world (deflect, invent, or guess).');

    return lines.join('\n');
  }

  async _thinkNow(playerName, message, roomCtx, questReady) {
    const system = this.buildSystemPrompt(playerName, roomCtx, questReady);
    const history = this.getHistory(playerName);
    const rel = this.getRelationship(playerName);
    const reminder = attitudeDirective(rel.status, playerName);
    const messages = [
      { role: 'system', content: system },
      ...mem.recentHistory(history),
      { role: 'system', content: reminder },
      { role: 'user', content: message }
    ];

    let reply;
    try {
      reply = sanitize(await ollama.chat(messages));
    } catch (err) {
      const fallback = this.fallbackLines[Math.floor(Math.random() * this.fallbackLines.length)];
      return { reply: sanitize(fallback), error: err.message, fallback: true };
    }

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    mem.trimHistory(history);
    this.dirty = true;
    return { reply, fallback: false };
  }

  think(playerName, message, roomCtx, questReady) {
    // Serialize per-NPC to prevent history interleaving
    const run = this.queue.then(() => this._thinkNow(playerName, message, roomCtx, questReady));
    this.queue = run.catch(() => {}); // keep chain alive on error
    return run;
  }

  toJSON() {
    return {
      npcId: this.id,
      conversationHistory: this.conversationHistory,
      memory: this.memory,
      relationships: this.relationships
    };
  }

  loadState(state) {
    if (!state) return;
    this.conversationHistory = state.conversationHistory || {};
    this.memory = state.memory || { episodes: [] };
    if (!Array.isArray(this.memory.episodes)) this.memory.episodes = [];
    this.relationships = state.relationships || {};
    this.dirty = false;
  }
}

module.exports = { NpcBrain };
