const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const Chatbot = require("../engine/chatbot");

// Behavior uses stable synthetic facts, never the deployable school knowledge.
module.exports = async function runSmartTests() {
  const bot = new Chatbot({
    knowledgeDir: path.join(__dirname, "fixtures/knowledge"),
  });
  await bot.init();
  let serial = 0;
  const ask = (question, session = `smart_${serial++}`) =>
    bot.getResponse(question, session);
  const includes = (reply, ...terms) =>
    terms.forEach((term) =>
      assert.ok(
        reply.toLowerCase().includes(term.toLowerCase()),
        `Missing ${term}`,
      ),
    );
  const tests = [
    [
      "Replacing facts changes answers without rewriting intent behavior",
      async () => {
        const principal = bot.knowledgeBase.getSection("Principal");
        const fees = bot.knowledgeBase.getSection("Fee Structure");
        const originalPrincipal = principal.text;
        const originalFees = fees.text;
        try {
          principal.text = "The principal is **Replacement Principal**.";
          fees.text = fees.text.replace("~₹19,900/year", "~₹39,800/year");
          bot.knowledgeBase._buildIndex();
          includes(
            (await ask("Who is the principal?")).reply,
            "Replacement Principal",
          );
          const { reply } = await ask("Annual fees for class 9?");
          includes(reply, "39,800");
          assert.ok(!reply.includes("19,900"));
        } finally {
          principal.text = originalPrincipal;
          fees.text = originalFees;
          bot.knowledgeBase._buildIndex();
        }
      },
    ],
    [
      "Knowledge works without mode configuration across response paths",
      async () => {
        for (const question of [
          "",
          "Hello",
          "Who is the principal?",
          "Boarding fees?",
        ]) {
          const response = await ask(question);
          assert.equal(typeof response.reply, "string");
          assert.ok(!("knowledge" in response));
        }
      },
    ],
    [
      "Frontend needs no status request or settings",
      async () => {
        const script = fs.readFileSync(
          path.join(__dirname, "../public/script.js"),
          "utf8",
        );
        assert.ok(!script.includes("loadKnowledgeStatus"));
        assert.ok(!script.includes('fetch("/api/health")'));
        const html = fs.readFileSync(
          path.join(__dirname, "../public/index.html"),
          "utf8",
        );
        assert.ok(!html.includes("data-mode"));
      },
    ],
    [
      "Best branch questions do not become exam questions",
      async () => {
        for (const question of [
          "which is the best branch?",
          "Which branch is best?",
          "Which is the best branch of GAV?",
        ]) {
          const { reply, sources } = await ask(question);
          includes(
            reply,
            "don't have verified rankings",
            "can't name a best branch",
          );
          assert.ok(!reply.includes("Examination Pattern"));
          assert.ok(!reply.includes("Unit Test"));
          assert.ok(
            sources.every((source) => source.heading !== "Examination Pattern"),
          );
        }
      },
    ],
    [
      "Comparative words are never corrected into unrelated facts",
      async () => {
        assert.equal(bot.knowledgeBase._fuzzyCorrect("best"), "best");
        assert.equal(bot.knowledgeBase._fuzzyCorrect("better"), "better");
        assert.ok(
          !bot.knowledgeBase
            ._tokenize("which is the best branch?")
            .includes("test"),
        );
      },
    ],
    [
      "Unambiguous spelling mistakes still work",
      async () => {
        includes(
          (await ask("What is the fee strcuture?")).reply,
          "Fee Structure",
          "₹",
        );
      },
    ],
    [
      "Branch listings remain answerable without invented rankings",
      async () => {
        includes(
          (await ask("Which branches are available?")).reply,
          "GAV Group",
          "2 branches",
        );
      },
    ],
    [
      "Greeting with a question is not swallowed",
      async () => {
        includes(
          (await ask("Hello, can you help me with admission fees?")).reply,
          "₹",
          "Fee Structure",
        );
      },
    ],
    [
      "Thanks with a question is not swallowed",
      async () => {
        includes(
          (await ask("Thanks, what documents do I need?")).reply,
          "Birth Certificate",
        );
      },
    ],
    [
      "Natural cost paraphrase and word ordinal",
      async () => {
        const { reply } = await ask(
          "How much would I spend sending my kid to ninth grade?",
        );
        includes(reply, "Class 9", "19,900", "approximate");
        assert.ok(!reply.includes("29,900"));
      },
    ],
    [
      "Class-specific annual fee remains concise",
      async () => {
        const { reply, sources } = await ask("Fees for grade 11?");
        includes(reply, "Class 11", "29,900", "2099-00", "may vary");
        assert.ok(reply.length < 350);
        assert.equal(sources[0].source, "fees.md");
      },
    ],
    [
      "Both independent questions are answered",
      async () => {
        const { reply, sources } = await ask(
          "What documents do I need and how can I pay the fees?",
        );
        includes(reply, "Birth Certificate", "Payment Methods", "Online");
        assert.equal(sources.length, 2);
      },
    ],
    [
      "Multiple question marks are supported",
      async () => {
        includes(
          (await ask("Who is the principal? What are the school timings?"))
            .reply,
          "Test Principal",
          "9:15 AM",
        );
      },
    ],
    [
      "Explicit fee structure and methods both answered",
      async () => {
        includes(
          (await ask("Fee structure and payment methods?")).reply,
          "Fee Structure",
          "Payment Methods",
        );
      },
    ],
    [
      "Follow-up changes class and resolves payment pronoun",
      async () => {
        await ask("What are the fees for class 9?", "smart_follow");
        includes(
          (await ask("And for class 11?", "smart_follow")).reply,
          "Class 11",
          "29,900",
        );
        const { reply } = await ask("Can I pay it online?", "smart_follow");
        includes(reply, "Payment Methods", "UPI");
        assert.ok(!reply.includes("Admission Process"));
      },
    ],
    [
      "Clarification accepts a bare class number",
      async () => {
        includes(
          (await ask("How much will it cost for my child?", "smart_clarify"))
            .reply,
          "Which class",
        );
        await ask("Thanks!", "smart_clarify");
        includes((await ask("9", "smart_clarify")).reply, "Class 9", "19,900");
      },
    ],
    [
      "Preschool follow-ups replace the previous class",
      async () => {
        includes((await ask("Pre-nursery fees?", "smart_pre")).reply, "9,900");
        includes((await ask("And UKG?", "smart_pre")).reply, "UKG", "10,900");
      },
    ],
    [
      "Related topics retain the selected class",
      async () => {
        await ask("Fees for class 9?", "smart_subjects");
        const { reply } = await ask(
          "What subjects are offered?",
          "smart_subjects",
        );
        includes(reply, "Secondary", "Social Science");
        assert.ok(!reply.includes("Accountancy"));
      },
    ],
    [
      "Preschool documents exclude the higher-class list",
      async () => {
        const { reply } = await ask("What paperwork do I need for nursery?");
        includes(reply, "Birth Certificate", "Aadhar");
        assert.ok(!reply.includes("Transfer Certificate"));
      },
    ],
    [
      "Eligibility maps to documented age criteria",
      async () => {
        includes(
          (await ask("Is my child eligible for nursery?")).reply,
          "March 31",
          "3+",
        );
      },
    ],
    [
      "Unknown monthly detail does not become an annual answer",
      async () => {
        includes(
          (await ask("Monthly fees for class 9?")).reply,
          "not a confirmed monthly fee",
          "general monthly range",
        );
      },
    ],
    [
      "Invalid class asks for correction",
      async () => {
        includes((await ask("Fees for class 13?")).reply, "Class 12", "Which");
      },
    ],
    [
      "Unsupported boarding does not match class fees",
      async () => {
        const { reply, sources } = await ask(
          "Does the school offer boarding for class 9?",
        );
        includes(reply, "don't have information");
        assert.equal(sources.length, 0);
        assert.ok(!reply.includes("₹"));
      },
    ],
    [
      "Unknown fee qualifier is not silently ignored",
      async () => {
        includes((await ask("Boarding fees?")).reply, "don't have information");
      },
    ],
    [
      "Known negative facts remain negative",
      async () => {
        includes(
          (await ask("Does the school have a swimming pool?")).reply,
          "does not have a swimming pool",
        );
      },
    ],
    [
      "Extra overlapping words cannot mask an unknown qualifier",
      async () => {
        includes(
          (await ask("Boarding annual fees for class 9?")).reply,
          "don't have information",
        );
        includes(
          (await ask("Can I pay fees in bitcoin?")).reply,
          "don't have information",
        );
      },
    ],
    [
      "Non-monetary how much questions do not become fees",
      async () => {
        includes(
          (await ask("How much homework is assigned?")).reply,
          "Homework Policy",
          "daily",
        );
      },
    ],
    [
      "Sessions do not share follow-up topics",
      async () => {
        await ask("Fees for class 9?", "smart_isolated_a");
        includes(
          (await ask("And for class 11?", "smart_isolated_b")).reply,
          "don't have information",
        );
      },
    ],
    [
      "An unsupported question clears the previous topic",
      async () => {
        await ask("Fees for class 9?", "smart_reset");
        await ask("Does the school offer boarding?", "smart_reset");
        includes(
          (await ask("And class 11?", "smart_reset")).reply,
          "don't have information",
        );
      },
    ],
    [
      "Subject extraction uses whole words and longest names",
      async () => {
        assert.equal(
          bot.intentDetector.detect("Who teaches computer science?").entities
            .subjects,
          "computer science",
        );
        assert.equal(
          bot.intentDetector.detect("What is the scholarship?").entities
            .subjects,
          null,
        );
      },
    ],
    [
      "History is bounded and active sessions survive cleanup",
      async () => {
        for (let i = 0; i < 15; i++)
          bot.contextManager.addToHistory("smart_active", "user", "hello");
        const ctx = bot.contextManager.getContext("smart_active");
        assert.equal(ctx.history.length, 10);
        ctx.createdAt = Date.now() - 7200000;
        bot.contextManager.cleanup();
        assert.ok(bot.contextManager.sessions.has("smart_active"));
        ctx.updatedAt = Date.now() - 7200000;
        bot.contextManager.cleanup();
        assert.ok(!bot.contextManager.sessions.has("smart_active"));
      },
    ],
    [
      "Session table is bounded and evicts least recently used",
      async () => {
        const ContextManager = require("../engine/contextManager");
        const manager = new ContextManager({ maxSessions: 3 });
        ["a", "b", "c"].forEach((id) => manager.getContext(id));
        manager.getContext("a");
        manager.getContext("d");
        assert.deepEqual([...manager.sessions.keys()], ["c", "a", "d"]);
      },
    ],
    [
      "School name questions answer About the School, not stray apostrophe matches",
      async () => {
        for (const question of [
          "what's the name of the school?",
          "What is the name of the school?",
          "school's name?",
          "What is this school called?",
        ]) {
          const { reply, sources } = await ask(question);
          includes(reply, "Fixture Valley Academy");
          assert.equal(sources[0]?.heading, "About the School");
        }
        assert.ok(
          !bot.knowledgeBase._tokenize("what's the fee?").includes("s"),
        );
      },
    ],
    [
      "Exam date questions route to the examination pattern",
      async () => {
        for (const question of ["exam dates", "When are exams held?"]) {
          const { sources } = await ask(question);
          assert.equal(sources[0]?.heading, "Examination Pattern");
        }
      },
    ],
    [
      "Suggestions never repeat the question just asked",
      async () => {
        const { suggestions } = await ask("What is the fee structure?");
        assert.ok(suggestions.length > 0);
        assert.ok(!suggestions.includes("What is the fee structure?"));
      },
    ],
    [
      "Reloading the knowledge base does not duplicate sections",
      async () => {
        const count = bot.knowledgeBase.chunks.length;
        await bot.knowledgeBase.load();
        assert.equal(bot.knowledgeBase.chunks.length, count);
      },
    ],
    [
      "Bot formatting escapes HTML but preserves bold",
      async () => {
        const script = fs.readFileSync(
          path.join(__dirname, "../public/script.js"),
          "utf8",
        );
        const code = script.slice(
          script.indexOf("function formatMessage("),
          script.indexOf("// ===== Typing Indicator"),
        );
        const context = vm.createContext({});
        vm.runInContext(code, context);
        const output = context.formatMessage(
          '<img src=x onerror="alert(1)"> **safe**',
        );
        assert.ok(!output.includes("<img"));
        includes(output, "&lt;img", "<strong>safe</strong>");
        assert.equal(
          context.formatMessage("Fees:\n- <b>A</b>\n- B\nEnd"),
          "<p>Fees:</p><ul><li>&lt;b&gt;A&lt;/b&gt;</li><li>B</li></ul><p>End</p>",
        );
        assert.equal(
          context.formatMessage("_Note: approx._ snake_case_name"),
          "<p><em>Note: approx.</em> snake_case_name</p>",
        );
        assert.equal(
          context.formatMessage(
            "**Fees**\n\n1. Apply\n2. Pay\nLine one\nLine two",
          ),
          "<h3>Fees</h3><ol><li>Apply</li><li>Pay</li></ol><p>Line one<br>Line two</p>",
        );
        const links = context.formatMessage(
          'Visit https://a.test/x?y=1&z=2. Mail a@b.com or call +91-9911171991 "https://evil.test/"onmouseover=x',
        );
        includes(
          links,
          '<a href="https://a.test/x?y=1&amp;z=2" target="_blank" rel="noopener noreferrer">',
          '<a href="mailto:a@b.com">',
          '<a href="tel:+919911171991">',
        );
        assert.ok(!links.includes('"onmouseover'));
      },
    ],
  ];
  const failures = [];
  for (const [name, run] of tests) {
    try {
      await run();
      process.stdout.write("\x1b[32m✓\x1b[0m");
    } catch (error) {
      process.stdout.write("\x1b[31m✗\x1b[0m");
      failures.push({ question: name, missing: [], reply: error.message });
    }
  }
  return {
    total: tests.length,
    passed: tests.length - failures.length,
    failures,
  };
};
