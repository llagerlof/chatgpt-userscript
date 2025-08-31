// ==UserScript==
// @name        ChatGPT User Script
// @namespace   Violentmonkey Scripts
// @match       https://chatgpt.com/c/*
// @match       https://chatgpt.com/g/*
// @grant       none
// @version     1.0
// @author      -
// @description 31/08/2025, 14:26:46
// @run-at      document-idle
// ==/UserScript==

(() => {
    "use strict";
  
    const MENU_ID = "cgpt-user-script";
    const TARGET_SELECTOR = 'article[data-testid^="conversation-turn-"][data-turn="user"]';
  
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
        .list {
          overflow: auto;
          max-height: calc(50vh - 40px);
          padding: 6px;
        }
        .item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 8px;
          border-radius: 8px;
          text-decoration: none;
          color: inherit;
          line-height: 1.2;
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
        }
        .item:hover { background: #f1f5f9; }
        .item.active { background: #e2e8f0; font-weight: 600; }
        .dot {
          width: 6px; height: 6px; border-radius: 50%; background: #0ea5e9; flex: 0 0 6px;
        }
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
      collapseBtn.addEventListener("click", () => {
        wrap.classList.toggle("collapsed");
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
      for (const el of nodes) {
        const id = extractTurnId(el);
        if (!id) continue;
  
        // Ensure each target has an id to anchor (for native focus/scroll)
        if (!el.id) el.id = `cgptuserscript-target-${id}`;
  
        const a = document.createElement("a");
        a.href = `#${el.id}`;
        a.className = "item";
        a.dataset.targetId = el.id;
        a.textContent = `conversation-turn-${id}`;
        const dot = document.createElement("span");
        dot.className = "dot";
        a.prepend(dot);
  
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
        attributeFilter: ["data-testid", "data-turn", "id"],
      });
    }
  
    // Handle SPA route changes (ChatGPT is an SPA)
    let lastPath = location.pathname;
    function watchUrlChanges() {
      const check = () => {
        if (location.pathname !== lastPath) {
          lastPath = location.pathname;
          // Give the UI a moment to render
          setTimeout(() => rebuildList(), 500);
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }
  
    // Initialize
    function init() {
      createMenuRoot();
      rebuildList();
      setupMutationObserver();
      watchUrlChanges();
  
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
