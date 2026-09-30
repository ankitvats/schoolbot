const nlp = require("compromise");
const { normalizeQuery, extractClass } = require("./query");

// Intent patterns — maps keywords/phrases to intents
const INTENT_PATTERNS = {
  greeting: {
    patterns: [
      "hello",
      "good morning",
      "good afternoon",
      "good evening",
      "howdy",
      "hola",
      "namaste",
    ],
    exact: ["hi", "hey"], // only match if the entire message is this word
  },
  farewell: {
    patterns: [
      "bye",
      "goodbye",
      "see you",
      "take care",
      "good night",
      "thanks bye",
      "cya",
    ],
  },
  thanks: {
    patterns: ["thank", "thanks", "thank you", "thx", "appreciate"],
  },
  help: {
    patterns: [
      "help",
      "what can you do",
      "how to use",
      "guide",
      "options",
      "menu",
    ],
  },
  admission: {
    patterns: [
      "admission",
      "enroll",
      "enrolment",
      "enrollment",
      "registration",
      "register",
      "join school",
      "new admission",
      "apply",
    ],
  },
  fees: {
    patterns: [
      "fee",
      "fees",
      "cost",
      "charges",
      "tuition",
      "payment",
      "pay",
      "price",
      "expense",
      "scholarship",
      "financial aid",
    ],
  },
  timing: {
    patterns: [
      "timing",
      "timings",
      "school time",
      "hours",
      "when does school",
      "opening",
      "closing",
      "start time",
      "end time",
    ],
  },
  teacher: {
    patterns: [
      "teacher",
      "faculty",
      "staff",
      "teaches",
      "who teaches",
      "class teacher",
      "professor",
      "sir",
      "maam",
      "madam",
    ],
  },
  timetable: {
    patterns: [
      "timetable",
      "time table",
      "period",
      "periods",
      "class schedule",
      "subject schedule",
      "weekly schedule",
    ],
  },
  exam: {
    patterns: [
      "exam",
      "examination",
      "test",
      "assessment",
      "marks",
      "result",
      "grade",
      "report card",
      "score",
    ],
  },
  event: {
    patterns: [
      "event",
      "function",
      "celebration",
      "annual day",
      "sports day",
      "cultural",
      "fest",
      "competition",
      "activity",
    ],
  },
  holiday: {
    patterns: [
      "holiday",
      "vacation",
      "leave",
      "off day",
      "break",
      "summer vacation",
      "winter break",
      "diwali",
      "christmas",
    ],
  },
  facility: {
    patterns: [
      "facility",
      "facilities",
      "lab",
      "laboratory",
      "library",
      "playground",
      "ground",
      "transport",
      "bus",
      "canteen",
      "cafeteria",
      "sports",
      "computer lab",
      "swimming",
    ],
  },
  rules: {
    patterns: [
      "rule",
      "rules",
      "discipline",
      "dress code",
      "uniform",
      "attendance",
      "policy",
      "code of conduct",
      "guidelines",
      "regulation",
    ],
  },
  contact: {
    patterns: [
      "contact",
      "phone",
      "email",
      "address",
      "location",
      "reach",
      "call",
      "where is",
      "map",
      "direction",
    ],
  },
  about: {
    patterns: [
      "about",
      "school name",
      "history",
      "founded",
      "established",
      "principal",
      "motto",
      "vision",
      "mission",
      "who are you",
    ],
  },
  syllabus: {
    patterns: [
      "syllabus",
      "curriculum",
      "course",
      "subject",
      "subjects",
      "what do they teach",
      "books",
      "textbook",
    ],
  },
};

class IntentDetector {
  detect(userMessage) {
    const msg = normalizeQuery(userMessage).trim();
    const doc = nlp(msg);

    // Extract entities
    const entities = {
      numbers: doc.match("#Value").out("array"),
      classes: this._extractClass(msg),
      subjects: this._extractSubject(msg),
      names: doc.match("#Person").out("array"),
    };

    // Score each intent
    let bestIntent = "unknown";
    let bestScore = 0;

    for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
      // A greeting or "help" inside a real question must not swallow it.
      if (
        ["greeting", "farewell", "thanks", "help"].includes(intent) &&
        !this.isStandaloneSocial(msg, intent)
      )
        continue;
      let score = 0;
      for (const pattern of config.patterns) {
        // Use word boundary matching to prevent partial matches
        // e.g., "hola" shouldn't match inside "scholarship"
        const regex = new RegExp(
          `(^|\\s|[^a-z])${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s|[^a-z])`,
          "i",
        );
        if (regex.test(msg)) {
          score += pattern.split(" ").length;
        }
      }
      // Check exact-match-only patterns (e.g., "hi" shouldn't match "hindi")
      if (config.exact) {
        for (const pattern of config.exact) {
          const trimmed = msg.replace(/[!?.]/g, "").trim();
          if (trimmed === pattern) {
            score += 1;
          }
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    return { intent: bestIntent, score: bestScore, entities };
  }

  _extractClass(msg) {
    return extractClass(msg);
  }

  isStandaloneSocial(message, intent) {
    const msg = message
      .toLowerCase()
      .replace(/[!?. ,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const patterns = {
      greeting:
        /^(?:hi|hey|hello|good morning|good afternoon|good evening|howdy|hola|namaste)(?: there| bot| schoolbot)?$/,
      farewell:
        /^(?:bye|goodbye|see you|see you later|take care|good night|thanks bye|cya)$/,
      thanks: /^(?:thanks|thank you|thx|appreciate it)(?: a lot| so much)?$/,
      help: /^(?:help|help me|what can you do|how to use|guide|options|menu|who are you)$/,
    };
    return Boolean(patterns[intent] && patterns[intent].test(msg));
  }

  _extractSubject(msg) {
    const subjects = [
      "math",
      "mathematics",
      "science",
      "physics",
      "chemistry",
      "biology",
      "english",
      "hindi",
      "history",
      "geography",
      "economics",
      "computer",
      "computer science",
      "art",
      "music",
      "physical education",
      "pe",
      "social studies",
      "social science",
      "sanskrit",
      "french",
      "german",
      "spanish",
    ];
    const msgLower = msg.toLowerCase();
    return (
      subjects
        .sort((a, b) => b.length - a.length)
        .find((s) => new RegExp(`\\b${s}\\b`).test(msgLower)) || null
    );
  }
}

module.exports = IntentDetector;
