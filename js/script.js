// SAJAWARGA - Smart Search Terminal

(function () {
  "use strict";

  // DOM Elements
  const terminalOutput = document.getElementById("terminalOutput");
  const dynamicOutput = document.getElementById("dynamicOutput");
  const inputField = document.getElementById("terminalInput");

  let commandHistory = [];
  let historyIndex = -1;

  // Helper Functions
  function scrollToBottom() {
    setTimeout(() => {
      if (terminalOutput)
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }, 50);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>]/g, function (m) {
      if (m === "&") return "&amp;";
      if (m === "<") return "&lt;";
      if (m === ">") return "&gt;";
      return m;
    });
  }

  function writeOutput(content, isError = false) {
    const block = document.createElement("div");
    block.style.margin = "4px 0";
    if (isError) block.style.color = "#f98b8b";
    if (typeof content === "string") {
      block.innerHTML = content;
    } else {
      block.appendChild(content);
    }
    dynamicOutput.appendChild(block);
    scrollToBottom();
    return block;
  }

  // JSONP Request
  function jsonpRequest(url) {
    return new Promise((resolve, reject) => {
      const callback = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      const script = document.createElement("script");

      const timeout = setTimeout(() => {
        delete window[callback];
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error("Timeout"));
      }, 10000);

      window[callback] = (data) => {
        clearTimeout(timeout);
        delete window[callback];
        if (script.parentNode) script.parentNode.removeChild(script);
        resolve(data);
      };

      script.src = `${url}${url.includes("?") ? "&" : "?"}format=json&callback=${callback}`;
      script.onerror = () => {
        clearTimeout(timeout);
        delete window[callback];
        reject(new Error("Request failed"));
      };
      document.head.appendChild(script);
    });
  }

  // Levenshtein Distance untuk fuzzy search
  function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = [j];
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  async function findSimilarTitle(query, language) {
    const baseUrl =
      language === "id"
        ? "https://id.wikipedia.org"
        : "https://en.wikipedia.org";
    try {
      const searchUrl = `${baseUrl}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=20`;
      const data = await jsonpRequest(searchUrl);
      if (
        data &&
        data.query &&
        data.query.search &&
        data.query.search.length > 0
      ) {
        let bestMatch = null;
        let bestScore = Infinity;
        for (let item of data.query.search) {
          const title = item.title;
          const distance = levenshteinDistance(
            query.toLowerCase(),
            title.toLowerCase(),
          );
          const score = distance / Math.max(query.length, title.length);
          if (score < bestScore && score < 0.5) {
            bestScore = score;
            bestMatch = title;
          }
        }
        if (bestMatch) {
          return await getWikipediaExtract(bestMatch, language);
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function getWikipediaExtract(title, language) {
    const baseUrl =
      language === "id"
        ? "https://id.wikipedia.org"
        : "https://en.wikipedia.org";
    const url = `${baseUrl}/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&redirects=1`;
    try {
      const data = await jsonpRequest(url);
      if (data && data.query && data.query.pages) {
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (
          pages[pageId] &&
          pages[pageId].extract &&
          pages[pageId].extract !== ""
        ) {
          return {
            title: pages[pageId].title,
            extract: pages[pageId].extract,
          };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function searchWikipedia(query) {
    if (!query || query.trim() === "") {
      writeOutput("⚠️ Masukkan kata kunci", true);
      return;
    }

    writeOutput(
      '<div class="loading"><i class="fas fa-spinner fa-pulse"></i> Mencari...</div>',
    );

    try {
      const cleanQ = query.trim().toLowerCase();
      let result = null;
      let isEnglish = false;
      let methodUsed = "";

      // Coba Indonesia
      const idResult = await getWikipediaExtract(cleanQ, "id");
      if (
        idResult &&
        idResult.extract &&
        !idResult.extract.includes("dialihkan")
      ) {
        result = idResult;
        methodUsed = "Wikipedia Indonesia";
      }

      // Coba Inggris
      if (!result) {
        const enResult = await getWikipediaExtract(cleanQ, "en");
        if (
          enResult &&
          enResult.extract &&
          !enResult.extract.includes("redirect")
        ) {
          result = enResult;
          isEnglish = true;
          methodUsed = "Wikipedia Inggris";
        }
      }

      // Fuzzy search
      if (!result) {
        const fuzzyResult = await findSimilarTitle(cleanQ, "id");
        if (fuzzyResult) {
          result = fuzzyResult;
          methodUsed = "Fuzzy Search (Indonesia)";
        } else {
          const fuzzyEnResult = await findSimilarTitle(cleanQ, "en");
          if (fuzzyEnResult) {
            result = fuzzyEnResult;
            isEnglish = true;
            methodUsed = "Fuzzy Search (Inggris)";
          }
        }
      }

      const loading = document.querySelector(".loading");
      if (loading) loading.remove();

      if (result && result.extract) {
        let extract = result.extract;
        if (extract.length > 2000) extract = extract.substring(0, 2000) + "...";

        const langBadge = isEnglish
          ? '<span class="lang-badge" style="background:#1a2a2a; padding:2px 8px; border-radius:20px; font-size:10px; margin-left:8px;">🇬🇧 English</span>'
          : '<span class="lang-badge" style="background:#1a2a2a; padding:2px 8px; border-radius:20px; font-size:10px; margin-left:8px;">🇮🇩 Indonesia</span>';

        const html = `
                    <div class="search-result" style="margin:8px 0 12px 0;">
                        <div class="result-title" style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
                            <i class="fab fa-wikipedia-w" style="color:#6ee7b7; font-size:14px;"></i>
                            <span style="font-size:16px; font-weight:bold; color:#e2e8f0;">${escapeHtml(result.title)}</span>
                            ${langBadge}
                        </div>
                        <div style="font-size:10px; color:#6a7894; margin-bottom:6px;">
                            <i class="fas fa-search"></i> ${methodUsed}
                        </div>
                        <div id="extract_${Date.now()}" style="margin:8px 0; font-size:14px; color:#cbd5e6; line-height:1.5; max-height:300px; overflow-y:auto; padding-right:6px;">
                            ${escapeHtml(extract)}
                        </div>
                        <div class="result-buttons" style="display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 6px;">
                            ${
                              isEnglish
                                ? `
                                <button class="copy-translate-btn" data-text="${escapeHtml(extract).replace(/"/g, "&quot;")}" style="background:#2a3448; border:1px solid #3a4558; color:#6ee7b7; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;">
                                    <i class="fas fa-copy"></i> Salin & Terjemahkan
                                </button>
                            `
                                : `
                                <button class="copy-btn" data-text="${escapeHtml(extract).replace(/"/g, "&quot;")}" style="background:#2a3448; border:1px solid #3a4558; color:#6ee7b7; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;">
                                    <i class="fas fa-copy"></i> Salin Teks
                                </button>
                            `
                            }
                        </div>
                        <div class="result-link" style="margin-top:4px;">
                            <a href="https://${isEnglish ? "en" : "id"}.wikipedia.org/wiki/${encodeURIComponent(result.title)}" target="_blank" style="color:#6ee7b7; font-size:12px; text-decoration:none;">
                                🔗 Baca selengkapnya →
                            </a>
                        </div>
                    </div>
                `;
        writeOutput(html);
      } else {
        await showSuggestions(query);
      }
    } catch (error) {
      const loading = document.querySelector(".loading");
      if (loading) loading.remove();
      writeOutput("😔 Gagal mencari. Coba kata kunci lain.", true);
    }
  }

  async function showSuggestions(query) {
    writeOutput(
      '<div class="loading"><i class="fas fa-spinner fa-pulse"></i> Menampilkan saran...</div>',
    );
    try {
      const searchUrl = `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8`;
      const data = await jsonpRequest(searchUrl);
      const loading = document.querySelector(".loading");
      if (loading) loading.remove();

      if (
        data &&
        data.query &&
        data.query.search &&
        data.query.search.length > 0
      ) {
        let html = `<div style="margin:8px 0 4px;"><strong>🔍 Hasil terkait "${escapeHtml(query)}"</strong></div>`;
        html += `<ul style="margin:0 0 8px 20px;">`;
        for (let item of data.query.search.slice(0, 8)) {
          html += `
                        <li style="margin:6px 0;">
                            <span style="color:#6ee7b7;">${escapeHtml(item.title)}</span>
                            <button class="suggest-search" data-title="${escapeHtml(item.title)}" style="background:#2a3448; border:none; color:#6ee7b7; padding:2px 10px; border-radius:4px; cursor:pointer; font-size:11px; margin-left:10px;">
                                🔍 Cari
                            </button>
                        </li>
                    `;
        }
        html += `</ul>`;
        writeOutput(html);
      } else {
        writeOutput("😔 Tidak ditemukan hasil. Coba kata kunci lain.", true);
      }
    } catch (error) {
      const loading = document.querySelector(".loading");
      if (loading) loading.remove();
      writeOutput("😔 Tidak ditemukan hasil.", true);
    }
  }

  // Event Handlers
  document.addEventListener("click", async (e) => {
    if (e.target.classList.contains("copy-btn")) {
      const text = e.target.getAttribute("data-text");
      await copyToClipboard(text);
      showToast("✓ Teks berhasil disalin!");
    }

    if (e.target.classList.contains("copy-translate-btn")) {
      const text = e.target.getAttribute("data-text");
      await copyToClipboard(text);
      showToast("✓ Teks disalin! Membuka Google Translate...");
      window.open(
        `https://translate.google.com/?sl=en&tl=id&text=${encodeURIComponent(text)}&op=translate`,
        "_blank",
      );
    }

    if (e.target.classList.contains("suggest-search")) {
      const title = e.target.getAttribute("data-title");
      writeOutput(
        `<div class="output-line" style="margin:4px 0; display:flex; gap:8px;"><span class="prompt" style="color:#6ee7b7;">$</span> <span style="color:#94e6b2;">search ${escapeHtml(title)}</span></div>`,
      );
      await searchWikipedia(title);
    }
  });

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    }
  }

  function showToast(msg) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.cssText =
      "position:fixed; bottom:100px; right:20px; background:#2a6b47; color:white; padding:8px 16px; border-radius:8px; font-size:12px; z-index:9999; animation:fadeOut 2s forwards;";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  function showHelp() {
    writeOutput(`
            <div style="margin:8px 0; padding:12px; background:rgba(15,20,30,0.5); border-left:3px solid #2a6b47; border-radius:8px;">
                <div style="font-weight:bold; margin-bottom:8px;">📋 Daftar Perintah</div>
                <p><kbd>search [kata]</kbd> → Cari di Wikipedia (otomatis ID/EN)</p>
                <p><kbd>clear</kbd> → Bersihkan layar</p>
                <p><kbd>about</kbd> → Info terminal</p>
                <hr style="border-color:#2a3448; margin:8px 0;">
                <p><i class="fas fa-search-plus"></i> Pencarian fleksibel - tidak perlu huruf besar/kecil tepat</p>
                <p><i class="fas fa-shield-alt"></i> Mode privat - tanpa riwayat</p>
            </div>
        `);
  }

  function showAbout() {
    writeOutput(`
            <div style="margin:8px 0; padding:12px; background:rgba(15,20,30,0.5); border-left:3px solid #2a6b47; border-radius:8px;">
                <div style="font-weight:bold; margin-bottom:8px;">🛡️ SajaWarga Terminal v3.0</div>
                <p>Mesin pencari Wikipedia bilingual dengan fuzzy search</p>
                <p style="margin-top:8px;">✨ Fitur:</p>
                <ul style="margin-left:20px; margin-bottom:8px;">
                    <li>7.5M+ artikel Wikipedia</li>
                    <li>Pencarian 2 bahasa (Indonesia/Inggris)</li>
                    <li>Fuzzy search (ejaan mirip)</li>
                    <li>100% privat & aman</li>
                    <li>Salin teks & terjemahan Google Translate</li>
                </ul>
                <hr style="border-color:#2a3448; margin:8px 0;">
                <p>Dibuat oleh <i class="fas fa-heart" style="color:#e05a5a;"></i> Salman A</p>
            </div>
        `);
  }

  function clearScreen() {
    dynamicOutput.innerHTML = "";
    writeOutput("✓ Terminal bersih. Ketik help");
  }

  async function processCommand(cmdRaw) {
    const cmd = cmdRaw.trim().toLowerCase();
    if (cmd === "") return;

    if (commandHistory[commandHistory.length - 1] !== cmdRaw.trim()) {
      commandHistory.push(cmdRaw.trim());
      if (commandHistory.length > 30) commandHistory.shift();
    }
    historyIndex = -1;

    const parts = cmd.split(" ");
    const command = parts[0];
    const args = parts.slice(1).join(" ");

    switch (command) {
      case "help":
        showHelp();
        break;
      case "search":
        await searchWikipedia(args);
        break;
      case "clear":
        clearScreen();
        break;
      case "about":
        showAbout();
        break;
      default:
        writeOutput(
          `⚠️ Perintah tidak dikenal: "${escapeHtml(cmdRaw)}". Ketik help`,
          true,
        );
        break;
    }
    scrollToBottom();
  }

  function setupInput() {
    inputField.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        const command = inputField.value;
        if (command.trim() !== "") {
          writeOutput(
            `<div class="output-line" style="margin:4px 0; display:flex; gap:8px;"><span class="prompt" style="color:#6ee7b7;">$</span> <span style="color:#94e6b2;">${escapeHtml(command.trim())}</span></div>`,
          );
          inputField.value = "";
          await processCommand(command);
        }
        scrollToBottom();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (commandHistory.length > 0) {
          if (historyIndex < 0) historyIndex = commandHistory.length;
          historyIndex--;
          if (historyIndex >= 0)
            inputField.value = commandHistory[historyIndex];
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          inputField.value = commandHistory[historyIndex];
        } else {
          historyIndex = -1;
          inputField.value = "";
        }
      }
    });

    // Event listener untuk tombol Enter (ikon)
    const enterBtn = document.getElementById("enterBtn");
    if (enterBtn) {
      enterBtn.addEventListener("click", async () => {
        const command = inputField.value;
        if (command.trim() !== "") {
          writeOutput(
            `<div class="output-line" style="margin:4px 0; display:flex; gap:8px;"><span class="prompt" style="color:#6ee7b7;">$</span> <span style="color:#94e6b2;">${escapeHtml(command.trim())}</span></div>`,
          );
          inputField.value = "";
          await processCommand(command);
        }
        scrollToBottom();
      });
    }
  }

  function updateTime() {
    const timeEl = document.getElementById("liveTime");
    if (timeEl) {
      const now = new Date();
      timeEl.innerText = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    }
  }
  setInterval(updateTime, 1000);
  updateTime();

  // Style for fadeOut animation
  const style = document.createElement("style");
  style.textContent = `
        @keyframes fadeOut {
            0% { opacity: 1; transform: translateX(0); }
            70% { opacity: 1; transform: translateX(0); }
            100% { opacity: 0; transform: translateX(20px); }
        }
        .copy-btn, .copy-translate-btn, .suggest-search { transition: all 0.2s ease; }
        .copy-btn:hover, .copy-translate-btn:hover, .suggest-search:hover { background: #3a4558 !important; transform: translateY(-1px); }
        .loading i { margin-right: 6px; }
    `;
  document.head.appendChild(style);

  window.addEventListener("DOMContentLoaded", () => {
    setupInput();
    inputField.focus();
  });
})();
