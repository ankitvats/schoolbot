const { extractClass } = require("./query");

// Route common questions to authoritative sections, never duplicated fact values.
const TOPICS = [
  [
    /\b(?:documents|birth certificate|aadhar|transfer certificate)\b/,
    "Documents Required for Admission",
  ],
  [/\b(?:age|eligibility|eligible)\b/, "Admission Age Criteria"],
  [
    /\bname of (?:the |your |this |our )?school\b|\bschool(?:'s)? (?:full )?name\b|\b(?:what|which) (?:is )?(?:the |this )?school(?: is)? (?:called|this)\b/,
    "About the School",
  ],
  [
    /\bexamination\b.*\b(?:dates?|schedule|when|held)\b|\b(?:when|dates?|schedule)\b.*\bexamination\b/,
    "Examination Pattern",
  ],
  [/\b(?:scholarship|scholarships|financial aid)\b/, "Scholarship"],
  [/\b(?:discount|discounts)\b/, "Fee Discount"],
  [/\b(?:payment|online|upi|neft|cheque|cash)\b/, "Payment Methods"],
  [/\b(?:fees|fee)\b/, "Fee Structure"],
  [
    /\b(?:subjects|syllabus|curriculum|streams|pcm|pcb|commerce)\b/,
    "Subjects Offered",
  ],
];

class AnswerResolver {
  constructor(knowledgeBase) {
    this.knowledgeBase = knowledgeBase;
  }

  resolve(query) {
    if (
      /\bbranch(?:es)?\b/.test(query) &&
      /\b(?:best|better|top|worst|recommend|recommended|recommendation|ranking|rankings|compare|comparison)\b/.test(
        query,
      )
    ) {
      const group = this.knowledgeBase.getSection("GAV Group of Schools");
      return {
        reply:
          "I don't have verified rankings or comparable information for the school branches, so I can't name a best branch. Which campuses are you considering? Compare their distance, fees, subjects and facilities, and visit them before deciding.",
        sections: group ? [group] : [],
      };
    }
    const headings = TOPICS.filter(([pattern]) => pattern.test(query)).map(
      ([, heading]) => heading,
    );
    const paymentDetail =
      /\b(?:methods|online|upi|neft|cheque|cash|deadline|due)\b/.test(query);
    if (
      headings.includes("Payment Methods") &&
      headings.includes("Fee Structure") &&
      !/\b(?:structure|annual|monthly)\b.*\band\b/.test(query)
    ) {
      // "How much do I pay?" asks for an amount; "pay fees online" asks for a method.
      const remove =
        paymentDetail || !/\b(?:fees|fee|amount)\b/.test(query)
          ? "Fee Structure"
          : "Payment Methods";
      headings.splice(headings.indexOf(remove), 1);
    }
    if (
      /\b(?:transport|bus)\b/.test(query) &&
      headings.includes("Fee Structure")
    ) {
      headings.splice(headings.indexOf("Fee Structure"), 1, "Transport Fees");
    }
    if (headings.some((h) => ["Scholarship", "Fee Discount"].includes(h))) {
      const i = headings.indexOf("Fee Structure");
      if (i >= 0 && !/\b(?:structure|annual|monthly)\b/.test(query))
        headings.splice(i, 1);
    }
    // A fee mentioned as part of applying should not hide a request for the process.
    if (
      /\b(?:admission|apply)\b/.test(query) &&
      (/\bprocess\b/.test(query) || headings.length === 0)
    )
      headings.push("Admission Process");
    if (headings.length === 0) return null;
    const sections = headings
      .map((heading) => this.knowledgeBase.getSection(heading))
      .filter(Boolean);
    if (!sections.length || !this.knowledgeBase.hasEvidence(query, sections))
      return null;
    const selectedClass = extractClass(query);
    if (
      selectedClass &&
      /^\d+$/.test(selectedClass) &&
      (Number(selectedClass) < 1 || Number(selectedClass) > 12)
    ) {
      return {
        reply:
          "Our knowledge lists Pre-Nursery through Class 12. Which of those classes do you mean?",
        sections: [],
        pendingTopic: query.replace(/\bclass\s*\d+\b/g, ""),
      };
    }
    if (
      headings.includes("Fee Structure") &&
      !selectedClass &&
      /\b(?:child|kid|son|daughter|sending|my fees)\b/.test(query)
    ) {
      return {
        reply:
          "Which class is your child applying for? I can give the approximate annual fee for Pre-Nursery through Class 12.",
        sections: [],
        pendingTopic: "fees",
      };
    }
    return {
      reply: sections
        .map(
          (section) =>
            `**${section.heading}**\n\n${this.targetAnswer(section, query, selectedClass)}`,
        )
        .join("\n\n"),
      sections,
    };
  }

  targetAnswer(section, query, selectedClass) {
    if (section.heading === "Fee Structure" && selectedClass) {
      if (/\bmonthly\b/.test(query)) {
        return (
          "The knowledge base only gives a general monthly range, not a confirmed monthly fee for every class.\n\n" +
          section.text
            .split("\n")
            .filter((line) => /\*\*Monthly fee\*\*|_Note:/.test(line))
            .join("\n\n")
        );
      }
      // Preserve one-time/application breakdowns when explicitly requested.
      if (
        /\b(?:admission|application|registration|breakdown|composite)\b/.test(
          query,
        )
      )
        return section.text;
      const feeLine = section.text.split("\n").find((line) => {
        const range = line.match(/^- Class (\d+)-(\d+):/);
        if (range)
          return (
            /^\d+$/.test(selectedClass) &&
            Number(selectedClass) >= Number(range[1]) &&
            Number(selectedClass) <= Number(range[2])
          );
        if (selectedClass === "pre-nursery")
          return /^- Pre-Nursery:/.test(line);
        return (
          ["nursery", "lkg", "ukg"].includes(selectedClass) &&
          /^- Nursery/.test(line)
        );
      });
      if (feeLine) {
        const label = /^\d+$/.test(selectedClass)
          ? `Class ${selectedClass}`
          : selectedClass.toUpperCase();
        const session = section.text.match(/\(\d{4}-\d{2}\)/)?.[0] || "";
        const note =
          section.text.split("\n").find((line) => /^_Note:/.test(line)) || "";
        return `Approximate annual fee ${session} for **${label}**: ${feeLine.split(": ")[1]}\n\n${note}`;
      }
    }
    if (
      section.heading === "Documents Required for Admission" &&
      ["pre-nursery", "nursery"].includes(selectedClass)
    ) {
      return (
        section.text
          .split("\n")
          .find((line) => line.startsWith("For Pre-Nursery")) || section.text
      );
    }
    if (section.heading === "Admission Age Criteria" && selectedClass) {
      const label = /^\d+$/.test(selectedClass)
        ? `Class ${selectedClass}`
        : selectedClass;
      const line = section.text
        .split("\n")
        .find((value) =>
          value.toLowerCase().startsWith(`- ${label.toLowerCase()}:`),
        );
      return line ? `Age criteria (as of March 31):\n\n${line}` : section.text;
    }
    if (
      section.heading === "Subjects Offered" &&
      /^\d+$/.test(selectedClass || "")
    ) {
      const value = Number(selectedClass);
      const paragraphs = section.text.split("\n\n");
      if (value <= 5) return paragraphs[0];
      if (value <= 8) return paragraphs[1];
      if (value <= 10) return paragraphs[2];
      return paragraphs.slice(3).join("\n\n");
    }
    return section.text;
  }
}

module.exports = AnswerResolver;
