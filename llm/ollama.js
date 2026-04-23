// Ollama HTTP client wrapper.
// Uses Node 18+ native fetch + AbortController.
// No external deps.

const DEFAULT_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'phi3';
const DEFAULT_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '15000', 10);

async function chat(messages, opts = {}) {
  const url = (opts.url || DEFAULT_URL) + '/api/chat';
  const model = opts.model || DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  const body = {
    model,
    messages,
    stream: false,
    options: {
      temperature: opts.temperature ?? 0.8,
      top_p: opts.top_p ?? 0.9,
      num_predict: opts.num_predict ?? 160
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data && data.message && data.message.content;
    if (typeof content !== 'string') {
      throw new Error('Ollama response missing message.content');
    }
    return content.trim();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Ollama timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function healthCheck(opts = {}) {
  const url = (opts.url || DEFAULT_URL) + '/api/tags';
  const timeoutMs = opts.timeoutMs || 3000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    const wantModel = opts.model || DEFAULT_MODEL;
    const hasModel = models.some(m => m === wantModel || m.startsWith(wantModel + ':'));
    return { ok: true, models, hasModel, model: wantModel };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chat, healthCheck, DEFAULT_MODEL, DEFAULT_URL };
