const IntentDetector = require("./intentDetector");
const KnowledgeBase = require("./knowledgeBase");
const ContextManager = require("./contextManager");
const AnswerResolver = require("./answerResolver");
const { extractClass } = require("./query");
const path = require("path");

// Knowledge files are plural nouns; suggestion groups follow intent names.
const CATEGORY_SUGGESTIONS = {
  admissions: "admission",
  teachers: "teacher",
  events: "event",
  facilities: "facility",
  academics: "exam",
  general: "default",
};

// Static responses for common intents
const STATIC_RESPONSES = {
  greeting: [
    "Hello! 👋 I'm your school assistant. How can I help you today?",
    "Hi there! 😊 Ask me anything about our school!",
    "Hey! Welcome! I can help you with admissions, fees, timetable, events, and more. What would you like to know?",
  ],
  farewell: [
    "Goodbye! Have a great day! 👋",
    "See you later! Feel free to come back anytime! 😊",
    "Bye! Hope I was helpful! 🎓",
  ],
  thanks: [
    "You're welcome! 😊 Anything else I can help with?",
    "Happy to help! Let me know if you have more questions.",
    "Glad I could assist! 🎉",
  ],
  help: [
    "I can help you with:\n📚 **Admissions** — process, documents, eligibility\n💰 **Fees** — fee structure, payment\n🕐 **Timings** — school hours, schedule\n👩‍🏫 **Teachers** — faculty information\n📅 **Timetable** — class schedules\n📝 **Exams** — dates, results\n🎉 **Events** — upcoming activities\n🏫 **Facilities** — labs, library, sports\n📋 **Rules** — dress code, attendance\n📞 **Contact** — phone, email, location\n\nJust ask your question naturally!",
  ],
};

class Chatbot {
  constructor({ knowledgeDir = path.join(__dirname, "..", "knowledge") } = {}) {
    this.intentDetector = new IntentDetector();
    this.knowledgeBase = new KnowledgeBase(knowledgeDir);
    this.contextManager = new ContextManager();
    this.answerResolver = new AnswerResolver(this.knowledgeBase);
  }

  async init() {
    await this.knowledgeBase.load();
    // Clean up idle sessions every 5 min
    this.cleanupTimer = setInterval(
      () => this.contextManager.cleanup(),
      5 * 60 * 1000,
    );
    this.cleanupTimer.unref();
  }

  async getResponse(message, sessionId = "default") {
    const trimmed = message.trim();
    if (!trimmed) {
      return {
        reply: "Please type a message! 😊",
        suggestions: [],
      };
    }

    // Detect intent & entities
    const { intent, score, entities } = this.intentDetector.detect(trimmed);

    // Save to history
    this.contextManager.addToHistory(sessionId, "user", trimmed);

    // Handle static intents (greeting, farewell, thanks, help)
    if (
      STATIC_RESPONSES[intent] &&
      score > 0 &&
      this.intentDetector.isStandaloneSocial(trimmed, intent)
    ) {
      const responses = STATIC_RESPONSES[intent];
      const reply = responses[Math.floor(Math.random() * responses.length)];
      this.contextManager.update(sessionId, { entities });
      this.contextManager.addToHistory(sessionId, "bot", reply);
      return {
        reply,
        suggestions: this._getSuggestions(intent),
      };
    }

    // Split independent questions, not lists such as "science and mathematics".
    const questions = trimmed
      .split(
        /\?\s*(?=\S)|;\s*|\band\s+(?=(?:how|what|when|where|who|can|does|is|are)\b)/i,
      )
      .map((question) => question.trim())
      .filter(Boolean)
      .slice(0, 4);
    const answers = [];
    const sections = [];
    let category = null;
    let pendingTopic = null;
    for (const question of questions) {
      const enrichedQuery = this.contextManager.enrichQuery(
        sessionId,
        question,
      );
      const resolved = this.answerResolver.resolve(enrichedQuery);
      let matched = resolved?.sections || [];
      let answer = resolved?.reply;
      if (!resolved) {
        const { results } = this.knowledgeBase.search(enrichedQuery);
        if (results.length > 0 && results[0].score < 0.5) {
          const best = results[0].item;
          matched = [best];
          answer = `**${best.heading}**\n\n${best.text}`;
        }
      }
      answers.push(answer || this._fallbackResponse());
      sections.push(...matched);
      if (matched.length) category = matched[matched.length - 1].category;
      pendingTopic = resolved?.pendingTopic || null;
      this.contextManager.update(sessionId, {
        entities: { classes: extractClass(enrichedQuery) },
        category: matched.length ? category : null,
        query: matched.length ? enrichedQuery : null,
        pendingTopic,
      });
    }
    const reply = [...new Set(answers)].join("\n\n");
    this.contextManager.addToHistory(sessionId, "bot", reply);

    return {
      reply,
      suggestions: pendingTopic
        ? ["Class 1", "Class 9", "Class 11", "Nursery"]
        : this._getSuggestions(intent, category, questions),
      category,
      sources: [
        ...new Map(
          sections.map((section) => [
            section.heading,
            {
              source: section.source,
              heading: section.heading,
            },
          ]),
        ).values(),
      ],
    };
  }

  _fallbackResponse() {
    return "I don't have information on that in the school's knowledge base, so I don't want to guess. Please ask a more specific school question or contact the school office to confirm.";
  }

  _getSuggestions(intent, category, asked = []) {
    const suggestions = {
      greeting: [
        "What are the school timings?",
        "Tell me about admissions",
        "What is the fee structure?",
      ],
      admission: [
        "What documents are needed?",
        "What is the admission process?",
        "What is the fee structure?",
      ],
      fees: [
        "What is the fee structure?",
        "Payment methods?",
        "Any scholarships?",
      ],
      timing: ["What are the school holidays?", "Who is the principal?"],
      teacher: [
        "Who is the principal?",
        "Who teaches science in class 9?",
        "Class teacher of class 10?",
      ],
      exam: ["How to check results?", "Grading system?", "Homework policy"],
      event: [
        "What are the upcoming events?",
        "Annual day date?",
        "Sports day?",
      ],
      facility: [
        "Tell me about the library",
        "Computer lab",
        "Sports facilities",
      ],
      rules: ["Uniform policy", "Mobile phone rules", "Attendance policy"],
      default: [
        "What are the school timings?",
        "What is the fee structure?",
        "What is the admission process?",
        "What is the school address?",
      ],
    };
    const list =
      suggestions[intent] ||
      suggestions[CATEGORY_SUGGESTIONS[category] || category] ||
      suggestions.default;
    // Do not offer the question the user just asked.
    const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
    const seen = new Set(asked.map(normalize));
    return list.filter((text) => !seen.has(normalize(text)));
  }
}

module.exports = Chatbot;
