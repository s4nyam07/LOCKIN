const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const names = {
  jee: "JEE",
  neet: "NEET",
  others: "OTHER"
};

const providers = {
  groq: "Groq",
  openai: "OpenAI",
  gemini: "Gemini"
};

document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".focus-btn");
  const focusText = document.getElementById("focusText");
  const providerText = document.getElementById("providerText");
  const providerSelect = document.getElementById("providerSelect");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const saveSettings = document.getElementById("saveSettings");
  const settingsMsg = document.getElementById("settingsMsg");
  const icon = document.getElementById("appIcon");

  // fallback stays visible if the png is missing while editing
  icon.addEventListener("load", () => icon.classList.add("ready"));
  icon.addEventListener("error", () => icon.classList.remove("ready"));
  if (icon.complete && icon.naturalWidth > 0) icon.classList.add("ready");

  chrome.storage.local.get(["selectedExam", "youtubeClosedCounts", "aiProvider", "apiKey"], (data) => {
    const savedExam = cleanExam(data.selectedExam || "jee");
    const savedProvider = cleanProvider(data.aiProvider || "groq");

    setActiveButton(savedExam, buttons, focusText);
    setProviderUi(savedProvider, data.apiKey, providerSelect, apiKeyInput, providerText, settingsMsg);

    const fontReady = document.fonts?.ready || Promise.resolve();
    fontReady.then(() => drawChart(data.youtubeClosedCounts || {}));
  });

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const exam = cleanExam(btn.dataset.exam);

      setActiveButton(exam, buttons, focusText);
      chrome.storage.local.set({ selectedExam: exam });

      chrome.runtime.sendMessage({ type: "setExam", exam }, (res) => {
        if (res?.status !== "ok") console.log("focus update failed");
      });
    });
  });

  settingsBtn.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
    settingsBtn.textContent = settingsPanel.classList.contains("hidden") ? "SET" : "X";
  });

  saveSettings.addEventListener("click", () => {
    const aiProvider = cleanProvider(providerSelect.value);
    const apiKey = apiKeyInput.value.trim();

    chrome.storage.local.set({ aiProvider, apiKey }, () => {
      setProviderUi(aiProvider, apiKey, providerSelect, apiKeyInput, providerText, settingsMsg);
      chrome.runtime.sendMessage({ type: "saveSettings", aiProvider, apiKey });
    });
  });
});

function cleanExam(exam) {
  const fixed = String(exam || "jee").toLowerCase();
  return names[fixed] ? fixed : "jee";
}

function setActiveButton(exam, buttons, focusText) {
  buttons.forEach((btn) => btn.classList.toggle("active", btn.dataset.exam === exam));
  focusText.textContent = `guard mode: ${names[exam]}`;
}

function cleanProvider(provider) {
  const fixed = String(provider || "groq").toLowerCase();
  return providers[fixed] ? fixed : "groq";
}

function setProviderUi(provider, apiKey, providerSelect, apiKeyInput, providerText, settingsMsg) {
  providerSelect.value = provider;
  apiKeyInput.value = apiKey || "";
  providerText.textContent = `AI: ${providers[provider]}`;
  settingsMsg.textContent = apiKey ? "saved" : "no key";
}

function drawChart(savedCounts) {
  const counts = days.map((day) => savedCounts[day] || 0);
  const ctx = document.getElementById("myChart");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: days,
      datasets: [{
        label: "blocked",
        data: counts,
        backgroundColor: "#48dbfb",
        borderColor: "#f8f5e9",
        borderWidth: 2,
        borderRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#121827",
          borderColor: "#ffd166",
          borderWidth: 2,
          titleFont: pixelFont(10),
          bodyFont: pixelFont(10),
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#f8f5e9", font: pixelFont(8) }
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(248, 245, 233, 0.18)" },
          ticks: {
            color: "#f8f5e9",
            precision: 0,
            stepSize: 1,
            font: pixelFont(8)
          }
        }
      }
    }
  });
}

function pixelFont(size) {
  return {
    family: "'Press Start 2P', monospace",
    size
  };
}
