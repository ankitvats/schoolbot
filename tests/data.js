const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Topics, not sample names, dates or amounts. Missing topics are reported as skipped.
const ROUTES = [
  ["Who is the principal?", "Principal"],
  ["principal name", "Principal"],
  ["when was the school founded?", "About the School"],
  ["what's the name of the school?", "About the School"],
  ["what is the name of the school?", "About the School"],
  ["school name", "About the School"],
  ["campus size", "About the School"],
  ["What are the school timings?", "School Timings and Start Time"],
  ["when does school start?", "School Timings and Start Time"],
  ["What is the school address?", "School Address and Contact Information"],
  ["contact info", "School Address and Contact Information"],
  ["phone number of school", "School Address and Contact Information"],
  ["What board is the school affiliated to?", "Board Affiliation"],
  ["school vision", "Vision and Mission"],
  ["What classes does the school offer?", "Classes Offered"],
  ["What is the admission process?", "Admission Process"],
  ["how to get admission?", "Admission Process"],
  ["What documents are required?", "Documents Required for Admission"],
  ["What is the age criteria?", "Admission Age Criteria"],
  ["What is the fee structure?", "Fee Structure"],
  ["Payment methods?", "Payment Methods"],
  ["Any scholarships?", "Scholarship"],
  ["fee discount", "Fee Discount"],
  ["transport fees", "Transport Fees"],
  ["student teacher ratio", "Student-Teacher Ratio"],
  ["What are the upcoming events?", "Annual Events"],
  ["extra curricular activities", "Extra-Curricular Activities"],
  ["workshops", "Workshops and Seminars"],
  ["What are the school holidays?", "School Holidays"],
  ["What subjects are offered?", "Subjects Offered"],
  ["Grading system?", "Grading System"],
  ["board exam results", "Board Exam Results"],
  ["Homework policy", "Homework Policy"],
  ["examination pattern", "Examination Pattern"],
  ["exam dates", "Examination Pattern"],
  ["when are the exams held?", "Examination Pattern"],
  ["timetable", "General School Timetable"],
  ["Tell me about the library", "Library"],
  ["Computer lab", "Computer Lab"],
  ["Sports facilities", "Sports Facilities"],
  ["school bus", "School Bus and Transport"],
  ["cafeteria", "Cafeteria"],
  ["medical room", "Medical Room"],
  ["smart classrooms", "Smart Classrooms"],
  ["CCTV", "Safety and Security"],
  ["Uniform policy", "Uniform and Dress Code"],
  ["Mobile phone rules", "Mobile Phone Policy"],
  ["Attendance policy", "Attendance Policy"],
  ["discipline rules", "Discipline and Behavior"],
  ["examination rules", "Examination Rules"],
];

module.exports = async function runDataTests(bot) {
  const kb = bot.knowledgeBase;
  const cases = [
    [
      "Knowledge contains answerable sections",
      () => {
        assert.ok(
          kb.chunks.length > 0,
          "No indexed sections: provide Markdown with ## headings",
        );
      },
    ],
  ];
  const skipped = [];
  const seen = new Set();
  for (const chunk of kb.chunks) {
    cases.push([
      `Source integrity: ${chunk.source} / ${chunk.heading}`,
      () => {
        assert.ok(
          !seen.has(chunk.heading),
          "Duplicate heading makes source selection ambiguous",
        );
        seen.add(chunk.heading);
        const content = fs.readFileSync(
          path.join(kb.knowledgeDir, chunk.source),
          "utf8",
        );
        assert.ok(
          content.includes(`## ${chunk.heading}`),
          "Source heading must exist in current file",
        );
        assert.ok(
          content.includes(chunk.text),
          "Indexed text must match the current source file",
        );
      },
    ]);
  }
  for (const [question, heading] of ROUTES) {
    const section = kb.getSection(heading);
    if (!section) {
      skipped.push(heading);
      continue;
    }
    cases.push([
      `Current data: ${question}`,
      async () => {
        const response = await bot.getResponse(question, `data_${question}`);
        assert.ok(
          response.sources.some(
            (s) => s.heading === heading && s.source === section.source,
          ),
          `Expected source section: ${heading}`,
        );
        assert.ok(
          response.reply.includes(section.text),
          "Answer must contain the current source content",
        );
      },
    ]);
  }
  // Validate targeted answers against current amounts, rather than demo amounts.
  const fees = kb.getSection("Fee Structure");
  for (const match of fees?.text.matchAll(/^- Class (\d+)-(\d+): (.+)$/gm) ||
    []) {
    for (const selectedClass of new Set([match[1], match[2]])) {
      cases.push([
        `Current annual fee: class ${selectedClass}`,
        async () => {
          const response = await bot.getResponse(
            `Annual fees for class ${selectedClass}?`,
            `data_fee_${selectedClass}`,
          );
          assert.ok(
            response.reply.includes(match[3]),
            "Targeted fee must match the current class range",
          );
          assert.ok(
            response.sources.some(
              (s) => s.heading === fees.heading && s.source === fees.source,
            ),
            "Fee source is required",
          );
        },
      ]);
    }
  }
  const failures = [];
  for (const [question, run] of cases) {
    try {
      await run();
      process.stdout.write("\x1b[32m✓\x1b[0m");
    } catch (error) {
      process.stdout.write("\x1b[31m✗\x1b[0m");
      failures.push({ question, missing: [], reply: error.message });
    }
  }
  return {
    total: cases.length,
    passed: cases.length - failures.length,
    failures,
    skipped,
  };
};
