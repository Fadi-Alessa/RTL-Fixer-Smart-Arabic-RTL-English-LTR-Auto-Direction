const feedbackTimers = new Map();

function getHostname(url) {
  try {
    if (!url || !url.startsWith("http")) return null;
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isDomainExcluded(domain, excludePatterns) {
  if (!domain || !Array.isArray(excludePatterns) || excludePatterns.length === 0) {
    return false;
  }
  for (const pattern of excludePatterns) {
    try {
      const regex = new RegExp(pattern, "i");
      if (regex.test(domain)) {
        return true;
      }
    } catch (error) {
      console.error(`RTL Fixer: Invalid exclude pattern ${pattern}:`, error);
    }
  }
  return false;
}

// One-time migration from chrome.storage.sync (v2.5) to chrome.storage.local (v2.6+)
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "update" && details.reason !== "install") return;

  try {
    const already = await chrome.storage.local.get(["__migratedFromSyncV2"]);
    if (already.__migratedFromSyncV2) return;

    const old = await chrome.storage.sync.get([
      "sitePreferences",
      "globalEnabled",
      "excludePatterns",
    ]);

    const toSet = { __migratedFromSyncV2: true };
    if (old.globalEnabled !== undefined) toSet.globalEnabled = old.globalEnabled;
    if (old.excludePatterns !== undefined) {
      toSet.excludePatterns = old.excludePatterns;
    }
    if (old.sitePreferences) {
      for (const [domain, prefs] of Object.entries(old.sitePreferences)) {
        toSet[`site:${domain}`] = prefs;
      }
    }

    await chrome.storage.local.set(toSet);
  } catch (error) {
    console.error("RTL Fixer: migration from sync storage failed:", error);
  }
});

async function getSiteState(domain) {
  if (!domain) return { enabled: false, forceImportant: false, excluded: false };

  const storage = await chrome.storage.local.get([
    "globalEnabled",
    "excludePatterns",
    `site:${domain}`,
  ]);
  const globalEnabled = Boolean(storage.globalEnabled);
  const excludePatterns = storage.excludePatterns || [];

  if (isDomainExcluded(domain, excludePatterns)) {
    return { enabled: false, forceImportant: false, excluded: true };
  }

  const siteState = storage[`site:${domain}`] || {
    enabled: null,
    forceImportant: false,
  };
  const enabled = siteState.enabled ?? globalEnabled;
  const forceImportant = Boolean(siteState.forceImportant);

  return { enabled, forceImportant, excluded: false };
}

async function updateTabIconAndBadge(
  tabId,
  isEnabled,
  skipIfFeedbackActive = true,
) {
  if (skipIfFeedbackActive && feedbackTimers.has(tabId)) return;

  try {
    if (isEnabled) {
      await chrome.action.setBadgeText({ text: "ON", tabId });
      await chrome.action.setBadgeBackgroundColor({ color: "#10b981", tabId });
    } else {
      await chrome.action.setBadgeText({ text: "OFF", tabId });
      await chrome.action.setBadgeBackgroundColor({ color: "#6b7280", tabId });
    }
  } catch {
    // Tab may have been closed before badge update completed
  }
}

async function updateTab(tabId, url) {
  const domain = getHostname(url);
  const state = await getSiteState(domain);

  await updateTabIconAndBadge(tabId, state.enabled);

  // Skip messaging/script injection on non-HTTP(S) pages (e.g., chrome://, about:blank)
  if (!domain) return;

  const message = {
    action: "APPLY_CSS_FIX",
    enabled: state.enabled,
    forceImportant: state.forceImportant,
  };

  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tabId, message).catch(() => {});
    } catch {
      // Restricted pages (e.g., Chrome Web Store) cannot be scripted
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    updateTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url) updateTab(tab.id, tab.url);
  } catch {}
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;

  const affectsAllTabs =
    "globalEnabled" in changes || "excludePatterns" in changes;
  const changedSiteKeys = Object.keys(changes).filter((key) =>
    key.startsWith("site:"),
  );

  if (!affectsAllTabs && changedSiteKeys.length === 0) return;

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;

    if (affectsAllTabs) {
      updateTab(tab.id, tab.url);
      continue;
    }

    const domain = getHostname(tab.url);
    if (domain && changedSiteKeys.includes(`site:${domain}`)) {
      updateTab(tab.id, tab.url);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const timer = feedbackTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    feedbackTimers.delete(tabId);
  }
});

async function showKeyboardFeedback(tabId, text, color, duration = 1500) {
  try {
    const existingTimer = feedbackTimers.get(tabId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
      feedbackTimers.delete(tabId);
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.url) {
          const domain = getHostname(tab.url);
          const state = await getSiteState(domain);
          await updateTabIconAndBadge(tabId, state.enabled, false);
        }
      } catch {
        // Tab was closed before timer fired
      }
    }, duration);

    feedbackTimers.set(tabId, timer);

    await chrome.action.setBadgeText({ text, tabId });
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
  } catch (error) {
    feedbackTimers.delete(tabId);
    console.error("RTL Fixer: Could not show keyboard feedback:", error);
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle_site") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const domain = getHostname(tab.url);
  if (!domain) return;

  const state = await getSiteState(domain);
  if (state.excluded) {
    await showKeyboardFeedback(tab.id, "!", "#f59e0b");
    return;
  }

  const newState = !state.enabled;

  // Register feedback timer before storage.onChanged fires so badge isn't clobbered
  await showKeyboardFeedback(
    tab.id,
    "✓",
    newState ? "#10b981" : "#6b7280",
  );

  try {
    await chrome.storage.local.set({
      [`site:${domain}`]: {
        enabled: newState,
        forceImportant: state.forceImportant,
      },
    });
  } catch (error) {
    console.error("RTL Fixer: failed to save toggle_site change:", error);
  }
});
