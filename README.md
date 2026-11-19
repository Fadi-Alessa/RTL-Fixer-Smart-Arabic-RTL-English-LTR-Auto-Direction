<div align="center">

<img src="icon.png" alt="RTL Fixer Icon" width="96" height="96" />

# RTL Fixer: Smart Arabic/RTL & English/LTR Auto-Direction

**Fix broken mixed-language text on the web — automatically aligns Arabic/RTL right and English/LTR left on the same page.**

Built for **DeepSeek, ChatGPT, Claude, Gemini, Google AI Overviews, Gmail, Notion**, and any site mixing right-to-left and left-to-right content.

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-3b82f6?style=flat-square)](manifest.json)
[![Version](https://img.shields.io/badge/Version-2.6-10b981?style=flat-square)](manifest.json)
[![Browser](https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge%20%7C%20Brave-6366f1?style=flat-square)](#browser-compatibility)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-059669?style=flat-square)](#privacy)

</div>

---

<details dir="rtl">
<summary><strong>🇸🇦 نبذة سريعة بالعربية (اضغط للعرض)</strong></summary>

<br />

إضافة ذكية لمتصفح **Chrome** و **Edge** تقوم بإصلاح اتجاه النصوص المختلطة تلقائياً على المواقع مثل **DeepSeek** و **ChatGPT** و **نتائج بحث Google (AI Overviews)**:
- محاذاة النصوص **العربية** تلقائياً من **اليمين إلى اليسار (RTL)** مع الحفاظ على ترتيب الكلمات الإنجليزية بداخلها.
- إبقاء الفقرات والقوائم **الإنجليزية** من **اليسار إلى اليمين (LTR)** بشكل طبيعي.
- حماية كاملة للأكواد البرمجية والمعادلات الرياضية (`code`, `pre`, `KaTeX`, `MathJax`).
- دعم البث المباشر للردود في مواقع الذكاء الاصطناعي وتبديل الاتجاه أثناء الكتابة تلقائياً.

</details>

---

## Why RTL Fixer?

Most RTL extensions blindly force `direction: rtl` onto the entire page—breaking English paragraphs, flipping bullet points, reversing punctuation, and distorting page layouts.

**RTL Fixer** analyzes each text block individually so that on the very same page:
- **Arabic / Hebrew / Persian / Urdu** paragraphs, lists, headings, and table cells flow **Right-to-Left (RTL)** from the right edge.
- **English / Latin** paragraphs, blockquotes, and bullet lists stay **Left-to-Right (LTR)** from the left edge.
- **Mixed Arabic sentences** containing technical terms (e.g. `الإجابة هي MAE و RMSE`) keep natural RTL reading order without scrambling words or punctuation.
- **Code blocks & math formulas** always stay cleanly isolated in **LTR**.

<!--
## Before & After

> Add screenshots to a `screenshots/` folder and uncomment this table to showcase the extension visually:

| Before | After |
| :---: | :---: |
| ![Before](screenshots/before.png) | ![After](screenshots/after.png) |
-->

## Key Features

- **Smart Per-Element Detection**: Automatically assigns `RTL` or `LTR` per paragraph, list, heading, blockquote, table cell, and prose `<div>` (including Google AI Overviews with inline citation chips).
- **Real-Time AI Streaming Support**: Uses a lightweight `MutationObserver` to format streamed tokens live as responses generate in DeepSeek, ChatGPT, Claude, Gemini, and SPAs.
- **Live Typing Direction**: Automatically switches direction as you type Arabic or English inside `<input>`, `<textarea>`, and `contenteditable` chat boxes.
- **Code & Math Protection**: Isolates `<pre>`, `<code>`, `<kbd>`, `<samp>`, CodeMirror, Monaco Editor, KaTeX, and MathJax in LTR so syntax and parentheses never flip.
- **Global & Per-Site Controls**: Toggle globally across all sites, override individual domains, or click **Reset Site Settings** to inherit the global setting again.
- **Force Styles (`!important`) Mode**: Overrides stubborn site CSS while still keeping Arabic right-aligned and English left-aligned.
- **Exclude URL Patterns**: Skip specific domains with custom regex patterns (one per line) with built-in syntax and ReDoS safety validation.
- **Quick Keyboard Shortcut**: Toggle the current site instantly with `Ctrl+Shift+E` (Windows/Linux) or `Cmd+Shift+E` (Mac), with instant toolbar badge feedback (`✓` / `!`).
- **Auto Dark & Light Popup UI**: Adapts automatically to your system theme, with live `ON` / `OFF` status badges in the toolbar.

## Installation

### Load Unpacked (Chrome / Edge / Brave)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/fadi-essa/BidiFixer-Layout-Direction.git
   ```
2. Open `chrome://extensions/` (or `edge://extensions/`).
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the cloned `BidiFixer-Layout-Direction` folder.
5. Pin **RTL Fixer** to your browser toolbar.

### Chrome Web Store
*Coming soon.*

## Usage

| Control | What it does |
| :--- | :--- |
| **Enable on all sites** | Turns auto-direction ON/OFF globally for all websites |
| **Enable on this site** | Overrides the global setting for the current domain only |
| **Force Styles (`!important`)** | Adds `!important` to injected rules if a site overrides alignment |
| **Reset Site Settings** | Removes the current site's custom override to follow the global toggle |
| **Exclude URL Patterns** | Regex rules (one per line, e.g. `example\.com`) that always disable the extension on matching domains |
| **`Ctrl+Shift+E` / `Cmd+Shift+E`** | Quickly toggles the extension ON/OFF for the active site |

## How It Works

1. `content.js` scans text blocks (`p`, `li`, `ul`, `ol`, `blockquote`, `h1`–`h6`, `td`, `th`, prose `div`s, and text inputs) while skipping code, math, SVG, and UI buttons/citation chips.
2. Each block is classified by its strong RTL vs. LTR characters and first strong character, then tagged with `data-bidi-dir="rtl"` or `data-bidi-dir="ltr"`.
3. A dynamically injected stylesheet applies logical `direction`, `text-align: start`, and `unicode-bidi: isolate` rules per tag—without flipping the whole page layout or breaking English text.
4. Disabling the extension cleanly removes the injected `<style>`, disconnects observers, and strips all `data-bidi-dir` attributes.

## Technical Details

- **Manifest Version**: Manifest V3
- **Permissions**:
  - `storage` — Saves global, per-site (`site:<domain>`), and exclude-pattern preferences in `chrome.storage.local` (with automatic migration from `chrome.storage.sync`).
  - `tabs` — Updates toolbar `ON`/`OFF` badges when switching or loading tabs.
  - `scripting` — Injects the content script on already-open tabs when settings change.

| File | Purpose |
| :--- | :--- |
| [`manifest.json`](manifest.json) | Extension metadata, permissions, and keyboard shortcuts |
| [`background.js`](background.js) | Service worker for per-site state, storage migration, badges, and shortcuts |
| [`content.js`](content.js) | Smart per-element RTL/LTR detector, CSS injector, and live `MutationObserver` |
| [`popup.html`](popup.html) | Responsive dark/light popup interface |
| [`popup.js`](popup.js) | Popup state management and regex pattern validation |

## Browser Compatibility

- Google Chrome (v88+)
- Microsoft Edge (v88+)
- Brave, Opera, Vivaldi, and other Chromium-based browsers

## Privacy

This extension runs **100% locally** in your browser. It collects no analytics, makes zero external network requests, and stores all settings solely in your browser's local storage (`chrome.storage.local`).

## Contributing

Issues, bug reports (screenshots of tricky websites are super helpful!), and pull requests are always welcome.

## License

This project is provided as-is for educational and practical use.
