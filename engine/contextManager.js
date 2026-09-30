const { normalizeQuery, extractClass } = require("./query");

const SESSION_TTL = 60 * 60 * 1000;
const MAX_SESSIONS = 10000;

class ContextManager {
  constructor({ maxSessions = MAX_SESSIONS } = {}) {
    this.sessions = new Map(); // sessionId -> context, oldest first
    this.maxSessions = maxSessions;
  }

  getContext(sessionId) {
    let ctx = this.sessions.get(sessionId);
    if (ctx) {
      // Re-insert so Map order stays least-recently-used first.
      this.sessions.delete(sessionId);
    } else {
      ctx = {
        lastCategory: null,
        lastClass: null,
        lastQuery: null,
        pendingTopic: null,
        history: [], // last N messages
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      // Session IDs come from clients, so the table must stay bounded.
      while (this.sessions.size >= this.maxSessions)
        this.sessions.delete(this.sessions.keys().next().value);
    }
    this.sessions.set(sessionId, ctx);
    return ctx;
  }

  update(sessionId, { entities, category, query, pendingTopic }) {
    const ctx = this.getContext(sessionId);
    ctx.updatedAt = Date.now();
    if (pendingTopic !== undefined) ctx.pendingTopic = pendingTopic;
    if (query !== undefined) ctx.lastQuery = query;
    if (category !== undefined) ctx.lastCategory = category;
    if (entities?.classes) ctx.lastClass = entities.classes;
  }

  addToHistory(sessionId, role, message) {
    const ctx = this.getContext(sessionId);
    ctx.history.push({ role, message, timestamp: Date.now() });
    ctx.history = ctx.history.slice(-10);
    ctx.updatedAt = Date.now();
  }

  // Enrich a query with context for better search
  enrichQuery(sessionId, query) {
    const ctx = this.getContext(sessionId);
    let enriched = normalizeQuery(query);
    const selectedClass = extractClass(enriched);
    const classOnly =
      /^(?:(?:and|also|what about|for|how about)\s+)*(?:class\s*)?\d{1,2}[?.! ]*$/.test(
        enriched,
      ) ||
      /^(?:(?:and|also|what about|for)\s+)*(?:pre[- ]nursery|nursery|lkg|ukg)[?.! ]*$/.test(
        enriched,
      );
    if (classOnly && (ctx.pendingTopic || ctx.lastQuery)) {
      const topic =
        ctx.pendingTopic ||
        ctx.lastQuery
          .replace(/\bclass\s*\d{1,2}\b/g, "")
          .replace(/\b(?:pre[- ]nursery|nursery|lkg|ukg)\b/g, "");
      const value = selectedClass || enriched.match(/\d{1,2}/)?.[0];
      enriched = `${topic} ${/^\d+$/.test(value) ? "class " : ""}${value}`;
    } else if (
      /\b(?:it|that|those|them|same class)\b/.test(enriched) &&
      ctx.lastCategory
    ) {
      enriched += ` ${ctx.lastCategory}`;
      if (ctx.lastClass && !selectedClass)
        enriched += ` ${/^\d+$/.test(ctx.lastClass) ? "class " : ""}${ctx.lastClass}`;
    }
    // Related topic changes retain the class, not the previous question.
    if (
      !extractClass(enriched) &&
      ctx.lastClass &&
      /\b(?:fees|subjects|documents|eligibility|age criteria)\b/.test(enriched)
    ) {
      enriched += ` ${/^\d+$/.test(ctx.lastClass) ? "class " : ""}${ctx.lastClass}`;
    }
    return enriched;
  }

  // Clean up sessions idle for more than an hour
  cleanup() {
    const now = Date.now();
    for (const [id, ctx] of this.sessions) {
      if (now - ctx.updatedAt > SESSION_TTL) {
        this.sessions.delete(id);
      }
    }
  }
}

module.exports = ContextManager;
