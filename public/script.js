// ===== SchoolBot Frontend =====
const thread = document.getElementById("chatMessages");
const composer = document.getElementById("composer");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const themeBtn = document.getElementById("themeBtn");
const charCount = document.getElementById("charCount");
const welcomeTemplate = document.getElementById("welcomeTemplate");

const MAX_LENGTH = Number(userInput.getAttribute("maxlength")) || 500;
const reduceMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// crypto.randomUUID only exists in secure contexts (HTTPS or localhost).
function newSessionId() {
  if (window.crypto?.randomUUID) return "session_" + crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return (
    "session_" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

let sessionId = newSessionId();
let sending = false;

// ===== Event Listeners =====
composer.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage();
});
clearBtn.addEventListener("click", clearChat);
themeBtn.addEventListener("click", () => {
  window.toggleTheme();
  labelThemeButton();
});

// theme.js may follow a system change; keep the label in step.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => setTimeout(labelThemeButton));

function labelThemeButton() {
  const label =
    document.documentElement.dataset.theme === "dark"
      ? "Switch to light theme"
      : "Switch to dark theme";
  themeBtn.setAttribute("aria-label", label);
  themeBtn.title = label;
}

userInput.addEventListener("input", updateComposer);

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

// Prompt cards, follow-up chips and copy buttons
thread.addEventListener("click", (e) => {
  const query = e.target.closest("[data-query]");
  if (query) {
    userInput.value = query.dataset.query;
    sendMessage();
    return;
  }
  const copy = e.target.closest(".copy-btn");
  if (copy) copyAnswer(copy);
});

function updateComposer() {
  sendBtn.disabled = sending || !userInput.value.trim();
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 180) + "px";
  const remaining = MAX_LENGTH - userInput.value.length;
  charCount.textContent = remaining <= 80 ? String(remaining) : "";
}

// ===== Send Message =====
async function sendMessage() {
  const message = userInput.value.trim();
  if (!message || sending) return;
  sending = true;
  const requestSession = sessionId;

  removeSuggestions();
  const userTurn = addUserTurn(message);
  userInput.value = "";
  updateComposer();

  const typingEl = showTyping();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId: requestSession }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.reply !== "string")
      throw new Error(data.error || "Chat request failed");

    removeTyping(typingEl);
    if (requestSession !== sessionId) return;

    const botTurn = addBotTurn(data.reply, data.sources, data.suggestions);
    revealAnswer(userTurn, botTurn);
  } catch (err) {
    removeTyping(typingEl);
    if (requestSession === sessionId)
      addBotTurn(
        err.message === "Chat request failed" || err instanceof TypeError
          ? "Something went wrong. Please try again."
          : err.message,
        [],
        [],
        true,
      );
  } finally {
    sending = false;
    updateComposer();
  }
}

// ===== Conversation Turns =====
function addUserTurn(text) {
  const turn = document.createElement("div");
  turn.className = "turn user-turn";
  const bubble = document.createElement("div");
  bubble.className = "user-bubble";
  bubble.textContent = text;
  turn.appendChild(bubble);
  thread.appendChild(turn);
  scrollToBottom();
  return turn;
}

function addBotTurn(text, sources = [], suggestions = [], isError = false) {
  const turn = document.createElement("article");
  turn.className = "turn bot-turn";
  turn.setAttribute("aria-label", "SchoolBot answer");

  const mark = document.createElement("div");
  mark.className = "bot-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "🎓";

  const body = document.createElement("div");
  body.className = "bot-body";

  const bubble = document.createElement("div");
  bubble.className = isError ? "bot-bubble is-error" : "bot-bubble";
  const answer = document.createElement("div");
  answer.className = "answer";
  answer.innerHTML = formatMessage(text);
  bubble.appendChild(answer);
  body.appendChild(bubble);

  const meta = document.createElement("div");
  meta.className = "answer-meta";
  if (sources?.length) {
    const list = document.createElement("div");
    list.className = "sources";
    const heading = document.createElement("span");
    heading.className = "sources-label";
    heading.textContent = sources.length > 1 ? "Sources:" : "Source:";
    list.appendChild(heading);
    for (const source of sources) {
      const chip = document.createElement("span");
      chip.className = "source-chip";
      chip.title = `${source.source} — ${source.heading}`;
      chip.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
      const label = document.createElement("span");
      label.textContent = source.heading;
      chip.appendChild(label);
      list.appendChild(chip);
    }
    meta.appendChild(list);
  }

  if (!isError && navigator.clipboard) {
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "copy-btn";
    copy.setAttribute("aria-label", "Copy answer");
    copy.dataset.text = text.replace(/\*\*(.*?)\*\*/g, "$1");
    copy.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
    meta.appendChild(copy);
  }
  if (meta.childElementCount) bubble.appendChild(meta);

  if (suggestions?.length) body.appendChild(buildSuggestions(suggestions));

  turn.appendChild(mark);
  turn.appendChild(body);
  thread.appendChild(turn);
  return turn;
}

// Long answers start at the question; short ones just scroll into view.
function revealAnswer(userTurn, botTurn) {
  const behavior = reduceMotion ? "auto" : "smooth";
  requestAnimationFrame(() => {
    if (botTurn.offsetHeight + userTurn.offsetHeight > thread.clientHeight)
      thread.scrollTo({ top: userTurn.offsetTop - 16, behavior });
    else thread.scrollTo({ top: thread.scrollHeight, behavior });
  });
}

async function copyAnswer(button) {
  const label = button.querySelector("span");
  try {
    await navigator.clipboard.writeText(button.dataset.text);
    label.textContent = "Copied";
  } catch {
    label.textContent = "Couldn't copy";
  }
  setTimeout(() => (label.textContent = "Copy"), 1500);
}

// ===== Format Bot Message (simple markdown) =====
function formatMessage(text) {
  // Runs on escaped text: web links, email addresses and phone numbers.
  const LINKS =
    /(https?:\/\/[^\s<]*[^\s<.,;:!?)])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:\+\d{1,3}[- ]?)?\b\d{10}\b)/g;
  const inline = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(LINKS, (match, url, email, phone) => {
        if (url)
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        if (email) return `<a href="mailto:${email}">${email}</a>`;
        return `<a href="tel:${phone.replace(/[^\d+]/g, "")}">${phone}</a>`;
      })
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/gm, "$1<em>$2</em>");
  // Build blocks: headings, paragraphs and bulleted or numbered lists.
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list)
      blocks.push(
        `<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.tag}>`,
      );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^(?:-|•)\s+(.*)$/);
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(inline((bullet || numbered)[1]));
      continue;
    }
    flushList();
    if (!line) {
      flushParagraph();
      continue;
    }
    const heading = line.match(/^\*\*([^*]+)\*\*$/);
    if (heading) {
      flushParagraph();
      const tag = heading[1].endsWith(":") ? "h4" : "h3";
      blocks.push(`<${tag}>${inline(heading[1])}</${tag}>`);
      continue;
    }
    paragraph.push(inline(line));
  }
  flushParagraph();
  flushList();
  return blocks.join("");
}

// ===== Typing Indicator =====
function showTyping() {
  const typing = document.createElement("div");
  typing.className = "turn bot-turn typing";
  typing.setAttribute("aria-label", "SchoolBot is typing");
  typing.innerHTML =
    '<div class="bot-mark" aria-hidden="true">🎓</div><div class="bot-bubble typing-dots" aria-hidden="true"><span></span><span></span><span></span></div>';
  thread.appendChild(typing);
  scrollToBottom();
  return typing;
}

function removeTyping(el) {
  el?.remove();
}

// ===== Suggestions =====
function buildSuggestions(suggestions) {
  const container = document.createElement("div");
  container.className = "suggestions";
  for (const text of suggestions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "suggestion-chip";
    chip.dataset.query = text;
    chip.textContent = text;
    container.appendChild(chip);
  }
  return container;
}

function removeSuggestions() {
  thread.querySelectorAll(".suggestions").forEach((el) => el.remove());
}

// ===== New Chat =====
function renderWelcome() {
  thread.replaceChildren(welcomeTemplate.content.cloneNode(true));
  const hour = new Date().getHours();
  thread.querySelector("#welcomeTitle").textContent =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function clearChat() {
  sessionId = newSessionId();
  renderWelcome();
  userInput.value = "";
  updateComposer();
  userInput.focus();
}

// ===== Utilities =====
function scrollToBottom() {
  requestAnimationFrame(() => {
    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  });
}

// iOS Safari keeps the layout height when the keyboard opens and scrolls the
// whole page instead. Size the app to the visible area and pin it in place.
const viewport = window.visualViewport;
if (viewport) {
  let lastHeight = 0;
  const fitViewport = () => {
    const height = Math.round(viewport.height);
    if (height !== lastHeight) {
      const atBottom =
        thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
      lastHeight = height;
      // Keep the latest message visible above the keyboard.
      if (atBottom) thread.scrollTop = thread.scrollHeight;
    }
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };
  viewport.addEventListener("resize", fitViewport);
  viewport.addEventListener("scroll", fitViewport);
  fitViewport();
}

labelThemeButton();
renderWelcome();
userInput.focus();
