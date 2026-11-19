document.addEventListener("DOMContentLoaded", async () => {
  const domainNameEl = document.getElementById("domainName");
  const siteEnabled = document.getElementById("siteEnabled");
  const siteStatusText = document.getElementById("siteStatusText");
  const forceImportant = document.getElementById("forceImportant");
  const globalEnabled = document.getElementById("globalEnabled");
  const resetBtn = document.getElementById("resetBtn");
  const excludePatternsEl = document.getElementById("excludePatterns");
  const excludeErrorEl = document.getElementById("excludeError");
  const saveExcludeBtn = document.getElementById("saveExcludeBtn");

  let currentDomain = null;
  let saveFeedbackTimer = null;

  function showError(message) {
    excludeErrorEl.textContent = message;
    excludeErrorEl.style.display = "block";
  }

  function clearError() {
    excludeErrorEl.textContent = "";
    excludeErrorEl.style.display = "none";
  }

  async function safeStorageSet(items) {
    try {
      await chrome.storage.local.set(items);
      return true;
    } catch (error) {
      console.error("RTL Fixer: failed to save settings:", error);
      showError("Could not save settings: " + error.message);
      return false;
    }
  }

  function isDomainExcluded(domain, patterns) {
    if (!domain || !Array.isArray(patterns)) return false;
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, "i");
        if (regex.test(domain)) return true;
      } catch (error) {
        console.error("RTL Fixer: Invalid exclude pattern:", error);
      }
    }
    return false;
  }

  async function renderUI(loadExcludeTextarea = false) {
    const keys = ["globalEnabled", "excludePatterns"];
    const siteKey = currentDomain ? `site:${currentDomain}` : null;
    if (siteKey) keys.push(siteKey);

    const storage = await chrome.storage.local.get(keys);
    const globalState = Boolean(storage.globalEnabled);
    const excludePatterns = storage.excludePatterns || [];

    globalEnabled.checked = globalState;

    if (loadExcludeTextarea) {
      excludePatternsEl.value = excludePatterns.join("\n");
    }

    if (!currentDomain) {
      domainNameEl.textContent = "Unsupported Page";
      domainNameEl.style.color = "#ef4444";
      siteEnabled.checked = false;
      siteEnabled.disabled = true;
      forceImportant.checked = false;
      forceImportant.disabled = true;
      resetBtn.disabled = true;
      siteStatusText.textContent = "Not available on this page";
      siteStatusText.classList.remove("status-excluded");
      return;
    }

    domainNameEl.textContent = currentDomain;
    domainNameEl.style.color = "";

    const excluded = isDomainExcluded(currentDomain, excludePatterns);
    const hasCustomSettings = Boolean(siteKey && storage[siteKey]);
    const siteSettings = (siteKey && storage[siteKey]) || {
      enabled: null,
      forceImportant: false,
    };

    if (excluded) {
      siteEnabled.checked = false;
      siteEnabled.disabled = true;
      forceImportant.checked = false;
      forceImportant.disabled = true;
      resetBtn.disabled = !hasCustomSettings;
      siteStatusText.textContent = "Excluded by URL pattern";
      siteStatusText.classList.add("status-excluded");
      return;
    }

    const effectiveEnabled = siteSettings.enabled ?? globalState;

    siteEnabled.disabled = false;
    siteEnabled.checked = effectiveEnabled;
    forceImportant.checked = Boolean(siteSettings.forceImportant);
    forceImportant.disabled = !effectiveEnabled;
    resetBtn.disabled = !hasCustomSettings;

    siteStatusText.classList.remove("status-excluded");
    if (siteSettings.enabled === null || siteSettings.enabled === undefined) {
      siteStatusText.textContent = globalState
        ? "Following global setting (ON)"
        : "Fix text direction & layout";
    } else {
      siteStatusText.textContent = siteSettings.enabled
        ? "Enabled for this site"
        : "Disabled for this site";
    }
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (activeTab && activeTab.url && activeTab.url.startsWith("http")) {
    try {
      currentDomain = new URL(activeTab.url).hostname.toLowerCase();
    } catch {
      currentDomain = null;
    }
  }

  await renderUI(true);

  globalEnabled.addEventListener("change", async () => {
    const isGlobalOn = globalEnabled.checked;
    const ok = await safeStorageSet({ globalEnabled: isGlobalOn });
    if (!ok) {
      await renderUI();
      return;
    }

    if (isGlobalOn && currentDomain) {
      const siteKey = `site:${currentDomain}`;
      const data = await chrome.storage.local.get([siteKey]);
      if (data[siteKey] && data[siteKey].enabled === false) {
        await chrome.storage.local.remove(siteKey);
      }
    }

    await renderUI();
  });

  siteEnabled.addEventListener("change", async () => {
    if (!currentDomain) return;
    const siteKey = `site:${currentDomain}`;

    await safeStorageSet({
      [siteKey]: {
        enabled: siteEnabled.checked,
        forceImportant: forceImportant.checked,
      },
    });
    await renderUI();
  });

  forceImportant.addEventListener("change", async () => {
    if (!currentDomain) return;
    const siteKey = `site:${currentDomain}`;
    const data = await chrome.storage.local.get([siteKey]);
    const existing = data[siteKey] || { enabled: null, forceImportant: false };

    await safeStorageSet({
      [siteKey]: {
        enabled: existing.enabled ?? null,
        forceImportant: forceImportant.checked,
      },
    });
    await renderUI();
  });

  resetBtn.addEventListener("click", async () => {
    if (!currentDomain) return;
    await chrome.storage.local.remove(`site:${currentDomain}`);
    await renderUI();
  });

  saveExcludeBtn.addEventListener("click", async () => {
    const patternsText = excludePatternsEl.value.trim();
    const patterns = patternsText
      ? patternsText
          .split("\n")
          .map((p) => p.trim())
          .filter((p) => p.length > 0)
      : [];

    try {
      for (const pattern of patterns) {
        new RegExp(pattern, "i"); // Throws if invalid regex
        if (pattern.length > 200) {
          throw new Error(
            `Pattern "${pattern}" is too long (max 200 characters)`,
          );
        }
        if (/(\([^)]*[+*][^)]*\)[+*])/.test(pattern)) {
          throw new Error(
            `Pattern "${pattern}" may cause catastrophic backtracking`,
          );
        }
      }

      clearError();
      const ok = await safeStorageSet({ excludePatterns: patterns });
      if (!ok) return;

      await renderUI();

      if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
      saveExcludeBtn.textContent = "Saved!";
      saveExcludeBtn.classList.remove("btn-primary");
      saveExcludeBtn.classList.add("btn-success");
      saveFeedbackTimer = setTimeout(() => {
        saveExcludeBtn.textContent = "Save Exclude Patterns";
        saveExcludeBtn.classList.remove("btn-success");
        saveExcludeBtn.classList.add("btn-primary");
        saveFeedbackTimer = null;
      }, 1500);
    } catch (error) {
      showError("Invalid exclude pattern: " + error.message);
    }
  });
});
