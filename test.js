/**
 * SchoolBot Automated Test Suite
 * npm test: behavior fixtures + current school data
 * node test.js behavior: independent of deployable school knowledge
 * node test.js data: validate answers against current knowledge files
 */

const Chatbot = require("./engine/chatbot");
const runSmartTests = require("./tests/smart");
const runDataTests = require("./tests/data");
const runHttpTests = require("./tests/http");

async function runTests() {
  const selection = process.argv[2] || "all";
  if (!["all", "behavior", "data"].includes(selection)) {
    throw new Error("Usage: node test.js [all|behavior|data]");
  }
  const results = [];
  if (selection !== "data") {
    console.log("\nBehavior tests (synthetic fixtures):");
    results.push(await runSmartTests());
    console.log("\n\nHTTP tests:");
    results.push(await runHttpTests());
  }
  if (selection !== "behavior") {
    const bot = new Chatbot();
    await bot.init();
    console.log("\n\nCurrent knowledge data tests:");
    const data = await runDataTests(bot);
    results.push(data);
    if (data.skipped.length)
      console.log(
        `\nSkipped routes for missing sections: ${[...new Set(data.skipped)].join(", ")}`,
      );
  }
  const passed = results.reduce((count, result) => count + result.passed, 0);
  const total = results.reduce((count, result) => count + result.total, 0);
  const failures = [];
  results.forEach((result) => failures.push(...result.failures));
  console.log(`\n\n${"═".repeat(50)}`);
  console.log(
    `  Results: ${passed} passed, ${failures.length} failed out of ${total}`,
  );
  console.log(`${"═".repeat(50)}`);

  if (failures.length > 0) {
    console.log("\n\x1b[31mFailed tests:\x1b[0m\n");
    for (const f of failures) {
      console.log(`  ✗ "${f.question}"`);
      console.log(`    → ${f.reply}`);
      console.log("");
    }
  }

  process.exitCode = failures.length > 0 ? 1 : 0;
}

runTests().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
