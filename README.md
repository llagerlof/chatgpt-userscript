## ChatGPT User Script

A lightweight userscript that adds:

- A floating "Prompts" navigator to ChatGPT conversations (jump to any user prompt).
- Sidebar accordions for the ChatGPT left menu: GPTs section and a new Projects section (both collapsed by default).

https://github.com/user-attachments/assets/1319cda0-0639-4a19-8395-82e3c12fab74

### Features
- **Floating panel**: Bottom‑right card, encapsulated in a Shadow DOM to avoid style clashes.
- **One‑click jump**: Smooth‑scroll to any user prompt; target flashes briefly.
- **Active sync**: IntersectionObserver marks the most visible prompt as active.
- **Auto‑update**: MutationObserver rebuilds the list on content changes.
- **SPA aware**: Detects route changes in ChatGPT and refreshes automatically.
- **Manual controls**: Refresh (↻) and Collapse (—) buttons.
- **Sidebar: GPTs accordion**: Adds a chevron to the "GPTs" header; click to collapse/expand its items (collapsed by default).
- **Sidebar: Projects accordion**: Inserts a "Projects" header at the top of the detected projects aside; click to collapse/expand its items (collapsed by default).
- **Zero dependencies**: `@grant none`; no external network/storage access.

### Works on
- `https://chatgpt.com/*`
- `https://www.chatgpt.com/*`

### Install
Use any userscript manager (Tampermonkey, Violentmonkey, etc.).

- **Tampermonkey**
  1. Open the Tampermonkey dashboard.
  2. Utilities → Import from file → select `chatgpt.userscript.user.js` → Install.
     - Alternatively: Create a new script and paste the file contents, then Save.

- **Violentmonkey**
  1. Open the Violentmonkey dashboard.
  2. Click + New → paste the contents of `chatgpt.userscript.user.js` → Save.
     - Alternatively: Use “Install from URL” if you host the raw file yourself.

### Use
1. Go to a ChatGPT conversation page (`/c/` or `/g/`).
2. A small "User turns" card appears at the bottom‑right.
3. Click an item to jump; it flashes briefly. The active item updates as you scroll.

### Configuration
- **Prompts navigator**: Targets are matched via `data-testid` and `data-turn` attributes. If ChatGPT’s DOM changes, update `TARGET_SELECTOR` in `chatgpt.userscript.user.js`.
- **Sidebar accordions**: The GPTs header is found via `a[data-testid="explore-gpts-button"]` or fallback text match. Projects aside is detected via `aside#snorlax-heading` or `aside[id^="snorlax"]`. Update these selectors if the site’s DOM changes.
- **Styling**: Tweak the styles inside the script; the prompts UI is isolated by Shadow DOM; sidebar accordions inject minimal global styles for chevron rotation.

### Privacy & security
- Runs locally in your browser via a userscript manager.
- No external requests; does not transmit your data.
- Uses standard web APIs (MutationObserver, IntersectionObserver, smooth scrolling).

### Compatibility notes
- ChatGPT’s DOM may change. If the list stops populating, adjust the selector.
- High z‑index keeps the panel visible; use Collapse (—) if it overlaps other UI.

### Development
- Source: `chatgpt.userscript.user.js`
- After edits, bump the `@version` header so your manager picks up updates.

#### Module structure (for maintainers)
- Prompts navigator and Sidebar accordions are kept as separate sections in the script. Look for:
  - "Floating prompts navigator" (default existing code)
  - "Sidebar accordions (GPTs + Projects)" section for the accordion logic and observers

### License
MIT
