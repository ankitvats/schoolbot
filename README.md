# SchoolBot

A model-free school assistant built with Express, Natural and Compromise.
The current `knowledge/` content is **sample data**, not verified school facts.
Intent understanding and conversation rules are separate from those facts;
the chatbot does not automatically learn from conversations.

## Run

- Install the declared dependencies with `npm install`.
- Start the app with `npm start`.
- Use `npm run dev` to restart automatically during development.
- Requires Node.js 18.11 or newer.

## Limits and hosting

- Messages are capped at 500 characters and request bodies at 10 KB.
- Each client IP may send 30 chat messages per minute. Behind a reverse proxy,
  set `TRUST_PROXY=1` (or your proxy hop count) so limits apply per real client.
- At most 10,000 conversations are kept in memory; idle ones expire after an hour.
  Conversations are not persisted and are lost on restart.
- Responses carry a strict Content-Security-Policy; the frontend uses no external
  fonts, scripts or inline scripts. Keep it that way or update the policy in `server.js`.

## Replace sample knowledge with actual school data

1. Replace the sample content in `knowledge/*.md` with school-approved information.
   Remove sample sections that you cannot confirm; do not leave example values mixed
   with actual data. Only include information suitable for public chatbot answers.
2. Use `##` section headings and keep the existing topic headings where applicable,
   such as `Principal`, `Fee Structure`, `Payment Methods` and `Subjects Offered`.
   The targeted-answer templates look up those headings by name.
3. Keep fee ranges in the current format: `- Class 9-10: ~₹amount/year`.
   Preschool fees and age criteria also follow the formats in the sample files.
   Subject targeting currently expects primary, middle, secondary and senior-secondary
   paragraphs in that order. Adjust templates and fixture tests if your format differs.
4. Run `node test.js data`. It checks source integrity, expected topic selection,
   and answers against the current files, rather than old names or fee amounts.
   Missing optional topic sections are reported as skipped, not silently counted as passed.
5. Restart the server (or deploy the updated files). The knowledge index is rebuilt
   on startup; no database or runtime file writes are required.

No knowledge mode or settings file is needed. The app reads the Markdown files
directly.

The assistant still has school-specific wording and class ranges. If the actual
school uses different topics, formats or classes, update those rules too; swapping
Markdown alone is not a general-purpose school configuration system.

## Tests

- `npm test`: run all suites.
- `node test.js behavior`: test understanding, conversation behavior and the HTTP
  API (validation, limits, headers) using synthetic data in `tests/fixtures/knowledge/`.
  It never reads deployed school facts.
- `node test.js data`: test the currently loaded `knowledge/` files.

Behavior fixtures deliberately use different names, times and amounts from the
sample knowledge. Tests cover paraphrases, follow-ups, clarification, unknown
information, ranking requests, source metadata and safe HTML rendering.
Keep fixtures stable when real school data changes.

Data tests check consistency with your files, **not external factual accuracy**.
School staff must confirm the facts. Add routing checks in `tests/data.js` when
introducing new topics; new question types may need intent/routing changes as well.
