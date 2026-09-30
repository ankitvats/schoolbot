// Shared normalization for entity extraction and knowledge retrieval.
const ORDINALS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
];

function normalizeQuery(text) {
  let query = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    // "what's" / "school's" must not leave a stray "s" that matches "student's".
    .replace(/\b(\w+)'(?:s|re|ve|ll|d|m)\b/g, "$1")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\b(\w+)n't\b/g, "$1 not");
  ORDINALS.forEach((word, index) => {
    query = query.replace(
      new RegExp(`\\b${word}\\s+(grade|class|standard)\\b`, "g"),
      `class ${index + 1}`,
    );
    query = query.replace(
      new RegExp(`\\b(grade|class|standard)\\s+${word}\\b`, "g"),
      `class ${index + 1}`,
    );
  });
  if (
    /\b(?:fee|fees|cost|price|expense|expenses|spend|budget|tuition|pay|payment|child|kid|son|daughter|class)\b/.test(
      query,
    )
  ) {
    query = query.replace(/\bhow much\b/g, "fees");
  }
  return query
    .replace(/\b(?:grade|standard)\s+(\d{1,2})(?:st|nd|rd|th)?\b/g, "class $1")
    .replace(
      /\b(\d{1,2})(?:st|nd|rd|th)\s+(?:class|grade|standard)\b/g,
      "class $1",
    )
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, "$1")
    .replace(/\btime\s+table\b/g, "timetable")
    .replace(/\b(?:enrol|enroll|enrolment|enrollment|joining)\b/g, "admission")
    .replace(
      /\b(?:cost|price|expense|expenses|spend|budget|tuition)\b/g,
      "fees",
    )
    .replace(/\b(?:pay|paying|paid)\b/g, "payment")
    .replace(/\b(?:paperwork|papers)\b/g, "documents")
    .replace(/\b(?:eligible|eligibility)\b/g, "age criteria")
    .replace(/\b(?:canteen)\b/g, "cafeteria")
    .replace(/\b(?:headmaster|headmistress)\b/g, "principal")
    .replace(/\bteaches\b/g, "teacher")
    .replace(/\b(?:cellphone|smartphone)\b/g, "mobile phone")
    .replace(/\b(?:maths|math)\b/g, "mathematics")
    .replace(/\bexams?\b/g, "examination")
    .replace(/\bexaminations\b/g, "examination");
}

function extractClass(text) {
  const query = normalizeQuery(text);
  const numeric = query.match(/\bclass\s*(\d{1,2})\b/);
  if (numeric) return numeric[1];
  const preschool = query.match(/\b(pre[- ]nursery|nursery|lkg|ukg)\b/);
  return preschool ? preschool[1].replace(" ", "-") : null;
}

module.exports = { normalizeQuery, extractClass };
