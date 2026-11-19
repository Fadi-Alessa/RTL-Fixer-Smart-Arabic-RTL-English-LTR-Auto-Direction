if (typeof window.__arabicFixerLoaded === "undefined") {
  window.__arabicFixerLoaded = true;
  const STYLE_ID = "bidi-fixer-style";
  const ATTR_NAME = "data-bidi-dir";

  // Strong RTL letters (Arabic, Hebrew, Syriac, Thaana, NKo, presentation forms)
  const RTL_CHAR_RE =
    /[\u0591-\u05F4\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF\u0710-\u074F\u0750-\u077F\u0780-\u07B1\u07C0-\u07EA\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/g;
  // Strong LTR letters (Latin, Extended Latin, Greek, Cyrillic)
  const LTR_CHAR_RE =
    /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u0370-\u03FF\u0400-\u04FF]/g;
  // First strong directional character
  const FIRST_STRONG_RE =
    /([\u0591-\u05F4\u0621-\u064A\u066E-\u06D3\u06FA-\u06FF\u0710-\u074F\u0750-\u077F\u0780-\u07B1\u07C0-\u07EA\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC])|([A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u0370-\u03FF\u0400-\u04FF])/;

  const BLOCK_SELECTOR =
    "p, li, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, dt, dd, th, td, figcaption, caption";
  const INPUT_SELECTOR =
    'input:not([type="url"]):not([type="email"]):not([type="tel"]):not([type="number"]):not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="range"]):not([type="color"]):not([type="file"]), textarea, [contenteditable="true"], [contenteditable=""]';
  const SKIP_ANCESTOR_SELECTOR =
    'pre, code, kbd, samp, script, style, noscript, svg, math, .katex, .MathJax, [class*="hljs"], [class*="CodeMirror"], [class*="monaco-editor"]';
  const UI_ANCESTOR_SELECTOR =
    'nav, header, footer, aside, button, [role="button"], [role="navigation"], [role="menu"], [role="menubar"], [role="toolbar"]';
  const STRUCTURAL_BLOCK_SELECTOR =
    "p, ul, ol, li, blockquote, pre, table, section, article, header, footer, nav, aside, h1, h2, h3, h4, h5, h6";

  let currentEnabled = false;
  let currentForceImportant = false;
  let observer = null;
  let headObserver = null;
  let debounceTimer = null;
  let pendingNodes = new Set();

  function generateCSS(forceImportant) {
    const imp = forceImportant ? " !important" : "";

    return `
      html [${ATTR_NAME}="rtl"] {
        direction: rtl${imp};
        text-align: start${imp};
        unicode-bidi: isolate${imp};
      }
      html ul[${ATTR_NAME}="rtl"],
      html ol[${ATTR_NAME}="rtl"] {
        padding-inline-start: 1.5em${imp};
        padding-inline-end: 0${imp};
      }
      html [${ATTR_NAME}="ltr"] {
        direction: ltr${imp};
        unicode-bidi: isolate${imp};
      }
      html p[${ATTR_NAME}="ltr"],
      html li[${ATTR_NAME}="ltr"],
      html ul[${ATTR_NAME}="ltr"],
      html ol[${ATTR_NAME}="ltr"],
      html blockquote[${ATTR_NAME}="ltr"],
      html dt[${ATTR_NAME}="ltr"],
      html dd[${ATTR_NAME}="ltr"],
      html td[${ATTR_NAME}="ltr"],
      html th[${ATTR_NAME}="ltr"],
      html textarea[${ATTR_NAME}="ltr"],
      html input[${ATTR_NAME}="ltr"],
      html [contenteditable][${ATTR_NAME}="ltr"],
      html [${ATTR_NAME}="rtl"] [${ATTR_NAME}="ltr"],
      html [dir="rtl"] [${ATTR_NAME}="ltr"] {
        text-align: start${imp};
      }
      pre, kbd, samp,
      pre *,
      [class*="hljs"],
      [class*="CodeMirror"],
      [class*="monaco-editor"] {
        direction: ltr !important;
        text-align: left !important;
        unicode-bidi: isolate !important;
      }
      code, .katex, .MathJax, math {
        direction: ltr !important;
        unicode-bidi: isolate !important;
      }
    `;
  }

  function detectTextDirection(text) {
    if (!text) return null;

    const rtlMatches = text.match(RTL_CHAR_RE);
    const ltrMatches = text.match(LTR_CHAR_RE);
    const rtlCount = rtlMatches ? rtlMatches.length : 0;
    const ltrCount = ltrMatches ? ltrMatches.length : 0;

    if (rtlCount === 0 && ltrCount === 0) return null;
    if (rtlCount === 0) return "ltr";
    if (ltrCount === 0) return "rtl";

    const total = rtlCount + ltrCount;
    const rtlRatio = rtlCount / total;
    const firstStrong = FIRST_STRONG_RE.exec(text);
    const startsWithRTL = Boolean(firstStrong && firstStrong[1]);

    if (startsWithRTL) {
      return rtlRatio >= 0.2 ? "rtl" : "ltr";
    }
    return rtlRatio >= 0.4 ? "rtl" : "ltr";
  }

  function extractRelevantText(el, skipChildDivs = false) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      return el.value || "";
    }

    const isListItem = el.tagName === "LI";

    // Collect text while skipping code/math/script/style/button subtrees
    // (and nested lists inside <li>, or nested <div> chips when scanning a paragraph <div>)
    let text = "";
    const stack = [el];
    while (stack.length > 0) {
      const node = stack.pop();
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i];
        if (child.nodeType === 3) {
          text += child.nodeValue;
        } else if (child.nodeType === 1) {
          if (
            child.matches &&
            (child.matches(SKIP_ANCESTOR_SELECTOR) ||
              child.matches('button, [role="button"]'))
          ) {
            continue;
          }
          if (skipChildDivs && child.tagName === "DIV") {
            continue;
          }
          if (
            isListItem &&
            (child.tagName === "UL" ||
              child.tagName === "OL" ||
              child.tagName === "BLOCKQUOTE" ||
              child.tagName === "TABLE")
          ) {
            continue;
          }
          stack.push(child);
        }
      }
    }
    return text;
  }

  function setDirAttr(el, dir) {
    if (!dir) {
      if (el.hasAttribute(ATTR_NAME)) el.removeAttribute(ATTR_NAME);
      return;
    }
    if (el.getAttribute(ATTR_NAME) !== dir) {
      el.setAttribute(ATTR_NAME, dir);
    }
  }

  function processElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.closest && el.closest(SKIP_ANCESTOR_SELECTOR)) return;

    if (el.matches && el.matches(INPUT_SELECTOR)) {
      const dir = detectTextDirection(extractRelevantText(el));
      setDirAttr(el, dir);
      return;
    }

    if (el.matches && el.matches(BLOCK_SELECTOR)) {
      const dir = detectTextDirection(extractRelevantText(el));
      setDirAttr(el, dir);
      return;
    }

    // Handle prose/paragraph <div> elements (e.g., Google AI Overviews, chat bubbles)
    // including ones that contain inline citation chips or badges built with nested <div>s
    if (
      el.tagName === "DIV" &&
      !(el.closest && el.closest(UI_ANCESTOR_SELECTOR)) &&
      !(el.querySelector && el.querySelector(STRUCTURAL_BLOCK_SELECTOR))
    ) {
      const text = extractRelevantText(el, true).trim();
      if (!text) return;
      const dir = detectTextDirection(text);
      if (dir === "rtl") {
        setDirAttr(el, "rtl");
      } else if (dir === "ltr") {
        if (
          el.parentElement &&
          el.parentElement.closest(`[${ATTR_NAME}="rtl"], [dir="rtl"]`)
        ) {
          setDirAttr(el, "ltr");
        } else if (el.getAttribute(ATTR_NAME) === "rtl") {
          el.removeAttribute(ATTR_NAME);
        }
      }
    }
  }

  function processSubtree(root) {
    if (!root || root.nodeType !== 1) return;
    processElement(root);

    if (typeof root.querySelectorAll === "function") {
      const blocks = root.querySelectorAll(
        `${BLOCK_SELECTOR}, ${INPUT_SELECTOR}, div`,
      );
      for (let i = 0; i < blocks.length; i++) {
        processElement(blocks[i]);
      }
    }
  }

  function clearDirections() {
    if (typeof document.querySelectorAll !== "function") return;
    const tagged = document.querySelectorAll(`[${ATTR_NAME}]`);
    for (let i = 0; i < tagged.length; i++) {
      tagged[i].removeAttribute(ATTR_NAME);
    }
  }

  function injectStyleTag(forceImportant) {
    const cssCode = generateCSS(forceImportant);
    let styleEl = document.getElementById(STYLE_ID);
    if (styleEl) {
      if (styleEl.textContent !== cssCode) {
        styleEl.textContent = cssCode;
      }
    } else {
      const container = document.head || document.documentElement;
      if (!container) return;
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.textContent = cssCode;
      container.appendChild(styleEl);
    }
  }

  function handleUserInput(event) {
    if (!currentEnabled) return;
    const target = event.target;
    if (
      target &&
      target.nodeType === 1 &&
      target.matches &&
      target.matches(INPUT_SELECTOR)
    ) {
      processElement(target);
    }
  }

  function flushPendingNodes() {
    debounceTimer = null;
    if (!currentEnabled) {
      pendingNodes.clear();
      return;
    }

    const nodes = Array.from(pendingNodes);
    pendingNodes.clear();

    const containersToUpdate = new Set();
    for (const node of nodes) {
      if (!node || !node.isConnected) continue;
      processSubtree(node);

      if (node.parentElement && node.parentElement.closest) {
        const parentBlock = node.parentElement.closest(BLOCK_SELECTOR);
        if (parentBlock) containersToUpdate.add(parentBlock);
        const parentDiv = node.parentElement.closest("div");
        if (parentDiv) containersToUpdate.add(parentDiv);
        const parentListOrQuote =
          node.parentElement.closest("ul, ol, blockquote");
        if (parentListOrQuote) containersToUpdate.add(parentListOrQuote);
      }
    }

    for (const container of containersToUpdate) {
      if (container.isConnected) processElement(container);
    }
  }

  function setupObservers() {
    disconnectObservers();

    const headTarget = document.head || document.documentElement;
    if (headTarget) {
      headObserver = new MutationObserver(() => {
        if (currentEnabled && !document.getElementById(STYLE_ID)) {
          injectStyleTag(currentForceImportant);
        }
      });
      headObserver.observe(headTarget, { childList: true });
    }

    const bodyTarget = document.body || document.documentElement;
    if (bodyTarget) {
      observer = new MutationObserver((mutations) => {
        if (!currentEnabled) return;

        for (const mutation of mutations) {
          if (mutation.type === "characterData") {
            const parent = mutation.target.parentElement;
            if (parent) pendingNodes.add(parent);
          } else if (mutation.type === "childList") {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
              const added = mutation.addedNodes[i];
              if (added.nodeType === 1) {
                pendingNodes.add(added);
              } else if (added.nodeType === 3 && mutation.target.nodeType === 1) {
                pendingNodes.add(mutation.target);
              }
            }
          }
        }

        if (pendingNodes.size > 0 && !debounceTimer) {
          debounceTimer = setTimeout(flushPendingNodes, 80);
        }
      });

      observer.observe(bodyTarget, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    document.addEventListener("input", handleUserInput, true);
  }

  function disconnectObservers() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (headObserver) {
      headObserver.disconnect();
      headObserver = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingNodes.clear();
    document.removeEventListener("input", handleUserInput, true);
  }

  function applyStyles(enabled, forceImportant) {
    currentEnabled = Boolean(enabled);
    currentForceImportant = Boolean(forceImportant);

    if (currentEnabled) {
      injectStyleTag(currentForceImportant);
      if (document.body) {
        processSubtree(document.body);
      }
      setupObservers();
    } else {
      disconnectObservers();
      const styleEl = document.getElementById(STYLE_ID);
      if (styleEl) styleEl.remove();
      clearDirections();
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "APPLY_CSS_FIX") {
      applyStyles(request.enabled, request.forceImportant);
      sendResponse({ success: true });
    }
    return false;
  });

  window.addEventListener("pagehide", () => {
    disconnectObservers();
  });

  try {
    const domain = window.location.hostname.toLowerCase();
    const siteKey = `site:${domain}`;

    chrome.storage.local.get(
      ["globalEnabled", "excludePatterns", siteKey],
      (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "RTL Fixer: Storage access error:",
            chrome.runtime.lastError,
          );
          return;
        }

        const globalEnabled = Boolean(result.globalEnabled);
        const excludePatterns = result.excludePatterns || [];
        const siteSettings = result[siteKey] || {
          enabled: null,
          forceImportant: false,
        };

        let isExcluded = false;
        for (const pattern of excludePatterns) {
          try {
            const regex = new RegExp(pattern, "i");
            if (regex.test(domain)) {
              isExcluded = true;
              break;
            }
          } catch (error) {
            console.error(
              `RTL Fixer: Invalid exclude pattern ${pattern}:`,
              error,
            );
          }
        }

        if (isExcluded) {
          return;
        }

        const isEnabled = siteSettings.enabled ?? globalEnabled;
        const forceImportant = Boolean(siteSettings.forceImportant);

        if (isEnabled) {
          applyStyles(true, forceImportant);
        }
      },
    );
  } catch (error) {
    console.error("RTL Fixer: Error during initialization:", error);
  }
}
