const fs = require("fs");
const path = require("path");
const natural = require("natural");
const { normalizeQuery } = require("./query");

// Comparison words carry meaning: "best" is not a misspelling of "test".
const COMPARISON_WORDS = new Set([
  "best",
  "better",
  "worst",
  "top",
  "compare",
  "comparison",
  "recommend",
  "recommended",
  "recommendation",
  "ranking",
  "rankings",
]);

// These words describe the conversation or school, not the requested fact.
const QUERY_FILLER = new Set([
  "school",
  "class",
  "grade",
  "gav",
  "g",
  "international",
  "need",
  "needed",
  "required",
  "want",
  "know",
  "information",
  "info",
  "sending",
  "send",
  "kid",
  "child",
  "children",
  "son",
  "daughter",
  "would",
  "please",
  "hello",
  "hi",
  "hey",
  "help",
  "could",
  "can",
  "offer",
  "offers",
  "offered",
  "available",
  "include",
  "includes",
  "get",
  "there",
  "yes",
  "details",
  "detail",
  "tell",
  "find",
  "name",
  "size",
  "bring",
  "policy",
  "rules",
  "upcoming",
  "thanks",
  "thank",
  // Time words qualify a topic ("exam dates") rather than name a new one.
  "date",
  "dates",
  "schedule",
  "held",
]);

const STOP_WORDS = new Set([
  "what",
  "is",
  "the",
  "a",
  "an",
  "tell",
  "me",
  "about",
  "can",
  "you",
  "please",
  "how",
  "do",
  "i",
  "does",
  "are",
  "of",
  "in",
  "for",
  "to",
  "and",
  "or",
  "my",
  "our",
  "this",
  "that",
  "show",
  "give",
  "get",
  "when",
  "where",
  "who",
  "which",
  "why",
  "would",
  "could",
  "should",
  "have",
  "has",
  "had",
  "been",
  "any",
  "all",
  "also",
  "much",
  "many",
  "some",
  "with",
  "from",
  "it",
  "its",
  "be",
  "was",
  "were",
  "will",
  "on",
  "at",
  "by",
  "am",
  "so",
  "if",
  "no",
  "not",
  "but",
  "up",
  "there",
  "their",
  "them",
  "they",
  "we",
  "us",
  "he",
  "she",
]);

class KnowledgeBase {
  constructor(knowledgeDir) {
    this.knowledgeDir = knowledgeDir;
    this.chunks = []; // { heading, text, source, category }
    this.tfidf = null;
    this.corrections = new Map();
  }

  async load() {
    this.chunks = [];
    const files = fs
      .readdirSync(this.knowledgeDir)
      .filter((f) => path.extname(f).toLowerCase() === ".md");

    for (const file of files) {
      const filePath = path.join(this.knowledgeDir, file);
      const category = path.basename(file, ".md");
      const content = fs.readFileSync(filePath, "utf-8");
      this._chunkByHeadings(content, category, file);
    }

    this._buildIndex();
    console.log(
      `Knowledge base loaded: ${this.chunks.length} chunks from ${files.length} markdown files`,
    );
  }

  _chunkByHeadings(content, category, source) {
    // Split by ## headings (level 2)
    const parts = content.split(/^##\s+/m);

    for (let i = 1; i < parts.length; i++) {
      const section = parts[i].trim();
      if (!section) continue;

      const lines = section.split("\n");
      const heading = lines[0].trim();
      const body = lines.slice(1).join("\n").trim();

      if (body) {
        this.chunks.push({ heading, text: body, source, category });
      }
    }
  }

  _buildIndex() {
    this.tfidf = new natural.TfIdf();
    this.vocabulary = new Set();
    this.corrections.clear();

    for (const chunk of this.chunks) {
      // Index heading (repeated for extra weight) + body text
      const doc = `${chunk.heading} ${chunk.heading} ${chunk.text}`;
      this.tfidf.addDocument(doc);

      // Build vocabulary for fuzzy correction
      const words = doc
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);
      words.forEach((w) => this.vocabulary.add(w));
    }
  }

  // Auto-correct a token against the vocabulary using Levenshtein distance
  _fuzzyCorrect(token) {
    if (COMPARISON_WORDS.has(token)) return token;
    if (this.vocabulary.has(token)) return token;
    if (token.length < 4) return token; // too short to safely correct
    if (this.corrections.has(token)) return this.corrections.get(token);

    let bestMatch = token;
    let bestDist = Infinity;
    let tied = false;
    const maxDist = token.length <= 5 ? 1 : 2; // stricter for short words

    for (const word of this.vocabulary) {
      // Skip if length difference is too large
      if (Math.abs(word.length - token.length) > maxDist) continue;
      const dist = natural.LevenshteinDistance(token, word);
      if (dist < bestDist && dist <= maxDist) {
        bestDist = dist;
        bestMatch = word;
        tied = false;
      } else if (dist === bestDist) {
        tied = true;
      }
    }
    // An ambiguous correction is not evidence for answering a question.
    const corrected = tied ? token : bestMatch;
    // Bound the cache: arbitrary user input must not grow memory forever.
    if (this.corrections.size >= 5000) this.corrections.clear();
    this.corrections.set(token, corrected);
    return corrected;
  }

  // Normalize common query patterns
  _normalizeQuery(text) {
    let q = normalizeQuery(text);
    // Normalize "phone number" → include "contact"
    if (q.includes("phone") && q.includes("number")) {
      q += " contact";
    }
    // Expand abbreviations
    q = q.replace(/\bpt\b/g, "physical education");
    // "how much" / "cost" queries about fees → fee structure
    if (
      q.includes("fee") &&
      (q.includes("how much") || q.includes("cost") || q.includes("structure"))
    ) {
      q += " fee structure annual";
    }
    return q;
  }

  // Tokenize a query, removing stop words but keeping numbers
  _tokenize(text) {
    const normalized = this._normalizeQuery(text);
    const tokens = normalized
      .replace(/[?.,!;:'"()\-\/]/g, " ")
      .split(/\s+/)
      // Single letters (other than digits) carry no meaning for retrieval.
      .filter((w) => (w.length > 1 || /\d/.test(w)) && !STOP_WORDS.has(w));

    // Apply fuzzy correction to each token
    if (this.vocabulary) {
      return tokens.map((t) =>
        QUERY_FILLER.has(t) ? t : this._fuzzyCorrect(t),
      );
    }
    return tokens;
  }

  search(query, limit = 3) {
    if (!this.tfidf || this.chunks.length === 0) {
      return { results: [] };
    }

    const queryTokens = this._tokenize(query);
    if (queryTokens.length === 0) {
      return { results: [] };
    }

    // Get TF-IDF scores for the query
    const scores = [];
    this.tfidf.tfidfs(queryTokens.join(" "), (i, measure) => {
      if (measure > 0) {
        scores.push({ index: i, tfidfScore: measure });
      }
    });

    if (scores.length === 0) {
      return { results: [] };
    }

    // Sort by TF-IDF score descending (higher = more relevant)
    scores.sort((a, b) => b.tfidfScore - a.tfidfScore);

    // Boost results where query words appear in heading
    for (const s of scores) {
      const chunk = this.chunks[s.index];
      const headingLower = chunk.heading.toLowerCase();
      const headingMatch = queryTokens.filter((w) =>
        headingLower.includes(w),
      ).length;
      // Boost heading matches
      s.tfidfScore *= 1 + headingMatch * 0.5;
    }

    // Re-sort after boosting
    scores.sort((a, b) => b.tfidfScore - a.tfidfScore);

    // Normalize to 0-1 scale where LOWER = better (compatible with chatbot.js)
    // Using: score = 1 / (1 + rawScore * scaleFactor)
    const terms = this._evidenceTerms(queryTokens);
    const results = scores
      .filter((s) => this._hasEvidence(query, terms, [this.chunks[s.index]]))
      .slice(0, limit)
      .map((s) => ({
        score: 1 / (1 + s.tfidfScore * 0.3),
        item: this.chunks[s.index],
      }));

    return { results };
  }

  getSection(heading) {
    return this.chunks.find((chunk) => chunk.heading === heading);
  }

  hasEvidence(query, chunks) {
    return this._hasEvidence(
      query,
      this._evidenceTerms(this._tokenize(query)),
      chunks,
    );
  }

  _evidenceTerms(tokens) {
    return [...new Set(tokens)].filter(
      (term) => !QUERY_FILLER.has(term) && !/^\d+$/.test(term),
    );
  }

  _hasEvidence(query, terms, chunks) {
    if (terms.length === 0)
      return /\b(?:gav|school)\b/i.test(query) && chunks.length > 0;
    // A known word such as "fees" must not hide an unknown qualifier such as
    // "boarding" or "bitcoin", even when the remaining query matches strongly.
    if (
      terms.some(
        (term) =>
          term.length > 2 &&
          !this.vocabulary.has(term) &&
          !this.vocabulary.has(`${term}s`) &&
          !(term.endsWith("s") && this.vocabulary.has(term.slice(0, -1))),
      )
    )
      return false;
    const text = chunks
      .map((chunk) => `${chunk.heading} ${chunk.text}`)
      .join(" ");
    const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) || []);
    // Singular/plural variants are safe; broad stemming can turn boarding into board.
    const matches = terms.filter(
      (term) =>
        words.has(term) ||
        (term.endsWith("s") && words.has(term.slice(0, -1))) ||
        words.has(`${term}s`),
    );
    return matches.length / terms.length >= 0.6;
  }
}

module.exports = KnowledgeBase;
