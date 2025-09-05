// ==UserScript==
// @name        ChatGPT User Script
// @namespace   Violentmonkey Scripts
// @match       https://chatgpt.com/*
// @match       https://www.chatgpt.com/*
// @grant       none
// @version     1.2
// @author      Lawrence Lagerlof
// @description Floating prompts navigator + GPTs/Projects sidebar accordions (collapsed by default)
// @run-at      document-idle
// ==/UserScript==

(() => {
    "use strict";
  
    const MENU_ID = "cgpt-user-script";
    const TARGET_SELECTOR = 'article[data-testid^="conversation-turn-"][data-turn="user"]';
    const STORAGE_KEYS = {
      promptsCollapsed: "cgpt:promptsCollapsed",
      gptsCollapsed: "cgpt:gptsCollapsed",
      projectsCollapsed: "cgpt:projectsCollapsed",
    };

    function storageGetBool(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        if (v === null) return fallback;
        return v === "true";
      } catch {
        return fallback;
      }
    }

    function storageSetBool(key, value) {
      try { localStorage.setItem(key, value ? "true" : "false"); } catch { /* ignore */ }
    }
  
    // Create container with Shadow DOM to avoid style clashes
    function createMenuRoot() {
      if (document.getElementById(MENU_ID)) return document.getElementById(MENU_ID);
  
      const host = document.createElement("div");
      host.id = MENU_ID;
      Object.assign(host.style, {
        position: "fixed",
        right: "12px",
        bottom: "12px",
        zIndex: "2147483647",
      });
  
      const shadow = host.attachShadow({ mode: "open" });
  
      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; }
        .card {
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji";
          font-size: 12px;
          color: #0f172a;
          background: #ffffffcc;
          backdrop-filter: blur(6px);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(2, 6, 23, 0.15);
          max-width: 280px;
          max-height: 50vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafcaa;
        }
        .title {
          font-weight: 600;
          font-size: 12px;
          letter-spacing: .02em;
        }
        .actions { display: flex; gap: 6px; }
        button {
          all: unset;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          font-size: 11px;
        }
        button:hover { background: #f1f5f9; }
        #refresh { display: none !important; }
        .list {
          overflow: auto;
          padding: 6px;
          flex: 1;
          min-height: 0;
        }
        .item {
          display: grid;
          grid-template-columns: 6px 1fr;
          grid-template-rows: auto auto;
          align-items: start;
          gap: 4px 6px;
          padding: 6px 8px;
          border-radius: 8px;
          text-decoration: none;
          color: inherit;
          line-height: 1.2;
        }
        .item:hover { background: #f1f5f9; }
        .item.active { background: #e2e8f0; font-weight: 600; }
        .dot {
          width: 6px; height: 6px; border-radius: 50%; background: #0ea5e9;
          grid-column: 1; grid-row: 1 / span 2; align-self: center;
        }
        .line1 { grid-column: 2; grid-row: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
        .line2 { grid-column: 2; grid-row: 2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: inherit; }
        .ellipsis { color: #94a3b8; margin-left: 4px; }
        .empty {
          padding: 10px;
          color: #64748b;
          font-style: italic;
        }
        .collapsed .list { display: none; }
      `;
  
      const wrap = document.createElement("div");
      wrap.className = "card";
      wrap.innerHTML = `
        <div class="header">
          <div class="title">User prompts</div>
          <div class="actions">
            <button id="refresh" title="Refresh list">↻</button>
            <button id="collapse" title="Collapse/Expand">—</button>
          </div>
        </div>
        <div class="list" id="list"><div class="empty">No user prompts found.</div></div>
      `;
  
      shadow.append(style, wrap);
      document.documentElement.appendChild(host);
  
      // Collapse toggle
      const collapseBtn = shadow.getElementById("collapse");
      // Set initial collapsed state from storage (default: open)
      const initialPromptsCollapsed = storageGetBool(STORAGE_KEYS.promptsCollapsed, false);
      if (initialPromptsCollapsed) wrap.classList.add("collapsed");
      // Set initial glyph based on collapsed state
      collapseBtn.textContent = initialPromptsCollapsed ? "□" : "—";
      collapseBtn.addEventListener("click", () => {
        wrap.classList.toggle("collapsed");
        const isCollapsed = wrap.classList.contains("collapsed");
        storageSetBool(STORAGE_KEYS.promptsCollapsed, isCollapsed);
        // Update glyph when toggled
        collapseBtn.textContent = isCollapsed ? "□" : "—";
      });
  
      // Manual refresh
      const refreshBtn = shadow.getElementById("refresh");
      refreshBtn.addEventListener("click", () => rebuildList());
  
      return host;
    }
  
    // Extract the turn id from data-testid="conversation-turn-<int>"
    function extractTurnId(el) {
      const testId = el.getAttribute("data-testid") || "";
      const m = testId.match(/^conversation-turn-(\d+)$/);
      return m ? m[1] : null;
    }

    // Find the innermost .whitespace-pre-wrap within an article
    function findInnermostPromptNode(articleEl) {
      const candidates = Array.from(articleEl.querySelectorAll('.whitespace-pre-wrap'));
      if (!candidates.length) return null;
      // Choose the node that has no descendant with the same class
      for (const node of candidates) {
        if (!node.querySelector('.whitespace-pre-wrap')) return node;
      }
      // Fallback to the last one
      return candidates[candidates.length - 1];
    }

    // Extract first up-to-7 words of the prompt and always append ellipsis
    function extractPromptPreview(articleEl) {
      const node = findInnermostPromptNode(articleEl);
      if (!node) return "";
      const raw = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!raw) return "";
      const words = raw.split(" ").filter(Boolean);
      const preview = words.slice(0, 7).join(" ");
      return preview;
    }
  
    // Build / rebuild list
    function rebuildList() {
      createMenuRoot(); // ensure exists
      const shadow = document.getElementById(MENU_ID).shadowRoot;
      const list = shadow.getElementById("list");
      list.innerHTML = "";
  
      const nodes = Array.from(document.querySelectorAll(TARGET_SELECTOR));
      if (!nodes.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No user prompts found.";
        list.appendChild(empty);
        return;
      }
  
      const frag = document.createDocumentFragment();
      let seq = 1;
      for (const el of nodes) {
        const id = extractTurnId(el);
        if (!id) continue;
  
        // Ensure each target has an id to anchor (for native focus/scroll)
        if (!el.id) el.id = `cgptuserscript-target-${id}`;
  
        const a = document.createElement("a");
        a.href = `#${el.id}`;
        a.className = "item";
        a.dataset.targetId = el.id;
        const dot = document.createElement("span");
        dot.className = "dot";
        a.appendChild(dot);

        const line1 = document.createElement("div");
        line1.className = "line1";
        line1.textContent = `prompt ${seq++}`;
        a.appendChild(line1);

        const line2 = document.createElement("div");
        line2.className = "line2";
        const previewText = extractPromptPreview(el);
        const previewSpan = document.createElement("span");
        previewSpan.className = "preview";
        previewSpan.textContent = previewText;
        const ellipsisSpan = document.createElement("span");
        ellipsisSpan.className = "ellipsis";
        ellipsisSpan.textContent = "…";
        line2.append(previewSpan, ellipsisSpan);
        a.appendChild(line2);
  
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const target = document.getElementById(a.dataset.targetId);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
            // brief highlight
            flashTarget(target);
            setActiveItem(a);
          }
        });
  
        frag.appendChild(a);
      }
      list.appendChild(frag);
      updateActiveByViewport(); // set initial active
    }
  
    function setActiveItem(anchorEl) {
      const shadow = document.getElementById(MENU_ID).shadowRoot;
      const items = shadow.querySelectorAll(".item");
      items.forEach(i => i.classList.toggle("active", i === anchorEl));
    }
  
    function flashTarget(el) {
      el.animate(
        [{ boxShadow: "0 0 0 rgba(14,165,233,0)" }, { boxShadow: "0 0 0 4px rgba(14,165,233,0.35)" }, { boxShadow: "0 0 0 rgba(14,165,233,0)" }],
        { duration: 800, easing: "ease" }
      );
    }
  
    // Keep active item in sync with viewport
    let io;
    function setupIntersectionObserver() {
      if (io) io.disconnect();
      io = new IntersectionObserver((entries) => {
        // Find the first mostly-visible target
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  
        if (visible) {
          const id = visible.target.id;
          const shadow = document.getElementById(MENU_ID).shadowRoot;
          const item = shadow.querySelector(`.item[data-target-id="${CSS.escape(id)}"]`);
          if (item) setActiveItem(item);
        }
      }, { root: null, threshold: [0.55] });
  
      document.querySelectorAll(TARGET_SELECTOR).forEach(el => io.observe(el));
    }
  
    function updateActiveByViewport() {
      // Force trigger by observing current elements again
      setupIntersectionObserver();
    }
  
    // MutationObserver to detect new turns (dynamic content)
    let mo;
    let schedule;
    function setupMutationObserver() {
      if (mo) mo.disconnect();
      mo = new MutationObserver((mutations) => {
        // Throttle rebuilds when relevant nodes are added/removed/attributes changed
        let relevant = false;
        for (const m of mutations) {
          if (m.type === "childList") {
            if ([...m.addedNodes, ...m.removedNodes].some(n =>
              n.nodeType === 1 && (n.matches?.(TARGET_SELECTOR) || n.querySelector?.(TARGET_SELECTOR))
            )) { relevant = true; break; }
          } else if (m.type === "attributes" && m.target instanceof Element) {
            if (m.target.matches(TARGET_SELECTOR) && (m.attributeName === "data-testid" || m.attributeName === "data-turn" || m.attributeName === "id")) {
              relevant = true; break;
            }
          } else if (m.type === "characterData") {
            const node = m.target;
            const parent = node.parentElement || node.parentNode?.parentElement; // handle text nodes
            if (parent && parent.closest?.(TARGET_SELECTOR)) { relevant = true; break; }
          }
        }
        if (relevant) {
          clearTimeout(schedule);
          schedule = setTimeout(() => {
            rebuildList();
          }, 200);
        }
      });
  
      mo.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
        attributeFilter: ["data-testid", "data-turn", "id"],
      });
    }
  
    // Handle SPA route changes (ChatGPT is an SPA)
    let lastUrl = location.href;
    function watchUrlChanges() {
      const check = () => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          // Give the UI a moment to render
          setTimeout(() => rebuildList(), 500);
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }
  
    /* ---------------------------------------------
     * Sidebar accordions (GPTs + Projects)
     * - Kept self-contained to avoid coupling with the prompts navigator
     * --------------------------------------------- */
    const ACCORDION_ARROW_BTN_CLASS = "gm-gpts-accordion-btn";
    const ACCORDION_COLLAPSED_ATTR = "data-gm-collapsed";
    const PROJECTS_HEADER_ID = "gm-projects-header";

    // Shared utils for accordions
    function createAccordionArrowButton() {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = ACCORDION_ARROW_BTN_CLASS;
      btn.setAttribute("aria-expanded", "false");
      btn.title = "Collapse/expand";
      btn.style.border = "none";
      btn.style.background = "transparent";
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.padding = "4px";
      btn.style.marginLeft = "6px";
      btn.style.cursor = "pointer";
      btn.style.flex = "0 0 auto";
      btn.style.width = "28px";
      btn.style.height = "28px";
      btn.style.minWidth = "28px";

      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;

      const styleId = "gm-gpts-accordion-styles";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          .${ACCORDION_ARROW_BTN_CLASS}[${ACCORDION_COLLAPSED_ATTR}="true"] svg { transform: rotate(0deg); transition: transform .18s ease; }
          .${ACCORDION_ARROW_BTN_CLASS}[${ACCORDION_COLLAPSED_ATTR}="false"] svg { transform: rotate(90deg); transition: transform .18s ease; }
          .gm-projects-header { display: flex; align-items: center; gap: 0.75rem; padding: .35rem .5rem; cursor: default; user-select: none; }
          .gm-projects-header .gm-projects-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; }
          /* Ensure that when Projects is collapsed, any dynamically inserted siblings stay hidden */
          aside[data-gm-projects-collapsed="true"] > :not(#gm-projects-header) { display: none !important; }
        `;
        document.head.appendChild(style);
      }

      return btn;
    }

    function accordionToggleItems(items, collapse, btn) {
      items.forEach((i) => {
        if (collapse) {
          if (i.style.display !== "none") {
            i.setAttribute("data-gm-prev-display", i.style.display || "");
          }
          i.style.display = "none";
        } else {
          const prev = i.getAttribute("data-gm-prev-display");
          if (prev !== null) {
            i.style.display = prev;
            i.removeAttribute("data-gm-prev-display");
          } else {
            i.style.display = "";
          }
        }
      });
      if (btn) {
        btn.setAttribute(ACCORDION_COLLAPSED_ATTR, collapse ? "true" : "false");
        btn.setAttribute("aria-expanded", (!collapse).toString());
      }
    }

    // GPTs accordion
    function isGptItemAnchor(a) {
      if (!a || a.tagName !== "A") return false;
      const href = a.getAttribute("href") || "";
      return href.startsWith("/g/") || href.includes("/g/g-");
    }

    function collectSiblingGptItems(headerAnchor) {
      const items = [];
      let el = headerAnchor.nextElementSibling;
      while (el) {
        if (el.matches && el.matches('a[data-testid="explore-gpts-button"]')) break;
        if (isGptItemAnchor(el)) items.push(el);
        el = el.nextElementSibling;
      }
      return items;
    }

    function addAccordionToGptsHeader(headerAnchor) {
      if (!headerAnchor) return;
      if (headerAnchor.querySelector(`.${ACCORDION_ARROW_BTN_CLASS}`)) return;

      const btn = createAccordionArrowButton();
      const initialCollapsed = storageGetBool(STORAGE_KEYS.gptsCollapsed, true);
      btn.setAttribute(ACCORDION_COLLAPSED_ATTR, initialCollapsed ? "true" : "false");
      btn.setAttribute("aria-expanded", (!initialCollapsed).toString());

      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const items = collectSiblingGptItems(headerAnchor);
        const collapsed = btn.getAttribute(ACCORDION_COLLAPSED_ATTR) === "true";
        const nextCollapse = !collapsed;
        accordionToggleItems(items, nextCollapse, btn);
        storageSetBool(STORAGE_KEYS.gptsCollapsed, nextCollapse);
      });

      btn.addEventListener("mousedown", (e) => e.stopPropagation());
      btn.addEventListener("mouseup", (e) => e.stopPropagation());

      headerAnchor.appendChild(btn);

      const items = collectSiblingGptItems(headerAnchor);
      accordionToggleItems(items, initialCollapsed, btn);
    }

    // Projects accordion
    function addProjectsAccordion(aside) {
      if (!aside || aside.getAttribute("data-gm-has-projects") === "true") return;

      if (document.getElementById(PROJECTS_HEADER_ID)) {
        aside.setAttribute("data-gm-has-projects", "true");
        return;
      }

      const headerDiv = document.createElement("div");
      headerDiv.id = PROJECTS_HEADER_ID;
      headerDiv.className = "group __menu-item hoverable gap-1.5 gm-projects-header";
      headerDiv.setAttribute("tabindex", "0");

      const iconWrapper = document.createElement("div");
      iconWrapper.className = "flex items-center justify-center icon";
      iconWrapper.style.flex = "0 0 auto";
      iconWrapper.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M7.94556 14.0277C7.9455 12.9376 7.06204 12.054 5.97192 12.054C4.88191 12.0542 3.99835 12.9376 3.99829 14.0277C3.99829 15.1177 4.88188 16.0012 5.97192 16.0013C7.06207 16.0013 7.94556 15.1178 7.94556 14.0277ZM16.0012 14.0277C16.0012 12.9376 15.1177 12.054 14.0276 12.054C12.9375 12.0541 12.054 12.9376 12.054 14.0277C12.054 15.1178 12.9375 16.0012 14.0276 16.0013C15.1177 16.0013 16.0012 15.1178 16.0012 14.0277ZM7.94556 5.97201C7.94544 4.88196 7.062 3.99837 5.97192 3.99837C4.88195 3.99849 3.99841 4.88203 3.99829 5.97201C3.99829 7.06208 4.88187 7.94552 5.97192 7.94564C7.06207 7.94564 7.94556 7.06216 7.94556 5.97201ZM16.0012 5.97201C16.0011 4.88196 15.1177 3.99837 14.0276 3.99837C12.9376 3.99843 12.0541 4.882 12.054 5.97201C12.054 7.06212 12.9375 7.94558 14.0276 7.94564C15.1177 7.94564 16.0012 7.06216 16.0012 5.97201Z"></path>
        </svg>
      `;

      const label = document.createElement("div");
      label.className = "gm-projects-label";
      label.textContent = "Projects";

      const arrowBtn = createAccordionArrowButton();
      const initialProjectsCollapsed = storageGetBool(STORAGE_KEYS.projectsCollapsed, true);
      arrowBtn.setAttribute(ACCORDION_COLLAPSED_ATTR, initialProjectsCollapsed ? "true" : "false");
      arrowBtn.setAttribute("aria-expanded", (!initialProjectsCollapsed).toString());

      headerDiv.appendChild(iconWrapper);
      headerDiv.appendChild(label);
      headerDiv.appendChild(arrowBtn);

      aside.insertBefore(headerDiv, aside.firstElementChild || null);

      // Mark the entire aside so that CSS hides any dynamic children too
      aside.setAttribute("data-gm-projects-collapsed", initialProjectsCollapsed ? "true" : "false");

      function collectItemsInAside() {
        const items = [];
        Array.from(aside.children).forEach((child) => {
          if (child === headerDiv) return;
          items.push(child);
        });
        return items;
      }

      arrowBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        ev.preventDefault();
        const items = collectItemsInAside();
        const collapsed = arrowBtn.getAttribute(ACCORDION_COLLAPSED_ATTR) === "true";
        const nextCollapse = !collapsed;
        accordionToggleItems(items, nextCollapse, arrowBtn);
        // Sync aside-level collapsed attribute so new nodes obey CSS rule
        aside.setAttribute("data-gm-projects-collapsed", nextCollapse ? "true" : "false");
        storageSetBool(STORAGE_KEYS.projectsCollapsed, nextCollapse);
      });

      arrowBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      arrowBtn.addEventListener("mouseup", (e) => e.stopPropagation());

      const itemsNow = collectItemsInAside();
      accordionToggleItems(itemsNow, initialProjectsCollapsed, arrowBtn);

      aside.setAttribute("data-gm-has-projects", "true");
    }

    // Scanner + observer for accordions
    function scanAndAttachAccordions() {
      const gptsHeader = document.querySelector('a[data-testid="explore-gpts-button"]') ||
        Array.from(document.querySelectorAll('a.__menu-item')).find((a) => a.textContent.trim() === "GPTs");
      if (gptsHeader) addAccordionToGptsHeader(gptsHeader);

      const aside = document.querySelector('aside#snorlax-heading') || document.querySelector('aside[id^="snorlax"]');
      if (aside) addProjectsAccordion(aside);
    }

    function startSidebarAccordions() {
      // initial pass
      scanAndAttachAccordions();

      // observe DOM for dynamic sidebar updates
      const observer = new MutationObserver(() => {
        scanAndAttachAccordions();
      });
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

      // Console helpers
      window.__gmGptsAccordion = {
        collapseGpts: function () {
          const header = document.querySelector('a[data-testid="explore-gpts-button"]');
          if (!header) return;
          const btn = header.querySelector(`.${ACCORDION_ARROW_BTN_CLASS}`);
          if (!btn) return;
          const items = collectSiblingGptItems(header);
          accordionToggleItems(items, true, btn);
          storageSetBool(STORAGE_KEYS.gptsCollapsed, true);
        },
        expandGpts: function () {
          const header = document.querySelector('a[data-testid="explore-gpts-button"]');
          if (!header) return;
          const btn = header.querySelector(`.${ACCORDION_ARROW_BTN_CLASS}`);
          if (!btn) return;
          const items = collectSiblingGptItems(header);
          accordionToggleItems(items, false, btn);
          storageSetBool(STORAGE_KEYS.gptsCollapsed, false);
        },
        collapseProjects: function () {
          const aside = document.querySelector('aside#snorlax-heading') || document.querySelector('aside[id^="snorlax"]');
          if (!aside) return;
          const btn = aside.querySelector(`#${PROJECTS_HEADER_ID} .${ACCORDION_ARROW_BTN_CLASS}`);
          if (!btn) return;
          const items = Array.from(aside.children).filter((c) => c.id !== PROJECTS_HEADER_ID);
          accordionToggleItems(items, true, btn);
          aside.setAttribute("data-gm-projects-collapsed", "true");
          storageSetBool(STORAGE_KEYS.projectsCollapsed, true);
        },
        expandProjects: function () {
          const aside = document.querySelector('aside#snorlax-heading') || document.querySelector('aside[id^="snorlax"]');
          if (!aside) return;
          const btn = aside.querySelector(`#${PROJECTS_HEADER_ID} .${ACCORDION_ARROW_BTN_CLASS}`);
          if (!btn) return;
          const items = Array.from(aside.children).filter((c) => c.id !== PROJECTS_HEADER_ID);
          accordionToggleItems(items, false, btn);
          aside.setAttribute("data-gm-projects-collapsed", "false");
          storageSetBool(STORAGE_KEYS.projectsCollapsed, false);
        },
      };
    }

    // Initialize
    function init() {
      createMenuRoot();
      rebuildList();
      setupMutationObserver();
      watchUrlChanges();
      startSidebarAccordions();
  
      // Ensure smooth scrolling on the page (fallback)
      try {
        document.documentElement.style.scrollBehavior = document.documentElement.style.scrollBehavior || "smooth";
      } catch { /* ignore */ }
    }
  
    // Some pages delay mounting; try twice
    if (document.readyState === "complete" || document.readyState === "interactive") {
      init();
    } else {
      window.addEventListener("DOMContentLoaded", init, { once: true });
      window.addEventListener("load", init, { once: true });
    }
})();
