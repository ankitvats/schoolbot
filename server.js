const express = require("express");
const path = require("path");
const Chatbot = require("./engine/chatbot");

const PORT = process.env.PORT || 3000;
const MAX_MESSAGE_LENGTH = 500;
const SESSION_ID = /^[\w-]{1,100}$/;
const RATE_LIMIT = { windowMs: 60 * 1000, max: 30 };

function createApp(chatbot) {
  const app = express();
  app.disable("x-powered-by");
  // Behind a reverse proxy, set TRUST_PROXY (e.g. 1) so rate limits use client IPs.
  if (process.env.TRUST_PROXY)
    app.set(
      "trust proxy",
      Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY,
    );

  app.use((req, res, next) => {
    res.set({
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    next();
  });
  app.use(express.json({ limit: "10kb" }));
  app.use(express.static(path.join(__dirname, "public")));

  // Search runs on the main thread, so limit how often one client can use it.
  const hits = new Map(); // ip -> { count, resetAt }
  const rateLimit = (req, res, next) => {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || entry.resetAt <= now) {
      if (hits.size > 10000) {
        for (const [ip, value] of hits)
          if (value.resetAt <= now) hits.delete(ip);
      }
      entry = { count: 0, resetAt: now + RATE_LIMIT.windowMs };
      hits.set(req.ip, entry);
    }
    if (++entry.count > RATE_LIMIT.max) {
      res.set("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      return res
        .status(429)
        .json({ error: "Too many messages. Please wait a moment." });
    }
    next();
  };

  app.post("/api/chat", rateLimit, async (req, res) => {
    try {
      const { message, sessionId } = req.body || {};

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }
      if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({
          error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`,
        });
      }
      if (
        sessionId !== undefined &&
        (typeof sessionId !== "string" || !SESSION_ID.test(sessionId))
      ) {
        return res.status(400).json({ error: "Invalid session ID" });
      }

      const response = await chatbot.getResponse(
        message,
        sessionId || "default",
      );
      res.json(response);
    } catch (err) {
      console.error("Chat error:", err);
      res
        .status(500)
        .json({ error: "Something went wrong. Please try again." });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
    });
  });

  // Malformed or oversized JSON bodies get a JSON error, not an HTML stack page.
  app.use((err, req, res, next) => {
    if (err.type === "entity.too.large")
      return res.status(413).json({ error: "Request is too large" });
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid JSON" });
    next(err);
  });

  return app;
}

async function start() {
  const chatbot = new Chatbot();
  await chatbot.init();
  const server = createApp(chatbot).listen(PORT, () => {
    console.log(`\n🎓 School Chatbot running at http://localhost:${PORT}\n`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });
}

module.exports = { createApp, MAX_MESSAGE_LENGTH };
