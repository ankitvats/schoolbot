const assert = require("node:assert/strict");
const path = require("node:path");
const Chatbot = require("../engine/chatbot");
const { createApp, MAX_MESSAGE_LENGTH } = require("../server");

// HTTP-level checks for input validation, limits and headers.
module.exports = async function runHttpTests() {
  const bot = new Chatbot({
    knowledgeDir: path.join(__dirname, "fixtures/knowledge"),
  });
  await bot.init();
  const server = createApp(bot).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const chat = (body, raw) =>
    fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ?? JSON.stringify(body),
    });

  const tests = [
    [
      "Valid chat request returns a reply",
      async () => {
        const res = await chat({ message: "Hello", sessionId: "http_1" });
        assert.equal(res.status, 200);
        assert.equal(typeof (await res.json()).reply, "string");
      },
    ],
    [
      "Security headers are set",
      async () => {
        const res = await fetch(`${base}/`);
        assert.ok(res.headers.get("content-security-policy"));
        assert.equal(res.headers.get("x-content-type-options"), "nosniff");
        assert.equal(res.headers.get("x-powered-by"), null);
      },
    ],
    [
      "Overlong messages are rejected before search",
      async () => {
        const res = await chat({ message: "a".repeat(MAX_MESSAGE_LENGTH + 1) });
        assert.equal(res.status, 400);
      },
    ],
    [
      "Invalid session IDs are rejected",
      async () => {
        for (const sessionId of [123, "", "x".repeat(101), "a b"]) {
          const res = await chat({ message: "Hello", sessionId });
          assert.equal(res.status, 400);
        }
      },
    ],
    [
      "Malformed and oversized bodies return JSON errors",
      async () => {
        const bad = await chat(null, "{not json");
        assert.equal(bad.status, 400);
        assert.ok((await bad.json()).error);
        const big = await chat(
          null,
          JSON.stringify({ message: "a".repeat(20000) }),
        );
        assert.equal(big.status, 413);
      },
    ],
    [
      "Clients are rate limited",
      async () => {
        let limited = false;
        for (let i = 0; i < 40 && !limited; i++)
          limited = (await chat({ message: "Hello" })).status === 429;
        assert.ok(limited);
      },
    ],
  ];

  const failures = [];
  try {
    for (const [name, run] of tests) {
      try {
        await run();
        process.stdout.write("\x1b[32m✓\x1b[0m");
      } catch (error) {
        process.stdout.write("\x1b[31m✗\x1b[0m");
        failures.push({ question: name, missing: [], reply: error.message });
      }
    }
  } finally {
    server.close();
  }
  return {
    total: tests.length,
    passed: tests.length - failures.length,
    failures,
  };
};
