// Memory & relationship helpers for NPC brains.

const MAX_EPISODES = 100;
const MAX_NOTES = 20;
const MAX_HISTORY_TURNS = 20; // per player (user+assistant counted as 2)
const PROMPT_HISTORY_TURNS = 6;

function scoreToStatus(score) {
  if (score >= 75) return 'allied';
  if (score >= 25) return 'friendly';
  if (score >= -25) return 'neutral';
  if (score >= -75) return 'unfriendly';
  return 'hostile';
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function newRelationship() {
  return { score: 0, status: 'neutral', notes: [] };
}

function adjustRelationship(rel, delta, reason) {
  rel.score = clamp((rel.score || 0) + delta, -100, 100);
  rel.status = scoreToStatus(rel.score);
  rel.notes = rel.notes || [];
  rel.notes.push({
    action: reason,
    delta,
    ts: new Date().toISOString()
  });
  if (rel.notes.length > MAX_NOTES) {
    rel.notes.splice(0, rel.notes.length - MAX_NOTES);
  }
  return rel;
}

function addEpisode(episodes, event, playerName, importance) {
  episodes.push({
    event,
    playerName: playerName || null,
    importance: clamp(importance || 1, 1, 5),
    ts: new Date().toISOString()
  });
  if (episodes.length > MAX_EPISODES) {
    episodes.splice(0, episodes.length - MAX_EPISODES);
  }
}

function formatRelativeTime(tsIso) {
  const diffMs = Date.now() - new Date(tsIso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatMemoriesForPrompt(episodes, playerName) {
  if (!episodes || episodes.length === 0) return '(no memories yet)';
  const about = episodes
    .filter(e => e.playerName === playerName)
    .slice(-5);
  const important = episodes
    .filter(e => e.importance >= 4 && e.playerName !== playerName)
    .slice(-3);
  const combined = [...about, ...important];
  if (combined.length === 0) return '(no memories of this traveler)';
  return combined
    .map(e => `- (${formatRelativeTime(e.ts)}) ${e.event}`)
    .join('\n');
}

function formatNotesForPrompt(notes) {
  if (!notes || notes.length === 0) return '(no prior interactions)';
  return notes
    .slice(-3)
    .map(n => `- ${n.action} (${n.delta > 0 ? '+' : ''}${n.delta})`)
    .join('\n');
}

function trimHistory(history) {
  const maxMsgs = MAX_HISTORY_TURNS * 2;
  if (history.length > maxMsgs) history.splice(0, history.length - maxMsgs);
  return history;
}

function recentHistory(history) {
  return history.slice(-PROMPT_HISTORY_TURNS * 2);
}

module.exports = {
  scoreToStatus,
  newRelationship,
  adjustRelationship,
  addEpisode,
  formatMemoriesForPrompt,
  formatNotesForPrompt,
  trimHistory,
  recentHistory,
  MAX_EPISODES,
  MAX_HISTORY_TURNS,
  PROMPT_HISTORY_TURNS
};
