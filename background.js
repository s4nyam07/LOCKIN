const examNames = {
  jee: "JEE",
  neet: "NEET",
  others: "general study"
};

const providerNames = {
  groq: "Groq",
  openai: "OpenAI",
  gemini: "Gemini"
};

let selectedExam = "jee";
let aiProvider = "groq";
let apiKey = "";
const checkingTabs = new Set();

chrome.storage.local.get(["selectedExam", "aiProvider", "apiKey"], (data) => {
  selectedExam = cleanExam(data.selectedExam);
  aiProvider = cleanProvider(data.aiProvider);
  apiKey = data.apiKey || "";
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "setExam") {
    selectedExam = cleanExam(message.exam);
    chrome.storage.local.set({ selectedExam });
    sendResponse({ status: "ok" });
    return;
  }

  if (message.type === "saveSettings") {
    aiProvider = cleanProvider(message.aiProvider);
    apiKey = message.apiKey || "";
    chrome.storage.local.set({ aiProvider, apiKey });
    sendResponse({ status: "ok" });
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.selectedExam) selectedExam = cleanExam(changes.selectedExam.newValue);
  if (changes.aiProvider) aiProvider = cleanProvider(changes.aiProvider.newValue);
  if (changes.apiKey) apiKey = changes.apiKey.newValue || "";
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.title && changeInfo.status !== "complete") return;
  checkTab(tabId, tab);
});

setInterval(checkYouTubeTabs, 5 * 60 * 1000);

function cleanExam(exam) {
  const fixed = String(exam || "jee").toLowerCase();
  return examNames[fixed] ? fixed : "jee";
}

function cleanProvider(provider) {
  const fixed = String(provider || "groq").toLowerCase();
  return providerNames[fixed] ? fixed : "groq";
}

function isYouTubeVideoUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("youtube.com") && parsed.pathname === "/watch";
  } catch (err) {
    return false;
  }
}

function canCheckTitle(title) {
  const boringTitles = ["YouTube", "Home", "Shorts", "Watch", "Subscriptions"];
  return title && title.length >= 10 && !boringTitles.includes(title);
}

async function checkWithAI(title, exam) {
  const key = apiKey.trim();
  const provider = cleanProvider(aiProvider);

  if (!key) {
    console.warn("LOCKIN: add an API key from the popup settings first.");
    return true;
  }

  const examName = examNames[cleanExam(exam)];
  const prompt = `Answer only yes or no.

Is this YouTube video useful for someone preparing for ${examName}?

Say yes for syllabus, lectures, notes, revision, pyq, strategy, or serious study content.
Say no for entertainment, memes, random vlogs, gaming, shorts, music, or unrelated stuff.

Title: ${title}`;

  try {
    const response = await fetch(getApiUrl(provider, key), getFetchOptions(provider, key, prompt));

    if (!response.ok) {
      console.warn(`LOCKIN: ${providerNames[provider]} request failed`, response.status);
      return true;
    }

    const data = await response.json();
    const reply = readReply(provider, data).trim().toLowerCase();

    console.log("Title:", title);
    console.log("AI:", reply);

    if (reply.startsWith("no")) return false;
    if (reply.startsWith("yes")) return true;
    return true;
  } catch (err) {
    console.warn("LOCKIN: AI check failed", err);
    return true;
  }
}

function getApiUrl(provider, key) {
  if (provider === "gemini") {
    return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(key)}`;
  }

  if (provider === "openai") {
    return "https://api.openai.com/v1/chat/completions";
  }

  return "https://api.groq.com/openai/v1/chat/completions";
}

function getFetchOptions(provider, key, prompt) {
  if (provider === "gemini") {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 6 }
      })
    };
  }

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: provider === "openai" ? "gpt-4o-mini" : "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 6,
      stream: false
    })
  };
}

function readReply(provider, data) {
  if (provider === "gemini") {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  return data.choices?.[0]?.message?.content || "";
}

async function checkYouTubeTabs() {
  const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });

  for (const tab of tabs) {
    await checkTab(tab.id, tab);
  }
}

async function checkTab(tabId, tab) {
  if (!tabId || checkingTabs.has(tabId)) return;
  if (!tab?.url || !isYouTubeVideoUrl(tab.url)) return;

  const title = (tab.title || "").trim();
  if (!canCheckTitle(title)) return;

  checkingTabs.add(tabId);

  try {
    const isUseful = await checkWithAI(title, selectedExam);
    if (!isUseful) await closeTab(tabId, title);
  } finally {
    checkingTabs.delete(tabId);
  }
}

async function closeTab(tabId, title) {
  try {
    await chrome.tabs.remove(tabId);
    incrementClosedCount();
    console.log("Closed:", title);
  } catch (err) {
    console.warn("LOCKIN: could not close tab", err);
  }
}

function incrementClosedCount() {
  chrome.storage.local.get("youtubeClosedCounts", (data) => {
    const counts = data.youtubeClosedCounts || {};
    const today = new Date().toLocaleDateString("en-US", { weekday: "short" });

    counts[today] = (counts[today] || 0) + 1;
    chrome.storage.local.set({ youtubeClosedCounts: counts });
  });
}
